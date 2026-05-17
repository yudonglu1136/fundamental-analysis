#!/usr/bin/env node
import { existsSync } from "node:fs";
import { defaultIsrgDbPath } from "../apps/api/src/services/isrgSnapshotService.mjs";
import { execute, query } from "../apps/api/src/db/client.mjs";
import { createIsrgValuationRun } from "../apps/api/src/services/isrgValuationService.mjs";
import { runIsrgBacktest } from "../apps/api/src/services/isrgBacktestService.mjs";

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
  "daily_price_bars",
];

const checks = [];

function record(status, title, detail = "") {
  checks.push({ status, title, detail });
}

function pass(title, detail = "") {
  record("PASS", title, detail);
}

function fail(title, detail = "") {
  record("FAIL", title, detail);
}

function warn(title, detail = "") {
  record("WARNING", title, detail);
}

function count(table, where = "ticker = 'ISRG'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], defaultIsrgDbPath)[0]?.count ?? 0;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteMetricSet(metrics) {
  return ["cagr", "maxDrawdown", "sharpe", "volatility"].every((key) => finite(metrics?.[key]));
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function printAndExit() {
  for (const check of checks) {
    const suffix = check.detail ? ` - ${check.detail}` : "";
    console.log(`${check.status}: ${check.title}${suffix}`);
  }
  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const warningCount = checks.filter((check) => check.status === "WARNING").length;
  console.log(JSON.stringify({ result: failCount ? "FAIL" : "PASS", failCount, warningCount }, null, 2));
  if (failCount) process.exitCode = 1;
}

async function main() {
  console.log("ISRG Backend Validation");

  if (!existsSync(defaultIsrgDbPath)) {
    fail("DB file exists", `${defaultIsrgDbPath} is missing. Run npm run isrg:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", defaultIsrgDbPath);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], defaultIsrgDbPath).map((row) => row.name));
  for (const table of requiredTables) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`);
  }

  const eventCount = count("reporting_events");
  eventCount >= 36 ? pass("Events imported", `${eventCount} rows`) : fail("Events imported", `${eventCount} rows; expected FY2017-FY2023 quarterly history plus recent events.`);

  const earliestEvent = query("SELECT eventDate, fiscalPeriod FROM reporting_events WHERE ticker = ? ORDER BY eventDate ASC LIMIT 1", ["ISRG"], defaultIsrgDbPath)[0];
  earliestEvent?.eventDate <= "2017-04-30"
    ? pass("Eight-year reporting history available", `earliest=${earliestEvent.eventDate} (${earliestEvent.fiscalPeriod})`)
    : fail("Eight-year reporting history available", `earliest=${earliestEvent?.eventDate ?? "n/a"}; expected Q1 FY2017-era event history.`);

  const historicalSeedFinancials = count("financial_periods", "ticker = 'ISRG' AND sourceStatus = 'historical_seed'");
  historicalSeedFinancials >= 28
    ? pass("Historical quarterly seed financials imported", `${historicalSeedFinancials} rows`)
    : fail("Historical quarterly seed financials imported", `${historicalSeedFinancials} rows; expected FY2017-FY2023 quarterly seed history.`);

  const historicalQuarterEvents = count(
    "reporting_events",
    "ticker = 'ISRG' AND eventType = 'quarterly_earnings_release' AND fiscalYear BETWEEN 2017 AND 2023",
  );
  historicalQuarterEvents >= 21
    ? pass("FY2017-FY2023 quarterly valuation events imported", `${historicalQuarterEvents} Q1/Q2/Q3 events`)
    : fail("FY2017-FY2023 quarterly valuation events imported", `${historicalQuarterEvents}/21 Q1/Q2/Q3 events`);

  const incompleteHistoricalYears = query(
    `SELECT fiscalYear, COUNT(*) AS count
     FROM reporting_events
     WHERE ticker = 'ISRG'
       AND fiscalYear BETWEEN 2017 AND 2023
       AND (eventType = 'quarterly_earnings_release' OR eventType = 'fy_earnings_release')
     GROUP BY fiscalYear
     HAVING COUNT(*) < 4`,
    [],
    defaultIsrgDbPath,
  );
  incompleteHistoricalYears.length === 0
    ? pass("FY2017-FY2023 each have four reporting events", "Q1/Q2/Q3/FY are present for each year")
    : fail("FY2017-FY2023 each have four reporting events", JSON.stringify(incompleteHistoricalYears));

  const marketCount = count("market_snapshots");
  marketCount >= eventCount ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", `${marketCount}/${eventCount} rows`);

  if (tables.has("daily_price_bars")) {
    const isrgPriceCount = count("daily_price_bars", "ticker = 'ISRG'");
    const spyPriceCount = count("daily_price_bars", "ticker = 'SPY'");
    isrgPriceCount >= 2000 ? pass("ISRG daily prices imported", `${isrgPriceCount} rows`) : fail("ISRG daily prices imported", `${isrgPriceCount} rows; expected multi-year daily history.`);
    spyPriceCount >= 2000 ? pass("SPY daily prices imported", `${spyPriceCount} rows`) : fail("SPY daily prices imported", `${spyPriceCount} rows; expected benchmark daily history.`);
    const unadjustedSources = query(
      "SELECT ticker, COUNT(*) AS count FROM daily_price_bars WHERE sourceType = 'market_data_unadjusted_close' GROUP BY ticker ORDER BY ticker",
      [],
      defaultIsrgDbPath,
    );
    if (unadjustedSources.length) {
      warn("Daily price source uses unadjusted close proxy", JSON.stringify(unadjustedSources));
    }
  }

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model version exists", `${modelVersionCount} rows`) : fail("Model version exists", "No model version rows");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    ["ISRG", "isrg_v1_backend_pilot"],
    defaultIsrgDbPath,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0 ? pass(`Assumption set exists: ${scenario}`) : fail(`Assumption set missing: ${scenario}`);
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", ["ISRG"], defaultIsrgDbPath)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event found.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate})`);
    try {
      const valuation = await createIsrgValuationRun({ eventId: latestEvent.id, scenario: "Base", modelVersion: "isrg_v1_backend_pilot" });
      const run = valuation.valuationRun;
      finite(run.currentPrice) && finite(run.fairValue)
        ? pass("Valuation run can be created", `currentPrice=${run.currentPrice}; fairValue=${run.fairValue}`)
        : fail("Valuation run can be created", "currentPrice/fairValue not finite");
      if (valuation.id) execute("DELETE FROM valuation_runs WHERE id = ?", [valuation.id], defaultIsrgDbPath);
    } catch (error) {
      fail("Valuation run can be created", error instanceof Error ? error.message : String(error));
    }
  }

  const runRows = query(
    "SELECT * FROM valuation_runs WHERE ticker = ? AND modelVersion = ?",
    ["ISRG", "isrg_v1_backend_pilot"],
    defaultIsrgDbPath,
  );
  runRows.length >= eventCount * 3
    ? pass("Valuation runs exist for Bear/Base/Bull events", `${runRows.length} runs`)
    : fail("Valuation runs exist for Bear/Base/Bull events", `${runRows.length}/${eventCount * 3} runs`);

  const baseRuns = runRows
    .filter((row) => row.scenario === "Base")
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const distinctFairValues = new Set(baseRuns.filter((row) => finite(Number(row.fairValue))).map((row) => Number(row.fairValue).toFixed(2)));
  distinctFairValues.size >= Math.min(8, Math.max(1, baseRuns.length - 1))
    ? pass("Historical fair values are not a flat line", `${distinctFairValues.size} distinct Base fair values across ${baseRuns.length} runs`)
    : fail("Historical fair values are not a flat line", `${distinctFairValues.size} distinct Base fair values across ${baseRuns.length} runs`);

  const missingDailyPriceAnchor = baseRuns.filter((row) => !parseJson(row.dataSnapshotJson).asOfPriceSource?.priceDate);
  missingDailyPriceAnchor.length === 0
    ? pass("Historical as-of prices use daily market data where available", `${baseRuns.length} Base runs have daily price anchors`)
    : fail("Historical as-of prices use daily market data where available", `${missingDailyPriceAnchor.length} Base runs missing asOfPriceSource`);

  const futureLeaks = runRows.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson);
    const latestAsOf = snapshot.latestFinancialAsOfDate;
    return latestAsOf && latestAsOf > row.asOfDate;
  });
  futureLeaks.length === 0 ? pass("No future-data leakage", `${runRows.length} runs checked`) : fail("No future-data leakage", JSON.stringify(futureLeaks.slice(0, 3)));

  const quarterlyEvents = query(
    "SELECT * FROM reporting_events WHERE ticker = ? AND eventType = 'quarterly_earnings_release'",
    ["ISRG"],
    defaultIsrgDbPath,
  );
  const staleQuarterlyRuns = runRows.filter((row) => {
    const event = quarterlyEvents.find((item) => item.id === row.reportingEventId);
    if (!event) return false;
    const expected = `q${event.fiscalQuarter}_${event.fiscalYear}_snapshot`;
    const snapshot = parseJson(row.dataSnapshotJson);
    return snapshot.valuationPeriodId !== expected;
  });
  staleQuarterlyRuns.length === 0
    ? pass("Quarterly valuation runs use event-specific run-rate snapshots", `${quarterlyEvents.length} quarterly events checked`)
    : fail("Quarterly valuation runs use event-specific run-rate snapshots", JSON.stringify(staleQuarterlyRuns.slice(0, 5).map((row) => ({ eventId: row.reportingEventId, snapshot: parseJson(row.dataSnapshotJson) }))));

  const missingKpiSnapshots = runRows.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson);
    return !Array.isArray(snapshot.kpiSnapshotIds) || snapshot.kpiSnapshotIds.length === 0;
  });
  missingKpiSnapshots.length === 0 ? pass("Procedure/installed-base KPI snapshots are event-specific") : fail("Procedure/installed-base KPI snapshots are event-specific", `${missingKpiSnapshots.length} runs missing KPI ids`);

  const guidancePromoted = count(
    "guidance_items",
    "ticker = 'ISRG' AND valuationImpactAllowed != 0 AND (guidanceType LIKE '%candidate%' OR humanReviewStatus LIKE '%needs_review%')",
  );
  guidancePromoted === 0 ? pass("Guidance candidates are not valuation-impacting") : fail("Guidance candidates are not valuation-impacting", `${guidancePromoted} rows`);

  const transcriptModelReady = count("transcript_extractions", "ticker = 'ISRG' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0 ? pass("Transcript candidates are research-only") : fail("Transcript candidates are research-only", `${transcriptModelReady} rows`);

  const frontendFields = runRows.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson);
    return !row.reportingEventId || !row.asOfDate || !row.scenario || !snapshot.valuationPeriodId || !snapshot.marketSnapshotId;
  });
  frontendFields.length === 0 ? pass("Frontend-required persisted fields exist") : fail("Frontend-required persisted fields exist", `${frontendFields.length} runs missing fields`);

  const forecastAssumptionRows = query(
    "SELECT scenario, assumptionsJson FROM assumption_sets WHERE ticker = ? AND modelVersion = ? ORDER BY scenario",
    ["ISRG", "isrg_v1_backend_pilot"],
    defaultIsrgDbPath,
  ).map((row) => ({ scenario: row.scenario, keys: Object.keys(parseJson(row.assumptionsJson)).filter((key) => key !== "sourceType" && key !== "notes") }));
  pass("Forecast-assumption keys recorded", JSON.stringify(forecastAssumptionRows));

  const backtestTables = tables.has("backtest_runs");
  backtestTables ? pass("Backtest table exists") : fail("Backtest table exists");

  try {
    const backtest = runIsrgBacktest({ startDate: "2017-01-03", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const metricsOk = backtest.status === "completed" && finiteMetricSet(backtest.metrics?.isrgBuyHold) && finiteMetricSet(backtest.metrics?.spy);
    metricsOk
      ? pass("Backtest endpoint/service returns finite metrics", `ISRG CAGR=${backtest.metrics.isrgBuyHold.cagr}; SPY CAGR=${backtest.metrics.spy.cagr}`)
      : fail("Backtest endpoint/service returns finite metrics", JSON.stringify({ status: backtest.status, metrics: backtest.metrics, warnings: backtest.warnings }));
    if (backtest.id) execute("DELETE FROM backtest_runs WHERE id = ?", [backtest.id], defaultIsrgDbPath);
  } catch (error) {
    fail("Backtest endpoint/service returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  const qSnapshotCount = count("financial_periods", "ticker = 'ISRG' AND periodType = 'reporting_event_run_rate'");
  qSnapshotCount >= quarterlyEvents.length
    ? pass("Event-visible run-rate snapshots imported", `${qSnapshotCount} rows`)
    : fail("Event-visible run-rate snapshots imported", `${qSnapshotCount}/${quarterlyEvents.length} rows`);

  const aiRows = count("transcript_extractions", "ticker = 'ISRG' AND extractionType = 'ai_digital_progress'");
  aiRows >= eventCount ? pass("AI/digital research fields captured", `${aiRows} rows`) : fail("AI/digital research fields captured", `${aiRows}/${eventCount} rows`);

  printAndExit();
}

await main();
