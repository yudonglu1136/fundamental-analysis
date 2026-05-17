import type { LsegCockpitDataset, LsegMarketData } from "../types";
import { defaultLsegCockpitAssumptions, lsegForecastAssumptions, lsegScenarioAssumptions } from "./assumptions";
import { lsegManagementGuidance } from "./guidanceData";
import { lsegOfficialActuals, lsegProductLines, lsegResearchOnlyItems } from "./officialData";
import { lsegSegmentActuals } from "./segmentData";
import { lsegSourceMap, lsegSourceRecords } from "./sourceMap";

export const lsegCockpitMarketData: LsegMarketData = {
  ticker: "LSEG.L",
  sourceId: "lseg-market-snapshot-2026-05-07",
  sourceType: "market_data",
  currentPriceGbp: defaultLsegCockpitAssumptions.currentPrice,
  priceDate: defaultLsegCockpitAssumptions.priceDate,
  marketCapGbp: 45_917,
  enterpriseValueGbp: 54_092,
  sharesOutstanding: defaultLsegCockpitAssumptions.dilutedShares,
  dividendYield: 1.5 / defaultLsegCockpitAssumptions.currentPrice,
  fcfYield: 2447 / 45_917,
  source: "Local public market-data snapshot; not official LSEG disclosure.",
  notes: "Market fields are dated separately and validation requires a price date.",
};

export const lsegCockpitDataset: LsegCockpitDataset = {
  company: "London Stock Exchange Group plc",
  ticker: "LSEG.L",
  reportingCurrency: "GBP",
  latestReportingPeriod: "FY2025",
  buildDate: "2026-05-11",
  sources: lsegSourceRecords,
  sourceMap: lsegSourceMap,
  officialActuals: lsegOfficialActuals,
  segmentActuals: lsegSegmentActuals,
  productLines: lsegProductLines,
  managementGuidance: lsegManagementGuidance,
  forecastAssumptions: lsegForecastAssumptions,
  scenarios: lsegScenarioAssumptions,
  marketData: lsegCockpitMarketData,
  researchOnly: lsegResearchOnlyItems,
};

export type LsegCockpitRawData = typeof lsegCockpitDataset;
