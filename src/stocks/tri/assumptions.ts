import type { ValuationAssumption } from "../types";
import { defaultTriValuationAssumptions, triScenarioPresets } from "./calculations";

export { triScenarioPresets };

export const triAssumptionDefinitions: ValuationAssumption[] = [
  { key: "currentPrice", label: "Current Price", value: defaultTriValuationAssumptions.currentPrice, min: 50, max: 180, step: 0.5, format: "currency", source: "actual", description: "Third-party dated TRI market price.", category: "Market", unit: "USD", asOfDate: "2026-05-07", provenance: "StockAnalysis market snapshot" },
  { key: "revenueCagr", label: "Revenue CAGR", value: defaultTriValuationAssumptions.revenueCagr, min: 0.02, max: 0.12, step: 0.0025, format: "percent", source: "assumption", description: "Five-year revenue CAGR assumption.", category: "Growth", unit: "percent" },
  { key: "big3OrganicGrowth", label: "Big 3 Organic Growth", value: defaultTriValuationAssumptions.big3OrganicGrowth, min: 0.04, max: 0.14, step: 0.0025, format: "percent", source: "assumption", description: "Organic growth for Legal, Corporates and Tax/Audit/Accounting.", category: "Growth", unit: "percent" },
  { key: "terminalAdjustedEbitdaMargin", label: "Terminal EBITDA Margin", value: defaultTriValuationAssumptions.terminalAdjustedEbitdaMargin, min: 0.34, max: 0.47, step: 0.0025, format: "percent", source: "assumption", description: "Terminal adjusted EBITDA margin after AI investment and operating leverage.", category: "Margin", unit: "percent" },
  { key: "fcfConversionOfEbitda", label: "FCF / EBITDA", value: defaultTriValuationAssumptions.fcfConversionOfEbitda, min: 0.45, max: 0.75, step: 0.01, format: "percent", source: "assumption", description: "Normalized free cash flow conversion of adjusted EBITDA.", category: "Cash Flow", unit: "percent" },
  { key: "targetFcfYield", label: "Target FCF Yield", value: defaultTriValuationAssumptions.targetFcfYield, min: 0.035, max: 0.075, step: 0.001, format: "percent", source: "assumption", description: "Target normalized FCF yield.", category: "Valuation", unit: "percent" },
  { key: "targetEvEbitda", label: "Target EV / EBITDA", value: defaultTriValuationAssumptions.targetEvEbitda, min: 10, max: 22, step: 0.25, format: "multiple", source: "assumption", description: "Forward EV/EBITDA multiple.", category: "Valuation", unit: "multiple" },
  { key: "targetPe", label: "Target P/E", value: defaultTriValuationAssumptions.targetPe, min: 14, max: 30, step: 0.25, format: "multiple", source: "assumption", description: "Forward P/E cross-check multiple.", category: "Valuation", unit: "multiple" },
  { key: "wacc", label: "WACC", value: defaultTriValuationAssumptions.wacc, min: 0.065, max: 0.1, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for FCFF DCF.", category: "DCF", unit: "percent" },
  { key: "terminalGrowth", label: "Terminal Growth", value: defaultTriValuationAssumptions.terminalGrowth, min: 0.01, max: 0.035, step: 0.001, format: "percent", source: "assumption", description: "Long-term terminal growth.", category: "DCF", unit: "percent" },
  { key: "aiPremium", label: "AI Premium", value: defaultTriValuationAssumptions.aiPremium, min: 0, max: 0.08, step: 0.005, format: "percent", source: "assumption", description: "Capped premium for CoCounsel and professional-grade AI workflow proof.", category: "AI", unit: "percent" },
  { key: "riskDiscount", label: "Risk Discount", value: defaultTriValuationAssumptions.riskDiscount, min: -0.12, max: 0, step: 0.005, format: "percent", source: "assumption", description: "Capped discount for AI commoditization, margin and execution risks.", category: "Risk", unit: "percent" },
];
