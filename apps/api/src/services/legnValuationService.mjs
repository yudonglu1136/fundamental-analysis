import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { LEGN_BACKEND_DB_PATH } from "../../../../modules/legn/db/schema.mjs";
import { LEGN_BACKEND_MODEL_VERSION } from "../../../../modules/legn/valuation/modelVersion.mjs";
import { runLegnBackendValuation } from "../../../../modules/legn/valuation/adapter.mjs";
import { getLegnReportingEvents, getLegnSnapshot } from "./legnSnapshotService.mjs";

const TICKER = "LEGN";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getAsOfDailyPrice(asOfDate) {
  if (!asOfDate) return null;
  const row = query(
    `SELECT priceDate, adjustedClose, close, source, sourceType, rawJson
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    LEGN_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !Number.isFinite(Number(row.adjustedClose))) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: Number(row.adjustedClose),
    close: Number(row.close),
    source: row.source,
    sourceType: row.sourceType,
    adjustedCloseProxy: parseJson(row.rawJson, {})?.adjustedCloseProxy === true,
  };
}

function applyDailyPriceToSnapshot(snapshot) {
  const dailyPrice = getAsOfDailyPrice(snapshot?.asOfDate);
  if (!dailyPrice) return { snapshot, dailyPrice: null };
  const marketSnapshots = snapshot.marketSnapshots ?? [];
  const marketSnapshot = marketSnapshots.at(-1) ?? {};
  const adsOutstanding = marketSnapshot.adsOutstanding ?? marketSnapshot.sharesOutstanding ?? null;
  const nextMarketSnapshot = {
    ...marketSnapshot,
    id: marketSnapshot.id ?? `legn-daily-price-${snapshot.asOfDate}`,
    ticker: TICKER,
    asOfDate: snapshot.asOfDate,
    priceDate: dailyPrice.priceDate,
    currentPrice: dailyPrice.currentPrice,
    previousClose: dailyPrice.close,
    marketCap: adsOutstanding ? dailyPrice.currentPrice * adsOutstanding : marketSnapshot.marketCap ?? null,
    source: dailyPrice.source,
    fetchedAt: marketSnapshot.fetchedAt ?? new Date().toISOString(),
    rawJson: JSON.stringify({
      ...(parseJson(marketSnapshot.rawJson, {}) ?? {}),
      dailyPriceOverride: dailyPrice,
    }),
  };
  return {
    dailyPrice,
    snapshot: {
      ...snapshot,
      marketSnapshots: marketSnapshots.length
        ? [...marketSnapshots.slice(0, -1), nextMarketSnapshot]
        : [nextMarketSnapshot],
    },
  };
}

export function getLegnValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, LEGN_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getLegnHistoricalValuations({ scenario = "Base", modelVersion = LEGN_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getLegnReportingEvents();
  const runs = getLegnValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

function latestValuationRunForEvent(eventId, scenario, modelVersion) {
  return getLegnValuationRuns({ eventId, scenario, modelVersion })[0] ?? null;
}

export async function createLegnValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = LEGN_BACKEND_MODEL_VERSION.version, assumptions = {} } = {}) {
  const rawSnapshot = getLegnSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No LEGN reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    LEGN_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = runLegnBackendValuation({
    snapshot: { ...snapshot, assumptionSet },
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions },
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? null;
  const fairValue = valuationResult.recommendedFairValue ?? selectedScenario?.fairValue ?? null;
  const currentPrice = dailyPrice?.currentPrice ?? valuationResult.currentPrice ?? null;
  const targetPrice3Y = valuationResult.targetPrice3Y ?? (fairValue != null ? fairValue * 1.1 : null);
  const expectedShareholderCagr = valuationResult.expectedReturn3Y ?? selectedScenario?.expectedReturn3Y ?? null;
  const upsideDownside = valuationResult.upsideDownside ?? (currentPrice && fairValue ? fairValue / currentPrice - 1 : null);
  const backendSnapshot = valuationResult.backendSnapshot ?? {};

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO valuation_runs (
      id, ticker, asOfDate, reportingEventId, fiscalPeriod, scenario, modelVersion, assumptionSetId,
      valuationPeriodId, marketSnapshotId, cashSnapshotId, collaborationEconomicsSnapshotId,
      pipelineAssumptionSetId, currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr,
      upsideDownside, probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson,
      warningsJson, dataSnapshotJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      TICKER,
      snapshot.asOfDate,
      snapshot.reportingEvent.id,
      snapshot.reportingEvent.fiscalPeriod,
      scenario,
      modelVersion,
      assumptionSet?.id ?? null,
      backendSnapshot.valuationPeriodId ?? null,
      backendSnapshot.marketSnapshotId ?? null,
      backendSnapshot.cashSnapshotId ?? null,
      backendSnapshot.collaborationEconomicsSnapshotId ?? null,
      backendSnapshot.pipelineAssumptionSetId ?? null,
      currentPrice,
      fairValue,
      targetPrice3Y,
      expectedShareholderCagr,
      upsideDownside,
      valuationResult.probabilityWeightedFairValue ?? fairValue,
      JSON.stringify(valuationResult.methodCards ?? []),
      JSON.stringify(valuationResult.sensitivityTables ?? []),
      JSON.stringify([
        ...(valuationResult.validationWarnings ?? []),
        ...(dailyPrice
          ? [{
              id: "legn-daily-price-anchor",
              title: "LEGN daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} ${dailyPrice.adjustedCloseProxy ? "close proxy" : "adjusted close"} from ${dailyPrice.priceDate}.`,
              severity: dailyPrice.adjustedCloseProxy ? "medium" : "low",
            }]
          : []),
      ]),
      JSON.stringify({
        ...backendSnapshot,
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    LEGN_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: latestValuationRunForEvent(snapshot.reportingEvent.id, scenario, modelVersion),
    valuationResult,
  };
}

export async function backfillLegnValuationRuns({
  scenarios = ["Base"],
  modelVersion = LEGN_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], LEGN_BACKEND_DB_PATH);
  }
  const events = getLegnReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createLegnValuationRun({ eventId: event.id, scenario, modelVersion });
        created.push({
          eventId: event.id,
          eventDate: event.eventDate,
          eventType: event.eventType,
          fiscalPeriod: event.fiscalPeriod,
          scenario,
          valuationRunId: result.id,
          fairValue: result.valuationRun?.fairValue ?? null,
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
