import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getCegReportingEvents, getCegSnapshot } from "./cegSnapshotService.mjs";
import { CEG_BACKEND_DB_PATH } from "../../../../modules/ceg/db/schema.mjs";
import { CEG_BACKEND_MODEL_VERSION } from "../../../../modules/ceg/valuation/modelVersion.mjs";
import { runCegBackendValuation } from "../../../../modules/ceg/valuation/adapter.mjs";

const TICKER = "CEG";

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

function getAsOfDailyPrice(asOfDate) {
  return query(
    `SELECT priceDate, adjustedClose, close, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    CEG_BACKEND_DB_PATH,
  )[0] ?? null;
}

function applyDailyPriceToSnapshot(rawSnapshot) {
  const dailyPrice = getAsOfDailyPrice(rawSnapshot?.asOfDate);
  if (!dailyPrice) return { snapshot: rawSnapshot, dailyPrice: null };
  const latestFinancial = rawSnapshot.financialPeriods?.[rawSnapshot.financialPeriods.length - 1] ?? null;
  const shares = latestFinancial?.dilutedShares ?? rawSnapshot.marketSnapshot?.sharesOutstanding ?? null;
  const netDebt = latestFinancial?.netDebt ?? 0;
  return {
    dailyPrice,
    snapshot: {
      ...rawSnapshot,
      marketSnapshot: {
        ...(rawSnapshot.marketSnapshot ?? {}),
        ticker: TICKER,
        asOfDate: rawSnapshot.asOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: Number(dailyPrice.adjustedClose),
        previousClose: Number(dailyPrice.close),
        sharesOutstanding: shares,
        marketCap: shares ? Number(dailyPrice.adjustedClose) * shares : null,
        enterpriseValue: shares ? Number(dailyPrice.adjustedClose) * shares + netDebt : null,
        source: dailyPrice.source,
        rawJson: JSON.stringify({ dailyPriceOverride: dailyPrice }),
      },
    },
  };
}

export function getCegValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
  const clauses = ["ticker = ?"];
  const params = [TICKER];
  if (asOfDate) clauses.push("asOfDate = ?") && params.push(asOfDate);
  if (eventId) clauses.push("reportingEventId = ?") && params.push(eventId);
  if (scenario) clauses.push("scenario = ?") && params.push(scenario);
  if (modelVersion) clauses.push("modelVersion = ?") && params.push(modelVersion);
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, CEG_BACKEND_DB_PATH)
    .map((row) => normalizeValuationRun(row));
}

export function getCegHistoricalValuations({ scenario = "Base", modelVersion = CEG_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getCegReportingEvents();
  const runs = query(
    `SELECT id, ticker, asOfDate, reportingEventId, scenario, modelVersion, assumptionSetId,
            currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
            probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson, warningsJson, createdAt
     FROM valuation_runs
     WHERE ticker = ? AND scenario = ? AND modelVersion = ?
     ORDER BY createdAt DESC`,
    [TICKER, scenario, modelVersion],
    CEG_BACKEND_DB_PATH,
  ).map((row) => normalizeValuationRun(row, { includeSnapshot: false }));
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({ event, valuationRun: latestRunByEvent.get(event.id) ?? null }));
}

export async function createCegValuationRun({
  eventId,
  asOfDate,
  scenario = "Base",
  modelVersion = CEG_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const rawSnapshot = getCegSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) throw new Error("No CEG reporting event matched the supplied eventId/asOfDate.");
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    CEG_BACKEND_DB_PATH,
  )[0] ?? null;
  const valuationResult = await runCegBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    assumptions: { ...(parseJson(assumptionSet?.assumptionsJson, {}) ?? {}), ...assumptions },
  });
  const selected = valuationResult.fairValues?.[0] ?? {};
  const fairValue = valuationResult.recommendedFairValue ?? selected.fairValue ?? null;
  const currentPrice = dailyPrice ? Number(dailyPrice.adjustedClose) : valuationResult.currentPrice ?? null;
  const targetPrice3Y = selected.targetPrice3Y ?? (fairValue != null ? fairValue * 1.1 : null);
  const expectedShareholderCagr = currentPrice && targetPrice3Y ? ((targetPrice3Y + (selected.cumulativeDividends ?? 0)) / currentPrice) ** (1 / 3) - 1 : null;
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
        dailyPrice
          ? { id: "ceg-daily-price-anchor", severity: "low", title: "CEG daily price anchor", detail: `As-of price uses ${dailyPrice.source} close from ${dailyPrice.priceDate}.` }
          : { id: "ceg-missing-daily-price-anchor", severity: "medium", title: "CEG missing daily price anchor", detail: "No prior daily price bar was available for this reporting event." },
      ]),
      JSON.stringify({ ...snapshot, backendSnapshot: valuationResult.backendSnapshot ?? null, asOfPriceSource: dailyPrice ?? null, dataCutoff: snapshot.asOfDate }),
      createdAt,
    ],
    CEG_BACKEND_DB_PATH,
  );
  return { id, persisted: true, valuationRun: getCegValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0], valuationResult };
}

export async function backfillCegValuationRuns({ scenarios = ["Base"], modelVersion = CEG_BACKEND_MODEL_VERSION.version, replace = true } = {}) {
  if (replace) execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], CEG_BACKEND_DB_PATH);
  const events = getCegReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createCegValuationRun({ eventId: event.id, scenario, modelVersion });
        created.push({ eventId: event.id, eventDate: event.eventDate, scenario, valuationRunId: result.id, fairValue: result.valuationRun?.fairValue ?? null, currentPrice: result.valuationRun?.currentPrice ?? null });
      } catch (error) {
        failed.push({ eventId: event.id, scenario, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { ticker: TICKER, modelVersion, created, failed, status: failed.length ? "completed_with_errors" : "completed" };
}
