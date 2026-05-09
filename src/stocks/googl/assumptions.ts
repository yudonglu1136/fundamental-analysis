import type { Scenario, ValuationAssumption } from "../types";
import { googlData } from "./data";

export type GooglAssumptions = {
  currentPrice: number;
  forwardEps: number;
  searchGrowth: number;
  searchMargin: number;
  searchValueMultiple: number;
  aiSearchMonetizationImpact: number;
  aiCannibalizationEffect: number;
  searchQueryGrowth: number;
  aiOverviewsUsage: number;
  aiModeAdoption: number;
  revenuePerQuery: number;
  cpcTrend: number;
  cloudGrowth: number;
  cloudOperatingMargin: number;
  youtubeMargin: number;
  aiContributionToCloudGrowth: number;
  aiInfrastructureMix: number;
  backlogConversionRate: number;
  cloudBacklog: number;
  computeCapacityConstraint: number;
  tpuUtilization: number;
  tpuTrainingEfficiency: number;
  tpuInferenceEfficiency: number;
  tpuCostReductionRate: number;
  tpuMarginAdvantage: number;
  tpuEnergyEfficiency: number;
  tpuDepreciationGrowth: number;
  tpuCapacityExpansion: number;
  geminiMonetizationGrowth: number;
  aiRevenueCagr: number;
  aiOperatingMargin: number;
  geminiPaidUsers: number;
  aiTokenThroughput: number;
  aiAgentAdoption: number;
  aiCapexGrowth: number;
  depreciationGrowth: number;
  fcfMargin: number;
  targetFcfYield: number;
  wacc: number;
  terminalGrowth: number;
  forwardPe: number;
  cloudEvEbit: number;
  aiValueMultiple: number;
  exitMultiple: number;
  otherBetsValue: number;
  netCashPerShare: number;
  dividendYield: number;
};

