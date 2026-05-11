import type { StockModule, StockValuationConfig } from "../types";
import { LsegDashboard } from "./dashboard";
import {
  calculateLsegSummary,
  calculateLsegValuation,
  defaultLsegValuationAssumptions,
  getDefaultLsegPeriod,
  getLsegPeriods,
  lsegScenarioPresets,
  resolveLsegDataset,
  resolveLsegPeriodFromData,
} from "./calculations";
import { lsegMarketData, lsegMockData } from "./data";

const LSEG_COMPANY_DISCLOSURE_DATE = "2026-03-06";
const LSEG_MARKET_SNAPSHOT_NOTE = "manual_snapshot";
const LSEG_ASSUMPTION_NOTE = "analyst_estimate";

const lsegPriceMetadata = {
  ticker: "LSEG",
  currentPrice: lsegMarketData.manualOverride ?? lsegMarketData.currentPrice,
  currency: "GBP" as const,
  unit: "share" as const,
  asOfDate: lsegMarketData.priceDate,
  source: "actual" as const,
  marketReference: lsegMarketData.currentPrice,
  provenance: `${LSEG_MARKET_SNAPSHOT_NOTE}: ${lsegMarketData.source}`,
};

const lsegValuationConfig: StockValuationConfig = {
  ticker: "LSEG",
  modelType: "KPI-Driven FCF / Buyback / SOTP / DCF",
  priceMetadata: lsegPriceMetadata,
  assumptions: [
    { key: "currentPrice", label: "Current Price", value: defaultLsegValuationAssumptions.currentPrice, min: 60, max: 180, step: 0.1, format: "currency", source: "actual", description: "Current share price used for upside/downside and 3Y return analysis.", category: "Market", unit: "GBP", periodicity: "annual", asOfDate: lsegPriceMetadata.asOfDate, provenance: lsegPriceMetadata.provenance },
    { key: "taxRate", label: "Tax Rate", value: defaultLsegValuationAssumptions.taxRate, min: 0.2, max: 0.3, step: 0.001, format: "percent", source: "assumption", description: "Cash tax rate used in FCF, EPS, and after-tax debt cost.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: LSEG_COMPANY_DISCLOSURE_DATE, provenance: "company_disclosure: FY2026 guidance range 24% to 25%." },
    { key: "capexIntensity", label: "Capex Intensity", value: defaultLsegValuationAssumptions.capexIntensity, min: 0.07, max: 0.13, step: 0.001, format: "percent", source: "assumption", description: "Capex as a percent of revenue / total income excluding recoveries.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: LSEG_COMPANY_DISCLOSURE_DATE, provenance: "company_disclosure: FY2026 capex intensity target." },
    { key: "cashInterestExpense", label: "Cash Interest Expense", value: defaultLsegValuationAssumptions.cashInterestExpense, min: 250, max: 500, step: 5, format: "number", source: "assumption", description: "Cash interest expense used in equity FCF and adjusted net income.", category: "Cash Flow", unit: "GBP", periodicity: "annual", asOfDate: LSEG_COMPANY_DISCLOSURE_DATE, provenance: `${LSEG_ASSUMPTION_NOTE}: GBP millions, aligned to FY2025A debt load and FY2026E cash-flow bridge.` },
    { key: "workingCapitalAsPctRevenue", label: "Working Capital / Revenue", value: defaultLsegValuationAssumptions.workingCapitalAsPctRevenue, min: 0, max: 0.02, step: 0.0005, format: "percent", source: "assumption", description: "Incremental working capital investment as a percent of revenue growth.", category: "Cash Flow", unit: "percent", periodicity: "annual", provenance: `${LSEG_ASSUMPTION_NOTE}: modeled working-capital drag for equity and unlevered FCF.` },
    { key: "integrationCashCost", label: "Integration Cash Cost", value: defaultLsegValuationAssumptions.integrationCashCost, min: 0, max: 250, step: 5, format: "number", source: "assumption", description: "Transformation and integration cash costs not treated as recurring cash generation.", category: "Cash Flow", unit: "GBP", periodicity: "annual", asOfDate: LSEG_COMPANY_DISCLOSURE_DATE, provenance: `${LSEG_ASSUMPTION_NOTE}: GBP millions for transformation cash-cost normalization.` },
    { key: "riskFreeRate", label: "UK Risk-Free Rate", value: defaultLsegValuationAssumptions.riskFreeRate, min: 0.03, max: 0.06, step: 0.0005, format: "percent", source: "assumption", description: "UK gilt-like risk-free rate used in the WACC build.", category: "WACC", unit: "percent", periodicity: "annual", asOfDate: lsegPriceMetadata.asOfDate, provenance: `${LSEG_MARKET_SNAPSHOT_NOTE}: UK 10Y gilt-style WACC anchor from local market snapshot / macro table.` },
    { key: "beta", label: "Beta", value: defaultLsegValuationAssumptions.beta, min: 0.7, max: 1.2, step: 0.01, format: "number", source: "assumption", description: "Beta used to build the cost of equity.", category: "WACC", periodicity: "annual", provenance: `${LSEG_ASSUMPTION_NOTE}: manual WACC input, not live-broker beta feed.` },
    { key: "equityRiskPremium", label: "Equity Risk Premium", value: defaultLsegValuationAssumptions.equityRiskPremium, min: 0.04, max: 0.07, step: 0.0005, format: "percent", source: "assumption", description: "Equity risk premium used in the CAPM cost of equity.", category: "WACC", unit: "percent", periodicity: "annual", provenance: `${LSEG_ASSUMPTION_NOTE}: manual ERP used in the CAPM build.` },
    { key: "preTaxCostOfDebt", label: "Pre-Tax Cost of Debt", value: defaultLsegValuationAssumptions.preTaxCostOfDebt, min: 0.035, max: 0.07, step: 0.0005, format: "percent", source: "assumption", description: "Pre-tax debt cost used in the WACC build.", category: "WACC", unit: "percent", periodicity: "annual", provenance: `${LSEG_ASSUMPTION_NOTE}: debt-cost assumption, not live debt curve.` },
    { key: "targetPe", label: "Target P/E", value: defaultLsegValuationAssumptions.targetPe, min: 16, max: 28, step: 0.1, format: "multiple", source: "assumption", description: "Cross-check target P/E for forward adjusted EPS.", category: "Multiples", unit: "multiple", periodicity: "forward annual", provenance: `${LSEG_ASSUMPTION_NOTE}: underwriting multiple, not consensus target multiple.` },
    { key: "targetFcfYield", label: "Target FCF Yield", value: defaultLsegValuationAssumptions.targetFcfYield, min: 0.035, max: 0.065, step: 0.0005, format: "percent", source: "assumption", description: "Cross-check target FCF yield used to capitalize forward equity FCF per share.", category: "Multiples", unit: "percent", periodicity: "forward annual", provenance: `${LSEG_ASSUMPTION_NOTE}: underwriting FCF yield cross-check.` },
    { key: "terminalGrowth", label: "Terminal Growth", value: defaultLsegValuationAssumptions.terminalGrowth, min: 0.015, max: 0.03, step: 0.0005, format: "percent", source: "assumption", description: "Long-run terminal growth used in the DCF.", category: "DCF", unit: "percent", periodicity: "annual", provenance: `${LSEG_ASSUMPTION_NOTE}: long-run nominal growth assumption.` },
    { key: "exitPe", label: "3Y Exit P/E", value: defaultLsegValuationAssumptions.exitPe, min: 16, max: 28, step: 0.1, format: "multiple", source: "assumption", description: "Exit multiple used in the three-year target price calculation.", category: "Return", unit: "multiple", periodicity: "forward annual", provenance: `${LSEG_ASSUMPTION_NOTE}: sell target / PM hurdle cross-check.` },
    { key: "dividendYield", label: "Dividend Yield", value: defaultLsegValuationAssumptions.dividendYield, min: 0.005, max: 0.03, step: 0.0005, format: "percent", source: "derived", description: "Dividend yield used for total-return and 3Y CAGR analysis.", category: "Return", unit: "percent", periodicity: "annual", asOfDate: lsegPriceMetadata.asOfDate, provenance: "derived: trailing dividend over dated market price snapshot." },
    { key: "buyback2026", label: "2026 Buyback", value: defaultLsegValuationAssumptions.buyback2026, min: 500, max: 2500, step: 25, format: "number", source: "assumption", description: "2026 buyback amount used to model diluted share reduction.", category: "Capital Allocation", unit: "GBP", periodicity: "annual", asOfDate: LSEG_COMPANY_DISCLOSURE_DATE, provenance: "company_disclosure + analyst_estimate: GBP millions within announced 2026-2027 authorization." },
    { key: "buyback2027", label: "2027 Buyback", value: defaultLsegValuationAssumptions.buyback2027, min: 500, max: 2500, step: 25, format: "number", source: "assumption", description: "2027 buyback amount used to model share count reduction into the 3Y target price.", category: "Capital Allocation", unit: "GBP", periodicity: "annual", asOfDate: LSEG_COMPANY_DISCLOSURE_DATE, provenance: "company_disclosure + analyst_estimate: GBP millions within announced 2026-2027 authorization." },
    { key: "averageBuybackPrice2026", label: "2026 Buyback Price", value: defaultLsegValuationAssumptions.averageBuybackPrice2026, min: 70, max: 170, step: 0.5, format: "currency", source: "assumption", description: "Average buyback execution price for 2026 share repurchases.", category: "Capital Allocation", unit: "GBP", periodicity: "annual", asOfDate: lsegPriceMetadata.asOfDate, provenance: `${LSEG_ASSUMPTION_NOTE}: manual buyback execution price assumption.` },
    { key: "averageBuybackPrice2027", label: "2027 Buyback Price", value: defaultLsegValuationAssumptions.averageBuybackPrice2027, min: 70, max: 180, step: 0.5, format: "currency", source: "assumption", description: "Average buyback execution price for 2027 share repurchases.", category: "Capital Allocation", unit: "GBP", periodicity: "annual", asOfDate: lsegPriceMetadata.asOfDate, provenance: `${LSEG_ASSUMPTION_NOTE}: manual buyback execution price assumption.` },
    { key: "weightDcf", label: "DCF Weight", value: defaultLsegValuationAssumptions.weightDcf, min: 0.1, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "DCF blend weight.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightFcfYield", label: "FCF Yield Weight", value: defaultLsegValuationAssumptions.weightFcfYield, min: 0.1, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "FCF yield blend weight.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightSotp", label: "SOTP Weight", value: defaultLsegValuationAssumptions.weightSotp, min: 0.1, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "SOTP blend weight.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightPe", label: "P/E Weight", value: defaultLsegValuationAssumptions.weightPe, min: 0.05, max: 0.4, step: 0.01, format: "percent", source: "assumption", description: "P/E blend weight.", category: "Blend", unit: "percent", periodicity: "annual" },
  ],
  scenarios: [
    { name: "Bear", assumptions: lsegScenarioPresets.Bear },
    { name: "Base", assumptions: lsegScenarioPresets.Base },
    { name: "Bull", assumptions: lsegScenarioPresets.Bull },
  ],
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveLsegDataset(data);
    const resolvedPeriod = resolveLsegPeriodFromData(data, getDefaultLsegPeriod());
    return calculateLsegValuation(
      dataset,
      resolvedPeriod,
      scenario,
      { ...defaultLsegValuationAssumptions, ...(assumptions as Partial<typeof defaultLsegValuationAssumptions>) },
    );
  },
};

export const lsegModule: StockModule = {
  ticker: "LSEG",
  name: "London Stock Exchange Group",
  sector: "Financial Market Infrastructure / Data",
  currency: "GBP",
  description: "Institutional buy-side KPI-driven valuation built on segment revenue, margin, FCF, buyback, WACC, SOTP, and DCF rather than direct moat-score capitalization.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "segments", label: "Segments" },
    { value: "fcf", label: "FCF" },
    { value: "buyback-eps", label: "Buyback & EPS" },
    { value: "valuation", label: "Valuation" },
    { value: "consensus", label: "Consensus" },
    { value: "scenarios", label: "Scenario Lab" },
    { value: "transcript-intelligence", label: "Transcript Intelligence" },
    { value: "quality-diagnostics", label: "Quality Diagnostics" },
  ],
  periods: getLsegPeriods(),
  data: lsegMockData,
  getDefaultPeriod: () => getDefaultLsegPeriod(),
  calculateSummary: (data) => {
    const dataset = resolveLsegDataset(data);
    const resolvedPeriod = resolveLsegPeriodFromData(data, getDefaultLsegPeriod());
    return calculateLsegSummary(dataset, resolvedPeriod);
  },
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateLsegValuation(
      resolveLsegDataset(data),
      resolveLsegPeriodFromData(data, getDefaultLsegPeriod()),
      scenario,
      assumptions as Partial<typeof defaultLsegValuationAssumptions>,
    ),
  valuationConfig: lsegValuationConfig,
  Dashboard: LsegDashboard,
};
