import type { DataStatus, Scenario, Signal, SummaryMetric } from "../types";
import { checkExtremeGrowthRates, checkMissingFields, checkValuationReliability } from "../../utils/validation";
import { buildPriceValidationWarnings } from "../../utils/valuation";
import { clamp, safeDivide } from "../../utils/financialMath";
import type { GooglAssumptions } from "./assumptions";
import { defaultGooglAssumptions } from "./assumptions";
import type { GooglData, GooglRow } from "./data";
import { googlData } from "./data";
import { calculateGooglValuation } from "./valuation";

export type GooglEvaluatedRow = GooglRow & {
  searchRevenueEstimate: number;
  searchMarginEstimate: number;
  searchRevenuePerQueryEstimate: number;
  cloudRevenueEstimate: number;
  cloudOperatingMarginEstimate: number;
  tpuCostPerTokenEstimate: number;
  tpuEfficiencySavingsRate: number;
  tpuGrossMarginAdvantageEstimate: number;
  aiAnnualRevenueEstimate: number;
  aiOperatingProfitEstimate: number;
  aiInvestedCapitalEstimate: number;
  aiRoicEstimate: number;
  aiAdjustedFcf: number;
  aiAdjustedFcfMargin: number;
  tpuMoatScore: number;
  aiMonetizationQualityScore: number;
  computeCapacityConstraintScore: number;
};

export type GooglModel = {
  rows: GooglEvaluatedRow[];
  selectedRow: GooglEvaluatedRow;
  dataStatus: DataStatus;
  statusBanner: { title: string; detail: string; signal: Signal };
  summary: SummaryMetric[];
  searchBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  tpuMarginBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  fcfOffsetBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  valuation: ReturnType<typeof calculateGooglValuation>;
};

function delta<K extends keyof GooglAssumptions>(key: K, assumptions: GooglAssumptions) {
  return assumptions[key] - defaultGooglAssumptions[key];
}

