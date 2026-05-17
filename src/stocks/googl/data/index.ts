import type { GooglDataset } from "../model";
import {
  googlAiOperatingSignals,
  googlCloudBacklog,
  googlCommitmentsAndCapitalStructure,
  googlFinancials,
  googlGuidance,
  googlMarketData,
  googlMonetizationMetrics,
  googlRevenueLines,
  googlSegments,
} from "./financialData";
import { googlRisks } from "./riskData";
import { googlScenarioDrivers } from "./scenarioData";
import { googlSourceMap, googlSources } from "./sourceMap";

export const googlDataset: GooglDataset = {
  company: "Alphabet Inc.",
  ticker: "GOOGL",
  alternateTickers: ["GOOG"],
  currency: "USD",
  reportingCurrency: "USD",
  latestReportingPeriod: "Quarter ended March 31, 2026",
  sources: googlSources,
  financials: googlFinancials,
  revenueLines: googlRevenueLines,
  segments: googlSegments,
  monetizationMetrics: googlMonetizationMetrics,
  cloudBacklog: googlCloudBacklog,
  guidance: googlGuidance,
  aiOperatingSignals: googlAiOperatingSignals,
  commitmentsAndCapitalStructure: googlCommitmentsAndCapitalStructure,
  marketData: googlMarketData,
  risks: googlRisks,
  scenarioDrivers: googlScenarioDrivers,
  sourceMap: googlSourceMap,
  notes: [
    "Official actuals and management commentary are separated from forecast assumptions.",
    "TPU and AI commentary flow through capped scenario assumptions and validation warnings; they are not capitalized directly.",
    "Other Bets is handled as capped option value, with Waymo scale as a research-only signal.",
  ],
};
