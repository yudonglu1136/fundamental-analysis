import { query } from "../db/client.mjs";
import { LEGN_BACKEND_DB_PATH } from "../../../../modules/legn/db/schema.mjs";

const TICKER = "LEGN";

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

export function getLegnReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC, id DESC", [TICKER], LEGN_BACKEND_DB_PATH);
}

export function getLatestLegnEvent() {
  return getLegnReportingEvents()[0] ?? null;
}

export function resolveLegnEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], LEGN_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC, id DESC LIMIT 1",
      [TICKER, asOfDate],
      LEGN_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestLegnEvent();
}

export function getLegnSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveLegnEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent?.id ?? "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC, fiscalQuarter ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const marketSnapshots = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, peerTicker",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    LEGN_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic",
    [TICKER, eventFilter],
    LEGN_BACKEND_DB_PATH,
  ));
  const productRevenueSnapshots = parseRows(query(
    "SELECT * FROM product_revenue_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const carvyktiCommercialSnapshots = parseRows(query(
    "SELECT * FROM carvykti_commercial_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const collaborationEconomicsSnapshots = parseRows(query(
    "SELECT * FROM collaboration_economics_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const cashRunwaySnapshots = parseRows(query(
    "SELECT * FROM cash_runway_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const operatingExpenseSnapshots = parseRows(query(
    "SELECT * FROM operating_expense_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const dilutionSnapshots = parseRows(query(
    "SELECT * FROM dilution_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const pipelineAssets = parseRows(query(
    "SELECT * FROM pipeline_assets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, assetName",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const pipelineMilestones = parseRows(query(
    "SELECT * FROM pipeline_milestones WHERE ticker = ? AND milestoneDate <= ? ORDER BY milestoneDate ASC, assetName",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const regulatoryEvents = parseRows(query(
    "SELECT * FROM regulatory_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const clinicalTrialEvents = parseRows(query(
    "SELECT * FROM clinical_trial_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const manufacturingCapacityEvents = parseRows(query(
    "SELECT * FROM manufacturing_capacity_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ));
  const competitiveLandscapeSnapshots = parseRows(query(
    "SELECT * FROM competitive_landscape_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    LEGN_BACKEND_DB_PATH,
  ), ["rawJson", "erosionCurveJson"]);
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY publishedDate DESC, id LIMIT 500",
    [TICKER],
    LEGN_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    LEGN_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    LEGN_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    LEGN_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods,
    marketSnapshots,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    productRevenueSnapshots,
    carvyktiCommercialSnapshots,
    collaborationEconomicsSnapshots,
    cashRunwaySnapshots,
    operatingExpenseSnapshots,
    dilutionSnapshots,
    pipelineAssets,
    pipelineMilestones,
    regulatoryEvents,
    clinicalTrialEvents,
    manufacturingCapacityEvents,
    competitiveLandscapeSnapshots,
    sourceDocuments,
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
