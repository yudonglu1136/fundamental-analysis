import { query } from "../db/client.mjs";
import { DGE_BACKEND_DB_PATH } from "../../../../modules/dge/db/schema.mjs";

const TICKER = "DGE.L";

function parseJsonField(row, field) {
  if (!row?.[field]) return row;
  try {
    return { ...row, [field]: JSON.parse(row[field]) };
  } catch {
    return row;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson"]) {
  return rows.map((row) => fields.reduce((acc, field) => parseJsonField(acc, field), row));
}

export function getDgeReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], DGE_BACKEND_DB_PATH);
}

export function getLatestDgeEvent() {
  return getDgeReportingEvents()[0] ?? null;
}

export function resolveDgeEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], DGE_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      DGE_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestDgeEvent();
}

export function getDgeSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveDgeEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent ? reportingEvent.id : "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC, periodId ASC",
    params,
    DGE_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, taxonomy, segment",
    params,
    DGE_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    DGE_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    DGE_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    DGE_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    DGE_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    DGE_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 500",
    [TICKER],
    DGE_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    DGE_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    DGE_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    DGE_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
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
