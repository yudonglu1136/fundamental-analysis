import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { defaultIsrgDbPath, getIsrgReportingEvents, getIsrgSnapshot } from "./isrgSnapshotService.mjs";
import { runIsrgBackendValuation } from "../../../../modules/isrg/valuation/adapter.mjs";
import { ISRG_BACKEND_MODEL_VERSION } from "../../../../modules/isrg/valuation/modelVersion.mjs";

const TICKER = "ISRG";

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
  try {
    const row = query(
      `SELECT priceDate, adjustedClose, close, source, sourceType, rawJson
       FROM daily_price_bars
       WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
       ORDER BY priceDate DESC
       LIMIT 1`,
      [TICKER, asOfDate],
      defaultIsrgDbPath,
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
  } catch {
    return null;
  }
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

export function getIsrgValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, defaultIsrgDbPath).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getIsrgHistoricalValuations({ scenario = "Base", modelVersion = ISRG_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getIsrgReportingEvents();
  const runs = getIsrgValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({ event, valuationRun: latestRunByEvent.get(event.id) ?? null }));
}

export async function createIsrgValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = ISRG_BACKEND_MODEL_VERSION.version, assumptions = {} } = {}) {
  const rawSnapshot = getIsrgSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) throw new Error("No ISRG reporting event matched the supplied eventId/asOfDate.");
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    defaultIsrgDbPath,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runIsrgBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions },
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? null;
  const fairValue = valuationResult.recommendedFairValue ?? valuationResult.blendedFairValue ?? selectedScenario?.fairValue ?? null;
  const currentPrice = dailyPrice?.currentPrice ?? valuationResult.currentPrice ?? null;
  const targetPrice3Y = valuationResult.targetPrice3Y ?? selectedScenario?.targetPrice3Y ?? null;
  const expectedShareholderCagr =
    currentPrice && targetPrice3Y
      ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1
      : valuationResult.expectedReturn3Y ?? selectedScenario?.expectedReturn3Y ?? null;
  const upsideDownside =
    currentPrice && fairValue
      ? fairValue / currentPrice - 1
      : valuationResult.upsideDownside ?? selectedScenario?.upsideDownside ?? null;
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
              id: "isrg-daily-price-anchor",
              title: "ISRG daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} price bar from ${dailyPrice.priceDate}${dailyPrice.sourceType === "market_data_unadjusted_close" ? "; adjustedClose mirrors close because this source does not provide adjusted close." : "."}`,
              severity: dailyPrice.sourceType === "market_data_unadjusted_close" ? "medium" : "low",
            }]
          : []),
      ]),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? snapshot),
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    defaultIsrgDbPath,
  );
  return {
    id,
    persisted: true,
    valuationRun: getIsrgValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillIsrgValuationRuns({ scenarios = ["Bear", "Base", "Bull"], modelVersion = ISRG_BACKEND_MODEL_VERSION.version, replace = true } = {}) {
  if (replace) execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], defaultIsrgDbPath);
  const events = getIsrgReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createIsrgValuationRun({ eventId: event.id, scenario, modelVersion });
        created.push({ eventId: event.id, eventDate: event.eventDate, scenario, valuationRunId: result.id, fairValue: result.valuationRun?.fairValue ?? null });
      } catch (error) {
        failed.push({ eventId: event.id, scenario, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { ticker: TICKER, modelVersion, scenarios, replace, created, failed, createdCount: created.length, failedCount: failed.length };
}
