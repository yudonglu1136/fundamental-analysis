import { readFileSync } from "node:fs";
import { query } from "../db/client.mjs";
import { AMZN_BACKEND_DB_PATH } from "../../../../modules/amzn/db/schema.mjs";

const TICKER = "AMZN";
const AMZN_RESEARCH_FRAMEWORK_PATH = new URL("../../../../modules/amzn/research/framework.json", import.meta.url);

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

function getAmznResearchFramework() {
  try {
    return JSON.parse(readFileSync(AMZN_RESEARCH_FRAMEWORK_PATH, "utf8"));
  } catch (error) {
    return {
      asOfDate: new Date().toISOString().slice(0, 10),
      sourceStatus: "research_only",
      sourceDiscipline: "AMZN research framework unavailable from local backend module.",
      error: error instanceof Error ? error.message : String(error),
      currentRead: {
        verdict: "Research framework unavailable.",
        variantView: "Backend snapshot still returns financial tables when available.",
        marketIsWatching: "AWS AI, advertising, retail margin, FCF, and regulation.",
        valuationGuardrail: "Use frontend static fallback until backend research framework file is restored.",
      },
      themeTiles: [],
      profitPoolScorecard: [],
      aiCapexScenarios: [],
      managementQuestions: [],
      killCriteria: [],
      monitoringPlan: [],
      latestPublicAnchors: [],
    };
  }
}

export function getAmznReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC, id DESC", [TICKER], AMZN_BACKEND_DB_PATH);
}

export function getLatestAmznEvent() {
  return getAmznReportingEvents()[0] ?? null;
}

export function resolveAmznEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], AMZN_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC, id DESC LIMIT 1",
      [TICKER, asOfDate],
      AMZN_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestAmznEvent();
}

export function getAmznSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveAmznEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent ? reportingEvent.id : "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC, fiscalQuarter ASC",
    params,
    AMZN_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
    params,
    AMZN_BACKEND_DB_PATH,
  ));
  const businessUnitFinancials = parseRows(query(
    "SELECT * FROM business_unit_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, businessUnit",
    params,
    AMZN_BACKEND_DB_PATH,
  ));
  const operatingMetricSnapshots = parseRows(query(
    "SELECT * FROM operating_metric_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, periodId",
    params,
    AMZN_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    AMZN_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    AMZN_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    AMZN_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    AMZN_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    AMZN_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 300",
    [TICKER],
    AMZN_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    AMZN_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    AMZN_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    AMZN_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods,
    segmentFinancials,
    businessUnitFinancials,
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
    researchFramework: getAmznResearchFramework(),
  };
}
