import type { StockValuationConfig, ValuationAssumption, ValuationScenario } from "../types";

export type AmznValuationAssumptions = {
  currentPrice: number;
  dilutedShares: number;
  netDebt: number;
  awsGrowth: number;
  awsOperatingMargin: number;
  northAmericaGrowth: number;
  northAmericaOperatingMargin: number;
  internationalGrowth: number;
  internationalOperatingMargin: number;
  advertisingGrowth: number;
  advertisingContributionMargin: number;
  subscriptionGrowth: number;
  normalizedFcfMargin: number;
  maintenanceCapexIntensity: number;
  aiCapexDrag: number;
  kuiperOptionValue: number;
  discountRate: number;
  terminalGrowth: number;
  targetFcfYield: number;
  evEbitMultiple: number;
  awsRevenueMultiple: number;
  advertisingRevenueMultiple: number;
  retailEbitMultiple: number;
  subscriptionRevenueMultiple: number;
};

export const defaultAmznValuationAssumptions: AmznValuationAssumptions = {
  currentPrice: 188,
  dilutedShares: 10_650,
  netDebt: -45_000,
  awsGrowth: 0.17,
  awsOperatingMargin: 0.31,
  northAmericaGrowth: 0.10,
  northAmericaOperatingMargin: 0.055,
  internationalGrowth: 0.11,
  internationalOperatingMargin: 0.025,
  advertisingGrowth: 0.20,
  advertisingContributionMargin: 0.42,
  subscriptionGrowth: 0.10,
  normalizedFcfMargin: 0.085,
  maintenanceCapexIntensity: 0.065,
  aiCapexDrag: 0.015,
  kuiperOptionValue: 20_000,
  discountRate: 0.088,
  terminalGrowth: 0.035,
  targetFcfYield: 0.035,
  evEbitMultiple: 28,
  awsRevenueMultiple: 7.2,
  advertisingRevenueMultiple: 6.5,
  retailEbitMultiple: 18,
  subscriptionRevenueMultiple: 3.0,
};

export const amznScenarioPresets: Record<"Bear" | "Base" | "Bull", AmznValuationAssumptions> = {
  Bear: {
    ...defaultAmznValuationAssumptions,
    awsGrowth: 0.11,
    awsOperatingMargin: 0.27,
    northAmericaGrowth: 0.06,
    northAmericaOperatingMargin: 0.035,
    internationalGrowth: 0.05,
    internationalOperatingMargin: -0.005,
    advertisingGrowth: 0.13,
    advertisingContributionMargin: 0.36,
    normalizedFcfMargin: 0.055,
    maintenanceCapexIntensity: 0.078,
    aiCapexDrag: 0.028,
    kuiperOptionValue: 0,
    discountRate: 0.096,
    terminalGrowth: 0.025,
    targetFcfYield: 0.047,
    evEbitMultiple: 21,
    awsRevenueMultiple: 4.8,
    advertisingRevenueMultiple: 4.4,
    retailEbitMultiple: 12,
    subscriptionRevenueMultiple: 2.0,
  },
  Base: defaultAmznValuationAssumptions,
  Bull: {
    ...defaultAmznValuationAssumptions,
    awsGrowth: 0.23,
    awsOperatingMargin: 0.34,
    northAmericaGrowth: 0.12,
    northAmericaOperatingMargin: 0.07,
    internationalGrowth: 0.14,
    internationalOperatingMargin: 0.045,
    advertisingGrowth: 0.25,
    advertisingContributionMargin: 0.48,
    normalizedFcfMargin: 0.11,
    maintenanceCapexIntensity: 0.055,
    aiCapexDrag: 0.008,
    kuiperOptionValue: 45_000,
    discountRate: 0.082,
    terminalGrowth: 0.04,
    targetFcfYield: 0.029,
    evEbitMultiple: 33,
    awsRevenueMultiple: 9.0,
    advertisingRevenueMultiple: 8.0,
    retailEbitMultiple: 22,
    subscriptionRevenueMultiple: 3.8,
  },
};

