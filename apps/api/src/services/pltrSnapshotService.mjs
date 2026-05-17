import { query } from "../db/client.mjs";
import { PLTR_BACKEND_DB_PATH } from "../../../../modules/pltr/db/schema.mjs";

const TICKER = "PLTR";

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

export function getPltrReportingEvents() {
  return parseRows(
    query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate ASC, id ASC", [TICKER], PLTR_BACKEND_DB_PATH),
  );
}

export function resolvePltrEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return parseRows(query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], PLTR_BACKEND_DB_PATH))[0] ?? null;
  }
  if (asOfDate) {
    return parseRows(
      query(
        "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC, id DESC LIMIT 1",
        [TICKER, asOfDate],
        PLTR_BACKEND_DB_PATH,
      ),
    )[0] ?? null;
  }
  const events = getPltrReportingEvents();
  return events[events.length - 1] ?? null;
}

export function getPltrAsOfDailyPrice(asOfDate) {
  if (!asOfDate) return null;
  const row = query(
    `SELECT priceDate, adjustedClose, close, source, sourceType, rawJson
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    PLTR_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !Number.isFinite(Number(row.adjustedClose))) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: Number(row.adjustedClose),
    close: Number(row.close),
    source: row.source,
    sourceType: row.sourceType,
    rawJson: parseJsonField(row, "rawJson").rawJson ?? {},
  };
}

export function getPltrSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolvePltrEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const asOfPrice = getPltrAsOfDailyPrice(effectiveAsOfDate);
  const marketSnapshot = parseRows(
    query(
      "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, id DESC LIMIT 1",
      [TICKER, effectiveAsOfDate ?? "9999-12-31"],
      PLTR_BACKEND_DB_PATH,
    ),
  )[0] ?? null;
  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    marketSnapshot: asOfPrice
      ? {
          ...(marketSnapshot ?? {}),
          ticker: TICKER,
          asOfDate: effectiveAsOfDate,
          priceDate: asOfPrice.priceDate,
          currentPrice: asOfPrice.currentPrice,
          source: asOfPrice.source,
          sourceType: asOfPrice.sourceType,
        }
      : marketSnapshot,
    asOfPriceSource: asOfPrice,
    sourceDocuments: parseRows(
      query("SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id", [TICKER], PLTR_BACKEND_DB_PATH),
      ["metadataJson"],
    ),
    modelVersions: parseRows(
      query("SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC", [TICKER], PLTR_BACKEND_DB_PATH),
      ["valuationMethodsJson", "assumptionSchemaJson"],
    ),
    assumptionSets: parseRows(
      query(
        "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
        [TICKER, effectiveAsOfDate ?? "9999-12-31"],
        PLTR_BACKEND_DB_PATH,
      ),
      ["assumptionsJson"],
    ),
    validationWarnings: query("SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC", [TICKER], PLTR_BACKEND_DB_PATH),
  };
}
