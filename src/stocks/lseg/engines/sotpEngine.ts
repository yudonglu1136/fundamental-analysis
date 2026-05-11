import type { ValidationWarning } from "../../types";
import { daysBetweenIso } from "../../../utils/valuation";
import { sotpPeerGuardrails } from "../data/sotpPeerGuardrails";
import type {
  LsegCorporateReconciliationAudit,
  LsegDashboardDataset,
  LsegPeerPoint,
  LsegOwnershipBridgeRow,
  LsegSotpCorporateInput,
  LsegSotpMinorityAdjustmentInput,
  LsegSotpMultiplePolicy,
  LsegScenarioAssumptions,
  LsegSegmentFinancialPoint,
  LsegSegmentName,
  LsegSotpAudit,
  LsegSotpBridge,
  LsegSotpComponent,
  LsegSotpResult,
  ReportedLsegSegmentName,
} from "../model";
import { getPeriodById, getSegmentPoint, safeRatio } from "./helpers";
import type { LsegMarginEngineResult } from "./marginEngine";
import type { LsegRevenueEngineResult } from "./revenueEngine";

const OPERATING_SEGMENTS: ReportedLsegSegmentName[] = [
  "Data & Analytics",
  "FTSE Russell",
  "Risk Intelligence",
  "Markets",
  "Other",
];

const STRATEGIC_REFERENCE_SEGMENTS: LsegSegmentName[] = [
  "Data & Analytics",
  "FTSE Russell",
  "Risk Intelligence",
  "Capital Markets",
  "Post Trade",
  "Other",
];

const CONSERVATIVE_OPERATING_MULTIPLES: Partial<Record<LsegSegmentName, number>> = {
  "Data & Analytics": 16,
  "FTSE Russell": 23,
  "Risk Intelligence": 18,
  Markets: 14,
  Other: 0,
};

const PREMIUM_OPERATING_MULTIPLES: Partial<Record<LsegSegmentName, number>> = {
  "Data & Analytics": 21,
  "FTSE Russell": 27,
  "Risk Intelligence": 24,
  Markets: 18,
  Other: 0,
};

type SotpBuildContext = {
  data: LsegDashboardDataset;
  periodId: string;
  assumptions: LsegScenarioAssumptions;
  revenue: LsegRevenueEngineResult;
  margin: LsegMarginEngineResult;
};

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mapDefinition(definition: LsegSegmentFinancialPoint["revenueDefinition"]): LsegSotpComponent["definition"] {
  return definition === "revenue" ? "revenue" : "totalIncomeExRecoveries";
}

function peerGroupForSegment(segment: LsegSegmentName): string {
  switch (segment) {
    case "Data & Analytics":
      return "data_analytics";
    case "FTSE Russell":
      return "indices";
    case "Risk Intelligence":
      return "risk_information";
    case "Markets":
      return "market_infrastructure";
    case "Capital Markets":
      return "electronic_trading";
    case "Post Trade":
      return "post_trade";
    default:
      return "other";
  }
}

function peerStatsForSegment(segment: LsegSegmentName, peers: LsegPeerPoint[], referenceDate: string) {
  const peerGroup = peerGroupForSegment(segment);
  const guardrail = sotpPeerGuardrails[segment] ?? { rangeLow: 0, median: 0, rangeHigh: 0, peerGroup: "other", justification: "" };
  const supportPeers = guardrail.supportingPeers?.length
    ? guardrail.supportingPeers
    : peers
        .filter((peer) => peer.peerGroup === peerGroup)
        .map((peer) => ({
          peer: peer.peer,
          ticker: peer.ticker ?? "",
          forwardEVEbitda: peer.forwardEVEbitda ?? peer.ebitdaMultiple ?? 0,
          forwardPe: peer.forwardPe,
          fcfYield: peer.fcfYield,
          revenueGrowth: peer.revenueGrowth,
          ebitdaMargin: peer.ebitdaMargin,
          dataDate: peer.dataDate ?? guardrail.dataDate,
          source: peer.source ?? guardrail.source,
          lastReviewedDate: peer.lastReviewedDate ?? peer.dataDate ?? guardrail.lastReviewedDate,
          isPlaceholder: peer.isPlaceholder ?? guardrail.isPlaceholder,
          isStale: peer.isStale ?? Boolean(peer.dataDate && daysBetweenIso(peer.dataDate, referenceDate) > 90),
          confidenceLevel: peer.confidenceLevel ?? guardrail.confidenceLevel,
        }));
  const peerMultiples = supportPeers
    .map((peer) => peer.forwardEVEbitda)
    .filter((value) => value > 0);
  const rangeLow = peerMultiples.length > 0 ? Math.min(...peerMultiples) : guardrail.rangeLow;
  const rangeHigh = peerMultiples.length > 0 ? Math.max(...peerMultiples) : guardrail.rangeHigh;
  const peerMedian = peerMultiples.length > 0 ? median(peerMultiples) : guardrail.median;
  const isPlaceholder = supportPeers.some((peer) => peer.isPlaceholder);
  const isStale = supportPeers.some((peer) => peer.isStale) || daysBetweenIso(guardrail.dataDate, referenceDate) > 90;
  return {
    peerGroup,
    peerMedian,
    rangeLow: rangeLow || guardrail.rangeLow,
    rangeHigh: rangeHigh || guardrail.rangeHigh,
    isPlaceholder,
    isStale,
    dataDate: supportPeers[0]?.dataDate ?? guardrail.dataDate,
    source: supportPeers[0]?.source ?? guardrail.source,
    confidenceLevel: supportPeers[0]?.confidenceLevel ?? guardrail.confidenceLevel,
    validPeerCount: supportPeers.filter((peer) => !peer.isPlaceholder).length,
    peerSetCompleteness: guardrail.peerSetCompleteness,
  };
}

function selectedMultiple(
  assumptions: LsegScenarioAssumptions,
  segment: LsegSegmentName,
  multiplePolicy: LsegSotpMultiplePolicy,
  marketsCyclicalCapActive: boolean,
) {
  if (multiplePolicy === "strategic") {
    return assumptions.strategicSotpMultiples[segment] ?? sotpPeerGuardrails[segment]?.median ?? 0;
  }

  let multiple =
    multiplePolicy === "conservative_operating"
      ? CONSERVATIVE_OPERATING_MULTIPLES[segment] ?? assumptions.sotpMultiples[segment] ?? sotpPeerGuardrails[segment]?.median ?? 0
      : multiplePolicy === "premium_operating"
        ? PREMIUM_OPERATING_MULTIPLES[segment] ?? assumptions.sotpMultiples[segment] ?? sotpPeerGuardrails[segment]?.median ?? 0
        : assumptions.sotpMultiples[segment] ?? sotpPeerGuardrails[segment]?.median ?? 0;

  if (segment === "Markets" && marketsCyclicalCapActive) {
    multiple = Math.min(multiple, multiplePolicy === "premium_operating" ? 18 : multiplePolicy === "base_operating" ? 16 : 14);
  }
  return multiple;
}

