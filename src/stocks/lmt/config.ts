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
import { lmtData } from "./data";

export const lmtValuationConfig = buildDefenseValuationConfig(lmtData) as StockValuationConfig;

export const lmtModule: StockModule = {
  ticker: "LMT",
  name: "Lockheed Martin Corporation",
  sector: "Aerospace & Defense",
  currency: "USD",
  description: "Defense-prime research cockpit focused on F-35 cadence, missile-defense demand, backlog conversion, program-charge risk, cash conversion, and valuation triangulation.",
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
  periods: getDefensePeriods(lmtData),
  data: lmtData,
  getDefaultPeriod: () => getDefaultDefensePeriod(lmtData),
  calculateSummary: (data) => calculateDefenseSummary(data as DefenseDataset),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateDefenseValuation(data as DefenseDataset, scenario, assumptions as Partial<DefenseValuationAssumptions>),
  valuationConfig: lmtValuationConfig,
  Dashboard: DefensePrimeDashboard,
};

export function attachLmtModuleRuntime(dataSourceType: Parameters<typeof attachDefenseRuntimeContext>[1]["dataSourceType"], periodId = getDefaultDefensePeriod(lmtData)) {
  return attachDefenseRuntimeContext(lmtData, { dataSourceType, periodId });
}
