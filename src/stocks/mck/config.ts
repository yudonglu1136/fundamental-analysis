import type { StockModule, StockValuationConfig } from "../types";
import { MckDashboard } from "./dashboard";
import {
  calculateMckSummary,
  calculateMckValuation,
  defaultMckAssumptions,
  getDefaultMckPeriod,
  getMckPeriods,
  mckScenarioPresets,
  resolveMckDataset,
  type MckResearchAssumptions,
} from "./calculations";
import { mckData } from "./data";

const priceMetadata = {
  ticker: "MCK",
  currentPrice: mckData.market.currentPrice,
  currency: "USD" as const,
  unit: "share" as const,
  asOfDate: mckData.market.priceDate,
  source: "actual" as const,
  marketReference: mckData.market.currentPrice,
  provenance: `${mckData.market.tag.sourceType}: ${mckData.market.tag.source}`,
};

const mckValuationConfig: StockValuationConfig = {
  ticker: "MCK",
  modelType: "MCK Segment SOTP / Owner Earnings / FCF / Buyback TSR",
  priceMetadata,
  assumptions: [
    { key: "currentPrice", label: "Current Price", value: defaultMckAssumptions.currentPrice, min: 450, max: 1100, step: 1, format: "currency", source: "actual", description: "Market snapshot price used for upside/downside and TSR.", category: "Market", unit: "USD", periodicity: "annual", asOfDate: priceMetadata.asOfDate, provenance: priceMetadata.provenance },
    { key: "forwardAdjustedEps", label: "Forward Adj. EPS", value: defaultMckAssumptions.forwardAdjustedEps, min: 35, max: 55, step: 0.1, format: "currency", source: "consensus", description: "FY2027 adjusted EPS guidance midpoint or analyst override.", category: "EPS Bridge", unit: "USD", periodicity: "forward annual", asOfDate: "2026-05-07", provenance: "company_guidance: FY2027 adjusted EPS range midpoint." },
    { key: "targetPe", label: "Target P/E", value: defaultMckAssumptions.targetPe, min: 12, max: 24, step: 0.1, format: "multiple", source: "assumption", description: "Forward adjusted EPS valuation multiple.", category: "Valuation", unit: "multiple", periodicity: "forward annual", provenance: "analyst_assumption: distributor compounder multiple." },
    { key: "fcfPerShare", label: "FCF / Share", value: defaultMckAssumptions.fcfPerShare, min: 25, max: 65, step: 0.1, format: "currency", source: "derived", description: "Normalized FCF per share used in FCF yield valuation.", category: "FCF", unit: "USD", periodicity: "forward annual", provenance: "derived: normalized FCF divided by diluted shares." },
    { key: "targetFcfYield", label: "Target FCF Yield", value: defaultMckAssumptions.targetFcfYield, min: 0.04, max: 0.085, step: 0.0005, format: "percent", source: "assumption", description: "Required FCF yield for cash-generative distributor.", category: "Valuation", unit: "percent", periodicity: "forward annual" },
    { key: "normalizedFcf", label: "Normalized FCF", value: defaultMckAssumptions.normalizedFcf, min: 3500, max: 7500, step: 50, format: "number", source: "assumption", description: "Working-capital-normalized free cash flow.", category: "FCF", unit: "USD", periodicity: "annual", provenance: "analyst_assumption: controls for working-capital swings." },
    { key: "ownerEarningsBase", label: "Owner Earnings Base", value: defaultMckAssumptions.ownerEarningsBase, min: 3000, max: 7500, step: 50, format: "number", source: "assumption", description: "Base owner earnings for DCF.", category: "DCF", unit: "USD", periodicity: "annual" },
    { key: "normalizedFcfGrowth", label: "FCF Growth", value: defaultMckAssumptions.normalizedFcfGrowth, min: 0.02, max: 0.14, step: 0.001, format: "percent", source: "assumption", description: "Normalized owner earnings growth.", category: "DCF", unit: "percent", periodicity: "annual" },
    { key: "wacc", label: "WACC", value: defaultMckAssumptions.wacc, min: 0.065, max: 0.105, step: 0.0005, format: "percent", source: "assumption", description: "Discount rate for owner-earnings DCF.", category: "DCF", unit: "percent", periodicity: "annual" },
    { key: "terminalGrowth", label: "Terminal Growth", value: defaultMckAssumptions.terminalGrowth, min: 0.01, max: 0.035, step: 0.0005, format: "percent", source: "assumption", description: "Long-run owner earnings growth.", category: "DCF", unit: "percent", periodicity: "annual" },
    { key: "dilutedShares", label: "Diluted Shares", value: defaultMckAssumptions.dilutedShares, min: 90, max: 145, step: 0.1, format: "number", source: "placeholder", description: "Diluted shares in millions. Placeholder until SEC parser refreshes official shares.", category: "Share Count", unit: "share", periodicity: "annual" },
    { key: "netDebt", label: "Net Debt", value: defaultMckAssumptions.netDebt, min: 0, max: 15000, step: 50, format: "number", source: "placeholder", description: "Net debt used in DCF/SOTP. Placeholder until balance-sheet parser refreshes cash and debt.", category: "Balance Sheet", unit: "USD", periodicity: "annual" },
    { key: "averageBuybackPrice", label: "Average Buyback Price", value: defaultMckAssumptions.averageBuybackPrice, min: 450, max: 1200, step: 5, format: "currency", source: "assumption", description: "Average price at which repurchases are executed.", category: "Buyback", unit: "USD", periodicity: "annual" },
    { key: "annualFcf", label: "Annual FCF", value: defaultMckAssumptions.annualFcf, min: 3000, max: 8000, step: 50, format: "number", source: "actual", description: "Annual FCF available for dividends, buybacks, M&A and debt.", category: "Buyback", unit: "USD", periodicity: "annual", asOfDate: "2026-05-07", provenance: "company_disclosure: FY2026 FCF." },
    { key: "dividendPayout", label: "Dividend Payout", value: defaultMckAssumptions.dividendPayout, min: 0, max: 1000, step: 10, format: "number", source: "actual", description: "Annual dividends paid.", category: "Buyback", unit: "USD", periodicity: "annual", asOfDate: "2026-05-07" },
    { key: "buybackAmount", label: "Buyback Amount", value: defaultMckAssumptions.buybackAmount, min: 0, max: 8000, step: 50, format: "number", source: "assumption", description: "Annual share repurchase dollars.", category: "Buyback", unit: "USD", periodicity: "annual" },
    { key: "epsCagr3Y", label: "3Y EPS CAGR", value: defaultMckAssumptions.epsCagr3Y, min: 0.02, max: 0.2, step: 0.001, format: "percent", source: "assumption", description: "EPS CAGR used in 3-year TSR.", category: "TSR", unit: "percent", periodicity: "annual" },
    { key: "epsCagr5Y", label: "5Y EPS CAGR", value: defaultMckAssumptions.epsCagr5Y, min: 0.02, max: 0.18, step: 0.001, format: "percent", source: "assumption", description: "EPS CAGR used in 5-year TSR.", category: "TSR", unit: "percent", periodicity: "annual" },
    { key: "exitPe", label: "Exit P/E", value: defaultMckAssumptions.exitPe, min: 11, max: 24, step: 0.1, format: "multiple", source: "assumption", description: "Exit multiple for TSR scenarios.", category: "TSR", unit: "multiple", periodicity: "forward annual" },
    { key: "downsideShock", label: "Legal / Regulatory Shock", value: defaultMckAssumptions.downsideShock, min: 0, max: 0.25, step: 0.005, format: "percent", source: "assumption", description: "Scenario haircut for legal/regulatory shock.", category: "Risk", unit: "percent", periodicity: "annual" },
    { key: "coreDistributionMultiple", label: "Core Distribution Multiple", value: defaultMckAssumptions.coreDistributionMultiple, min: 7, max: 14, step: 0.1, format: "multiple", source: "assumption", description: "SOTP multiple for North American Pharmaceutical.", category: "SOTP", unit: "multiple", periodicity: "annual" },
    { key: "oncologyMultiple", label: "Oncology Multiple", value: defaultMckAssumptions.oncologyMultiple, min: 11, max: 22, step: 0.1, format: "multiple", source: "assumption", description: "SOTP multiple for Oncology & Multispecialty.", category: "SOTP", unit: "multiple", periodicity: "annual" },
    { key: "rxTechnologyMultiple", label: "RxTS Multiple", value: defaultMckAssumptions.rxTechnologyMultiple, min: 12, max: 24, step: 0.1, format: "multiple", source: "assumption", description: "SOTP multiple for Prescription Technology Solutions.", category: "SOTP", unit: "multiple", periodicity: "annual" },
    { key: "medSurgMultiple", label: "Med-Surg Multiple", value: defaultMckAssumptions.medSurgMultiple, min: 6, max: 12, step: 0.1, format: "multiple", source: "assumption", description: "SOTP multiple for Medical-Surgical Solutions.", category: "SOTP", unit: "multiple", periodicity: "annual" },
    { key: "corporateCostValue", label: "Corporate / Other Value", value: defaultMckAssumptions.corporateCostValue, min: -9000, max: 0, step: 100, format: "number", source: "assumption", description: "Corporate cost, stranded cost, tax and other SOTP adjustments.", category: "SOTP", unit: "USD", periodicity: "annual" },
    { key: "weightPe", label: "P/E Weight", value: defaultMckAssumptions.weightPe, min: 0, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Blend weight for P/E method.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightFcfYield", label: "FCF Yield Weight", value: defaultMckAssumptions.weightFcfYield, min: 0, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Blend weight for FCF yield method.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightDcf", label: "DCF Weight", value: defaultMckAssumptions.weightDcf, min: 0, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Blend weight for DCF method.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightSotp", label: "SOTP Weight", value: defaultMckAssumptions.weightSotp, min: 0, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Blend weight for SOTP method.", category: "Blend", unit: "percent", periodicity: "annual" },
  ],
  scenarios: [
    { name: "Bear", assumptions: mckScenarioPresets.Bear },
    { name: "Base", assumptions: mckScenarioPresets.Base },
    { name: "Bull", assumptions: mckScenarioPresets.Bull },
  ],
  calculateValuation: (assumptions, data, scenario = "Base") =>
    calculateMckValuation(resolveMckDataset(data), assumptions as Partial<MckResearchAssumptions>, scenario),
};