function segmentMetadata(
  segment: LsegSegmentName,
  context: SotpBuildContext,
  growth: number,
  fcfConversion: number,
) {
  const kpi = context.data.kpis.find((item) => item.periodId === context.periodId) ?? context.data.kpis[context.data.kpis.length - 1];
  const shared = {
    retention: kpi.grossRetention,
    capitalIntensity: context.assumptions.capexIntensity,
    fcfConversion,
  };
  switch (segment) {
    case "Data & Analytics":
      return { recurringRevenuePct: 0.84, pricingPower: 0.68, switchingCostScore: 0.76, workflowPenetration: 0.73, incrementalRoic: 0.16, ...shared };
    case "FTSE Russell":
      return { recurringRevenuePct: 0.93, pricingPower: 0.88, switchingCostScore: 0.83, workflowPenetration: 0.67, incrementalRoic: 0.22, ...shared };
    case "Risk Intelligence":
      return { recurringRevenuePct: 0.8, pricingPower: 0.72, switchingCostScore: 0.7, workflowPenetration: 0.64, incrementalRoic: 0.19, ...shared };
    case "Markets":
      return { recurringRevenuePct: 0.48, pricingPower: 0.5, switchingCostScore: 0.55, workflowPenetration: 0.57, incrementalRoic: 0.14, ...shared };
    case "Capital Markets":
      return { recurringRevenuePct: 0.34, pricingPower: 0.46, switchingCostScore: 0.47, workflowPenetration: 0.49, incrementalRoic: 0.13, ...shared };
    case "Post Trade":
      return { recurringRevenuePct: 0.7, pricingPower: 0.63, switchingCostScore: 0.79, workflowPenetration: 0.7, incrementalRoic: 0.18, ...shared };
    default:
      return { recurringRevenuePct: 0.1, pricingPower: 0.1, switchingCostScore: 0.1, workflowPenetration: 0.1, incrementalRoic: growth > 0 ? 0.08 : 0.02, ...shared };
  }
}

