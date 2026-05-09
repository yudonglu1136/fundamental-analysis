import type { StockModule, StockValuationConfig } from "../types";
import { priceMetadataByTicker } from "../../utils/valuation";
import { GooglDashboard } from "./dashboard";
import { calculateGooglSummary } from "./calculations";
import { defaultGooglAssumptions, googlAssumptionDefinitions, googlScenarioDefaults, googlValuationAssumptionKeys } from "./assumptions";
import { googlData } from "./data";
import { buildGooglModel } from "./calculations";

const googlValuationConfig: StockValuationConfig = {
  ticker: "GOOGL",
  modelType: "Search / Cloud / TPU / AI DCF",
  priceMetadata: priceMetadataByTicker.GOOGL,
  assumptions: googlAssumptionDefinitions.filter((item) => googlValuationAssumptionKeys.includes(item.key as (typeof googlValuationAssumptionKeys)[number])),
  scenarios: (["Bear", "Base", "Bull"] as const).map((scenario) => ({
    name: scenario,
    assumptions: Object.fromEntries(googlValuationAssumptionKeys.map((key) => [key, googlScenarioDefaults[scenario][key]])),
  })),
  calculateValuation: (assumptions, data) => buildGooglModel(data as typeof googlData, { ...defaultGooglAssumptions, ...(assumptions as Partial<typeof defaultGooglAssumptions>) }, (data as typeof googlData).currentPeriodId).valuation,
};

export const googlModule: StockModule = {
  ticker: "GOOGL",
  name: "Alphabet / Google",
  sector: "AI Infrastructure / Search / Cloud / Digital Advertising",
  currency: "USD",
  description: "Institutional dashboard for Search monetization, Google Cloud margin inflection, TPU economics, AI ROIC, CapEx payback, and valuation.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "search-ads", label: "Search / Ads" },
    { value: "google-cloud", label: "Google Cloud" },
    { value: "tpu-economics", label: "TPU Economics" },
    { value: "ai-monetization", label: "AI Monetization" },
    { value: "ai-roic", label: "AI ROIC" },
    { value: "capex-fcf", label: "CapEx / FCF" },
    { value: "valuation", label: "Valuation" },
    { value: "scenario-lab", label: "Scenario Lab" },
  ],
  periods: googlData.periods,
  data: googlData,
  getDefaultPeriod: () => googlData.currentPeriodId,
  calculateSummary: (data) => calculateGooglSummary(data as typeof googlData),
  calculateValuation: (data, assumptions) => buildGooglModel(data as typeof googlData, { ...defaultGooglAssumptions, ...(assumptions as Partial<typeof defaultGooglAssumptions>) }, (data as typeof googlData).currentPeriodId).valuation,
  valuationConfig: googlValuationConfig,
  Dashboard: GooglDashboard,
};