export const googlScenarioDefaults: Record<Scenario, GooglAssumptions> = {
  Bear: {
    currentPrice: googlData.currentPrice,
    forwardEps: 8.1,
    searchGrowth: 0.12,
    searchMargin: 0.38,
    searchValueMultiple: 16,
    aiSearchMonetizationImpact: 0.01,
    aiCannibalizationEffect: 0.025,
    searchQueryGrowth: 0.16,
    aiOverviewsUsage: 0.42,
    aiModeAdoption: 0.08,
    revenuePerQuery: 0.97,
    cpcTrend: -0.02,
    cloudGrowth: 0.34,
    cloudOperatingMargin: 0.27,
    youtubeMargin: 0.25,
    aiContributionToCloudGrowth: 0.19,
    aiInfrastructureMix: 0.62,
    backlogConversionRate: 0.46,
    cloudBacklog: 320,
    computeCapacityConstraint: 0.78,
    tpuUtilization: 0.58,
    tpuTrainingEfficiency: 0.11,
    tpuInferenceEfficiency: 0.14,
    tpuCostReductionRate: 0.1,
    tpuMarginAdvantage: 0.018,
    tpuEnergyEfficiency: 0.08,
    tpuDepreciationGrowth: 0.34,
    tpuCapacityExpansion: 0.28,
    geminiMonetizationGrowth: 0.24,
    aiRevenueCagr: 0.26,
    aiOperatingMargin: 0.16,
    geminiPaidUsers: 11,
    aiTokenThroughput: 11,
    aiAgentAdoption: 0.16,
    aiCapexGrowth: 0.24,
    depreciationGrowth: 0.28,
    fcfMargin: 0.18,
    targetFcfYield: 0.045,
    wacc: 0.09,
    terminalGrowth: 0.025,
    forwardPe: 21,
    cloudEvEbit: 18,
    aiValueMultiple: 18,
    exitMultiple: 22,
    otherBetsValue: 6,
    netCashPerShare: 8,
    dividendYield: 0,
  },
  Base: {
    currentPrice: googlData.currentPrice,
    forwardEps: 9.3,
    searchGrowth: 0.19,
    searchMargin: 0.41,
    searchValueMultiple: 20,
    aiSearchMonetizationImpact: 0.025,
    aiCannibalizationEffect: 0.01,
    searchQueryGrowth: 0.21,
    aiOverviewsUsage: 0.58,
    aiModeAdoption: 0.14,
    revenuePerQuery: 1,
    cpcTrend: 0,
    cloudGrowth: 0.48,
    cloudOperatingMargin: 0.301,
    youtubeMargin: 0.3,
    aiContributionToCloudGrowth: 0.26,
    aiInfrastructureMix: 0.57,
    backlogConversionRate: 0.52,
    cloudBacklog: 240,
    computeCapacityConstraint: 0.66,
    tpuUtilization: 0.69,
    tpuTrainingEfficiency: 0.18,
    tpuInferenceEfficiency: 0.24,
    tpuCostReductionRate: 0.16,
    tpuMarginAdvantage: 0.032,
    tpuEnergyEfficiency: 0.14,
    tpuDepreciationGrowth: 0.24,
    tpuCapacityExpansion: 0.24,
    geminiMonetizationGrowth: 0.4,
    aiRevenueCagr: 0.38,
    aiOperatingMargin: 0.21,
    geminiPaidUsers: 16,
    aiTokenThroughput: 16,
    aiAgentAdoption: 0.24,
    aiCapexGrowth: 0.18,
    depreciationGrowth: 0.22,
    fcfMargin: 0.23,
    targetFcfYield: 0.038,
    wacc: 0.085,
    terminalGrowth: 0.03,
    forwardPe: 24,
    cloudEvEbit: 24,
    aiValueMultiple: 22,
    exitMultiple: 25,
    otherBetsValue: 8,
    netCashPerShare: 9,
    dividendYield: 0,
  },
  Bull: {
    currentPrice: googlData.currentPrice,
    forwardEps: 10.6,
    searchGrowth: 0.22,
    searchMargin: 0.43,
    searchValueMultiple: 24,
    aiSearchMonetizationImpact: 0.04,
    aiCannibalizationEffect: 0.005,
    searchQueryGrowth: 0.24,
    aiOverviewsUsage: 0.68,
    aiModeAdoption: 0.22,
    revenuePerQuery: 1.03,
    cpcTrend: 0.01,
    cloudGrowth: 0.58,
    cloudOperatingMargin: 0.34,
    youtubeMargin: 0.35,
    aiContributionToCloudGrowth: 0.33,
    aiInfrastructureMix: 0.51,
    backlogConversionRate: 0.58,
    cloudBacklog: 260,
    computeCapacityConstraint: 0.48,
    tpuUtilization: 0.8,
    tpuTrainingEfficiency: 0.25,
    tpuInferenceEfficiency: 0.33,
    tpuCostReductionRate: 0.22,
    tpuMarginAdvantage: 0.05,
    tpuEnergyEfficiency: 0.2,
    tpuDepreciationGrowth: 0.18,
    tpuCapacityExpansion: 0.2,
    geminiMonetizationGrowth: 0.58,
    aiRevenueCagr: 0.5,
    aiOperatingMargin: 0.27,
    geminiPaidUsers: 24,
    aiTokenThroughput: 20,
    aiAgentAdoption: 0.34,
    aiCapexGrowth: 0.12,
    depreciationGrowth: 0.16,
    fcfMargin: 0.27,
    targetFcfYield: 0.032,
    wacc: 0.08,
    terminalGrowth: 0.035,
    forwardPe: 27,
    cloudEvEbit: 30,
    aiValueMultiple: 26,
    exitMultiple: 29,
    otherBetsValue: 10,
    netCashPerShare: 10,
    dividendYield: 0,
  },
};

export const defaultGooglAssumptions = googlScenarioDefaults.Base;

