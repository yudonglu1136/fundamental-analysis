import type { DashboardInterpretation, DataStatus, Scenario, SummaryMetric, ValidationWarning } from "../types";
import { annualizeQuarterly, safeDivide } from "../../utils/financialMath";
import { checkExtremeGrowthRates, checkImpossibleCagrCombination, checkMissingFields, checkPeSanity, checkSegmentSumConsistency, checkValuationReliability } from "../../utils/validation";
import { metaData, type MetaData, type MetaQuarterRow } from "./data";
import type { MetaAssumptions } from "./assumptions";
import { defaultMetaAssumptions, metaScenarioDefaults } from "./assumptions";
import { calculateMetaValuation } from "./valuation";

export type MetaEvaluatedRow = MetaQuarterRow & {
  adRevenueFromFormula: number;
  adRevenueYoYGrowth: number;
  familyAppsOperatingIncome: number;
  aiAdRevenueUpliftAnnualized: number;
  aiAdOperatingProfitAnnualized: number;
  aiAdAfterTaxOperatingProfitAnnualized: number;
  aiAdRoic: number;
  aiRevenueToCapex: number;
  aiAdjustedFcf: number;
  aiAdjustedFcfMargin: number;
  blendedRoic: number;
  adImpressionsGrowth: number;
  cpmGrowth: number;
  revenueGrowth: number;
  adLoadTrend: number;
};

export type MetaDataset = MetaData & {
  selectedRow: MetaEvaluatedRow;
  latestReferenceDate: string;
};

export type MetaModel = {
  summary: SummaryMetric[];
  dataStatus: DataStatus;
  rows: MetaEvaluatedRow[];
  selectedRow: MetaEvaluatedRow;
  statusBanner: { title: string; detail: string; signal: DashboardInterpretation["signal"] };
  investmentReadThrough: DashboardInterpretation[];
  adRevenueBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  aiAdBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  engagementTrend: Array<{ period: string; timeSpent: number; reelsWatchTime: number; monetizationGap: number; adLoad: number }>;
  capexFcfBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  realityLabsTrend: Array<{ period: string; revenue: number; operatingLoss: number; lossMargin: number }>;
  whatsappTrend: Array<{ period: string; revenue: number; optionalityValue: number }>;
  scenarioLab: {
    phase: { title: string; detail: string; signal: DashboardInterpretation["signal"] };
    aiRevenue: number;
    aiOperatingProfit: number;
    aiRoic: number;
    aiAdjustedFcf: number;
    aiAdjustedFcfMargin: number;
    valuation: ReturnType<typeof calculateMetaValuation>;
  };
  valuation: ReturnType<typeof calculateMetaValuation>;
};

function metric(label: string, value: number, delta: number | undefined, format: SummaryMetric["format"], description: string, badge: SummaryMetric["badge"]): SummaryMetric {
  return { key: label.toLowerCase().replace(/\s+/g, "-"), label, value, delta, format, description, badge };
}

function detectMetaPhase(current: MetaEvaluatedRow, prior: MetaEvaluatedRow, assumptions: MetaAssumptions) {
  const upliftRate = assumptions.aiConversionUplift + assumptions.aiCpmUplift + assumptions.aiEngagementUplift + assumptions.aiCreativeAutomationUplift;
  if (current.aiAdRoic > assumptions.wacc + 0.03 && current.aiAdjustedFcfMargin > prior.aiAdjustedFcfMargin) {
    return { title: "AI ad ROIC expansion phase", detail: "AI returns are clearly above the cost of capital and cash conversion is improving.", signal: "Positive" as const };
  }
  if (current.aiAdRoic > assumptions.wacc + 0.01 && upliftRate > 0.06) {
    return { title: "AI ad efficiency inflecting", detail: "Incremental AI uplift is beginning to translate into better ad economics.", signal: "Inflecting" as const };
  }
  if (assumptions.aiCapexGrowth > assumptions.revenueGrowth && current.fcfMargin < prior.fcfMargin) {
    return { title: "CapEx drag phase", detail: "AI infrastructure growth is outrunning monetization and pressure on FCF is still visible.", signal: "Negative" as const };
  }
  if (current.aiAdjustedFcfMargin > prior.aiAdjustedFcfMargin && current.aiAdRoic > assumptions.wacc) {
    return { title: "FCF recovery phase", detail: "AI economics are beginning to support cash conversion rather than detract from it.", signal: "Positive" as const };
  }
  return { title: "AI investment phase", detail: "Meta is still investing ahead of fully realized AI monetization.", signal: "Neutral" as const };
}

