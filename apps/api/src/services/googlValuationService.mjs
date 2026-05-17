import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { getGooglReportingEvents, getGooglSnapshot } from "./googlSnapshotService.mjs";
import { GOOGL_BACKEND_DB_PATH } from "../../../../modules/googl/db/schema.mjs";
import { runGooglBackendValuation } from "../../../../modules/googl/valuation/adapter.mjs";

const TICKER = "GOOGL";

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
  if (value == null) return null;
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
    GOOGL_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row) return null;
  const adjustedClose = finiteNumber(row.adjustedClose);
  const close = finiteNumber(row.close);
  const hasAdjustedClose = adjustedClose != null;
  const currentPrice = hasAdjustedClose ? adjustedClose : close;
  if (currentPrice == null) return null;
  return {
    priceDate: row.priceDate,
    currentPrice,
    adjustedClose: hasAdjustedClose ? adjustedClose : null,
    close: Number.isFinite(close) ? close : null,
    source: row.source,
    sourceType: row.sourceType,
    priceQuality: hasAdjustedClose ? "adjusted_market_data" : "unadjusted_market_data",
    warning: hasAdjustedClose ? null : "GOOGL daily price anchor uses unadjusted close because adjusted close is unavailable in the imported source.",
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
        ticker: TICKER,
        asOfDate: snapshot.asOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        previousClose: dailyPrice.close,
        adjustedClose: dailyPrice.adjustedClose,
        unadjustedClose: dailyPrice.close,
        splitAdjustment: dailyPrice.adjustedClose && dailyPrice.close ? dailyPrice.adjustedClose / dailyPrice.close : null,
        marketCap: sharesOutstanding ? dailyPrice.currentPrice * sharesOutstanding : marketSnapshot.marketCap ?? null,
        priceQuality: dailyPrice.priceQuality,
        priceSource: dailyPrice.source,
        signalBacktestAllowed: 1,
        source: dailyPrice.source,
        rawJson: JSON.stringify({
          ...(parseJson(marketSnapshot.rawJson, {}) ?? {}),
          dailyPriceOverride: dailyPrice,
        }),
      },
    },
  };
}

export function getGooglValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
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
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, GOOGL_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
    assumptionAuditJson: parseJson(row.assumptionAuditJson, []),
    factorAttributionJson: parseJson(row.factorAttributionJson, {}),
    qualityFlagsJson: parseJson(row.qualityFlagsJson, {}),
    investmentValidationJson: parseJson(row.investmentValidationJson, {}),
  }));
}

function fiscalQuarterFromEvent(event) {
  const eventTypeQuarter = event.eventType?.match(/^q([1-4])_results$/)?.[1];
  if (eventTypeQuarter) return Number(eventTypeQuarter);
  const fiscalPeriodQuarter = event.fiscalPeriod?.match(/\bQ([1-4])\b/i)?.[1];
  return fiscalPeriodQuarter ? Number(fiscalPeriodQuarter) : null;
}

function canonicalQuarterKey(event) {
  const quarter = fiscalQuarterFromEvent(event);
  if (!event.fiscalYear || !quarter) return null;
  return `${event.fiscalYear}-Q${quarter}`;
}

function canonicalQuarterPriority(event) {
  if (event.id?.startsWith("quarterly-report-fy")) return 100;
  if (event.id?.startsWith("period-")) return 80;
  return 0;
}

function selectCanonicalQuarterEvents(events) {
  const selected = new Map();
  for (const event of events) {
    const key = canonicalQuarterKey(event);
    if (!key) continue;
    const priority = canonicalQuarterPriority(event);
    if (priority <= 0) continue;
    const existing = selected.get(key);
    if (
      !existing ||
      priority > existing.priority ||
      (priority === existing.priority && event.eventDate > existing.event.eventDate)
    ) {
      selected.set(key, { event, priority });
    }
  }
  return [...selected.values()]
    .map(({ event }) => event)
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate));
}

function selectAnnualEvents(events) {
  return events
    .filter((event) => event.eventType === "annual_report")
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate));
}

