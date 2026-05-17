import { query } from "../db/client.mjs";
import { NOC_BACKEND_DB_PATH } from "../../../../modules/noc/db/schema.mjs";

const TICKER = "NOC";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseRowJson(row) {
  if (!row) return row;
  const parsed = { ...row };
  for (const key of ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "sourceIsolationPolicyJson", "keyProgramsJson", "risksJson"]) {
    if (key in parsed) parsed[key] = parseJson(parsed[key], key.endsWith("Json") ? null : {});
  }
  return parsed;
}

export function getNocReportingEvents() {
  return query(
    `SELECT *
     FROM reporting_events
     WHERE ticker = ?
     ORDER BY eventDate ASC, id ASC`,
    [TICKER],
    NOC_BACKEND_DB_PATH,
  ).map(parseRowJson);
}

export function resolveNocEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    const row = query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ?", [TICKER, eventId], NOC_BACKEND_DB_PATH)[0];
    if (row) return parseRowJson(row);
  }
  if (asOfDate) {
    const row = query(
      `SELECT *
       FROM reporting_events
       WHERE ticker = ? AND eventDate <= ?
       ORDER BY eventDate DESC, id DESC
       LIMIT 1`,
      [TICKER, asOfDate],
      NOC_BACKEND_DB_PATH,
    )[0];
    if (row) return parseRowJson(row);
  }
  const row = query(
    `SELECT *
     FROM reporting_events
     WHERE ticker = ?
     ORDER BY eventDate DESC, id DESC
     LIMIT 1`,
    [TICKER],
    NOC_BACKEND_DB_PATH,
  )[0];
  return parseRowJson(row ?? null);
}

function rowsAsOf(table, asOfDate, orderBy = "asOfDate ASC, id ASC") {
  return query(
    `SELECT *
     FROM ${table}
     WHERE ticker = ? AND asOfDate <= ?
     ORDER BY ${orderBy}`,
    [TICKER, asOfDate],
    NOC_BACKEND_DB_PATH,
  ).map(parseRowJson);
}

function eventRows(table, eventId, asOfDate, orderBy = "asOfDate ASC, id ASC") {
  return query(
    `SELECT *
     FROM ${table}
     WHERE ticker = ?
       AND (eventId = ? OR asOfDate <= ?)
     ORDER BY ${orderBy}`,
    [TICKER, eventId, asOfDate],
    NOC_BACKEND_DB_PATH,
  ).map(parseRowJson);
}

function getMarketSnapshot(event) {
  return parseRowJson(query(
    `SELECT *
     FROM market_snapshots
     WHERE ticker = ?
       AND (eventId = ? OR asOfDate <= ?)
     ORDER BY CASE WHEN eventId = ? THEN 0 ELSE 1 END, asOfDate DESC, id DESC
     LIMIT 1`,
    [TICKER, event.id, event.eventDate, event.id],
    NOC_BACKEND_DB_PATH,
  )[0] ?? null);
}

function getTranscriptBundle(asOfDate) {
  const events = query(
    `SELECT *
     FROM transcript_events
     WHERE ticker = ? AND callDate <= ?
     ORDER BY callDate ASC, id ASC`,
    [TICKER, asOfDate],
    NOC_BACKEND_DB_PATH,
  ).map(parseRowJson);
  const eventIds = events.map((event) => event.id);
  if (!eventIds.length) return { transcriptEvents: events, transcriptExtractions: [] };
  const placeholders = eventIds.map(() => "?").join(",");
  const extractions = query(
    `SELECT *
     FROM transcript_extractions
     WHERE ticker = ? AND transcriptEventId IN (${placeholders})
     ORDER BY transcriptEventId ASC, id ASC`,
    [TICKER, ...eventIds],
    NOC_BACKEND_DB_PATH,
  ).map(parseRowJson);
  return { transcriptEvents: events, transcriptExtractions: extractions };
}

export function getNocSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveNocEvent({ eventId, asOfDate });
  if (!reportingEvent) {
    return {
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
  const resolvedAsOfDate = reportingEvent.eventDate;
  const { transcriptEvents, transcriptExtractions } = getTranscriptBundle(resolvedAsOfDate);
  return {
    asOfDate: resolvedAsOfDate,
    reportingEvent,
    financialPeriods: eventRows("financial_periods", reportingEvent.id, resolvedAsOfDate),
    segmentFinancials: eventRows("segment_financials", reportingEvent.id, resolvedAsOfDate),
    marketSnapshot: getMarketSnapshot(reportingEvent),
    peerSnapshots: rowsAsOf("peer_snapshots", resolvedAsOfDate),
    guidanceItems: rowsAsOf("guidance_items", resolvedAsOfDate),
    transcriptEvents,
    transcriptExtractions,
    sourceDocuments: query(
      `SELECT *
       FROM source_documents
       WHERE ticker = ?
       ORDER BY COALESCE(publishedDate, '1900-01-01') ASC, id ASC`,
      [TICKER],
      NOC_BACKEND_DB_PATH,
    ).map(parseRowJson),
    modelVersions: query("SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC", [TICKER], NOC_BACKEND_DB_PATH).map(parseRowJson),
    assumptionSets: rowsAsOf("assumption_sets", resolvedAsOfDate),
    validationWarnings: query(
      `SELECT *
       FROM validation_warnings
       WHERE ticker = ? AND (eventId IS NULL OR eventId = ?)
       ORDER BY severity DESC, id ASC`,
      [TICKER, reportingEvent.id],
      NOC_BACKEND_DB_PATH,
    ).map(parseRowJson),
  };
}
