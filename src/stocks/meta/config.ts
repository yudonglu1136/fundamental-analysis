import type { StockModule, StockValuationConfig } from "../types";
import { priceMetadataByTicker } from "../../utils/valuation";
import { MetaDashboard } from "./dashboard";
import { buildMetaDashboardData, calculateMetaSummary } from "./calculations";
import { metaData } from "./data";
import { defaultMetaAssumptions, metaAssumptionDefinitions, metaScenarioDefaults, metaValuationAssumptionKeys } from "./assumptions";

const metaValuationConfig: StockValuationConfig = {
  ticker: "META",
  modelType: "AI Ad ROIC / FCF / SOTP",
  priceMetadata: priceMetadataByTicker.META,
  assumptions: metaAssumptionDefinitions,
  scenarios: (["Bear", "Base", "Bull"] as const).map((scenario) => ({
    name: scenario,
    assumptions: Object.fromEntries(metaValuationAssumptionKeys.map((key) => [key, metaScenarioDefaults[scenario][key]])),
  })),
  calculateValuation: (assumptions, data, scenario = "Base") => buildMetaDashboardData(
    data as typeof metaData,
    { ...defaultMetaAssumptions, ...(assumptions as Partial<typeof defaultMetaAssumptions>) },
    (data as typeof metaData).currentPeriodId,
    scenario,
  ).valuation,
};

export const metaModule: StockModule = {
  ticker: "META",
  name: "Meta Platforms",
  sector: "AI-Enhanced Advertising / Social Platforms",
  currency: "USD",
  description: "AI Ad ROIC, recommendation uplift, CPM / conversion / ROAS improvement, FCF impact, Reality Labs drag, and WhatsApp optionality.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "ads-engine", label: "Ads Engine" },
    { value: "ai-ad-stack", label: "AI Ad Stack" },
    { value: "engagement-reels", label: "Engagement / Reels" },
    { value: "capex-fcf", label: "CapEx / FCF" },
    { value: "ai-ad-roic", label: "AI Ad ROIC" },
    { value: "reality-labs", label: "Reality Labs" },
    { value: "whatsapp", label: "WhatsApp Optionality" },
    { value: "valuation", label: "Valuation" },
    { value: "scenario-lab", label: "Scenario Lab" },
  ],
  periods: metaData.periods,
  data: metaData,
  getDefaultPeriod: () => metaData.currentPeriodId,
  calculateSummary: (data) => calculateMetaSummary(buildMetaDashboardData(data as typeof metaData, defaultMetaAssumptions, metaData.currentPeriodId, "Base") as never, defaultMetaAssumptions),
  calculateValuation: (data, assumptions, scenario = "Base") => buildMetaDashboardData(
    data as typeof metaData,
    { ...defaultMetaAssumptions, ...(assumptions as Partial<typeof defaultMetaAssumptions>) },
    metaData.currentPeriodId,
    scenario,
  ).valuation,
  valuationConfig: metaValuationConfig,
  Dashboard: MetaDashboard,
};
