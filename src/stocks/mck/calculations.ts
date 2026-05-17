import type {
  DashboardInterpretation,
  DataStatus,
  Scenario,
  SummaryMetric,
  ValuationResult,
  ValidationWarning,
} from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { computeUpsideDownside } from "../../utils/valuation";
import { defaultMckAssumptions, mckScenarioPresets } from "./assumptions";
import { mckDataset } from "./realData";
import type { MckDashboardDataset, MckDataset, MckResearchAssumptions } from "./types";
import { calculateBiopharmaServicesEngine } from "./engines/biopharmaServicesEngine";
import { calculateBuybackEngine } from "./engines/buybackEngine";
import { calculateCapitalAllocationEngine } from "./engines/capitalAllocationEngine";
import { calculateDistributionEconomicsEngine } from "./engines/distributionEconomicsEngine";
import { calculateEarningsCallEngine } from "./engines/earningsCallEngine";
import { latestFinancial, safeDivide } from "./engines/helpers";
import { calculateMarginBridgeEngine } from "./engines/marginBridgeEngine";
import { calculatePeerComparisonEngine } from "./engines/peerComparisonEngine";
import { calculatePrescriptionTechnologyEngine } from "./engines/prescriptionTechnologyEngine";
import { calculateRiskEngine } from "./engines/riskEngine";
import { calculateMckScenarioEngine } from "./engines/scenarioEngine";
import { calculateSegmentEconomicsEngine } from "./engines/segmentEconomicsEngine";
import { calculateSpecialtyOncologyEngine } from "./engines/specialtyOncologyEngine";
import { calculateMckValuationEngine } from "./engines/valuationEngine";
import { calculateWorkingCapitalEngine } from "./engines/workingCapitalEngine";
import { validateMckDataset } from "./validation/mckValidation";

export { defaultMckAssumptions, mckScenarioPresets };
export type { MckResearchAssumptions };

type MckDatasetInput = MckDataset & {
  __mckResolvedPeriod?: string;
};

export function resolveMckDataset(data: unknown): MckDatasetInput {
  if (data && typeof data === "object" && "reportedFinancials" in data && "segmentFinancials" in data) {
    return data as MckDatasetInput;
  }
  return mckDataset;
}

export function attachMckRuntimeContext(data: MckDataset, context: { periodId?: string }): MckDatasetInput {
  return {
    ...data,
    __mckResolvedPeriod: context.periodId,
  };
}

export function getDefaultMckPeriod(data: MckDataset = mckDataset) {
  return data.reportedFinancials[data.reportedFinancials.length - 1]?.periodId ?? "fy2026";
}

export function getMckPeriods(data: MckDataset = mckDataset) {
  return data.reportedFinancials.map((period) => ({ value: period.periodId, label: period.label }));
}

function withAssumptions(data: MckDataset, assumptions?: Partial<MckResearchAssumptions>): MckDataset {
  return {
    ...data,
    assumptions: {
      ...data.assumptions,
      ...defaultMckAssumptions,
      ...(assumptions ?? {}),
    },
  };
}

function summaryMetric(
  label: string,
  value: number,
  delta: number | undefined,
  format: SummaryMetric["format"],
  description: string,
  badge: SummaryMetric["badge"],
): SummaryMetric {
  return { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, value, delta, format, description, badge };
}

export function calculateMckSummary(data: unknown, assumptions?: Partial<MckResearchAssumptions>): SummaryMetric[] {
  const resolved = withAssumptions(resolveMckDataset(data), assumptions);
  const latest = latestFinancial(resolved);
  const segmentEconomics = calculateSegmentEconomicsEngine(resolved);
  const oncology = segmentEconomics.segments.find((row) => row.segment === "Oncology & Multispecialty");
  const valuation = calculateMckValuationEngine(resolved);
  const buyback = calculateBuybackEngine(resolved);
  return [
    summaryMetric("Current Price", resolved.assumptions.currentPrice, undefined, "currency", "Market snapshot used for upside/downside.", "Actual"),
    summaryMetric("Blended Fair Value", valuation.blendedFairValue, resolved.assumptions.currentPrice, "currency", "Weighted P/E, FCF yield, DCF, and SOTP fair value.", "Derived"),
    summaryMetric("Forward P/E", safeDivide(resolved.assumptions.currentPrice, resolved.assumptions.forwardAdjustedEps), undefined, "multiple", "Current price over FY2027 adjusted EPS guidance midpoint.", "Derived"),
    summaryMetric("FCF Yield", safeDivide(latest.freeCashFlow, resolved.assumptions.currentPrice * resolved.assumptions.dilutedShares), undefined, "percent", "FY2026 reported FCF over market equity value.", "Derived"),
    summaryMetric("Buyback Yield", buyback.buybackYield, undefined, "percent", "Annual buyback amount over market equity value.", "Derived"),
    summaryMetric("Adjusted EPS Growth", latest.adjustedEpsGrowth, undefined, "percent", "FY2026 adjusted EPS growth from official release.", "Actual"),
    summaryMetric("Group Op Margin", segmentEconomics.groupMargin, undefined, "percent", "Adjusted segment operating profit over segment revenue.", "Derived"),
    summaryMetric("Oncology Profit Growth", oncology?.adjustedOperatingProfitGrowth ?? 0, undefined, "percent", "FY2026 Oncology & Multispecialty adjusted operating profit growth.", oncology?.tag.sourceType === "actual" ? "Actual" : "Placeholder"),
  ];
}