function buildComponent(
  segment: LsegSegmentName,
  taxonomy: LsegSotpResult["taxonomy"],
  context: SotpBuildContext,
  options?: {
    basePointOverride?: LsegSegmentFinancialPoint;
    forecastRevenue?: number;
    forecastEbitda?: number;
    forecastRevenue2027?: number;
    forecastEbitda2027?: number;
    source?: LsegSotpComponent["source"];
    multiplePolicy: LsegSotpMultiplePolicy;
  },
): LsegSotpComponent {
  const basePoint = options?.basePointOverride ?? getSegmentPoint(context.data, context.periodId, segment, taxonomy);
  const basePeriod = getPeriodById(context.data, context.periodId);
  const firstYear = basePeriod.fiscalYear + 1;
  const secondYear = basePeriod.fiscalYear + 2;
  const forecastRevenue =
    options?.forecastRevenue ??
    context.revenue.rows.find((row) => row.fiscalYear === firstYear && row.segment === segment)?.endingRevenue ??
    basePoint.revenue;
  const forecastEbitda =
    options?.forecastEbitda ??
    context.margin.segmentRows.find((row) => row.fiscalYear === firstYear && row.segment === segment)?.adjustedEbitda ??
    basePoint.adjustedEbitda;
  const forecastRevenue2027 =
    options?.forecastRevenue2027 ??
    context.revenue.rows.find((row) => row.fiscalYear === secondYear && row.segment === segment)?.endingRevenue;
  const forecastEbitda2027 =
    options?.forecastEbitda2027 ??
    context.margin.segmentRows.find((row) => row.fiscalYear === secondYear && row.segment === segment)?.adjustedEbitda;
  const marketsCyclicalCapActive = (context.revenue.groupRevenueByYear[0]?.marketsBridge?.cyclicalUplift ?? 0) > 0.015;
  const targetMultiple = selectedMultiple(context.assumptions, segment, options?.multiplePolicy ?? "base_operating", marketsCyclicalCapActive);
  const enterpriseValueContribution = forecastEbitda * targetMultiple;
  const peerStats = peerStatsForSegment(segment, context.data.peers, context.data.marketData.priceDate);
  const definition = mapDefinition(basePoint.revenueDefinition);
  const growth = safeRatio(forecastRevenue - basePoint.revenue, Math.abs(basePoint.revenue) > 1 ? Math.abs(basePoint.revenue) : 1);
  const fcfYear1 = context.margin.groupRows[0];
  const fcfConversion = safeRatio(context.data.periods.find((period) => period.id === context.periodId)?.equityFreeCashFlow ?? 0, context.data.periods.find((period) => period.id === context.periodId)?.adjustedEbitda ?? 1)
    || safeRatio(context.revenue.groupRevenueByYear[0]?.revenue ?? 0, fcfYear1?.adjustedEbitda ?? 1);
  const metadata = segmentMetadata(segment, context, growth, fcfConversion);
  const multiplePremiumDiscountToMedian = peerStats.peerMedian > 0 ? (targetMultiple / peerStats.peerMedian) - 1 : 0;
  const guardrailWarning =
    targetMultiple > peerStats.rangeHigh
      ? `${segment} multiple of ${targetMultiple.toFixed(1)}x is above the peer guardrail high of ${peerStats.rangeHigh.toFixed(1)}x.`
      : targetMultiple > peerStats.peerMedian * 1.2
        ? `${segment} multiple of ${targetMultiple.toFixed(1)}x is more than 20% above peer median of ${peerStats.peerMedian.toFixed(1)}x.`
        : undefined;

  return {
    segmentId: `${taxonomy}-${segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    segment,
    segmentName: segment,
    taxonomy,
    financialMetricUsed: `${firstYear}E EBITDA`,
    baseYearRevenueOrIncome: basePoint.revenue,
    baseYearAdjustedEbitda: basePoint.adjustedEbitda,
    forecastYearRevenueOrIncome: forecastRevenue,
    forecastYearAdjustedEbitda: forecastEbitda,
    forecastYear2027RevenueOrIncome: forecastRevenue2027,
    forecastYear2027AdjustedEbitda: forecastEbitda2027,
    forwardRevenue: forecastRevenue,
    forwardEbitda: forecastEbitda,
    ebitdaMargin: safeRatio(forecastEbitda, Math.abs(forecastRevenue) > 1 ? forecastRevenue : 1),
    source: options?.source ?? "forecast_from_margin_engine",
    definition,
    recurringRevenuePct: metadata.recurringRevenuePct,
    retention: metadata.retention,
    pricingPower: metadata.pricingPower,
    switchingCostScore: metadata.switchingCostScore,
    workflowPenetration: metadata.workflowPenetration,
    capitalIntensity: metadata.capitalIntensity,
    incrementalRoic: metadata.incrementalRoic,
    growth,
    fcfConversion: metadata.fcfConversion,
    peerGroup: peerStats.peerGroup,
    peerGroupMedian: peerStats.peerMedian,
    peerGroupRangeLow: peerStats.rangeLow,
    peerGroupRangeHigh: peerStats.rangeHigh,
    peerDataDate: peerStats.dataDate,
    peerDataSource: peerStats.source,
    peerDataIsPlaceholder: peerStats.isPlaceholder,
    peerDataIsStale: peerStats.isStale,
    peerDataConfidenceLevel: peerStats.confidenceLevel,
    peerValidCount: peerStats.validPeerCount,
    multiplePremiumDiscountToMedian,
    multipleJustification:
      segment === "Markets"
        ? "Markets uses exchange/infrastructure guardrails rather than pure data multiples because growth mixes structural and cyclical activity."
        : segment === "FTSE Russell"
          ? "FTSE Russell carries the highest base multiple because index licensing remains the cleanest recurring asset in the portfolio."
          : `Selected multiple is anchored to ${peerStats.peerGroup.replace(/_/g, " ")} peers and constrained by visible guardrails.`,
    guardrailWarning,
    targetMultiple,
    enterpriseValueContribution,
  };
}

function getCorporateCostAudit(context: SotpBuildContext): LsegSotpCorporateInput {
  return context.data.sotpInputs.corporateCost;
}

function buildOwnershipBridgeRows(context: SotpBuildContext): LsegOwnershipBridgeRow[] {
  return context.data.ownership.map((component) => {
    if (
      (component.consolidationTreatment === "fully_consolidated" || component.consolidationTreatment === "proportionately_consolidated") &&
      component.includedInSegmentEbitda &&
      component.includedEbitdaAmount !== null &&
      component.selectedMultiple !== null &&
      component.minorityOwnershipPct !== null
    ) {
      return {
        ...component,
        economicNciDeduction: component.includedEbitdaAmount * component.selectedMultiple * component.minorityOwnershipPct,
        fallbackBalanceSheetNci: component.balanceSheetNciValue,
        methodUsed: "economic_value_deduction",
      };
    }

    if (component.consolidationTreatment === "equity_method" || component.consolidationTreatment === "not_consolidated") {
      return {
        ...component,
        economicNciDeduction: 0,
        fallbackBalanceSheetNci: component.balanceSheetNciValue,
        methodUsed: "no_deduction",
      };
    }

    if (component.balanceSheetNciValue !== null) {
      return {
        ...component,
        economicNciDeduction: component.balanceSheetNciValue,
        fallbackBalanceSheetNci: component.balanceSheetNciValue,
        methodUsed: component.valuationMethod === "placeholder" ? "placeholder_fallback" : "balance_sheet_nci",
      };
    }

    return {
      ...component,
      economicNciDeduction: 0,
      fallbackBalanceSheetNci: component.balanceSheetNciValue,
      methodUsed: "placeholder_fallback",
    };
  });
}

function buildCorporateReconciliationAudit(
  context: SotpBuildContext,
  components: LsegSotpComponent[],
): LsegCorporateReconciliationAudit {
  const configured = context.data.corporateReconciliation;
  const corporateInput = getCorporateCostAudit(context);
  const reportedGroupAdjustedEbitda = context.margin.groupRows[0]?.adjustedEbitda ?? configured.reportedGroupAdjustedEbitda;
  const sumOfReportedSegmentAdjustedEbitda = components.reduce((sum, component) => sum + component.forwardEbitda, 0);
  const difference = sumOfReportedSegmentAdjustedEbitda - reportedGroupAdjustedEbitda;
  const tolerance = configured.tolerance;
  const verified = Math.abs(difference) <= tolerance;
  const selectedCorporateCostAmount =
    corporateInput.deductedSeparately
      ? corporateInput.amount
      : verified
        ? 0
        : Math.max(difference, 0);
  const selectedCorporateCostValueDeduction =
    (corporateInput.deductedSeparately || (!verified && difference > 0))
      ? selectedCorporateCostAmount * (corporateInput.multiple ?? configured.corporateCostMultiple)
      : 0;

  return {
    ...configured,
    verified,
    selectedCorporateCostAmount,
    selectedCorporateCostValueDeduction,
  };
}

function definitionWarnings(components: LsegSotpComponent[]) {
  const definitions = new Set(components.map((component) => component.definition));
  if (definitions.size <= 1) return;
  for (const component of components) {
    component.definitionWarning = "SOTP mixes revenue and total income definitions across segments. Read margins and peer comparisons with that labeling in mind.";
  }
}

function buildMultipleSensitivity(
  components: LsegSotpComponent[],
  dilutedShares: number,
) {
  return components.map((component) => ({
    segment: component.segment,
    bearMultiple: sotpPeerGuardrails[component.segment]?.rangeLow ?? Math.max(component.targetMultiple - 2, 0),
    baseMultiple: component.targetMultiple,
    bullMultiple: sotpPeerGuardrails[component.segment]?.rangeHigh ?? component.targetMultiple + 2,
    bearValuePerShare: safeRatio(component.forwardEbitda * (sotpPeerGuardrails[component.segment]?.rangeLow ?? Math.max(component.targetMultiple - 2, 0)), dilutedShares),
    baseValuePerShare: safeRatio(component.forwardEbitda * component.targetMultiple, dilutedShares),
    bullValuePerShare: safeRatio(component.forwardEbitda * (sotpPeerGuardrails[component.segment]?.rangeHigh ?? component.targetMultiple + 2), dilutedShares),
  }));
}

function buildEbitdaSensitivity(
  components: LsegSotpComponent[],
  dilutedShares: number,
) {
  return components.map((component) => ({
    segment: component.segment,
    down10ValuePerShare: safeRatio(component.forwardEbitda * 0.9 * component.targetMultiple, dilutedShares),
    baseValuePerShare: safeRatio(component.forwardEbitda * component.targetMultiple, dilutedShares),
    up10ValuePerShare: safeRatio(component.forwardEbitda * 1.1 * component.targetMultiple, dilutedShares),
  }));
}

function buildCorporateNciSensitivity(
  bridge: Pick<LsegSotpBridge, "segmentEnterpriseValueSubtotal" | "dilutedShares" | "netDebt" | "associatesOrInvestmentsAddBack" | "nonOperatingAssets" | "pensionOrOtherClaims">,
  corporateCostValueDeduction: number,
  nciDeduction: number,
  minorityInterestDeduction: number,
  otherMinorityInterests = 0,
) {
  const valueWith = (corporate: number, nci: number, label: string) => ({
    label,
    valuePerShare: safeRatio(
      bridge.segmentEnterpriseValueSubtotal +
        bridge.nonOperatingAssets +
        bridge.associatesOrInvestmentsAddBack -
        bridge.netDebt -
        bridge.pensionOrOtherClaims -
        corporate -
        nci,
      bridge.dilutedShares,
    ),
  });

  return [
    valueWith(0, nciDeduction + minorityInterestDeduction + otherMinorityInterests, "No corporate deduction"),
    valueWith(corporateCostValueDeduction, nciDeduction + minorityInterestDeduction + otherMinorityInterests, "Base deduction"),
    valueWith(corporateCostValueDeduction * 1.5, nciDeduction + minorityInterestDeduction + otherMinorityInterests, "Higher corporate deduction"),
    valueWith(corporateCostValueDeduction, (nciDeduction + minorityInterestDeduction + otherMinorityInterests) * 0.75, "Low NCI"),
    valueWith(corporateCostValueDeduction, (nciDeduction + minorityInterestDeduction + otherMinorityInterests) * 1.25, "High NCI"),
  ];
}

function buildAudit(
  components: LsegSotpComponent[],
  reportedGroupAdjustedEbitda: number,
  bridge: LsegSotpBridge,
  context: SotpBuildContext,
  extraWarnings: ValidationWarning[] = [],
  extraSevereWarnings: ValidationWarning[] = [],
  extraAuditNotes: string[] = [],
): LsegSotpAudit {
  const warnings: ValidationWarning[] = [...extraWarnings];
  const severeWarnings: ValidationWarning[] = [...extraSevereWarnings];
  const auditNotes = [...extraAuditNotes];
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const sumOfSegmentAdjustedEbitda = components.reduce((sum, component) => sum + component.forwardEbitda, 0);
  const corporateCostOrOtherAdjustment = bridge.corporateCostAmount + bridge.eliminationAdjustment;
  const reconciledGroupAdjustedEbitda = sumOfSegmentAdjustedEbitda - corporateCostOrOtherAdjustment;
  const reconciliationDifference = reconciledGroupAdjustedEbitda - reportedGroupAdjustedEbitda;
  const reconciliationTolerance = Math.max(reportedGroupAdjustedEbitda * 0.015, 35);
  const peerPlaceholder = components.some((component) => component.peerDataIsPlaceholder);
  const peerStale = components.some((component) => component.peerDataIsStale);
  const incompletePeerSet = components.some((component) => (component.peerValidCount ?? 0) < 3);
  const corporateCostAudit = getCorporateCostAudit(context);
  const minorityAdjustments = context.data.sotpInputs.minorityAdjustments;
  const ownershipBridge = buildOwnershipBridgeRows(context);
  const corporateReconciliation = buildCorporateReconciliationAudit(context, components);
  const confidenceCapReasons: string[] = [];

  if (Math.abs(reconciliationDifference) > reconciliationTolerance) {
    warnings.push({
      id: "lseg-sotp-ebitda-reconciliation",
      title: "SOTP EBITDA reconciliation is outside tolerance",
      detail: "Forward segment EBITDA does not reconcile tightly to the forward group EBITDA anchor.",
      severity: "high",
    });
    failedChecks.push("Forward EBITDA reconciliation");
  } else {
    passedChecks.push("Forward EBITDA reconciliation");
  }

  if (components.some((component) => component.definitionWarning)) {
    warnings.push({
      id: "lseg-sotp-definition-mismatch",
      title: "Revenue definition mix exists inside SOTP",
      detail: "Revenue and total income definitions are mixed across operating segments; this is disclosed and should be reviewed when comparing segment margins and peer multiples.",
      severity: "medium",
    });
    failedChecks.push("Definition consistency");
  } else {
    passedChecks.push("Definition consistency");
  }

  if (components.some((component) => component.segment === "Other" && component.baseYearAdjustedEbitda > 0)) {
    warnings.push({
      id: "lseg-sotp-other-positive",
      title: "Other / Corporate EBITDA is positive but not capitalized",
      detail: "Other / Corporate shows positive EBITDA without clear standalone asset support. Operating SOTP conservatively assigns no premium value to that line.",
      severity: "medium",
    });
    failedChecks.push("Other / Corporate treatment");
  } else {
    passedChecks.push("Other / Corporate treatment");
  }

  if (peerPlaceholder) {
    auditNotes.push("Peer guardrails are placeholder/manual and cap SOTP confidence until refreshed with live market data.");
  }
  if (peerStale) {
    warnings.push({
      id: "lseg-sotp-peer-stale",
      title: "Peer guardrails are stale or older than 90 days",
      detail: "Peer guardrails should be refreshed when manual market snapshots are older than 90 days.",
      severity: "medium",
    });
    failedChecks.push("Peer data freshness");
  } else {
    passedChecks.push("Peer data freshness");
  }
  if (incompletePeerSet) {
    warnings.push({
      id: "lseg-sotp-peer-incomplete",
      title: "Some peer guardrail sets use fewer than three valid peers",
      detail: "Narrow peer panels can still be directionally useful, but they lower confidence in the operating SOTP multiple framework.",
      severity: "medium",
    });
    failedChecks.push("Peer set completeness");
  } else {
    passedChecks.push("Peer set completeness");
  }

  const largestContribution = components.reduce((largest, component) => (
    component.enterpriseValueContribution > largest.enterpriseValueContribution ? component : largest
  ), components[0]);
  if (largestContribution && safeRatio(largestContribution.enterpriseValueContribution, Math.max(bridge.segmentEnterpriseValueSubtotal, 1)) > 0.45) {
    warnings.push({
      id: "lseg-sotp-concentration",
      title: "SOTP is highly concentrated in one segment",
      detail: `${largestContribution.segment} contributes more than 45% of segment EV, so the chosen multiple for that segment materially drives total SOTP.`,
      severity: "medium",
    });
    failedChecks.push("Segment concentration");
  } else {
    passedChecks.push("Segment concentration");
  }

  if (corporateCostAudit.treatment === "unknown") {
    warnings.push({
      id: "lseg-sotp-corporate-unknown",
      title: "Corporate cost treatment is unknown",
      detail: "Corporate cost treatment is unknown. Operating SOTP should not be fully trusted until this is clarified.",
      severity: "high",
    });
    failedChecks.push("Corporate cost treatment");
  } else if (!corporateReconciliation.verified) {
    warnings.push({
      id: "lseg-sotp-corporate-unverified",
      title: "Corporate cost treatment is not verified by EBITDA reconciliation",
      detail: "Forward segment EBITDA does not reconcile tightly enough to prove a zero corporate-cost deduction. A conservative bridge deduction or manual verification is still needed.",
      severity: "high",
    });
    failedChecks.push("Corporate reconciliation proof");
  } else {
    passedChecks.push("Corporate cost treatment");
    passedChecks.push("Corporate reconciliation proof");
  }

  if (
    ownershipBridge.some(
      (row) =>
        row.isPlaceholder ||
        row.methodUsed === "placeholder_fallback" ||
        row.consolidationTreatment === "unknown" ||
        row.lsegOwnershipPct === null ||
        row.minorityOwnershipPct === null,
    )
  ) {
    warnings.push({
      id: "lseg-sotp-nci-placeholder",
      title: "NCI deduction uses fallback / placeholder inputs",
      detail: "Ownership-based NCI bridge still relies on fallback or placeholder assumptions. Operating SOTP should be haircut until legal-entity ownership and minority claims are better sourced.",
      severity: "high",
    });
    failedChecks.push("Ownership-based NCI bridge");
  } else {
    passedChecks.push("Ownership-based NCI bridge");
  }

  let confidenceScore = 92;
  if (ownershipBridge.some((row) => row.isPlaceholder || row.methodUsed === "placeholder_fallback")) {
    confidenceScore = Math.min(confidenceScore, 70);
    confidenceCapReasons.push("Ownership / NCI bridge still uses placeholder or fallback deductions.");
  }
  if (peerPlaceholder || components.some((component) => !component.peerDataDate || !component.peerDataSource)) {
    confidenceScore = Math.min(confidenceScore, 75);
    confidenceCapReasons.push("Peer guardrails are placeholder-based or missing audit metadata.");
  }
  if (peerStale) {
    confidenceScore = Math.min(confidenceScore, 75);
    confidenceCapReasons.push("Peer guardrails are stale and need refresh.");
  }
  if (!corporateReconciliation.verified || corporateCostAudit.treatment === "unknown") {
    confidenceScore = Math.min(confidenceScore, corporateCostAudit.treatment === "unknown" ? 75 : 80);
    confidenceCapReasons.push("Corporate cost / Other treatment is not fully verified by reconciliation.");
  }
  if (warnings.some((warning) => warning.id === "lseg-sotp-definition-mismatch")) confidenceScore -= 4;
  if (warnings.some((warning) => warning.id === "lseg-sotp-other-positive")) confidenceScore -= 5;
  if (warnings.some((warning) => warning.id === "lseg-sotp-nci-placeholder")) confidenceScore -= 8;
  if (warnings.some((warning) => warning.id === "lseg-sotp-ebitda-reconciliation")) confidenceScore -= 10;
  if (warnings.some((warning) => warning.id === "lseg-sotp-peer-incomplete")) confidenceScore -= 5;
  confidenceScore -= severeWarnings.length * 12;
  confidenceScore -= warnings.filter((warning) => warning.severity !== "high").length * 2;
  confidenceScore = Math.max(35, Math.min(confidenceScore, 99));

  return {
    confidenceScore,
    confidenceCapReasons,
    warnings,
    severeWarnings,
    auditNotes,
    passedChecks,
    failedChecks,
    inputAuditRows: components.map((component) => ({
      segment: component.segment,
      ebitdaUsed: component.forwardEbitda,
      ebitdaYear: Number(component.financialMetricUsed.slice(0, 4)),
      multiple: component.targetMultiple,
      peerGroup: component.peerGroup,
      source: `${component.source}${component.peerDataSource ? ` | Peer: ${component.peerDataSource}` : ""}`,
      isPlaceholder: Boolean(component.peerDataIsPlaceholder || component.source === "placeholder"),
      isStale: component.peerDataIsStale,
      confidenceLevel: component.peerDataConfidenceLevel,
      guardrailWarning: component.guardrailWarning,
    })),
    minorityAdjustments,
    ownershipBridge,
    corporateCostAudit,
    corporateReconciliation,
    reconciliation: {
      reportedGroupAdjustedEbitda,
      sumOfSegmentAdjustedEbitda,
      corporateCostOrOtherAdjustment,
      reconciledGroupAdjustedEbitda,
      reconciliationDifference,
      reconciliationTolerance,
    },
  };
}

function buildOperatingBridge(
  context: SotpBuildContext,
  components: LsegSotpComponent[],
): {
  bridge: LsegSotpBridge;
  corporateCostTreatment: LsegSotpResult["corporateCostTreatment"];
  treatmentNote: string;
  warnings: ValidationWarning[];
} {
  const currentPeriod = getPeriodById(context.data, context.periodId);
  const segmentEnterpriseValueSubtotal = components.reduce((sum, component) => sum + component.enterpriseValueContribution, 0);
  const dilutedShares = context.data.marketData.dilutedShares || currentPeriod.dilutedShares || currentPeriod.weightedAverageShares;
  const corporateCostAudit = getCorporateCostAudit(context);
  const corporateReconciliation = buildCorporateReconciliationAudit(context, components);
  const corporateCostAmount = corporateReconciliation.selectedCorporateCostAmount;
  const corporateCostMultiple = corporateCostAudit.multiple ?? corporateReconciliation.corporateCostMultiple ?? 1;
  const corporateCostValueDeduction = corporateReconciliation.selectedCorporateCostValueDeduction;
  const otherSegmentValue = components.find((component) => component.segment === "Other")?.enterpriseValueContribution ?? 0;
  const eliminationAdjustment = 0;
  const netDebt = context.data.marketData.netDebt || currentPeriod.netDebt;
  const ownershipBridge = buildOwnershipBridgeRows(context);
  const minorityInterestDeduction = 0;
  const tradewebNciAdjustment = ownershipBridge.find((row) => row.id === "tradewebNciAdjustment")?.economicNciDeduction ?? 0;
  const postTradeSolutionsNciAdjustment = ownershipBridge.find((row) => row.id === "postTradeSolutionsNciAdjustment")?.economicNciDeduction ?? 0;
  const otherMinorityInterests = ownershipBridge.find((row) => row.id === "otherMinorityInterests")?.economicNciDeduction ?? 0;
  const nciDeduction = ownershipBridge.reduce((sum, row) => sum + row.economicNciDeduction, 0);
  const associatesOrInvestmentsAddBack = 0;
  const listedStakeLookThroughValue = 0;
  const nonOperatingAssets = 0;
  const pensionOrOtherClaims = 0;
  const equityValue =
    segmentEnterpriseValueSubtotal -
    corporateCostValueDeduction +
    nonOperatingAssets +
    associatesOrInvestmentsAddBack +
    listedStakeLookThroughValue -
    netDebt -
    minorityInterestDeduction -
    nciDeduction -
    pensionOrOtherClaims;

  const warnings: ValidationWarning[] = ownershipBridge
    .filter((row) => row.isPlaceholder || row.methodUsed === "placeholder_fallback")
    .map((row) => ({
      id: `lseg-sotp-${row.id}-placeholder`,
      title: `${row.name} remains fallback-based`,
      detail: `${row.name} still relies on placeholder or fallback ownership inputs. Update with a cleaner ownership bridge before relying on SOTP precision.`,
      severity: "medium" as const,
    }));

  if (!corporateReconciliation.verified) {
    warnings.push({
      id: "lseg-sotp-corporate-unverified-bridge",
      title: "Corporate cost treatment is not verified by EBITDA reconciliation",
      detail: "Zero corporate-cost deduction is only safe if segment EBITDA reconciles cleanly to the group anchor. This bridge still needs manual verification.",
      severity: "high",
    });
  }

  if (corporateCostAudit.treatment === "unknown") {
    warnings.push({
      id: "lseg-sotp-corporate-unknown-bridge",
      title: "Corporate cost treatment is unknown",
      detail: "Corporate cost treatment should be explicit in the SOTP bridge. Unknown treatment reduces SOTP confidence.",
      severity: "high",
    });
  }

  return {
    bridge: {
      segmentEnterpriseValueSubtotal,
      corporateCostAmount,
      corporateCostMultiple,
      corporateCostValueDeduction,
      otherSegmentValue,
      eliminationAdjustment,
      nonOperatingAssets,
      associatesOrInvestmentsAddBack,
      listedStakeLookThroughValue,
      netDebt,
      minorityInterestDeduction,
      nciDeduction,
      tradewebNciAdjustment,
      postTradeSolutionsNciAdjustment,
      otherMinorityInterests,
      pensionOrOtherClaims,
      equityValue,
      dilutedShares,
      valuePerShare: safeRatio(equityValue, dilutedShares),
    },
    corporateCostTreatment: corporateReconciliation.verified ? corporateCostAudit.treatment : corporateReconciliation.treatment,
    treatmentNote: corporateReconciliation.verified
      ? `${corporateCostAudit.notes} Reconciliation difference is within tolerance, so the £0 deduction is verified for the reported taxonomy.`
      : `${corporateCostAudit.notes} Forward EBITDA reconciliation does not fully prove a zero deduction, so a conservative corporate-cost bridge is retained.`,
    warnings,
  };
}

function buildStrategicReferenceComponents(
  context: SotpBuildContext,
  splitWarnings: ValidationWarning[],
  splitSevereWarnings: ValidationWarning[],
) {
  const components: LsegSotpComponent[] = [];
  const basePeriod = getPeriodById(context.data, context.periodId);
  const firstYear = basePeriod.fiscalYear + 1;
  const secondYear = basePeriod.fiscalYear + 2;
  const split = context.assumptions.marketsSplitAssumption;

  for (const segment of STRATEGIC_REFERENCE_SEGMENTS) {
    if (segment === "Capital Markets" || segment === "Post Trade") {
      if (!split) {
        splitSevereWarnings.push({
          id: "lseg-strategic-split-missing",
          title: "Separate Post Trade valuation requires explicit EBITDA split",
          detail: "Analytical split valuation requires explicit Capital Markets and Post Trade EBITDA assumptions.",
          severity: "high",
        });
        continue;
      }

      const reportedMarketsBase = getSegmentPoint(context.data, context.periodId, "Markets", "reported_2025");
      const forecastMarketsRevenue = context.revenue.rows.find((row) => row.fiscalYear === firstYear && row.segment === "Markets")?.endingRevenue ?? reportedMarketsBase.revenue;
      const forecastMarketsEbitda = context.margin.segmentRows.find((row) => row.fiscalYear === firstYear && row.segment === "Markets")?.adjustedEbitda ?? reportedMarketsBase.adjustedEbitda;
      const forecastMarketsRevenue2027 = context.revenue.rows.find((row) => row.fiscalYear === secondYear && row.segment === "Markets")?.endingRevenue;
      const forecastMarketsEbitda2027 = context.margin.segmentRows.find((row) => row.fiscalYear === secondYear && row.segment === "Markets")?.adjustedEbitda;
      const revenueRatio = segment === "Capital Markets"
        ? safeRatio(split.capitalMarketsRevenue, split.revenue)
        : safeRatio(split.postTradeRevenue, split.revenue);
      const ebitdaRatio = segment === "Capital Markets"
        ? safeRatio(split.capitalMarketsEbitda, split.adjustedEbitda)
        : safeRatio(split.postTradeEbitda, split.adjustedEbitda);
      const actualPoint =
        context.data.segmentFinancials.find(
          (point) => point.periodId === context.periodId && point.segment === segment && point.taxonomy === "analytical_split",
        ) ??
        ({
          periodId: context.periodId,
          segment,
          taxonomy: "analytical_split",
          revenueDefinition: reportedMarketsBase.revenueDefinition,
          revenue: reportedMarketsBase.revenue * revenueRatio,
          adjustedEbitda: reportedMarketsBase.adjustedEbitda * ebitdaRatio,
          adjustedEbitdaMargin: safeRatio(reportedMarketsBase.adjustedEbitda * ebitdaRatio, Math.abs(reportedMarketsBase.revenue * revenueRatio) > 1 ? reportedMarketsBase.revenue * revenueRatio : 1),
          sourceType: "assumption",
          splitSource: split.splitSource,
          parentReportedSegment: "Markets",
          notes: "Analytical split backfilled from reported Markets economics because the selected period does not include an explicit analytical split row.",
        } satisfies LsegSegmentFinancialPoint);

      if (!context.data.segmentFinancials.some((point) => point.periodId === context.periodId && point.segment === segment && point.taxonomy === "analytical_split")) {
        splitWarnings.push({
          id: `lseg-strategic-split-backfill-${segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          title: "Strategic split period is backfilled from reported Markets economics",
          detail: `${segment} does not have an explicit analytical split row for ${context.periodId}. Strategic SOTP backfills the base-period split from reported Markets ratios and should be treated as analyst-estimate optionality.`,
          severity: "medium",
        });
      }

      components.push(buildComponent(segment, "analytical_split", context, {
        basePointOverride: actualPoint,
        forecastRevenue: forecastMarketsRevenue * revenueRatio,
        forecastEbitda: forecastMarketsEbitda * ebitdaRatio,
        forecastRevenue2027: forecastMarketsRevenue2027 ? forecastMarketsRevenue2027 * revenueRatio : undefined,
        forecastEbitda2027: forecastMarketsEbitda2027 ? forecastMarketsEbitda2027 * ebitdaRatio : undefined,
        source: split.splitSource === "company_disclosed" ? "forecast_from_margin_engine" : split.splitSource === "analyst_estimate" ? "analyst_estimate" : "placeholder",
        multiplePolicy: "strategic",
      }));
      continue;
    }

    const taxonomy = segment === "Other" ? "reported_2025" : "reported_2025";
    components.push(buildComponent(segment, taxonomy, context, {
      source: segment === "Other" ? "reported" : "forecast_from_margin_engine",
      multiplePolicy: "base_operating",
    }));
  }

  if (split && Math.abs((split.capitalMarketsEbitda + split.postTradeEbitda) - split.adjustedEbitda) > 35) {
    splitWarnings.push({
      id: "lseg-strategic-split-reconcile",
      title: "Analytical split does not reconcile to reported Markets EBITDA",
      detail: "Capital Markets plus Post Trade EBITDA should reconcile back to the reported Markets EBITDA within tolerance.",
      severity: "high",
    });
  }

  if (split?.splitSource && split.splitSource !== "company_disclosed") {
    splitWarnings.push({
      id: "lseg-strategic-split-source",
      title: "Analytical split uses analyst estimate / placeholder",
      detail: "Analytical split uses analyst estimate / placeholder; do not include in base operating SOTP.",
      severity: "medium",
    });
  }

  return components;
}

