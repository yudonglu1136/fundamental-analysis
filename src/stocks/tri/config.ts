import type { StockModule, StockValuationConfig } from "../types";
import { triAssumptionDefinitions, triScenarioPresets } from "./assumptions";
import {
  attachTriRuntimeContext,
  calculateTriSummary,
  calculateTriValuation,
  defaultTriValuationAssumptions,
  getDefaultTriPeriod,
  getTriPeriods,
  resolveTriDataset,
  resolveTriPeriodFromData,
  triDataset,
} from "./calculations";
import { TriDashboard } from "./dashboard";
import type { TriValuationAssumptions } from "./model";

const triPriceMetadata = {
  ticker: "TRI",
  currentPrice: triDataset.marketData.currentPrice,
  currency: "USD" as const,
  unit: "share" as const,
  asOfDate: triDataset.marketData.priceDate,
  source: "actual" as const,
  marketReference: triDataset.marketData.currentPrice,
  provenance: `market_data: ${triDataset.marketData.sourceId}`,
};

export const triValuationConfig: StockValuationConfig = {
  ticker: "TRI",
  modelType: "Thomson Reuters professional-grade AI workflow / recurring revenue / SOTP triangulation",
  priceMetadata: triPriceMetadata,
  assumptions: triAssumptionDefinitions,
  scenarios: [
    { name: "Bear", assumptions: triScenarioPresets.Bear },
    { name: "Base", assumptions: triScenarioPresets.Base },
    { name: "Bull", assumptions: triScenarioPresets.Bull },
  ],
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveTriDataset(data);
    return calculateTriValuation(
      dataset,
      resolveTriPeriodFromData(data, getDefaultTriPeriod()),
      scenario,
      { ...defaultTriValuationAssumptions, ...(assumptions as Partial<TriValuationAssumptions>) },
    );
  },
};

export const triModule: StockModule = {
  ticker: "TRI",
  name: "Thomson Reuters Corporation",
  sector: "Professional Information / Legal Tech / AI Workflow",
  currency: "USD",
  description:
    "TRI buy-side cockpit focused on CoCounsel, professional-grade AI adoption, Big 3 organic growth, recurring workflow economics, free cash flow and valuation triangulation.",
  tabs: [
    { value: "executive", label: "Executive Snapshot" },
    { value: "ai-progress", label: "AI Progress Lab" },
    { value: "segments", label: "Segment Economics" },
    { value: "valuation", label: "Valuation Triangulation" },
    { value: "risk", label: "AI Risk Red Team" },
    { value: "capital-return", label: "Dividend & Buyback" },
  ],
  periods: getTriPeriods(),
  data: triDataset,
  getDefaultPeriod: () => getDefaultTriPeriod(),
  calculateSummary: (data) => calculateTriSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateTriValuation(data, resolveTriPeriodFromData(data, getDefaultTriPeriod()), scenario, assumptions as Partial<TriValuationAssumptions>),
  valuationConfig: triValuationConfig,
  Dashboard: TriDashboard,
};

export function attachTriModuleRuntime(dataSourceType: Parameters<typeof attachTriRuntimeContext>[1]["dataSourceType"], periodId = getDefaultTriPeriod()) {
  return attachTriRuntimeContext(triDataset, { dataSourceType, periodId });
}