function evaluateRow(row: GooglRow, assumptions: GooglAssumptions): GooglEvaluatedRow {
  const searchRevenueEstimate = row.searchRevenue * (1 + delta("searchGrowth", assumptions) * 0.8 + delta("aiSearchMonetizationImpact", assumptions) * 1.4 - delta("aiCannibalizationEffect", assumptions) * 1.1 + delta("searchQueryGrowth", assumptions) * 0.35 + delta("cpcTrend", assumptions) * 0.4);
  const searchMarginEstimate = clamp(row.searchMarginBase + delta("searchMargin", assumptions) * 0.85 + delta("aiSearchMonetizationImpact", assumptions) * 0.45 - delta("aiCannibalizationEffect", assumptions) * 0.35, 0.3, 0.52);
  const searchRevenuePerQueryEstimate = clamp(row.revenuePerQueryIndex + delta("revenuePerQuery", assumptions) * 0.8 + delta("cpcTrend", assumptions) * 0.7 - delta("aiCannibalizationEffect", assumptions) * 0.2, 0.75, 1.15);
  const cloudRevenueEstimate = row.cloudRevenue * (1 + delta("cloudGrowth", assumptions) * 0.9 + delta("backlogConversionRate", assumptions) * 0.22 - delta("computeCapacityConstraint", assumptions) * 0.18 + delta("geminiMonetizationGrowth", assumptions) * 0.14);
  const tpuEfficiencySavingsRate = clamp(row.tpuCostAdvantageVsNvidia + delta("tpuTrainingEfficiency", assumptions) * 0.5 + delta("tpuInferenceEfficiency", assumptions) * 0.6 + delta("tpuCostReductionRate", assumptions) * 0.9 + delta("tpuEnergyEfficiency", assumptions) * 0.45, 0.04, 0.38);
  const cloudOperatingMarginEstimate = clamp(row.cloudOperatingMargin + delta("cloudOperatingMargin", assumptions) * 0.8 + delta("tpuMarginAdvantage", assumptions) * 0.65 + tpuEfficiencySavingsRate * 0.18 - delta("aiInfrastructureMix", assumptions) * 0.18 - delta("computeCapacityConstraint", assumptions) * 0.08, 0.15, 0.45);
  const tpuCostPerTokenEstimate = clamp(row.tpuCostPerTokenIndex * (1 - tpuEfficiencySavingsRate), 0.35, 1.2);
  const tpuGrossMarginAdvantageEstimate = clamp(row.tpuCostAdvantageVsNvidia + assumptions.tpuMarginAdvantage + assumptions.tpuInferenceEfficiency * 0.08, 0.02, 0.12);
  const aiAnnualRevenueEstimate = row.aiAnnualRevenue * (1 + delta("aiRevenueCagr", assumptions) * 0.55 + delta("geminiMonetizationGrowth", assumptions) * 0.45 + delta("aiTokenThroughput", assumptions) * 0.03 + delta("geminiPaidUsers", assumptions) * 0.02 + delta("aiAgentAdoption", assumptions) * 0.35);
  const aiOperatingProfitEstimate = aiAnnualRevenueEstimate * clamp(row.aiOperatingMarginBase + delta("aiOperatingMargin", assumptions) * 0.85 + assumptions.tpuMarginAdvantage * 0.4 - assumptions.aiInfrastructureMix * 0.07, 0.08, 0.35);
  const aiInvestedCapitalEstimate = row.tpuCapex * (4.4 + assumptions.tpuCapacityExpansion * 1.6 + assumptions.aiCapexGrowth * 1.2);
  const aiRoicEstimate = clamp(safeDivide(aiOperatingProfitEstimate, aiInvestedCapitalEstimate), -0.02, 0.22);
  const aiAdjustedFcf = row.fcf + row.totalRevenue * tpuEfficiencySavingsRate * 0.03 + Math.max(aiOperatingProfitEstimate - row.aiAnnualRevenue * row.aiOperatingMarginBase, 0) * 0.4;
  const aiAdjustedFcfMargin = clamp(safeDivide(aiAdjustedFcf, row.totalRevenue) + delta("fcfMargin", assumptions) * 0.75, 0.08, 0.3);
  const tpuMoatScore = clamp((tpuGrossMarginAdvantageEstimate * 400 + assumptions.tpuUtilization * 35 + assumptions.tpuInferenceEfficiency * 60 + assumptions.tpuTrainingEfficiency * 40 + cloudOperatingMarginEstimate * 35 + aiRoicEstimate * 120) / 6, 20, 95);
  const aiMonetizationQualityScore = clamp((assumptions.geminiMonetizationGrowth * 55 + assumptions.aiRevenueCagr * 45 + assumptions.aiOperatingMargin * 40 + assumptions.aiAgentAdoption * 35 + assumptions.aiInfrastructureMix * -15 + assumptions.backlogConversionRate * 20) * 100 / 180, 20, 95);
  const computeCapacityConstraintScore = clamp(row.computeCapacityConstraint + delta("computeCapacityConstraint", assumptions) * 0.9 - delta("tpuCapacityExpansion", assumptions) * 0.35, 0.05, 0.95);

  return {
    ...row,
    searchRevenueEstimate,
    searchMarginEstimate,
    searchRevenuePerQueryEstimate,
    cloudRevenueEstimate,
    cloudOperatingMarginEstimate,
    tpuCostPerTokenEstimate,
    tpuEfficiencySavingsRate,
    tpuGrossMarginAdvantageEstimate,
    aiAnnualRevenueEstimate,
    aiOperatingProfitEstimate,
    aiInvestedCapitalEstimate,
    aiRoicEstimate,
    aiAdjustedFcf,
    aiAdjustedFcfMargin,
    tpuMoatScore,
    aiMonetizationQualityScore,
    computeCapacityConstraintScore,
  };
}

function getStatusBanner(row: GooglEvaluatedRow, assumptions: GooglAssumptions): { title: string; detail: string; signal: Signal } {
  if (row.computeCapacityConstraintScore > 0.72) {
    return {
      title: "Compute constrained",
      detail: "Demand for Search AI, Gemini, and Cloud remains strong, but monetization is still bounded by technical infrastructure availability and conversion timing.",
      signal: "Compute Constrained",
    };
  }
  if (row.cloudOperatingMarginEstimate > row.cloudOperatingMargin && row.aiRoicEstimate > row.wacc) {
    return {
      title: "TPU efficiency expansion phase",
      detail: "Cloud margins are improving while TPU-driven efficiency gains are showing up in incremental returns on AI capital.",
      signal: "Positive",
    };
  }
  if (row.aiRoicEstimate > row.wacc || (assumptions.aiCapexGrowth < assumptions.aiRevenueCagr && row.aiAdjustedFcfMargin >= 0.2)) {
    return {
      title: "AI ROIC improving",
      detail: "AI monetization is scaling faster than the depreciation burden, suggesting Alphabet is moving toward a higher-return TPU-first infrastructure model.",
      signal: "Inflecting",
    };
  }
  if (row.cloudOperatingMarginEstimate > row.cloudOperatingMargin && assumptions.tpuMarginAdvantage > 0.025) {
    return {
      title: "Cloud margin inflecting",
      detail: "Cloud growth remains AI-led, and TPU economics are increasingly visible in margin progression and backlog conversion quality.",
      signal: "Inflecting",
    };
  }
  return {
    title: "AI investment phase",
    detail: "Alphabet is still spending aggressively on technical infrastructure, and the key debate is whether TPU advantages can drive better long-term ROIC than peers.",
    signal: "Neutral",
  };
}

