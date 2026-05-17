import type { StockValuationConfig } from "../types";
import type { VScenarioPresetMap, ValuationAssumptions } from "./model";

export const defaultVValuationAssumptions: ValuationAssumptions = {
  currentPrice: 489.94,
  dilutedShares: 908,
  revenueGrowth: 0.105,
  crossBorderGrowth: 0.13,
  switchedTransactionGrowth: 0.10,
  valueAddedServicesGrowth: 0.15,
  operatingMargin: 0.585,
  normalizedFcfMargin: 0.49,
  targetFcfYield: 0.028,
  targetPe: 34,
  targetEvEbit: 29,
  discountRate: 0.082,
  terminalGrowth: 0.035,
  regulatoryHaircut: 0.035,
  alternativeRailsHaircut: 0.015,
  buybackYield: 0.022,
  dividendYield: 0.006,
};

export const vScenarioPresets: VScenarioPresetMap = {
  Bear: {
    ...defaultVValuationAssumptions,
    revenueGrowth: 0.065,
    crossBorderGrowth: 0.06,
    switchedTransactionGrowth: 0.07,
    valueAddedServicesGrowth: 0.10,
    operatingMargin: 0.555,
    normalizedFcfMargin: 0.455,
    targetFcfYield: 0.034,
    targetPe: 27,
    targetEvEbit: 23,
    discountRate: 0.09,
    terminalGrowth: 0.025,
    regulatoryHaircut: 0.09,
    alternativeRailsHaircut: 0.04,
    buybackYield: 0.014,
  },
  Base: defaultVValuationAssumptions,
  Bull: {
    ...defaultVValuationAssumptions,
    revenueGrowth: 0.125,
    crossBorderGrowth: 0.16,
    switchedTransactionGrowth: 0.12,
    valueAddedServicesGrowth: 0.18,
    operatingMargin: 0.605,
    normalizedFcfMargin: 0.51,
    targetFcfYield: 0.025,
    targetPe: 39,
    targetEvEbit: 33,
    discountRate: 0.078,
    terminalGrowth: 0.04,
    regulatoryHaircut: 0.02,
    alternativeRailsHaircut: 0.01,
    buybackYield: 0.026,
  },
};

export function buildVValuationConfig(
  calculateValuation: StockValuationConfig["calculateValuation"],
): StockValuationConfig {
  return {
    ticker: "V",
    modelType: "payments-network-dcf-fcf-multiple-triangulation",
    assumptions: [
      { key: "revenueGrowth", label: "Revenue Growth", value: defaultVValuationAssumptions.revenueGrowth, min: 0.02, max: 0.18, step: 0.005, format: "percent", source: "assumption", description: "Core net revenue growth after cross-border, switched transactions and VAS mix.", category: "Growth", unit: "percent", periodicity: "forward annual" },
      { key: "crossBorderGrowth", label: "Cross-Border Growth", value: defaultVValuationAssumptions.crossBorderGrowth, min: -0.05, max: 0.25, step: 0.005, format: "percent", source: "assumption", description: "Travel-sensitive cross-border volume growth.", category: "Growth", unit: "percent", periodicity: "forward annual" },
      { key: "switchedTransactionGrowth", label: "Switched Transactions", value: defaultVValuationAssumptions.switchedTransactionGrowth, min: 0.02, max: 0.18, step: 0.005, format: "percent", source: "assumption", description: "Switched transaction growth across Visa's network.", category: "Network", unit: "percent", periodicity: "forward annual" },
      { key: "valueAddedServicesGrowth", label: "VAS Growth", value: defaultVValuationAssumptions.valueAddedServicesGrowth, min: 0.05, max: 0.25, step: 0.005, format: "percent", source: "assumption", description: "Value-added services, cyber, data analytics and consulting growth.", category: "Revenue Mix", unit: "percent", periodicity: "forward annual" },
      { key: "operatingMargin", label: "Operating Margin", value: defaultVValuationAssumptions.operatingMargin, min: 0.48, max: 0.64, step: 0.005, format: "percent", source: "assumption", description: "Normalized operating margin after incremental scale and regulatory pressure.", category: "Margins", unit: "percent", periodicity: "forward annual" },
      { key: "normalizedFcfMargin", label: "FCF Margin", value: defaultVValuationAssumptions.normalizedFcfMargin, min: 0.38, max: 0.56, step: 0.005, format: "percent", source: "assumption", description: "Equity FCF conversion after capex.", category: "Cash Flow", unit: "percent", periodicity: "forward annual" },
      { key: "targetFcfYield", label: "Target FCF Yield", value: defaultVValuationAssumptions.targetFcfYield, min: 0.02, max: 0.045, step: 0.001, format: "percent", source: "assumption", description: "FCF yield used in valuation triangulation.", category: "Valuation", unit: "percent" },
      { key: "targetPe", label: "Target P/E", value: defaultVValuationAssumptions.targetPe, min: 20, max: 45, step: 0.5, format: "multiple", source: "assumption", description: "Premium earnings multiple durability versus growth normalization.", category: "Valuation", unit: "multiple" },
      { key: "targetEvEbit", label: "Target EV/EBIT", value: defaultVValuationAssumptions.targetEvEbit, min: 18, max: 38, step: 0.5, format: "multiple", source: "assumption", description: "Operating-income multiple for a capital-light network.", category: "Valuation", unit: "multiple" },
      { key: "regulatoryHaircut", label: "Regulatory Haircut", value: defaultVValuationAssumptions.regulatoryHaircut, min: 0, max: 0.12, step: 0.005, format: "percent", source: "assumption", description: "Network-fee, routing, and interchange/regulatory risk haircut.", category: "Risk", unit: "percent" },
      { key: "alternativeRailsHaircut", label: "Alt Rails Haircut", value: defaultVValuationAssumptions.alternativeRailsHaircut, min: 0, max: 0.08, step: 0.005, format: "percent", source: "assumption", description: "Competition from Visa, Amex, domestic networks, RTP and account-to-account rails.", category: "Risk", unit: "percent" },
      { key: "buybackYield", label: "Buyback Yield", value: defaultVValuationAssumptions.buybackYield, min: 0, max: 0.04, step: 0.0025, format: "percent", source: "assumption", description: "Gross buyback support to EPS growth.", category: "Capital Return", unit: "percent" },
    ],
    scenarios: [
      { name: "Bear", assumptions: vScenarioPresets.Bear },
      { name: "Base", assumptions: vScenarioPresets.Base },
      { name: "Bull", assumptions: vScenarioPresets.Bull },
    ],
    calculateValuation,
  };
}
