import type { DashboardInterpretation, DataStatus, Signal, SummaryMetric, ValidationWarning } from "../types";
import { annualizeQuarterly, clamp, safeDivide } from "../../utils/financialMath";
import {
  checkExtremeGrowthRates,
  checkImpossibleCagrCombination,
  checkMissingFields,
  checkPeSanity,
  checkSegmentSumConsistency,
  checkValuationReliability,
} from "../../utils/validation";
import type { MetaAssumptions } from "./assumptions";
import { defaultMetaAssumptions, metaScenarioDefaults } from "./assumptions";
import { calculateAdEconomics } from "./adEconomicsEngine";
import { calculateAiAdRoic } from "./aiAdRoicEngine";
import { calculateCapexEconomics } from "./capexEngine";
import { metaData, type MetaData, type MetaQuarterRow } from "./data";
import { calculateEngagementEconomics } from "./engagementEngine";
import { calculateReelsEconomics } from "./reelsEngine";
import { calculateRealityLabsEconomics } from "./realityLabsEngine";
import { calculateMetaValuation, type MetaValuationInput } from "./valuation";
import { calculateWhatsappEconomics } from "./whatsappEngine";

export type MetaEvaluatedRow = MetaQuarterRow & {
  adRevenueFromFormula: number;
  reportedAdRevenue: number;
  reportedCpm: number;
  effectiveCpm: number;
  adRevenueReconciliationGap: number;
  adRevenueReconciled: boolean;
  bridgePrecision: "precise" | "reconciled";
  adRevenueYoYGrowth: number;
  familyAppsOperatingIncome: number;
  aiAdRevenueUpliftAnnualized: number;
  aiAdOperatingProfitAnnualized: number;
  aiAdAfterTaxOperatingProfitAnnualized: number;
  aiAdRoic: number;
  aiPaybackYears: number;
  aiRevenueToCapital: number;
  aiAdjustedFcf: number;
  aiAdjustedFcfMargin: number;
  impressionsGrowth: number;
  cpmGrowth: number;
  revenueGrowth: number;
  recommendationScore: number;
  monetizationGapChange: number;
  capexIntensity: number;
  aiCapexMix: number;
  burdenScore: number;
  scenarioReadThrough: string;
};

export type MetaDataset = Omit<MetaData, "rows"> & {
  rows: MetaEvaluatedRow[];
  selectedRow: MetaEvaluatedRow;
  latestReferenceDate: string;
};

export type MetaModel = {
  summary: SummaryMetric[];
  dataStatus: DataStatus;
  rows: MetaEvaluatedRow[];
  selectedRow: MetaEvaluatedRow;
  statusBanner: { title: string; detail: string; signal: Signal };
  bridgeStatus: { title: string; detail: string; signal: Signal };
  investmentReadThrough: DashboardInterpretation[];
  adRevenueBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  aiAdBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  engagementTrend: Array<{ period: string; timeSpent: number; reelsWatchTime: number; monetizationGap: number; adLoad: number; advantagePlusAdoption: number }>;
  capexFcfBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  realityLabsTrend: Array<{ period: string; revenue: number; operatingLoss: number; lossMargin: number }>;
  whatsappTrend: Array<{ period: string; revenue: number; optionalityValue: number; businessMessagingRevenue: number }>;
  adsEngineCards: Array<{ label: string; value: number; format: SummaryMetric["format"]; detail: string; badge: SummaryMetric["badge"] }>;
  aiAdStackCards: Array<{ label: string; value: number; format: SummaryMetric["format"]; detail: string; badge: SummaryMetric["badge"] }>;
  capexCards: Array<{ label: string; value: number; format: SummaryMetric["format"]; detail: string; badge: SummaryMetric["badge"] }>;
  scenarioLab: {
    phase: { title: string; detail: string; signal: Signal };
    cards: Array<{
      scenario: "Bear" | "Base" | "Bull";
      fairValue: number;
      aiAdRoic: number;
      fcfMargin: number;
      totalUpliftRate: number;
      detail: string;
    }>;
  };
  valuation: ReturnType<typeof calculateMetaValuation>;
};

function metric(label: string, value: number, delta: number | undefined, format: SummaryMetric["format"], description: string, badge: SummaryMetric["badge"]): SummaryMetric {
  return { key: label.toLowerCase().replace(/\s+/g, "-"), label, value, delta, format, description, badge };
}