function buildSearchBridge(row: GooglEvaluatedRow, assumptions: GooglAssumptions) {
  return [
    { label: "Prior Search Revenue", value: row.searchRevenue, type: "base" as const },
    { label: "AI query growth", value: row.searchRevenue * assumptions.searchQueryGrowth * 0.25, type: "positive" as const },
    { label: "AI engagement uplift", value: row.searchRevenue * assumptions.aiSearchMonetizationImpact * 0.6, type: "positive" as const },
    { label: "AI answer cannibalization", value: -row.searchRevenue * assumptions.aiCannibalizationEffect * 0.65, type: "negative" as const },
    { label: "Commercial query expansion", value: row.searchRevenue * Math.max(assumptions.cpcTrend + 0.01, 0) * 0.4, type: "positive" as const },
    { label: "Current Search Revenue", value: row.searchRevenueEstimate, type: "total" as const },
  ];
}

function buildTpuMarginBridge(row: GooglEvaluatedRow, assumptions: GooglAssumptions) {
  return [
    { label: "Prior Cloud Margin", value: row.cloudOperatingMargin, type: "base" as const },
    { label: "AI infra depreciation", value: -assumptions.depreciationGrowth * 0.16, type: "negative" as const },
    { label: "Networking costs", value: -assumptions.aiInfrastructureMix * 0.035, type: "negative" as const },
    { label: "Power / cooling", value: -assumptions.aiCapexGrowth * 0.025, type: "negative" as const },
    { label: "TPU efficiency gains", value: row.tpuEfficiencySavingsRate * 0.28, type: "positive" as const },
    { label: "Inference optimization", value: assumptions.tpuInferenceEfficiency * 0.12, type: "positive" as const },
    { label: "Current Cloud Margin", value: row.cloudOperatingMarginEstimate, type: "total" as const },
  ];
}

function buildFcfOffsetBridge(row: GooglEvaluatedRow) {
  const coreFcf = row.fcf + row.tpuCapex - row.totalRevenue * row.tpuEfficiencySavingsRate * 0.08 - row.aiOperatingProfitEstimate * 0.35;
  return [
    { label: "Core FCF", value: coreFcf, type: "base" as const },
    { label: "Incremental AI CapEx", value: -row.tpuCapex, type: "negative" as const },
    { label: "TPU efficiency savings", value: row.totalRevenue * row.tpuEfficiencySavingsRate * 0.08, type: "positive" as const },
    { label: "AI operating profit", value: row.aiOperatingProfitEstimate * 0.35, type: "positive" as const },
    { label: "AI-adjusted FCF", value: row.aiAdjustedFcf, type: "total" as const },
  ];
}