export const amznValuationAssumptionDefinitions: ValuationAssumption[] = [
  { key: "awsGrowth", label: "AWS Growth", value: defaultAmznValuationAssumptions.awsGrowth, min: 0.02, max: 0.35, step: 0.005, format: "percent", source: "assumption", description: "AWS revenue growth underwriting input.", category: "AWS AI Economics", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "awsOperatingMargin", label: "AWS Margin", value: defaultAmznValuationAssumptions.awsOperatingMargin, min: 0.15, max: 0.42, step: 0.005, format: "percent", source: "assumption", description: "AWS operating margin after AI infrastructure price and depreciation pressure.", category: "AWS AI Economics", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "northAmericaOperatingMargin", label: "NA Retail Margin", value: defaultAmznValuationAssumptions.northAmericaOperatingMargin, min: 0.0, max: 0.10, step: 0.0025, format: "percent", source: "assumption", description: "North America operating margin after fulfillment regionalization and cost discipline.", category: "Retail Margin Bridge", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "internationalOperatingMargin", label: "International Margin", value: defaultAmznValuationAssumptions.internationalOperatingMargin, min: -0.06, max: 0.08, step: 0.0025, format: "percent", source: "assumption", description: "International retail profit inflection versus reinvestment and competition.", category: "Retail Margin Bridge", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "advertisingGrowth", label: "Advertising Growth", value: defaultAmznValuationAssumptions.advertisingGrowth, min: 0.02, max: 0.40, step: 0.005, format: "percent", source: "assumption", description: "Retail media and sponsored ads growth.", category: "Advertising Profit Pool", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "advertisingContributionMargin", label: "Ad Contribution Margin", value: defaultAmznValuationAssumptions.advertisingContributionMargin, min: 0.20, max: 0.65, step: 0.005, format: "percent", source: "assumption", description: "Advertising profit-pool contribution margin used in SOTP.", category: "Advertising Profit Pool", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "normalizedFcfMargin", label: "Normalized FCF Margin", value: defaultAmznValuationAssumptions.normalizedFcfMargin, min: 0.02, max: 0.16, step: 0.005, format: "percent", source: "assumption", description: "FCF margin after separating maintenance capex from growth capex.", category: "FCF / Capex Debate", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "maintenanceCapexIntensity", label: "Maintenance Capex", value: defaultAmznValuationAssumptions.maintenanceCapexIntensity, min: 0.025, max: 0.13, step: 0.005, format: "percent", source: "assumption", description: "Maintenance capex as a percent of revenue.", category: "FCF / Capex Debate", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "aiCapexDrag", label: "AI Capex Drag", value: defaultAmznValuationAssumptions.aiCapexDrag, min: 0, max: 0.05, step: 0.0025, format: "percent", source: "assumption", description: "Near-term normalized FCF drag from AI infrastructure capex and depreciation.", category: "FCF / Capex Debate", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "kuiperOptionValue", label: "Kuiper Option Value", value: defaultAmznValuationAssumptions.kuiperOptionValue, min: 0, max: 80_000, step: 1_000, format: "currency", source: "assumption", description: "Enterprise value credit for Project Kuiper optionality, before dilution risk.", category: "Project Kuiper Optionality", unit: "USD", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "discountRate", label: "Discount Rate", value: defaultAmznValuationAssumptions.discountRate, min: 0.065, max: 0.12, step: 0.0025, format: "percent", source: "assumption", description: "FCFF discount rate.", category: "Valuation", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "targetFcfYield", label: "Target FCF Yield", value: defaultAmznValuationAssumptions.targetFcfYield, min: 0.02, max: 0.07, step: 0.0025, format: "percent", source: "assumption", description: "Normalized FCF yield valuation anchor.", category: "Valuation", unit: "percent", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "evEbitMultiple", label: "EV / EBIT", value: defaultAmznValuationAssumptions.evEbitMultiple, min: 12, max: 42, step: 0.5, format: "multiple", source: "assumption", description: "Consolidated forward EV / EBIT check.", category: "Valuation", unit: "multiple", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "awsRevenueMultiple", label: "AWS Sales Multiple", value: defaultAmznValuationAssumptions.awsRevenueMultiple, min: 3, max: 12, step: 0.25, format: "multiple", source: "assumption", description: "AWS SOTP revenue multiple.", category: "SOTP", unit: "multiple", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
  { key: "advertisingRevenueMultiple", label: "Ad Sales Multiple", value: defaultAmznValuationAssumptions.advertisingRevenueMultiple, min: 2, max: 11, step: 0.25, format: "multiple", source: "assumption", description: "Advertising profit-pool SOTP revenue multiple.", category: "SOTP", unit: "multiple", periodicity: "forward annual", asOfDate: "2026-05-12", provenance: "forecast_assumption: AMZN scenario framework" },
];

export const amznScenarioConfig: ValuationScenario[] = Object.entries(amznScenarioPresets).map(([name, assumptions]) => ({
  name: name as "Bear" | "Base" | "Bull",
  assumptions,
}));

export type AmznValuationConfig = StockValuationConfig;
