#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { execute, query } from "../apps/api/src/db/client.mjs";
import { runMckBacktest } from "../apps/api/src/services/mckBacktestService.mjs";
import { getMckCapitalReturnHistory } from "../apps/api/src/services/mckSnapshotService.mjs";
import { createMckValuationRun } from "../apps/api/src/services/mckValuationService.mjs";
import { MCK_BACKEND_DB_PATH } from "../modules/mck/db/schema.mjs";
import { MCK_BACKEND_MODEL_VERSION } from "../modules/mck/valuation/modelVersion.mjs";

const TICKER = "MCK";
const requiredTables = [
  "reporting_events",
  "source_documents",
  "financial_periods",
  "segment_financials",
  "market_snapshots",
  "peer_snapshots",
  "guidance_items",
  "transcript_events",
  "transcript_extractions",
  "assumption_sets",
  "model_versions",
  "valuation_runs",
  "validation_warnings",
  "backtest_runs",
];

const checks = [];

function record(status, title, detail = "") {
  checks.push({ status, title, detail });
}

function pass(title, detail = "") {
  record("PASS", title, detail);
}

function warn(title, detail = "") {
  record("WARNING", title, detail);
}

function fail(title, detail = "") {
  record("FAIL", title, detail);
}

function count(table, where = "ticker = 'MCK'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], MCK_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function latestRunByEvent(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.eventId)) map.set(row.eventId, row);
  }
  return [...map.values()];
}

function getHealthStatus() {
  return new Promise((resolve) => {
    const request = http.get("http://127.0.0.1:8787/api/health", { timeout: 800 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({ ok: response.statusCode === 200, body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") });
        } catch {
          resolve({ ok: false, body: null });
        }
      });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false, skipped: true, reason: "timeout" });
    });
    request.on("error", (error) => resolve({ ok: false, skipped: true, reason: error.code ?? error.message }));
  });
}

