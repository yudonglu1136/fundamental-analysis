import type { Scenario, ValuationAssumption } from "../types";
import { metaData } from "./data";

export type MetaAssumptions = {
  currentPrice: number;
  forwardEps: number;
  targetPe: number;
  revenueGrowth: number;
  operatingMargin: number;
  taxRate: number;
  adRevenueGrowth: number;
  adImpressionsGrowth: number;
  cpmGrowth: number;
  aiConversionUplift: number;
  aiCpmUplift: number;
  aiEngagementUplift: number;
  aiCreativeAutomationUplift: number;
  advantagePlusAdoption: number;
  aiUpliftCorrelationHaircut: number;
  incrementalAdMargin: number;
  aiServingCost: number;
  aiInferenceCost: number;
  aiAdOpex: number;
  aiCapexGrowth: number;
  aiInvestedCapital: number;
  fcfPerShare: number;
  targetFcfYield: number;
  fcfMargin: number;
  wacc: number;
  terminalGrowth: number;
  realityLabsLoss: number;
  whatsappRevenue: number;
  whatsappMargin: number;
  whatsappMultiple: number;
  whatsappOptionalityValue: number;
  realityLabsOptionalityValue: number;
  exitMultiple: number;
  dividendYield: number;
  cumulativeDividends: number;
};

export const metaScenarioDefaults: Record<Scenario, MetaAssumptions> = {
  Bear: {
    currentPrice: metaData.currentPrice,
    forwardEps: 28,
    targetPe: 22,
    revenueGrowth: 0.08,
    operatingMargin: 0.39,
    taxRate: 0.17,
    adRevenueGrowth: 0.07,
    adImpressionsGrowth: 0.05,
    cpmGrowth: 0.02,
    aiConversionUplift: 0.015,
    aiCpmUplift: 0.015,
    aiEngagementUplift: 0.01,
    aiCreativeAutomationUplift: 0.01,
    advantagePlusAdoption: 0.2,
    aiUpliftCorrelationHaircut: 0.18,
    incrementalAdMargin: 0.48,
    aiServingCost: 10,
    aiInferenceCost: 4.6,
    aiAdOpex: 4.2,
    aiCapexGrowth: 0.28,
    aiInvestedCapital: 140,
    fcfPerShare: 21,
    targetFcfYield: 0.048,
    fcfMargin: 0.25,
    wacc: 0.092,
    terminalGrowth: 0.025,
    realityLabsLoss: 20,
    whatsappRevenue: 6.5,
    whatsappMargin: 0.24,
    whatsappMultiple: 14,
    whatsappOptionalityValue: 35,
    realityLabsOptionalityValue: 0,
    exitMultiple: 22,
    dividendYield: metaData.dividendYield,
    cumulativeDividends: metaData.currentPrice * metaData.dividendYield * 3,
  },
  Base: {
    currentPrice: metaData.currentPrice,
    forwardEps: 30,
    targetPe: 25,
    revenueGrowth: 0.12,
    operatingMargin: 0.42,
    taxRate: 0.17,
    adRevenueGrowth: 0.12,
    adImpressionsGrowth: 0.08,
    cpmGrowth: 0.05,
    aiConversionUplift: 0.03,
    aiCpmUplift: 0.03,
    aiEngagementUplift: 0.02,
    aiCreativeAutomationUplift: 0.02,
    advantagePlusAdoption: 0.32,
    aiUpliftCorrelationHaircut: 0.14,
    incrementalAdMargin: 0.55,
    aiServingCost: 8,
    aiInferenceCost: 3.8,
    aiAdOpex: 3.6,
    aiCapexGrowth: 0.2,
    aiInvestedCapital: 120,
    fcfPerShare: 24,
    targetFcfYield: 0.04,
    fcfMargin: 0.28,
    wacc: 0.085,
    terminalGrowth: 0.03,
    realityLabsLoss: 18,
    whatsappRevenue: 8,
    whatsappMargin: 0.3,
    whatsappMultiple: 20,
    whatsappOptionalityValue: 50,
    realityLabsOptionalityValue: 0,
    exitMultiple: 25,
    dividendYield: metaData.dividendYield,
    cumulativeDividends: metaData.currentPrice * metaData.dividendYield * 3,
  },
  Bull: {
    currentPrice: metaData.currentPrice,
    forwardEps: 33,
    targetPe: 29,
    revenueGrowth: 0.15,
    operatingMargin: 0.45,
    taxRate: 0.17,
    adRevenueGrowth: 0.15,
    adImpressionsGrowth: 0.1,
    cpmGrowth: 0.07,
    aiConversionUplift: 0.04,
    aiCpmUplift: 0.04,
    aiEngagementUplift: 0.03,
    aiCreativeAutomationUplift: 0.03,
    advantagePlusAdoption: 0.42,
    aiUpliftCorrelationHaircut: 0.1,
    incrementalAdMargin: 0.6,
    aiServingCost: 7,
    aiInferenceCost: 3.1,
    aiAdOpex: 3,
    aiCapexGrowth: 0.14,
    aiInvestedCapital: 105,
    fcfPerShare: 27,
    targetFcfYield: 0.035,
    fcfMargin: 0.31,
    wacc: 0.08,
    terminalGrowth: 0.035,
    realityLabsLoss: 16,
    whatsappRevenue: 10,
    whatsappMargin: 0.34,
    whatsappMultiple: 22,
    whatsappOptionalityValue: 65,
    realityLabsOptionalityValue: 5,
    exitMultiple: 29,
    dividendYield: metaData.dividendYield,
    cumulativeDividends: metaData.currentPrice * metaData.dividendYield * 3,
  },
};

