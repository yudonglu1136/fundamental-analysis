import path from "node:path";
import { query } from "../db/client.mjs";

export const defaultIsrgDbPath = path.resolve(process.env.ISRG_DB_PATH ?? "data/local/isrg/backend/isrg_research.sqlite");
const TICKER = "ISRG";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson"]) {
  return rows.map((row) =>
    fields.reduce((acc, field) => (field in acc ? { ...acc, [field]: parseJson(acc[field], acc[field]) } : acc), row),
  );
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getIsrgDailyPriceOnOrBefore(asOfDate) {
  if (!asOfDate) return null;
  const row = query(
    `SELECT priceDate, close, adjustedClose, source, sourceType, rawJson
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    defaultIsrgDbPath,
  )[0] ?? null;
  const adjustedClose = safeNumber(row?.adjustedClose);
  if (!row || adjustedClose == null) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: adjustedClose,
    previousClose: safeNumber(row.close) ?? adjustedClose,
    source: row.source,
    sourceType: row.sourceType,
    rawJson: parseJson(row.rawJson, {}),
  };
}

export function getIsrgReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], defaultIsrgDbPath);
}

export function getLatestIsrgEvent() {
  return getIsrgReportingEvents()[0] ?? null;
}

export function resolveIsrgEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], defaultIsrgDbPath)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      defaultIsrgDbPath,
    )[0] ?? null;
  }
  return getLatestIsrgEvent();
}

export function getIsrgSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveIsrgEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent?.id ?? "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    defaultIsrgDbPath,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
    params,
    defaultIsrgDbPath,
  ));
  const rawMarketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    defaultIsrgDbPath,
  ))[0] ?? null;
  const dailyPrice = getIsrgDailyPriceOnOrBefore(effectiveAsOfDate);
  const marketSnapshot = dailyPrice
    ? {
        ...(rawMarketSnapshot ?? {}),
        ticker: TICKER,
        asOfDate: effectiveAsOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        previousClose: dailyPrice.previousClose,
        source: dailyPrice.source,
        sourceType: dailyPrice.sourceType,
        rawJson: {
          ...((rawMarketSnapshot?.rawJson && typeof rawMarketSnapshot.rawJson === "object") ? rawMarketSnapshot.rawJson : {}),
          dailyPriceOverride: dailyPrice,
          noFutureLeakage: "Snapshot market price uses nearest daily_price_bars row on or before the requested as-of date.",
        },
      }
    : rawMarketSnapshot;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    defaultIsrgDbPath,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    defaultIsrgDbPath,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    defaultIsrgDbPath,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic",
    [TICKER, eventFilter],
    defaultIsrgDbPath,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 200",
    [TICKER],
    defaultIsrgDbPath,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    defaultIsrgDbPath,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    defaultIsrgDbPath,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    defaultIsrgDbPath,
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
