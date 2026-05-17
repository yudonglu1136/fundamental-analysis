import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { AaplDashboard } from "./dashboard";
import {
  calculateAaplSummary,
  calculateAaplValuation,
  getAaplPeriods,
  getDefaultAaplPeriod,
} from "./calculations";
import { aaplDataset } from "./data";
import { buildAaplValuationConfig, defaultAaplValuationAssumptions } from "./assumptions";
import type { AaplValuationAssumptions } from "./model";

const aaplPriceMetadata = createResearchPriceMetadata({
  ticker: "AAPL",
  currentPrice: aaplDataset.marketData.currentPrice,
  priceDate: aaplDataset.marketData.priceDate,
  source: aaplDataset.marketData.source,
});

export const aaplValuationConfig = createStockValuationConfig({
  ...buildAaplValuationConfig((assumptions, data, scenario = "Base") =>
    calculateAaplValuation(
      data,
      { ...defaultAaplValuationAssumptions, ...(assumptions as Partial<AaplValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: aaplPriceMetadata,
});

export const aaplModule = createStockModule({
  ticker: "AAPL",
  name: "Apple Inc.",
  sector: "Consumer Technology / Ecosystem / Services",
  currency: "USD",
  description:
    "Apple buy-side research cockpit focused on iPhone replacement demand, Services mix and regulation, installed-base monetization, China risk, Apple Intelligence optionality, capital return, and valuation triangulation.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "products", label: "Product Mix" },
    { value: "services", label: "Services" },
    { value: "geography", label: "Geography" },
    { value: "capital-return", label: "Dividend & Buyback" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getAaplPeriods(),
  data: aaplDataset,
  getDefaultPeriod: () => getDefaultAaplPeriod(),
  calculateSummary: (data) => calculateAaplSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateAaplValuation(data, assumptions as Partial<AaplValuationAssumptions>, scenario),
  valuationConfig: aaplValuationConfig,
  Dashboard: AaplDashboard,
});
