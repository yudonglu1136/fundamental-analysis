import { createResearchPriceMetadata, createStockModule, createStockValuationConfig } from "../moduleAssembly";
import { NowDashboard } from "./dashboard";
import {
  calculateNowSummary,
  calculateNowValuation,
  getDefaultNowPeriod,
  getNowPeriods,
} from "./calculations";
import { nowDataset } from "./data";
import { buildNowValuationConfig, defaultNowValuationAssumptions } from "./assumptions";
import type { ValuationAssumptions } from "./model";

const nowPriceMetadata = createResearchPriceMetadata({
  ticker: "NOW",
  currentPrice: nowDataset.marketData.currentPrice,
  priceDate: nowDataset.marketData.priceDate,
  source: nowDataset.marketData.source,
});

export const nowValuationConfig = createStockValuationConfig({
  ...buildNowValuationConfig((assumptions, data, scenario = "Base") =>
    calculateNowValuation(
      data,
      { ...defaultNowValuationAssumptions, ...(assumptions as Partial<ValuationAssumptions>) },
      scenario,
    ),
  ),
  priceMetadata: nowPriceMetadata,
});

export const nowModule = createStockModule({
  ticker: "NOW",
  name: "ServiceNow Inc.",
  sector: "Enterprise Software / Workflow Automation",
  currency: "USD",
  description:
    "ServiceNow buy-side research cockpit focused on subscription growth, cRPO/RPO, Agentic AI adoption, Pro Plus attach, renewal durability, operating leverage, FCF conversion, SBC dilution, buybacks, and premium multiple durability.",
  tabs: [
    { value: "dashboard", label: "Dashboard" },
    { value: "agent-ai", label: "Agent / AI Progress" },
    { value: "subscription-growth", label: "Subscription Growth / RPO" },
    { value: "margins-fcf", label: "Margins / FCF" },
    { value: "capital-return", label: "Capital Return / Dilution" },
    { value: "valuation", label: "Valuation" },
    { value: "risks", label: "Risk Red Team" },
  ],
  periods: getNowPeriods(),
  data: nowDataset,
  getDefaultPeriod: () => getDefaultNowPeriod(),
  calculateSummary: (data) => calculateNowSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateNowValuation(data, assumptions as Partial<ValuationAssumptions>, scenario),
  valuationConfig: nowValuationConfig,
  Dashboard: NowDashboard,
});