async function main() {
  console.log("MCK Backend Validation");

  if (!existsSync(MCK_BACKEND_DB_PATH)) {
    fail("DB file exists", `${MCK_BACKEND_DB_PATH} is missing. Run npm run mck:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", MCK_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], MCK_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of requiredTables) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run mck:backend:seed to apply the MCK migration.");
  }
  tables.has("daily_price_bars")
    ? pass("Table exists: daily_price_bars")
    : fail("Table missing: daily_price_bars", "Run npm run mck:backend:import-prices.");

  const eventCount = count("reporting_events");
  eventCount >= 8 ? pass("Reporting events imported", `${eventCount} MCK events`) : fail("Reporting events imported", `${eventCount} events; expected at least the last eight quarters.`);

  const quarterCount = count("reporting_events", "ticker = 'MCK' AND eventType IN ('q1_earnings_release','q2_earnings_release_10q','q3_earnings_release_10q')");
  quarterCount >= 6 ? pass("Quarterly filer event model supported", `${quarterCount} Q1/Q2/Q3 events`) : fail("Quarterly filer event model supported", `${quarterCount} quarterly events.`);

  const fyCount = count("reporting_events", "ticker = 'MCK' AND eventType = 'fy_earnings_release_10k'");
  fyCount >= 2 ? pass("FY earnings / 10-K event model supported", `${fyCount} FY events`) : fail("FY earnings / 10-K event model supported", `${fyCount} FY events.`);

  const marketCount = count("market_snapshots");
  marketCount >= eventCount ? pass("Market snapshots imported", `${marketCount} event-dated rows`) : fail("Market snapshots imported", `${marketCount}/${eventCount} rows.`);

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('MCK', 'SPY') GROUP BY ticker",
    [],
    MCK_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const mckPriceBars = priceBarMap.get("MCK");
  const spyPriceBars = priceBarMap.get("SPY");
  mckPriceBars?.count >= 2000
    ? pass("MCK daily price bars imported", `${mckPriceBars.count} rows, ${mckPriceBars.firstDate} to ${mckPriceBars.lastDate}`)
    : fail("MCK daily price bars imported", "Run npm run mck:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}`)
    : fail("SPY daily price bars imported", "Run npm run mck:backend:import-prices.");

  const modelVersionCount = count("model_versions", `ticker = 'MCK' AND version = '${MCK_BACKEND_MODEL_VERSION.version}'`);
  modelVersionCount > 0 ? pass("Model version exists", MCK_BACKEND_MODEL_VERSION.version) : fail("Model version exists", "Missing MCK backend model version row.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MCK_BACKEND_MODEL_VERSION.version],
    MCK_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0 ? pass(`Assumption set exists: ${scenario}`) : fail(`Assumption set missing: ${scenario}`, "Seed must create Bear/Base/Bull MCK assumptions.");
  }

  const segmentTaxonomyRows = query(
    `SELECT DISTINCT segment FROM segment_financials WHERE ticker = ? ORDER BY segment`,
    [TICKER],
    MCK_BACKEND_DB_PATH,
  ).map((row) => row.segment);
  const requiredSegments = ["U.S. Pharmaceutical", "Oncology & Multispecialty", "Prescription Technology Solutions", "Medical-Surgical Solutions"];
  const missingSegments = requiredSegments.filter((segment) => !segmentTaxonomyRows.includes(segment));
  missingSegments.length === 0
    ? pass("MCK segment taxonomy is present", segmentTaxonomyRows.join(", "))
    : fail("MCK segment taxonomy is present", `Missing: ${missingSegments.join(", ")}`);

  const distributionRows = count("segment_financials", "ticker = 'MCK' AND segment = 'U.S. Pharmaceutical' AND revenue IS NOT NULL AND adjustedOperatingProfit IS NOT NULL AND marginBps IS NOT NULL");
  distributionRows >= eventCount ? pass("Distribution revenue/profit/margin tracked", `${distributionRows} U.S. Pharmaceutical rows`) : fail("Distribution revenue/profit/margin tracked", `${distributionRows}/${eventCount} rows.`);

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", [TICKER], MCK_BACKEND_DB_PATH)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate})`);
    try {
      const valuation = await createMckValuationRun({
        eventId: latestEvent.id,
        scenario: "Base",
        modelVersion: MCK_BACKEND_MODEL_VERSION.version,
      });
      const result = valuation.valuationResult;
      const fairValue = result.recommendedFairValue ?? result.blendedFairValue ?? null;
      isFiniteNumber(result.currentPrice) && isFiniteNumber(fairValue)
        ? pass("Backend valuation run can be created", `currentPrice=${result.currentPrice}; fairValue=${fairValue}`)
        : fail("Backend valuation run can be created", "Valuation did not return finite currentPrice and fairValue.");
      if (valuation.id) execute("DELETE FROM valuation_runs WHERE id = ?", [valuation.id], MCK_BACKEND_DB_PATH);
    } catch (error) {
      fail("Backend valuation run can be created", error instanceof Error ? error.message : String(error));
    }
  }

  const baseHistoricalRuns = query(
    `SELECT reportingEventId, COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ? AND scenario = ? AND modelVersion = ?
     GROUP BY reportingEventId`,
    [TICKER, "Base", MCK_BACKEND_MODEL_VERSION.version],
    MCK_BACKEND_DB_PATH,
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  historicalRunEventIds.size >= eventCount
    ? pass("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events`)
    : fail("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events. Run npm run mck:backend:seed.`);

  const finiteRuns = query(
    `SELECT COUNT(DISTINCT reportingEventId) AS count
     FROM valuation_runs
     WHERE ticker = ?
       AND scenario = 'Base'
       AND modelVersion = ?
       AND currentPrice IS NOT NULL
       AND fairValue IS NOT NULL
       AND targetPrice3Y IS NOT NULL
       AND expectedShareholderCagr IS NOT NULL`,
    [TICKER, MCK_BACKEND_MODEL_VERSION.version],
    MCK_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  finiteRuns >= eventCount
    ? pass("Frontend-required valuation fields are persisted", `${finiteRuns}/${eventCount} Base runs have price, fair value, target and CAGR`)
    : fail("Frontend-required valuation fields are persisted", `${finiteRuns}/${eventCount} complete Base valuation rows.`);

  const fairValueSeries = query(
    `SELECT ROUND(fairValue, 2) AS fairValue
     FROM valuation_runs
     WHERE ticker = ?
       AND scenario = 'Base'
       AND modelVersion = ?
       AND fairValue IS NOT NULL
     GROUP BY reportingEventId
     ORDER BY asOfDate`,
    [TICKER, MCK_BACKEND_MODEL_VERSION.version],
    MCK_BACKEND_DB_PATH,
  ).map((row) => row.fairValue);
  const uniqueFairValues = new Set(fairValueSeries);
  uniqueFairValues.size > 1
    ? pass("Historical fair values are not a flat line", `${uniqueFairValues.size} unique fair values across ${fairValueSeries.length} Base runs`)
    : fail("Historical fair values are not a flat line", "Backfilled historical valuation runs should vary by event snapshot.");

  const asOfDailyPriceRows = query(
    `SELECT v.reportingEventId, v.currentPrice, p.adjustedClose, p.source, p.sourceType
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId AND e.ticker = v.ticker
     JOIN daily_price_bars p ON p.ticker = v.ticker AND p.priceDate = (
       SELECT MAX(priceDate)
       FROM daily_price_bars p2
       WHERE p2.ticker = v.ticker AND p2.priceDate <= e.eventDate
     )
     WHERE v.ticker = ?
       AND v.scenario = 'Base'
       AND v.modelVersion = ?`,
    [TICKER, MCK_BACKEND_MODEL_VERSION.version],
    MCK_BACKEND_DB_PATH,
  );
  const nonDailyAnchors = asOfDailyPriceRows.filter((row) => Math.abs((row.currentPrice ?? 0) - (row.adjustedClose ?? 0)) > 0.01);
  asOfDailyPriceRows.length >= eventCount && nonDailyAnchors.length === 0
    ? pass("Historical as-of prices use daily market data where available", `${asOfDailyPriceRows.length} Base runs match daily_price_bars`)
    : fail("Historical as-of prices use daily market data where available", JSON.stringify(nonDailyAnchors.slice(0, 5)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'MCK' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are research-only")
    : fail("Transcript candidates are research-only", `${transcriptModelReady} transcript rows are model-ready or valuation-impacting.`);

  const guidancePromoted = count(
    "guidance_items",
    "ticker = 'MCK' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
  );
  guidancePromoted === 0
    ? pass("Guidance candidates are not valuation-impacting")
    : fail("Guidance candidates are not valuation-impacting", `${guidancePromoted} candidate guidance rows allow valuation impact.`);

  const mixedPeerMisuse = query(
    `SELECT peerTicker, absoluteValueUse
     FROM peer_snapshots
     WHERE ticker = ?
       AND (absoluteValueUse IS NULL OR absoluteValueUse NOT LIKE '%metadata_only%')`,
    [TICKER],
    MCK_BACKEND_DB_PATH,
  );
  mixedPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only")
    : fail("Peer absolute values are metadata-only", JSON.stringify(mixedPeerMisuse));

  const baseRunsForLeakageAudit = query(
    `SELECT e.id AS eventId, e.eventDate, e.fiscalPeriod, e.eventType, v.fairValue, v.dataSnapshotJson, v.createdAt
     FROM reporting_events e
     JOIN valuation_runs v ON v.ticker = e.ticker AND v.reportingEventId = e.id
     WHERE e.ticker = ?
       AND v.scenario = 'Base'
       AND v.modelVersion = ?
     ORDER BY e.eventDate ASC, v.createdAt DESC`,
    [TICKER, MCK_BACKEND_MODEL_VERSION.version],
    MCK_BACKEND_DB_PATH,
  );
  const latestBaseRuns = latestRunByEvent(baseRunsForLeakageAudit);
  const financialPeriodById = new Map(
    query("SELECT periodId, asOfDate, eventId, periodType FROM financial_periods WHERE ticker = ?", [TICKER], MCK_BACKEND_DB_PATH)
      .map((row) => [row.periodId, row]),
  );
  const futureLeakedRuns = latestBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson);
    const period = financialPeriodById.get(snapshot.valuationPeriodId);
    return period?.asOfDate && period.asOfDate > row.eventDate;
  });
  futureLeakedRuns.length === 0
    ? pass("Historical valuation runs do not use future financial periods", `${latestBaseRuns.length} Base event runs checked`)
    : fail("Historical valuation runs do not use future financial periods", JSON.stringify(futureLeakedRuns.slice(0, 5)));

  const modernQuarterRuns = latestBaseRuns.filter((row) =>
    row.eventDate >= "2024-01-01" && ["q1_earnings_release", "q2_earnings_release_10q", "q3_earnings_release_10q"].includes(row.eventType),
  );
  const staleQuarterRuns = modernQuarterRuns.filter((row) => {
    const expected = query("SELECT periodId FROM financial_periods WHERE ticker = ? AND eventId = ? LIMIT 1", [TICKER, row.eventId], MCK_BACKEND_DB_PATH)[0]?.periodId;
    const snapshot = parseJson(row.dataSnapshotJson);
    return expected && snapshot.valuationPeriodId !== expected;
  });
  staleQuarterRuns.length === 0
    ? pass("Modern quarterly runs use event-specific snapshots", `${modernQuarterRuns.length} Q1/Q2/Q3 runs checked`)
    : fail("Modern quarterly runs use event-specific snapshots", JSON.stringify(staleQuarterRuns.map((row) => ({
      eventId: row.eventId,
      fiscalPeriod: row.fiscalPeriod,
      expected: query("SELECT periodId FROM financial_periods WHERE ticker = ? AND eventId = ? LIMIT 1", [TICKER, row.eventId], MCK_BACKEND_DB_PATH)[0]?.periodId,
      actual: parseJson(row.dataSnapshotJson).valuationPeriodId,
    })).slice(0, 8)));

  const annualizedFcfWarnings = query(
    `SELECT periodId, rawJson
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'reporting_event_run_rate'
       AND rawJson NOT LIKE '%normalized visible run-rate FCF%'`,
    [TICKER],
    MCK_BACKEND_DB_PATH,
  );
  annualizedFcfWarnings.length === 0
    ? pass("Quarterly FCF is normalized, not mechanically annualized", "Run-rate rows retain reported quarter FCF in rawJson.")
    : fail("Quarterly FCF is normalized, not mechanically annualized", JSON.stringify(annualizedFcfWarnings.slice(0, 5)));

  const terminalHeavyRuns = query(
    `SELECT COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ?
       AND warningsJson LIKE '%terminal value dominates%'`,
    [TICKER],
    MCK_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  terminalHeavyRuns > 0
    ? warn("DCF terminal-value warning is surfaced", `${terminalHeavyRuns} valuation runs carry terminal-value warning.`)
    : pass("DCF terminal-value warning is surfaced", "No terminal-value warning triggered under current assumptions.");

  const frontendSnapshotFields = query(
    `SELECT COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ?
       AND dataSnapshotJson LIKE '%valuationPeriodId%'
       AND methodOutputsJson LIKE '%SOTP%'
       AND warningsJson IS NOT NULL`,
    [TICKER],
    MCK_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  frontendSnapshotFields > 0
    ? pass("Frontend-required backend fields exist", `${frontendSnapshotFields} valuation rows include snapshot/method/warning JSON.`)
    : fail("Frontend-required backend fields exist", "No persisted valuation run includes snapshot/method/warning JSON.");

  const placeholderAsActual = query(
    `SELECT id, periodId
     FROM financial_periods
     WHERE ticker = ?
       AND sourceType = 'official_actual'
       AND rawJson LIKE '%placeholderFields%'`,
    [TICKER],
    MCK_BACKEND_DB_PATH,
  );
  placeholderAsActual.length > 0
    ? warn("Official rows disclose placeholder fields", `${placeholderAsActual.length} official rows flag per-share/debt placeholders in rawJson.`)
    : pass("Placeholder fields are not marked as official actuals");

  const annualCapitalRows = query(
    "SELECT COUNT(*) AS count FROM financial_periods WHERE ticker = ? AND periodType = 'annual'",
    [TICKER],
    MCK_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  annualCapitalRows >= 8
    ? pass("Annual financial_periods rows exist for capital-return history", `${annualCapitalRows} annual rows`)
    : fail("Annual financial_periods rows exist for capital-return history", `${annualCapitalRows} annual rows; expected at least 8.`);

  try {
    const capitalReturns = getMckCapitalReturnHistory({ years: 8 });
    const rows = capitalReturns.rows ?? [];
    const warningsText = JSON.stringify(capitalReturns.warnings ?? []);
    rows.length >= 8
      ? pass("MCK capital-return endpoint returns at least 8 annual rows", `${rows[0]?.fiscalYear}-${rows[rows.length - 1]?.fiscalYear}`)
      : fail("MCK capital-return endpoint returns at least 8 annual rows", JSON.stringify({ rows: rows.length, warnings: capitalReturns.warnings }));

    rows.every((row) => isFiniteNumber(row.equityFreeCashFlow))
      ? pass("Every historical capital-return row has finite FCF")
      : fail("Every historical capital-return row has finite FCF", JSON.stringify(rows.filter((row) => !isFiniteNumber(row.equityFreeCashFlow))));

    rows.every((row) => isFiniteNumber(row.dividendCashCost)) || warningsText.includes("mck-capital-return-dividend-missing")
      ? pass("Every historical row has dividend cash cost or explicit warning")
      : fail("Every historical row has dividend cash cost or explicit warning", JSON.stringify(rows.filter((row) => !isFiniteNumber(row.dividendCashCost))));

    rows.every((row) => isFiniteNumber(row.buybackAmount)) || warningsText.includes("mck-capital-return-buyback-missing")
      ? pass("Every historical row has buyback amount or explicit warning")
      : fail("Every historical row has buyback amount or explicit warning", JSON.stringify(rows.filter((row) => !isFiniteNumber(row.buybackAmount))));

    const capitalReturnMismatches = rows.filter((row) => {
      if (!isFiniteNumber(row.totalCapitalReturn)) return true;
      const expected = (row.dividendCashCost ?? 0) + (row.buybackAmount ?? 0);
      return Math.abs(row.totalCapitalReturn - expected) > 0.01;
    });
    capitalReturnMismatches.length === 0
      ? pass("Total capital return reconciles to dividends plus buybacks")
      : fail("Total capital return reconciles to dividends plus buybacks", JSON.stringify(capitalReturnMismatches));

    const coverageMismatches = rows.filter((row) => {
      const totalCapitalReturn = row.totalCapitalReturn ?? 0;
      if (!isFiniteNumber(row.equityFreeCashFlow) || totalCapitalReturn <= 0) return row.fcfCoverage != null;
      return !isFiniteNumber(row.fcfCoverage) || Math.abs(row.fcfCoverage - row.equityFreeCashFlow / totalCapitalReturn) > 0.0001;
    });
    coverageMismatches.length === 0
      ? pass("FCF coverage reconciles to FCF divided by total capital return")
      : fail("FCF coverage reconciles to FCF divided by total capital return", JSON.stringify(coverageMismatches));

    const forward = capitalReturns.forwardExpectation;
    forward?.isForecast === true && forward.sourceType === "forecast_assumption" && isFiniteNumber(forward.totalCapitalReturn)
      ? pass("MCK capital-return forwardExpectation exists", `FY${forward.fiscalYear}E total=${forward.totalCapitalReturn}`)
      : fail("MCK capital-return forwardExpectation exists", JSON.stringify(forward));

    forward?.sourceType === "forecast_assumption"
      ? pass("MCK capital-return forwardExpectation sourceType is forecast_assumption")
      : fail("MCK capital-return forwardExpectation sourceType is forecast_assumption", JSON.stringify(forward));

    const cumulativeCapitalReturn = rows.reduce((sum, row) => sum + (row.totalCapitalReturn ?? 0), 0);
    const cumulativeFcf = rows.reduce((sum, row) => sum + (row.equityFreeCashFlow ?? 0), 0);
    Math.abs((capitalReturns.summary?.cumulativeCapitalReturn ?? -1) - cumulativeCapitalReturn) < 0.01
      && Math.abs((capitalReturns.summary?.cumulativeFcf ?? -1) - cumulativeFcf) < 0.01
      && capitalReturns.summary?.excludesForwardFromCumulativeTotals === true
      ? pass("FY2026E is excluded from 8Y historical cumulative totals", `historicalCapitalReturn=${cumulativeCapitalReturn}; historicalFcf=${cumulativeFcf}`)
      : fail("FY2026E is excluded from 8Y historical cumulative totals", JSON.stringify(capitalReturns.summary));

    const chartSeries = capitalReturns.chartSeries ?? [];
    const hasStackedCapitalReturn = chartSeries.some((row) => isFiniteNumber(row.dividends) && isFiniteNumber(row.buybacks));
    const hasFcfSeries = chartSeries.some((row) => isFiniteNumber(row.fcf));
    const hasForecastSeries = chartSeries.some((row) => row.isForecast && isFiniteNumber(row.forecastBuybacks) && isFiniteNumber(row.forecastFcf));
    hasStackedCapitalReturn && hasFcfSeries && hasForecastSeries
      ? pass("Capital-return chart payload includes stacked capital return, FCF, and forecast series")
      : fail("Capital-return chart payload includes stacked capital return, FCF, and forecast series", JSON.stringify(chartSeries.slice(0, 3)));
  } catch (error) {
    fail("MCK capital-return endpoint returns validated history", error instanceof Error ? error.message : String(error));
  }

  try {
    const backtest = runMckBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const stockMetrics = backtest.metrics?.mckBuyHold;
    const spyMetrics = backtest.metrics?.spy;
    backtest.status === "completed"
      && backtest.curve?.length >= 2000
      && isFiniteNumber(stockMetrics?.cagr)
      && isFiniteNumber(stockMetrics?.maxDrawdown)
      && isFiniteNumber(stockMetrics?.sharpe)
      && isFiniteNumber(stockMetrics?.volatility)
      && isFiniteNumber(spyMetrics?.cagr)
      && isFiniteNumber(spyMetrics?.maxDrawdown)
      && isFiniteNumber(spyMetrics?.sharpe)
      && isFiniteNumber(spyMetrics?.volatility)
      ? pass("MCK backtest endpoint returns finite metrics", `curve=${backtest.curve.length}; mckCagr=${stockMetrics.cagr}; spyCagr=${spyMetrics.cagr}`)
      : fail("MCK backtest endpoint returns finite metrics", JSON.stringify(backtest).slice(0, 1000));
  } catch (error) {
    fail("MCK backtest endpoint returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  const health = await getHealthStatus();
  if (health.ok && health.body?.mckBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected MCK health payload.");
  }

  printAndExit();
}

function printAndExit() {
  const totals = {
    PASS: checks.filter((check) => check.status === "PASS").length,
    WARNING: checks.filter((check) => check.status === "WARNING").length,
    FAIL: checks.filter((check) => check.status === "FAIL").length,
  };

  for (const check of checks) {
    const suffix = check.detail ? ` - ${check.detail}` : "";
    console.log(`${check.status}: ${check.title}${suffix}`);
  }
  console.log("");
  console.log(`PASS: ${totals.PASS}`);
  console.log(`WARNING: ${totals.WARNING}`);
  console.log(`FAIL: ${totals.FAIL}`);
  process.exit(totals.FAIL > 0 ? 1 : 0);
}

main().catch((error) => {
  fail("Validation crashed", error instanceof Error ? error.stack ?? error.message : String(error));
  printAndExit();
});
