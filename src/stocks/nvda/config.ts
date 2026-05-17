import type { StockModule, StockValuationConfig } from "../types";
import { NvdaDashboard } from "./dashboard";
import {
  defaultNvdaValuationAssumptions,
  nvdaScenarioConfig,
  nvdaValuationAssumptionDefinitions,
  type NvdaValuationAssumptions,
} from "./assumptions";
import {
  attachNvdaRuntimeContext,
  calculateNvdaSummary,
  calculateNvdaValuation,
  getDefaultNvdaPeriod,
  getNvdaPeriods,
  resolveNvdaDataset,
  resolveNvdaPeriodFromData,
} from "./calculations";
import { nvdaDataset } from "./data";

export const nvdaValuationConfig: StockValuationConfig = {
  ticker: "NVDA",
  modelType: "NVIDIA AI infrastructure / Data Center / networking / GPU product-cycle valuation",
  priceMetadata: {
    ticker: "NVDA",
    currentPrice: nvdaDataset.marketData.currentPrice,
    currency: "USD",
    unit: "share",
    asOfDate: nvdaDataset.marketData.priceDate,
    source: "placeholder",
    marketReference: nvdaDataset.marketData.currentPrice,
    provenance: nvdaDataset.marketData.source,
  },
  assumptions: nvdaValuationAssumptionDefinitions,
  scenarios: nvdaScenarioConfig,
  calculateValuation: (assumptions, data, scenario = "Base") =>
    calculateNvdaValuation(
      data,
      { ...defaultNvdaValuationAssumptions, ...(assumptions as Partial<NvdaValuationAssumptions>) },
      scenario,
    ),
};

export const nvdaModule: StockModule = {
  ticker: "NVDA",
  name: "NVIDIA Corporation",
  sector: "AI Infrastructure Semiconductors / Accelerated Computing / Networking",
  currency: "USD",
  description:
    "NVDA buy-side cockpit focused on Data Center AI demand durability, GPU product cycles, networking attach, gross-margin/ASP cycle, China export controls, hyperscaler concentration, supply-chain constraints, and risk red-team monitoring.",
  tabs: [
    { value: "cockpit", label: "Cockpit" },
    { value: "segments", label: "Segments" },
    { value: "ai-cycle", label: "AI Cycle" },
    { value: "margins", label: "Margins & FCF" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getNvdaPeriods(),
  data: nvdaDataset,
  getDefaultPeriod: () => getDefaultNvdaPeriod(),
  calculateSummary: (data) => calculateNvdaSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateNvdaValuation(data, assumptions as Partial<NvdaValuationAssumptions>, scenario),
  valuationConfig: nvdaValuationConfig,
  Dashboard: NvdaDashboard,
};

export function attachNvdaModuleRuntime(periodId = getDefaultNvdaPeriod()) {
  return attachNvdaRuntimeContext(nvdaDataset, { dataSourceType: "mock", periodId: resolveNvdaPeriodFromData(nvdaDataset, periodId) });
}

export { resolveNvdaDataset };
