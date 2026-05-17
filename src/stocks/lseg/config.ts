import type { StockModule, StockValuationConfig } from "../types";
import { LsegDashboard } from "./dashboard";
import {
  calculateLsegSummary,
  calculateLsegValuation,
  defaultLsegCockpitAssumptions,
  getDefaultLsegPeriod,
  getLsegPeriods,
} from "./calculations";
import { lsegMarketData, lsegMockData } from "./data";
import type { LsegValuationAssumptions } from "./types";

function asRecord(assumptions: LsegValuationAssumptions): Record<string, number> {
  return Object.fromEntries(
    Object.entries(assumptions).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

const lsegValuationConfig: StockValuationConfig = {
  ticker: "LSEG",
  modelType: "Financial market infrastructure + data/workflow platform cockpit",
  priceMetadata: {
    ticker: "LSEG.L",
    currentPrice: lsegMarketData.currentPriceGbp,
    currency: "GBP",
    unit: "share",
    asOfDate: lsegMarketData.priceDate,
    source: "actual",
    marketReference: lsegMarketData.currentPriceGbp,
    provenance: `${lsegMarketData.sourceId}: ${lsegMarketData.source}`,
  },
  assumptions: [
    { key: "currentPrice", label: "Current Price", value: defaultLsegCockpitAssumptions.currentPrice, min: 60, max: 150, step: 0.1, format: "currency", source: "actual", description: "Dated market price for upside/downside.", category: "Market", unit: "GBP", asOfDate: defaultLsegCockpitAssumptions.priceDate, provenance: lsegMarketData.source },
    { key: "dilutedShares", label: "Diluted Shares", value: defaultLsegCockpitAssumptions.dilutedShares, min: 450, max: 560, step: 1, format: "number", source: "derived", description: "Share count used for equity bridge and buyback math, in millions.", category: "Equity Bridge", unit: "share" },
    { key: "netDebt", label: "Net Debt", value: defaultLsegCockpitAssumptions.netDebt, min: 5000, max: 10000, step: 50, format: "number", source: "actual", description: "Official FY2025 net debt, GBPm.", category: "Equity Bridge", unit: "GBP", asOfDate: "2026-02-26", provenance: "LSEG FY2025 preliminary results." },
    { key: "leaseLiabilities", label: "Lease Liabilities", value: defaultLsegCockpitAssumptions.leaseLiabilities, min: 300, max: 900, step: 25, format: "number", source: "actual", description: "Official lease liability bridge item, GBPm.", category: "Equity Bridge", unit: "GBP" },
    { key: "associatesAndInvestments", label: "Associates / Investments", value: defaultLsegCockpitAssumptions.associatesAndInvestments, min: 0, max: 1000, step: 25, format: "number", source: "actual", description: "Investments and associates add-back where separately held, GBPm.", category: "Equity Bridge", unit: "GBP" },
    { key: "taxRate", label: "Tax Rate", value: defaultLsegCockpitAssumptions.taxRate, min: 0.22, max: 0.28, step: 0.001, format: "percent", source: "assumption", description: "Cash tax / effective tax assumption within management guidance range.", category: "FCFF", unit: "percent", provenance: "Management guidance: 24-25% underlying effective tax rate." },
    { key: "dAndAIntensity", label: "D&A / Revenue", value: defaultLsegCockpitAssumptions.dAndAIntensity, min: 0.09, max: 0.13, step: 0.001, format: "percent", source: "derived", description: "Adjusted depreciation and amortisation as percent of revenue.", category: "FCFF", unit: "percent" },
    { key: "capexIntensity", label: "Capex Intensity", value: defaultLsegCockpitAssumptions.capexIntensity, min: 0.075, max: 0.12, step: 0.001, format: "percent", source: "assumption", description: "Cash capex as percent of total income excluding recoveries.", category: "FCFF", unit: "percent", provenance: "Management guidance: c.9.5% in 2026; medium-term direction toward c.8%." },
    { key: "workingCapitalDragPctRevenueGrowth", label: "WC Drag / Growth", value: defaultLsegCockpitAssumptions.workingCapitalDragPctRevenueGrowth, min: 0, max: 0.03, step: 0.001, format: "percent", source: "assumption", description: "Incremental working-capital investment as percent of revenue growth.", category: "FCFF", unit: "percent" },
    { key: "integrationCashCost", label: "Integration Cash Cost", value: defaultLsegCockpitAssumptions.integrationCashCost, min: 0, max: 300, step: 10, format: "number", source: "assumption", description: "Refinitiv / platform transformation cash cost normalization, GBPm.", category: "FCFF", unit: "GBP" },
    { key: "maintenanceCapexPctCapex", label: "Maintenance Capex Mix", value: defaultLsegCockpitAssumptions.maintenanceCapexPctCapex, min: 0.5, max: 0.9, step: 0.01, format: "percent", source: "assumption", description: "Maintenance capex share used in FCF yield lab.", category: "FCF Yield", unit: "percent" },
    { key: "buyback2026", label: "2026 Buyback", value: defaultLsegCockpitAssumptions.buyback2026, min: 0, max: 3000, step: 50, format: "number", source: "assumption", description: "Modeled buyback allocation inside the official GBP3bn plan.", category: "Capital Returns", unit: "GBP" },
    { key: "buyback2027", label: "2027 Buyback", value: defaultLsegCockpitAssumptions.buyback2027, min: 0, max: 3000, step: 50, format: "number", source: "assumption", description: "Modeled buyback allocation inside the official GBP3bn plan.", category: "Capital Returns", unit: "GBP" },
    { key: "averageBuybackPrice2026", label: "2026 Buyback Price", value: defaultLsegCockpitAssumptions.averageBuybackPrice2026, min: 70, max: 140, step: 1, format: "currency", source: "assumption", description: "Average execution price for modeled buybacks.", category: "Capital Returns", unit: "GBP" },
    { key: "averageBuybackPrice2027", label: "2027 Buyback Price", value: defaultLsegCockpitAssumptions.averageBuybackPrice2027, min: 70, max: 150, step: 1, format: "currency", source: "assumption", description: "Average execution price for modeled buybacks.", category: "Capital Returns", unit: "GBP" },
    { key: "weightFcffDcf", label: "FCFF DCF Weight", value: defaultLsegCockpitAssumptions.weightFcffDcf, min: 0, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Triangulation weight.", category: "Valuation Weights", unit: "percent" },
    { key: "weightFcfYield", label: "FCF Yield Weight", value: defaultLsegCockpitAssumptions.weightFcfYield, min: 0, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Triangulation weight.", category: "Valuation Weights", unit: "percent" },
    { key: "weightSotp", label: "SOTP Weight", value: defaultLsegCockpitAssumptions.weightSotp, min: 0, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "Triangulation weight.", category: "Valuation Weights", unit: "percent" },
    { key: "weightEvEbitda", label: "EV/EBITDA Weight", value: defaultLsegCockpitAssumptions.weightEvEbitda, min: 0, max: 0.3, step: 0.01, format: "percent", source: "assumption", description: "Triangulation weight.", category: "Valuation Weights", unit: "percent" },
    { key: "weightPe", label: "P/E Weight", value: defaultLsegCockpitAssumptions.weightPe, min: 0, max: 0.2, step: 0.01, format: "percent", source: "assumption", description: "Triangulation weight.", category: "Valuation Weights", unit: "percent" },
    { key: "weightPlatformMoat", label: "Platform Moat Weight", value: defaultLsegCockpitAssumptions.weightPlatformMoat, min: 0, max: 0.2, step: 0.01, format: "percent", source: "assumption", description: "Capped platform moat / risk overlay weight.", category: "Valuation Weights", unit: "percent" },
    { key: "platformMoatCap", label: "Moat Cap", value: defaultLsegCockpitAssumptions.platformMoatCap, min: 0, max: 0.1, step: 0.005, format: "percent", source: "assumption", description: "Hard cap on platform moat premium.", category: "Controls", unit: "percent" },
    { key: "riskAdjustmentCap", label: "Risk Cap", value: defaultLsegCockpitAssumptions.riskAdjustmentCap, min: 0, max: 0.15, step: 0.005, format: "percent", source: "assumption", description: "Hard cap on red-team valuation haircut.", category: "Controls", unit: "percent" },
  ],
  scenarios: [
    { name: "Bear", assumptions: asRecord({ ...defaultLsegCockpitAssumptions }) },
    { name: "Base", assumptions: asRecord({ ...defaultLsegCockpitAssumptions }) },
    { name: "Bull", assumptions: asRecord({ ...defaultLsegCockpitAssumptions }) },
  ],
  calculateValuation: (assumptions, data, scenario = "Base") =>
    calculateLsegValuation(data, getDefaultLsegPeriod(), scenario, {
      ...defaultLsegCockpitAssumptions,
      ...(assumptions as Partial<LsegValuationAssumptions>),
    }),
};

export const lsegModule: StockModule = {
  ticker: "LSEG",
  name: "London Stock Exchange Group",
  sector: "Financial Market Infrastructure / Data & Workflow",
  currency: "GBP",
  description:
    "Institutional LSEG cockpit covering financial market infrastructure, data/workflow platform, FTSE Russell index IP, LCH clearing and capital allocation.",
  tabs: [
    { value: "executive", label: "Executive Snapshot" },
    { value: "segments", label: "Business Mix" },
    { value: "data-analytics", label: "D&A / Workspace" },
    { value: "index", label: "FTSE Russell" },
    { value: "post-trade", label: "Post Trade / LCH" },
    { value: "synergy", label: "Refinitiv Synergy" },
    { value: "transcripts", label: "Transcript Lab" },
    { value: "valuation", label: "Valuation Lab" },
    { value: "risk", label: "Risk Red Team" },
    { value: "capital-returns", label: "Dividend & Buyback" },
  ],
  periods: getLsegPeriods(),
  data: lsegMockData,
  getDefaultPeriod: () => getDefaultLsegPeriod(),
  calculateSummary: (data) => calculateLsegSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateLsegValuation(data, getDefaultLsegPeriod(), scenario, assumptions as Partial<LsegValuationAssumptions>),
  valuationConfig: lsegValuationConfig,
  Dashboard: LsegDashboard,
};
