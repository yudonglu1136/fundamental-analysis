import { query } from "../db/client.mjs";
import { CEG_BACKEND_DB_PATH } from "../../../../modules/ceg/db/schema.mjs";

const TICKER = "CEG";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson"]) {
  return rows.map((row) => fields.reduce((acc, field) => ({ ...acc, [field]: parseJson(acc[field], acc[field]) }), row));
}

export function getCegReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], CEG_BACKEND_DB_PATH);
}

export function resolveCegEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], CEG_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1", [TICKER, asOfDate], CEG_BACKEND_DB_PATH)[0] ?? null;
  }
  return getCegReportingEvents()[0] ?? null;
}

export function getCegSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveCegEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate ?? "9999-12-31";
  const params = [TICKER, effectiveAsOfDate];
  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods: parseRows(query(
      "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC, fiscalQuarter ASC, periodId ASC",
      params,
      CEG_BACKEND_DB_PATH,
    )),
    segmentFinancials: parseRows(query(
      "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
      params,
      CEG_BACKEND_DB_PATH,
    )),
    marketSnapshot: parseRows(query(
      "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
      params,
      CEG_BACKEND_DB_PATH,
    ))[0] ?? null,
    peerSnapshots: parseRows(query(
      "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
      params,
      CEG_BACKEND_DB_PATH,
    )),
    guidanceItems: parseRows(query(
      "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
      params,
      CEG_BACKEND_DB_PATH,
    )),
    transcriptEvents: parseRows(query(
      "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
      params,
      CEG_BACKEND_DB_PATH,
    ), ["metadataJson"]),
    transcriptExtractions: parseRows(query(
      "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
      [TICKER, reportingEvent?.id ?? ""],
      CEG_BACKEND_DB_PATH,
    )),
    sourceDocuments: parseRows(query(
      `SELECT *
       FROM source_documents
       WHERE ticker = ?
         AND COALESCE(publishedDate, retrievedAt, '0000-01-01') <= ?
       ORDER BY COALESCE(publishedDate, retrievedAt) DESC, id
       LIMIT 300`,
      [TICKER, effectiveAsOfDate],
      CEG_BACKEND_DB_PATH,
    ), ["metadataJson"]),
    modelVersions: parseRows(query("SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC", [TICKER], CEG_BACKEND_DB_PATH), ["valuationMethodsJson", "assumptionSchemaJson"]),
    assumptionSets: parseRows(query(
      "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
      params,
      CEG_BACKEND_DB_PATH,
    ), ["assumptionsJson"]),
    validationWarnings: query("SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC", [TICKER], CEG_BACKEND_DB_PATH),
  };
}
