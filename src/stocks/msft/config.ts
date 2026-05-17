import { createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { MsftDashboard } from "./dashboard";
import {
  attachMsftRuntimeContext,
  calculateMsftSummary,
  calculateMsftValuation,
  defaultMsftValuationAssumptions,
  getDefaultMsftPeriod,
  getMsftPeriods,
  msftDataset,
  msftScenarioPresets,
  resolveMsftPeriodFromData,
} from "./calculations";
import { msftScenarioConfig, msftValuationAssumptionDefinitions } from "./assumptions";
import type { MsftValuationAssumptions } from "./model";

const msftPriceMetadata = {
  ticker: "MSFT",
  currentPrice: msftDataset.marketData.currentPrice,
  currency: "USD" as const,
  unit: "share" as const,
  asOfDate: msftDataset.marketData.priceDate,
  source: "actual" as const,
  marketReference: msftDataset.marketData.currentPrice,
  provenance: `market_data: ${msftDataset.marketData.source}`,
};

export const msftValuationConfig = createStockValuationConfig({
  ticker: "MSFT",
  modelType: "Microsoft AI platform DCF / FCF yield / P-E / EV-EBIT / SOTP / OpenAI optionality",
  priceMetadata: msftPriceMetadata,
  assumptions: msftValuationAssumptionDefinitions,
  scenarios: msftScenarioConfig,
  calculateValuation: (assumptions, data, scenario = "Base") =>
    calculateMsftValuation(
      data,
      { ...defaultMsftValuationAssumptions, ...(assumptions as Partial<MsftValuationAssumptions>) },
      scenario,
    ),
});

export const msftModule = createStockModule({
  ticker: "MSFT",
  name: "Microsoft Corporation",
  sector: "AI Platform / Cloud Infrastructure / Enterprise Software",
  currency: "USD",
  description:
    "Microsoft AI platform buy-side research cockpit focused on Azure AI capacity, OpenAI exposure, Copilot monetization, margin bridge, capex/FCF payback, business mix, risks, and valuation triangulation.",
  tabs: [
    { value: "executive", label: "Executive Snapshot" },
    { value: "earnings-call", label: "Earnings Call" },
    { value: "segments", label: "Segment Intelligence" },
    { value: "azure-ai", label: "Azure & AI Factory" },
    { value: "openai", label: "OpenAI Exposure Lab" },
    { value: "copilot", label: "Copilot Monetization" },
    { value: "margin", label: "Margin Bridge" },
    { value: "capex-fcf", label: "Capex & FCF" },
    { value: "business-mix", label: "Business Mix Matrix" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
    { value: "capital-return", label: "Capital Return" },
  ],
  periods: getMsftPeriods(),
  data: msftDataset,
  getDefaultPeriod: () => getDefaultMsftPeriod(),
  calculateSummary: (data) => calculateMsftSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateMsftValuation(data, assumptions as Partial<MsftValuationAssumptions>, scenario),
  valuationConfig: msftValuationConfig,
  Dashboard: MsftDashboard,
});

export function attachMsftModuleRuntime(
  dataSourceType: Parameters<typeof attachMsftRuntimeContext>[1]["dataSourceType"],
  periodId = getDefaultMsftPeriod(),
) {
  return attachMsftRuntimeContext(msftDataset, { dataSourceType, periodId: resolveMsftPeriodFromData(msftDataset, periodId) });
}

export { msftScenarioPresets };
