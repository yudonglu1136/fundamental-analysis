import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { NOC_BACKEND_DB_PATH } from "../../../../modules/noc/db/schema.mjs";
import { NOC_BACKEND_MODEL_VERSION } from "../../../../modules/noc/valuation/modelVersion.mjs";
import { runNocBackendValuation } from "../../../../modules/noc/valuation/adapter.mjs";
import { getNocReportingEvents, getNocSnapshot } from "./nocSnapshotService.mjs";

const TICKER = "NOC";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value) {
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
    NOC_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !finite(row.adjustedClose)) return null;
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
  const sharesOutstandingM = marketSnapshot.sharesOutstandingM ?? null;
  return {
    dailyPrice,
    snapshot: {
      ...snapshot,
      marketSnapshot: {
        ...marketSnapshot,
        id: marketSnapshot.id ?? `noc-daily-price-${snapshot.asOfDate}`,
        ticker: TICKER,
        asOfDate: snapshot.asOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        marketCapUsdM: sharesOutstandingM ? dailyPrice.currentPrice * sharesOutstandingM : marketSnapshot.marketCapUsdM ?? null,
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

export function getNocValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
    NOC_BACKEND_DB_PATH,
  ).map(parseValuationRun);
}

export function getNocHistoricalValuations({ scenario = "Base", modelVersion = NOC_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getNocReportingEvents();
  const runs = getNocValuationRuns({ scenario, modelVersion });
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
  return getNocValuationRuns({ eventId, scenario, modelVersion })[0] ?? null;
}

export async function createNocValuationRun({
  eventId,
  asOfDate,
  scenario = "Base",
  modelVersion = NOC_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const rawSnapshot = getNocSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No NOC reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    `SELECT *
     FROM assumption_sets
     WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ?
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    NOC_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runNocBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions, assumptionSetId: assumptionSet?.id ?? null },
  });
  const fairValue =
    valuationResult.recommendedFairValue ??
    valuationResult.blendedFairValue ??
    valuationResult.valuationRangeBase ??
    null;
  const currentPrice = valuationResult.currentPrice ?? null;
  const targetPrice3Y = valuationResult.targetPrice3Y ?? (fairValue != null ? fairValue * 1.08 : null);
  const expectedShareholderCagr = valuationResult.expectedShareholderCagr ?? valuationResult.expectedReturn3Y ?? null;
  const upsideDownside =
    valuationResult.upsideDownside ??
    (currentPrice && fairValue ? fairValue / currentPrice - 1 : null);
  const backendSnapshot = valuationResult.backendSnapshot ?? {};
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO valuation_runs (
      id, ticker, asOfDate, reportingEventId, fiscalPeriod, scenario, modelVersion, assumptionSetId,
      valuationPeriodId, marketSnapshotId, guidanceSourceId, currentPrice, fairValue,
      targetPrice3Y, expectedShareholderCagr, upsideDownside, probabilityWeightedFairValue,
      methodOutputsJson, sensitivityTablesJson, warningsJson, dataSnapshotJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              id: "noc-daily-price-anchor",
              title: "NOC daily adjusted price anchor",
              detail: `As-of price uses ${dailyPrice.source} adjusted close from ${dailyPrice.priceDate}.`,
              severity: "low",
            }]
          : [{
              id: "noc-daily-price-missing",
              title: "NOC daily price anchor unavailable",
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
    NOC_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: latestValuationRunForEvent(snapshot.reportingEvent.id, scenario, modelVersion),
    valuationResult,
  };
}

export async function backfillNocValuationRuns({
  scenarios = ["Base"],
  modelVersion = NOC_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], NOC_BACKEND_DB_PATH);
  }
  const events = getNocReportingEvents();
  const created = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      const result = await createNocValuationRun({ eventId: event.id, scenario, modelVersion });
      created.push({
        eventId: event.id,
        fiscalPeriod: event.fiscalPeriod,
        scenario,
        valuationRunId: result.valuationRun?.id ?? result.id,
        fairValue: result.valuationRun?.fairValue ?? null,
        currentPrice: result.valuationRun?.currentPrice ?? null,
      });
    }
  }
  return {
    ticker: TICKER,
    modelVersion,
    scenarios,
    eventCount: events.length,
    createdCount: created.length,
    created,
  };
}
