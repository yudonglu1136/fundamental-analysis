import type { Scenario, ValuationAssumption } from "../types";
import { googlDataset } from "./data/index";
import type { GooglValuationAssumptions } from "./model";

const q1 = googlDataset.financials.find((period) => period.id === "q1-26") ?? googlDataset.financials[googlDataset.financials.length - 1];
const scenarioByName = Object.fromEntries(googlDataset.scenarioDrivers.map((driver) => [driver.scenario, driver])) as Record<Scenario, (typeof googlDataset.scenarioDrivers)[number]>;
const q1Shares = q1.dilutedShares ?? googlDataset.marketData.sharesOut;
const netCash = (q1.cashAndMarketableSecurities ?? 0) - (q1.longTermDebt ?? 0);

function buildAssumptions(scenario: Scenario): GooglValuationAssumptions {
  const driver = scenarioByName[scenario];
  return {
    currentPrice: googlDataset.marketData.currentPrice,
    searchRevenueCagr: driver.searchRevenueCagr,
    searchMonetizationChange: driver.searchMonetizationChange,
    searchAiCannibalization: driver.searchAiCannibalization,
    youtubeRevenueCagr: driver.youtubeRevenueCagr,
    subscriptionsRevenueCagr: driver.subscriptionsRevenueCagr,
    cloudRevenueCagr: driver.cloudRevenueCagr,
    cloudTerminalMargin: driver.cloudTerminalMargin,
    capexIntensity: driver.capexIntensity,
    dAndAIntensity: driver.dAndAIntensity,
    workingCapitalPctRevenueGrowth: 0.02,
    taxRate: 0.16,
    fcfMargin: driver.fcfMargin,
    tpuEfficiencyBenefit: driver.tpuEfficiencyBenefit,
    aiComputeConstraint: driver.aiComputeConstraint,
    regulatoryDiscount: driver.regulatoryDiscount,
    otherBetsOptionValue: driver.otherBetsOptionValue,
    wacc: driver.wacc,
    terminalGrowth: driver.terminalGrowth,
    targetFcfYield: driver.targetFcfYield,
    targetPe: driver.targetPe,
    targetEvEbit: driver.targetEvEbit,
    servicesMultiple: driver.servicesMultiple,
    cloudMultiple: driver.cloudMultiple,
    weightDcf: 0.35,
    weightFcfYield: 0.2,
    weightEvEbit: 0.1,
    weightPe: 0.1,
    weightSotp: 0.25,
    dilutedShares: q1Shares,
    netCash,
    dividendPerShareAnnualized: googlDataset.marketData.dividendPerShareAnnualized,
  };
}

export const googlScenarioPresets: Record<Scenario, GooglValuationAssumptions> = {
  Bear: buildAssumptions("Bear"),
  Base: buildAssumptions("Base"),
  Bull: buildAssumptions("Bull"),
};

export const defaultGooglValuationAssumptions = googlScenarioPresets.Base;
export const defaultGooglAssumptions = defaultGooglValuationAssumptions;
export type GooglAssumptions = GooglValuationAssumptions;

const ASSUMPTION_DATE = "2026-05-11";
const MARKET_DATE = googlDataset.marketData.priceDate;

function assumption(
  key: keyof GooglValuationAssumptions,
  label: string,
  min: number,
  max: number,
  step: number,
  format: ValuationAssumption["format"],
  source: ValuationAssumption["source"],
  description: string,
  category: string,
  provenance: string,
): ValuationAssumption {
  return {
    key,
    label,
    value: defaultGooglValuationAssumptions[key],
    min,
    max,
    step,
    format,
    source,
    description,
    category,
    unit: format === "currency" ? "USD" : format === "percent" ? "percent" : format === "multiple" ? "multiple" : "number",
    periodicity: "annual",
    asOfDate: source === "actual" ? MARKET_DATE : ASSUMPTION_DATE,
    provenance,
  };
}