export const defaultMetaAssumptions = metaScenarioDefaults.Base;

export const metaAssumptionDefinitions: ValuationAssumption[] = [
  { key: "currentPrice", label: "Current Price", value: defaultMetaAssumptions.currentPrice, min: 300, max: 850, step: 1, format: "currency", source: "actual", description: "Current META share price used for upside/downside and CAGR.", category: "Overview", unit: "USD", asOfDate: metaData.latestReferenceDate, provenance: "Local Meta price anchor in USD." },
  { key: "forwardEps", label: "Forward EPS", value: defaultMetaAssumptions.forwardEps, min: 20, max: 40, step: 0.1, format: "currency", source: "consensus", description: "Annual forward EPS anchor for core Ads valuation.", category: "Valuation", unit: "USD", periodicity: "forward annual", asOfDate: metaData.latestReferenceDate, provenance: "Consensus-style annual EPS estimate." },
  { key: "targetPe", label: "Target P/E", value: defaultMetaAssumptions.targetPe, min: 18, max: 35, step: 0.1, format: "multiple", source: "consensus", description: "Forward P/E multiple used for core Ads valuation.", category: "Valuation", unit: "multiple" },
  { key: "revenueGrowth", label: "Revenue Growth", value: defaultMetaAssumptions.revenueGrowth, min: 0.02, max: 0.25, step: 0.005, format: "percent", source: "assumption", description: "Core company growth assumption for DCF and scenario work.", category: "Overview", periodicity: "annual" },
  { key: "operatingMargin", label: "Operating Margin", value: defaultMetaAssumptions.operatingMargin, min: 0.3, max: 0.5, step: 0.005, format: "percent", source: "assumption", description: "Family of Apps margin after ad efficiency and AI uplift.", category: "Ads Engine", periodicity: "annual" },
  { key: "taxRate", label: "Tax Rate", value: defaultMetaAssumptions.taxRate, min: 0.1, max: 0.25, step: 0.005, format: "percent", source: "assumption", description: "After-tax conversion for AI Ad ROIC and valuation math.", category: "Valuation", periodicity: "annual" },
  { key: "adRevenueGrowth", label: "Ad Revenue Growth", value: defaultMetaAssumptions.adRevenueGrowth, min: 0.02, max: 0.25, step: 0.005, format: "percent", source: "assumption", description: "Growth in Family of Apps ad revenue.", category: "Ads Engine", periodicity: "annual" },
  { key: "adImpressionsGrowth", label: "Ad Impressions Growth", value: defaultMetaAssumptions.adImpressionsGrowth, min: 0.01, max: 0.2, step: 0.005, format: "percent", source: "assumption", description: "Impression growth from feed and reels engagement.", category: "Ads Engine", periodicity: "annual" },
  { key: "cpmGrowth", label: "CPM Growth", value: defaultMetaAssumptions.cpmGrowth, min: -0.05, max: 0.15, step: 0.002, format: "percent", source: "derived", description: "Average price-per-ad growth proxy for monetization quality.", category: "Ads Engine", periodicity: "annual" },
  { key: "aiConversionUplift", label: "AI Conversion Uplift", value: defaultMetaAssumptions.aiConversionUplift, min: 0, max: 0.08, step: 0.001, format: "percent", source: "assumption", description: "Incremental conversion improvement from AI targeting.", category: "AI Ad Stack", periodicity: "annual" },
  { key: "aiCpmUplift", label: "AI CPM Uplift", value: defaultMetaAssumptions.aiCpmUplift, min: 0, max: 0.08, step: 0.001, format: "percent", source: "assumption", description: "Pricing lift from better targeting and higher-value auctions.", category: "AI Ad Stack", periodicity: "annual" },
  { key: "aiEngagementUplift", label: "AI Engagement Uplift", value: defaultMetaAssumptions.aiEngagementUplift, min: 0, max: 0.05, step: 0.001, format: "percent", source: "assumption", description: "Incremental engagement from better recommendation quality.", category: "Engagement / Reels", periodicity: "annual" },
  { key: "aiCreativeAutomationUplift", label: "AI Creative Automation Uplift", value: defaultMetaAssumptions.aiCreativeAutomationUplift, min: 0, max: 0.05, step: 0.001, format: "percent", source: "assumption", description: "Ad creative automation and SMB adoption uplift.", category: "AI Ad Stack", periodicity: "annual" },
  { key: "advantagePlusAdoption", label: "Advantage+ Adoption", value: defaultMetaAssumptions.advantagePlusAdoption, min: 0.1, max: 0.65, step: 0.005, format: "percent", source: "assumption", description: "Estimated share of ad demand using AI-driven campaign automation and targeting products.", category: "AI Ad Stack", periodicity: "annual" },
  { key: "aiUpliftCorrelationHaircut", label: "AI Uplift Correlation Haircut", value: defaultMetaAssumptions.aiUpliftCorrelationHaircut, min: 0, max: 0.4, step: 0.005, format: "percent", source: "assumption", description: "Heuristic guardrail against double-counting overlapping CPM, conversion, ROAS, engagement, and creative uplift drivers.", category: "AI Ad Stack", periodicity: "annual" },
  { key: "incrementalAdMargin", label: "Incremental Ad Margin", value: defaultMetaAssumptions.incrementalAdMargin, min: 0.35, max: 0.7, step: 0.005, format: "percent", source: "derived", description: "Margin on incremental AI-driven ad revenue.", category: "AI Ad Stack", periodicity: "annual" },
  { key: "aiServingCost", label: "AI Serving Cost", value: defaultMetaAssumptions.aiServingCost, min: 4, max: 14, step: 0.1, format: "currency", source: "assumption", description: "Annual AI inference and serving cost burden.", category: "AI Ad Stack", unit: "USD", periodicity: "annual", asOfDate: metaData.latestReferenceDate, provenance: "Internal model estimate." },
  { key: "aiInferenceCost", label: "AI Inference Cost", value: defaultMetaAssumptions.aiInferenceCost, min: 1.5, max: 8, step: 0.1, format: "currency", source: "assumption", description: "Direct annual inference cost burden from recommendation, ranking, and ad targeting models.", category: "AI Ad Stack", unit: "USD", periodicity: "annual", asOfDate: metaData.latestReferenceDate, provenance: "Internal model estimate." },
  { key: "aiAdOpex", label: "AI Ad Stack Opex", value: defaultMetaAssumptions.aiAdOpex, min: 1, max: 8, step: 0.1, format: "currency", source: "derived", description: "Annual AI ad stack operating expense beyond serving cost.", category: "AI Ad Stack", unit: "USD", periodicity: "annual" },
  { key: "aiCapexGrowth", label: "AI CapEx Growth", value: defaultMetaAssumptions.aiCapexGrowth, min: 0.05, max: 0.4, step: 0.005, format: "percent", source: "assumption", description: "Annual growth in AI infrastructure investment intensity.", category: "CapEx / FCF", periodicity: "annual" },
  { key: "aiInvestedCapital", label: "AI Invested Capital", value: defaultMetaAssumptions.aiInvestedCapital, min: 80, max: 200, step: 1, format: "currency", source: "assumption", description: "Capital base supporting AI infrastructure and model training assets.", category: "AI Ad ROIC", unit: "USD", periodicity: "annual", asOfDate: metaData.latestReferenceDate, provenance: "Internal model estimate." },
  { key: "fcfPerShare", label: "FCF per Share", value: defaultMetaAssumptions.fcfPerShare, min: 16, max: 36, step: 0.1, format: "currency", source: "consensus", description: "Annual free cash flow per share.", category: "CapEx / FCF", unit: "USD", periodicity: "annual", asOfDate: metaData.latestReferenceDate },
  { key: "targetFcfYield", label: "Target FCF Yield", value: defaultMetaAssumptions.targetFcfYield, min: 0.025, max: 0.06, step: 0.001, format: "percent", source: "assumption", description: "FCF yield anchor for the cash flow valuation method.", category: "CapEx / FCF", periodicity: "annual" },
  { key: "fcfMargin", label: "FCF Margin", value: defaultMetaAssumptions.fcfMargin, min: 0.2, max: 0.35, step: 0.005, format: "percent", source: "derived", description: "Cash conversion after the AI infrastructure buildout.", category: "CapEx / FCF", periodicity: "annual" },
  { key: "wacc", label: "WACC", value: defaultMetaAssumptions.wacc, min: 0.06, max: 0.11, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for DCF and ROIC spread tests.", category: "Valuation", periodicity: "annual" },
  { key: "terminalGrowth", label: "Terminal Growth", value: defaultMetaAssumptions.terminalGrowth, min: 0.015, max: 0.05, step: 0.001, format: "percent", source: "assumption", description: "Long-run growth rate once AI economics normalize.", category: "Valuation", periodicity: "annual" },
  { key: "realityLabsLoss", label: "Reality Labs Loss", value: defaultMetaAssumptions.realityLabsLoss, min: 8, max: 30, step: 0.5, format: "currency", source: "actual", description: "Annual operating loss from Reality Labs drag.", category: "Reality Labs", unit: "USD", periodicity: "annual" },
  { key: "realityLabsOptionalityValue", label: "Reality Labs Optionality", value: defaultMetaAssumptions.realityLabsOptionalityValue, min: 0, max: 20, step: 0.5, format: "currency", source: "assumption", description: "Optionality if Reality Labs eventually creates value.", category: "Reality Labs", unit: "USD" },
  { key: "whatsappRevenue", label: "WhatsApp Business Revenue", value: defaultMetaAssumptions.whatsappRevenue, min: 2, max: 16, step: 0.1, format: "currency", source: "assumption", description: "Annual business messaging / WhatsApp revenue run rate.", category: "WhatsApp Optionality", unit: "USD", periodicity: "annual", provenance: "Internal monetization estimate." },
  { key: "whatsappMargin", label: "WhatsApp Margin", value: defaultMetaAssumptions.whatsappMargin, min: 0.15, max: 0.45, step: 0.005, format: "percent", source: "assumption", description: "Profitability assumption for business messaging monetization.", category: "WhatsApp Optionality" },
  { key: "whatsappMultiple", label: "WhatsApp Multiple", value: defaultMetaAssumptions.whatsappMultiple, min: 8, max: 30, step: 0.1, format: "multiple", source: "assumption", description: "Revenue or earnings multiple applied to WhatsApp optionality.", category: "WhatsApp Optionality" },
  { key: "whatsappOptionalityValue", label: "Manual WhatsApp Optionality Override", value: defaultMetaAssumptions.whatsappOptionalityValue, min: 0, max: 100, step: 1, format: "currency", source: "assumption", description: "Manual top-up override in USD bn equity value, used only if you intentionally want to supplement the engine-derived WhatsApp valuation.", category: "WhatsApp Optionality", unit: "USD" },
  { key: "exitMultiple", label: "Exit Multiple", value: defaultMetaAssumptions.exitMultiple, min: 18, max: 35, step: 0.1, format: "multiple", source: "assumption", description: "3-year exit multiple for scenario target price.", category: "Valuation" },
  { key: "dividendYield", label: "Dividend Yield", value: defaultMetaAssumptions.dividendYield, min: 0, max: 0.02, step: 0.001, format: "percent", source: "actual", description: "Cash dividend yield used in shareholder CAGR.", category: "Valuation" },
  { key: "cumulativeDividends", label: "Cumulative Dividends", value: defaultMetaAssumptions.cumulativeDividends, min: 0, max: 20, step: 0.1, format: "currency", source: "derived", description: "Three-year cumulative dividends used in shareholder CAGR.", category: "Valuation", unit: "USD" },
];

export const metaValuationAssumptionKeys = [
  "currentPrice",
  "forwardEps",
  "targetPe",
  "revenueGrowth",
  "operatingMargin",
  "taxRate",
  "adRevenueGrowth",
  "adImpressionsGrowth",
  "cpmGrowth",
  "aiConversionUplift",
  "aiCpmUplift",
  "aiEngagementUplift",
  "aiCreativeAutomationUplift",
  "advantagePlusAdoption",
  "aiUpliftCorrelationHaircut",
  "incrementalAdMargin",
  "aiServingCost",
  "aiInferenceCost",
  "aiAdOpex",
  "aiCapexGrowth",
  "aiInvestedCapital",
  "fcfPerShare",
  "targetFcfYield",
  "fcfMargin",
  "wacc",
  "terminalGrowth",
  "realityLabsLoss",
  "whatsappRevenue",
  "whatsappMargin",
  "whatsappMultiple",
  "whatsappOptionalityValue",
  "realityLabsOptionalityValue",
  "exitMultiple",
  "dividendYield",
  "cumulativeDividends",
] as const;

export function getMetaScenarioDefaults(scenario: Scenario) {
  return metaScenarioDefaults[scenario];
}

export function matchMetaScenario(values: MetaAssumptions): Scenario | "Custom" {
  const scenarios = Object.entries(metaScenarioDefaults) as Array<[Scenario, MetaAssumptions]>;
  for (const [scenario, defaults] of scenarios) {
    const same = Object.keys(defaults).every((key) => Math.abs(values[key as keyof MetaAssumptions] - defaults[key as keyof MetaAssumptions]) < 0.0001);
    if (same) return scenario;
  }
  return "Custom";
}
