import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getTriReportingEvents, getTriSnapshot } from "./triSnapshotService.mjs";
import { TRI_BACKEND_DB_PATH } from "../../../../modules/tri/db/schema.mjs";
import { TRI_BACKEND_MODEL_VERSION } from "../../../../modules/tri/valuation/modelVersion.mjs";
import { runTriBackendValuation } from "../../../../modules/tri/valuation/adapter.mjs";

const TICKER = "TRI";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeValuationRun(row, { includeSnapshot = true } = {}) {
  if (!row) return null;
  return {
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    ...(includeSnapshot ? { dataSnapshotJson: parseJson(row.dataSnapshotJson, {}) } : {}),
  };
}

function getTriValuationRunById(id, { includeSnapshot = true } = {}) {
  const row = query("SELECT * FROM valuation_runs WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, id], TRI_BACKEND_DB_PATH)[0] ?? null;
  return normalizeValuationRun(row, { includeSnapshot });
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
    TRI_BACKEND_DB_PATH,
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
  const latestFinancial = snapshot.financialPeriods?.[snapshot.financialPeriods.length - 1] ?? null;
  const sharesOutstanding = marketSnapshot.sharesOutstanding ?? latestFinancial?.dilutedShares ?? null;
  const netDebt = latestFinancial?.netDebt ?? 0;
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
        previousClose: dailyPrice.close,
        marketCap: sharesOutstanding ? dailyPrice.currentPrice * sharesOutstanding : marketSnapshot.marketCap ?? null,
        enterpriseValue: sharesOutstanding ? dailyPrice.currentPrice * sharesOutstanding + netDebt : marketSnapshot.enterpriseValue ?? null,
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

export function getTriValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, TRI_BACKEND_DB_PATH)
    .map((row) => normalizeValuationRun(row));
}

export function getTriHistoricalValuations({ scenario = "Base", modelVersion = TRI_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getTriReportingEvents();
  const runs = query(
    `SELECT id, ticker, asOfDate, reportingEventId, scenario, modelVersion, assumptionSetId,
            currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
            probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson, warningsJson, createdAt
     FROM valuation_runs
     WHERE ticker = ? AND scenario = ? AND modelVersion = ?
     ORDER BY createdAt DESC`,
    [TICKER, scenario, modelVersion],
    TRI_BACKEND_DB_PATH,
  ).map((row) => normalizeValuationRun(row, { includeSnapshot: false }));
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

export async function createTriValuationRun({
  eventId,
  asOfDate,
  scenario = "Base",
  modelVersion = TRI_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const rawSnapshot = getTriSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No TRI reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    TRI_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runTriBackendValuation({
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
  const targetPrice3Y = selectedScenario?.targetPrice3Y ?? (fairValue != null ? fairValue * 1.10 : null);
  const cumulativeDividends = selectedScenario?.cumulativeDividends ?? (valuationResult.expectedReturnBridge ?? []).find((row) => row.key === "dividends")?.value ?? 0;
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
              id: "tri-daily-price-anchor",
              title: "TRI daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} adjusted close from ${dailyPrice.priceDate}.`,
              severity: "low",
            }]
          : [{
              id: "tri-market-proxy-price",
              title: "TRI proxy price anchor",
              detail: "No daily price bar was available, so the valuation used the market snapshot row. Import daily prices for event-accurate backtests.",
              severity: "medium",
            }]),
      ]),
      JSON.stringify({
        ...snapshot,
        backendSnapshot: valuationResult.backendSnapshot ?? null,
        asOfPriceSource: dailyPrice ?? null,
        dataCutoff: snapshot.asOfDate,
      }),
      createdAt,
    ],
    TRI_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getTriValuationRunById(id),
    valuationResult,
  };
}

export async function backfillTriValuationRuns({
  scenarios = ["Base"],
  modelVersion = TRI_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], TRI_BACKEND_DB_PATH);
  }
  const events = getTriReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createTriValuationRun({ eventId: event.id, scenario, modelVersion });
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
