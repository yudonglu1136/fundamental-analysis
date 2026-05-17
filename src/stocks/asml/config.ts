import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { AsmlDashboard } from "./dashboard";
import { buildAsmlValuationConfig, defaultAsmlValuationAssumptions } from "./assumptions";
import { calculateAsmlSummary, calculateAsmlValuation, getAsmlPeriods, getDefaultAsmlPeriod } from "./calculations";
import { asmlDataset } from "./data";
import type { AsmlValuationAssumptions } from "./model";

const asmlPriceMetadata = createResearchPriceMetadata({
  ticker: "ASML",
  currentPrice: asmlDataset.marketData.currentPrice,
  priceDate: asmlDataset.marketData.priceDate,
  source: asmlDataset.marketData.source,
});

export const asmlValuationConfig = createStockValuationConfig({
  ...buildAsmlValuationConfig((assumptions, data, scenario = "Base") =>
    calculateAsmlValuation(
      data,
      { ...defaultAsmlValuationAssumptions, ...(assumptions as Partial<AsmlValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: asmlPriceMetadata,
});

export const asmlModule = createStockModule({
  ticker: "ASML",
  name: "ASML Holding N.V.",
  sector: "AI Infrastructure / Semiconductor Equipment / Lithography",
  currency: "USD",
  description:
    "ASML research cockpit focused on EUV and High-NA demand durability, AI semiconductor capex, China export restrictions, backlog support, gross margin, FCF conversion, and premium multiple resilience.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "orders-backlog", label: "Orders / Backlog" },
    { value: "euv-high-na", label: "EUV / High-NA" },
    { value: "ai-capex", label: "AI Capex Cycle" },
    { value: "revenue-mix", label: "Systems / Service Mix" },
    { value: "margins-fcf", label: "Margins / FCF" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getAsmlPeriods(),
  data: asmlDataset,
  getDefaultPeriod: () => getDefaultAsmlPeriod(),
  calculateSummary: (data) => calculateAsmlSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateAsmlValuation(data, assumptions as Partial<AsmlValuationAssumptions>, scenario),
  valuationConfig: asmlValuationConfig,
  Dashboard: AsmlDashboard,
});
