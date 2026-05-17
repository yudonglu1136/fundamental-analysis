import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { VDashboard } from "./dashboard";
import {
  calculateVSummary,
  calculateVValuation,
  getDefaultVPeriod,
  getVPeriods,
} from "./calculations";
import { vDataset } from "./data";
import { buildVValuationConfig, defaultVValuationAssumptions } from "./assumptions";
import type { ValuationAssumptions } from "./model";

const vPriceMetadata = createResearchPriceMetadata({
  ticker: "V",
  currentPrice: vDataset.marketData.currentPrice,
  priceDate: vDataset.marketData.priceDate,
  source: vDataset.marketData.source,
});

export const vValuationConfig = createStockValuationConfig({
  ...buildVValuationConfig((assumptions, data, scenario = "Base") =>
    calculateVValuation(
      data,
      { ...defaultVValuationAssumptions, ...(assumptions as Partial<ValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: vPriceMetadata,
});

export const vModule = createStockModule({
  ticker: "V",
  name: "Visa Inc.",
  sector: "Payments Network / Financial Technology",
  currency: "USD",
  description:
    "Visa buy-side research cockpit focused on cross-border volume, switched transactions, gross dollar volume, value-added services, take-rate stability, regulation, alternative rails, FCF conversion, buybacks, and premium multiple durability.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "volume-network", label: "Volume / Network Metrics" },
    { value: "revenue-mix", label: "Revenue Mix / Value-Added Services" },
    { value: "margins-fcf", label: "Margins / FCF" },
    { value: "capital-return", label: "Dividend & Buyback" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getVPeriods(),
  data: vDataset,
  getDefaultPeriod: () => getDefaultVPeriod(),
  calculateSummary: (data) => calculateVSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateVValuation(data, assumptions as Partial<ValuationAssumptions>, scenario),
  valuationConfig: vValuationConfig,
  Dashboard: VDashboard,
});
