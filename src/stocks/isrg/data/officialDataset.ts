import type { IsrgDataLayer, IsrgDataSourceAuditRecord, IsrgSourceRecord } from "../model";
import {
  ISRG_DV5_CARDIAC_RELEASE,
  ISRG_DV5_CE_MARK_RELEASE,
  ISRG_DV5_FDA_RELEASE,
  ISRG_DV5_INSIGHTS_RELEASE,
  ISRG_EUROPE_EXPANSION_RELEASE,
  ISRG_Q1_2026_RELEASE,
  ISRG_Q4_2025_RELEASE,
  ISRG_SEC_COMPANYFACTS,
  ISRG_SEC_SUBMISSIONS,
  ISRG_SP_EXPANDED_RELEASE,
  isrgForecastAnchors,
  isrgResearchOnlyData,
  isrgSources,
} from "../realData";
import { actualData } from "./actuals";
import { competitionData } from "./competitionData";
import { officialGuidance } from "./guidance";
import { marketData } from "./marketData";
import { transcriptData } from "./transcriptData";

const DOWNLOAD_DATE = "2026-05-11";

function auditRecord(
  id: string,
  url: string,
  sourceType: IsrgDataSourceAuditRecord["sourceType"],
  sourceStatus: IsrgDataSourceAuditRecord["sourceStatus"],
  reportingPeriod: string,
  notes: string,
  options: Partial<Pick<IsrgDataSourceAuditRecord, "blocked" | "parsedSuccessfully" | "manuallySeeded" | "usedInValuation" | "researchOnly">> = {},
): IsrgDataSourceAuditRecord {
  return {
    id,
    url,
    sourceType,
    sourceStatus,
    reportingPeriod,
    downloadDate: DOWNLOAD_DATE,
    blocked: options.blocked ?? false,
    parsedSuccessfully: options.parsedSuccessfully ?? true,
    manuallySeeded: options.manuallySeeded ?? true,
    usedInValuation:
      options.usedInValuation ?? (sourceStatus === "official_actual" || sourceStatus === "management_guidance"),
    researchOnly: options.researchOnly ?? sourceStatus === "research_only",
    notes,
  };
}

export const isrgDataSourceAudit: IsrgDataSourceAuditRecord[] = [
  auditRecord("q1-2026-earnings-release", ISRG_Q1_2026_RELEASE, "earnings_release", "official_actual", "Q1 2026", "Official quarterly release used for revenue, margin, installed base, placements, lease mix, and guide references."),
  auditRecord("fy-2025-earnings-release", ISRG_Q4_2025_RELEASE, "earnings_release", "official_actual", "FY 2025", "Official annual release used for FY actuals and system/procedure context."),
  auditRecord("sec-companyfacts", ISRG_SEC_COMPANYFACTS, "sec_filing", "official_actual", "multi-period", "SEC companyfacts endpoint. Used by fetcher for reconciliation, not blindly treated as complete segment truth.", { parsedSuccessfully: false, manuallySeeded: false }),
  auditRecord("sec-submissions", ISRG_SEC_SUBMISSIONS, "sec_filing", "official_actual", "multi-period", "SEC submissions feed for 10-K, 10-Q, 8-K, and DEF 14A tracking.", { parsedSuccessfully: false, manuallySeeded: false }),
  auditRecord("dv5-fda", ISRG_DV5_FDA_RELEASE, "product_announcement", "research_only", "2024", "da Vinci 5 FDA clearance product event. Research-only until mapped into placement assumptions.", { usedInValuation: false, researchOnly: true }),
  auditRecord("dv5-ce", ISRG_DV5_CE_MARK_RELEASE, "product_announcement", "research_only", "2025", "da Vinci 5 CE mark. Supports OUS adoption watchlist only.", { usedInValuation: false, researchOnly: true }),
  auditRecord("dv5-cardiac", ISRG_DV5_CARDIAC_RELEASE, "product_announcement", "research_only", "2025", "da Vinci 5 cardiac procedure clearance. Product-cycle narrative only.", { usedInValuation: false, researchOnly: true }),
  auditRecord("dv5-insights", ISRG_DV5_INSIGHTS_RELEASE, "product_announcement", "research_only", "2025", "Real-time surgical insights announcement. Digital ecosystem narrative only.", { usedInValuation: false, researchOnly: true }),
  auditRecord("sp-expanded", ISRG_SP_EXPANDED_RELEASE, "product_announcement", "research_only", "2025", "SP expanded indications. Optionality watchlist only.", { usedInValuation: false, researchOnly: true }),
  auditRecord("europe-expansion", ISRG_EUROPE_EXPANSION_RELEASE, "official_ir", "research_only", "2025", "Europe footprint expansion. Research-only international adoption context.", { usedInValuation: false, researchOnly: true }),
  auditRecord("transcripts", "data/local/isrg/transcripts/", "transcript", "research_only", "8-12 quarters", transcriptData.sourceBoundary, { parsedSuccessfully: false, usedInValuation: false, researchOnly: true }),
];

