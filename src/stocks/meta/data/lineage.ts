import type { DataLineage, MetaSource } from "../model";

type LineageSeed = Omit<DataLineage, "confidence" | "valuationTreatment"> & {
  confidence?: DataLineage["confidence"];
  valuationTreatment?: DataLineage["valuationTreatment"];
};

export function lineage(seed: LineageSeed): DataLineage {
  return {
    confidence: "high",
    valuationTreatment: "direct_input",
    ...seed,
  };
}

export function sourceLineage(source: Pick<MetaSource, "title" | "url" | "sourceStatus" | "reportingPeriod" | "publishedDate" | "accessedDate">): DataLineage {
  const filingType =
    source.title.includes("10-K") ? "10-K"
      : source.title.includes("10-Q") ? "10-Q"
        : source.title.toLowerCase().includes("transcript") ? "transcript"
          : source.sourceStatus === "market_data" ? "market_snapshot"
            : "earnings_release";
  return lineage({
    sourceType: source.sourceStatus === "missing" ? "manual_seed" : source.sourceStatus,
    sourceName: source.title,
    sourceUrl: source.url,
    filingType,
    period: source.reportingPeriod ?? "n/a",
    asOfDate: source.publishedDate ?? source.accessedDate,
    retrievedAt: source.accessedDate,
    confidence: source.sourceStatus === "market_data" ? "medium" : "high",
    valuationTreatment: source.sourceStatus === "market_data" ? "direct_input" : "forecast_anchor",
  });
}

export const metaLineage = {
  fy2025Actual: lineage({
    sourceType: "official_actual",
    sourceName: "Meta Reports Fourth Quarter and Full Year 2025 Results",
    sourceUrl: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/",
    filingType: "earnings_release",
    period: "FY 2025",
    asOfDate: "2026-01-28",
    retrievedAt: "2026-05-11",
    confidence: "high",
    valuationTreatment: "forecast_anchor",
  }),
  fy2025Form10K: lineage({
    sourceType: "official_actual",
    sourceName: "Meta Platforms 2025 Form 10-K",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1326801/000132680126000011/meta-20251231.htm",
    filingType: "10-K",
    period: "FY 2025",
    asOfDate: "2026-01-29",
    retrievedAt: "2026-05-11",
    confidence: "high",
    valuationTreatment: "forecast_anchor",
  }),
  q1_2026Actual: lineage({
    sourceType: "official_actual",
    sourceName: "Meta Reports First Quarter 2026 Results",
    sourceUrl: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/",
    filingType: "earnings_release",
    period: "Q1 2026",
    asOfDate: "2026-04-29",
    retrievedAt: "2026-05-11",
    confidence: "high",
    valuationTreatment: "forecast_anchor",
  }),
  q1_2026Form10Q: lineage({
    sourceType: "official_actual",
    sourceName: "Meta Platforms Q1 2026 Form 10-Q",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1326801/000132680126000041/meta-20260331.htm",
    filingType: "10-Q",
    period: "Quarter ended March 31, 2026",
    asOfDate: "2026-04-30",
    retrievedAt: "2026-05-11",
    confidence: "high",
    valuationTreatment: "forecast_anchor",
  }),
  q1_2026Transcript: lineage({
    sourceType: "management_guidance",
    sourceName: "Meta Q1 2026 Earnings Call Transcript",
    sourceUrl: "https://s21.q4cdn.com/399680738/files/doc_financials/2026/q1/META-Q1-2026-Earnings-Call-Transcript.pdf",
    filingType: "transcript",
    period: "Q1 2026",
    asOfDate: "2026-04-30",
    retrievedAt: "2026-05-11",
    confidence: "medium",
    valuationTreatment: "forecast_anchor",
  }),
  q1_2026Guidance: lineage({
    sourceType: "management_guidance",
    sourceName: "Meta Q1 2026 earnings release outlook",
    sourceUrl: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/",
    filingType: "earnings_release",
    period: "FY 2026 / Q2 2026 guidance",
    asOfDate: "2026-04-29",
    retrievedAt: "2026-05-11",
    confidence: "high",
    valuationTreatment: "forecast_anchor",
  }),
  forecastAssumption: lineage({
    sourceType: "forecast_assumption",
    sourceName: "META model scenario assumptions",
    period: "2026E-2030E",
    asOfDate: "2026-05-12",
    retrievedAt: "2026-05-12",
    confidence: "medium",
    valuationTreatment: "scenario_only",
    notes: "Analyst forecast assumption used for scenario valuation rather than official company guidance.",
  }),
  researchOnly: lineage({
    sourceType: "research_only",
    sourceName: "META buy-side research framework",
    period: "2026E-2030E",
    asOfDate: "2026-05-12",
    retrievedAt: "2026-05-12",
    confidence: "medium",
    valuationTreatment: "risk_monitor",
  }),
  marketSnapshot: lineage({
    sourceType: "market_data",
    sourceName: "Dated Yahoo Finance META quote snapshot",
    sourceUrl: "https://finance.yahoo.com/quote/META/",
    filingType: "market_snapshot",
    period: "Market close 2026-05-08",
    asOfDate: "2026-05-08",
    retrievedAt: "2026-05-11",
    confidence: "medium",
    valuationTreatment: "direct_input",
    notes: "Dated market snapshot for upside/downside and market-implied diagnostics.",
  }),
  derived: lineage({
    sourceType: "derived",
    sourceName: "META model calculation",
    period: "2026E-2030E",
    asOfDate: "2026-05-12",
    retrievedAt: "2026-05-12",
    confidence: "medium",
    valuationTreatment: "direct_input",
  }),
};

export function fieldLineage(fields: string[], source: DataLineage) {
  return Object.fromEntries(fields.map((field) => [field, source]));
}