export function validateMetaData(data: MetaDataset, assumptions: MetaAssumptions): ValidationWarning[] {
  const current = data.selectedRow;
  const prior = data.rows[data.rows.length - 2] ?? current;
  const warnings: ValidationWarning[] = [
    ...checkExtremeGrowthRates([
      { label: "Ad revenue growth", value: current.adRevenueGrowth },
      { label: "Ad impressions growth", value: current.adImpressions / Math.max(prior.adImpressions, 1) - 1 },
      { label: "CPM growth", value: current.cpm / Math.max(prior.cpm, 0.01) - 1 },
    ], 0.35),
    ...checkSegmentSumConsistency(current.totalRevenue, [current.familyAppsRevenue, current.realityLabsRevenue], "revenue"),
    ...checkPeSanity(assumptions.forwardEps * assumptions.targetPe, 500, 900, "META"),
    ...checkImpossibleCagrCombination(assumptions.targetPe > 0 ? assumptions.forwardEps * assumptions.targetPe / Math.max(assumptions.currentPrice, 1) - 1 : 0, 0.01),
    ...checkMissingFields([
      { key: "currentPrice", value: assumptions.currentPrice },
      { key: "forwardEps", value: assumptions.forwardEps },
      { key: "fcfPerShare", value: assumptions.fcfPerShare },
      { key: "aiInvestedCapital", value: assumptions.aiInvestedCapital },
    ]).map((field) => ({
      id: `missing-${field}`,
      title: `Missing ${field}`,
      detail: `Critical valuation field "${field}" is missing or blank.`,
      severity: "high" as const,
    })),
  ];
  if (current.aiCapex > current.totalCapex) {
    warnings.push({
      id: "ai-capex-consistency",
      title: "AI CapEx exceeds total CapEx",
      detail: "AI CapEx should be a subset of total CapEx, not larger than the consolidated company number.",
      severity: "high",
    });
  }
  if (assumptions.realityLabsLoss <= 0) {
    warnings.push({
      id: "reality-labs-drag",
      title: "Reality Labs drag may be omitted",
      detail: "Reality Labs is usually a structural drag in the base case and should be reviewed if set to zero or negative.",
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
  return warnings;
}

export function calculateMetaSummary(data: MetaDataset, assumptions: MetaAssumptions): SummaryMetric[] {
  const current = data.selectedRow;
  const prior = data.rows[data.rows.length - 2] ?? current;
  const valuation = calculateMetaValuation(data, assumptions);
  const blendedFairValue = valuation.fairValues.find((row) => row.scenario === "Base")?.fairValue ?? valuation.currentPrice;
  return [
    metric("Revenue", current.totalRevenue, current.totalRevenue - prior.totalRevenue, "currency", "Quarterly revenue base that funds the AI advertising stack.", "Actual"),
    metric("Ad Revenue Growth", current.adRevenueGrowth, current.adRevenueGrowth - prior.adRevenueGrowth, "percent", "Growth in Family of Apps ad revenue.", "Actual"),
    metric("Family Apps Operating Margin", current.familyAppsOperatingMargin, current.familyAppsOperatingMargin - prior.familyAppsOperatingMargin, "percent", "Meta’s core ad operating margin after AI and recommendation effects.", "Derived"),
    metric("Ad Impressions Growth", current.adImpressions / Math.max(prior.adImpressions, 1) - 1, 0, "percent", "Impression growth driven by engagement and ad load.", "Derived"),
    metric("Average Price per Ad Growth", current.avgPricePerAdGrowth, current.avgPricePerAdGrowth - prior.avgPricePerAdGrowth, "percent", "Higher CPM and auction pricing improves monetization quality.", "Derived"),
    metric("CPM Estimate", current.cpm, current.cpm - prior.cpm, "number", "CPM proxy for pricing power and auction quality.", "Actual"),
    metric("AI-driven Revenue Uplift", current.aiAdRevenueUplift, current.aiAdRevenueUplift - prior.aiAdRevenueUplift, "currency", "Incremental AI-driven ad revenue on the current quarter run-rate.", "Derived"),
    metric("CapEx", current.totalCapex, current.totalCapex - prior.totalCapex, "currency", "Total capital spending including AI infrastructure.", "Actual"),
    metric("CapEx / Revenue", current.totalCapex / Math.max(current.totalRevenue, 1), 0, "percent", "Capital intensity relative to revenue.", "Derived"),
    metric("FCF Margin", current.fcfMargin, current.fcfMargin - prior.fcfMargin, "percent", "Free cash flow margin after the AI buildout.", "Actual"),
    metric("Reality Labs Operating Loss", current.realityLabsOperatingLoss, current.realityLabsOperatingLoss - prior.realityLabsOperatingLoss, "currency", "Reality Labs remains a structural drag in the base case.", "Actual"),
    metric("AI Ad ROIC", current.aiAdRoic, current.aiAdRoic - prior.aiAdRoic, "percent", "After-tax AI ad operating profit divided by AI invested capital.", "Derived"),
    metric("Forward EPS", assumptions.forwardEps, assumptions.forwardEps - (prior.totalRevenue / Math.max(prior.sharesOutstanding, 1)) / 4, "currency", "Annual forward EPS valuation anchor.", "Consensus"),
    metric("Blended Fair Value", blendedFairValue, blendedFairValue - valuation.currentPrice, "currency", "Blended valuation across core Ads, FCF, AI uplift, SOTP, and DCF.", "Derived"),
    metric("Upside / Downside", valuation.fairValues.find((row) => row.scenario === "Base")?.upsideDownside ?? 0, 0, "percent", "Blended fair value versus the current price.", "Derived"),
  ];
}

function buildEvaluatedRows(data: MetaDataset, assumptions: MetaAssumptions): MetaEvaluatedRow[] {
  return data.rows.map((row, index) => {
    const prior = data.rows[Math.max(index - 1, 0)] ?? row;
    const annualAdRevenue = annualizeQuarterly(row.adRevenue);
    const upliftRate = assumptions.aiConversionUplift + assumptions.aiCpmUplift + assumptions.aiEngagementUplift + assumptions.aiCreativeAutomationUplift;
    const aiAdRevenueUpliftAnnualized = annualAdRevenue * upliftRate;
    const aiAdOperatingProfitAnnualized = aiAdRevenueUpliftAnnualized * assumptions.incrementalAdMargin - assumptions.aiServingCost - annualizeQuarterly(row.aiAdStackOpex);
    const aiAdAfterTaxOperatingProfitAnnualized = aiAdOperatingProfitAnnualized * (1 - assumptions.taxRate);
    const familyAppsOperatingIncome = row.familyAppsRevenue * row.familyAppsOperatingMargin;
    const aiAdRoic = safeDivide(aiAdAfterTaxOperatingProfitAnnualized, assumptions.aiInvestedCapital);
    const aiRevenueToCapex = safeDivide(aiAdRevenueUpliftAnnualized, assumptions.aiInvestedCapital);
    const aiAdjustedFcf = annualizeQuarterly(row.fcf) + aiAdAfterTaxOperatingProfitAnnualized;
    const aiAdjustedFcfMargin = safeDivide(aiAdjustedFcf, annualizeQuarterly(row.totalRevenue));
    return {
      ...row,
      adRevenueFromFormula: row.adImpressions * row.cpm / 1000,
      adRevenueYoYGrowth: index === 0 ? row.adRevenueGrowth : row.adRevenue / Math.max(prior.adRevenue, 1) - 1,
      familyAppsOperatingIncome,
      aiAdRevenueUpliftAnnualized,
      aiAdOperatingProfitAnnualized,
      aiAdAfterTaxOperatingProfitAnnualized,
      aiAdRoic,
      aiRevenueToCapex,
      aiAdjustedFcf,
      aiAdjustedFcfMargin,
      blendedRoic: safeDivide(familyAppsOperatingIncome + aiAdAfterTaxOperatingProfitAnnualized, row.aiInvestedCapital + row.totalCapex),
      adImpressionsGrowth: index === 0 ? 0 : row.adImpressions / Math.max(prior.adImpressions, 1) - 1,
      cpmGrowth: index === 0 ? 0 : row.cpm / Math.max(prior.cpm, 0.01) - 1,
      revenueGrowth: index === 0 ? 0 : row.totalRevenue / Math.max(prior.totalRevenue, 1) - 1,
      adLoadTrend: index === 0 ? row.adLoad : row.adLoad - prior.adLoad,
    };
  });
}

export function buildMetaDashboardData(data: MetaData = metaData, assumptions: MetaAssumptions = defaultMetaAssumptions, periodId = data.currentPeriodId): MetaModel {
  const rows = buildEvaluatedRows(data as MetaDataset, assumptions);
  const selectedRow = rows.find((row) => row.periodId === periodId) ?? rows[rows.length - 1];
  const priorRow = rows[Math.max(rows.indexOf(selectedRow) - 1, 0)] ?? selectedRow;
  const valuation = calculateMetaValuation({ ...data, selectedRow, latestReferenceDate: data.latestReferenceDate } as MetaDataset, assumptions);
  const validationWarnings = validateMetaData({ ...data, selectedRow, latestReferenceDate: data.latestReferenceDate } as MetaDataset, assumptions);
  const dataStatus: DataStatus = {
    sourceType: "mock",
    lastUpdated: data.latestReferenceDate,
    missingFields: checkMissingFields([
      { key: "currentPrice", value: assumptions.currentPrice },
      { key: "forwardEps", value: assumptions.forwardEps },
      { key: "fcfPerShare", value: assumptions.fcfPerShare },
    ]),
    validationWarnings,
    valuationReliable: validationWarnings.length === 0,
  };
  const phase = detectMetaPhase(selectedRow, priorRow, assumptions);
  const investmentReadThrough: DashboardInterpretation[] = [
    {
      title: "Is AI improving ad efficiency?",
      signal: selectedRow.aiAdRoic > assumptions.wacc ? "Positive" : "Neutral",
      detail: selectedRow.aiAdRoic > assumptions.wacc
        ? "AI ad returns are above the cost of capital, which supports a higher multiple."
        : "AI ad returns are still close to the cost of capital, so the margin bridge matters.",
      badge: "Derived",
    },
    {
      title: "Is AI CapEx burden manageable?",
      signal: selectedRow.aiAdjustedFcfMargin >= priorRow.aiAdjustedFcfMargin ? "Positive" : "Inflecting",
      detail: selectedRow.aiAdjustedFcfMargin >= priorRow.aiAdjustedFcfMargin
        ? "AI-adjusted FCF margin is holding or improving despite continued CapEx intensity."
        : "CapEx remains meaningful, but the cash conversion trend needs a few more quarters of proof.",
      badge: "Derived",
    },
    {
      title: "Are Reels and engagement monetizing?",
      signal: selectedRow.reelsMonetizationGap <= priorRow.reelsMonetizationGap ? "Positive" : "Neutral",
      detail: selectedRow.reelsMonetizationGap <= priorRow.reelsMonetizationGap
        ? "Reels monetization gap is narrowing while watch time and ad load continue to improve."
        : "Engagement is healthy, but monetization still has room to close the gap.",
      badge: "Actual",
    },
    {
      title: "Is Reality Labs drag contained?",
      signal: selectedRow.realityLabsOperatingLoss <= priorRow.realityLabsOperatingLoss ? "Neutral" : "Negative",
      detail: "Reality Labs remains a drag in the base case, with WhatsApp / business messaging providing the main optionality offset.",
      badge: "Actual",
    },
  ];
  const adRevenueBridge = [
    { label: "Prior ad revenue", value: priorRow.adRevenue, type: "base" as const },
    { label: "Impressions contribution", value: priorRow.adRevenue * priorRow.adImpressionsGrowth, type: "positive" as const },
    { label: "CPM contribution", value: priorRow.adRevenue * priorRow.cpmGrowth, type: "positive" as const },
    { label: "AI uplift", value: selectedRow.aiAdRevenueUplift, type: "positive" as const },
    { label: "Residual / FX", value: selectedRow.adRevenue - priorRow.adRevenue - (priorRow.adRevenue * priorRow.adImpressionsGrowth) - (priorRow.adRevenue * priorRow.cpmGrowth) - selectedRow.aiAdRevenueUplift, type: "negative" as const },
    { label: "Current ad revenue", value: selectedRow.adRevenue, type: "total" as const },
  ];
  const aiAdBridge = [
    { label: "Base ad revenue", value: annualizeQuarterly(selectedRow.adRevenue), type: "base" as const },
    { label: "AI conversion uplift", value: annualizeQuarterly(selectedRow.adRevenue) * assumptions.aiConversionUplift, type: "positive" as const },
    { label: "AI CPM uplift", value: annualizeQuarterly(selectedRow.adRevenue) * assumptions.aiCpmUplift, type: "positive" as const },
    { label: "AI engagement uplift", value: annualizeQuarterly(selectedRow.adRevenue) * assumptions.aiEngagementUplift, type: "positive" as const },
    { label: "Creative automation uplift", value: annualizeQuarterly(selectedRow.adRevenue) * assumptions.aiCreativeAutomationUplift, type: "positive" as const },
    { label: "Serving cost", value: -assumptions.aiServingCost, type: "negative" as const },
    { label: "AI ad stack opex", value: -annualizeQuarterly(selectedRow.aiAdStackOpex), type: "negative" as const },
    { label: "AI ad operating profit", value: selectedRow.aiAdOperatingProfitAnnualized, type: "total" as const },
  ];
  const engagementTrend = rows.map((row) => ({
    period: row.periodId,
    timeSpent: row.timeSpent,
    reelsWatchTime: row.reelsWatchTime,
    monetizationGap: row.reelsMonetizationGap,
    adLoad: row.adLoad,
  }));
  const capexFcfBridge = [
    { label: "Reported FCF", value: annualizeQuarterly(selectedRow.fcf), type: "base" as const },
    { label: "AI ad after-tax profit", value: selectedRow.aiAdAfterTaxOperatingProfitAnnualized, type: "positive" as const },
    { label: "AI-adjusted FCF", value: selectedRow.aiAdjustedFcf, type: "total" as const },
  ];
  const realityLabsTrend = rows.map((row) => ({
    period: row.periodId,
    revenue: annualizeQuarterly(row.realityLabsRevenue),
    operatingLoss: annualizeQuarterly(row.realityLabsOperatingLoss),
    lossMargin: safeDivide(row.realityLabsOperatingLoss, row.totalRevenue),
  }));
  const whatsappTrend = rows.map((row) => ({
    period: row.periodId,
    revenue: annualizeQuarterly(row.whatsappRevenue),
    optionalityValue: defaultMetaAssumptions.whatsappRevenue * defaultMetaAssumptions.whatsappMargin * defaultMetaAssumptions.whatsappMultiple,
  }));

  return {
    summary: calculateMetaSummary({ ...data, selectedRow, latestReferenceDate: data.latestReferenceDate } as MetaDataset, assumptions),
    dataStatus,
    rows,
    selectedRow,
    statusBanner: phase,
    investmentReadThrough,
    adRevenueBridge,
    aiAdBridge,
    engagementTrend,
    capexFcfBridge,
    realityLabsTrend,
    whatsappTrend,
    scenarioLab: {
      phase,
      aiRevenue: annualizeQuarterly(selectedRow.adRevenue) * (1 + assumptions.aiConversionUplift + assumptions.aiCpmUplift + assumptions.aiEngagementUplift + assumptions.aiCreativeAutomationUplift),
      aiOperatingProfit: selectedRow.aiAdOperatingProfitAnnualized,
      aiRoic: selectedRow.aiAdRoic,
      aiAdjustedFcf: selectedRow.aiAdjustedFcf,
      aiAdjustedFcfMargin: selectedRow.aiAdjustedFcfMargin,
      valuation,
    },
    valuation,
  };
}
