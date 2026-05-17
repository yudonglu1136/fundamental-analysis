import type { StockModule, StockValuationConfig } from "../types";
import { GooglDashboard } from "./dashboard";
import {
  attachGooglRuntimeContext,
  calculateGooglSummary,
  calculateGooglValuation,
  defaultGooglValuationAssumptions,
  getDefaultGooglPeriod,
  getGooglPeriods,
  googlDataset,
  googlScenarioPresets,
  resolveGooglDataset,
  resolveGooglPeriodFromData,
} from "./calculations";
import { googlAssumptionDefinitions } from "./assumptions";
import type { GooglValuationAssumptions } from "./model";

const googlPriceMetadata = {
  ticker: "GOOGL",
  currentPrice: googlDataset.marketData.currentPrice,
  currency: "USD" as const,
  unit: "share" as const,
  asOfDate: googlDataset.marketData.priceDate,
  source: "actual" as const,
  marketReference: googlDataset.marketData.currentPrice,
  provenance: `market_data: ${googlDataset.marketData.sourceId} (${googlDataset.marketData.notes})`,
};

export const googlValuationConfig: StockValuationConfig = {
  ticker: "GOOGL",
  modelType: "Alphabet Search / YouTube / Cloud / TPU-CapEx / regulatory SOTP triangulation",
  priceMetadata: googlPriceMetadata,
  assumptions: googlAssumptionDefinitions,
  scenarios: [
    { name: "Bear", assumptions: googlScenarioPresets.Bear },
    { name: "Base", assumptions: googlScenarioPresets.Base },
    { name: "Bull", assumptions: googlScenarioPresets.Bull },
  ],
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveGooglDataset(data);
    return calculateGooglValuation(
      dataset,
      resolveGooglPeriodFromData(data, getDefaultGooglPeriod()),
      scenario,
      { ...defaultGooglValuationAssumptions, ...(assumptions as Partial<GooglValuationAssumptions>) },
    );
  },
};

export const googlModule: StockModule = {
  ticker: "GOOGL",
  name: "Alphabet Inc.",
  sector: "Search / YouTube / Cloud / AI Infrastructure",
  currency: "USD",
  description:
    "Alphabet buy-side cockpit focused on Search AI monetization, YouTube economics, Google Cloud backlog and margin, TPU/AI CapEx, regulatory remedies, Other Bets option value, FCF and valuation triangulation.",
  tabs: [
    { value: "executive", label: "Executive Snapshot" },
    { value: "search-ads", label: "Search & Ads Moat" },
    { value: "youtube", label: "YouTube Economics" },
    { value: "cloud", label: "Cloud & AI Workloads" },
    { value: "tpu-capex", label: "TPU / AI CapEx Lab" },
    { value: "transcripts", label: "Earnings Call Lab" },
    { value: "regulatory", label: "Regulatory Red Team" },
    { value: "other-bets", label: "Other Bets / Waymo" },
    { value: "valuation", label: "Valuation Triangulation" },
    { value: "capital-return", label: "Capital Return & FCF" },
    { value: "monitoring", label: "Monitoring Dashboard" },
  ],
  periods: getGooglPeriods(),
  data: googlDataset,
  getDefaultPeriod: () => getDefaultGooglPeriod(),
  calculateSummary: (data) => calculateGooglSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateGooglValuation(data, resolveGooglPeriodFromData(data, getDefaultGooglPeriod()), scenario, assumptions as Partial<GooglValuationAssumptions>),
  valuationConfig: googlValuationConfig,
  Dashboard: GooglDashboard,
};

export function attachGooglModuleRuntime(dataSourceType: Parameters<typeof attachGooglRuntimeContext>[1]["dataSourceType"], periodId = getDefaultGooglPeriod()) {
  return attachGooglRuntimeContext(googlDataset, { dataSourceType, periodId });
}
