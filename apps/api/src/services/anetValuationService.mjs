import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getAnetReportingEvents, getAnetSnapshot } from "./anetSnapshotService.mjs";
import { ANET_BACKEND_DB_PATH } from "../../../../modules/anet/db/schema.mjs";
import { runAnetBackendValuation } from "../../../../modules/anet/valuation/adapter.mjs";
import { ANET_BACKEND_MODEL_VERSION } from "../../../../modules/anet/valuation/modelVersion.mjs";

const TICKER = "ANET";
const DEFAULT_MODEL_VERSION = ANET_BACKEND_MODEL_VERSION.version;

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
    `SELECT priceDate, adjustedClose, close, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    ANET_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !Number.isFinite(Number(row.adjustedClose))) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: Number(row.adjustedClose),
    close: Number(row.close),
    source: row.source,
    sourceType: row.sourceType,
  };
}

function applyDailyPriceToSnapshot(snapshot) {
  const dailyPrice = getAsOfDailyPrice(snapshot?.asOfDate);
  if (!dailyPrice) return { snapshot, dailyPrice: null };
  const marketSnapshot = snapshot.marketSnapshot ?? {};
  const sharesOutstanding =
    marketSnapshot.sharesOutstanding ??
    snapshot.financialPeriods?.slice().reverse().find((row) => row.dilutedShares)?.dilutedShares ??
    null;
  return {
    dailyPrice,
    snapshot: {
      ...snapshot,
      marketSnapshot: {
        ...marketSnapshot,
        id: marketSnapshot.id ?? `anet-daily-price-${snapshot.asOfDate}`,
        ticker: TICKER,
        asOfDate: snapshot.asOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        previousClose: dailyPrice.close,
        marketCap: sharesOutstanding ? dailyPrice.currentPrice * sharesOutstanding : marketSnapshot.marketCap ?? null,
        enterpriseValue: sharesOutstanding
          ? dailyPrice.currentPrice * sharesOutstanding - (snapshot.financialPeriods?.slice().reverse().find((row) => row.netCashDebt)?.netCashDebt ?? 0)
          : marketSnapshot.enterpriseValue ?? null,
        sharesOutstanding,
        source: dailyPrice.source,
        rawJson: JSON.stringify({
          ...(parseJson(marketSnapshot.rawJson, {}) ?? {}),
          dailyPriceOverride: dailyPrice,
        }),
      },
    },
  };
}

export function getAnetValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, ANET_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getAnetHistoricalValuations({ scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION } = {}) {
  const events = getAnetReportingEvents();
  const runs = getAnetValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

export async function createAnetValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION, assumptions = {} } = {}) {
  const rawSnapshot = getAnetSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No ANET reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    ANET_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runAnetBackendValuation({
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
  const targetPrice3Y = selectedScenario?.targetPrice3Y ?? valuationResult.targetPrice3Y ?? (fairValue != null ? fairValue * 1.12 : null);
  const cumulativeDividends = selectedScenario?.cumulativeDividends ?? (currentPrice ? currentPrice * 0.006 * 3 : 0);
  const expectedShareholderCagr =
    currentPrice && targetPrice3Y
      ? ((targetPrice3Y + cumulativeDividends) / currentPrice) ** (1 / 3) - 1
      : null;
  const upsideDownside = currentPrice && fairValue ? fairValue / currentPrice - 1 : null;

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO valuation_runs (
      id, ticker, asOfDate, reportingEventId, scenario, modelVersion, assumptionSetId,
      currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
      probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson, warningsJson,
      dataSnapshotJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      TICKER,
      snapshot.asOfDate,
      snapshot.reportingEvent.id,
      scenario,
      modelVersion,
      assumptionSet?.id ?? null,
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
              id: "anet-daily-price-anchor",
              title: "ANET daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} adjusted close from ${dailyPrice.priceDate}.`,
              severity: dailyPrice.sourceType === "market_data_proxy" ? "medium" : "low",
            }]
          : [{
              id: "anet-missing-daily-price-anchor",
              title: "ANET daily price missing",
              detail: "No daily adjusted close was available at or before the event date; valuation used the snapshot market price if present.",
              severity: "medium",
            }]),
      ]),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? snapshot),
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    ANET_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getAnetValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillAnetValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = DEFAULT_MODEL_VERSION,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], ANET_BACKEND_DB_PATH);
  }
  const events = getAnetReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createAnetValuationRun({ eventId: event.id, scenario, modelVersion });
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
