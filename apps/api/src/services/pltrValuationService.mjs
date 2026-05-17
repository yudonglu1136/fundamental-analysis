import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { PLTR_BACKEND_DB_PATH } from "../../../../modules/pltr/db/schema.mjs";
import { PLTR_BACKEND_MODEL_VERSION } from "../../../../modules/pltr/valuation/modelVersion.mjs";
import { getPltrAsOfDailyPrice, getPltrReportingEvents, getPltrSnapshot } from "./pltrSnapshotService.mjs";

const TICKER = "PLTR";
const DEFAULT_MODEL_VERSION = PLTR_BACKEND_MODEL_VERSION.version;

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

export function getPltrValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, PLTR_BACKEND_DB_PATH).map(normalizeRun);
}

function priceOnlyRun(event, scenario, modelVersion) {
  const dailyPrice = getPltrAsOfDailyPrice(event.eventDate);
  if (!dailyPrice) return null;
  return {
    id: `pltr-price-anchor-${event.id}`,
    ticker: TICKER,
    asOfDate: event.eventDate,
    reportingEventId: event.id,
    fiscalPeriod: event.fiscalPeriod,
    scenario,
    modelVersion,
    assumptionSetId: null,
    currentPrice: dailyPrice.currentPrice,
    fairValue: null,
    targetPrice3Y: null,
    expectedShareholderCagr: null,
    upsideDownside: null,
    probabilityWeightedFairValue: null,
    methodOutputsJson: [],
    sensitivityTablesJson: [],
    warningsJson: [
      {
        id: "pltr-price-anchor-only",
        title: "PLTR backend price anchor",
        detail: `As-of price uses ${dailyPrice.source} adjusted close from ${dailyPrice.priceDate}. Fair value is still calculated by the PLTR frontend valuation engine.`,
        severity: dailyPrice.sourceType?.includes("proxy") ? "medium" : "low",
      },
    ],
    dataSnapshotJson: {
      asOfPriceSource: dailyPrice,
      backendTreatment: "price_anchor_only",
    },
    createdAt: null,
  };
}

export function getPltrHistoricalValuations({ scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION } = {}) {
  const events = getPltrReportingEvents();
  const runs = getPltrValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? priceOnlyRun(event, scenario, modelVersion),
  }));
}

export async function createPltrValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION } = {}) {
  const snapshot = getPltrSnapshot({ eventId, asOfDate });
  if (!snapshot.reportingEvent) throw new Error("No PLTR reporting event matched the supplied eventId/asOfDate.");
  const dailyPrice = snapshot.asOfPriceSource;
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
      snapshot.asOfDate,
      snapshot.reportingEvent.id,
      snapshot.reportingEvent.fiscalPeriod,
      scenario,
      modelVersion,
      null,
      dailyPrice?.currentPrice ?? null,
      null,
      null,
      null,
      null,
      null,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([
        dailyPrice
          ? {
              id: "pltr-daily-price-anchor",
              title: "PLTR daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} adjusted close from ${dailyPrice.priceDate}.`,
              severity: dailyPrice.sourceType?.includes("proxy") ? "medium" : "low",
            }
          : {
              id: "pltr-missing-daily-price-anchor",
              title: "PLTR daily price missing",
              detail: "No daily_price_bars row was available on or before the reporting event date.",
              severity: "high",
            },
      ]),
      JSON.stringify({ asOfPriceSource: dailyPrice, backendTreatment: "price_anchor_only" }),
      createdAt,
    ],
    PLTR_BACKEND_DB_PATH,
  );
  return {
    id,
    persisted: true,
    valuationRun: getPltrValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
  };
}

export async function backfillPltrValuationRuns({ scenarios = ["Base"], modelVersion = DEFAULT_MODEL_VERSION, replace = true } = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], PLTR_BACKEND_DB_PATH);
  }
  const created = [];
  const failed = [];
  for (const event of getPltrReportingEvents()) {
    for (const scenario of scenarios) {
      try {
        const result = await createPltrValuationRun({ eventId: event.id, scenario, modelVersion });
        created.push({
          eventId: event.id,
          eventDate: event.eventDate,
          fiscalPeriod: event.fiscalPeriod,
          scenario,
          valuationRunId: result.id,
          currentPrice: result.valuationRun?.currentPrice ?? null,
        });
      } catch (error) {
        failed.push({ eventId: event.id, scenario, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return {
    ticker: TICKER,
    modelVersion,
    scenarios,
    replace,
    created,
    failed,
    createdCount: created.length,
    failedCount: failed.length,
  };
}
