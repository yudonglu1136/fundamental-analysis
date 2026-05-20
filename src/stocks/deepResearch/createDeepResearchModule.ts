import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import type { Scenario } from "../types";
import {
  buildDeepResearchValuationConfig,
  calculateDeepResearchSummary,
  calculateDeepResearchValuation,
  getDefaultDeepResearchPeriod,
  getDeepResearchPeriods,
} from "./calculations";
import { DeepResearchDashboard } from "./dashboard";
import type { DeepResearchDataset, DeepResearchValuationAssumptions } from "./model";

export function createDeepResearchStockModule(dataset: DeepResearchDataset) {
  const priceMetadata = createResearchPriceMetadata({
    ticker: dataset.ticker,
    currentPrice: dataset.marketData.currentPrice,
    priceDate: dataset.marketData.priceDate,
    source: dataset.marketData.source,
    provenancePrefix: dataset.marketData.sourceStatus,
  });

  const valuationConfig = createStockValuationConfig({
    ...buildDeepResearchValuationConfig(dataset, (assumptions, data, scenario: Scenario = "Base") =>
      calculateDeepResearchValuation(data, assumptions as Partial<DeepResearchValuationAssumptions>, scenario),
    ),
    priceMetadata,
  });

  return createStockModule({
    ticker: dataset.ticker,
    name: dataset.companyName,
    sector: dataset.sector,
    currency: dataset.currency,
    description: dataset.description,
    tabs: dataset.tabs,
    periods: getDeepResearchPeriods(dataset),
    data: dataset,
    getDefaultPeriod: () => getDefaultDeepResearchPeriod(dataset),
    calculateSummary: (data) => calculateDeepResearchSummary(data),
    calculateValuation: (data, assumptions, scenario = "Base") =>
      calculateDeepResearchValuation(data, assumptions as Partial<DeepResearchValuationAssumptions>, scenario),
    valuationConfig,
    Dashboard: DeepResearchDashboard,
  });
}