export const googlAssumptionDefinitions: ValuationAssumption[] = [
  assumption("currentPrice", "Current Price", 100, 800, 0.1, "currency", "actual", "GOOGL share price used for upside/downside. Market data is third-party, not official Alphabet actual.", "Market", "market_data: StockAnalysis delayed snapshot."),
  assumption("searchRevenueCagr", "Search Revenue CAGR", 0, 0.16, 0.0025, "percent", "assumption", "Search & other CAGR after AI usage, monetization and regulatory effects.", "Search", "forecast_assumption: scenario driver anchored to official Search revenue."),
  assumption("searchMonetizationChange", "AI Search Monetization", -0.04, 0.04, 0.001, "percent", "assumption", "Net benefit from better commercial intent, AI Overviews ads, AI Mode and query engagement.", "Search", "forecast_assumption: AI Search monetization scenario."),
  assumption("searchAiCannibalization", "AI Answer Cannibalization", 0, 0.06, 0.001, "percent", "assumption", "Search revenue drag if answers reduce monetizable clicks and outbound journeys.", "Search", "forecast_assumption: red-team Search risk."),
  assumption("youtubeRevenueCagr", "YouTube Ads CAGR", 0, 0.18, 0.0025, "percent", "assumption", "YouTube ads growth across Shorts, living room, creator monetization and brand/direct-response demand.", "YouTube", "forecast_assumption: YouTube economics scenario."),
  assumption("subscriptionsRevenueCagr", "Subscriptions CAGR", 0, 0.25, 0.0025, "percent", "assumption", "Google subscriptions, platforms and devices growth used as a durability signal.", "YouTube", "forecast_assumption: subscriptions and platform flywheel."),
  assumption("cloudRevenueCagr", "Cloud Revenue CAGR", 0.08, 0.5, 0.005, "percent", "assumption", "Google Cloud CAGR driven by backlog conversion, AI workloads and TPU hardware/services demand.", "Cloud", "forecast_assumption: Cloud backlog and AI workload scenario."),
  assumption("cloudTerminalMargin", "Cloud Terminal Margin", 0.18, 0.42, 0.0025, "percent", "assumption", "Steady-state Cloud operating margin after TPU efficiency, Wiz headwind, depreciation, and energy costs.", "Cloud", "forecast_assumption: Cloud margin bridge."),
  assumption("capexIntensity", "CapEx / Revenue", 0.12, 0.36, 0.0025, "percent", "assumption", "Capital intensity after the AI technical infrastructure step-up.", "TPU / CapEx", "management_guidance + forecast_assumption: FY2026 CapEx guidance range translated into normalized intensity."),
  assumption("dAndAIntensity", "D&A / Revenue", 0.04, 0.12, 0.0025, "percent", "assumption", "Depreciation and amortization burden from technical infrastructure investment.", "TPU / CapEx", "derived: Q1 2026 depreciation and forecast CapEx cycle."),
  assumption("workingCapitalPctRevenueGrowth", "WC / Revenue Growth", 0, 0.08, 0.0025, "percent", "assumption", "Working-capital investment as percentage of incremental revenue.", "Cash Flow", "forecast_assumption: Alphabet working-capital bridge."),
  assumption("taxRate", "Tax Rate", 0.1, 0.22, 0.001, "percent", "assumption", "Cash tax rate used in NOPAT and valuation cross-checks.", "Cash Flow", "forecast_assumption: normalized tax rate."),
  assumption("fcfMargin", "Normalized FCF Margin", 0.12, 0.3, 0.0025, "percent", "assumption", "Normalized FCF margin after AI CapEx and TPU efficiency.", "Cash Flow", "forecast_assumption: FCF durability scenario."),
  assumption("tpuEfficiencyBenefit", "TPU Efficiency Benefit", 0, 0.08, 0.001, "percent", "assumption", "Capped margin/cost benefit from TPU vertical integration, response cost reduction and utilization.", "TPU / CapEx", "company_commentary + forecast_assumption: TPU performance and response cost signals."),
  assumption("aiComputeConstraint", "AI Compute Constraint", 0.1, 0.85, 0.01, "percent", "assumption", "Demand constrained by technical infrastructure availability; higher is worse.", "TPU / CapEx", "company_commentary: management flagged broad compute constraints."),
  assumption("regulatoryDiscount", "Regulatory Discount", 0, 0.18, 0.0025, "percent", "assumption", "Valuation discount for DOJ, EU DMA, Play, ad-tech, privacy and distribution remedies.", "Risk", "research_only: regulatory red-team scenario."),
  assumption("otherBetsOptionValue", "Other Bets Option / Share", 0, 14, 0.25, "currency", "assumption", "Capped per-share option value for Waymo and Other Bets.", "Other Bets", "research_only: capped option framework."),
  assumption("wacc", "WACC", 0.06, 0.11, 0.001, "percent", "assumption", "Discount rate for FCFF DCF.", "Valuation", "forecast_assumption: mega-cap technology risk premium."),
  assumption("terminalGrowth", "Terminal Growth", 0.015, 0.04, 0.0005, "percent", "assumption", "Long-run nominal terminal growth after AI infrastructure normalization.", "Valuation", "forecast_assumption: mature platform terminal growth."),
  assumption("targetFcfYield", "Target FCF Yield", 0.025, 0.055, 0.0005, "percent", "assumption", "FCF yield cross-check.", "Valuation", "forecast_assumption: cash-flow valuation cross-check."),
  assumption("targetPe", "Target P/E", 16, 36, 0.25, "multiple", "assumption", "Normalized earnings cross-check.", "Valuation", "forecast_assumption: PE triangulation."),
  assumption("targetEvEbit", "Target EV / EBIT", 16, 34, 0.25, "multiple", "assumption", "Operating-income cross-check.", "Valuation", "forecast_assumption: EV/EBIT triangulation."),
  assumption("servicesMultiple", "Services Multiple", 14, 30, 0.25, "multiple", "assumption", "SOTP multiple on after-tax Google Services operating income.", "Valuation", "forecast_assumption: Services SOTP multiple."),
  assumption("cloudMultiple", "Cloud Multiple", 16, 40, 0.25, "multiple", "assumption", "SOTP EV/EBIT multiple on Google Cloud.", "Valuation", "forecast_assumption: Cloud SOTP multiple."),
  assumption("weightDcf", "DCF Weight", 0.15, 0.5, 0.01, "percent", "assumption", "DCF weight in valuation blend.", "Blend", "forecast_assumption: valuation triangulation weight."),
  assumption("weightFcfYield", "FCF Yield Weight", 0.05, 0.35, 0.01, "percent", "assumption", "FCF yield weight in valuation blend.", "Blend", "forecast_assumption: valuation triangulation weight."),
  assumption("weightEvEbit", "EV / EBIT Weight", 0.05, 0.25, 0.01, "percent", "assumption", "EV/EBIT weight in valuation blend.", "Blend", "forecast_assumption: valuation triangulation weight."),
  assumption("weightPe", "P/E Weight", 0.05, 0.25, 0.01, "percent", "assumption", "P/E weight in valuation blend.", "Blend", "forecast_assumption: valuation triangulation weight."),
  assumption("weightSotp", "SOTP Weight", 0.1, 0.4, 0.01, "percent", "assumption", "SOTP weight in valuation blend.", "Blend", "forecast_assumption: valuation triangulation weight."),
  assumption("dilutedShares", "Diluted Shares", 11_500, 13_000, 10, "number", "actual", "Q1 2026 diluted shares in millions.", "Share Count", "official_actual: Q1 2026 earnings release."),
  assumption("netCash", "Net Cash", 0, 100_000, 250, "number", "derived", "Cash and marketable securities less long-term debt.", "Balance Sheet", "derived from official_actual: Q1 2026 10-Q."),
  assumption("dividendPerShareAnnualized", "Dividend / Share", 0, 2, 0.01, "currency", "actual", "Current annualized dividend per share.", "Capital Return", "market_data + official dividend policy: quarterly dividend annualized."),
];

export const googlValuationAssumptionKeys = googlAssumptionDefinitions.map((item) => item.key) as Array<keyof GooglValuationAssumptions>;

export function getGooglScenarioDefaults(scenario: Scenario) {
  return googlScenarioPresets[scenario];
}

export function matchGooglScenario(values: GooglValuationAssumptions): Scenario | "Custom" {
  for (const scenario of ["Bear", "Base", "Bull"] as Scenario[]) {
    const preset = googlScenarioPresets[scenario];
    if (Object.keys(preset).every((key) => Math.abs(values[key as keyof GooglValuationAssumptions] - preset[key as keyof GooglValuationAssumptions]) < 0.0001)) {
      return scenario;
    }
  }
  return "Custom";
}

export function pickGooglValuationAssumptions(values: Record<string, number>) {
  return Object.fromEntries(googlValuationAssumptionKeys.map((key) => [key, values[key]]));
}
