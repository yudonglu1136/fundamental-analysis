import type { PriceMetadata, StockModule, StockValuationConfig, ValuationResult, Scenario } from "./types";

type ResearchPriceMetadataInput = {
  ticker: string;
  currentPrice: number;
  priceDate: string;
  source: string;
  currency?: PriceMetadata["currency"];
  provenancePrefix?: string;
};

type StockValuationConfigInput = Omit<StockValuationConfig, "priceMetadata"> & {
  priceMetadata: PriceMetadata;
};

export type StockValuationRunner = (
  assumptions: Record<string, number>,
  data: unknown,
  scenario?: Scenario,
) => ValuationResult;

export function createResearchPriceMetadata({
  ticker,
  currentPrice,
  priceDate,
  source,
  currency = "USD",
  provenancePrefix = "research_only",
}: ResearchPriceMetadataInput): PriceMetadata {
  return {
    ticker,
    currentPrice,
    currency,
    unit: "share",
    asOfDate: priceDate,
    source: "placeholder",
    marketReference: currentPrice,
    provenance: `${provenancePrefix}: ${source}`,
  };
}

export function createStockValuationConfig(config: StockValuationConfigInput): StockValuationConfig {
  return config;
}

export function createStockModule(config: StockModule): StockModule {
  return config;
}
