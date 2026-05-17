import type { NocDataset } from "../model";
import { nocEarningsCalls } from "./earningsCallData";
import { nocBudgetScenarios, nocGuidance } from "./guidanceData";
import { nocMarketData } from "./marketData";
import { nocPrograms } from "./programData";
import { nocRiskItems } from "./riskData";
import { nocFinancialPeriods, nocSegmentFinancials } from "./financialData";
import { nocOfficialSources, nocSourceMap } from "./sourceMap";

export const nocDataset: NocDataset = {
  company: "Northrop Grumman Corporation",
  ticker: "NOC",
  currency: "USD",
  reportingCurrency: "USD",
  latestReportingPeriod: "Quarter ended March 31, 2026",
  sources: nocOfficialSources,
  periods: nocFinancialPeriods,
  segments: nocSegmentFinancials,
  guidance: nocGuidance,
  marketData: nocMarketData,
  programs: nocPrograms,
  budgetScenarios: nocBudgetScenarios,
  risks: nocRiskItems,
  earningsCalls: nocEarningsCalls,
  sourceMap: nocSourceMap,
};

export { nocEarningsCalls } from "./earningsCallData";
export { nocBudgetScenarios, nocGuidance } from "./guidanceData";
export { nocMarketData } from "./marketData";
export { nocPrograms } from "./programData";
export { nocRiskItems } from "./riskData";
export { nocFinancialPeriods, nocSegmentFinancials } from "./financialData";
export { nocOfficialSources, nocSourceMap } from "./sourceMap";
