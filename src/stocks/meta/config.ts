import type { StockModule, StockValuationConfig } from "../types";
import { MetaDashboard } from "./dashboard";
import {
  calculateMetaSummary,
  calculateMetaValuation,
  defaultMetaValuationAssumptions,
  getDefaultMetaPeriod,
  getMetaPeriods,
  metaScenarioPresets,
  resolveMetaDataset,
  resolveMetaPeriodFromData,
} from "./calculations";
import { metaAssumptionDefinitions, metaValuationAssumptionKeys } from "./assumptions";
import { metaDataset } from "./data";
import type { MetaValuationAssumptions } from "./model";

const metaPriceMetadata = {
  ticker: "META",
  currentPrice: metaDataset.marketData.currentPrice,
  currency: "USD" as const,
  unit: "share" as const,
  asOfDate: metaDataset.marketData.priceDate,
  source: "actual" as const,
  marketReference: metaDataset.marketData.currentPrice,
  provenance: `market_data: ${metaDataset.marketData.source}`,
};

export const metaValuationConfig: StockValuationConfig = {
  ticker: "META",
  modelType: "Ad economics / AI capex ROIC / FCFF / FCF yield / P-E / EV-EBIT / SOTP",
  priceMetadata: metaPriceMetadata,
  assumptions: metaAssumptionDefinitions,
  scenarios: (["Bear", "Base", "Bull"] as const).map((scenario) => ({
    name: scenario,
    assumptions: Object.fromEntries(metaValuationAssumptionKeys.map((key) => [key, metaScenarioPresets[scenario][key]])),
  })),
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveMetaDataset(data);
    return calculateMetaValuation(
      dataset,
      resolveMetaPeriodFromData(dataset, getDefaultMetaPeriod()),
      scenario,
      { ...defaultMetaValuationAssumptions, ...(assumptions as Partial<MetaValuationAssumptions>) },
    );
  },
};

export const metaModule: StockModule = {
  ticker: "META",
  name: "Meta Platforms, Inc.",
  sector: "Internet Advertising / AI Infrastructure / Social Platforms",
  currency: "USD",
  description: "Buy-side research cockpit for META ad economics, AI monetization, capex-to-ROIC, product engagement, regulatory risk, and Reality Labs option value.",
  tabs: [
    { value: "executive", label: "Executive" },
    { value: "ad-economics", label: "Ad Economics" },
    { value: "ai-infra", label: "AI Infra ROIC" },
    { value: "product-cycle", label: "Product Cycle" },
    { value: "earnings-calls", label: "Earnings Calls" },
    { value: "market-implied", label: "Market Implied" },
    { value: "reality-labs", label: "Reality Labs" },
    { value: "valuation", label: "Valuation" },
    { value: "risk-red-team", label: "Risk Red Team" },
    { value: "validation", label: "Validation" },
  ],
  periods: getMetaPeriods(),
  data: metaDataset,
  getDefaultPeriod: () => getDefaultMetaPeriod(),
  calculateSummary: (data) => calculateMetaSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateMetaValuation(
      resolveMetaDataset(data),
      resolveMetaPeriodFromData(data, getDefaultMetaPeriod()),
      scenario,
      assumptions as Partial<MetaValuationAssumptions>,
    ),
  valuationConfig: metaValuationConfig,
  Dashboard: MetaDashboard,
};
