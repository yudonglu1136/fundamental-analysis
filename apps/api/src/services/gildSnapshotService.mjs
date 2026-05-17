import { query } from "../db/client.mjs";
import { GILD_BACKEND_DB_PATH } from "../../../../modules/gild/db/schema.mjs";

const TICKER = "GILD";

function parseJsonField(row, field) {
  if (!row?.[field]) return row;
  try {
    return { ...row, [field]: JSON.parse(row[field]) };
  } catch {
    return row;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson", "erosionCurveJson", "rampCurveJson"]) {
  return rows.map((row) => fields.reduce((acc, field) => parseJsonField(acc, field), row));
}

export function getGildReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], GILD_BACKEND_DB_PATH);
}

export function getLatestGildEvent() {
  return getGildReportingEvents()[0] ?? null;
}

export function resolveGildEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], GILD_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      GILD_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestGildEvent();
}

export function getGildSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveGildEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent?.id ?? "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, fiscalYear DESC, fiscalQuarter DESC",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const productFinancials = parseRows(query(
    "SELECT * FROM product_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, franchise, productName",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const franchiseFinancials = parseRows(query(
    "SELECT * FROM franchise_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, franchise",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    GILD_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    GILD_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 240",
    [TICKER, eventFilter],
    GILD_BACKEND_DB_PATH,
  ));
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    GILD_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 400",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const productLifecycleEvents = parseRows(query(
    "SELECT * FROM product_lifecycle_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const patentExclusivityEvents = parseRows(query(
    "SELECT * FROM patent_exclusivity_events WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, productName",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const pipelineAssets = parseRows(query(
    "SELECT * FROM pipeline_assets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, assetName",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const pipelineMilestones = parseRows(query(
    "SELECT * FROM pipeline_milestones WHERE ticker = ? AND milestoneDate <= ? ORDER BY milestoneDate DESC, assetName",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const dividendBuybackSnapshots = parseRows(query(
    "SELECT * FROM dividend_buyback_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const cashDebtSnapshots = parseRows(query(
    "SELECT * FROM cash_debt_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const acquisitionBdEvents = parseRows(query(
    "SELECT * FROM acquisition_bd_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const vekluryNormalizationSnapshots = parseRows(query(
    "SELECT * FROM veklury_normalization_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC",
    params,
    GILD_BACKEND_DB_PATH,
  ));
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods,
    productFinancials,
    franchiseFinancials,
    marketSnapshot,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    assumptionSets,
    modelVersions,
    sourceDocuments,
    productLifecycleEvents,
    patentExclusivityEvents,
    pipelineAssets,
    pipelineMilestones,
    dividendBuybackSnapshots,
    cashDebtSnapshots,
    acquisitionBdEvents,
    vekluryNormalizationSnapshots,
    validationWarnings,
  };
}
