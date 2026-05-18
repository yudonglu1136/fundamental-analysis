import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { CegDashboard } from "./dashboard";
import { buildCegValuationConfig, defaultCegValuationAssumptions } from "./assumptions";
import { calculateCegSummary, calculateCegValuation, getCegPeriods, getDefaultCegPeriod } from "./calculations";
import { cegDataset } from "./data";
import type { CegValuationAssumptions } from "./model";

const cegPriceMetadata = createResearchPriceMetadata({
  ticker: "CEG",
  currentPrice: cegDataset.marketData.currentPrice,
  priceDate: cegDataset.marketData.priceDate,
  source: cegDataset.marketData.source,
  provenancePrefix: "market_data",
});

export const cegValuationConfig = createStockValuationConfig({
  ...buildCegValuationConfig((assumptions, data, scenario = "Base") =>
    calculateCegValuation(
      data,
      { ...defaultCegValuationAssumptions, ...(assumptions as Partial<CegValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: cegPriceMetadata,
});

export const cegModule = createStockModule({
  ticker: "CEG",
  name: "Constellation Energy Corporation",
  sector: "Power / Nuclear / AI Data-Center Infrastructure",
  currency: "USD",
  description:
    "CEG research module focused on nuclear fleet scarcity, AI data-center power demand, power-price/hedge exposure, PTC support, regulation, normalized FCF and capital allocation.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "nuclear-fleet", label: "Nuclear Fleet" },
    { value: "ai-power", label: "AI Power Demand" },
    { value: "financials", label: "Financials / FCF" },
    { value: "valuation", label: "Valuation" },
    { value: "risk-red-team", label: "Risk Red Team" },
  ],
  periods: getCegPeriods(),
  data: cegDataset,
  getDefaultPeriod: () => getDefaultCegPeriod(),
  calculateSummary: (data) => calculateCegSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateCegValuation(data, assumptions as Partial<CegValuationAssumptions>, scenario),
  valuationConfig: cegValuationConfig,
  Dashboard: CegDashboard,
});