function valuationInput(row: MetaQuarterRow, prior: MetaQuarterRow, data: MetaData): MetaValuationInput {
  return {
    selectedRow: row,
    priorRow: prior,
    latestReferenceDate: data.latestReferenceDate,
    currentPrice: data.currentPrice,
  };
}

function detectMetaPhase(current: MetaEvaluatedRow, prior: MetaEvaluatedRow, assumptions: MetaAssumptions) {
  if (current.aiAdRoic > assumptions.wacc + 0.04 && current.aiAdjustedFcfMargin > prior.aiAdjustedFcfMargin) {
    return { title: "AI profit flywheel established", detail: "Incremental ad profit is compounding faster than the AI infrastructure burden, and cash conversion is improving.", signal: "Positive" as const };
  }
  if (current.aiAdRoic > assumptions.wacc && current.monetizationGapChange > 0) {
    return { title: "Recommendation monetization inflecting", detail: "Recommendation quality is lifting conversion and CPM while the Reels monetization gap is narrowing.", signal: "Inflecting" as const };
  }
  if (current.aiCapexMix > 0.62 && current.aiAdjustedFcfMargin < prior.aiAdjustedFcfMargin) {
    return { title: "Compute burden still leading", detail: "Meta is still carrying a front-loaded GPU and data center burden that is outrunning near-term monetization.", signal: "Compute Constrained" as const };
  }
  if (current.aiAdRoic < assumptions.wacc) {
    return { title: "AI economics still proving out", detail: "Ad uplift exists, but the profit return on AI capital has not clearly cleared the cost of capital yet.", signal: "Neutral" as const };
  }
  return { title: "Balanced monetization phase", detail: "AI economics and infrastructure burden are broadly balanced, with better upside if CPM and ROAS keep improving.", signal: "Neutral" as const };
}

function normalizeMetaRow(row: MetaQuarterRow) {
  const reportedAdRevenue = row.adRevenue;
  const reportedCpm = row.cpm;
  const impliedQuarterlyAdRevenue = row.adImpressions * row.cpm / 1000;
  if (row.isForecast) {
    const familyAppsExAd = row.familyAppsRevenue - row.adRevenue;
    const totalExFamilyApps = row.totalRevenue - row.familyAppsRevenue;
    const adjustedAdRevenue = impliedQuarterlyAdRevenue;
    const adjustedFamilyAppsRevenue = adjustedAdRevenue + familyAppsExAd;
    const adjustedTotalRevenue = adjustedFamilyAppsRevenue + totalExFamilyApps;
    return {
      ...row,
      adRevenue: adjustedAdRevenue,
      familyAppsRevenue: adjustedFamilyAppsRevenue,
      totalRevenue: adjustedTotalRevenue,
      reportedAdRevenue,
      reportedCpm,
    };
  }
  return {
    ...row,
    cpm: safeDivide(row.adRevenue, Math.max(row.adImpressions, 1)) * 1000,
    reportedAdRevenue,
    reportedCpm,
  };
}

