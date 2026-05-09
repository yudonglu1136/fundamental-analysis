import type { StockModule, StockValuationConfig } from "../types";
import { priceMetadataByTicker } from "../../utils/valuation";
import { calculateMsftSummary, calculateMsftValuation } from "./calculations";
import { MsftDashboard } from "./dashboard";
import { defaultMsftAssumptions, msftAssumptionDefinitions, msftScenarioDefaults, msftValuationAssumptionKeys } from "./assumptions";
import { msftData } from "./data";

const msftValuationConfig: StockValuationConfig = {
  ticker: "MSFT",
  modelType: "AI Platform / Cloud Operating Leverage",
  priceMetadata: priceMetadataByTicker.MSFT,
  assumptions: msftAssumptionDefinitions.filter((item) => msftValuationAssumptionKeys.includes(item.key as (typeof msftValuationAssumptionKeys)[number])),
  scenarios: (["Bear", "Base", "Bull"] as const).map((scenario) => ({
    name: scenario,
    assumptions: Object.fromEntries(msftValuationAssumptionKeys.map((key) => [key, msftScenarioDefaults[scenario][key]])),
  })),
  calculateValuation: (assumptions, data) => calculateMsftValuation(data as typeof msftData, { ...defaultMsftAssumptions, ...(assumptions as Partial<typeof defaultMsftAssumptions>) }),
};

export const msftModule: StockModule = {
  ticker: "MSFT",
  name: "Microsoft",
  sector: "Cloud Infrastructure / AI Platform / Enterprise Software",
  currency: "USD",
  description: "Institutional AI economics dashboard tracking Azure AI growth quality, cloud margin dilution, CapEx payback, Copilot monetization, AI ROIC, FCF, and valuation.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "ai-revenue", label: "AI Revenue" },
    { value: "cloud-margins", label: "Cloud Margins" },
    { value: "ai-capex", label: "AI CapEx" },
    { value: "copilot", label: "Copilot / Agents" },
    { value: "ai-roic", label: "AI ROIC" },
    { value: "fcf", label: "FCF" },
    { value: "valuation", label: "Valuation" },
    { value: "scenario-lab", label: "Scenario Lab" },
  ],
  periods: msftData.periods,
  data: msftData,
  getDefaultPeriod: () => msftData.currentPeriodId,
  calculateSummary: (data) => calculateMsftSummary(data as typeof msftData),
  calculateValuation: (data, assumptions) => calculateMsftValuation(data as typeof msftData, assumptions as Partial<typeof defaultMsftAssumptions>),
  valuationConfig: msftValuationConfig,
  Dashboard: MsftDashboard,
};
