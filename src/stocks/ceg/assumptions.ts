import type { StockValuationConfig } from "../types";
import type { CegScenarioPresetMap, CegValuationAssumptions } from "./model";

export const defaultCegValuationAssumptions: CegValuationAssumptions = {
  currentPrice: 260.8,
  dilutedShares: 354,
  normalizedRevenue: 30_000,
  revenueGrowth: 0.055,
  operatingMargin: 0.20,
  normalizedFcfMargin: 0.12,
  targetFcfYield: 0.045,
  targetPe: 24,
  evEbitdaMultiple: 15,
  discountRate: 0.085,
  terminalGrowth: 0.025,
  nuclearScarcityPremium: 0.12,
  powerPriceUpside: 0.06,
  dataCenterDemandUplift: 0.08,
  regulatoryHaircut: 0.07,
  commodityHedgeHaircut: 0.06,
  balanceSheetHaircut: 0.03,
  dividendYield: 0.006,
  buybackYield: 0.006,
};

export const cegScenarioPresets: CegScenarioPresetMap = {
  Bear: {
    ...defaultCegValuationAssumptions,
    revenueGrowth: 0.015,
    operatingMargin: 0.155,
    normalizedFcfMargin: 0.075,
    targetFcfYield: 0.06,
    targetPe: 16,
    evEbitdaMultiple: 10,
    discountRate: 0.095,
    nuclearScarcityPremium: 0.02,
    powerPriceUpside: -0.04,
    dataCenterDemandUplift: 0.01,
    regulatoryHaircut: 0.13,
    commodityHedgeHaircut: 0.11,
    balanceSheetHaircut: 0.06,
    buybackYield: 0,
  },
  Base: defaultCegValuationAssumptions,
  Bull: {
    ...defaultCegValuationAssumptions,
    revenueGrowth: 0.085,
    operatingMargin: 0.235,
    normalizedFcfMargin: 0.15,
    targetFcfYield: 0.035,
    targetPe: 30,
    evEbitdaMultiple: 18,
    discountRate: 0.078,
    nuclearScarcityPremium: 0.20,
    powerPriceUpside: 0.11,
    dataCenterDemandUplift: 0.14,
    regulatoryHaircut: 0.045,
    commodityHedgeHaircut: 0.04,
    balanceSheetHaircut: 0.02,
    buybackYield: 0.01,
  },
};

export function buildCegValuationConfig(
  calculateValuation: StockValuationConfig["calculateValuation"],
): StockValuationConfig {
  return {
    ticker: "CEG",
    modelType: "nuclear-power-scarcity-dcf-fcf-pe-ev-ebitda-triangulation",
    assumptions: [
      { key: "normalizedRevenue", label: "Normalized Revenue", value: defaultCegValuationAssumptions.normalizedRevenue, min: 18_000, max: 45_000, step: 250, format: "currency", source: "assumption", description: "Through-cycle revenue base after commodity and Calpine normalization.", category: "Scale", unit: "USD", periodicity: "forward annual" },
      { key: "revenueGrowth", label: "Revenue Growth", value: defaultCegValuationAssumptions.revenueGrowth, min: -0.03, max: 0.14, step: 0.005, format: "percent", source: "assumption", description: "Normalized growth from power prices, contracted load, PTC support and Calpine contribution.", category: "Growth", unit: "percent", periodicity: "forward annual" },
      { key: "operatingMargin", label: "Operating Margin", value: defaultCegValuationAssumptions.operatingMargin, min: 0.10, max: 0.30, step: 0.005, format: "percent", source: "assumption", description: "Normalized operating margin after fuel, hedge, PTC and integration effects.", category: "Margins", unit: "percent" },
      { key: "normalizedFcfMargin", label: "Normalized FCF Margin", value: defaultCegValuationAssumptions.normalizedFcfMargin, min: 0.03, max: 0.20, step: 0.005, format: "percent", source: "assumption", description: "Free cash flow conversion after nuclear maintenance, growth capex and collateral normalization.", category: "Cash Flow", unit: "percent" },
      { key: "targetFcfYield", label: "Target FCF Yield", value: defaultCegValuationAssumptions.targetFcfYield, min: 0.025, max: 0.075, step: 0.001, format: "percent", source: "assumption", description: "FCF yield guardrail for a scarce nuclear infrastructure equity.", category: "Valuation", unit: "percent" },
      { key: "targetPe", label: "Target P/E", value: defaultCegValuationAssumptions.targetPe, min: 10, max: 36, step: 0.5, format: "multiple", source: "assumption", description: "Normalized earnings multiple after commodity and regulatory risk.", category: "Valuation", unit: "multiple" },
      { key: "evEbitdaMultiple", label: "EV/EBITDA", value: defaultCegValuationAssumptions.evEbitdaMultiple, min: 7, max: 22, step: 0.5, format: "multiple", source: "assumption", description: "Infrastructure-style EV/EBITDA check after net debt and integration risk.", category: "Valuation", unit: "multiple" },
      { key: "discountRate", label: "Discount Rate", value: defaultCegValuationAssumptions.discountRate, min: 0.065, max: 0.11, step: 0.0025, format: "percent", source: "assumption", description: "Cost of equity / FCFF discount rate reflecting regulated-adjacent and merchant power risk.", category: "Valuation", unit: "percent" },
      { key: "nuclearScarcityPremium", label: "Nuclear Scarcity Premium", value: defaultCegValuationAssumptions.nuclearScarcityPremium, min: 0, max: 0.30, step: 0.005, format: "percent", source: "assumption", description: "Premium for reliable zero-carbon baseload scarcity and PTC floor support.", category: "Thesis", unit: "percent" },
      { key: "dataCenterDemandUplift", label: "AI Load Uplift", value: defaultCegValuationAssumptions.dataCenterDemandUplift, min: 0, max: 0.24, step: 0.005, format: "percent", source: "assumption", description: "Value uplift from contracted AI/data-center demand and long-duration PPAs.", category: "Thesis", unit: "percent" },
      { key: "powerPriceUpside", label: "Power Price Upside", value: defaultCegValuationAssumptions.powerPriceUpside, min: -0.08, max: 0.18, step: 0.005, format: "percent", source: "assumption", description: "Forward-curve and realized price uplift/haircut separated from base growth.", category: "Thesis", unit: "percent" },
      { key: "regulatoryHaircut", label: "Regulatory Haircut", value: defaultCegValuationAssumptions.regulatoryHaircut, min: 0, max: 0.20, step: 0.005, format: "percent", source: "assumption", description: "FERC/state market design, consumer-bill, interconnection and political risk haircut.", category: "Risk", unit: "percent" },
      { key: "commodityHedgeHaircut", label: "Commodity / Hedge Risk", value: defaultCegValuationAssumptions.commodityHedgeHaircut, min: 0, max: 0.18, step: 0.005, format: "percent", source: "assumption", description: "Commodity, hedge roll and collateral risk haircut.", category: "Risk", unit: "percent" },
      { key: "balanceSheetHaircut", label: "Balance Sheet Haircut", value: defaultCegValuationAssumptions.balanceSheetHaircut, min: 0, max: 0.10, step: 0.005, format: "percent", source: "assumption", description: "Net debt, Calpine integration and capital-allocation risk.", category: "Risk", unit: "percent" },
    ],
    scenarios: [
      { name: "Bear", assumptions: cegScenarioPresets.Bear },
      { name: "Base", assumptions: cegScenarioPresets.Base },
      { name: "Bull", assumptions: cegScenarioPresets.Bull },
    ],
    calculateValuation,
  };
}
