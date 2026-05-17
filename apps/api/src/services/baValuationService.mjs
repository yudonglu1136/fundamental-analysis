import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { BA_BACKEND_DB_PATH } from "../../../../modules/ba/db/schema.mjs";
import { BA_BACKEND_MODEL_VERSION } from "../../../../modules/ba/valuation/modelVersion.mjs";
import { runBaBackendValuation } from "../../../../modules/ba/valuation/adapter.mjs";
import { getBaReportingEvents, getBaSnapshot } from "./baSnapshotService.mjs";

const TICKER = "BA.L";

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
    `SELECT priceDate, adjustedClose, close, source, rawJson
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    BA_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !Number.isFinite(Number(row.adjustedClose))) return null;
  const raw = parseJson(row.rawJson, {});
  return {
    priceDate: row.priceDate,
    currentPriceGbx: Number(row.adjustedClose),
    currentPriceGbp: Number(row.adjustedClose) / 100,
    closeGbx: Number(row.close),
    source: row.source,
    adjustedCloseFallback: raw?.adjustedCloseFallback === true,
  };
}

function applyDailyPriceToSnapshot(snapshot) {
  const dailyPrice = getAsOfDailyPrice(snapshot?.asOfDate);
  if (!dailyPrice) return { snapshot, dailyPrice: null };
  const marketSnapshot = snapshot.marketSnapshot ?? {};
  const sharesOutstandingM = marketSnapshot.sharesOutstandingM ?? null;
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
        currentPriceGbx: dailyPrice.currentPriceGbx,
        currentPriceGbp: dailyPrice.currentPriceGbp,
        marketCapGbpM: sharesOutstandingM ? dailyPrice.currentPriceGbp * sharesOutstandingM : marketSnapshot.marketCapGbpM ?? null,
        source: dailyPrice.source,
        rawJson: JSON.stringify({
          ...(parseJson(marketSnapshot.rawJson, {}) ?? {}),
          dailyPriceOverride: dailyPrice,
        }),
      },
    },
  };
}

export function getBaValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, BA_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getBaHistoricalValuations({ scenario = "Base", modelVersion = BA_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getBaReportingEvents();
  const runs = getBaValuationRuns({ scenario, modelVersion });
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
  return getBaValuationRuns({ eventId, scenario, modelVersion })[0] ?? null;
}

export async function createBaValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = BA_BACKEND_MODEL_VERSION.version, assumptions = {} } = {}) {
  const rawSnapshot = getBaSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No BA.L reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    BA_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runBaBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions },
    assumptionSetId: assumptionSet?.id ?? null,
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? null;
  const fairValue =
    valuationResult.recommendedFairValue ??
    valuationResult.blendedFairValue ??
    selectedScenario?.fairValue ??
    null;
  const currentPrice = valuationResult.currentPrice ?? null;
  const currentPriceGbx = valuationResult.backendSnapshot?.currentPriceGbx ?? null;
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
      id, ticker, asOfDate, reportingEventId, fiscalPeriod, scenario, modelVersion, assumptionSetId,
      valuationPeriodId, marketSnapshotId, guidanceSourceId, currentPrice, currentPriceGbx, fairValue,
      targetPrice3Y, expectedShareholderCagr, upsideDownside, probabilityWeightedFairValue,
      methodOutputsJson, sensitivityTablesJson, warningsJson, dataSnapshotJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      backendSnapshot.guidanceSourceId ?? null,
      currentPrice,
      currentPriceGbx,
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
              id: dailyPrice.adjustedCloseFallback ? "ba-daily-price-unadjusted-fallback" : "ba-daily-price-anchor",
              title: dailyPrice.adjustedCloseFallback ? "BA.L daily price uses close fallback" : "BA.L daily adjusted price anchor",
              detail: dailyPrice.adjustedCloseFallback
                ? `As-of price uses ${dailyPrice.source} close from ${dailyPrice.priceDate}; adjusted close was unavailable.`
                : `As-of price uses ${dailyPrice.source} adjusted close from ${dailyPrice.priceDate}. BA.L GBX was converted to GBP by dividing by 100.`,
              severity: dailyPrice.adjustedCloseFallback ? "medium" : "low",
            }]
          : [{
              id: "ba-daily-price-missing",
              title: "BA.L daily price anchor unavailable",
              detail: "As-of price fell back to the event market snapshot because no daily price bar was available on or before the event date.",
              severity: "medium",
            }]),
      ]),
      JSON.stringify({
        ...backendSnapshot,
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    BA_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: latestValuationRunForEvent(snapshot.reportingEvent.id, scenario, modelVersion),
    valuationResult,
  };
}

export async function backfillBaValuationRuns({
  scenarios = ["Base"],
  modelVersion = BA_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], BA_BACKEND_DB_PATH);
  }
  const events = getBaReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createBaValuationRun({ eventId: event.id, scenario, modelVersion });
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
