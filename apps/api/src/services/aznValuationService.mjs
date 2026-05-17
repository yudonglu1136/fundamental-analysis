import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { AZN_BACKEND_DB_PATH } from "../../../../modules/azn/db/schema.mjs";
import { AZN_BACKEND_MODEL_VERSION } from "../../../../modules/azn/valuation/modelVersion.mjs";
import { runAznBackendValuation } from "../../../../modules/azn/valuation/adapter.mjs";
import { getAznReportingEvents, getAznSnapshot } from "./aznSnapshotService.mjs";

const TICKER = "AZN.L";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
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
    AZN_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !Number.isFinite(Number(row.adjustedClose))) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: Number(row.adjustedClose),
    close: Number(row.close),
    source: row.source,
    sourceType: row.sourceType,
    rawJson: parseJson(row.rawJson, {}),
  };
}

function applyDailyPriceToSnapshot(snapshot) {
  const dailyPrice = getAsOfDailyPrice(snapshot?.asOfDate);
  if (!dailyPrice) return { snapshot, dailyPrice: null };
  const marketSnapshot = snapshot.marketSnapshot ?? {};
  const sharesOutstanding = marketSnapshot.sharesOutstanding ?? null;
  return {
    dailyPrice,
    snapshot: {
      ...snapshot,
      marketSnapshot: {
        ...marketSnapshot,
        id: marketSnapshot.id ?? `daily-price-${snapshot.asOfDate}`,
        ticker: TICKER,
        asOfDate: snapshot.asOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        previousClose: Number.isFinite(dailyPrice.close) ? dailyPrice.close : dailyPrice.currentPrice,
        marketCap: sharesOutstanding ? dailyPrice.currentPrice * sharesOutstanding : marketSnapshot.marketCap ?? null,
        source: dailyPrice.source,
        rawJson: JSON.stringify({
          ...(parseJson(marketSnapshot.rawJson, {}) ?? {}),
          dailyPriceOverride: dailyPrice,
        }),
      },
    },
  };
}

export function getAznValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, AZN_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getAznHistoricalValuations({ scenario = "Base", modelVersion = AZN_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getAznReportingEvents();
  const runs = getAznValuationRuns({ scenario, modelVersion });
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
  return getAznValuationRuns({ eventId, scenario, modelVersion })[0] ?? null;
}

export async function createAznValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = AZN_BACKEND_MODEL_VERSION.version, assumptions = {} } = {}) {
  const rawSnapshot = getAznSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No AZN reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    AZN_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runAznBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions },
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? null;
  const fairValue =
    valuationResult.recommendedFairValue ??
    valuationResult.blendedFairValue ??
    selectedScenario?.fairValue ??
    null;
  const currentPrice = dailyPrice?.currentPrice ?? valuationResult.currentPrice ?? null;
  const targetPrice3Y = valuationResult.targetPrice3Y ?? selectedScenario?.targetPrice3Y ?? (fairValue != null ? fairValue * 1.08 : null);
  const expectedShareholderCagr = valuationResult.expectedReturn3Y ?? selectedScenario?.expectedReturn3Y ?? null;
  const upsideDownside =
    valuationResult.upsideDownside ??
    (currentPrice && fairValue ? fairValue / currentPrice - 1 : null);
  const backendSnapshot = valuationResult.backendSnapshot ?? {};

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO valuation_runs (
      id, ticker, asOfDate, reportingEventId, scenario, modelVersion, assumptionSetId,
      valuationPeriodId, marketSnapshotId, guidanceSourceId, pipelineAssumptionSetId,
      currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
      probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson, warningsJson,
      dataSnapshotJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      TICKER,
      snapshot.asOfDate,
      snapshot.reportingEvent.id,
      scenario,
      modelVersion,
      assumptionSet?.id ?? null,
      backendSnapshot.valuationPeriodId ?? null,
      backendSnapshot.marketSnapshotId ?? null,
      backendSnapshot.guidanceSourceId ?? null,
      backendSnapshot.pipelineAssumptionSetId ?? null,
      currentPrice,
      fairValue,
      targetPrice3Y,
      expectedShareholderCagr,
      upsideDownside,
      valuationResult.probabilityWeightedFairValue ?? null,
      JSON.stringify(valuationResult.methodCards ?? []),
      JSON.stringify(valuationResult.sensitivityTables ?? []),
      JSON.stringify([
        ...(valuationResult.validationWarnings ?? []),
        ...(dailyPrice
          ? [{
              id: "azn-daily-price-anchor",
              title: "AZN daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} from ${dailyPrice.priceDate}.`,
              severity: /proxy|unadjusted/i.test(dailyPrice.sourceType ?? "") ? "medium" : "low",
            }]
          : []),
      ]),
      JSON.stringify({
        ...backendSnapshot,
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    AZN_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: latestValuationRunForEvent(snapshot.reportingEvent.id, scenario, modelVersion),
    valuationResult,
  };
}

export async function backfillAznValuationRuns({
  scenarios = ["Base"],
  modelVersion = AZN_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], AZN_BACKEND_DB_PATH);
  }
  const events = getAznReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createAznValuationRun({ eventId: event.id, scenario, modelVersion });
        created.push({
          eventId: event.id,
          eventDate: event.eventDate,
          eventType: event.eventType,
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
