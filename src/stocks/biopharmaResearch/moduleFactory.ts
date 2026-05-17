import type { StockModule, StockValuationConfig } from "../types";
import { BiopharmaResearchDashboard } from "./dashboard";
import { calculateBiopharmaSummary, calculateBiopharmaValuation } from "./engine";
import type { BiopharmaResearchDataset } from "./types";

export function createBiopharmaResearchModule(dataset: BiopharmaResearchDataset): StockModule {
  const valuationConfig: StockValuationConfig = {
    ticker: dataset.ticker,
    modelType: `${dataset.modelArchetype.replace(/_/g, " ")} / pipeline rNPV / scenario NAV`,
    priceMetadata: {
      ticker: dataset.ticker,
      currentPrice: dataset.currentPrice,
      currency: "USD",
      unit: "share",
      asOfDate: dataset.priceDate,
      source: "actual",
      marketReference: dataset.currentPrice,
      provenance: "Market-data snapshot captured in the module evidence map.",
    },
    assumptions: [],
    scenarios: [
      { name: "Bear", assumptions: {} },
      { name: "Base", assumptions: {} },
      { name: "Bull", assumptions: {} },
    ],
    calculateValuation: (_assumptions, data, scenario = "Base") =>
      calculateBiopharmaValuation(data as BiopharmaResearchDataset, scenario),
  };

  return {
    ticker: dataset.ticker,
    name: dataset.name,
    sector: dataset.sector,
    currency: dataset.currency,
    description: dataset.thesis,
    tabs: [
      { value: "cockpit", label: "Cockpit" },
      { value: "fundamentals", label: "Fundamentals" },
      { value: "pipeline", label: "Pipeline rNPV" },
      { value: "strategy", label: "Strategy & Guidance" },
      { value: "analysts", label: "Analyst Debate" },
      { value: "earnings", label: "Earnings Calls" },
      { value: "valuation", label: "Valuation" },
      { value: "risk", label: "Risk Red Team" },
      { value: "evidence", label: "Evidence" },
    ],
    periods: dataset.earnings.quarters.map((quarter) => ({ value: quarter.id, label: quarter.label })),
    data: dataset,
    getDefaultPeriod: () => dataset.earnings.currentPeriodId,
    calculateSummary: (data) => calculateBiopharmaSummary(data as BiopharmaResearchDataset),
    calculateValuation: (data, _assumptions, scenario = "Base") => calculateBiopharmaValuation(data as BiopharmaResearchDataset, scenario),
    valuationConfig,
    Dashboard: BiopharmaResearchDashboard,
  };
}
