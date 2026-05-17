import type { StockModule, StockValuationConfig } from "../types";
import { AmznDashboard } from "./dashboard";
import {
  amznScenarioConfig,
  amznValuationAssumptionDefinitions,
  defaultAmznValuationAssumptions,
  type AmznValuationAssumptions,
} from "./assumptions";
import {
  attachAmznRuntimeContext,
  calculateAmznSummary,
  calculateAmznValuation,
  getAmznPeriods,
  getDefaultAmznPeriod,
  resolveAmznDataset,
  resolveAmznPeriodFromData,
} from "./calculations";
import { amznDataset } from "./data";

export const amznValuationConfig: StockValuationConfig = {
  ticker: "AMZN",
  modelType: "Amazon AWS AI / retail margin / advertising / normalized FCF / SOTP valuation",
  priceMetadata: {
    ticker: "AMZN",
    currentPrice: amznDataset.marketData.currentPrice,
    currency: "USD",
    unit: "share",
    asOfDate: amznDataset.marketData.priceDate,
    source: "placeholder",
    marketReference: amznDataset.marketData.currentPrice,
    provenance: amznDataset.marketData.source,
  },
  assumptions: amznValuationAssumptionDefinitions,
  scenarios: amznScenarioConfig,
  calculateValuation: (assumptions, data, scenario = "Base") =>
    calculateAmznValuation(
      data,
      { ...defaultAmznValuationAssumptions, ...(assumptions as Partial<AmznValuationAssumptions>) },
      scenario,
    ),
};

export const amznModule: StockModule = {
  ticker: "AMZN",
  name: "Amazon.com, Inc.",
  sector: "Cloud Infrastructure / E-commerce / Advertising / Subscription Flywheel",
  currency: "USD",
  description:
    "AMZN buy-side cockpit focused on AWS AI economics, retail operating leverage, advertising profit-pool scaling, Prime/subscription flywheel, normalized FCF after capex, Kuiper optionality, and risk red-team monitoring.",
  tabs: [
    { value: "overview", label: "Cockpit" },
    { value: "segments", label: "Segments" },
    { value: "aws-ai", label: "AWS AI" },
    { value: "retail-ads", label: "Retail & Ads" },
    { value: "fcf-capex", label: "FCF & Capex" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getAmznPeriods(),
  data: amznDataset,
  getDefaultPeriod: () => getDefaultAmznPeriod(),
  calculateSummary: (data) => calculateAmznSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateAmznValuation(data, assumptions as Partial<AmznValuationAssumptions>, scenario),
  valuationConfig: amznValuationConfig,
  Dashboard: AmznDashboard,
};

export function attachAmznModuleRuntime(periodId = getDefaultAmznPeriod()) {
  return attachAmznRuntimeContext(amznDataset, { dataSourceType: "mock", periodId: resolveAmznPeriodFromData(amznDataset, periodId) });
}

export { resolveAmznDataset };
