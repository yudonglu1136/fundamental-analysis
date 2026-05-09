import type { StockModule, StockValuationConfig } from "../types";
import { priceMetadataByTicker } from "../../utils/valuation";
import { MckDashboard } from "./dashboard";
import { calculateMckSummary, calculateMckValuation, defaultMckAssumptions, parseMckWorkbookSnapshot } from "./calculations";

const mckValuationConfig: StockValuationConfig = {
  ticker: "MCK",
  modelType: "Core EPS / FCF / CAGR",
  priceMetadata: priceMetadataByTicker.MCK,
  assumptions: [
    { key: "currentPrice", label: "Current Price", value: defaultMckAssumptions.currentPrice, min: 400, max: 900, step: 1, format: "currency", source: "actual", description: "Current share price used for upside/downside and expected return.", category: "Earnings", unit: "USD", periodicity: "annual", asOfDate: priceMetadataByTicker.MCK.asOfDate, provenance: priceMetadataByTicker.MCK.provenance },
    { key: "forwardCoreEps", label: "Forward Core EPS", value: 35, min: 20, max: 50, step: 0.1, format: "currency", source: "consensus", description: "Core EPS excluding one-offs and temporary distortions.", category: "Earnings", unit: "USD", periodicity: "forward annual", asOfDate: "2026-05-09", provenance: "Consensus-style model input." },
    { key: "oneOffEpsAdjustment", label: "One-Off EPS Adjustment", value: 0, min: -3, max: 3, step: 0.1, format: "currency", source: "assumption", description: "Manual adjustment for venture gains or other one-offs. Applied once only on top of forward core EPS.", category: "Earnings", unit: "USD", periodicity: "forward annual", asOfDate: "2026-05-09", provenance: "Manual analyst override." },
    { key: "fcfPerShare", label: "FCF per Share", value: 32, min: 20, max: 45, step: 0.1, format: "currency", source: "consensus", description: "Free cash flow per share supports a second valuation anchor.", category: "Cash Flow" },
    { key: "targetFcfYield", label: "Target FCF Yield", value: 0.055, min: 0.03, max: 0.08, step: 0.001, format: "percent", source: "assumption", description: "Higher target yield implies lower fair value.", category: "Cash Flow" },
    { key: "buybackYield", label: "Buyback Yield", value: 0.025, min: 0, max: 0.05, step: 0.001, format: "percent", source: "derived", description: "Displayed as a capital return indicator only. It is not added separately to shareholder CAGR because EPS already reflects share count reduction.", category: "Capital Return" },
    { key: "dividendYield", label: "Dividend Yield", value: 0.005, min: 0, max: 0.02, step: 0.001, format: "percent", source: "actual", description: "Cash shareholder yield component.", category: "Capital Return" },
    { key: "glp1MarginDilutionImpact", label: "GLP-1 Margin Dilution Impact", value: -0.01, min: -0.05, max: 0.02, step: 0.001, format: "percent", source: "assumption", description: "Negative if GLP-1 revenue is margin dilutive.", category: "Business Mix" },
    { key: "specialtyOncologyUplift", label: "Specialty / Oncology Uplift", value: 0.02, min: 0, max: 0.08, step: 0.001, format: "percent", source: "assumption", description: "Positive mix uplift from higher-quality specialty economics.", category: "Business Mix" },
    { key: "targetPe", label: "Target P/E Multiple", value: 17, min: 10, max: 25, step: 0.1, format: "multiple", source: "consensus", description: "Near-term fair-value multiple on forward core EPS.", category: "Multiple" },
    { key: "epsCagr3Y", label: "EPS CAGR, 3-Year", value: 0.08, min: 0, max: 0.2, step: 0.001, format: "percent", source: "assumption", description: "Longer-term earnings compounding assumption.", category: "Multiple" },
    { key: "exitPe", label: "Exit P/E Multiple", value: 16, min: 10, max: 25, step: 0.1, format: "multiple", source: "assumption", description: "Exit multiple applied to 3-year forward EPS.", category: "Multiple" },
  ],
  scenarios: [
    { name: "Bear", assumptions: { currentPrice: 650, forwardCoreEps: 33, targetPe: 15, fcfPerShare: 30, targetFcfYield: 0.065, epsCagr3Y: 0.05, exitPe: 14, buybackYield: 0.02, dividendYield: 0.005, glp1MarginDilutionImpact: -0.02, specialtyOncologyUplift: 0.01, oneOffEpsAdjustment: -1 } },
    { name: "Base", assumptions: { currentPrice: 650, forwardCoreEps: 35, targetPe: 17, fcfPerShare: 32, targetFcfYield: 0.055, epsCagr3Y: 0.08, exitPe: 16, buybackYield: 0.025, dividendYield: 0.005, glp1MarginDilutionImpact: -0.01, specialtyOncologyUplift: 0.02, oneOffEpsAdjustment: 0 } },
    { name: "Bull", assumptions: { currentPrice: 650, forwardCoreEps: 38, targetPe: 19, fcfPerShare: 35, targetFcfYield: 0.048, epsCagr3Y: 0.11, exitPe: 18, buybackYield: 0.03, dividendYield: 0.006, glp1MarginDilutionImpact: 0, specialtyOncologyUplift: 0.04, oneOffEpsAdjustment: 0 } },
  ],
  calculateValuation: (assumptions, data) => calculateMckValuation(data as ReturnType<typeof parseMckWorkbookSnapshot>, { ...defaultMckAssumptions, ...(assumptions as Partial<typeof defaultMckAssumptions>) }),
};

export const mckModule: StockModule = {
  ticker: "MCK",
  name: "McKesson",
  sector: "Healthcare Distribution",
  currency: "USD",
  description: "EPS quality, buybacks, GLP-1 mix, specialty / oncology, peer read-through, and valuation.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "data-quality", label: "Data Quality" },
    { value: "eps-quality", label: "EPS Quality" },
    { value: "core-eps", label: "Core EPS" },
    { value: "buybacks", label: "Buybacks" },
    { value: "glp1", label: "GLP-1" },
    { value: "specialty", label: "Specialty / Oncology" },
    { value: "peers", label: "Peer Read-Through" },
    { value: "valuation", label: "Valuation" },
  ],
  periods: parseMckWorkbookSnapshot().periods.map((year) => ({ value: year, label: year })),
  data: parseMckWorkbookSnapshot(),
  getDefaultPeriod: () => {
    const periods = parseMckWorkbookSnapshot().periods;
    return periods[periods.length - 1] ?? "";
  },
  calculateSummary: (data) => calculateMckSummary(data as ReturnType<typeof parseMckWorkbookSnapshot>),
  calculateValuation: (data, assumptions, scenario) => calculateMckValuation(data as ReturnType<typeof parseMckWorkbookSnapshot>, assumptions as never, scenario),
  valuationConfig: mckValuationConfig,
  Dashboard: MckDashboard,
};