function buildDataStatus(data: MckDataset, warnings: ValidationWarning[]): DataStatus {
  const missingFields = [
    data.reportedFinancials.some((row) => row.dilutedSharesTag.isPlaceholder) ? "official diluted share count" : "",
    data.reportedFinancials.some((row) => row.netDebtTag.isPlaceholder) ? "official net debt / balance sheet refresh" : "",
    data.qaPairs.some((row) => row.tag.isPlaceholder) ? "full transcript Q&A ingestion" : "",
    data.peers.some((row) => row.tag.isPlaceholder) ? "peer market/filing refresh" : "",
  ].filter(Boolean);
  return {
    sourceType: "manual",
    lastUpdated: data.reportedFinancials[data.reportedFinancials.length - 1]?.tag.asOfDate ?? "2026-05-11",
    missingFields,
    validationWarnings: warnings,
    valuationReliable: !warnings.some((warning) => warning.severity === "high"),
  };
}

function buildInvestmentReadThrough(dashboard: MckDashboardDataset): DashboardInterpretation[] {
  return [
    {
      title: "Compounder quality",
      signal: dashboard.valuation.marginOfSafety > 0.1 ? "Positive" : "Neutral",
      detail:
        "MCK can compound if mid-single-digit distribution profit, faster oncology/RxTS profit, FCF conversion and disciplined buybacks work together.",
      badge: "Derived",
    },
    {
      title: "Low gross margin interpretation",
      signal: dashboard.distributionEconomics.marginCompressionFlag ? "Needs Review" : "Positive",
      detail: dashboard.distributionEconomics.revenueHugeMarginThin,
      badge: "Derived",
    },
    {
      title: "Oncology engine",
      signal: "Positive",
      detail: dashboard.oncology.contribution,
      badge: "Actual",
    },
    {
      title: "Buyback engine",
      signal: dashboard.buyback.valueCreationSignal,
      detail: dashboard.buyback.commentary,
      badge: "Derived",
    },
    {
      title: "Working capital caveat",
      signal: "Needs Review",
      detail: dashboard.workingCapital.warning,
      badge: "Derived",
    },
  ];
}

