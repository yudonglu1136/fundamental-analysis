import type { StockModule, StockValuationConfig } from "../types";
import { ExampleDashboard } from "./dashboard.example";
import { exampleData } from "./data.example";
import { calculateExampleSummary, calculateExampleValuation } from "./calculations.example";

const exampleValuationConfig: StockValuationConfig = {
  ticker: "TICKER",
  modelType: "Example",
  assumptions: [
    {
      key: "currentPrice",
      label: "Current Price",
      value: 100,
      min: 10,
      max: 200,
      step: 1,
      format: "currency",
      source: "actual",
      description: "Current share price for upside/downside calculations.",
      category: "Earnings",
    },
  ],
  scenarios: [
    { name: "Bear", assumptions: { currentPrice: 90 } },
    { name: "Base", assumptions: { currentPrice: 100 } },
    { name: "Bull", assumptions: { currentPrice: 110 } },
  ],
  calculateValuation: (assumptions, data) => calculateExampleValuation(data as typeof exampleData, assumptions, "Base"),
};

export const exampleModule: StockModule = {
  ticker: "TICKER",
  name: "Example Company",
  sector: "Sector",
  currency: "USD",
  description: "Describe the stock-specific analytical angle here.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "valuation", label: "Valuation" },
  ],
  periods: exampleData.periods,
  data: exampleData,
  getDefaultPeriod: () => exampleData.periods[0]?.value ?? "",
  calculateSummary: (data) => calculateExampleSummary(data as typeof exampleData),
  calculateValuation: (data, assumptions, scenario) => calculateExampleValuation(data as typeof exampleData, assumptions, scenario),
  valuationConfig: exampleValuationConfig,
  Dashboard: ExampleDashboard,
};
