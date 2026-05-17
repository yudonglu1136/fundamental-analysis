import type { StockModule, StockValuationConfig } from "../types";
import { DgeDashboard } from "./dashboard";
import {
  dgeAssumptionDefinitions,
  dgeScenarioDefinitions,
  dgeValuationAssumptionKeys,
  defaultDgeValuationAssumptions,
} from "./assumptions";
import {
  calculateDgeSummary,
  calculateDgeValuation,
  getDefaultDgePeriod,
  getDgePeriods,
  resolveDgeDataset,
  resolveDgePeriodFromData,
} from "./calculations";
import { dgeRealData } from "./realData";
import type { DgeValuationAssumptions } from "./types";

const dgeValuationConfig: StockValuationConfig = {
  ticker: "DGE.L",
  modelType: "Beverage Demand-Cycle / Channel Inventory / Brand Portfolio / FCF Yield / Multiples",
  priceMetadata: {
    ticker: "DGE.L",
    currentPrice: dgeRealData.marketData.londonPriceGbp,
    currency: "GBP",
    unit: "share",
    asOfDate: dgeRealData.marketData.priceDate,
    source: "actual",
    marketReference: dgeRealData.marketData.londonPriceGbp,
    provenance: "market_data: Stooq DGE.UK close normalized from GBX to GBP; DEO ADR equivalent uses four ordinary shares.",
  },
  assumptions: dgeAssumptionDefinitions.filter((item) =>
    dgeValuationAssumptionKeys.includes(item.key as (typeof dgeValuationAssumptionKeys)[number]),
  ),
  scenarios: dgeScenarioDefinitions.map((scenario) => ({
    name: scenario.name,
    assumptions: Object.fromEntries(dgeValuationAssumptionKeys.map((key) => [key, scenario.assumptions[key]])),
  })),
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveDgeDataset(data);
    const period = resolveDgePeriodFromData(data, getDefaultDgePeriod());
    return calculateDgeValuation(
      dataset,
      period,
      scenario,
      { ...defaultDgeValuationAssumptions, ...(assumptions as Partial<DgeValuationAssumptions>) },
    );
  },
};

export const dgeModule: StockModule = {
  ticker: "DGE.L",
  name: "Diageo plc",
  sector: "Global Beverages / Spirits / Beer / Premium & Mainstream Consumer Staples",
  currency: "GBP",
  description:
    "Buy-side beverage module focused on US Spirits demand, channel inventory, tequila/whisky/vodka/rum/Guinness category divergence, LAC turnaround quality, premiumisation durability, FCF, deleveraging and dividend rebasing.",
  tabs: [
    { value: "cockpit", label: "Cockpit" },
    { value: "us-demand", label: "US Demand Lab" },
    { value: "lac-inventory", label: "LAC Inventory Lab" },
    { value: "regional-quality", label: "Regional Quality" },
    { value: "brand-portfolio", label: "Brand Portfolio" },
    { value: "price-mix-volume", label: "Price/Mix/Volume" },
    { value: "margin-savings", label: "Margin & Savings" },
    { value: "cash-flow", label: "Cash Flow" },
    { value: "valuation", label: "Valuation" },
    { value: "risk-red-team", label: "Risk Red Team" },
    { value: "evidence", label: "Evidence" },
  ],
  periods: getDgePeriods(),
  data: dgeRealData,
  getDefaultPeriod: () => getDefaultDgePeriod(),
  calculateSummary: (data) => calculateDgeSummary(resolveDgeDataset(data), resolveDgePeriodFromData(data, getDefaultDgePeriod())),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateDgeValuation(
      resolveDgeDataset(data),
      resolveDgePeriodFromData(data, getDefaultDgePeriod()),
      scenario,
      assumptions as Partial<DgeValuationAssumptions>,
    ),
  valuationConfig: dgeValuationConfig,
  Dashboard: DgeDashboard,
};