export function buildMckDashboardData(
  dataInput: unknown,
  assumptions: Partial<MckResearchAssumptions> = {},
  scenario: Scenario = "Base",
): MckDashboardDataset & { dataStatus: DataStatus; readThrough: DashboardInterpretation[] } {
  const scenarioAssumptions = mckScenarioPresets[scenario] ?? {};
  const data = withAssumptions(resolveMckDataset(dataInput), { ...scenarioAssumptions, ...assumptions });
  const segmentEconomics = calculateSegmentEconomicsEngine(data);
  const distributionEconomics = calculateDistributionEconomicsEngine(data);
  const oncology = calculateSpecialtyOncologyEngine(data);
  const prescriptionTechnology = calculatePrescriptionTechnologyEngine(data);
  const biopharmaServices = calculateBiopharmaServicesEngine(data);
  const workingCapital = calculateWorkingCapitalEngine(data);
  const marginBridge = calculateMarginBridgeEngine(data);
  const buyback = calculateBuybackEngine(data);
  const capitalAllocation = calculateCapitalAllocationEngine(data);
  const valuation = calculateMckValuationEngine(data);
  const scenarios = calculateMckScenarioEngine(data);
  const risks = calculateRiskEngine(data);
  const peers = calculatePeerComparisonEngine(data);
  const earningsCall = calculateEarningsCallEngine(data);
  const validationWarnings = [...validateMckDataset(data), ...valuation.warnings];
  const dashboard: MckDashboardDataset = {
    summary: calculateMckSummary(data, data.assumptions),
    segmentEconomics,
    distributionEconomics,
    workingCapital,
    marginBridge,
    buyback,
    capitalAllocation,
    valuation,
    scenarios,
    risks,
    peers,
    thesis: [
      {
        title: "Scale distributor with irreplaceable infrastructure",
        evidence: "FY2026 North American Pharmaceutical revenue was $336.7B with $3.5B adjusted operating profit.",
        metric: `${distributionEconomics.segment.marginBps.toFixed(0)} bps margin`,
        riskFlag: "Customer concentration and reimbursement pressure.",
        signal: "Positive",
        badge: "Actual",
      },
      {
        title: "Specialty / oncology growth engine",
        evidence: oncology.contribution,
        metric: `${((oncology.segment?.adjustedOperatingProfitGrowth ?? 0) * 100).toFixed(0)}% profit growth`,
        riskFlag: "Organic/acquired split must be monitored.",
        signal: "Positive",
        badge: "Actual",
      },
      {
        title: "Strong FCF conversion over cycle",
        evidence: "FY2026 reported FCF was $5.4B; normalized FCF is separately tracked to control working-capital noise.",
        metric: `${(workingCapital.normalizedFcfConversion * 100).toFixed(0)}% normalized conversion`,
        riskFlag: "Do not annualize a single cash-flow quarter.",
        signal: "Positive",
        badge: "Derived",
      },
      {
        title: "Buyback-driven EPS compounding",
        evidence: "FY2026 cash returned to shareholders included $4.8B of repurchases and $381M dividends.",
        metric: `${(buyback.buybackYield * 100).toFixed(1)}% buyback yield`,
        riskFlag: "Repurchase ROIC falls when average buyback price rises.",
        signal: buyback.valueCreationSignal,
        badge: "Derived",
      },
      {
        title: "Valuation is bps and terminal multiple sensitive",
        evidence: "10 bps on distribution margin moves after-tax profit materially because revenue is enormous.",
        metric: `$${distributionEconomics.marginSensitivity.find((row) => row.bpsChange === 10)?.epsImpact.toFixed(2)} EPS / +10 bps`,
        riskFlag: "Margin compression can offset revenue growth.",
        signal: "Needs Review",
        badge: "Derived",
      },
    ],
    oncology,
    prescriptionTechnology,
    biopharmaServices,
    earningsCall,
    memo: {
      whatHappened:
        "McKesson delivered FY2026 revenue of $403.4B, adjusted EPS of $39.11, FCF of $5.4B, and FY2027 adjusted EPS guidance of $43.80 to $44.60.",
      whatMatters:
        "The key issue is not revenue growth alone; it is whether oncology/RxTS profit growth, working-capital discipline and buybacks can lift FCF per share.",
      whatMarketMayBeMissing:
        "The market may underwrite MCK as a low-margin distributor and miss the higher-quality oncology, biopharma service, and Rx technology profit pools.",
      whatCanGoWrong:
        "PBM/reimbursement pressure, customer concentration, opioid/legal shocks, generic deflation, GLP-1 mix dilution, and working-capital reversals can break the thesis.",
      attractivePrice:
        `Base blended fair value is about $${valuation.blendedFairValue.toFixed(0)}. A 15% margin of safety would imply an attractive entry around $${(valuation.blendedFairValue * 0.85).toFixed(0)}.`,
      monitorNextQuarter: [
        "Oncology & Multispecialty organic versus acquired growth.",
        "North American Pharmaceutical margin bps and customer-volume mix.",
        "Reported FCF versus normalized FCF and inventory/payable timing.",
        "Average buyback execution price versus fair value.",
        "RxTS access-solution demand and reimbursement commentary.",
      ],
    },
    warnings: validationWarnings,
  };
  return {
    ...dashboard,
    dataStatus: buildDataStatus(data, validationWarnings),
    readThrough: buildInvestmentReadThrough(dashboard),
  };
}

