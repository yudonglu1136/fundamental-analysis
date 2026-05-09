import type { DashboardInterpretation, DataStatus, Scenario, Signal, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { safeDivide } from "../../utils/financialMath";
import { buildPriceValidationWarnings, computeExpectedShareholderCagr, computeUpsideDownside, getCanonicalCurrentPrice } from "../../utils/valuation";
import { calculateMarginDurabilityEngine } from "./marginDurabilityEngine";
import { calculateMoatEngine } from "./moatEngine";
import { calculatePlatformGraphEngine } from "./platformGraphEngine";
import { calculatePostTradeEngine } from "./postTradeEngine";
import { calculateRecurringRevenueEngine } from "./recurringRevenueEngine";
import { calculateRoicEngine } from "./roicEngine";
import { lsegMockData, type LsegRawData } from "./data";
import { calculateSynergyEngine } from "./synergyEngine";

export type LsegDataset = LsegRawData;
export type LsegValuationAssumptions = {
  currentPrice: number;
  forwardAdjustedEps: number;
  equityFcfPerShare: number;
  targetFcfYield: number;
  recurringRevenueGrowth: number;
  structuralMarginExpansionBps: number;
  workflowLockInScore: number;
  pricingPowerScore: number;
  recurringRevenueQualityScore: number;
  postTradeMoatScore: number;
  platformRoic: number;
  wacc: number;
  terminalGrowth: number;
  targetPe: number;
  exitPe: number;
  dividendYield: number;
};

export const defaultLsegValuationAssumptions: LsegValuationAssumptions = {
  currentPrice: getCanonicalCurrentPrice("LSEG", 107.8),
  forwardAdjustedEps: 4.73,
  equityFcfPerShare: 4.58,
  targetFcfYield: 0.04,
  recurringRevenueGrowth: 0.07,
  structuralMarginExpansionBps: 70,
  workflowLockInScore: 74,
  pricingPowerScore: 68,
  recurringRevenueQualityScore: 80,
  postTradeMoatScore: 79,
  platformRoic: 0.188,
  wacc: 0.08,
  terminalGrowth: 0.025,
  targetPe: 25,
  exitPe: 24,
  dividendYield: 0.012,
};

export const lsegScenarioPresets: Record<Scenario, LsegValuationAssumptions> = {
  Bear: {
    ...defaultLsegValuationAssumptions,
    currentPrice: 107.8,
    forwardAdjustedEps: 4.45,
    equityFcfPerShare: 4.2,
    targetFcfYield: 0.048,
    recurringRevenueGrowth: 0.05,
    structuralMarginExpansionBps: 30,
    workflowLockInScore: 67,
    pricingPowerScore: 60,
    recurringRevenueQualityScore: 73,
    postTradeMoatScore: 72,
    platformRoic: 0.17,
    wacc: 0.085,
    terminalGrowth: 0.02,
    targetPe: 21,
    exitPe: 21,
  },
  Base: {
    ...defaultLsegValuationAssumptions,
  },
  Bull: {
    ...defaultLsegValuationAssumptions,
    currentPrice: 107.8,
    forwardAdjustedEps: 5.1,
    equityFcfPerShare: 5,
    targetFcfYield: 0.036,
    recurringRevenueGrowth: 0.085,
    structuralMarginExpansionBps: 95,
    workflowLockInScore: 82,
    pricingPowerScore: 75,
    recurringRevenueQualityScore: 86,
    postTradeMoatScore: 85,
    platformRoic: 0.208,
    wacc: 0.075,
    terminalGrowth: 0.03,
    targetPe: 27,
    exitPe: 26,
  },
};

type PeriodRecord = LsegDataset["periods"][number];

function metric(label: string, value: number, delta: number | undefined, format: SummaryMetric["format"], description: string, badge: SummaryMetric["badge"]): SummaryMetric {
  return { key: label.toLowerCase().replace(/\s+/g, "-"), label, value, delta, format, description, badge };
}

function getPeriod(data: LsegDataset, periodId: string): PeriodRecord {
  return data.periods.find((period) => period.id === periodId) ?? data.periods[data.periods.length - 1];
}

function getComparablePeriods(data: LsegDataset, periodId: string) {
  const current = getPeriod(data, periodId);
  return data.periods
    .filter((period) => period.periodType === current.periodType)
    .sort((a, b) => a.fiscalYear - b.fiscalYear || a.label.localeCompare(b.label));
}

function getPriorComparablePeriod(data: LsegDataset, periodId: string) {
  const periods = getComparablePeriods(data, periodId);
  const index = periods.findIndex((period) => period.id === periodId);
  return index > 0 ? periods[index - 1] : periods[0];
}

function getDefaultLsegPeriodId(data: LsegDataset = lsegMockData) {
  return (
    data.periods.find((period) => period.id === "fy25")?.id ??
    data.periods.find((period) => period.periodType === "FY")?.id ??
    data.periods[data.periods.length - 1]?.id ??
    ""
  );
}

export function getDefaultLsegPeriod() {
  return getDefaultLsegPeriodId(lsegMockData);
}

function buildEnginePack(data: LsegDataset, periodId: string, scenario: Scenario) {
  const scenarioAssumptions = lsegScenarioPresets[scenario];
  const platformGraph = calculatePlatformGraphEngine(data, periodId, scenario, {
    workflowLockInScore: scenarioAssumptions.workflowLockInScore,
    pricingPowerScore: scenarioAssumptions.pricingPowerScore,
    postTradeMoatScore: scenarioAssumptions.postTradeMoatScore,
  });
  const postTrade = calculatePostTradeEngine(data, periodId, scenario);
  const recurringRevenue = calculateRecurringRevenueEngine(data, periodId, {
    workflowLockInScore: platformGraph.current.workflowLockInScore,
    pricingPowerScore: platformGraph.current.pricingPowerScore,
    postTradeMoatScore: postTrade.current.postTradeMoatScore,
    graphDensity: platformGraph.current.graphDensity,
    switchingCostScore: platformGraph.current.switchingCostScore,
  });
  const marginDurability = calculateMarginDurabilityEngine(data, periodId, {
    recurringRevenueQualityScore: recurringRevenue.current.recurringRevenueQualityScore,
    pricingPowerScore: platformGraph.current.pricingPowerScore,
    postTradeMoatScore: postTrade.current.postTradeMoatScore,
    graphDensity: platformGraph.current.graphDensity,
    switchingCostScore: platformGraph.current.switchingCostScore,
  });
  const roic = calculateRoicEngine(data, periodId, {
    recurringRevenueQualityScore: recurringRevenue.current.recurringRevenueQualityScore,
    workflowLockInScore: platformGraph.current.workflowLockInScore,
    pricingPowerScore: platformGraph.current.pricingPowerScore,
    postTradeMoatScore: postTrade.current.postTradeMoatScore,
    structuralMarginExpansionScore: marginDurability.current.structuralMarginExpansionScore,
    platformRoicAnchor: scenarioAssumptions.platformRoic,
  });
  const synergy = calculateSynergyEngine(data, periodId, {
    workflowLockInScore: platformGraph.current.workflowLockInScore,
    postTradeMoatScore: postTrade.current.postTradeMoatScore,
    structuralMarginExpansionScore: marginDurability.current.structuralMarginExpansionScore,
    totalIncome: getPeriod(data, periodId).totalIncome,
  });
  const moat = calculateMoatEngine({
    workflowLockInScore: platformGraph.current.workflowLockInScore,
    recurringRevenueQualityScore: recurringRevenue.current.recurringRevenueQualityScore,
    postTradeMoatScore: postTrade.current.postTradeMoatScore,
    structuralMarginExpansionScore: marginDurability.current.structuralMarginExpansionScore,
    moatCompoundingScore: roic.current.moatCompoundingScore,
    costSynergyExhaustionRisk: synergy.current.costSynergyExhaustionRisk,
    pricingPowerScore: platformGraph.current.pricingPowerScore,
  });

  return { platformGraph, recurringRevenue, marginDurability, postTrade, roic, synergy, moat };
}

export function getLsegPeriods() {
  return lsegMockData.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function calculateLsegSummary(data: LsegDataset, periodId: string): SummaryMetric[] {
  const period = getPeriod(data, periodId);
  const prior = getPriorComparablePeriod(data, periodId);
  const engines = buildEnginePack(data, periodId, "Base");

  return [
    metric("Forward Adjusted EPS", period.forwardAdjustedEps, period.forwardAdjustedEps - prior.forwardAdjustedEps, "currency", "Still a useful earnings anchor, but no longer the center of the LSEG case.", "Actual"),
    metric("Workflow Lock-In Score", engines.platformGraph.current.workflowLockInScore, engines.platformGraph.current.workflowLockInScore - engines.platformGraph.series[Math.max(0, engines.platformGraph.series.length - 2)]?.workflowLockInScore, "number", "Measures how deeply LSEG is embedded across client workflows and how hard it is to replace.", "Derived"),
    metric("Recurring Revenue Quality", engines.recurringRevenue.current.recurringRevenueQualityScore, engines.recurringRevenue.current.recurringRevenueQualityScore - engines.recurringRevenue.series[Math.max(0, engines.recurringRevenue.series.length - 2)]?.recurringRevenueQualityScore, "number", "Retention, pricing, subscription mix, and contract duration rolled into one durability score.", "Derived"),
    metric("Structural Margin Score", engines.marginDurability.current.structuralMarginExpansionScore, engines.marginDurability.current.structuralMarginExpansionScore - engines.marginDurability.series[Math.max(0, engines.marginDurability.series.length - 2)]?.structuralMarginExpansionScore, "number", "Distinguishes durable operating leverage from temporary integration savings.", "Derived"),
    metric("Post Trade Moat Score", engines.postTrade.current.postTradeMoatScore, engines.postTrade.series[Math.max(0, engines.postTrade.series.length - 1)]?.postTradeMoatScore - engines.postTrade.series[Math.max(0, engines.postTrade.series.length - 2)]?.postTradeMoatScore, "number", "Clearing density, collateral utility, member stickiness, and regulatory barriers.", "Derived"),
    metric("Blended Platform ROIC", engines.roic.current.blendedPlatformRoic, engines.roic.series[Math.max(0, engines.roic.series.length - 1)]?.blendedPlatformRoic - engines.roic.series[Math.max(0, engines.roic.series.length - 2)]?.blendedPlatformRoic, "percent", "Incremental after-tax operating profit divided by incremental invested capital across workflow, clearing, and synergy engines.", "Derived"),
    metric("Base Fair Value", period.fairValueBase, period.fairValueBase - prior.fairValueBase, "currency", "Blended fair value from independent P/E, FCF, DCF, and SOTP methods.", "Derived"),
    metric("Moat Compounding Score", engines.moat.overallScore, engines.moat.overallScore - 2, "number", "Tests whether LSEG is getting structurally harder to displace over time.", "Derived"),
  ];
}

function buildSotp(
  data: LsegDataset,
  periodId: string,
  scenario: Scenario,
  assumptions: LsegValuationAssumptions,
  engines: ReturnType<typeof buildEnginePack>,
) {
  const period = getPeriod(data, periodId);
  const segmentRows = data.segmentFinancials.filter((row) => row.periodId === periodId);
  const annualizationFactor = period.periodType === "FY" ? 1 : period.periodType === "HY" ? 2 : 4;
  const valuationCase = data.valuationCases.find((row) => row.scenario === scenario) ?? data.valuationCases[1];

  const components = segmentRows.map((row) => {
    const economics = buildSegmentEconomics(data, periodId, row, engines);
    const baseMultiple = valuationCase.segmentMultiples[row.segment as keyof typeof valuationCase.segmentMultiples] ?? 8;
    const quality =
      economics.recurringRevenuePct * 0.18 +
      economics.retention * 0.14 +
      economics.pricingPower * 0.14 +
      economics.switchingCostScore * 0.12 +
      economics.workflowPenetration * 0.1 +
      clampUnit(1 - economics.capitalIntensity / 0.16) * 0.1 +
      clampUnit(economics.incrementalRoic / 0.24) * 0.12 +
      clampUnit(economics.growth / 0.12) * 0.05 +
      clampUnit(economics.fcfConversion) * 0.05;
    const targetMultiple = baseMultiple * (0.84 + quality * 0.34);
    const annualOperatingProfit = row.operatingProfit * annualizationFactor;
    return {
      segment: row.segment,
      revenue: row.revenue * annualizationFactor,
      ebit: annualOperatingProfit,
      ebitMargin: row.margin,
      recurringRevenueQuality: economics.recurringRevenuePct,
      retention: economics.retention,
      pricingPower: economics.pricingPower,
      switchingCostScore: economics.switchingCostScore,
      workflowPenetration: economics.workflowPenetration,
      capitalIntensity: economics.capitalIntensity,
      growth: economics.growth,
      roic: economics.incrementalRoic,
      fcfConversion: economics.fcfConversion,
      targetMultiple,
      fairValueContribution: annualOperatingProfit * targetMultiple,
    };
  });

  const enterpriseValue = components.reduce((sum, row) => sum + row.fairValueContribution, 0);
  const equityValue = enterpriseValue - valuationCase.netDebt;
  const fairValuePerShare = safeDivide(equityValue, Math.max(period.weightedAverageShares, 1));

  return {
    components,
    fairValuePerShare,
    overlay: "Each segment multiple is derived from its own recurring quality, retention, pricing power, switching costs, workflow depth, capital intensity, ROIC, growth, and FCF conversion.",
    overlapRisk:
      components.some((component) => component.segment === "Post Trade" && component.targetMultiple > (valuationCase.segmentMultiples["Post Trade"] ?? 15) * 1.08) &&
      assumptions.postTradeMoatScore > 80,
  };
}

function buildScenarioAssumptions(
  data: LsegDataset,
  periodId: string,
  scenario: Scenario,
  overrides?: Partial<LsegValuationAssumptions>,
) {
  const period = getPeriod(data, periodId);
  const preset = lsegScenarioPresets[scenario];
  return {
    ...preset,
    currentPrice: preset.currentPrice || getCanonicalCurrentPrice("LSEG", period.currentPrice),
    ...overrides,
  };
}

function buildEffectiveDriverSet(
  assumptions: LsegValuationAssumptions,
  engines: ReturnType<typeof buildEnginePack>,
) {
  return {
    workflowLockInScore:
      (assumptions.workflowLockInScore * 0.38) +
      (engines.platformGraph.current.workflowLockInScore * 0.42) +
      (engines.platformGraph.current.switchingCostScore * 0.12) +
      (engines.platformGraph.current.graphDensity * 100 * 0.08),
    pricingPowerScore: (assumptions.pricingPowerScore * 0.4) + (engines.platformGraph.current.pricingPowerScore * 0.38) + (engines.postTrade.current.pricingPowerScore * 100 * 0.22),
    recurringRevenueQualityScore:
      (assumptions.recurringRevenueQualityScore * 0.38) +
      (engines.recurringRevenue.current.recurringRevenueQualityScore * 0.44) +
      (engines.platformGraph.current.switchingCostScore * 0.1) +
      (engines.platformGraph.current.graphDensity * 100 * 0.08),
    postTradeMoatScore: (assumptions.postTradeMoatScore * 0.4) + (engines.postTrade.current.postTradeMoatScore * 0.6),
    platformRoic: (assumptions.platformRoic * 0.5) + (engines.roic.current.blendedPlatformRoic * 0.5),
    structuralMarginExpansionBps:
      (assumptions.structuralMarginExpansionBps * 0.42) +
      (engines.marginDurability.current.structuralMarginExpansionScore / 100) * 90 * 0.46 +
      (engines.platformGraph.current.switchingCostScore / 100) * 8 +
      engines.platformGraph.current.graphDensity * 6,
  };
}

function buildDerivedEpsBridge(data: LsegDataset, periodId: string) {
  const period = getPeriod(data, periodId);
  const prior = getPriorComparablePeriod(data, periodId);
  const epsQuality =
    data.epsQuality.find((row) => row.periodId === periodId) ??
    data.epsQuality[data.epsQuality.length - 1];
  const totalDelta = period.forwardAdjustedEps - prior.forwardAdjustedEps;
  const operating = totalDelta * epsQuality.operatingPct;
  const synergy = totalDelta * epsQuality.synergyContribution;
  const postTrade = totalDelta * epsQuality.postTradeContribution;
  const buybacks = totalDelta * epsQuality.buybackPct;
  const belowLine = period.forwardAdjustedEps - prior.forwardAdjustedEps - operating - synergy - postTrade - buybacks;
  return [
    { periodId, label: "Prior Year EPS", value: prior.forwardAdjustedEps, type: "start" as const },
    { periodId, label: "Core Operating Growth", value: operating, type: "change" as const },
    { periodId, label: "Revenue Synergy / Workflow Mix", value: synergy, type: "change" as const },
    { periodId, label: "Post Trade Economics", value: postTrade, type: "change" as const },
    { periodId, label: "Buybacks", value: buybacks, type: "change" as const },
    { periodId, label: "Tax / Interest / NCI", value: belowLine, type: "change" as const },
    { periodId, label: "Current Year EPS", value: period.forwardAdjustedEps, type: "end" as const },
  ];
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function buildSegmentEconomics(
  data: LsegDataset,
  periodId: string,
  row: LsegDataset["segmentFinancials"][number],
  engines: ReturnType<typeof buildEnginePack>,
) {
  const recurring = data.recurringRevenueMetrics.find((metric) => metric.periodId === periodId) ?? data.recurringRevenueMetrics[data.recurringRevenueMetrics.length - 1];
  const subscription = data.subscriptionMetrics.find((metric) => metric.periodId === periodId && metric.segment === row.segment);
  const fcf = data.fcfMetrics.find((metric) => metric.periodId === periodId) ?? data.fcfMetrics[data.fcfMetrics.length - 1];
  const workflow = engines.platformGraph.current;
  const postTrade = engines.postTrade.current;
  const roic = engines.roic.current;

  if (row.segment === "Data & Analytics") {
    return {
      recurringRevenuePct: 0.82,
      retention: subscription?.retentionRate ?? recurring.grossRetention,
      pricingPower: clampUnit(((workflow.pricingPowerScore * 0.94) + ((subscription?.workspaceGrowth ?? 0.02) * 2600)) / 100),
      switchingCostScore: clampUnit((workflow.switchingCostScore * 0.96) / 100),
      workflowPenetration: clampUnit((workflow.workflowLockInScore * 0.95) / 100),
      capitalIntensity: fcf.capexIntensity * 0.82,
      incrementalRoic: roic.workflowRoic,
      growth: Math.max(row.growthRate, subscription?.subscriptionRevenueGrowth ?? row.growthRate),
      fcfConversion: clampUnit(recurring.recurringFcfConversion * 0.95),
    };
  }
  if (row.segment === "FTSE Russell") {
    return {
      recurringRevenuePct: 0.91,
      retention: subscription?.retentionRate ?? 0.97,
      pricingPower: clampUnit(((workflow.pricingPowerScore * 0.88) + ((subscription?.indexRevenueGrowth ?? 0.08) * 3200)) / 100),
      switchingCostScore: clampUnit((workflow.switchingCostScore * 0.9) / 100),
      workflowPenetration: clampUnit((workflow.workflowLockInScore * 0.78) / 100),
      capitalIntensity: fcf.capexIntensity * 0.45,
      incrementalRoic: roic.revenueSynergyRoic,
      growth: Math.max(row.growthRate, subscription?.indexRevenueGrowth ?? row.growthRate),
      fcfConversion: clampUnit(recurring.recurringFcfConversion * 1.02),
    };
  }
  if (row.segment === "Risk Intelligence") {
    return {
      recurringRevenuePct: 0.86,
      retention: subscription?.retentionRate ?? recurring.grossRetention,
      pricingPower: clampUnit(((workflow.pricingPowerScore * 0.9) + ((subscription?.asvGrowth ?? 0.06) * 1800)) / 100),
      switchingCostScore: clampUnit((workflow.switchingCostScore * 1.02) / 100),
      workflowPenetration: clampUnit((workflow.workflowLockInScore * 0.88) / 100),
      capitalIntensity: fcf.capexIntensity * 0.72,
      incrementalRoic: roic.workflowRoic,
      growth: Math.max(row.growthRate, subscription?.subscriptionRevenueGrowth ?? row.growthRate),
      fcfConversion: clampUnit(recurring.recurringFcfConversion * 0.92),
    };
  }
  if (row.segment === "Capital Markets") {
    return {
      recurringRevenuePct: 0.44,
      retention: 0.9,
      pricingPower: clampUnit((workflow.pricingPowerScore * 0.72) / 100),
      switchingCostScore: clampUnit((workflow.switchingCostScore * 0.7) / 100),
      workflowPenetration: clampUnit((workflow.workflowLockInScore * 0.66) / 100),
      capitalIntensity: fcf.capexIntensity * 1.12,
      incrementalRoic: (roic.revenueSynergyRoic + roic.workflowRoic) / 2,
      growth: row.growthRate,
      fcfConversion: clampUnit(recurring.recurringFcfConversion * 0.78),
    };
  }
  if (row.segment === "Post Trade") {
    return {
      recurringRevenuePct: 0.68,
      retention: 0.975,
      pricingPower: clampUnit(postTrade.pricingPowerScore),
      switchingCostScore: clampUnit((((workflow.switchingCostScore / 100) * 0.45) + (postTrade.memberStickiness * 0.55))),
      workflowPenetration: clampUnit((((workflow.workflowLockInScore / 100) * 0.35) + (postTrade.memberNetworkDensity * 0.65))),
      capitalIntensity: fcf.capexIntensity * 0.96,
      incrementalRoic: roic.clearingRoic,
      growth: Math.max(row.growthRate, postTrade.scenarioClearedVolumeGrowth),
      fcfConversion: clampUnit(recurring.recurringFcfConversion * 1.04),
    };
  }
  return {
    recurringRevenuePct: 0.2,
    retention: 0.82,
    pricingPower: 0.22,
    switchingCostScore: 0.22,
    workflowPenetration: 0.18,
    capitalIntensity: fcf.capexIntensity * 1.18,
    incrementalRoic: 0.06,
    growth: row.growthRate,
    fcfConversion: 0.45,
  };
}

function buildValuationWarnings(
  period: PeriodRecord,
  assumptions: LsegValuationAssumptions,
  engines: ReturnType<typeof buildEnginePack>,
  sotp: ReturnType<typeof buildSotp>,
) {
  const warnings: ValidationWarning[] = [...buildPriceValidationWarnings("LSEG", assumptions.currentPrice, "2026-05-09")];

  if (sotp.overlapRisk) {
    warnings.push({
      id: "lseg-sotp-overlap",
      title: "Potential SOTP overlap risk",
      detail: "Post Trade moat and workflow premium already lift segment multiples, so avoid layering another standalone moat uplift on top.",
      severity: "medium",
    });
  }
  if (
    engines.postTrade.current.postTradeMoatScore > 76 &&
    assumptions.postTradeMoatScore > 78 &&
    assumptions.targetFcfYield < 0.041 &&
    assumptions.targetPe > 24
  ) {
    warnings.push({
      id: "lseg-double-counted-post-trade",
      title: "Post Trade economics may be capitalized more than once",
      detail: "Clearing moat already supports recurring cash flow and SOTP multiples, so pairing a low FCF yield with a high earnings multiple needs extra scrutiny.",
      severity: "high",
    });
  }
  if (assumptions.structuralMarginExpansionBps / 10000 > engines.marginDurability.current.structuralOperatingLeverage + engines.marginDurability.current.recurringMixShift + engines.marginDurability.current.pricingPower + engines.marginDurability.current.platformEconomics + engines.marginDurability.current.clearingOperatingLeverage + 0.002) {
    warnings.push({
      id: "lseg-margin-driver-gap",
      title: "Margin expansion may exceed structural support",
      detail: "Assumed margin expansion is running ahead of recurring mix, pricing power, and platform leverage evidence.",
      severity: "high",
    });
  }
  if (engines.recurringRevenue.current.grossRetention < 0.95 || engines.recurringRevenue.current.netRetention < 1.035) {
    warnings.push({
      id: "lseg-recurring-deterioration",
      title: "Recurring revenue durability is not fully clean",
      detail: "Retention still looks good, but recurring quality is not strengthening enough to underwrite aggressive moat expansion.",
      severity: "medium",
    });
  }
  if (assumptions.forwardAdjustedEps > period.forwardAdjustedEps && assumptions.platformRoic < 0.17) {
    warnings.push({
      id: "lseg-roic-vs-eps",
      title: "EPS growth may outpace platform ROIC improvement",
      detail: "If EPS is compounding faster than incremental ROIC, value creation may still be more accounting-led than moat-led.",
      severity: "medium",
    });
  }
  if (assumptions.workflowLockInScore > 80 && assumptions.postTradeMoatScore > 80 && assumptions.targetPe > 28) {
    warnings.push({
      id: "lseg-non-independent-valuation",
      title: "Valuation methods may be leaning on the same moat assumptions",
      detail: "Be careful that workflow, clearing, and multiple expansion are not all capitalizing the same strategic improvement twice.",
      severity: "medium",
    });
  }
  if (sotp.components.some((component) => component.targetMultiple > component.roic * 100 && component.recurringRevenueQuality < 0.75)) {
    warnings.push({
      id: "lseg-heuristic-sotp",
      title: "SOTP quality and multiple assumptions may be mismatched",
      detail: "One or more segment multiples still look rich relative to recurring quality and ROIC support.",
      severity: "medium",
    });
  }
  if (Math.abs(assumptions.workflowLockInScore - engines.platformGraph.current.workflowLockInScore) < 1 && Math.abs(assumptions.recurringRevenueQualityScore - engines.recurringRevenue.current.recurringRevenueQualityScore) < 1) {
    warnings.push({
      id: "lseg-moat-not-flowing",
      title: "Moat assumptions may not be flowing independently",
      detail: "Custom moat assumptions appear too similar to current observed engine outputs, which can hide scenario differentiation.",
      severity: "low",
    });
  }

  return warnings;
}
function calculateLsegScenarioCase(
  data: LsegDataset,
  periodId: string,
  scenario: Scenario,
  overrides?: Partial<LsegValuationAssumptions>,
) {
  const period = getPeriod(data, periodId);
  const assumptions = buildScenarioAssumptions(data, periodId, scenario, overrides);
  const engines = buildEnginePack(data, periodId, scenario);
  const effective = buildEffectiveDriverSet(assumptions, engines);
  const currentPrice = assumptions.currentPrice || getCanonicalCurrentPrice("LSEG", period.currentPrice);
  const effectiveRecurringGrowth =
    assumptions.recurringRevenueGrowth +
    (effective.workflowLockInScore - 65) / 2000;
  const effectiveFcfPerShare = assumptions.equityFcfPerShare;
  const peFairValue = assumptions.forwardAdjustedEps * assumptions.targetPe;
  const fcfFairValue = effectiveFcfPerShare / Math.max(assumptions.targetFcfYield, 0.01);
  const annualFcfGrowth =
    effectiveRecurringGrowth * 0.42 +
    (effective.structuralMarginExpansionBps / 10000) * 0.3 +
    (effective.pricingPowerScore / 100) * 0.018 +
    Math.max(effective.platformRoic - 0.12, 0) * 0.12;

  let dcfValue = 0;
  let yearFcf = effectiveFcfPerShare;
  for (let year = 1; year <= 5; year += 1) {
    yearFcf *= 1 + annualFcfGrowth;
    dcfValue += yearFcf / ((1 + assumptions.wacc) ** year);
  }
  const terminalValue = (yearFcf * (1 + assumptions.terminalGrowth)) / Math.max(assumptions.wacc - assumptions.terminalGrowth, 0.01);
  dcfValue += terminalValue / ((1 + assumptions.wacc) ** 5);

  const sotp = buildSotp(
    data,
    periodId,
    scenario,
    {
      ...assumptions,
      workflowLockInScore: effective.workflowLockInScore,
      pricingPowerScore: effective.pricingPowerScore,
      recurringRevenueQualityScore: effective.recurringRevenueQualityScore,
      postTradeMoatScore: effective.postTradeMoatScore,
      platformRoic: effective.platformRoic,
      structuralMarginExpansionBps: effective.structuralMarginExpansionBps,
    },
    engines,
  );
  const blendedFairValue = peFairValue * 0.28 + fcfFairValue * 0.28 + dcfValue * 0.24 + sotp.fairValuePerShare * 0.2;
  const expectedPrice3Y =
    assumptions.forwardAdjustedEps *
    ((1 + effectiveRecurringGrowth + Math.max(effective.platformRoic - 0.12, 0) * 0.2) ** 3) *
    assumptions.exitPe;
  const cumulativeDividends = currentPrice * assumptions.dividendYield * 3;
  const expectedReturn3Y = computeExpectedShareholderCagr(expectedPrice3Y, currentPrice, cumulativeDividends);
  const validationWarnings = buildValuationWarnings(
    period,
    {
      ...assumptions,
      workflowLockInScore: effective.workflowLockInScore,
      pricingPowerScore: effective.pricingPowerScore,
      recurringRevenueQualityScore: effective.recurringRevenueQualityScore,
      postTradeMoatScore: effective.postTradeMoatScore,
      platformRoic: effective.platformRoic,
      structuralMarginExpansionBps: effective.structuralMarginExpansionBps,
    },
    engines,
    sotp,
  );

  return {
    scenario,
    assumptions,
    effective,
    engines,
    sotp,
    peFairValue,
    fcfFairValue,
    dcfValue,
    fairValue: blendedFairValue,
    currentPrice,
    expectedPrice3Y,
    cumulativeDividends,
    expectedReturn3Y,
    annualFcfGrowth,
    validationWarnings,
  };
}

export function calculateLsegValuation(data: LsegDataset, periodId: string, scenario: Scenario, assumptions?: Partial<LsegValuationAssumptions>): ValuationResult {
  const selectedCase = calculateLsegScenarioCase(data, periodId, scenario, assumptions);
  const scenarioCases = (["Bear", "Base", "Bull"] as Scenario[]).map((item) =>
    calculateLsegScenarioCase(data, periodId, item, item === scenario ? assumptions : undefined),
  );
  const scenarioOutputs = scenarioCases.map((caseOutput) => ({
    scenario: caseOutput.scenario,
    fairValue: caseOutput.fairValue,
    targetPrice3Y: caseOutput.expectedPrice3Y,
    cumulativeDividends: caseOutput.cumulativeDividends,
    upsideDownside: computeUpsideDownside(caseOutput.fairValue, caseOutput.currentPrice),
    expectedReturn3Y: caseOutput.expectedReturn3Y,
    summary: caseOutput.scenario === scenario ? "Selected scenario" : undefined,
  }));
  const fairValueSpread =
    Math.max(...scenarioOutputs.map((row) => row.fairValue)) - Math.min(...scenarioOutputs.map((row) => row.fairValue));
  const scenarioWarnings =
    fairValueSpread / Math.max(selectedCase.currentPrice, 1) < 0.08
      ? [
          {
            id: "lseg-scenario-too-similar",
            title: "Scenario outputs are too similar",
            detail: "Bear, Base, and Bull valuation outputs are not differentiating enough, which suggests the scenario drivers are not independent enough yet.",
            severity: "high" as const,
          },
        ]
      : [];
  const validationWarnings = [...selectedCase.validationWarnings, ...scenarioWarnings];

  return {
    warning:
      validationWarnings.length > 0
        ? "Valuation needs care: moat, margin, and platform assumptions should stay independent to avoid double-counting."
        : undefined,
    currentPrice: selectedCase.currentPrice,
    validationWarnings,
    methodCards: [
      { key: "pe-fair", label: "P/E Fair Value", value: selectedCase.peFairValue, format: "currency", description: "Forward adjusted EPS capitalized at a target P/E. This remains independent from SOTP and DCF." },
      { key: "fcf-fair", label: "FCF Yield Fair Value", value: selectedCase.fcfFairValue, format: "currency", description: "FCF per share capitalized at a target FCF yield. Synergies already reflected in cash flow are not re-added." },
      { key: "dcf-fair", label: "DCF Fair Value", value: selectedCase.dcfValue, format: "currency", description: "DCF reflects recurring growth, structural margin, platform ROIC, and post-trade economics only once." },
      { key: "sotp-fair", label: "SOTP Fair Value", value: selectedCase.sotp.fairValuePerShare, format: "currency", description: "True segment-based SOTP from revenue, EBIT, margin, recurring quality, ROIC, and pricing power." },
      { key: "blended-fair", label: "Blended Fair Value", value: selectedCase.fairValue, format: "currency", description: "Independent-method blend without multiplying the same moat economics in every layer." },
      { key: "base-upside", label: "Upside / Downside", value: computeUpsideDownside(selectedCase.fairValue, selectedCase.currentPrice), format: "percent", description: "Fair value versus current price." },
      { key: "expected-cagr", label: "Expected 3Y CAGR", value: selectedCase.expectedReturn3Y, format: "percent", description: "Shareholder CAGR from recurring growth, platform returns, dividends, and exit valuation." },
    ],
    expectedReturnBridge: [
      { key: "recurring-growth", label: "Recurring Growth", value: selectedCase.effective.recurringRevenueQualityScore / 100 * 0.04 + selectedCase.assumptions.recurringRevenueGrowth * 0.6, format: "percent", description: "Revenue durability and recurring compounding." },
      { key: "pricing", label: "Pricing Power", value: (selectedCase.effective.pricingPowerScore - 50) / 850, format: "percent", description: "Incremental pricing realization from deeper workflow lock-in." },
      { key: "margin", label: "Structural Margin", value: selectedCase.effective.structuralMarginExpansionBps / 10000, format: "percent", description: "Margin expansion from mix, digital delivery, and clearing leverage." },
      { key: "dividend", label: "Dividend Yield", value: selectedCase.assumptions.dividendYield, format: "percent", description: "Cash distribution to shareholders." },
      { key: "multiple", label: "Multiple Effect", value: Math.pow(safeDivide(selectedCase.assumptions.exitPe, selectedCase.assumptions.targetPe), 1 / 3) - 1, format: "percent", description: "Valuation multiple expansion or compression." },
    ],
    fairValues: scenarioOutputs,
    customSummary: `${scenario} case is independently recalculated from recurring economics, workflow lock-in, structural margin, post-trade moat, and platform ROIC.`,
    sensitivityTables: [
      {
        title: "Forward P/E x Forward EPS",
        table: buildSensitivityTable("P/E", "Forward EPS", [selectedCase.assumptions.targetPe - 4, selectedCase.assumptions.targetPe - 2, selectedCase.assumptions.targetPe, selectedCase.assumptions.targetPe + 2, selectedCase.assumptions.targetPe + 4], [selectedCase.assumptions.forwardAdjustedEps * 0.92, selectedCase.assumptions.forwardAdjustedEps * 0.96, selectedCase.assumptions.forwardAdjustedEps, selectedCase.assumptions.forwardAdjustedEps * 1.04, selectedCase.assumptions.forwardAdjustedEps * 1.08], (pe, eps) => pe * eps),
      },
      {
        title: "FCF Yield x FCF / Share",
        table: buildSensitivityTable("FCF Yield", "FCF / Share", [selectedCase.assumptions.targetFcfYield - 0.01, selectedCase.assumptions.targetFcfYield - 0.005, selectedCase.assumptions.targetFcfYield, selectedCase.assumptions.targetFcfYield + 0.005, selectedCase.assumptions.targetFcfYield + 0.01], [selectedCase.assumptions.equityFcfPerShare * 0.92, selectedCase.assumptions.equityFcfPerShare * 0.96, selectedCase.assumptions.equityFcfPerShare, selectedCase.assumptions.equityFcfPerShare * 1.04, selectedCase.assumptions.equityFcfPerShare * 1.08], (yieldRate, fcfPerShare) => fcfPerShare / Math.max(yieldRate, 0.01)),
      },
      {
        title: "Recurring Growth x Exit Multiple",
        table: buildSensitivityTable("Recurring Growth", "Exit P/E", [selectedCase.assumptions.recurringRevenueGrowth - 0.02, selectedCase.assumptions.recurringRevenueGrowth - 0.01, selectedCase.assumptions.recurringRevenueGrowth, selectedCase.assumptions.recurringRevenueGrowth + 0.01, selectedCase.assumptions.recurringRevenueGrowth + 0.02], [selectedCase.assumptions.exitPe - 3, selectedCase.assumptions.exitPe - 1, selectedCase.assumptions.exitPe, selectedCase.assumptions.exitPe + 1, selectedCase.assumptions.exitPe + 3], (growth, exit) => (selectedCase.assumptions.forwardAdjustedEps * ((1 + growth) ** 3)) * exit),
      },
      {
        title: "WACC x Terminal Growth DCF",
        table: buildSensitivityTable("WACC", "Terminal Growth", [selectedCase.assumptions.wacc - 0.01, selectedCase.assumptions.wacc - 0.005, selectedCase.assumptions.wacc, selectedCase.assumptions.wacc + 0.005, selectedCase.assumptions.wacc + 0.01], [selectedCase.assumptions.terminalGrowth - 0.01, selectedCase.assumptions.terminalGrowth - 0.005, selectedCase.assumptions.terminalGrowth, selectedCase.assumptions.terminalGrowth + 0.005, selectedCase.assumptions.terminalGrowth + 0.01], (wacc, terminal) => {
          const stableFcf = selectedCase.assumptions.equityFcfPerShare * ((1 + selectedCase.annualFcfGrowth) ** 5);
          const tv = (stableFcf * (1 + terminal)) / Math.max(wacc - terminal, 0.01);
          return tv / ((1 + wacc) ** 5);
        }),
      },
    ],
  };
}

export function buildLsegDashboardData(data: LsegDataset, periodId: string, scenario: Scenario) {
  const period = getPeriod(data, periodId);
  const engines = buildEnginePack(data, periodId, scenario);
  const comparablePeriods = getComparablePeriods(data, periodId);
  const comparableIds = new Set(comparablePeriods.map((row) => row.id));
  const valuation = calculateLsegValuation(data, periodId, scenario);
  const warnings = validateLsegData(data, periodId, engines, valuation.validationWarnings ?? []);

  const readThrough: DashboardInterpretation[] = [
    ...engines.moat.cards,
    {
      title: "Is LSEG becoming more irreplaceable?",
      signal: (engines.moat.overallScore >= 75 ? "Positive" : engines.moat.overallScore >= 62 ? "Inflecting" : "Needs Review") as Signal,
      detail: engines.moat.conclusion,
      badge: "Derived",
    },
  ];

  const dataStatus: DataStatus = {
    sourceType: "mock",
    lastUpdated: period.label,
    missingFields: [],
    validationWarnings: warnings,
    valuationReliable: !(valuation.warning || warnings.some((warning) => warning.severity === "high")),
  };

  const epsBridgeRows = data.epsBridge.filter((row) => row.periodId === periodId);
  const derivedEpsBridge = buildDerivedEpsBridge(data, periodId);
  const epsQuality = data.epsQuality.find((row) => row.periodId === periodId) ?? data.epsQuality[data.epsQuality.length - 1];

  return {
    period,
    priorPeriod: getPriorComparablePeriod(data, periodId),
    summary: calculateLsegSummary(data, periodId),
    dataStatus,
    readThrough,
    segments: data.segmentFinancials.filter((row) => row.periodId === periodId),
    segmentSeries: data.segmentFinancials.filter((row) => comparableIds.has(row.periodId)),
    subscriptions: data.subscriptionMetrics.filter((row) => comparableIds.has(row.periodId)),
    recurringSeries: data.recurringRevenueMetrics.filter((row) => comparableIds.has(row.periodId)),
    epsBridge: epsBridgeRows.length > 0 ? epsBridgeRows : derivedEpsBridge,
    epsQuality,
    fcfSeries: data.fcfMetrics.filter((row) => comparableIds.has(row.periodId)),
    synergies: data.synergyMetrics.filter((row) => comparableIds.has(row.periodId)),
    postTrade: engines.postTrade.scenarioCase,
    peerRows: data.peerMetrics.map((row) => ({
      peer: row.name,
      category: row.category,
      revenueGrowth: row.revenueGrowth,
      ebitdaMargin: row.ebitdaMargin,
      fcfYield: row.fcfYield,
      forwardPe: row.forwardPe,
      subscriptionGrowth: row.subscriptionGrowth,
      indexGrowth: row.indexGrowth,
      clearingTradingGrowth: row.clearingTradingGrowth,
      signal: row.signal,
    })),
    valuation,
    comparablePeriods,
    engines,
    sotp: buildSotp(data, periodId, scenario, defaultLsegValuationAssumptions, engines),
  };
}

export function validateLsegData(
  data: LsegDataset,
  periodId: string,
  engines = buildEnginePack(data, periodId, "Base"),
  valuationWarnings: ValidationWarning[] = [],
): ValidationWarning[] {
  const period = getPeriod(data, periodId);
  const segmentRows = data.segmentFinancials.filter((row) => row.periodId === periodId);
  const revenueSum = segmentRows.reduce((sum, row) => sum + row.revenue, 0);
  const opProfitSum = segmentRows.reduce((sum, row) => sum + row.operatingProfit, 0);
  const warnings: ValidationWarning[] = [];

  if (Math.abs(safeDivide(revenueSum - period.totalIncome, period.totalIncome)) > 0.03) {
    warnings.push({
      id: "lseg-segment-revenue-gap",
      title: "Segment revenue does not reconcile cleanly to group total income",
      detail: "Segment totals should roughly tie back to group total income for the selected period.",
      severity: "medium",
    });
  }
  if (Math.abs(safeDivide(opProfitSum - period.adjustedOperatingProfit, Math.max(period.adjustedOperatingProfit, 1))) > 0.05) {
    warnings.push({
      id: "lseg-segment-op-profit-gap",
      title: "Segment operating profit does not reconcile cleanly to group adjusted operating profit",
      detail: "This can distort SOTP and bridge analysis if not aligned.",
      severity: "medium",
    });
  }
  if (period.epsGrowth > 0.25 || period.organicRevenueGrowth > 0.18) {
    warnings.push({
      id: "lseg-extreme-growth",
      title: "Growth rate looks unusually high",
      detail: "Please confirm whether the selected period or annualization basis is correct.",
      severity: "medium",
    });
  }
  if (engines.synergy.current.costSynergyExhaustionRisk >= 65) {
    warnings.push({
      id: "lseg-cost-synergy-exhaustion",
      title: "Cost synergy exhaustion risk is rising",
      detail: "Future margin expansion could slow if structural drivers do not keep improving.",
      severity: "high",
    });
  }
  if (engines.recurringRevenue.current.recurringRevenueQualityScore < 70) {
    warnings.push({
      id: "lseg-recurring-quality-slip",
      title: "Recurring revenue quality is not strong enough",
      detail: "Durability, retention, or pricing realization may not support a premium platform multiple.",
      severity: "high",
    });
  }
  if (engines.roic.current.blendedPlatformRoic < 0.17 && period.epsGrowth > 0.08) {
    warnings.push({
      id: "lseg-roic-deterioration",
      title: "ROIC is not keeping up with EPS growth",
      detail: "EPS may be improving faster than durable platform returns on capital.",
      severity: "medium",
    });
  }

  return [...warnings, ...valuationWarnings];
}