export function calculateOperatingSotpEngine(
  data: LsegDashboardDataset,
  periodId: string,
  assumptions: LsegScenarioAssumptions,
  revenue: LsegRevenueEngineResult,
  margin: LsegMarginEngineResult,
  multiplePolicy: LsegSotpMultiplePolicy = "base_operating",
): LsegSotpResult {
  const context = { data, periodId, assumptions, revenue, margin };
  const components = OPERATING_SEGMENTS.map((segment) => buildComponent(segment, "reported_2025", context, {
    source: segment === "Other" ? "reported" : "forecast_from_margin_engine",
    multiplePolicy,
  }));
  definitionWarnings(components);
  const { bridge, corporateCostTreatment, treatmentNote, warnings: bridgeWarnings } = buildOperatingBridge(context, components);
  const doubleCountWarnings: string[] = [];
  const severeWarnings: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [...bridgeWarnings];

  if (assumptions.segmentTaxonomy !== "reported_2025") {
    severeWarnings.push({
      id: "lseg-operating-taxonomy-forced",
      title: "Separate Post Trade valuation requires explicit EBITDA split",
      detail: "Operating SOTP always uses the reported 2025 taxonomy. Analytical split and separate Post Trade valuation stay outside the operating SOTP unless an explicit split is provided and disclosed.",
      severity: "high",
    });
    warnings.push({
      id: "lseg-operating-taxonomy-forced-note",
      title: "Operating SOTP forced back to reported 2025 taxonomy",
      detail: "Analytical split inputs were excluded from operating SOTP to avoid double counting Markets and Post Trade.",
      severity: "medium",
    });
    doubleCountWarnings.push("Separate Post Trade valuation requires explicit EBITDA split.");
  }

  if (components.some((component) => component.segment === "Post Trade")) {
    const message = "Potential double count: reported Markets already includes Post Trade economics.";
    doubleCountWarnings.push(message);
    severeWarnings.push({
      id: "lseg-operating-posttrade-doublecount",
      title: "Potential double count: reported Markets already includes Post Trade economics.",
      detail: "Separate Post Trade valuation requires explicit EBITDA split.",
      severity: "high",
    });
  }

  const audit = buildAudit(
    components,
    margin.groupRows[0]?.adjustedEbitda ?? getPeriodById(data, periodId).adjustedEbitda,
    bridge,
    context,
    warnings,
    severeWarnings,
    [
      "Operating SOTP is a reported-taxonomy going-concern valuation.",
      "Post Trade remains commentary-only in the operating case because reported Markets already includes the relevant economics.",
    ],
  );

  return {
    scenario: assumptions.scenario,
    taxonomy: "reported_2025",
    multiplePolicy,
    valuedSegments: OPERATING_SEGMENTS,
    postTradeTreatment: "commentary_only",
    forwardMetricYear: getPeriodById(data, periodId).fiscalYear + 1,
    components,
    segmentEnterpriseValueSubtotal: bridge.segmentEnterpriseValueSubtotal,
    enterpriseValue: bridge.segmentEnterpriseValueSubtotal - bridge.corporateCostValueDeduction + bridge.nonOperatingAssets + bridge.associatesOrInvestmentsAddBack + bridge.listedStakeLookThroughValue,
    equityValue: bridge.equityValue,
    valuePerShare: bridge.valuePerShare,
    impliedGroupEvToEbitda: safeRatio(bridge.segmentEnterpriseValueSubtotal, margin.groupRows[0]?.adjustedEbitda ?? 1),
    type: "operating",
    blendedUsesOperatingSotp: true,
    corporateCostTreatment,
    corporateCostAmount: bridge.corporateCostAmount,
    corporateCostMultiple: bridge.corporateCostMultiple,
    corporateCostValueDeduction: bridge.corporateCostValueDeduction,
    otherSegmentValue: bridge.otherSegmentValue,
    eliminationAdjustment: bridge.eliminationAdjustment,
    treatmentNote,
    minorityInterestDeduction: bridge.minorityInterestDeduction,
    nciDeduction: bridge.nciDeduction,
    tradewebNciAdjustment: bridge.tradewebNciAdjustment,
    postTradeSolutionsNciAdjustment: bridge.postTradeSolutionsNciAdjustment,
    associatesOrInvestmentsAddBack: bridge.associatesOrInvestmentsAddBack,
    listedStakeLookThroughValue: bridge.listedStakeLookThroughValue,
    nonOperatingAssets: bridge.nonOperatingAssets,
    pensionOrOtherClaims: bridge.pensionOrOtherClaims,
    doubleCountWarnings,
    bridge,
    sensitivity: {
      multipleSensitivity: buildMultipleSensitivity(components, bridge.dilutedShares),
      ebitdaSensitivity: buildEbitdaSensitivity(components, bridge.dilutedShares),
      corporateNciSensitivity: buildCorporateNciSensitivity(
        bridge,
        bridge.corporateCostValueDeduction,
        bridge.nciDeduction,
        bridge.minorityInterestDeduction,
      ),
    },
    audit,
    sotpWarnings: [...audit.severeWarnings, ...audit.warnings],
  };
}