export const googlAssumptionDefinitions: ValuationAssumption[] = [
  { key: "currentPrice", label: "Current Price", value: defaultGooglAssumptions.currentPrice, min: 100, max: 800, step: 0.1, format: "currency", source: "actual", description: "Current GOOGL share price in USD used for upside/downside and all valuation outputs.", category: "Valuation" },
  { key: "forwardEps", label: "Forward EPS (Annual)", value: defaultGooglAssumptions.forwardEps, min: 5, max: 20, step: 0.1, format: "number", source: "consensus", description: "Annualized forward EPS. If this drops below 5, the model warns that EPS may not be annualized.", category: "Valuation" },
  { key: "searchGrowth", label: "Search Growth", value: defaultGooglAssumptions.searchGrowth, min: 0, max: 0.3, step: 0.005, format: "percent", source: "actual", description: "Core Search revenue growth is still the main earnings base funding AI.", category: "Search" },
  { key: "searchMargin", label: "Search Margin", value: defaultGooglAssumptions.searchMargin, min: 0.25, max: 0.55, step: 0.005, format: "percent", source: "derived", description: "Tracks whether AI Search features preserve the high-margin economics of Search.", category: "Search" },
  { key: "searchValueMultiple", label: "Search Value Multiple", value: defaultGooglAssumptions.searchValueMultiple, min: 10, max: 30, step: 0.1, format: "multiple", source: "assumption", description: "After-tax value multiple applied to Search operating income.", category: "Valuation" },
  { key: "aiSearchMonetizationImpact", label: "AI Search Monetization Impact", value: defaultGooglAssumptions.aiSearchMonetizationImpact, min: -0.03, max: 0.08, step: 0.002, format: "percent", source: "assumption", description: "Incremental monetization uplift from AI Overviews, AI Mode, and better ad relevance.", category: "Search" },
  { key: "aiCannibalizationEffect", label: "AI Cannibalization Effect", value: defaultGooglAssumptions.aiCannibalizationEffect, min: 0, max: 0.08, step: 0.002, format: "percent", source: "assumption", description: "Revenue headwind if AI answers reduce monetizable clicks.", category: "Search" },
  { key: "searchQueryGrowth", label: "Search Query Growth", value: defaultGooglAssumptions.searchQueryGrowth, min: 0.05, max: 0.35, step: 0.005, format: "percent", source: "actual", description: "Demand-side measure for whether AI is expanding usage.", category: "Search" },
  { key: "aiOverviewsUsage", label: "AI Overviews Usage", value: defaultGooglAssumptions.aiOverviewsUsage, min: 0.1, max: 0.9, step: 0.01, format: "percent", source: "assumption", description: "AI Overviews penetration into search workflows.", category: "Search" },
  { key: "aiModeAdoption", label: "AI Mode Adoption", value: defaultGooglAssumptions.aiModeAdoption, min: 0.01, max: 0.45, step: 0.01, format: "percent", source: "assumption", description: "Higher AI Mode adoption increases engagement but also changes monetization mechanics.", category: "Search" },
  { key: "revenuePerQuery", label: "Revenue per Query Index", value: defaultGooglAssumptions.revenuePerQuery, min: 0.75, max: 1.15, step: 0.01, format: "number", source: "derived", description: "Simple index of Search monetization efficiency per query.", category: "Search" },
  { key: "cpcTrend", label: "CPC Trend", value: defaultGooglAssumptions.cpcTrend, min: -0.08, max: 0.08, step: 0.002, format: "percent", source: "derived", description: "Pricing trend in Search auctions and commercial intent.", category: "Search" },
  { key: "cloudGrowth", label: "Cloud Growth", value: defaultGooglAssumptions.cloudGrowth, min: 0.1, max: 0.8, step: 0.01, format: "percent", source: "actual", description: "Top-line signal for whether AI demand is driving Cloud acceleration.", category: "Cloud" },
  { key: "cloudOperatingMargin", label: "Cloud Operating Margin", value: defaultGooglAssumptions.cloudOperatingMargin, min: 0.1, max: 0.45, step: 0.005, format: "percent", source: "actual", description: "Most important profitability test for whether AI infrastructure is becoming productive.", category: "Cloud" },
  { key: "youtubeMargin", label: "YouTube Margin", value: defaultGooglAssumptions.youtubeMargin, min: 0.15, max: 0.45, step: 0.005, format: "percent", source: "assumption", description: "Margin assumption for YouTube monetization and platform earnings power.", category: "Valuation" },
  { key: "aiContributionToCloudGrowth", label: "AI Share of Cloud Growth", value: defaultGooglAssumptions.aiContributionToCloudGrowth, min: 0.05, max: 0.5, step: 0.01, format: "percent", source: "derived", description: "How much of Cloud growth is being driven by AI infrastructure and solutions.", category: "Cloud" },
  { key: "aiInfrastructureMix", label: "AI Infrastructure Mix", value: defaultGooglAssumptions.aiInfrastructureMix, min: 0.2, max: 0.8, step: 0.01, format: "percent", source: "assumption", description: "Higher infra mix helps growth but can dilute margins if software mix lags.", category: "Cloud" },
  { key: "backlogConversionRate", label: "Backlog Conversion Rate", value: defaultGooglAssumptions.backlogConversionRate, min: 0.2, max: 0.8, step: 0.01, format: "percent", source: "derived", description: "Share of cloud backlog expected to convert over the next 24 months.", category: "Cloud" },
  { key: "cloudBacklog", label: "Cloud Backlog", value: defaultGooglAssumptions.cloudBacklog, min: 150, max: 500, step: 1, format: "currency", source: "actual", description: "Committed cloud demand and future revenue visibility.", category: "Cloud" },
  { key: "computeCapacityConstraint", label: "Compute Capacity Constraint", value: defaultGooglAssumptions.computeCapacityConstraint, min: 0, max: 1, step: 0.01, format: "percent", source: "assumption", description: "Higher values mean demand is outrunning capacity and constraining monetization.", category: "Cloud" },
  { key: "tpuUtilization", label: "TPU Utilization", value: defaultGooglAssumptions.tpuUtilization, min: 0.2, max: 0.95, step: 0.01, format: "percent", source: "derived", description: "Higher TPU utilization is one of the clearest drivers of better cloud economics.", category: "TPU" },
  { key: "tpuTrainingEfficiency", label: "TPU Training Efficiency", value: defaultGooglAssumptions.tpuTrainingEfficiency, min: 0, max: 0.4, step: 0.01, format: "percent", source: "assumption", description: "Efficiency uplift from training workloads on custom TPUs.", category: "TPU" },
  { key: "tpuInferenceEfficiency", label: "TPU Inference Efficiency", value: defaultGooglAssumptions.tpuInferenceEfficiency, min: 0, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Inference cost reduction from vertical optimization across TPU, network, and software stack.", category: "TPU" },
  { key: "tpuCostReductionRate", label: "TPU Cost Reduction", value: defaultGooglAssumptions.tpuCostReductionRate, min: 0, max: 0.4, step: 0.01, format: "percent", source: "derived", description: "Modeled cost-per-token improvement from TPU optimization.", category: "TPU" },
  { key: "tpuMarginAdvantage", label: "TPU Margin Advantage", value: defaultGooglAssumptions.tpuMarginAdvantage, min: 0, max: 0.1, step: 0.002, format: "percent", source: "assumption", description: "Incremental cloud margin benefit versus a more commodity GPU-heavy infrastructure mix.", category: "TPU" },
  { key: "tpuEnergyEfficiency", label: "TPU Energy Efficiency", value: defaultGooglAssumptions.tpuEnergyEfficiency, min: 0, max: 0.3, step: 0.005, format: "percent", source: "derived", description: "Energy savings are a major hidden driver of inference economics.", category: "TPU" },
  { key: "tpuDepreciationGrowth", label: "TPU Depreciation Growth", value: defaultGooglAssumptions.tpuDepreciationGrowth, min: 0.05, max: 0.5, step: 0.01, format: "percent", source: "derived", description: "How fast the TPU investment wave hits the P&L.", category: "TPU" },
  { key: "tpuCapacityExpansion", label: "TPU Capacity Expansion", value: defaultGooglAssumptions.tpuCapacityExpansion, min: 0.05, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Capacity growth helps close supply constraints but can pressure capital intensity.", category: "TPU" },
  { key: "geminiMonetizationGrowth", label: "Gemini Monetization Growth", value: defaultGooglAssumptions.geminiMonetizationGrowth, min: 0.05, max: 0.8, step: 0.01, format: "percent", source: "assumption", description: "Revenue growth from Gemini subscriptions, APIs, and enterprise solutions.", category: "AI Monetization" },
  { key: "aiRevenueCagr", label: "AI Revenue CAGR", value: defaultGooglAssumptions.aiRevenueCagr, min: 0.05, max: 0.7, step: 0.01, format: "percent", source: "assumption", description: "Longer-term AI revenue growth across Cloud, Gemini, and AI products.", category: "AI Monetization" },
  { key: "aiOperatingMargin", label: "AI Operating Margin", value: defaultGooglAssumptions.aiOperatingMargin, min: 0.05, max: 0.4, step: 0.005, format: "percent", source: "assumption", description: "Blended operating margin on AI monetization streams after infrastructure cost.", category: "AI Monetization" },
  { key: "geminiPaidUsers", label: "Gemini Paid Users", value: defaultGooglAssumptions.geminiPaidUsers, min: 1, max: 50, step: 0.5, format: "number", source: "actual", description: "Paid Gemini seats/users are the clearest monetization counterweight to pure infrastructure growth.", category: "AI Monetization" },
  { key: "aiTokenThroughput", label: "AI Token Throughput", value: defaultGooglAssumptions.aiTokenThroughput, min: 1, max: 40, step: 0.5, format: "number", source: "actual", description: "API token throughput indicates platform demand and monetization headroom.", category: "AI Monetization" },
  { key: "aiAgentAdoption", label: "AI Agent Adoption", value: defaultGooglAssumptions.aiAgentAdoption, min: 0.05, max: 0.6, step: 0.01, format: "percent", source: "assumption", description: "Signals whether Google is building a broader AI application platform, not just infrastructure.", category: "AI Monetization" },
  { key: "aiCapexGrowth", label: "AI CapEx Growth", value: defaultGooglAssumptions.aiCapexGrowth, min: 0.02, max: 0.4, step: 0.01, format: "percent", source: "actual", description: "Scale of AI infrastructure investment growth.", category: "Capital Intensity" },
  { key: "depreciationGrowth", label: "Depreciation Growth", value: defaultGooglAssumptions.depreciationGrowth, min: 0.02, max: 0.4, step: 0.01, format: "percent", source: "derived", description: "P&L burden from the prior CapEx cycle.", category: "Capital Intensity" },
  { key: "fcfMargin", label: "FCF Margin", value: defaultGooglAssumptions.fcfMargin, min: 0.08, max: 0.35, step: 0.005, format: "percent", source: "derived", description: "Cash conversion after AI investment and infrastructure scaling.", category: "Capital Intensity" },
  { key: "targetFcfYield", label: "Target FCF Yield", value: defaultGooglAssumptions.targetFcfYield, min: 0.02, max: 0.06, step: 0.001, format: "percent", source: "assumption", description: "FCF yield cross-check used for current fair value and 3-year target price framing.", category: "Valuation" },
  { key: "wacc", label: "WACC", value: defaultGooglAssumptions.wacc, min: 0.06, max: 0.11, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for DCF and ROIC spread tests.", category: "Valuation" },
  { key: "terminalGrowth", label: "Terminal Growth", value: defaultGooglAssumptions.terminalGrowth, min: 0.015, max: 0.05, step: 0.001, format: "percent", source: "assumption", description: "Long-run growth rate after the AI infrastructure build normalizes.", category: "Valuation" },
  { key: "forwardPe", label: "Forward P/E", value: defaultGooglAssumptions.forwardPe, min: 12, max: 35, step: 0.1, format: "multiple", source: "consensus", description: "Search/YouTube earnings multiple anchor.", category: "Valuation" },
  { key: "cloudEvEbit", label: "Cloud EV/EBIT", value: defaultGooglAssumptions.cloudEvEbit, min: 10, max: 35, step: 0.1, format: "multiple", source: "assumption", description: "Valuation multiple on Google Cloud EBIT.", category: "Valuation" },
  { key: "aiValueMultiple", label: "AI Value Multiple", value: defaultGooglAssumptions.aiValueMultiple, min: 10, max: 35, step: 0.1, format: "multiple", source: "assumption", description: "Multiple applied to TPU-driven AI economic uplift in the dedicated AI value model.", category: "Valuation" },
  { key: "exitMultiple", label: "Exit Multiple", value: defaultGooglAssumptions.exitMultiple, min: 12, max: 35, step: 0.1, format: "multiple", source: "assumption", description: "3-year exit multiple for the equity story.", category: "Valuation" },
  { key: "otherBetsValue", label: "Other Bets SOTP", value: defaultGooglAssumptions.otherBetsValue, min: 0, max: 80, step: 1, format: "currency", source: "assumption", description: "Placeholder SOTP value for Waymo and other bets.", category: "Valuation" },
  { key: "netCashPerShare", label: "Net Cash / Share", value: defaultGooglAssumptions.netCashPerShare, min: 0, max: 30, step: 0.5, format: "currency", source: "derived", description: "Net cash contribution per share included in the Alphabet sum-of-the-parts bridge.", category: "Valuation" },
  { key: "dividendYield", label: "Dividend Yield", value: defaultGooglAssumptions.dividendYield, min: 0, max: 0.03, step: 0.001, format: "percent", source: "actual", description: "Cumulative dividends are included in 3-year shareholder return, even if currently modest.", category: "Valuation" },
];

export const googlValuationAssumptionKeys = [
  "currentPrice",
  "forwardEps",
  "searchGrowth",
  "searchMargin",
  "searchValueMultiple",
  "aiSearchMonetizationImpact",
  "aiCannibalizationEffect",
  "cloudGrowth",
  "cloudOperatingMargin",
  "youtubeMargin",
  "aiInfrastructureMix",
  "backlogConversionRate",
  "tpuMarginAdvantage",
  "tpuUtilization",
  "tpuCostReductionRate",
  "geminiMonetizationGrowth",
  "aiRevenueCagr",
  "aiOperatingMargin",
  "aiCapexGrowth",
  "depreciationGrowth",
  "fcfMargin",
  "targetFcfYield",
  "wacc",
  "terminalGrowth",
  "forwardPe",
  "cloudEvEbit",
  "aiValueMultiple",
  "exitMultiple",
  "otherBetsValue",
  "netCashPerShare",
  "dividendYield",
] as const;

export function getGooglScenarioDefaults(scenario: Scenario) {
  return googlScenarioDefaults[scenario];
}

export function matchGooglScenario(values: GooglAssumptions): Scenario | "Custom" {
  const scenarios = Object.entries(googlScenarioDefaults) as Array<[Scenario, GooglAssumptions]>;
  for (const [scenario, defaults] of scenarios) {
    if (Object.keys(defaults).every((key) => Math.abs(values[key as keyof GooglAssumptions] - defaults[key as keyof GooglAssumptions]) < 0.0001)) return scenario;
  }
  return "Custom";
}

export function pickGooglValuationAssumptions(values: Record<string, number>) {
  return Object.fromEntries(googlValuationAssumptionKeys.map((key) => [key, values[key]]));
}