function buildEvaluatedRows(data: MetaData, assumptions: MetaAssumptions): MetaEvaluatedRow[] {
  const normalizedRows = data.rows.map((row) => normalizeMetaRow(row));
  return normalizedRows.map((row, index) => {
    const prior = normalizedRows[Math.max(index - 1, 0)] ?? row;
    const adEconomics = calculateAdEconomics(row, prior, assumptions);
    const engagementEconomics = calculateEngagementEconomics(row, prior, assumptions);
    const reelsEconomics = calculateReelsEconomics(row, prior);
    const capexEconomics = calculateCapexEconomics(
      row,
      assumptions,
      Math.max(0, adEconomics.aiAfterTaxOperatingProfitAnnual - adEconomics.aiEmbeddedAfterTaxProfitAnnual),
    );
    const aiRoic = calculateAiAdRoic(row, assumptions, adEconomics, engagementEconomics, capexEconomics);
    const scenarioReadThrough =
      aiRoic.aiAdRoic > assumptions.wacc
        ? "AI uplift is translating into profit faster than infrastructure cost."
        : "Infrastructure cost is still consuming a large share of AI-generated ad uplift.";

    return {
      ...row,
      adRevenueFromFormula: row.adImpressions * row.cpm / 1000,
      reportedAdRevenue: row.reportedAdRevenue ?? row.adRevenue,
      reportedCpm: row.reportedCpm ?? row.cpm,
      effectiveCpm: adEconomics.effectiveCpm,
      adRevenueReconciliationGap: adEconomics.adRevenueReconciliationGap,
      adRevenueReconciled: adEconomics.adRevenueReconciled,
      bridgePrecision: adEconomics.bridgePrecision,
      adRevenueYoYGrowth: index === 0 ? row.adRevenueGrowth : safeDivide(row.adRevenue, Math.max(prior.adRevenue, 1)) - 1,
      familyAppsOperatingIncome: row.familyAppsRevenue * row.familyAppsOperatingMargin,
      aiAdRevenueUpliftAnnualized: adEconomics.totalIncrementalRevenue,
      aiAdOperatingProfitAnnualized: adEconomics.aiOperatingProfitAnnual,
      aiAdAfterTaxOperatingProfitAnnualized: adEconomics.aiAfterTaxOperatingProfitAnnual,
      aiAdRoic: aiRoic.aiAdRoic,
      aiPaybackYears: aiRoic.paybackYears,
      aiRevenueToCapital: adEconomics.totalIncrementalRevenue / Math.max(aiRoic.investedCapital, 1),
      aiAdjustedFcf: capexEconomics.aiAdjustedFcf,
      aiAdjustedFcfMargin: capexEconomics.aiAdjustedFcfMargin,
      impressionsGrowth: adEconomics.impressionsGrowth,
      cpmGrowth: adEconomics.cpmGrowth,
      revenueGrowth: index === 0 ? 0 : safeDivide(row.totalRevenue, Math.max(prior.totalRevenue, 1)) - 1,
      recommendationScore: engagementEconomics.engagementScore,
      monetizationGapChange: reelsEconomics.monetizationGapChange,
      capexIntensity: capexEconomics.capexIntensity,
      aiCapexMix: capexEconomics.aiCapexMix,
      burdenScore: capexEconomics.burdenScore,
      scenarioReadThrough,
    };
  });
}

export function validateMetaData(data: MetaDataset, assumptions: MetaAssumptions): ValidationWarning[] {
  const current = data.selectedRow;
  const prior = data.rows[data.rows.length - 2] ?? current;
  const valuation = calculateMetaValuation(
    valuationInput(current, prior, data),
    assumptions,
    "Base",
  );
  const warnings: ValidationWarning[] = [
    ...checkExtremeGrowthRates(
      [
        { label: "Ad revenue growth", value: current.adRevenueGrowth },
        { label: "Ad impressions growth", value: current.impressionsGrowth },
        { label: "CPM growth", value: current.cpmGrowth },
      ],
      0.35,
    ),
    ...checkSegmentSumConsistency(current.totalRevenue, [current.familyAppsRevenue, current.realityLabsRevenue], "revenue"),
    ...checkPeSanity(assumptions.forwardEps * assumptions.targetPe, 450, 1000, "META"),
    ...checkImpossibleCagrCombination(
      valuation.fairValues.find((row) => row.scenario === "Base")?.upsideDownside ?? 0,
      valuation.fairValues.find((row) => row.scenario === "Base")?.expectedReturn3Y ?? 0,
    ),
    ...checkMissingFields([
      { key: "currentPrice", value: assumptions.currentPrice },
      { key: "forwardEps", value: assumptions.forwardEps },
      { key: "fcfPerShare", value: assumptions.fcfPerShare },
      { key: "aiInvestedCapital", value: assumptions.aiInvestedCapital },
      { key: "aiInferenceCost", value: assumptions.aiInferenceCost },
    ]).map((field) => ({
      id: `missing-${field}`,
      title: `Missing ${field}`,
      detail: `Critical valuation field "${field}" is missing or blank.`,
      severity: "high" as const,
    })),
    ...checkValuationReliability(valuation.validationWarnings?.some((warning) => warning.severity === "high") ?? false),
  ];

  if (current.aiCapex > current.totalCapex) {
    warnings.push({
      id: "ai-capex-consistency",
      title: "AI CapEx exceeds total CapEx",
      detail: "AI CapEx should be a subset of consolidated CapEx, not larger than the company total.",
      severity: "high",
    });
  }
  if (assumptions.realityLabsLoss <= 0) {
    warnings.push({
      id: "reality-labs-drag",
      title: "Reality Labs drag may be omitted",
      detail: "Reality Labs should remain an explicit drag unless you intentionally model break-even.",
      severity: "medium",
    });
  }
  if (assumptions.forwardEps < 10) {
    warnings.push({
      id: "quarterly-eps",
      title: "EPS may be quarterly or not annualized",
      detail: "Meta valuation expects annual forward EPS; a value below 10 usually signals the wrong periodicity.",
      severity: "high",
    });
  }
  data.rows
    .filter((row) => row.adRevenueReconciliationGap > 0.02)
    .forEach((row) => {
      warnings.push({
        id: `ad-revenue-reconciliation-${row.periodId}`,
        title: `Ad revenue does not reconcile in ${row.periodId}`,
        detail: "Reported ad revenue differs materially from impressions x CPM. The dashboard will fall back to a reconciled bridge instead of presenting the CPM bridge as precise.",
        severity: row.periodId === current.periodId ? "high" : "medium",
      });
    });
  return warnings;
}

