import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { MCK_BACKEND_DB_PATH } from "../../../../modules/mck/db/schema.mjs";
import { MCK_BACKEND_MODEL_VERSION } from "../../../../modules/mck/valuation/modelVersion.mjs";
import { runMckBackendValuation } from "../../../../modules/mck/valuation/adapter.mjs";
import { getMckReportingEvents, getMckSnapshot } from "./mckSnapshotService.mjs";

const TICKER = "MCK";

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
    MCK_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row || !Number.isFinite(Number(row.adjustedClose))) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: Number(row.adjustedClose),
    close: Number(row.close),
    source: row.source,
    sourceType: row.sourceType,
    adjustedCloseAvailable: row.sourceType !== "market_data_unadjusted_close",
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
        id: marketSnapshot.id ?? `mck-daily-price-${snapshot.asOfDate}`,
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

export function getMckValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, MCK_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getMckHistoricalValuations({ scenario = "Base", modelVersion = MCK_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getMckReportingEvents();
  const runs = getMckValuationRuns({ scenario, modelVersion });
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

export async function createMckValuationRun({
  eventId,
  asOfDate,
  scenario = "Base",
  modelVersion = MCK_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const snapshot = getMckSnapshot({ eventId, asOfDate });
  if (!snapshot.reportingEvent) {
    throw new Error("No MCK reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot: pricedSnapshot, dailyPrice } = applyDailyPriceToSnapshot(snapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, pricedSnapshot.asOfDate],
    MCK_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runMckBackendValuation({
    snapshot: pricedSnapshot,
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions },
  });
  const currentPrice = dailyPrice?.currentPrice ?? valuationResult.currentPrice ?? null;
  const fairValue = valuationResult.recommendedFairValue ?? valuationResult.blendedFairValue ?? null;
  const upsideDownside = currentPrice && fairValue ? fairValue / currentPrice - 1 : valuationResult.upsideDownside ?? null;
  const warnings = [
    ...(valuationResult.validationWarnings ?? []),
    ...(dailyPrice
      ? [{
          id: "mck-daily-price-anchor",
          title: "MCK daily price anchor",
          detail: `As-of price uses ${dailyPrice.source} ${dailyPrice.adjustedCloseAvailable ? "adjusted close" : "close-as-adjusted proxy"} from ${dailyPrice.priceDate}.`,
          severity: dailyPrice.adjustedCloseAvailable ? "low" : "medium",
        }]
      : []),
  ];

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
      pricedSnapshot.asOfDate,
      pricedSnapshot.reportingEvent.id,
      scenario,
      modelVersion,
      assumptionSet?.id ?? null,
      currentPrice,
      fairValue,
      valuationResult.targetPrice3Y ?? null,
      valuationResult.expectedReturn3Y ?? null,
      upsideDownside,
      valuationResult.probabilityWeightedFairValue ?? null,
      JSON.stringify(valuationResult.methodCards ?? []),
      JSON.stringify(valuationResult.sensitivityTables ?? []),
      JSON.stringify(warnings),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? pricedSnapshot),
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    MCK_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getMckValuationRuns({ eventId: pricedSnapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillMckValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = MCK_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], MCK_BACKEND_DB_PATH);
  }
  const events = getMckReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createMckValuationRun({ eventId: event.id, scenario, modelVersion });
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
