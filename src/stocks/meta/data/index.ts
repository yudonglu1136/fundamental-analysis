import type { PeriodOption } from "../../types";
import type { MetaDataset, MetaSource } from "../model";
import { metaAdEconomicsData } from "./adEconomicsData";
import { metaAiCapexData } from "./aiCapexData";
import { metaEarningsCallData, metaEarningsCallSources } from "./earningsCallData";
import { metaForecastAssumptionNotes } from "./forecastAssumptions";
import { metaManagementGuidance, metaManagementSources } from "./managementGuidance";
import { metaMarketData, metaMarketSources } from "./marketData";
import { metaOfficialActuals, metaOfficialSources } from "./officialActuals";
import { metaProductData } from "./productData";
import { metaRealityLabsData } from "./realityLabsData";
import { metaRegulatoryRiskData } from "./regulatoryRiskData";
import { metaResearchOnlyData } from "./researchOnlyData";
import { metaSegmentData } from "./segmentData";
import { metaTranscriptData } from "./transcriptData";

function buildSourceMap(sources: MetaSource[]) {
  return Object.fromEntries(sources.map((source) => [source.id, source]));
}

const sources = [...metaOfficialSources, ...metaManagementSources, ...metaEarningsCallSources, ...metaMarketSources];

export const metaPeriods: PeriodOption[] = metaOfficialActuals.map((period) => ({
  value: period.id,
  label: period.label,
}));

export const metaDataset: MetaDataset = {
  company: "Meta Platforms, Inc.",
  ticker: "META",
  currency: "USD",
  reportingCurrency: "USD",
  unitScale: "USD billions",
  latestReportingPeriod: "q1_2026",
  sources,
  periods: metaOfficialActuals,
  segments: metaSegmentData,
  guidance: metaManagementGuidance,
  adEconomics: metaAdEconomicsData,
  aiCapex: metaAiCapexData,
  productSignals: metaProductData,
  realityLabs: metaRealityLabsData,
  regulatoryRisks: metaRegulatoryRiskData,
  transcriptInsights: metaTranscriptData,
  earningsCalls: metaEarningsCallData,
  marketData: metaMarketData,
  researchNotes: [...metaResearchOnlyData, ...metaForecastAssumptionNotes],
  sourceMap: buildSourceMap(sources),
};

export {
  metaAdEconomicsData,
  metaAiCapexData,
  metaEarningsCallData,
  metaEarningsCallSources,
  metaForecastAssumptionNotes,
  metaManagementGuidance,
  metaManagementSources,
  metaMarketData,
  metaMarketSources,
  metaOfficialActuals,
  metaOfficialSources,
  metaProductData,
  metaRealityLabsData,
  metaRegulatoryRiskData,
  metaResearchOnlyData,
  metaSegmentData,
  metaTranscriptData,
};