export function calculateStrategicSotpEngine(
  data: LsegDashboardDataset,
  periodId: string,
  assumptions: LsegScenarioAssumptions,
  revenue: LsegRevenueEngineResult,
  margin: LsegMarginEngineResult,
  selectedOperating?: LsegSotpResult,
): LsegSotpResult {
  const context = { data, periodId, assumptions, revenue, margin };
  const operating = selectedOperating ?? calculateOperatingSotpEngine(data, periodId, assumptions, revenue, margin, "base_operating");
  const splitWarnings: ValidationWarning[] = [];
  const splitSevereWarnings: ValidationWarning[] = [];
  const referenceComponents = buildStrategicReferenceComponents(context, splitWarnings, splitSevereWarnings);
  const strategicReferenceSegmentSubtotal = referenceComponents.reduce((sum, component) => sum + component.enterpriseValueContribution, 0);
  definitionWarnings(referenceComponents);

  const tradewebLookThroughUplift = assumptions.strategicOptionality.tradewebLookThroughStakeValue;
  const splitBasedStandaloneUplift = Math.max(strategicReferenceSegmentSubtotal - operating.segmentEnterpriseValueSubtotal, 0);
  const postTradeStandaloneUplift = referenceComponents.some((component) => component.segment === "Post Trade")
    ? splitBasedStandaloneUplift
    : assumptions.strategicOptionality.postTradeStandaloneUplift;
  const portfolioSimplificationUplift = assumptions.strategicOptionality.portfolioSimplificationValue;
  const excessCapitalReturnUplift = assumptions.strategicOptionality.excessCapitalReturnOptionality;
  const activistBreakupValue = assumptions.strategicOptionality.activistBreakupValue;
  const taxLeakage = assumptions.strategicOptionality.taxLeakage;
  const disSynergyCost = assumptions.strategicOptionality.disSynergyCost;
  const executionDiscount = assumptions.strategicOptionality.executionDiscount;

  const strategicOptionalityValue =
    tradewebLookThroughUplift +
    postTradeStandaloneUplift +
    portfolioSimplificationUplift +
    excessCapitalReturnUplift +
    activistBreakupValue -
    taxLeakage -
    disSynergyCost -
    executionDiscount;

  const equityValue = operating.equityValue + strategicOptionalityValue;
  const valuePerShare = safeRatio(equityValue, operating.bridge.dilutedShares);
  const strategicOptionalityPerShare = valuePerShare - operating.valuePerShare;
  const strategicOptionalityPctOfOperating = safeRatio(strategicOptionalityPerShare, Math.max(operating.valuePerShare, 0.01));
  const doubleCountWarnings = [
    "Potential double count: reported Markets already includes Post Trade economics.",
    "Separate Post Trade valuation requires explicit EBITDA split.",
  ];

  const bridge: LsegSotpBridge = {
    ...operating.bridge,
    associatesOrInvestmentsAddBack: postTradeStandaloneUplift + portfolioSimplificationUplift + excessCapitalReturnUplift + activistBreakupValue,
    listedStakeLookThroughValue: tradewebLookThroughUplift,
    pensionOrOtherClaims: taxLeakage + disSynergyCost + executionDiscount,
    equityValue,
    valuePerShare,
  };

  const strategyWarnings: ValidationWarning[] = [
    ...splitWarnings,
    {
      id: "lseg-strategic-not-in-base",
      title: "Strategic optionality is excluded from the base blend",
      detail: "Strategic SOTP is an activist / optionality case and is not included in base blended fair value.",
      severity: "low",
    },
  ];
  if (strategicOptionalityPctOfOperating < 0.1) {
    strategyWarnings.push({
      id: "lseg-strategic-too-close",
      title: "Strategic SOTP is not meaningfully different from operating SOTP",
      detail: "Strategic SOTP is not meaningfully different from operating SOTP; strategic optionality may already be embedded in operating multiples.",
      severity: "medium",
    });
  }
  if (operating.valuePerShare > 0 && strategicOptionalityPerShare < operating.valuePerShare * 0.1) {
    strategyWarnings.push({
      id: "lseg-operating-overcapitalized",
      title: "Operating SOTP may be overcapitalizing break-up or activist value",
      detail: "Operating SOTP may be overcapitalizing break-up or activist value because the explicit strategic optionality layer is small.",
      severity: "medium",
    });
  }

  const audit = buildAudit(
    referenceComponents.length > 0 ? referenceComponents : operating.components,
    margin.groupRows[0]?.adjustedEbitda ?? getPeriodById(data, periodId).adjustedEbitda,
    bridge,
    context,
    strategyWarnings,
    splitSevereWarnings,
    [
      "Strategic SOTP is built as operating SOTP plus explicit optionality layers, not as a hidden re-rating inside the base case.",
      "Analytical split components are reference values for Capital Markets / Post Trade and are used only to size standalone optionality, not to change the base operating SOTP.",
    ],
  );

  return {
    scenario: assumptions.scenario,
    taxonomy: "analytical_split",
    multiplePolicy: "strategic",
    valuedSegments: STRATEGIC_REFERENCE_SEGMENTS,
    postTradeTreatment: "standalone_strategic",
    forwardMetricYear: getPeriodById(data, periodId).fiscalYear + 1,
    components: referenceComponents.length > 0 ? referenceComponents : operating.components,
    segmentEnterpriseValueSubtotal: bridge.segmentEnterpriseValueSubtotal,
    enterpriseValue: operating.enterpriseValue + strategicOptionalityValue,
    equityValue,
    valuePerShare,
    impliedGroupEvToEbitda: safeRatio(operating.enterpriseValue + strategicOptionalityValue, margin.groupRows[0]?.adjustedEbitda ?? 1),
    type: "strategic",
    blendedUsesOperatingSotp: false,
    corporateCostTreatment: operating.corporateCostTreatment,
    corporateCostAmount: operating.corporateCostAmount,
    corporateCostMultiple: operating.corporateCostMultiple,
    corporateCostValueDeduction: operating.corporateCostValueDeduction,
    otherSegmentValue: operating.otherSegmentValue,
    eliminationAdjustment: operating.eliminationAdjustment,
    treatmentNote:
      "Strategic SOTP starts from operating SOTP and adds explicit optionality for Tradeweb look-through, Post Trade standalone value, portfolio simplification, and excess capital return after tax leakage, dis-synergy, and execution discounts.",
    minorityInterestDeduction: operating.minorityInterestDeduction,
    nciDeduction: operating.nciDeduction,
    tradewebNciAdjustment: operating.tradewebNciAdjustment,
    postTradeSolutionsNciAdjustment: operating.postTradeSolutionsNciAdjustment,
    associatesOrInvestmentsAddBack: bridge.associatesOrInvestmentsAddBack,
    listedStakeLookThroughValue: bridge.listedStakeLookThroughValue,
    nonOperatingAssets: bridge.nonOperatingAssets,
    pensionOrOtherClaims: bridge.pensionOrOtherClaims,
    strategicOptionalityPerShare,
    strategicOptionalityValue,
    strategicOptionalityPctOfOperating,
    doubleCountWarnings,
    bridge,
    sensitivity: {
      multipleSensitivity: buildMultipleSensitivity(referenceComponents.length > 0 ? referenceComponents : operating.components, bridge.dilutedShares),
      ebitdaSensitivity: buildEbitdaSensitivity(referenceComponents.length > 0 ? referenceComponents : operating.components, bridge.dilutedShares),
      corporateNciSensitivity: buildCorporateNciSensitivity(
        bridge,
        bridge.corporateCostValueDeduction,
        bridge.nciDeduction,
        bridge.minorityInterestDeduction,
      ),
    },
    audit,
    sotpWarnings: [...audit.severeWarnings, ...audit.warnings],
  };
}
