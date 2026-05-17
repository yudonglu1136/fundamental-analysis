import { query } from "../db/client.mjs";
import { NVDA_BACKEND_DB_PATH } from "../../../../modules/nvda/db/schema.mjs";

const TICKER = "NVDA";

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

export function getNvdaReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC, id DESC", [TICKER], NVDA_BACKEND_DB_PATH);
}

export function getLatestNvdaEvent() {
  return getNvdaReportingEvents()[0] ?? null;
}

export function resolveNvdaEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], NVDA_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC, id DESC LIMIT 1",
      [TICKER, asOfDate],
      NVDA_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestNvdaEvent();
}

export function getNvdaSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveNvdaEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent ? reportingEvent.id : "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY fiscalYear ASC, fiscalQuarter ASC, asOfDate ASC",
    params,
    NVDA_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, periodId ASC, segment ASC",
    params,
    NVDA_BACKEND_DB_PATH,
  ));
  const productFinancials = parseRows(query(
    "SELECT * FROM product_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, periodId ASC, productLine ASC",
    params,
    NVDA_BACKEND_DB_PATH,
  ));
  const customerEndMarketSnapshots = parseRows(query(
    "SELECT * FROM customer_end_market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, periodId ASC",
    params,
    NVDA_BACKEND_DB_PATH,
  ));
  const supplyChainSnapshots = parseRows(query(
    "SELECT * FROM supply_chain_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, periodId ASC",
    params,
    NVDA_BACKEND_DB_PATH,
  ));
  const operatingMetricSnapshots = parseRows(query(
    "SELECT * FROM operating_metric_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, periodId ASC",
    params,
    NVDA_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    NVDA_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    NVDA_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    NVDA_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    NVDA_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    NVDA_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 300",
    [TICKER],
    NVDA_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    NVDA_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    NVDA_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    NVDA_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods,
    segmentFinancials,
    productFinancials,
    customerEndMarketSnapshots,
    supplyChainSnapshots,
    operatingMetricSnapshots,
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
