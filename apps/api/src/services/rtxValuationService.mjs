import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getRtxReportingEvents, getRtxSnapshot } from "./rtxSnapshotService.mjs";
import { RTX_BACKEND_DB_PATH } from "../../../../modules/rtx/db/schema.mjs";
import { RTX_BACKEND_MODEL_VERSION } from "../../../../modules/rtx/valuation/modelVersion.mjs";
import { runRtxBackendValuation } from "../../../../modules/rtx/valuation/adapter.mjs";

const TICKER = "RTX";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed);
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
    RTX_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !isFiniteNumber(row.adjustedClose)) return null;
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
        id: marketSnapshot.id ?? `rtx-daily-price-${snapshot.asOfDate}`,
        ticker: TICKER,
        asOfDate: snapshot.asOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        previousClose: dailyPrice.close,
        marketCap: sharesOutstanding ? dailyPrice.currentPrice * sharesOutstanding : marketSnapshot.marketCap ?? null,
        enterpriseValue: sharesOutstanding && marketSnapshot.enterpriseValue
          ? dailyPrice.currentPrice * sharesOutstanding + (marketSnapshot.enterpriseValue - marketSnapshot.marketCap)
          : marketSnapshot.enterpriseValue ?? null,
        source: dailyPrice.source,
        sourceType: "market_data",
        rawJson: JSON.stringify({
          ...(parseJson(marketSnapshot.rawJson, {}) ?? {}),
          dailyPriceOverride: dailyPrice,
        }),
      },
    },
  };
}

function parseValuationRun(row) {
  return row ? {
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  } : row;
}

export function getRtxValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(
    `SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`,
    params,
    RTX_BACKEND_DB_PATH,
  ).map(parseValuationRun);
}

export function getRtxHistoricalValuations({ scenario = "Base", modelVersion = RTX_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getRtxReportingEvents();
  const runs = getRtxValuationRuns({ scenario, modelVersion });
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
  return getRtxValuationRuns({ eventId, scenario, modelVersion })[0] ?? null;
}

export async function createRtxValuationRun({
  eventId,
  asOfDate,
  scenario = "Base",
  modelVersion = RTX_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const rawSnapshot = getRtxSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No RTX reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    `SELECT *
     FROM assumption_sets
     WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ?
     ORDER BY asOfDate DESC, id DESC
     LIMIT 1`,
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    RTX_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runRtxBackendValuation({
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
  const currentPrice = valuationResult.currentPrice ?? dailyPrice?.currentPrice ?? null;
  const targetPrice3Y = valuationResult.targetPrice3Y ?? selectedScenario?.targetPrice3Y ?? (fairValue != null ? fairValue * 1.08 : null);
  const expectedShareholderCagr =
    valuationResult.expectedShareholderCagr ??
    valuationResult.expectedReturn3Y ??
    selectedScenario?.expectedReturn3Y ??
    null;
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
      valuationResult.probabilityWeightedFairValue ?? fairValue,
      JSON.stringify(valuationResult.methodCards ?? []),
      JSON.stringify(valuationResult.sensitivityTables ?? []),
      JSON.stringify([
        ...(valuationResult.validationWarnings ?? []),
        ...(dailyPrice
          ? [{
              id: "rtx-daily-price-anchor",
              title: "RTX daily adjusted price anchor",
              detail: `As-of price uses ${dailyPrice.source} from ${dailyPrice.priceDate}.`,
              severity: "low",
            }]
          : [{
              id: "rtx-daily-price-missing",
              title: "RTX daily price anchor unavailable",
              detail: "As-of price fell back to the event market snapshot because no daily price bar was available on or before the event date.",
              severity: "medium",
            }]),
      ]),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? {}),
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    RTX_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: latestValuationRunForEvent(snapshot.reportingEvent.id, scenario, modelVersion),
    valuationResult,
  };
}

export async function backfillRtxValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = RTX_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], RTX_BACKEND_DB_PATH);
  }
  const events = getRtxReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.id.localeCompare(right.id));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createRtxValuationRun({ eventId: event.id, scenario, modelVersion });
        created.push({
          eventId: event.id,
          eventDate: event.eventDate,
          fiscalPeriod: event.fiscalPeriod,
          scenario,
          valuationRunId: result.valuationRun?.id ?? result.id,
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
    eventCount: events.length,
    created,
    failed,
    createdCount: created.length,
    failedCount: failed.length,
  };
}
