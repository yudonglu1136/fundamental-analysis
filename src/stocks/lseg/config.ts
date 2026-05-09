import type { StockModule, StockValuationConfig } from "../types";
import { priceMetadataByTicker } from "../../utils/valuation";
import { LsegDashboard } from "./dashboard";
import { calculateLsegSummary, calculateLsegValuation, defaultLsegValuationAssumptions, getLsegPeriods } from "./calculations";
import { lsegMockData } from "./data";

const lsegValuationConfig: StockValuationConfig = {
  ticker: "LSEG",
  modelType: "P/E / FCF / DCF / SOTP",
  priceMetadata: priceMetadataByTicker.LSEG,
  assumptions: [
    { key: "currentPrice", label: "Current Price", value: defaultLsegValuationAssumptions.currentPrice, min: 60, max: 180, step: 0.1, format: "currency", source: "actual", description: "Current share price for upside/downside and expected returns.", category: "Earnings", unit: "GBP", periodicity: "annual", asOfDate: priceMetadataByTicker.LSEG.asOfDate, provenance: "Local mock market reference in GBP. Any GBX inputs should be converted at ingest." },
    { key: "forwardAdjustedEps", label: "Forward Adjusted EPS", value: 4.73, min: 3, max: 7, step: 0.01, format: "currency", source: "consensus", description: "Forward adjusted EPS anchor for P/E valuation.", category: "Earnings", unit: "GBP", periodicity: "forward annual", asOfDate: "2026-05-09", provenance: "Consensus-style annual EPS in GBP, not pence." },
    { key: "equityFcfPerShare", label: "Equity FCF per Share", value: 4.58, min: 2, max: 7, step: 0.01, format: "currency", source: "consensus", description: "Cash earnings per share used for yield and DCF work.", category: "Cash Flow", unit: "GBP", periodicity: "annual", asOfDate: "2026-05-09", provenance: "Annual FCF per share in GBP." },
    { key: "targetFcfYield", label: "Target FCF Yield", value: 0.04, min: 0.025, max: 0.07, step: 0.001, format: "percent", source: "assumption", description: "Valuation yield anchor on FCF per share.", category: "Cash Flow" },
    { key: "organicIncomeGrowth", label: "Organic Income Growth", value: 0.07, min: 0, max: 0.15, step: 0.001, format: "percent", source: "assumption", description: "Core earnings growth excluding one-offs.", category: "Growth & Margin" },
    { key: "ebitdaMarginExpansionBps", label: "EBITDA Margin Expansion, bps", value: 75, min: 0, max: 200, step: 5, format: "number", source: "derived", description: "Incremental margin expansion from mix and operating leverage.", category: "Growth & Margin" },
    { key: "refinitivSynergyUplift", label: "Refinitiv Synergy Uplift", value: 0.008, min: 0, max: 0.02, step: 0.001, format: "percent", source: "assumption", description: "Residual synergy lift to margins and earnings.", category: "Synergies" },
    { key: "swapclearEpsContribution", label: "SwapClear EPS Contribution", value: 0.45, min: 0, max: 1, step: 0.01, format: "currency", source: "assumption", description: "EPS contribution from clearing and rates volatility monetization.", category: "Synergies" },
    { key: "wacc", label: "WACC", value: 0.08, min: 0.06, max: 0.11, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for DCF valuation.", category: "DCF" },
    { key: "terminalGrowth", label: "Terminal Growth", value: 0.025, min: 0.01, max: 0.04, step: 0.001, format: "percent", source: "assumption", description: "Long-run FCF growth in terminal value.", category: "DCF" },
    { key: "capexIntensity", label: "Capex Intensity", value: 0.1, min: 0.05, max: 0.15, step: 0.001, format: "percent", source: "derived", description: "Capex drag on FCF growth and conversion.", category: "DCF" },
    { key: "targetPe", label: "Target P/E Multiple", value: 25, min: 16, max: 35, step: 0.1, format: "multiple", source: "consensus", description: "Near-term fair-value multiple on forward adjusted EPS.", category: "Multiple" },
    { key: "exitPe", label: "Exit P/E Multiple", value: 24, min: 16, max: 35, step: 0.1, format: "multiple", source: "assumption", description: "Exit multiple for expected price and return work.", category: "Multiple" },
  ],
  scenarios: [
    { name: "Bear", assumptions: { currentPrice: 107.8, forwardAdjustedEps: 4.45, targetPe: 21, equityFcfPerShare: 4.2, targetFcfYield: 0.048, organicIncomeGrowth: 0.05, ebitdaMarginExpansionBps: 25, wacc: 0.085, terminalGrowth: 0.02, refinitivSynergyUplift: 0.002, swapclearEpsContribution: 0.2, capexIntensity: 0.11, exitPe: 21 } },
    { name: "Base", assumptions: { currentPrice: 107.8, forwardAdjustedEps: 4.73, targetPe: 25, equityFcfPerShare: 4.58, targetFcfYield: 0.04, organicIncomeGrowth: 0.07, ebitdaMarginExpansionBps: 75, wacc: 0.08, terminalGrowth: 0.025, refinitivSynergyUplift: 0.008, swapclearEpsContribution: 0.45, capexIntensity: 0.1, exitPe: 24 } },
    { name: "Bull", assumptions: { currentPrice: 107.8, forwardAdjustedEps: 5.1, targetPe: 27, equityFcfPerShare: 5, targetFcfYield: 0.036, organicIncomeGrowth: 0.085, ebitdaMarginExpansionBps: 100, wacc: 0.075, terminalGrowth: 0.03, refinitivSynergyUplift: 0.012, swapclearEpsContribution: 0.65, capexIntensity: 0.09, exitPe: 26 } },
  ],
  calculateValuation: (assumptions, data) => calculateLsegValuation(data as typeof lsegMockData, getLsegPeriods()[getLsegPeriods().length - 1]?.value ?? "", "Base", { ...defaultLsegValuationAssumptions, ...(assumptions as Partial<typeof defaultLsegValuationAssumptions>) }),
};

export const lsegModule: StockModule = {
  ticker: "LSEG",
  name: "London Stock Exchange Group",
  sector: "Market Infrastructure / Financial Data",
  currency: "GBP",
  description: "Subscription quality, FTSE Russell, Refinitiv synergies, Post Trade economics, FCF bridge, peers, and valuation.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "data-quality", label: "Data Quality" },
    { value: "eps-quality", label: "EPS Quality" },
    { value: "fcf", label: "FCF" },
    { value: "synergies", label: "Synergies" },
    { value: "peers", label: "Peer Read-Through" },
    { value: "valuation", label: "Valuation" },
  ],
  periods: getLsegPeriods(),
  data: lsegMockData,
  getDefaultPeriod: () => {
    const periods = getLsegPeriods();
    return periods[periods.length - 1]?.value ?? "";
  },
  calculateSummary: (data) => {
    const periods = getLsegPeriods();
    return calculateLsegSummary(data as typeof lsegMockData, periods[periods.length - 1]?.value ?? "");
  },
  calculateValuation: (data, _assumptions, scenario) => {
    const periods = getLsegPeriods();
    return calculateLsegValuation(data as typeof lsegMockData, periods[periods.length - 1]?.value ?? "", scenario ?? "Base");
  },
  valuationConfig: lsegValuationConfig,
  Dashboard: LsegDashboard,
};
