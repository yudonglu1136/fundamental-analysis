import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getLsegReportingEvents, getLsegSnapshot } from "./lsegSnapshotService.mjs";
import { runLsegBackendValuation } from "../../../../modules/lseg/valuation/adapter.mjs";

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
     WHERE ticker = ? AND priceDate <= ? AND (adjustedClose IS NOT NULL OR close IS NOT NULL)
     ORDER BY priceDate DESC
     LIMIT 1`,
    ["LSEG.L", asOfDate],
  )[0] ?? null;
  const selectedPrice = Number(row?.adjustedClose ?? row?.close);
  if (!row || !Number.isFinite(selectedPrice)) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: selectedPrice,
    close: Number(row.close),
    source: row.source,
    usesAdjustedClose: row.adjustedClose != null,
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
        ticker: "LSEG.L",
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

export function getLsegValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
  const clauses = ["ticker = ?"];
  const params = ["LSEG.L"];
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getLsegHistoricalValuations({ scenario = "Base", modelVersion = "lseg_v1_backend_pilot" } = {}) {
  const events = getLsegReportingEvents();
  const runs = getLsegValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) {
      latestRunByEvent.set(run.reportingEventId, run);
    }
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

export async function createLsegValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = "lseg_v1_backend_pilot", assumptions = {} } = {}) {
  const rawSnapshot = getLsegSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No LSEG reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    ["LSEG.L", scenario, modelVersion, snapshot.asOfDate],
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runLsegBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions },
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? null;
  const fairValue = valuationResult.recommendedFairValue ?? valuationResult.blendedFairValue ?? selectedScenario?.fairValue ?? null;
  const currentPrice = dailyPrice?.currentPrice ?? valuationResult.currentPrice ?? null;
  const targetPrice3Y = valuationResult.targetPrice3Y ?? selectedScenario?.targetPrice3Y ?? null;
  const expectedShareholderCagr = valuationResult.expectedReturn3Y ?? selectedScenario?.expectedReturn3Y ?? null;
  const upsideDownside = currentPrice && fairValue ? fairValue / currentPrice - 1 : valuationResult.upsideDownside ?? null;

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
      "LSEG.L",
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
              id: "lseg-daily-price-anchor",
              title: "LSEG daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} ${dailyPrice.usesAdjustedClose ? "adjusted close" : "close"} from ${dailyPrice.priceDate}.`,
              severity: dailyPrice.usesAdjustedClose ? "low" : "medium",
            }]
          : [{
              id: "lseg-price-proxy",
              title: "LSEG price proxy",
              detail: "No daily price bar was available on or before the event date, so the valuation used the closest market snapshot/proxy price.",
              severity: "medium",
            }]),
      ]),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? snapshot),
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
  );

  return {
    id,
    persisted: true,
    valuationRun: getLsegValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult: {
      ...valuationResult,
      currentPrice,
      upsideDownside,
    },
  };
}

export async function backfillLsegValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = "lseg_v1_backend_pilot",
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", ["LSEG.L", modelVersion]);
  }
  const events = getLsegReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createLsegValuationRun({ eventId: event.id, scenario, modelVersion });
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
        failed.push({
          eventId: event.id,
          scenario,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return {
    ticker: "LSEG.L",
    modelVersion,
    scenarios,
    replace,
    created,
    failed,
    createdCount: created.length,
    failedCount: failed.length,
  };
}
