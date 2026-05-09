import type { StockModule, StockValuationConfig } from "../types";
import { priceMetadataByTicker } from "../../utils/valuation";
import { LsegDashboard } from "./dashboard";
import {
  calculateLsegSummary,
  calculateLsegValuation,
  defaultLsegValuationAssumptions,
  getDefaultLsegPeriod,
  getLsegPeriods,
  lsegScenarioPresets,
} from "./calculations";
import { lsegMockData } from "./data";

const lsegValuationConfig: StockValuationConfig = {
  ticker: "LSEG",
  modelType: "Platform Moat / FCF / DCF / SOTP",
  priceMetadata: priceMetadataByTicker.LSEG,
  assumptions: [
    { key: "currentPrice", label: "Current Price", value: defaultLsegValuationAssumptions.currentPrice, min: 60, max: 180, step: 0.1, format: "currency", source: "actual", description: "Current share price for upside/downside and expected return analysis.", category: "Market", unit: "GBP", periodicity: "annual", asOfDate: priceMetadataByTicker.LSEG.asOfDate, provenance: "Local mock market reference in GBP." },
    { key: "forwardAdjustedEps", label: "Forward Adjusted EPS", value: defaultLsegValuationAssumptions.forwardAdjustedEps, min: 3.5, max: 7, step: 0.01, format: "currency", source: "consensus", description: "Near-term EPS anchor, still useful but no longer the only lens.", category: "Earnings", unit: "GBP", periodicity: "forward annual" },
    { key: "equityFcfPerShare", label: "Equity FCF per Share", value: defaultLsegValuationAssumptions.equityFcfPerShare, min: 2.5, max: 7, step: 0.01, format: "currency", source: "consensus", description: "Cash earnings per share used for FCF yield and DCF valuation.", category: "Cash Flow", unit: "GBP", periodicity: "annual" },
    { key: "targetFcfYield", label: "Target FCF Yield", value: defaultLsegValuationAssumptions.targetFcfYield, min: 0.025, max: 0.07, step: 0.001, format: "percent", source: "assumption", description: "Yield anchor for capitalizing FCF per share.", category: "Cash Flow" },
    { key: "recurringRevenueGrowth", label: "Recurring Revenue Growth", value: defaultLsegValuationAssumptions.recurringRevenueGrowth, min: 0.03, max: 0.12, step: 0.001, format: "percent", source: "assumption", description: "Growth rate driven by recurring economics, not by one-off synergy extraction.", category: "Recurring Economics" },
    { key: "structuralMarginExpansionBps", label: "Structural Margin Expansion, bps", value: defaultLsegValuationAssumptions.structuralMarginExpansionBps, min: 0, max: 160, step: 5, format: "number", source: "derived", description: "Margin improvement supported by recurring mix, pricing, digital delivery, and clearing leverage.", category: "Margin Durability" },
    { key: "workflowLockInScore", label: "Workflow Lock-In Score", value: defaultLsegValuationAssumptions.workflowLockInScore, min: 40, max: 95, step: 1, format: "number", source: "derived", description: "Platform dependency, switching costs, and workflow depth score.", category: "Moat" },
    { key: "pricingPowerScore", label: "Pricing Power Score", value: defaultLsegValuationAssumptions.pricingPowerScore, min: 40, max: 90, step: 1, format: "number", source: "derived", description: "Pricing realization and bundle leverage score.", category: "Moat" },
    { key: "recurringRevenueQualityScore", label: "Recurring Revenue Quality Score", value: defaultLsegValuationAssumptions.recurringRevenueQualityScore, min: 50, max: 95, step: 1, format: "number", source: "derived", description: "Retention, subscription mix, contract duration, and recurring FCF durability.", category: "Moat" },
    { key: "postTradeMoatScore", label: "Post Trade Moat Score", value: defaultLsegValuationAssumptions.postTradeMoatScore, min: 45, max: 95, step: 1, format: "number", source: "derived", description: "Network density, collateral utility, pricing power, and regulatory barrier score.", category: "Infrastructure" },
    { key: "platformRoic", label: "Blended Platform ROIC", value: defaultLsegValuationAssumptions.platformRoic, min: 0.1, max: 0.3, step: 0.001, format: "percent", source: "derived", description: "Incremental ROIC from workflow, clearing, and synergy reinvestment.", category: "Platform ROIC" },
    { key: "wacc", label: "WACC", value: defaultLsegValuationAssumptions.wacc, min: 0.06, max: 0.11, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for DCF valuation.", category: "DCF" },
    { key: "terminalGrowth", label: "Terminal Growth", value: defaultLsegValuationAssumptions.terminalGrowth, min: 0.01, max: 0.04, step: 0.001, format: "percent", source: "assumption", description: "Long-run recurring FCF growth in terminal value.", category: "DCF" },
    { key: "targetPe", label: "Target P/E Multiple", value: defaultLsegValuationAssumptions.targetPe, min: 16, max: 35, step: 0.1, format: "multiple", source: "consensus", description: "Near-term fair value multiple on forward adjusted EPS.", category: "Multiple" },
    { key: "exitPe", label: "Exit P/E Multiple", value: defaultLsegValuationAssumptions.exitPe, min: 16, max: 35, step: 0.1, format: "multiple", source: "assumption", description: "Exit multiple for expected return work.", category: "Multiple" },
    { key: "dividendYield", label: "Dividend Yield", value: defaultLsegValuationAssumptions.dividendYield, min: 0.005, max: 0.03, step: 0.001, format: "percent", source: "actual", description: "Cash return contribution to expected return.", category: "Return" },
  ],
  scenarios: [
    { name: "Bear", assumptions: lsegScenarioPresets.Bear },
    { name: "Base", assumptions: lsegScenarioPresets.Base },
    { name: "Bull", assumptions: lsegScenarioPresets.Bull },
  ],
  calculateValuation: (assumptions, data) =>
    calculateLsegValuation(
      data as typeof lsegMockData,
      getDefaultLsegPeriod(),
      "Base",
      { ...defaultLsegValuationAssumptions, ...(assumptions as Partial<typeof defaultLsegValuationAssumptions>) },
    ),
};

export const lsegModule: StockModule = {
  ticker: "LSEG",
  name: "London Stock Exchange Group",
  sector: "Market Infrastructure / Financial Data",
  currency: "GBP",
  description: "Institutional-grade platform moat, recurring economics, infrastructure, and ROIC analysis for LSEG.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "workflow-moat", label: "Workflow Moat" },
    { value: "recurring-economics", label: "Recurring Economics" },
    { value: "platform-roic", label: "Platform ROIC" },
    { value: "infrastructure-economics", label: "Infrastructure Economics" },
    { value: "data-quality", label: "Data Quality" },
    { value: "eps-quality", label: "EPS Quality" },
    { value: "fcf", label: "FCF" },
    { value: "synergies", label: "Synergies" },
    { value: "peers", label: "Peer Read-Through" },
    { value: "valuation", label: "Valuation" },
  ],
  periods: getLsegPeriods(),
  data: lsegMockData,
  getDefaultPeriod: () => getDefaultLsegPeriod(),
  calculateSummary: (data) => {
    return calculateLsegSummary(data as typeof lsegMockData, getDefaultLsegPeriod());
  },
  calculateValuation: (data, _assumptions, scenario) => {
    return calculateLsegValuation(data as typeof lsegMockData, getDefaultLsegPeriod(), scenario ?? "Base");
  },
  valuationConfig: lsegValuationConfig,
  Dashboard: LsegDashboard,
};
