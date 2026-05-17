import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { TSM_BACKEND_DB_PATH } from "../../../../modules/tsm/db/schema.mjs";
import { TSM_BACKEND_MODEL_VERSION } from "../../../../modules/tsm/valuation/modelVersion.mjs";
import { calculateTsmBackendValuation } from "../../../../modules/tsm/valuation/adapter.mjs";
import { getTsmAsOfDailyPrice, getTsmFinancialPeriod, getTsmReportingEvents, getTsmSnapshot } from "./tsmSnapshotService.mjs";

const TICKER = "TSM";
const DEFAULT_MODEL_VERSION = TSM_BACKEND_MODEL_VERSION.version;

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeRun(row) {
  if (!row) return null;
  return {
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  };
}

export function getTsmValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
  const clauses = ["ticker = ?"];
  const params = [TICKER];
  if (asOfDate) {
    clauses.push("asOfDate = ?");
    params.push(asOfDate);
  }
  if (eventId) {
    clauses.push("reportingEventId = ?");
    params.push(eventId);
  }
  if (scenario) {
    clauses.push("scenario = ?");
    params.push(scenario);
  }
  if (modelVersion) {
    clauses.push("modelVersion = ?");
    params.push(modelVersion);
  }
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, TSM_BACKEND_DB_PATH).map(normalizeRun);
}

function synthesizeRun(event, scenario, modelVersion) {
  const financialPeriod = getTsmFinancialPeriod(event.id);
  const dailyPrice = getTsmAsOfDailyPrice(event.eventDate);
  if (!financialPeriod || !dailyPrice) return null;
  const result = calculateTsmBackendValuation({
    financialPeriod,
    currentPrice: dailyPrice.currentPrice,
    scenario,
    modelVersion,
  });
  return {
    id: `tsm-synth-${event.id}-${scenario}`,
    ticker: TICKER,
    asOfDate: event.eventDate,
    reportingEventId: event.id,
    fiscalPeriod: event.fiscalPeriod,
    scenario,
    modelVersion,
    assumptionSetId: null,
    ...result,
    dataSnapshotJson: {
      ...result.dataSnapshotJson,
      asOfPriceSource: dailyPrice,
      backendTreatment: "event_visible_backend_synthesized",
    },
    createdAt: null,
  };
}

export function getTsmHistoricalValuations({ scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION } = {}) {
  const events = getTsmReportingEvents();
  const runs = getTsmValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? synthesizeRun(event, scenario, modelVersion),
  }));
}

export async function createTsmValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION } = {}) {
  const snapshot = getTsmSnapshot({ eventId, asOfDate });
  if (!snapshot.reportingEvent) throw new Error("No TSM reporting event matched the supplied eventId/asOfDate.");
  const financialPeriod = getTsmFinancialPeriod(snapshot.reportingEvent.id);
  if (!financialPeriod) throw new Error(`Missing financial_periods row for ${snapshot.reportingEvent.id}.`);
  const dailyPrice = snapshot.asOfPriceSource;
  if (!dailyPrice) throw new Error(`Missing TSM daily_price_bars as-of price for ${snapshot.reportingEvent.eventDate}.`);
  const result = calculateTsmBackendValuation({
    financialPeriod,
    currentPrice: dailyPrice.currentPrice,
    scenario,
    modelVersion,
  });
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO valuation_runs (
      id, ticker, asOfDate, reportingEventId, fiscalPeriod, scenario, modelVersion, assumptionSetId,
      currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
      probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson, warningsJson, dataSnapshotJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      TICKER,
      snapshot.reportingEvent.eventDate,
      snapshot.reportingEvent.id,
      snapshot.reportingEvent.fiscalPeriod,
      scenario,
      modelVersion,
      `tsm-${String(scenario).toLowerCase()}-assumptions-v1`,
      result.currentPrice,
      result.fairValue,
      result.targetPrice3Y,
      result.expectedShareholderCagr,
      result.upsideDownside,
      result.probabilityWeightedFairValue,
      JSON.stringify(result.methodOutputsJson),
      JSON.stringify(result.sensitivityTablesJson),
      JSON.stringify(result.warningsJson),
      JSON.stringify({
        ...result.dataSnapshotJson,
        asOfPriceSource: dailyPrice,
        backendTreatment: "event_visible_backend_persisted",
      }),
      createdAt,
    ],
    TSM_BACKEND_DB_PATH,
  );
  return {
    id,
    persisted: true,
    valuationRun: getTsmValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
  };
}

export async function backfillTsmValuationRuns({ scenarios = ["Base"], modelVersion = DEFAULT_MODEL_VERSION, replace = true } = {}) {
  if (replace) execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], TSM_BACKEND_DB_PATH);
  const created = [];
  const failed = [];
  for (const event of getTsmReportingEvents()) {
    for (const scenario of scenarios) {
      try {
        const result = await createTsmValuationRun({ eventId: event.id, scenario, modelVersion });
        created.push({
          eventId: event.id,
          eventDate: event.eventDate,
          fiscalPeriod: event.fiscalPeriod,
          scenario,
          valuationRunId: result.id,
          currentPrice: result.valuationRun?.currentPrice ?? null,
          fairValue: result.valuationRun?.fairValue ?? null,
        });
      } catch (error) {
        failed.push({ eventId: event.id, scenario, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { ticker: TICKER, modelVersion, scenarios, replace, created, failed, createdCount: created.length, failedCount: failed.length };
}
