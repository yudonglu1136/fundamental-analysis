import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { MaDashboard } from "./dashboard";
import {
  calculateMaSummary,
  calculateMaValuation,
  getDefaultMaPeriod,
  getMaPeriods,
} from "./calculations";
import { maDataset } from "./data";
import { buildMaValuationConfig, defaultMaValuationAssumptions } from "./assumptions";
import type { MaValuationAssumptions } from "./model";

const maPriceMetadata = createResearchPriceMetadata({
  ticker: "MA",
  currentPrice: maDataset.marketData.currentPrice,
  priceDate: maDataset.marketData.priceDate,
  source: maDataset.marketData.source,
});

export const maValuationConfig = createStockValuationConfig({
  ...buildMaValuationConfig((assumptions, data, scenario = "Base") =>
    calculateMaValuation(
      data,
      { ...defaultMaValuationAssumptions, ...(assumptions as Partial<MaValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: maPriceMetadata,
});

export const maModule = createStockModule({
  ticker: "MA",
  name: "Mastercard Inc.",
  sector: "Payments Network / Financial Technology",
  currency: "USD",
  description:
    "Mastercard buy-side research cockpit focused on cross-border volume, switched transactions, gross dollar volume, value-added services, take-rate stability, regulation, alternative rails, FCF conversion, buybacks, and premium multiple durability.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "volume-network", label: "Volume / Network Metrics" },
    { value: "revenue-mix", label: "Revenue Mix / Value-Added Services" },
    { value: "margins-fcf", label: "Margins / FCF" },
    { value: "capital-return", label: "Dividend & Buyback" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getMaPeriods(),
  data: maDataset,
  getDefaultPeriod: () => getDefaultMaPeriod(),
  calculateSummary: (data) => calculateMaSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateMaValuation(data, assumptions as Partial<MaValuationAssumptions>, scenario),
  valuationConfig: maValuationConfig,
  Dashboard: MaDashboard,
});