export const isrgSourceMap: IsrgSourceRecord[] = isrgSources.map((source) => ({
  ...source,
  sourceStatus:
    source.sourceType === "earnings_release" || source.sourceType === "sec_filing"
      ? "official_actual"
      : source.sourceType === "yfinance" || source.sourceType === "market_snapshot"
        ? "market_data"
        : "research_only",
}));

export const officialDatasetBoundary = {
  actuals: "Official earnings releases and SEC filings can feed actualData and valuationInputs.",
  guidance: "Management guidance can feed forecast anchors only through explicit assumptions.",
  forecastAssumptions: "Manual underwriting assumptions live in assumptions.ts and scenarioAssumptions.ts.",
  transcripts: transcriptData.sourceBoundary,
  competition: competitionData.sourceBoundary,
  market: "Market data is price/reference data only and cannot overwrite fundamental actuals.",
};

export const isrgOfficialDataset: IsrgDataLayer & {
  sourceAudit: IsrgDataSourceAuditRecord[];
  sourceBoundary: typeof officialDatasetBoundary;
} = {
  actualData,
  officialGuidance,
  forecastAnchors: isrgForecastAnchors.map((anchor) => ({
    ...anchor,
    source: { ...anchor.source, sourceStatus: "forecast_assumption" },
  })),
  transcriptInsights: {
    events: transcriptData.events,
    qaPairs: transcriptData.qaPairs,
    topicTrends: transcriptData.topicTrends,
    quarterFocus: transcriptData.quarterFocus,
  },
  marketData,
  researchOnlyData: isrgResearchOnlyData,
  valuationInputs: {
    latestFullYearPeriodId: "fy2025",
    latestQuarterPeriodId: "q1-2026",
    allowedSourceTypes: ["earnings_release", "sec_filing", "derived", "assumption"],
    excludedSourceTypes: ["transcript", "product_announcement", "manual_todo", "yfinance", "market_snapshot"],
    notes: [
      "Official actuals and explicitly reviewed assumptions can enter valuation.",
      "Transcript, competition, product narrative, FDA/MAUDE watch items, and market data remain research-only unless converted into assumptions.",
      "Ion and SP optionality is probability-weighted and haircut to avoid double counting against the core procedure DCF.",
    ],
  },
  sources: isrgSourceMap,
  dataStatus: {
    lastUpdated: DOWNLOAD_DATE,
    sourceNote:
      "ISRG dataset is official-first. Some figures are manually seeded from official releases pending full automated parsing; metadata keeps this visible.",
    warnings: [
      {
        id: "isrg-official-parser-partial",
        title: "Official fetcher is partial",
        detail:
          "Official releases are cached with metadata, but the production parser does not yet fully extract every PDF/table field automatically.",
        severity: "medium",
      },
      {
        id: "isrg-transcripts-research-only",
        title: "Transcripts are research-only",
        detail:
          "Transcript-derived themes are excluded from valuationInputs unless separately validated against official numerical disclosures.",
        severity: "low",
      },
    ],
  },
  sourceAudit: isrgDataSourceAudit,
  sourceBoundary: officialDatasetBoundary,
};
