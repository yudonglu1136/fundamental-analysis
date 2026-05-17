import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getAmznReportingEvents, getAmznSnapshot } from "./amznSnapshotService.mjs";
import { AMZN_BACKEND_DB_PATH } from "../../../../modules/amzn/db/schema.mjs";
import { runAmznBackendValuation } from "../../../../modules/amzn/valuation/adapter.mjs";
import { AMZN_BACKEND_MODEL_VERSION } from "../../../../modules/amzn/valuation/modelVersion.mjs";

const TICKER = "AMZN";
const DEFAULT_MODEL_VERSION = AMZN_BACKEND_MODEL_VERSION.version;

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
    AMZN_BACKEND_DB_PATH,
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
  const latestFinancial = [...(snapshot.financialPeriods ?? [])].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate)).at(-1);
  const sharesOutstanding = latestFinancial?.dilutedShares ?? marketSnapshot.sharesOutstanding ?? null;
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
        enterpriseValue: sharesOutstanding && latestFinancial?.netDebt != null ? dailyPrice.currentPrice * sharesOutstanding + latestFinancial.netDebt : marketSnapshot.enterpriseValue ?? null,
        sharesOutstanding,
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

export function getAmznValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, AMZN_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getAmznHistoricalValuations({ scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION } = {}) {
  const events = getAmznReportingEvents();
  const runs = getAmznValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

export async function createAmznValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = DEFAULT_MODEL_VERSION, assumptions = {} } = {}) {
  const rawSnapshot = getAmznSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No AMZN reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    AMZN_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runAmznBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions, currentPrice: dailyPrice?.currentPrice ?? baseAssumptions.currentPrice },
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? null;
  const fairValue =
    valuationResult.recommendedFairValue ??
    valuationResult.blendedFairValue ??
    selectedScenario?.fairValue ??
    null;
  const currentPrice = dailyPrice?.currentPrice ?? valuationResult.currentPrice ?? null;
  const targetPrice3Y = selectedScenario?.targetPrice3Y ?? valuationResult.targetPrice3Y ?? (fairValue != null ? fairValue * 1.12 : null);
  const expectedShareholderCagr = currentPrice && targetPrice3Y ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1 : null;
  const upsideDownside = currentPrice && fairValue ? fairValue / currentPrice - 1 : null;
  const priceWarning = dailyPrice
    ? {
        id: "amzn-daily-price-anchor",
        title: "AMZN daily price anchor",
        detail: `As-of price uses ${dailyPrice.source} from ${dailyPrice.priceDate}.`,
        severity: dailyPrice.sourceType?.includes("unadjusted") || dailyPrice.sourceType?.includes("proxy") ? "medium" : "low",
      }
    : {
        id: "amzn-missing-daily-price-anchor",
        title: "Missing AMZN daily price anchor",
        detail: "No daily_price_bars row was available on or before the event date; valuation price may be unavailable.",
        severity: "high",
      };

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
        priceWarning,
      ]),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? {}),
        asOfPriceSource: dailyPrice ?? null,
      }),
      createdAt,
    ],
    AMZN_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getAmznValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillAmznValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = DEFAULT_MODEL_VERSION,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], AMZN_BACKEND_DB_PATH);
  }
  const events = getAmznReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createAmznValuationRun({ eventId: event.id, scenario, modelVersion });
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
