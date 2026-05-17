import type { StockModule, StockValuationConfig } from "../types";
import { TsmDashboard } from "./dashboard";
import {
  defaultTsmValuationAssumptions,
  tsmScenarioConfig,
  tsmValuationAssumptionDefinitions,
  type TsmValuationAssumptions,
} from "./assumptions";
import {
  calculateTsmSummary,
  calculateTsmValuation,
  getDefaultTsmPeriod,
  getTsmPeriods,
} from "./calculations";
import { tsmDataset } from "./data";

export const tsmValuationConfig: StockValuationConfig = {
  ticker: "TSM",
  modelType: "TSMC foundry / advanced node / AI-HPC / advanced packaging valuation",
  priceMetadata: {
    ticker: "TSM",
    currentPrice: tsmDataset.marketData.currentPrice,
    currency: "USD",
    unit: "share",
    asOfDate: tsmDataset.marketData.priceDate,
    source: "placeholder",
    marketReference: tsmDataset.marketData.currentPrice,
    provenance: tsmDataset.marketData.source,
  },
  assumptions: tsmValuationAssumptionDefinitions,
  scenarios: tsmScenarioConfig,
  calculateValuation: (assumptions, data, scenario = "Base") =>
    calculateTsmValuation(
      data,
      { ...defaultTsmValuationAssumptions, ...(assumptions as Partial<TsmValuationAssumptions>) },
      scenario,
    ),
};

export const tsmModule: StockModule = {
  ticker: "TSM",
  name: "Taiwan Semiconductor Manufacturing Company",
  sector: "Semiconductor Foundry / Advanced Nodes / AI Infrastructure Supply Chain",
  currency: "USD",
  description:
    "TSM buy-side research cockpit focused on pure-play foundry economics, AI/HPC demand, 3nm/5nm/N2 node leadership, CoWoS and advanced packaging constraints, capex intensity, global fab cost drag, customer concentration and Taiwan/geopolitical risk.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "node-packaging", label: "Nodes & Packaging" },
    { value: "end-markets", label: "End Markets" },
    { value: "margins-capex", label: "Margins & Capex" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getTsmPeriods(),
  data: tsmDataset,
  getDefaultPeriod: () => getDefaultTsmPeriod(),
  calculateSummary: (data) => calculateTsmSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateTsmValuation(data, assumptions as Partial<TsmValuationAssumptions>, scenario),
  valuationConfig: tsmValuationConfig,
  Dashboard: TsmDashboard,
};