export function buildGooglModel(data: GooglData, assumptions: GooglAssumptions, periodId: string): GooglModel {
  const rows = data.rows.map((row) => evaluateRow(row, assumptions));
  const selectedRow = rows.find((row) => row.periodId === periodId) ?? rows.find((row) => row.periodId === data.currentPeriodId) ?? rows[0];
  const statusBanner = getStatusBanner(selectedRow, assumptions);
  const missingFields = checkMissingFields([
    { key: "currentPrice", value: assumptions.currentPrice },
    { key: "wacc", value: assumptions.wacc },
    { key: "cloudBacklog", value: assumptions.cloudBacklog },
  ]);
  const validationWarnings = [
    ...checkExtremeGrowthRates(
      [
        { label: "Cloud growth", value: assumptions.cloudGrowth },
        { label: "AI revenue CAGR", value: assumptions.aiRevenueCagr },
        { label: "AI CapEx growth", value: assumptions.aiCapexGrowth },
      ],
      0.8,
    ),
    ...checkValuationReliability(selectedRow.aiRoicEstimate < selectedRow.wacc || missingFields.length > 0),
    ...buildPriceValidationWarnings("GOOGL", assumptions.currentPrice, "2026-05-09"),
  ];
  if (assumptions.currentPrice < 250 || assumptions.currentPrice > 600) {
    validationWarnings.push({
      id: "googl-current-price-range",
      title: "Current price may be stale or incorrect.",
      detail: "GOOGL current price is outside the expected USD range of 250 to 600, so upside/downside outputs may be distorted.",
      severity: "medium",
    });
  }
  const dataStatus: DataStatus = {
    sourceType: "mock",
    lastUpdated: "2026-05-09",
    missingFields,
    validationWarnings,
    valuationReliable: !validationWarnings.some((warning) => warning.id === "valuation-reliability"),
  };
  const summary: SummaryMetric[] = [
    { key: "total-revenue", label: "Total Revenue ($B)", value: selectedRow.totalRevenue, format: "number", description: "Alphabet’s total revenue base funding AI investment.", badge: "Actual" },
    { key: "search-growth", label: "Search Growth", value: assumptions.searchGrowth, format: "percent", description: "Search growth is still the core monetization engine for the AI build.", badge: "Actual" },
    { key: "cloud-growth", label: "Cloud Growth", value: selectedRow.cloudGrowth, format: "percent", description: "Google Cloud growth is the key direct read on AI demand translation into revenue.", badge: "Actual" },
    { key: "cloud-margin", label: "Cloud Op Margin", value: selectedRow.cloudOperatingMarginEstimate, format: "percent", description: "The critical test of whether AI infrastructure is becoming structurally more profitable.", badge: "Derived" },
    { key: "ai-cloud", label: "AI Share of Cloud Growth", value: assumptions.aiContributionToCloudGrowth, format: "percent", description: "How much of cloud growth is being driven by AI products and infrastructure.", badge: "Derived" },
    { key: "backlog", label: "Cloud Backlog ($B)", value: assumptions.cloudBacklog, format: "number", description: "Committed cloud demand and future AI monetization visibility.", badge: "Actual" },
    { key: "backlog-conversion", label: "Backlog Conversion", value: assumptions.backlogConversionRate, format: "percent", description: "Portion of backlog expected to convert over the next 24 months.", badge: "Derived" },
    { key: "tpu-util", label: "TPU Utilization", value: assumptions.tpuUtilization, format: "percent", description: "Higher utilization helps convert TPU design advantage into cloud margin and ROIC.", badge: "Derived" },
    { key: "ai-revenue", label: "AI Annualized Revenue ($B)", value: selectedRow.aiAnnualRevenueEstimate, format: "number", description: "AI revenue across cloud infrastructure, Gemini monetization, and AI platform services.", badge: "Derived" },
    { key: "ai-capex", label: "AI CapEx ($B)", value: selectedRow.tpuCapex, format: "number", description: "Quarterly AI/TPU infrastructure investment burden.", badge: "Actual" },
    { key: "capex-revenue", label: "CapEx / Revenue", value: safeDivide(selectedRow.totalCapex, selectedRow.totalRevenue), format: "percent", description: "Capital intensity needed to support Cloud, Search, and Gemini AI demand.", badge: "Derived" },
    { key: "fcf-margin", label: "FCF Margin", value: selectedRow.aiAdjustedFcfMargin, format: "percent", description: "Cash conversion after adjusting for AI investment and TPU efficiency savings.", badge: "Derived" },
    { key: "ai-roic", label: "AI ROIC", value: selectedRow.aiRoicEstimate, format: "percent", description: "Incremental return on Alphabet’s AI invested capital.", badge: "Derived" },
    { key: "query-growth", label: "Search Query Growth", value: assumptions.searchQueryGrowth, format: "percent", description: "Usage-side signal for whether AI is expanding Search activity.", badge: "Actual" },
    { key: "gemini-paid", label: "Gemini Paid Users (M)", value: assumptions.geminiPaidUsers, format: "number", description: "Paid Gemini users are the best read on AI software monetization quality.", badge: "Actual" },
    { key: "token-throughput", label: "AI Tokens / Min (B)", value: assumptions.aiTokenThroughput, format: "number", description: "Token throughput is a direct read on API demand and compute scale.", badge: "Actual" },
  ];

  return {
    rows,
    selectedRow,
    dataStatus,
    statusBanner,
    summary,
    searchBridge: buildSearchBridge(selectedRow, assumptions),
    tpuMarginBridge: buildTpuMarginBridge(selectedRow, assumptions),
    fcfOffsetBridge: buildFcfOffsetBridge(selectedRow),
    valuation: calculateGooglValuation({ rows, selectedRow, dataStatus, statusBanner, summary, searchBridge: [], tpuMarginBridge: [], fcfOffsetBridge: [], valuation: undefined as never }, assumptions),
  };
}

export function calculateGooglSummary(data: GooglData = googlData) {
  return buildGooglModel(data, defaultGooglAssumptions, data.currentPeriodId).summary;
}
