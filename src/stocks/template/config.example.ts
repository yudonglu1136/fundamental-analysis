import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { ExampleDashboard } from "./dashboard.example";
import { exampleData } from "./data.example";
import { calculateExampleSummary, calculateExampleValuation } from "./calculations.example";

const examplePriceMetadata = createResearchPriceMetadata({
  ticker: "TICKER",
  currentPrice: exampleData.marketData.currentPrice,
  priceDate: exampleData.marketData.priceDate,
  source: exampleData.marketData.source,
  currency: "USD",
  provenancePrefix: "template_placeholder",
});

const exampleValuationConfig = createStockValuationConfig({
  ticker: "TICKER",
  modelType: "Template historical-valuation-ready module",
  priceMetadata: examplePriceMetadata,
  assumptions: [
    {
      key: "currentPrice",
      label: "Current Price",
      value: exampleData.marketData.currentPrice,
      min: 0,
      max: 500,
      step: 1,
      format: "currency",
      source: "placeholder",
      description: "Replace with a sourced market price. Do not anchor fair value to this input.",
      category: "Market",
      unit: "USD",
      periodicity: "LTM",
      asOfDate: exampleData.marketData.priceDate,
      provenance: exampleData.marketData.source,
    },
    {
      key: "normalizedFcf",
      label: "Normalized FCF",
      value: 100,
      min: 0,
      max: 1000,
      step: 10,
      format: "currency",
      source: "assumption",
      description: "Replace with a ticker-specific normalized FCF assumption.",
      category: "Cash Flow",
      unit: "USD",
      periodicity: "forward annual",
    },
    {
      key: "targetFcfYield",
      label: "Target FCF Yield",
      value: 0.05,
      min: 0.02,
      max: 0.12,
      step: 0.0025,
      format: "percent",
      source: "assumption",
      description: "Replace with a justified valuation yield or triangulate against other methods.",
      category: "Valuation",
      unit: "percent",
      periodicity: "forward annual",
    },
    {
      key: "dilutedShares",
      label: "Diluted Shares",
      value: 100,
      min: 1,
      max: 1000,
      step: 1,
      format: "number",
      source: "placeholder",
      description: "Replace with sourced diluted share count.",
      category: "Share Count",
      unit: "share",
      periodicity: "LTM",
    },
  ],
  scenarios: [
    { name: "Bear", assumptions: { normalizedFcf: 80, targetFcfYield: 0.065 } },
    { name: "Base", assumptions: { normalizedFcf: 100, targetFcfYield: 0.05 } },
    { name: "Bull", assumptions: { normalizedFcf: 120, targetFcfYield: 0.04 } },
  ],
  calculateValuation: (assumptions, data, scenario) => calculateExampleValuation(data as typeof exampleData, assumptions, scenario),
});

export const exampleModule = createStockModule({
  ticker: "TICKER",
  name: "Example Company",
  sector: "Replace with company-specific sector / archetype",
  currency: "USD",
  description: "Template for a deep research module with historical valuation coverage and backend workflow awareness.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "research", label: "Research Framework" },
    { value: "valuation", label: "Valuation" },
    { value: "risk-red-team", label: "Risk Red Team" },
  ],
  periods: exampleData.periods,
  data: exampleData,
  getDefaultPeriod: () => exampleData.periods[0]?.value ?? "",
  calculateSummary: (data) => calculateExampleSummary(data as typeof exampleData),
  calculateValuation: (data, assumptions, scenario) =>
    calculateExampleValuation(data as typeof exampleData, assumptions as Record<string, number> | undefined, scenario),
  valuationConfig: exampleValuationConfig,
  Dashboard: ExampleDashboard,
});
