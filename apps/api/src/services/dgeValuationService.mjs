import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getDgeReportingEvents, getDgeSnapshot } from "./dgeSnapshotService.mjs";
import { DGE_BACKEND_DB_PATH } from "../../../../modules/dge/db/schema.mjs";
import { runDgeBackendValuation } from "../../../../modules/dge/valuation/adapter.mjs";
import { DGE_BACKEND_MODEL_VERSION } from "../../../../modules/dge/valuation/modelVersion.mjs";

const TICKER = "DGE.L";

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
     WHERE ticker = ?
       AND priceDate <= ?
       AND (adjustedClose IS NOT NULL OR close IS NOT NULL)
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    DGE_BACKEND_DB_PATH,
  )[0] ?? null;
  const valueGbx = finiteNumber(row?.adjustedClose) ?? finiteNumber(row?.close);
  if (!row || valueGbx == null || valueGbx <= 0) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: valueGbx / 100,
    closeGbx: finiteNumber(row.close),
    adjustedCloseGbx: finiteNumber(row.adjustedClose),
    source: row.source,
    sourceType: row.sourceType,
    unitNote: "DGE.L daily price bars are stored in GBp; backend valuation converts to GBP per ordinary share.",
  };
}

function applyDailyPriceToSnapshot(snapshot) {
  const dailyPrice = getAsOfDailyPrice(snapshot?.asOfDate);
  if (!dailyPrice) return { snapshot, dailyPrice: null };
  const marketSnapshot = snapshot.marketSnapshot ?? {};
  const sharesOutstanding = finiteNumber(marketSnapshot.sharesOutstanding);
  const netDebtUsd = finiteNumber(marketSnapshot.netDebt);
  const gbpUsd = 1.35232;
  const marketCapGbp = sharesOutstanding ? dailyPrice.currentPrice * sharesOutstanding : finiteNumber(marketSnapshot.marketCap);
  return {
    dailyPrice,
    snapshot: {
      ...snapshot,
      marketSnapshot: {
        ...marketSnapshot,
        id: marketSnapshot.id ?? `dge-daily-price-${snapshot.asOfDate}`,
        ticker: TICKER,
        asOfDate: snapshot.asOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        previousClose: dailyPrice.currentPrice,
        priceUnit: "GBP",
        currency: "GBP",
        marketCap: marketCapGbp,
        marketCapCurrency: "GBP",
        enterpriseValue: marketCapGbp != null && netDebtUsd != null ? marketCapGbp + netDebtUsd / gbpUsd : marketSnapshot.enterpriseValue,
        enterpriseValueCurrency: "GBP",
        source: dailyPrice.source,
        rawJson: JSON.stringify({
          ...(parseJson(marketSnapshot.rawJson, {}) ?? {}),
          dailyPriceOverride: dailyPrice,
          gbpUsdUsedForEv: gbpUsd,
        }),
      },
    },
  };
}

export function getDgeValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, DGE_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getDgeHistoricalValuations({ scenario = "Base", modelVersion = DGE_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getDgeReportingEvents();
  const runs = getDgeValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

export async function createDgeValuationRun({
  eventId,
  asOfDate,
  scenario = "Base",
  modelVersion = DGE_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const rawSnapshot = getDgeSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No DGE.L reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    DGE_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runDgeBackendValuation({
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
  const targetPrice3Y =
    valuationResult.targetPrice3Y ??
    selectedScenario?.targetPrice3Y ??
    (fairValue != null ? fairValue * 1.08 : null);
  const expectedShareholderCagr =
    valuationResult.expectedReturn3Y ??
    selectedScenario?.expectedReturn3Y ??
    (currentPrice && targetPrice3Y ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1 : null);
  const upsideDownside =
    valuationResult.upsideDownside ??
    selectedScenario?.upsideDownside ??
    (currentPrice && fairValue ? fairValue / currentPrice - 1 : null);

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
              id: "dge-daily-price-gbp-anchor",
              title: "DGE.L daily price anchor",
              detail: `As-of price uses ${dailyPrice.source} from ${dailyPrice.priceDate}; GBp price bars are converted to GBP.`,
              severity: "low",
            }]
          : [{
              id: "dge-market-proxy-price-anchor",
              title: "DGE.L proxy market price anchor",
              detail: "No imported daily price existed on or before this event, so the seeded market snapshot was used.",
              severity: "medium",
            }]),
      ]),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? snapshot),
        asOfPriceSource: dailyPrice ?? null,
        currencyBoundary: "Fair values and current prices are GBP per ordinary share; DGE.L bars originate in GBp. Financial assumptions are USD millions unless noted.",
      }),
      createdAt,
    ],
    DGE_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getDgeValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillDgeValuationRuns({
  scenarios = ["Base"],
  modelVersion = DGE_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], DGE_BACKEND_DB_PATH);
  }
  const events = getDgeReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createDgeValuationRun({ eventId: event.id, scenario, modelVersion });
        created.push({
          eventId: event.id,
          eventDate: event.eventDate,
          eventType: event.eventType,
          sourceType: event.sourceType,
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