export function calculateMetaSummary(data: MetaDataset, assumptions: MetaAssumptions): SummaryMetric[] {
  const current = data.selectedRow;
  const prior = (data.rows[data.rows.length - 2] as MetaEvaluatedRow | undefined) ?? current;
  const valuation = calculateMetaValuation(valuationInput(current, prior, data), assumptions, "Base");
  const blendedFairValue = valuation.fairValues.find((row) => row.scenario === "Base")?.fairValue ?? valuation.currentPrice;
  return [
    metric("Revenue", current.totalRevenue, current.totalRevenue - prior.totalRevenue, "currency", "Quarterly revenue base funding the AI ad stack and infrastructure burden.", "Actual"),
    metric("Ad Revenue Growth", current.adRevenueGrowth, current.adRevenueGrowth - prior.adRevenueGrowth, "percent", "Growth in Family of Apps ad revenue.", "Actual"),
    metric("Family Apps Operating Margin", current.familyAppsOperatingMargin, current.familyAppsOperatingMargin - prior.familyAppsOperatingMargin, "percent", "Core advertising margin before Reality Labs drag.", "Derived"),
    metric("CPM Growth", current.cpmGrowth, current.cpmGrowth - prior.cpmGrowth, "percent", "Auction pricing and monetization quality improvement using implied CPM for actual periods and modeled CPM for forecasts.", "Derived"),
    metric("ROAS", current.roas, current.roas - prior.roas, "number", "Advertiser return on ad spend, a key proof-point for AI targeting economics.", "Actual"),
    metric("AI Revenue Uplift", current.aiAdRevenueUpliftAnnualized, current.aiAdRevenueUpliftAnnualized - prior.aiAdRevenueUpliftAnnualized, "currency", "Incremental AI-driven ad revenue on an annualized run-rate.", "Derived"),
    metric("AI Ad ROIC", current.aiAdRoic, current.aiAdRoic - prior.aiAdRoic, "percent", "Incremental after-tax ad profit divided by AI invested capital.", "Derived"),
    metric("AI Adjusted FCF Margin", current.aiAdjustedFcfMargin, current.aiAdjustedFcfMargin - prior.aiAdjustedFcfMargin, "percent", "FCF margin after charging the modeled AI infrastructure burden.", "Derived"),
    metric("CapEx / Revenue", current.capexIntensity, current.capexIntensity - prior.capexIntensity, "percent", "Capital intensity including GPU and data center buildout.", "Derived"),
    metric("Reality Labs Operating Loss", annualizeQuarterly(current.realityLabsOperatingLoss), annualizeQuarterly(current.realityLabsOperatingLoss - prior.realityLabsOperatingLoss), "currency", "Structural drag from Reality Labs in the base case.", "Actual"),
    metric("Forward EPS", assumptions.forwardEps, assumptions.forwardEps - defaultMetaAssumptions.forwardEps, "currency", "Annual forward EPS anchor used in the core Ads valuation method.", "Assumption"),
    metric("Total Fair Value", blendedFairValue, blendedFairValue - valuation.currentPrice, "currency", "Core ex-AI blended value plus AI uplift and optionality, net of Reality Labs drag and incremental AI capital burden.", "Derived"),
    metric("Upside / Downside", valuation.fairValues.find((row) => row.scenario === "Base")?.upsideDownside ?? 0, 0, "percent", "Total fair value versus the current share price.", "Derived"),
  ];
}