export const mckModule: StockModule = {
  ticker: "MCK",
  name: "McKesson",
  sector: "Healthcare Distribution / Specialty Oncology / Rx Technology",
  currency: "USD",
  description:
    "Institutional MCK model focused on low-margin distribution economics, oncology/specialty growth, Rx technology, working capital, FCF quality, buybacks, SOTP and TSR.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "segments", label: "Segments" },
    { value: "fcf-buyback", label: "FCF & Buybacks" },
    { value: "margin", label: "Margin Bridge" },
    { value: "peers", label: "Peers" },
    { value: "valuation", label: "Valuation" },
    { value: "scenario-lab", label: "Scenario Lab" },
    { value: "risks", label: "Risks" },
    { value: "earnings-call", label: "Call Intelligence" },
    { value: "memo", label: "Memo" },
  ],
  periods: getMckPeriods(mckData),
  data: mckData,
  getDefaultPeriod: () => getDefaultMckPeriod(mckData),
  calculateSummary: (data, assumptions) => calculateMckSummary(data, assumptions as Partial<MckResearchAssumptions>),
  calculateValuation: (data, assumptions, scenario = "Base") => calculateMckValuation(data, assumptions as Partial<MckResearchAssumptions>, scenario),
  valuationConfig: mckValuationConfig,
  Dashboard: MckDashboard,
};
