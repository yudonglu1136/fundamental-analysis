import type { StockModule, StockValuationConfig } from "../types";
import { DefensePrimeDashboard } from "../defensePrime/dashboard";
import {
  attachDefenseRuntimeContext,
  buildDefenseValuationConfig,
  calculateDefenseSummary,
  calculateDefenseValuation,
  getDefaultDefensePeriod,
  getDefensePeriods,
} from "../defensePrime/calculations";
import type { DefenseDataset, DefenseValuationAssumptions } from "../defensePrime/model";
import { rtxData } from "./data";

export const rtxValuationConfig = buildDefenseValuationConfig(rtxData) as StockValuationConfig;

export const rtxModule: StockModule = {
  ticker: "RTX",
  name: "RTX Corporation",
  sector: "Aerospace & Defense",
  currency: "USD",
  description: "Defense-prime and commercial aerospace research cockpit focused on backlog, GTF execution, Raytheon missile defense, cash conversion, and valuation triangulation.",
  tabs: [
    { value: "executive", label: "Executive Snapshot" },
    { value: "segments", label: "Segment Intelligence" },
    { value: "backlog", label: "Backlog & Visibility" },
    { value: "reporting-events", label: "Reporting Event Trends" },
    { value: "programs", label: "Program Matrix" },
    { value: "valuation", label: "Valuation Triangulation" },
    { value: "risks", label: "Risk Red Team" },
    { value: "capital-returns", label: "Dividend & Buyback" },
  ],
  periods: getDefensePeriods(rtxData),
  data: rtxData,
  getDefaultPeriod: () => getDefaultDefensePeriod(rtxData),
  calculateSummary: (data) => calculateDefenseSummary(data as DefenseDataset),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateDefenseValuation(data as DefenseDataset, scenario, assumptions as Partial<DefenseValuationAssumptions>),
  valuationConfig: rtxValuationConfig,
  Dashboard: DefensePrimeDashboard,
};

export function attachRtxModuleRuntime(dataSourceType: Parameters<typeof attachDefenseRuntimeContext>[1]["dataSourceType"], periodId = getDefaultDefensePeriod(rtxData)) {
  return attachDefenseRuntimeContext(rtxData, { dataSourceType, periodId });
}