export function buildMetaDashboardData(
  data: MetaData = metaData,
  assumptions: MetaAssumptions = defaultMetaAssumptions,
  periodId = data.currentPeriodId,
  activeScenario: "Bear" | "Base" | "Bull" = "Base",
): MetaModel {
  const rows = buildEvaluatedRows(data, assumptions);
  const selectedRow = rows.find((row) => row.periodId === periodId) ?? rows[rows.length - 1];
  const selectedIndex = rows.findIndex((row) => row.periodId === selectedRow.periodId);
  const priorRow = rows[Math.max(selectedIndex - 1, 0)] ?? selectedRow;
  const valuation = calculateMetaValuation(valuationInput(selectedRow, priorRow, data), assumptions, activeScenario);
  const validationWarnings = validateMetaData({ ...data, rows, selectedRow, latestReferenceDate: data.latestReferenceDate }, assumptions);
  const dataStatus: DataStatus = {
    sourceType: "mock",
    lastUpdated: data.latestReferenceDate,
    missingFields: checkMissingFields([
      { key: "currentPrice", value: assumptions.currentPrice },
      { key: "forwardEps", value: assumptions.forwardEps },
      { key: "fcfPerShare", value: assumptions.fcfPerShare },
      { key: "aiInferenceCost", value: assumptions.aiInferenceCost },
    ]),
    validationWarnings,
    valuationReliable: !validationWarnings.some((warning) => warning.severity === "high"),
  };

  const statusBanner = detectMetaPhase(selectedRow, priorRow, assumptions);
  const bridgeStatus = selectedRow.adRevenueReconciliationGap > 0.02
    ? {
        title: "Ad bridge is reconciled, not precise",
        detail: "Ad revenue and impressions x CPM differ by more than 2%. Historical periods use implied CPM, and forecast periods derive revenue directly from impressions x CPM.",
        signal: "Needs Review" as const,
      }
    : {
        title: "Ad bridge reconciles cleanly",
        detail: "Historical periods use implied CPM from reported ad revenue and impressions, while forecast periods derive revenue directly from modeled impressions x CPM.",
        signal: "Positive" as const,
      };
  const adEconomics = calculateAdEconomics(selectedRow, priorRow, assumptions);
  const engagementEconomics = calculateEngagementEconomics(selectedRow, priorRow, assumptions);
  const reelsEconomics = calculateReelsEconomics(selectedRow, priorRow);
  const capexEconomics = calculateCapexEconomics(
    selectedRow,
    assumptions,
    Math.max(0, adEconomics.aiAfterTaxOperatingProfitAnnual - adEconomics.aiEmbeddedAfterTaxProfitAnnual),
  );
  const aiRoic = calculateAiAdRoic(selectedRow, assumptions, adEconomics, engagementEconomics, capexEconomics);
  const whatsapp = calculateWhatsappEconomics(selectedRow, assumptions);
  const realityLabs = calculateRealityLabsEconomics(selectedRow, assumptions);

  const investmentReadThrough: DashboardInterpretation[] = [
    {
      title: "Is AI improving ad efficiency?",
      signal: aiRoic.aiAdRoic > assumptions.wacc ? "Positive" : "Neutral",
      detail: aiRoic.aiAdRoic > assumptions.wacc
        ? "AI-generated conversion, CPM, and engagement uplift is translating into profit above the cost of capital."
        : "AI uplift exists, but profit returns are still too close to the cost of capital to call it proven.",
      badge: "Derived",
    },
    {
      title: "Is infrastructure cost manageable?",
      signal: capexEconomics.aiAdjustedFcfMargin >= selectedRow.fcfMargin ? "Positive" : "Compute Constrained",
      detail: capexEconomics.aiAdjustedFcfMargin >= selectedRow.fcfMargin
        ? "AI monetization is offsetting a meaningful share of GPU and data center burden."
        : "GPU, inference, and data center burden still absorb a large share of AI revenue uplift.",
      badge: "Derived",
    },
    {
      title: "Are Reels monetizing better?",
      signal: reelsEconomics.monetizationGapChange > 0 ? "Positive" : "Neutral",
      detail: reelsEconomics.monetizationGapChange > 0
        ? "The Reels monetization gap is narrowing while watch time keeps rising, which supports a durable CPM tailwind."
        : "Engagement is still healthy, but the monetization gap is not closing fast enough yet.",
      badge: "Actual",
    },
    {
      title: "Is optionality offsetting drag?",
      signal: whatsapp.optionalityValue > Math.abs(realityLabs.optionalityValue) ? "Positive" : "Neutral",
      detail: "WhatsApp optionality helps offset Reality Labs drag, but the core debate still hinges on whether AI ad profit scales faster than AI infrastructure.",
      badge: "Derived",
    },
  ];

  const adRevenueBridge = [
    { label: "Prior ad revenue", value: priorRow.adRevenue, type: "base" as const },
    { label: "Impression growth", value: priorRow.adRevenue * adEconomics.impressionsGrowth, type: "positive" as const },
    { label: "CPM growth", value: priorRow.adRevenue * adEconomics.cpmGrowth, type: "positive" as const },
    { label: "AI uplift", value: selectedRow.aiAdRevenueUplift, type: "positive" as const },
    {
      label: "Residual / mix",
      value: selectedRow.adRevenue - priorRow.adRevenue - (priorRow.adRevenue * adEconomics.impressionsGrowth) - (priorRow.adRevenue * adEconomics.cpmGrowth) - selectedRow.aiAdRevenueUplift,
      type: "negative" as const,
    },
    { label: "Current ad revenue", value: selectedRow.adRevenue, type: "total" as const },
  ];

  const aiAdBridge = [
    { label: "Base ad revenue", value: adEconomics.annualAdRevenue, type: "base" as const },
    { label: "Conversion uplift", value: adEconomics.conversionRevenue, type: "positive" as const },
    { label: "CPM uplift", value: adEconomics.cpmRevenue, type: "positive" as const },
    { label: "Engagement uplift", value: adEconomics.engagementRevenue, type: "positive" as const },
    { label: "Creative uplift", value: adEconomics.creativeRevenue, type: "positive" as const },
    { label: "Serving + inference", value: -(adEconomics.aiServingCostAnnual + adEconomics.aiInferenceCostAnnual), type: "negative" as const },
    { label: "AI ad stack opex", value: -adEconomics.aiAdOpexAnnual, type: "negative" as const },
    { label: "AI ad operating profit", value: adEconomics.aiOperatingProfitAnnual, type: "total" as const },
  ];

  const capexFcfBridge = [
    { label: "Reported FCF", value: capexEconomics.annualFcf, type: "base" as const },
    {
      label: "Incremental AI after-tax profit",
      value: Math.max(0, adEconomics.aiAfterTaxOperatingProfitAnnual - adEconomics.aiEmbeddedAfterTaxProfitAnnual),
      type: "positive" as const,
    },
    { label: "AI infrastructure burden", value: -capexEconomics.aiInfrastructureBurden, type: "negative" as const },
    { label: "AI-adjusted FCF", value: capexEconomics.aiAdjustedFcf, type: "total" as const },
  ];

  const scenarioLabCards = (["Bear", "Base", "Bull"] as const).map((scenario) => {
    const scenarioAssumptions = metaScenarioDefaults[scenario];
    const scenarioAd = calculateAdEconomics(selectedRow, priorRow, scenarioAssumptions);
    const scenarioCapex = calculateCapexEconomics(
      selectedRow,
      scenarioAssumptions,
      Math.max(0, scenarioAd.aiAfterTaxOperatingProfitAnnual - scenarioAd.aiEmbeddedAfterTaxProfitAnnual),
    );
    const scenarioEngagement = calculateEngagementEconomics(selectedRow, priorRow, scenarioAssumptions);
    const scenarioRoic = calculateAiAdRoic(selectedRow, scenarioAssumptions, scenarioAd, scenarioEngagement, scenarioCapex);
    const scenarioValuation = calculateMetaValuation(valuationInput(selectedRow, priorRow, data), scenarioAssumptions, scenario);
    return {
      scenario,
      fairValue: scenarioValuation.fairValues.find((row) => row.scenario === scenario)?.fairValue ?? scenarioValuation.currentPrice,
      aiAdRoic: scenarioRoic.aiAdRoic,
      fcfMargin: scenarioCapex.aiAdjustedFcfMargin,
      totalUpliftRate: scenarioAd.totalUpliftRate,
      detail:
        scenario === "Bear"
          ? "AI CapEx remains heavy and CPM/conversion lift is modest."
          : scenario === "Base"
            ? "AI targeting and recommendation improve monetization while FCF stabilizes."
            : "ROAS, CPM, and Reels monetization inflect strongly enough to overpower infra burden.",
    };
  });

  return {
    summary: calculateMetaSummary({ ...data, rows, selectedRow, latestReferenceDate: data.latestReferenceDate }, assumptions),
    dataStatus,
    rows,
    selectedRow,
    statusBanner,
    bridgeStatus,
    investmentReadThrough,
    adRevenueBridge,
    aiAdBridge,
    engagementTrend: rows.map((row) => ({
      period: row.periodId,
      timeSpent: row.timeSpent,
      reelsWatchTime: row.reelsWatchTime,
      monetizationGap: row.reelsMonetizationGap,
      adLoad: row.adLoad,
      advantagePlusAdoption: row.advantagePlusAdoption,
    })),
    capexFcfBridge,
    realityLabsTrend: rows.map((row) => ({
      period: row.periodId,
      revenue: annualizeQuarterly(row.realityLabsRevenue),
      operatingLoss: annualizeQuarterly(row.realityLabsOperatingLoss),
      lossMargin: safeDivide(row.realityLabsOperatingLoss, Math.max(row.totalRevenue, 1)),
    })),
    whatsappTrend: rows.map((row) => ({
      period: row.periodId,
      revenue: annualizeQuarterly(row.whatsappRevenue),
      optionalityValue: calculateWhatsappEconomics(row, assumptions).optionalityValue,
      businessMessagingRevenue: annualizeQuarterly(row.businessMessagingRevenue),
    })),
    adsEngineCards: [
      { label: "Ad Revenue Formula", value: selectedRow.adRevenueFromFormula, format: "currency", detail: "Forecast periods derive revenue from impressions x CPM. Historical periods use reported revenue and implied CPM.", badge: "Derived" },
      { label: "ROAS", value: selectedRow.roas, format: "number", detail: "Advertiser return on ad spend should improve if targeting AI is working.", badge: "Actual" },
      { label: "Conversion Uplift", value: adEconomics.conversionUpliftRate, format: "percent", detail: "Incremental conversion lift from AI targeting and ranking.", badge: "Assumption" },
      { label: "Effective CPM", value: selectedRow.effectiveCpm, format: "number", detail: "Historical periods use implied CPM from reported revenue and impressions; forecast periods use modeled CPM.", badge: "Derived" },
      { label: "Uplift Overlap Haircut", value: adEconomics.upliftOverlapHaircut, format: "percent", detail: "Heuristic correlation haircut to keep overlapping CPM, conversion, ROAS, engagement, and creative effects from being over-capitalized.", badge: "Assumption" },
    ],
    aiAdStackCards: [
      { label: "Advantage+ Adoption", value: engagementEconomics.advantagePlusAdoption, format: "percent", detail: "Proxy for how much of the demand stack is benefiting from AI automation.", badge: "Actual" },
      { label: "AI Serving Cost", value: adEconomics.aiServingCostAnnual, format: "currency", detail: "Serving cost burden from recommendation and targeting models.", badge: "Assumption" },
      { label: "AI Inference Cost", value: adEconomics.aiInferenceCostAnnual, format: "currency", detail: "Direct inference burden from model calls and ranking intensity.", badge: "Assumption" },
      { label: "AI Ad Stack Opex", value: adEconomics.aiAdOpexAnnual, format: "currency", detail: "Incremental opex supporting the AI ad stack beyond model serving.", badge: "Derived" },
    ],
    capexCards: [
      { label: "AI CapEx Mix", value: capexEconomics.aiCapexMix, format: "percent", detail: "Share of total CapEx directed to AI infrastructure.", badge: "Derived" },
      { label: "GPU CapEx", value: capexEconomics.annualGpuCapex, format: "currency", detail: "Annualized GPU capital spending.", badge: "Actual" },
      { label: "Data Center CapEx", value: capexEconomics.annualDataCenterCapex, format: "currency", detail: "Annualized data center buildout supporting inference and recommendation.", badge: "Actual" },
      { label: "AI Infrastructure Burden", value: capexEconomics.aiInfrastructureBurden, format: "currency", detail: "Modeled cash burden that AI monetization must overcome.", badge: "Derived" },
    ],
    scenarioLab: {
      phase: statusBanner,
      cards: scenarioLabCards,
    },
    valuation,
  };
}
