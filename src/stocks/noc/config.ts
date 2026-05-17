import type { StockModule, StockValuationConfig } from "../types";
import { NocDashboard } from "./dashboard";
import {
  attachNocRuntimeContext,
  calculateNocSummary,
  calculateNocValuation,
  defaultNocValuationAssumptions,
  getDefaultNocPeriod,
  getNocPeriods,
  nocDataset,
  nocScenarioPresets,
  resolveNocDataset,
  resolveNocPeriodFromData,
} from "./calculations";
import type { NocValuationAssumptions } from "./model";

const NOC_DISCLOSURE_DATE = "2026-04-21";
const NOC_ASSUMPTION_NOTE = "analyst_forecast_assumption";

const nocPriceMetadata = {
  ticker: "NOC",
  currentPrice: nocDataset.marketData.currentPrice,
  currency: "USD" as const,
  unit: "share" as const,
  asOfDate: nocDataset.marketData.priceDate,
  source: "placeholder" as const,
  marketReference: nocDataset.marketData.currentPrice,
  provenance: `market_data: ${nocDataset.marketData.source}`,
};

export const nocValuationConfig: StockValuationConfig = {
  ticker: "NOC",
  modelType: "U.S. defense-prime FCFF / FCF yield / multiples / SOTP / backlog durability",
  priceMetadata: nocPriceMetadata,
  assumptions: [
    { key: "currentPrice", label: "Current Price", value: defaultNocValuationAssumptions.currentPrice, min: 350, max: 850, step: 1, format: "currency", source: "placeholder", description: "Replaceable NOC market-price anchor; not an official source.", category: "Market", unit: "USD", periodicity: "annual", asOfDate: nocPriceMetadata.asOfDate, provenance: nocPriceMetadata.provenance },
    { key: "revenueCagr", label: "Revenue CAGR", value: defaultNocValuationAssumptions.revenueCagr, min: 0, max: 0.09, step: 0.0025, format: "percent", source: "assumption", description: "Forecast sales CAGR mapped from U.S. budget, B-21, Sentinel, Space Systems and Mission Systems assumptions.", category: "Growth", unit: "percent", periodicity: "annual", asOfDate: NOC_DISCLOSURE_DATE, provenance: `${NOC_ASSUMPTION_NOTE}: Base case starts from FY2026 management guidance and normalizes thereafter.` },
    { key: "segmentOperatingMargin", label: "Segment Op Margin", value: defaultNocValuationAssumptions.segmentOperatingMargin, min: 0.085, max: 0.13, step: 0.001, format: "percent", source: "assumption", description: "Normalized segment operating margin before explicit Sentinel risk charge and program premia.", category: "Margin", unit: "percent", periodicity: "annual", asOfDate: NOC_DISCLOSURE_DATE, provenance: `${NOC_ASSUMPTION_NOTE}: anchored to FY2026 guidance and FY2025/Q1 2026 segment margin.` },
    { key: "taxRate", label: "Tax Rate", value: defaultNocValuationAssumptions.taxRate, min: 0.12, max: 0.23, step: 0.001, format: "percent", source: "assumption", description: "Effective tax rate used in NOPAT and EPS bridge.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: NOC_DISCLOSURE_DATE, provenance: `${NOC_ASSUMPTION_NOTE}: normalized U.S. defense-prime tax assumption.` },
    { key: "dAndAIntensity", label: "D&A / Sales", value: defaultNocValuationAssumptions.dAndAIntensity, min: 0.015, max: 0.045, step: 0.001, format: "percent", source: "assumption", description: "Depreciation and amortization as a percentage of sales.", category: "Cash Flow", unit: "percent", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: rounded from segment-level D&A disclosures and history.` },
    { key: "capexIntensity", label: "Capex / Sales", value: defaultNocValuationAssumptions.capexIntensity, min: 0.02, max: 0.055, step: 0.001, format: "percent", source: "derived", description: "Capital expenditure intensity using FY2025 capex divided by sales.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: "2025-12-31", provenance: "official_actual: FY2025 capex / FY2025 sales." },
    { key: "workingCapitalDragPctRevenueGrowth", label: "WC Drag / Sales Growth", value: defaultNocValuationAssumptions.workingCapitalDragPctRevenueGrowth, min: 0, max: 0.3, step: 0.005, format: "percent", source: "assumption", description: "Working-capital investment as a percentage of incremental sales.", category: "Cash Flow", unit: "percent", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: captures unbilled receivables, fixed-price EAC timing and seasonal cash conversion.` },
    { key: "wacc", label: "WACC", value: defaultNocValuationAssumptions.wacc, min: 0.065, max: 0.105, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for unlevered FCFF DCF.", category: "DCF", unit: "percent", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: U.S. defense-prime discount-rate assumption.` },
    { key: "terminalGrowth", label: "Terminal Growth", value: defaultNocValuationAssumptions.terminalGrowth, min: 0.01, max: 0.035, step: 0.0005, format: "percent", source: "assumption", description: "Long-run nominal terminal growth.", category: "DCF", unit: "percent", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: mature defense-prime terminal growth assumption.` },
    { key: "targetFcfYield", label: "Target FCF Yield", value: defaultNocValuationAssumptions.targetFcfYield, min: 0.035, max: 0.07, step: 0.0005, format: "percent", source: "assumption", description: "Target normalized FCF yield.", category: "Multiples", unit: "percent", periodicity: "forward annual", provenance: `${NOC_ASSUMPTION_NOTE}: cross-check against FCF/share compounding.` },
    { key: "targetPe", label: "Target P/E", value: defaultNocValuationAssumptions.targetPe, min: 14, max: 28, step: 0.25, format: "multiple", source: "assumption", description: "Forward P/E cross-check.", category: "Multiples", unit: "multiple", periodicity: "forward annual", provenance: `${NOC_ASSUMPTION_NOTE}: triangulation multiple; not a stand-alone P/E page.` },
    { key: "targetEvEbit", label: "Target EV / EBIT", value: defaultNocValuationAssumptions.targetEvEbit, min: 11, max: 22, step: 0.25, format: "multiple", source: "assumption", description: "Forward EV / segment operating income cross-check.", category: "Multiples", unit: "multiple", periodicity: "forward annual", provenance: `${NOC_ASSUMPTION_NOTE}: reflects defense-prime operating quality and program risk.` },
    { key: "netDebt", label: "Net Debt", value: defaultNocValuationAssumptions.netDebt, min: 5_000, max: 20_000, step: 100, format: "number", source: "actual", description: "FY2025 debt less cash.", category: "Balance Sheet", unit: "USD", periodicity: "annual", asOfDate: "2025-12-31", provenance: "official_actual: FY2025 annual report cash and debt." },
    { key: "pensionSurplusCredit", label: "Pension / OPB Surplus", value: defaultNocValuationAssumptions.pensionSurplusCredit, min: -1_000, max: 4_000, step: 50, format: "number", source: "actual", description: "Pension and other post-retirement asset surplus credited in equity bridge.", category: "Balance Sheet", unit: "USD", periodicity: "annual", asOfDate: "2025-12-31", provenance: "official_actual: FY2025 annual report pension / OPB assets less liabilities." },
    { key: "dilutedShares", label: "Diluted Shares", value: defaultNocValuationAssumptions.dilutedShares, min: 120, max: 165, step: 0.5, format: "number", source: "actual", description: "FY2025 diluted weighted-average shares in millions.", category: "Share Count", unit: "share", periodicity: "annual", asOfDate: "2025-12-31", provenance: "official_actual: FY2025 annual report diluted shares." },
    { key: "dividendPerShare", label: "Dividend / Share", value: defaultNocValuationAssumptions.dividendPerShare, min: 6, max: 14, step: 0.05, format: "currency", source: "actual", description: "FY2025 dividends per share.", category: "Capital Returns", unit: "USD", periodicity: "annual", asOfDate: "2025-12-31", provenance: "official_actual: FY2025 annual report dividends per share." },
    { key: "b21ScaleMultiplier", label: "B-21 Scale Multiplier", value: defaultNocValuationAssumptions.b21ScaleMultiplier, min: 0.8, max: 1.25, step: 0.01, format: "number", source: "assumption", description: "Explicit B-21 production scale and learning-curve lever.", category: "Program Drivers", unit: "number", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: maps B-21 production-rate debate into revenue CAGR and SOTP multiple.` },
    { key: "sentinelRiskCharge", label: "Sentinel Risk Charge", value: defaultNocValuationAssumptions.sentinelRiskCharge, min: 0, max: 0.015, step: 0.0005, format: "percent", source: "assumption", description: "Margin charge for Sentinel restructuring, cost overrun and EAC risk.", category: "Program Drivers", unit: "percent", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: maps GBSD / Sentinel red-team risk into margin and Defense SOTP multiple.` },
    { key: "spaceGrowthPremium", label: "Space Growth Premium", value: defaultNocValuationAssumptions.spaceGrowthPremium, min: -0.01, max: 0.02, step: 0.0005, format: "percent", source: "assumption", description: "Incremental revenue CAGR and Space SOTP premium from SDA/restricted/Space Force demand.", category: "Program Drivers", unit: "percent", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: tests whether Space Systems remains structural growth or cadence-limited.` },
    { key: "missionMoatPremium", label: "Mission Moat Premium", value: defaultNocValuationAssumptions.missionMoatPremium, min: 0, max: 0.035, step: 0.0005, format: "percent", source: "assumption", description: "Margin/multiple premium for C4ISR, EW, sensors, microelectronics, cyber and marine systems moat.", category: "Program Drivers", unit: "percent", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: maps Mission Systems quality into SOTP and margin support.` },
    { key: "backlogDurabilityMaxAdjustment", label: "Backlog Adjustment Cap", value: defaultNocValuationAssumptions.backlogDurabilityMaxAdjustment, min: 0, max: 0.15, step: 0.005, format: "percent", source: "assumption", description: "Maximum valuation adjustment from backlog durability score.", category: "Backlog", unit: "percent", periodicity: "annual", provenance: `${NOC_ASSUMPTION_NOTE}: prevents backlog from becoming a mechanical valuation uplift.` },
    { key: "weightDcf", label: "DCF Weight", value: defaultNocValuationAssumptions.weightDcf, min: 0.05, max: 0.5, step: 0.01, format: "percent", source: "assumption", description: "DCF weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightFcfYield", label: "FCF Yield Weight", value: defaultNocValuationAssumptions.weightFcfYield, min: 0.05, max: 0.4, step: 0.01, format: "percent", source: "assumption", description: "FCF yield weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightEvEbit", label: "EV / EBIT Weight", value: defaultNocValuationAssumptions.weightEvEbit, min: 0.05, max: 0.3, step: 0.01, format: "percent", source: "assumption", description: "EV / EBIT weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightPe", label: "P/E Weight", value: defaultNocValuationAssumptions.weightPe, min: 0.05, max: 0.3, step: 0.01, format: "percent", source: "assumption", description: "P/E weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightSotp", label: "SOTP Weight", value: defaultNocValuationAssumptions.weightSotp, min: 0.05, max: 0.35, step: 0.01, format: "percent", source: "assumption", description: "Segment SOTP weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
    { key: "weightBacklogDurability", label: "Backlog Layer Weight", value: defaultNocValuationAssumptions.weightBacklogDurability, min: 0, max: 0.3, step: 0.01, format: "percent", source: "assumption", description: "Weight for backlog durability-adjusted core value.", category: "Blend", unit: "percent", periodicity: "annual" },
  ],
  scenarios: [
    { name: "Bear", assumptions: nocScenarioPresets.Bear },
    { name: "Base", assumptions: nocScenarioPresets.Base },
    { name: "Bull", assumptions: nocScenarioPresets.Bull },
  ],
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveNocDataset(data);
    return calculateNocValuation(
      dataset,
      resolveNocPeriodFromData(data, getDefaultNocPeriod()),
      scenario,
      { ...defaultNocValuationAssumptions, ...(assumptions as Partial<NocValuationAssumptions>) },
    );
  },
};

export const nocModule: StockModule = {
  ticker: "NOC",
  name: "Northrop Grumman Corporation",
  sector: "Aerospace & Defense",
  currency: "USD",
  description: "U.S. defense-prime research cockpit focused on B-21, Sentinel, Space Systems, mission electronics moat, backlog durability, U.S. budget mapping, cash conversion and valuation triangulation.",
  tabs: [
    { value: "executive", label: "Executive Snapshot" },
    { value: "earnings-calls", label: "Earnings Calls" },
    { value: "programs", label: "B-21 / Sentinel / Space" },
    { value: "segments", label: "Segment Economics" },
    { value: "backlog", label: "Backlog & Visibility" },
    { value: "budget", label: "Budget Scenario Lab" },
    { value: "valuation", label: "Valuation Triangulation" },
    { value: "cash", label: "Pension / FCF / Returns" },
    { value: "risks", label: "Risk Red Team" },
    { value: "sources", label: "Source Boundary" },
  ],
  periods: getNocPeriods(),
  data: nocDataset,
  getDefaultPeriod: () => getDefaultNocPeriod(),
  calculateSummary: (data) => calculateNocSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateNocValuation(data, resolveNocPeriodFromData(data, getDefaultNocPeriod()), scenario, assumptions as Partial<NocValuationAssumptions>),
  valuationConfig: nocValuationConfig,
  Dashboard: NocDashboard,
};

export function attachNocModuleRuntime(dataSourceType: Parameters<typeof attachNocRuntimeContext>[1]["dataSourceType"], periodId = getDefaultNocPeriod()) {
  return attachNocRuntimeContext(nocDataset, { dataSourceType, periodId });
}