export function getGooglHistoricalValuations({
  scenario = "Base",
  modelVersion = "googl_v1_backend_pilot",
  series = "quarterly",
} = {}) {
  const events = getGooglReportingEvents();
  const seriesEvents =
    series === "all"
      ? events
      : series === "annual"
        ? selectAnnualEvents(events)
        : selectCanonicalQuarterEvents(events);
  const runs = getGooglValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return seriesEvents.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

export async function createGooglValuationRun({ eventId, asOfDate, scenario = "Base", modelVersion = "googl_v1_backend_pilot", assumptions = {} } = {}) {
  const rawSnapshot = getGooglSnapshot({ eventId, asOfDate });
  if (!rawSnapshot.reportingEvent) {
    throw new Error("No GOOGL reporting event matched the supplied eventId/asOfDate.");
  }
  const { snapshot, dailyPrice } = applyDailyPriceToSnapshot(rawSnapshot);
  const assumptionSet = query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND scenario = ? AND modelVersion = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    GOOGL_BACKEND_DB_PATH,
  )[0] ?? null;
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runGooglBackendValuation({
    snapshot,
    scenario,
    modelVersion,
    baseAssumptions,
    assumptions,
  });
  const selectedScenario = (valuationResult.fairValues ?? []).find((item) => item.scenario === scenario) ?? null;
  const fairValue =
    valuationResult.recommendedFairValue ??
    valuationResult.blendedFairValue ??
    selectedScenario?.fairValue ??
    null;
  const previousRun = query(
    `SELECT v.fairValue, v.methodOutputsJson, e.id AS eventId, e.eventDate
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ?
       AND v.scenario = ?
       AND v.modelVersion = ?
       AND e.eventDate < ?
     ORDER BY e.eventDate DESC, v.createdAt DESC
     LIMIT 1`,
    [TICKER, scenario, modelVersion, snapshot.asOfDate],
    GOOGL_BACKEND_DB_PATH,
  )[0] ?? null;
  const factorAttribution = {
    ...(valuationResult.backendFactorAttribution ?? {}),
    previousEventBridge: previousRun
      ? {
          previousEventId: previousRun.eventId,
          previousEventDate: previousRun.eventDate,
          previousFairValue: previousRun.fairValue,
          currentFairValue: fairValue,
          fairValueDelta: typeof previousRun.fairValue === "number" && typeof fairValue === "number" ? fairValue - previousRun.fairValue : null,
          previousMethodOutputs: parseJson(previousRun.methodOutputsJson, []),
          currentMethodOutputs: valuationResult.methodCards ?? [],
        }
      : null,
  };

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO valuation_runs (
      id, ticker, asOfDate, reportingEventId, scenario, modelVersion, assumptionSetId,
      currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
      probabilityWeightedFairValue, priceQuality, signalBacktestAllowed,
      methodOutputsJson, sensitivityTablesJson, warningsJson, dataSnapshotJson,
      assumptionAuditJson, factorAttributionJson, qualityFlagsJson, investmentValidationJson,
      createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      TICKER,
      snapshot.asOfDate,
      snapshot.reportingEvent.id,
      scenario,
      modelVersion,
      assumptionSet?.id ?? null,
      valuationResult.currentPrice,
      fairValue,
      selectedScenario?.targetPrice3Y ?? valuationResult.targetPrice3Y ?? null,
      valuationResult.expectedReturn3Y ?? selectedScenario?.expectedReturn3Y ?? null,
      valuationResult.upsideDownside ?? selectedScenario?.upsideDownside ?? null,
      valuationResult.probabilityWeightedFairValue ?? null,
      valuationResult.priceQuality ?? snapshot.marketSnapshot?.priceQuality ?? null,
      valuationResult.signalBacktestAllowed ? 1 : 0,
      JSON.stringify(valuationResult.methodCards ?? []),
      JSON.stringify(valuationResult.sensitivityTables ?? []),
      JSON.stringify([
        ...(valuationResult.validationWarnings ?? []),
        ...(dailyPrice
          ? [{
              id: dailyPrice.adjustedClose == null ? "googl-daily-price-unadjusted-anchor" : "googl-daily-price-anchor",
              title: dailyPrice.adjustedClose == null ? "GOOGL unadjusted daily price anchor" : "GOOGL daily price anchor",
              detail: dailyPrice.warning ?? `As-of price uses ${dailyPrice.source} adjusted close from ${dailyPrice.priceDate}.`,
              severity: dailyPrice.adjustedClose == null ? "medium" : "low",
            }]
          : []),
      ]),
      JSON.stringify({
        ...(valuationResult.backendSnapshot ?? snapshot),
        asOfPriceSource: dailyPrice ?? null,
      }),
      JSON.stringify(valuationResult.backendAssumptionAudit ?? []),
      JSON.stringify(factorAttribution),
      JSON.stringify(valuationResult.backendQualityFlags ?? {}),
      JSON.stringify(valuationResult.backendInvestmentValidation ?? {}),
      createdAt,
    ],
    GOOGL_BACKEND_DB_PATH,
  );

  return {
    id,
    persisted: true,
    valuationRun: getGooglValuationRuns({ eventId: snapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillGooglValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = "googl_v1_backend_pilot",
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], GOOGL_BACKEND_DB_PATH);
  }
  const events = getGooglReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const created = [];
  const failed = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const result = await createGooglValuationRun({ eventId: event.id, scenario, modelVersion });
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
