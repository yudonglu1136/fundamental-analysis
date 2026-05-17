import type { StockModule, StockValuationConfig } from "../types";
import { PltrDashboard } from "./dashboard";
import { calculatePltrSummary, calculatePltrValuation, getDefaultPltrPeriod, getPltrPeriods } from "./calculations";
import {
  defaultPltrValuationAssumptions,
  pltrAssumptionDefinitions,
  pltrScenarioDefinitions,
  pltrScenarioPresets,
  pltrValuationAssumptionKeys,
} from "./assumptions";
import { pltrData } from "./realData";

const pltrPriceMetadata = {
  ticker: "PLTR",
  currentPrice: pltrData.marketData.currentPrice,
  currency: "USD" as const,
  unit: "share" as const,
  asOfDate: pltrData.marketData.priceDate,
  source: "placeholder" as const,
  marketReference: pltrData.marketData.currentPrice,
  provenance: pltrData.marketData.notes,
};

const pltrValuationConfig: StockValuationConfig = {
  ticker: "PLTR",
  modelType: "AIP / Ontology / Rule-of-40 / SBC-Aware Reverse DCF",
  priceMetadata: pltrPriceMetadata,
  assumptions: pltrAssumptionDefinitions.filter((item) =>
    pltrValuationAssumptionKeys.includes(item.key as (typeof pltrValuationAssumptionKeys)[number]),
  ),
  scenarios: (["Bear", "Base", "Bull"] as const).map((scenario) => ({
    name: scenario,
    assumptions: {
      ...defaultPltrValuationAssumptions,
      ...pltrScenarioPresets[scenario],
    },
  })),
  calculateValuation: (assumptions, data, scenario = "Base") =>
    calculatePltrValuation(data, {
      ...defaultPltrValuationAssumptions,
      ...(assumptions as Partial<typeof defaultPltrValuationAssumptions>),
    }, scenario),
};

export const pltrModule: StockModule = {
  ticker: "PLTR",
  name: "Palantir Technologies",
  sector: "AI Software / Ontology / Mission-Critical Operations",
  currency: "USD",
  description:
    "PLTR-specific fundamental dashboard tracking AIP adoption, ontology moat, government durability, commercial expansion, operating leverage, SBC dilution, reverse DCF, transcripts, and buy-side risk framing.",
  tabs: [
    { value: "overview", label: "Overview" },
    { value: "q1-2026-deep-dive", label: "Q1 2026 Deep Dive" },
    { value: "business-segments", label: "Business Segments" },
    { value: "aip-engine", label: "AIP Engine" },
    { value: "ontology-moat", label: "Ontology Moat" },
    { value: "customer-cohorts", label: "Customer Cohorts" },
    { value: "rule-of-40", label: "Rule of 40" },
    { value: "sbc-dilution", label: "SBC / Dilution" },
    { value: "valuation", label: "Valuation" },
    { value: "scenario-lab", label: "Scenario Lab" },
    { value: "transcript-lab", label: "Transcript Lab" },
    { value: "risk-red-team", label: "Risk Red Team" },
    { value: "pm-memo", label: "PM Memo" },
  ],
  periods: getPltrPeriods(),
  data: pltrData,
  getDefaultPeriod: () => getDefaultPltrPeriod(),
  calculateSummary: (data) => calculatePltrSummary(data),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculatePltrValuation(data, assumptions as Partial<typeof defaultPltrValuationAssumptions>, scenario),
  valuationConfig: pltrValuationConfig,
  Dashboard: PltrDashboard,
};

export { pltrScenarioDefinitions };
