import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getMsftReportingEvents, getMsftSnapshot } from "./msftSnapshotService.mjs";
import { MSFT_BACKEND_DB_PATH } from "../../../../modules/msft/db/schema.mjs";
import { runMsftBackendValuation } from "../../../../modules/msft/valuation/adapter.mjs";

const TICKER = "MSFT";

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
    `SELECT priceDate, adjustedClose, close, source
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    MSFT_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !Number.isFinite(Number(row.adjustedClose))) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: Number(row.adjustedClose),
    close: Number(row.close),
    source: row.source,
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
        previousClose: dailyPrice.close,
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

export function getMsftValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, MSFT_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getMsftHistoricalValuations({ scenario = "Base", modelVersion = "msft_v1_backend_pilot" } = {}) {
  const events = getMsftReportingEvents();
  const runs = getMsftValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

export async function createMsftValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = "msft_v1_backend_pilot", assumptions = {} } = {}) {
  const rawSnapshot = getMsftSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No MSFT reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    MSFT_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runMsftBackendValuation({
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
  const asOfOverrides = valuationResult.backendSnapshot?.asOfAssumptionOverrides ?? {};
  const growthBridge =
    1 +
    (typeof asOfOverrides.baseSoftwareGrowth === "number" ? asOfOverrides.baseSoftwareGrowth : 0.10) * 0.35 +
    (typeof asOfOverrides.azureGrowth === "number" ? asOfOverrides.azureGrowth : 0.25) * 0.25;
  const targetPrice3Y = Number.isFinite(selectedScenario?.targetPrice3Y)
    ? Math.min(selectedScenario.targetPrice3Y, (fairValue ?? 0) * Math.max(growthBridge, 1.02) * 1.20)
    : fairValue != null
      ? fairValue * Math.max(growthBridge, 1.02)
      : null;
  const cumulativeDividends = typeof valuationResult.assumptions?.dividendPerShare === "number" ? valuationResult.assumptions.dividendPerShare * 3 : 9.96;
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
              id: "msft-daily-price-anchor",
              title: "MSFT daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} adjusted close from ${dailyPrice.priceDate}.`,
              severity: "low",
            }]
          : []),
      ]),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? snapshot),
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    MSFT_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getMsftValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillMsftValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = "msft_v1_backend_pilot",
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], MSFT_BACKEND_DB_PATH);
  }
  const events = getMsftReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createMsftValuationRun({ eventId: event.id, scenario, modelVersion });
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
