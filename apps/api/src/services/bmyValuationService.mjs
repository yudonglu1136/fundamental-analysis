import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { BMY_BACKEND_DB_PATH } from "../../../../modules/bmy/db/schema.mjs";
import { BMY_BACKEND_MODEL_VERSION } from "../../../../modules/bmy/valuation/modelVersion.mjs";
import { runBmyBackendValuation } from "../../../../modules/bmy/valuation/adapter.mjs";
import { getBmyReportingEvents, getBmySnapshot } from "./bmySnapshotService.mjs";

const TICKER = "BMY";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
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
  return query(
    `SELECT id, ticker, priceDate, close, adjustedClose, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND (adjustedClose IS NOT NULL OR close IS NOT NULL)
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    BMY_BACKEND_DB_PATH,
  )[0] ?? null;
}

function marketSnapshotWithDailyPrice(snapshot, dailyPriceBar) {
  if (!dailyPriceBar) return snapshot;
  const adjustedClose = finiteNumber(dailyPriceBar.adjustedClose);
  const close = finiteNumber(dailyPriceBar.close);
  const price = adjustedClose ?? close;
  if (price == null) return snapshot;
  const marketSnapshot = snapshot.marketSnapshot ?? {};
  const latestFinancial = [...(snapshot.financialPeriods ?? [])]
    .filter((row) => row.asOfDate <= snapshot.asOfDate)
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate))).at(-1);
  const sharesOutstanding = finiteNumber(marketSnapshot.sharesOutstanding) ?? finiteNumber(latestFinancial?.dilutedShares);
  const marketCap = sharesOutstanding != null ? price * sharesOutstanding : finiteNumber(marketSnapshot.marketCap);
  const netDebt = finiteNumber(latestFinancial?.netDebt);
  return {
    ...snapshot,
    dailyPriceBar,
    asOfPriceSource: {
      table: "daily_price_bars",
      rowId: dailyPriceBar.id,
      priceDate: dailyPriceBar.priceDate,
      source: dailyPriceBar.source,
      sourceType: dailyPriceBar.sourceType,
      adjustedCloseUsed: adjustedClose != null,
      closeUsedAsFallback: adjustedClose == null && close != null,
    },
    marketSnapshot: {
      ...marketSnapshot,
      id: marketSnapshot.id ?? `bmy-daily-market-${snapshot.asOfDate}`,
      ticker: TICKER,
      asOfDate: snapshot.asOfDate,
      currentPrice: price,
      priceDate: dailyPriceBar.priceDate,
      previousClose: close,
      sharesOutstanding,
      marketCap,
      enterpriseValue: marketCap != null && netDebt != null ? marketCap + netDebt : finiteNumber(marketSnapshot.enterpriseValue),
      source: `${marketSnapshot.source ?? "event market snapshot"}; ${dailyPriceBar.source ?? "daily_price_bars"}`,
      rawJson: JSON.stringify({ dailyPriceBar, marketSnapshot }),
    },
  };
}

export function getBmyValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, BMY_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getBmyHistoricalValuations({ scenario = "Base", modelVersion = BMY_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getBmyReportingEvents();
  const runs = getBmyValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

function getAssumptionSet({ eventId, scenario, modelVersion, asOfDate }) {
  return query(
    `SELECT * FROM assumption_sets
     WHERE ticker = ?
       AND scenario = ?
       AND modelVersion = ?
       AND (reportingEventId = ? OR asOfDate <= ?)
     ORDER BY CASE WHEN reportingEventId = ? THEN 0 ELSE 1 END, asOfDate DESC
     LIMIT 1`,
    [TICKER, scenario, modelVersion, eventId, asOfDate, eventId],
    BMY_BACKEND_DB_PATH,
  )[0] ?? null;
}

export async function createBmyValuationRun({
  eventId,
  asOfDate,
  scenario = "Base",
  modelVersion = BMY_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const baseSnapshot = getBmySnapshot({ eventId, asOfDate });
  if (!baseSnapshot.reportingEvent) {
    throw new Error("No BMY reporting event matched the supplied eventId/asOfDate.");
  }
  const snapshot = marketSnapshotWithDailyPrice(baseSnapshot, getAsOfDailyPrice(baseSnapshot.asOfDate));
  const assumptionSet = getAssumptionSet({
    eventId: snapshot.reportingEvent.id,
    scenario,
    modelVersion,
    asOfDate: snapshot.asOfDate,
  });
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runBmyBackendValuation({
    snapshot: {
      ...snapshot,
      assumptionSet: assumptionSet ? { ...assumptionSet, assumptionsJson: baseAssumptions } : null,
    },
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions },
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? null;
  const fairValue = valuationResult.recommendedFairValue ?? selectedScenario?.fairValue ?? null;
  const currentPrice = valuationResult.currentPrice ?? snapshot.marketSnapshot?.currentPrice ?? null;
  const targetPrice3Y = valuationResult.targetPrice3Y ?? selectedScenario?.fairValue ?? fairValue;
  const expectedShareholderCagr = valuationResult.expectedReturn3Y ?? selectedScenario?.expectedReturn3Y ?? (
    currentPrice && targetPrice3Y ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1 : null
  );
  const upsideDownside = valuationResult.upsideDownside ?? (currentPrice && fairValue ? fairValue / currentPrice - 1 : null);

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
        ...(snapshot.asOfPriceSource
          ? [{
              id: "bmy-daily-price-anchor",
              title: "BMY daily price anchor",
              detail: `As-of price uses ${snapshot.asOfPriceSource.source} from ${snapshot.asOfPriceSource.priceDate}.`,
              severity: "low",
            }]
          : [{
              id: "bmy-missing-daily-price-anchor",
              title: "BMY daily price anchor missing",
              detail: "No daily price bar was available on or before the reporting event; market snapshot fallback was used if present.",
              severity: "medium",
            }]),
      ]),
      JSON.stringify(valuationResult.backendSnapshot ?? {}),
      createdAt,
    ],
    BMY_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getBmyValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillBmyValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = BMY_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], BMY_BACKEND_DB_PATH);
  }
  const events = getBmyReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createBmyValuationRun({ eventId: event.id, scenario, modelVersion });
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
