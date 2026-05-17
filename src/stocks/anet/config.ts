import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { AnetDashboard } from "./dashboard";
import {
  calculateAnetSummary,
  calculateAnetValuation,
  getDefaultAnetPeriod,
  getAnetPeriods,
} from "./calculations";
import { anetDataset } from "./data";
import { buildAnetValuationConfig, defaultAnetValuationAssumptions } from "./assumptions";
import type { ValuationAssumptions } from "./model";

const anetPriceMetadata = createResearchPriceMetadata({
  ticker: "ANET",
  currentPrice: anetDataset.marketData.currentPrice,
  priceDate: anetDataset.marketData.priceDate,
  source: anetDataset.marketData.source,
});

export const anetValuationConfig = createStockValuationConfig({
  ...buildAnetValuationConfig((assumptions, data, scenario = "Base") =>
    calculateAnetValuation(
      data,
      { ...defaultAnetValuationAssumptions, ...(assumptions as Partial<ValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: anetPriceMetadata,
});

export const anetModule = createStockModule({
  ticker: "ANET",
  name: "Arista Networks Inc.",
  sector: "AI Networking / Ethernet Infrastructure",
  currency: "USD",
  description:
    "Arista buy-side research cockpit focused on cloud titan demand, AI Ethernet / 400G-800G switching, backlog, gross margin durability, inventory normalization, EOS / CloudVision software attach, FCF conversion, buybacks, and premium multiple durability.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "agent-ai", label: "AI Ethernet / Cloud Titans" },
    { value: "subscription-growth", label: "Backlog / High-Speed Ports" },
    { value: "margins-fcf", label: "Margins / FCF" },
    { value: "capital-return", label: "Capital Return / Dilution" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getAnetPeriods(),
  data: anetDataset,
  getDefaultPeriod: () => getDefaultAnetPeriod(),
  calculateSummary: (data) => calculateAnetSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateAnetValuation(data, assumptions as Partial<ValuationAssumptions>, scenario),
  valuationConfig: anetValuationConfig,
  Dashboard: AnetDashboard,
});
