import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { buildMuValuationConfig, defaultMuValuationAssumptions } from "./assumptions";
import { calculateMuSummary, calculateMuValuation, getDefaultMuPeriod, getMuPeriods } from "./calculations";
import { muDataset } from "./data";
import { MuDashboard } from "./dashboard";
import type { MuValuationAssumptions } from "./model";

const muPriceMetadata = createResearchPriceMetadata({
  ticker: "MU",
  currentPrice: muDataset.marketData.currentPrice,
  priceDate: muDataset.marketData.priceDate,
  source: muDataset.marketData.source,
  provenancePrefix: "market_data",
});

export const muValuationConfig = createStockValuationConfig({
  ...buildMuValuationConfig((assumptions, data, scenario = "Base") =>
    calculateMuValuation(
      data,
      { ...defaultMuValuationAssumptions, ...(assumptions as Partial<MuValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: muPriceMetadata,
});

export const muModule = createStockModule({
  ticker: "MU",
  name: "Micron Technology, Inc.",
  sector: "AI Infrastructure / Memory Semiconductors / HBM",
  currency: "USD",
  description:
    "MU research module focused on HBM durability, DRAM/NAND cycle normalization, China/export-control risk, capex intensity, FCF conversion and normalized valuation.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "earnings-call", label: "Earnings Calls" },
    { value: "memory-cycle", label: "Memory Cycle" },
    { value: "hbm-ai", label: "HBM / AI Demand" },
    { value: "margins-fcf", label: "Margins / FCF" },
    { value: "valuation", label: "Valuation" },
    { value: "risk-red-team", label: "Risk Red Team" },
  ],
  periods: getMuPeriods(),
  data: muDataset,
  getDefaultPeriod: () => getDefaultMuPeriod(),
  calculateSummary: (data) => calculateMuSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateMuValuation(data, assumptions as Partial<MuValuationAssumptions>, scenario),
  valuationConfig: muValuationConfig,
  Dashboard: MuDashboard,
});
