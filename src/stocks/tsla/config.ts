import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { buildTslaValuationConfig, defaultTslaValuationAssumptions } from "./assumptions";
import { calculateTslaSummary, calculateTslaValuation, getDefaultTslaPeriod, getTslaPeriods } from "./calculations";
import { tslaDataset } from "./data";
import { TslaDashboard } from "./dashboard";
import type { TslaValuationAssumptions } from "./model";

const tslaPriceMetadata = createResearchPriceMetadata({
  ticker: "TSLA",
  currentPrice: tslaDataset.marketData.currentPrice,
  priceDate: tslaDataset.marketData.priceDate,
  source: tslaDataset.marketData.source,
  provenancePrefix: "market_data",
});

export const tslaValuationConfig = createStockValuationConfig({
  ...buildTslaValuationConfig((assumptions, data, scenario = "Base") =>
    calculateTslaValuation(
      data,
      { ...defaultTslaValuationAssumptions, ...(assumptions as Partial<TslaValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: tslaPriceMetadata,
});

export const tslaModule = createStockModule({
  ticker: "TSLA",
  name: "Tesla, Inc.",
  sector: "EV / Energy Storage / Autonomy",
  currency: "USD",
  description:
    "TSLA research module focused on auto margin durability, energy storage scale, autonomy optionality, China competition, capex intensity and FCF support for the premium multiple.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "earnings-call", label: "Earnings Calls" },
    { value: "auto-ev-demand", label: "Auto / EV Demand" },
    { value: "energy-storage", label: "Energy Storage" },
    { value: "autonomy-software", label: "Autonomy / Software" },
    { value: "margins-fcf", label: "Margins / FCF" },
    { value: "valuation", label: "Valuation" },
    { value: "risk-red-team", label: "Risk Red Team" },
  ],
  periods: getTslaPeriods(),
  data: tslaDataset,
  getDefaultPeriod: () => getDefaultTslaPeriod(),
  calculateSummary: (data) => calculateTslaSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateTslaValuation(data, assumptions as Partial<TslaValuationAssumptions>, scenario),
  valuationConfig: tslaValuationConfig,
  Dashboard: TslaDashboard,
});
