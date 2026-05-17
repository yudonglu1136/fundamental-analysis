import { query } from "../db/client.mjs";
import { META_BACKEND_DB_PATH } from "../../../../modules/meta/db/schema.mjs";

const TICKER = "META";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function withParsedJson(row) {
  if (!row) return row;
  return {
    ...row,
    rawJson: parseJson(row.rawJson, row.rawJson),
    metadataJson: parseJson(row.metadataJson, row.metadataJson),
  };
}

export function getMetaReportingEvents() {
  return query(
    `SELECT id, ticker, eventDate, fiscalPeriod, fiscalQuarter, fiscalYear, eventType, label, periodLabel,
            sourceType, sourcePath, sourceUrl, metadataJson
     FROM reporting_events
     WHERE ticker = ?
     ORDER BY eventDate DESC, id DESC`,
    [TICKER],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);
}

function resolveMetaEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], META_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC, id DESC LIMIT 1",
      [TICKER, asOfDate],
      META_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC, id DESC LIMIT 1", [TICKER], META_BACKEND_DB_PATH)[0] ?? null;
}

export function getMetaSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveMetaEvent({ eventId, asOfDate });
  if (!reportingEvent) {
    return {
      ticker: TICKER,
      asOfDate: asOfDate ?? null,
      reportingEvent: null,
      financialPeriods: [],
      segmentFinancials: [],
      marketSnapshot: null,
      peerSnapshots: [],
      guidanceItems: [],
      transcriptEvents: [],
      transcriptExtractions: [],
      sourceDocuments: [],
      modelVersions: [],
      assumptionSets: [],
      validationWarnings: [],
    };
  }
  const effectiveAsOfDate = asOfDate ?? reportingEvent.eventDate;
  const financialPeriods = query(
    `SELECT * FROM financial_periods
     WHERE ticker = ? AND asOfDate <= ?
     ORDER BY asOfDate ASC, periodId ASC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);
  const segmentFinancials = query(
    `SELECT * FROM segment_financials
     WHERE ticker = ? AND asOfDate <= ?
     ORDER BY asOfDate ASC, periodId ASC, segment ASC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);
  const marketSnapshot = withParsedJson(query(
    `SELECT * FROM market_snapshots
     WHERE ticker = ? AND asOfDate <= ?
     ORDER BY asOfDate DESC, id DESC
     LIMIT 1`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  )[0] ?? null);
  const peerSnapshots = query(
    `SELECT * FROM peer_snapshots
     WHERE ticker = ? AND asOfDate <= ?
     ORDER BY asOfDate DESC, peerTicker ASC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);
  const guidanceItems = query(
    `SELECT * FROM guidance_items
     WHERE ticker = ? AND asOfDate <= ?
     ORDER BY asOfDate DESC, id DESC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);
  const transcriptEvents = query(
    `SELECT * FROM transcript_events
     WHERE ticker = ? AND eventDate <= ?
     ORDER BY eventDate DESC, id DESC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);
  const transcriptExtractions = query(
    `SELECT * FROM transcript_extractions
     WHERE ticker = ? AND asOfDate <= ?
     ORDER BY asOfDate DESC, id DESC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);
  const sourceDocuments = query(
    `SELECT * FROM source_documents
     WHERE ticker = ?
       AND (publishedDate IS NULL OR publishedDate <= ? OR sourceType IN ('research_only', 'forecast_assumption'))
     ORDER BY COALESCE(publishedDate, retrievedAt, '') ASC, id ASC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);
  const modelVersions = query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    META_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    valuationMethodsJson: parseJson(row.valuationMethodsJson, []),
    assumptionSchemaJson: parseJson(row.assumptionSchemaJson, {}),
  }));
  const assumptionSets = query(
    `SELECT * FROM assumption_sets
     WHERE ticker = ? AND asOfDate <= ?
     ORDER BY asOfDate DESC, scenario ASC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    assumptionsJson: parseJson(row.assumptionsJson, {}),
  }));
  const validationWarnings = query(
    `SELECT * FROM validation_warnings
     WHERE ticker = ? AND (asOfDate IS NULL OR asOfDate <= ?)
     ORDER BY asOfDate DESC, severity DESC, id ASC`,
    [TICKER, effectiveAsOfDate],
    META_BACKEND_DB_PATH,
  ).map(withParsedJson);

  return {
    ticker: TICKER,
    asOfDate: effectiveAsOfDate,
    reportingEvent: withParsedJson(reportingEvent),
    financialPeriods,
    segmentFinancials,
    marketSnapshot,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    sourceDocuments,
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
