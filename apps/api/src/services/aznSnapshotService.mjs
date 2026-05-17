import { query } from "../db/client.mjs";
import { AZN_BACKEND_DB_PATH } from "../../../../modules/azn/db/schema.mjs";

const TICKER = "AZN.L";

function parseJsonField(row, field) {
  if (!row?.[field]) return row;
  try {
    return { ...row, [field]: JSON.parse(row[field]) };
  } catch {
    return row;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson", "erosionCurveJson"]) {
  return rows.map((row) => fields.reduce((acc, field) => parseJsonField(acc, field), row));
}

export function getAznReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], AZN_BACKEND_DB_PATH);
}

export function getLatestAznEvent() {
  return getAznReportingEvents()[0] ?? null;
}

export function resolveAznEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], AZN_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      AZN_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestAznEvent();
}

export function getAznSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveAznEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent?.id ?? "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const therapyAreaFinancials = parseRows(query(
    "SELECT * FROM therapy_area_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, therapyArea",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const productFinancials = parseRows(query(
    "SELECT * FROM product_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, productName",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const pipelineAssets = parseRows(query(
    "SELECT * FROM pipeline_assets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, assetName",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const pipelineMilestones = parseRows(query(
    "SELECT * FROM pipeline_milestones WHERE ticker = ? AND milestoneDate <= ? ORDER BY milestoneDate ASC, assetName",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const patentExclusivityEvents = parseRows(query(
    "SELECT * FROM patent_exclusivity_events WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, productName",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const productLifecycleEvents = parseRows(query(
    "SELECT * FROM product_lifecycle_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate ASC, productName",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const regulatoryEvents = parseRows(query(
    "SELECT * FROM regulatory_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate ASC, assetName",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    AZN_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    AZN_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    AZN_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    AZN_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 300",
    [TICKER],
    AZN_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    AZN_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    AZN_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    AZN_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods,
    segmentFinancials,
    therapyAreaFinancials,
    productFinancials,
    pipelineAssets,
    pipelineMilestones,
    patentExclusivityEvents,
    productLifecycleEvents,
    regulatoryEvents,
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