export function calculateMckValuation(
  dataInput: unknown,
  assumptions?: Partial<MckResearchAssumptions>,
  scenario: Scenario = "Base",
): ValuationResult {
  const scenarioAssumptions = mckScenarioPresets[scenario] ?? {};
  const data = withAssumptions(resolveMckDataset(dataInput), { ...scenarioAssumptions, ...(assumptions ?? {}) });
  const valuation = calculateMckValuationEngine(data);
  const scenarios = calculateMckScenarioEngine(data);
  const selected = scenarios.find((row) => row.scenario === scenario) ?? scenarios[1] ?? scenarios[0];
  return {
    currentPrice: data.assumptions.currentPrice,
    priceDate: data.market.priceDate,
    validationWarnings: valuation.warnings,
    warning: valuation.warnings.find((warning) => warning.severity === "high")?.detail,
    fairValues: scenarios.map((row) => ({
      scenario: row.scenario,
      fairValue: row.fairValue,
      targetPrice3Y: row.targetPrice3Y,
      cumulativeDividends: data.assumptions.currentPrice * data.market.dividendYield * 3,
      upsideDownside: row.upsideDownside,
      expectedReturn3Y: row.irr3Y,
      summary: row.summary,
    })),
    methodCards: [
      { key: "pe", label: "P/E Fair Value", value: valuation.peFairValue, format: "currency", description: "FY2027 adjusted EPS guidance midpoint times target P/E." },
      { key: "fcf-yield", label: "FCF Yield Fair Value", value: valuation.fcfYieldFairValue, format: "currency", description: "FCF/share capitalized at target FCF yield." },
      { key: "dcf", label: "Owner Earnings DCF", value: valuation.dcfFairValue, format: "currency", description: "Normalized owner earnings DCF with working-capital adjustment and net debt deduction." },
      { key: "sotp", label: "SOTP Fair Value", value: valuation.sotpFairValue, format: "currency", description: "Segment multiple value for distribution, oncology, RxTS and Med-Surg minus corporate cost and net debt." },
      { key: "blended", label: "Blended Fair Value", value: valuation.blendedFairValue, format: "currency", description: "Weighted average of P/E, FCF yield, DCF and SOTP." },
      { key: "mos", label: "Margin of Safety", value: valuation.marginOfSafety, format: "percent", description: "Blended fair value versus current price." },
    ],
    expectedReturnBridge: [
      { key: "eps-cagr", label: "EPS CAGR", value: data.assumptions.epsCagr3Y, format: "percent", description: "Operating growth plus buyback-driven per-share accretion." },
      { key: "dividend", label: "Dividend Yield", value: data.market.dividendYield, format: "percent", description: "Current cash dividend yield." },
      { key: "buyback", label: "Buyback Yield", value: calculateBuybackEngine(data).buybackYield, format: "percent", description: "Repurchase dollars over market equity value; embedded in EPS path." },
      { key: "multiple", label: "Exit Multiple Effect", value: (data.assumptions.exitPe / data.assumptions.targetPe) ** (1 / 3) - 1, format: "percent", description: "Annualized P/E change from target P/E to exit P/E." },
    ],
    sensitivityTables: [
      {
        title: "Forward EPS x P/E",
        table: buildSensitivityTable(
          "P/E",
          "EPS",
          [data.assumptions.targetPe - 2, data.assumptions.targetPe - 1, data.assumptions.targetPe, data.assumptions.targetPe + 1, data.assumptions.targetPe + 2],
          [data.assumptions.forwardAdjustedEps * 0.9, data.assumptions.forwardAdjustedEps * 0.95, data.assumptions.forwardAdjustedEps, data.assumptions.forwardAdjustedEps * 1.05, data.assumptions.forwardAdjustedEps * 1.1],
          (pe, eps) => pe * eps,
        ),
      },
      {
        title: "FCF Yield x FCF / Share",
        table: buildSensitivityTable(
          "FCF Yield",
          "FCF / Share",
          [data.assumptions.targetFcfYield - 0.01, data.assumptions.targetFcfYield - 0.005, data.assumptions.targetFcfYield, data.assumptions.targetFcfYield + 0.005, data.assumptions.targetFcfYield + 0.01],
          [data.assumptions.fcfPerShare * 0.9, data.assumptions.fcfPerShare * 0.95, data.assumptions.fcfPerShare, data.assumptions.fcfPerShare * 1.05, data.assumptions.fcfPerShare * 1.1],
          (yieldRate, fcfPerShare) => safeDivide(fcfPerShare, yieldRate),
        ),
      },
      {
        title: "Margin bps x Current Price",
        table: buildSensitivityTable(
          "Margin bps",
          "Entry Price",
          [-20, -10, 0, 10, 20],
          [data.assumptions.currentPrice * 0.85, data.assumptions.currentPrice * 0.95, data.assumptions.currentPrice, data.assumptions.currentPrice * 1.05, data.assumptions.currentPrice * 1.15],
          (bps, entryPrice) => computeUpsideDownside(valuation.blendedFairValue + bps * 1.8, entryPrice),
        ),
      },
    ],
    peFairValue: valuation.peFairValue,
    fcfFairValue: valuation.fcfYieldFairValue,
    dcfValue: valuation.dcfFairValue,
    sotpFairValue: valuation.sotpFairValue,
    blendedFairValue: valuation.blendedFairValue,
    valuationRangeLow: valuation.valuationRangeLow,
    valuationRangeBase: valuation.blendedFairValue,
    valuationRangeHigh: valuation.valuationRangeHigh,
    recommendedFairValue: valuation.blendedFairValue,
    recommendedFairValueMethod: "P/E / FCF yield / owner-earnings DCF / segment SOTP blend",
    recommendedFairValueReason: "MCK is a low-margin, high-turnover, FCF-and-buyback compounder, so no single P/E multiple is allowed to drive the answer.",
    targetPrice3Y: selected.targetPrice3Y,
    expectedReturn3Y: selected.irr3Y,
    upsideDownside: computeUpsideDownside(valuation.blendedFairValue, data.assumptions.currentPrice),
  };
}
