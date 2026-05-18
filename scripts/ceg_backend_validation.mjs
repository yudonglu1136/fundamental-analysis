#!/usr/bin/env node
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { runCegBacktest } from "../apps/api/src/services/cegBacktestService.mjs";
import { CEG_BACKEND_DB_PATH, CEG_BACKEND_TABLES } from "../modules/ceg/db/schema.mjs";
import { CEG_BACKEND_MODEL_VERSION } from "../modules/ceg/valuation/modelVersion.mjs";

const checks = [];
const TICKER = "CEG";

function record(status, title, detail = "") {
  checks.push({ status, title, detail });
}
const pass = (title, detail) => record("PASS", title, detail);
const warn = (title, detail) => record("WARNING", title, detail);
const fail = (title, detail) => record("FAIL", title, detail);

function count(table, where = "ticker = 'CEG'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], CEG_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

if (!existsSync(CEG_BACKEND_DB_PATH)) {
  fail("DB file exists", `${CEG_BACKEND_DB_PATH} is missing. Run npm run ceg:backend:seed.`);
} else {
  pass("DB file exists", CEG_BACKEND_DB_PATH);
}

if (existsSync(CEG_BACKEND_DB_PATH)) {
  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], CEG_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of CEG_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`);
  }

  const events = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate ASC", [TICKER], CEG_BACKEND_DB_PATH);
  events.length >= 17 ? pass("Quarterly reporting-event coverage", `${events.length} events, ${events[0]?.eventDate} to ${events.at(-1)?.eventDate}`) : fail("Quarterly reporting-event coverage", `${events.length} events found.`);
  if (events[0]?.eventDate > "2022-05-12") fail("First CEG event coverage", `First event is ${events[0]?.eventDate}`);
  warn("Standalone public-company history limit", "CEG standalone public history starts in 2022; no pre-spin standalone rows were fabricated.");

  const annualRows = query("SELECT fiscalYear, freeCashFlow, dividendsPaid, buybacks FROM financial_periods WHERE ticker = ? AND periodType = 'annual' ORDER BY fiscalYear ASC", [TICKER], CEG_BACKEND_DB_PATH);
  annualRows.length >= 4 ? pass("Annual financial rows", `${annualRows.length} annual SEC-backed rows`) : fail("Annual financial rows", `${annualRows.length} rows found.`);
  for (const row of annualRows) {
    ["freeCashFlow", "dividendsPaid", "buybacks"].every((key) => finite(row[key]))
      ? pass(`Capital-return fields finite FY${row.fiscalYear}`)
      : fail(`Capital-return fields finite FY${row.fiscalYear}`, JSON.stringify(row));
  }

  const prices = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('CEG','SPY') GROUP BY ticker",
    [],
    CEG_BACKEND_DB_PATH,
  );
  const priceMap = new Map(prices.map((row) => [row.ticker, row]));
  for (const ticker of ["CEG", "SPY"]) {
    const row = priceMap.get(ticker);
    row?.count >= 1000 ? pass(`${ticker} daily price bars`, `${row.count} rows, ${row.firstDate} to ${row.lastDate}`) : fail(`${ticker} daily price bars`, JSON.stringify(row ?? null));
  }

  const runs = query("SELECT reportingEventId, fairValue, currentPrice FROM valuation_runs WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?", [TICKER, CEG_BACKEND_MODEL_VERSION.version], CEG_BACKEND_DB_PATH);
  const fairValues = runs.map((row) => Number(row.fairValue)).filter(Number.isFinite);
  runs.length >= events.length ? pass("Base valuation exists for each event", `${runs.length} Base runs`) : fail("Base valuation exists for each event", `${runs.length} runs for ${events.length} events`);
  fairValues.length === runs.length ? pass("Valuation outputs finite", `${fairValues.length} finite fair values`) : fail("Valuation outputs finite", `${fairValues.length}/${runs.length} finite`);
  new Set(fairValues.map((value) => value.toFixed(2))).size > 3 ? pass("Historical fair values vary by event", `${new Set(fairValues.map((value) => value.toFixed(2))).size} unique fair values`) : fail("Historical fair values vary by event", "Fair values are not varying enough.");

  const valuationSnapshots = query(
    "SELECT reportingEventId, asOfDate, dataSnapshotJson FROM valuation_runs WHERE ticker = ? AND scenario = 'Base'",
    [TICKER],
    CEG_BACKEND_DB_PATH,
  );
  const futureLeak = valuationSnapshots.find((run) => {
    const snapshot = JSON.parse(run.dataSnapshotJson || "{}");
    return (snapshot.financialPeriods ?? []).some((row) => String(row.asOfDate ?? "") > run.asOfDate);
  });
  futureLeak ? fail("No future data leakage in valuation snapshots", JSON.stringify({ reportingEventId: futureLeak.reportingEventId, asOfDate: futureLeak.asOfDate })) : pass("No future data leakage in valuation snapshots", "Persisted dataSnapshotJson contains only financial rows with asOfDate <= event date.");

  const backtest = runCegBacktest({ startDate: "2022-01-19", endDate: "2026-05-15" });
  backtest.status === "completed" && finite(backtest.metrics?.cegBuyHold?.cagr) && finite(backtest.metrics?.spy?.cagr)
    ? pass("Backtest returns finite metrics", `CEG CAGR ${(backtest.metrics.cegBuyHold.cagr * 100).toFixed(1)}%, SPY CAGR ${(backtest.metrics.spy.cagr * 100).toFixed(1)}%`)
    : fail("Backtest returns finite metrics", JSON.stringify(backtest));
}

for (const check of checks) {
  console.log(`${check.status}: ${check.title}${check.detail ? ` - ${check.detail}` : ""}`);
}
const failed = checks.filter((check) => check.status === "FAIL");
const warnings = checks.filter((check) => check.status === "WARNING");
console.log(JSON.stringify({ status: failed.length ? "failed" : "passed", failures: failed.length, warnings: warnings.length, dbPath: CEG_BACKEND_DB_PATH }, null, 2));
if (failed.length) process.exitCode = 1;
