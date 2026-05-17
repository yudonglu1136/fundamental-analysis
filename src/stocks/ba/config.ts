import type { StockModule, StockValuationConfig } from "../types";
import { BaDashboard } from "./dashboard";
import {
  attachBaRuntimeContext,
  baDataset,
  baScenarioPresets,
  calculateBaSummary,
  calculateBaValuation,
  defaultBaValuationAssumptions,
  getBaPeriods,
  getDefaultBaPeriod,
  resolveBaDataset,
  resolveBaPeriodFromData,
} from "./calculations";
import type { BaValuationAssumptions } from "./model";

const BA_DISCLOSURE_DATE = "2026-02-18";
const BA_ASSUMPTION_NOTE = "analyst_forecast_assumption";

const baPriceMetadata = {
  ticker: "BA.L",
  currentPrice: baDataset.marketData.currentPriceGbp,
  currency: "GBP" as const,
  unit: "share" as const,
  asOfDate: baDataset.marketData.priceDate,
  source: "actual" as const,
  marketReference: baDataset.marketData.currentPriceGbp,
  provenance: `market_data: ${baDataset.marketData.source}`,
};

export const baValuationConfig: StockValuationConfig = {
  ticker: "BA.L",
  modelType: "Defense-prime FCFF / FCF yield / multiples / backlog durability",
  priceMetadata: baPriceMetadata,
  assumptions: [
    { key: "currentPrice", label: "Current Price", value: defaultBaValuationAssumptions.currentPrice, min: 5, max: 40, step: 0.05, format: "currency", source: "actual", description: "BA.L current share price in GBP from BAE investor-relations share-price monitor.", category: "Market", unit: "GBP", periodicity: "annual", asOfDate: baPriceMetadata.asOfDate, provenance: baPriceMetadata.provenance },
    { key: "revenueCagr", label: "Revenue CAGR", value: defaultBaValuationAssumptions.revenueCagr, min: 0, max: 0.12, step: 0.0025, format: "percent", source: "assumption", description: "Forecast sales CAGR after mapping backlog, defence cycle, and management guidance into explicit scenario assumptions.", category: "Growth", unit: "percent", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: `${BA_ASSUMPTION_NOTE}: Base case starts from FY2026 sales guidance and normalizes thereafter.` },
    { key: "operatingMargin", label: "Underlying EBIT Margin", value: defaultBaValuationAssumptions.operatingMargin, min: 0.085, max: 0.13, step: 0.001, format: "percent", source: "assumption", description: "Long-run underlying EBIT margin used in FCFF and multiple cross-checks.", category: "Margin", unit: "percent", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: `${BA_ASSUMPTION_NOTE}: anchored to FY2025 actual 10.8% and FY2026 segment guidance.` },
    { key: "taxRate", label: "Tax Rate", value: defaultBaValuationAssumptions.taxRate, min: 0.18, max: 0.28, step: 0.001, format: "percent", source: "assumption", description: "Effective tax rate used in NOPAT and EPS bridge.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: "management_guidance: FY2026 effective tax rate c.22%." },
    { key: "dAndAIntensity", label: "D&A / Sales", value: defaultBaValuationAssumptions.dAndAIntensity, min: 0.02, max: 0.06, step: 0.001, format: "percent", source: "derived", description: "Depreciation, amortisation and impairment as a percentage of sales.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: "derived: FY2025 D&A and impairment / FY2025 sales." },
    { key: "capexIntensity", label: "Capex / Sales", value: defaultBaValuationAssumptions.capexIntensity, min: 0.02, max: 0.06, step: 0.001, format: "percent", source: "derived", description: "Capital expenditure intensity. FY2025 capex is disclosed as approximately GBP1bn.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: "derived: FY2025 c.GBP1bn capex / FY2025 sales." },
    { key: "workingCapitalDragPctRevenueGrowth", label: "WC Drag / Sales Growth", value: defaultBaValuationAssumptions.workingCapitalDragPctRevenueGrowth, min: 0, max: 0.2, step: 0.005, format: "percent", source: "assumption", description: "Working-capital investment as a percentage of incremental sales.", category: "Cash Flow", unit: "percent", periodicity: "annual", provenance: `${BA_ASSUMPTION_NOTE}: captures customer advances and programme working-capital timing risk.` },
    { key: "wacc", label: "WACC", value: defaultBaValuationAssumptions.wacc, min: 0.065, max: 0.11, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for unlevered FCFF DCF.", category: "DCF", unit: "percent", periodicity: "annual", provenance: `${BA_ASSUMPTION_NOTE}: defence-prime risk discount, not a live debt/equity curve.` },
    { key: "terminalGrowth", label: "Terminal Growth", value: defaultBaValuationAssumptions.terminalGrowth, min: 0.01, max: 0.035, step: 0.0005, format: "percent", source: "assumption", description: "Long-run nominal terminal growth.", category: "DCF", unit: "percent", periodicity: "annual", provenance: `${BA_ASSUMPTION_NOTE}: mature defence-prime terminal growth assumption.` },
    { key: "targetFcfYield", label: "Target FCF Yield", value: defaultBaValuationAssumptions.targetFcfYield, min: 0.03, max: 0.065, step: 0.0005, format: "percent", source: "assumption", description: "Target normalized FCF yield for cash-flow cross-check.", category: "Multiples", unit: "percent", periodicity: "forward annual", provenance: `${BA_ASSUMPTION_NOTE}: cash-yield valuation cross-check.` },
    { key: "targetPe", label: "Target P/E", value: defaultBaValuationAssumptions.targetPe, min: 12, max: 28, step: 0.25, format: "multiple", source: "assumption", description: "Forward P/E cross-check.", category: "Multiples", unit: "multiple", periodicity: "forward annual", provenance: `${BA_ASSUMPTION_NOTE}: triangulation multiple, not the primary valuation method.` },
    { key: "targetEvEbit", label: "Target EV / EBIT", value: defaultBaValuationAssumptions.targetEvEbit, min: 10, max: 22, step: 0.25, format: "multiple", source: "assumption", description: "Forward EV / underlying EBIT cross-check.", category: "Multiples", unit: "multiple", periodicity: "forward annual", provenance: `${BA_ASSUMPTION_NOTE}: triangulation multiple for operating profit.` },
    { key: "netDebtExLeases", label: "Net Debt ex Leases", value: defaultBaValuationAssumptions.netDebtExLeases, min: 0, max: 8_000, step: 50, format: "number", source: "actual", description: "FY2025 net debt excluding lease liabilities, deducted after enterprise value.", category: "Balance Sheet", unit: "GBP", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: "official_actual: Annual Report 2025 net debt excluding lease liabilities." },
    { key: "leaseLiabilitiesNet", label: "Lease Liabilities", value: defaultBaValuationAssumptions.leaseLiabilitiesNet, min: 0, max: 3_000, step: 25, format: "number", source: "actual", description: "FY2025 lease liabilities net of finance lease receivables, deducted in the equity bridge.", category: "Balance Sheet", unit: "GBP", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: "official_actual: Annual Report 2025 balance-sheet summary." },
    { key: "pensionSurplusCredit", label: "Pension Surplus Credit", value: defaultBaValuationAssumptions.pensionSurplusCredit, min: -1_000, max: 2_000, step: 25, format: "number", source: "actual", description: "FY2025 IAS 19 post-employment benefit surplus credited in the equity bridge.", category: "Balance Sheet", unit: "GBP", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: "official_actual: Annual Report 2025 balance-sheet summary." },
    { key: "dilutedShares", label: "Diluted Shares", value: defaultBaValuationAssumptions.dilutedShares, min: 2_700, max: 3_300, step: 5, format: "number", source: "actual", description: "FY2025 diluted weighted-average shares in millions.", category: "Share Count", unit: "share", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: "official_actual: Annual Report 2025 EPS note." },
    { key: "dividendPerShare", label: "Dividend / Share", value: defaultBaValuationAssumptions.dividendPerShare, min: 0.1, max: 0.7, step: 0.005, format: "currency", source: "actual", description: "FY2025 total dividend per share in GBP.", category: "Capital Returns", unit: "GBP", periodicity: "annual", asOfDate: BA_DISCLOSURE_DATE, provenance: "official_actual: FY2025 full-year results dividend per share." },
    { key: "backlogDurabilityMaxAdjustment", label: "Backlog Adjustment Cap", value: defaultBaValuationAssumptions.backlogDurabilityMaxAdjustment, min: 0, max: 0.2, step: 0.005, format: "percent", source: "assumption", description: "Maximum valuation adjustment allowed from backlog durability score.", category: "Backlog", unit: "percent", periodicity: "annual", provenance: `${BA_ASSUMPTION_NOTE}: prevents backlog from becoming a mechanical valuation uplift.` },
    { key: "weightDcf", label: "DCF Weight", value: defaultBaValuationAssumptions.weightDcf, min: 0.1, max: 0.55, step: 0.01, format: "percent", source: "assumption", description: "DCF weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightFcfYield", label: "FCF Yield Weight", value: defaultBaValuationAssumptions.weightFcfYield, min: 0.05, max: 0.45, step: 0.01, format: "percent", source: "assumption", description: "FCF yield weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightEvEbit", label: "EV / EBIT Weight", value: defaultBaValuationAssumptions.weightEvEbit, min: 0.05, max: 0.3, step: 0.01, format: "percent", source: "assumption", description: "EV / EBIT weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightPe", label: "P/E Weight", value: defaultBaValuationAssumptions.weightPe, min: 0.05, max: 0.3, step: 0.01, format: "percent", source: "assumption", description: "P/E weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightBacklogDurability", label: "Backlog Layer Weight", value: defaultBaValuationAssumptions.weightBacklogDurability, min: 0, max: 0.35, step: 0.01, format: "percent", source: "assumption", description: "Weight for the backlog durability-adjusted core value.", category: "Blend", unit: "percent", periodicity: "annual" },
  ],
  scenarios: [
    { name: "Bear", assumptions: baScenarioPresets.Bear },
    { name: "Base", assumptions: baScenarioPresets.Base },
    { name: "Bull", assumptions: baScenarioPresets.Bull },
  ],
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveBaDataset(data);
    return calculateBaValuation(
      dataset,
      resolveBaPeriodFromData(data, getDefaultBaPeriod()),
      scenario,
      { ...defaultBaValuationAssumptions, ...(assumptions as Partial<BaValuationAssumptions>) },
    );
  },
};

export const baModule: StockModule = {
  ticker: "BA.L",
  name: "BAE Systems plc",
  sector: "Aerospace & Defense",
  currency: "GBP",
  description: "Defense-prime research cockpit focused on backlog durability, long-cycle programmes, defence-budget scenarios, cash conversion, and valuation triangulation.",
  tabs: [
    { value: "executive", label: "Executive Snapshot" },
    { value: "segments", label: "Segment Intelligence" },
    { value: "backlog", label: "Backlog & Visibility" },
    { value: "reporting-events", label: "Reporting Event Trends" },
    { value: "cycle", label: "Defense Cycle Lab" },
    { value: "programs", label: "Program Matrix" },
    { value: "valuation", label: "Valuation Triangulation" },
    { value: "risks", label: "Risk Red Team" },
    { value: "capital-returns", label: "Dividend & Buyback" },
  ],
  periods: getBaPeriods(),
  data: baDataset,
  getDefaultPeriod: () => getDefaultBaPeriod(),
  calculateSummary: (data) => calculateBaSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateBaValuation(data, resolveBaPeriodFromData(data, getDefaultBaPeriod()), scenario, assumptions as Partial<BaValuationAssumptions>),
  valuationConfig: baValuationConfig,
  Dashboard: BaDashboard,
};

export function attachBaModuleRuntime(dataSourceType: Parameters<typeof attachBaRuntimeContext>[1]["dataSourceType"], periodId = getDefaultBaPeriod()) {
  return attachBaRuntimeContext(baDataset, { dataSourceType, periodId });
}
