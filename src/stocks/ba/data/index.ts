import type { BaDataset } from "../model";
import { baDefenseCycleScenarios, baGuidance } from "./guidanceData";
import { baMarketData } from "./marketData";
import { baOfficialSources, baSourceMap } from "./officialReports";
import { baPrograms } from "./programData";
import { baReportingEvents } from "./reportingEvents";
import { baRiskItems } from "./riskData";
import { baFinancialPeriods, baSegmentFinancials } from "./segmentData";

export const baDataset: BaDataset = {
  company: "BAE Systems plc",
  ticker: "BA.L",
  currency: "GBP",
  reportingCurrency: "GBP",
  latestReportingPeriod: "Year ended 31 December 2025",
  sources: baOfficialSources,
  periods: baFinancialPeriods,
  segments: baSegmentFinancials,
  guidance: baGuidance,
  marketData: baMarketData,
  programs: baPrograms,
  defenseCycleScenarios: baDefenseCycleScenarios,
  risks: baRiskItems,
  reportingEvents: baReportingEvents,
  sourceMap: baSourceMap,
};

export { baDefenseCycleScenarios, baGuidance } from "./guidanceData";
export { baMarketData } from "./marketData";
export { baOfficialSources, baSourceMap } from "./officialReports";
export { baPrograms } from "./programData";
export { baReportingEvents } from "./reportingEvents";
export { baRiskItems } from "./riskData";
export { baFinancialPeriods, baSegmentFinancials } from "./segmentData";
