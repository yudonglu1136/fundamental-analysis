import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getMetaReportingEvents, getMetaSnapshot } from "./metaSnapshotService.mjs";
import { META_BACKEND_DB_PATH } from "../../../../modules/meta/db/schema.mjs";
import { META_BACKEND_MODEL_VERSION } from "../../../../modules/meta/valuation/modelVersion.mjs";
import { runMetaBackendValuation } from "../../../../modules/meta/valuation/adapter.mjs";

const TICKER = "META";
const DEFAULT_MODEL_VERSION = META_BACKEND_MODEL_VERSION.version;

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    META_BACKEND_DB_PATH,
  )[0] ?? null;
  const adjustedClose = finiteNumber(row?.adjustedClose);
  if (!row || adjustedClose == null) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: adjustedClose,
    close: finiteNumber(row.close),
    source: row.source,
    sourceType: row.sourceType,
  };
}

function applyDailyPriceToSnapshot(snapshot) {
  const dailyPrice = getAsOfDailyPrice(snapshot?.asOfDate);
  if (!dailyPrice) return { snapshot, dailyPrice: null };
  const marketSnapshot = snapshot.marketSnapshot ?? {};
  const sharesOutstanding = finiteNumber(marketSnapshot.sharesOutstanding);
  const netCash = finiteNumber(marketSnapshot.netCash);
  return {
    dailyPrice,
    snapshot: {
      ...snapshot,
      marketSnapshot: {
        ...marketSnapshot,
        id: marketSnapshot.id ?? `meta-daily-price-${snapshot.asOfDate}`,
        ticker: TICKER,
        asOfDate: snapshot.asOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        previousClose: dailyPrice.close,
        marketCap: sharesOutstanding != null ? dailyPrice.currentPrice * sharesOutstanding : marketSnapshot.marketCap ?? null,
        enterpriseValue: sharesOutstanding != null && netCash != null ? dailyPrice.currentPrice * sharesOutstanding - netCash : marketSnapshot.enterpriseValue ?? null,
        source: dailyPrice.source,
        sourceType: dailyPrice.sourceType,
        rawJson: JSON.stringify({
          ...(parseJson(marketSnapshot.rawJson, {}) ?? {}),
          dailyPriceOverride: dailyPrice,
        }),
      },
    },
  };
}

export function getMetaValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, META_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getMetaHistoricalValuations({ scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION } = {}) {
  const events = getMetaReportingEvents();
  const runs = getMetaValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

export async function createMetaValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION, assumptions = {} } = {}) {
  const rawSnapshot = getMetaSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No META reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    META_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const snapshotPrice = finiteNumber(snapshot.marketSnapshot?.currentPrice);
  const valuationAssumptions = {
    ...baseAssumptions,
    ...(snapshotPrice != null ? { currentPrice: snapshotPrice } : {}),
    ...assumptions,
  };
  const valuationResult = await runMetaBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    assumptions: valuationAssumptions,
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? valuationResult.selectedScenario ?? null;
  const fairValue =
    valuationResult.recommendedFairValue ??
    valuationResult.blendedFairValue ??
    selectedScenario?.fairValue ??
    null;
  const currentPrice = dailyPrice?.currentPrice ?? valuationResult.currentPrice ?? snapshotPrice ?? null;
  const targetPrice3Y =
    selectedScenario?.targetPrice3Y ??
    valuationResult.targetPrice3Y ??
    (fairValue != null ? fairValue * 1.1 : null);
  const expectedShareholderCagr =
    selectedScenario?.expectedReturn3Y ??
    valuationResult.expectedReturn3Y ??
    (currentPrice && targetPrice3Y ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1 : null);
  const upsideDownside = currentPrice && fairValue ? fairValue / currentPrice - 1 : null;

  const warnings = [
    ...(valuationResult.validationWarnings ?? []),
    ...(dailyPrice
      ? [{
          id: "meta-daily-price-anchor",
          title: "META daily price anchor",
          detail: `As-of price uses ${dailyPrice.source} from ${dailyPrice.priceDate}. Source type: ${dailyPrice.sourceType}.`,
          severity: dailyPrice.sourceType === "market_data_adjusted" ? "low" : "medium",
        }]
      : [{
          id: "meta-missing-daily-price-anchor",
          title: "META daily price anchor unavailable",
          detail: "As-of price falls back to the market snapshot row because no daily price bar was available on or before the reporting event date.",
          severity: "medium",
        }]),
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
      JSON.stringify(warnings),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? {}),
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    META_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getMetaValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillMetaValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = DEFAULT_MODEL_VERSION,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], META_BACKEND_DB_PATH);
  }
  const events = getMetaReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createMetaValuationRun({ eventId: event.id, scenario, modelVersion });
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
