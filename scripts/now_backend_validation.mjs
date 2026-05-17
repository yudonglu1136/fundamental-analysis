#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { query } from "../apps/api/src/db/client.mjs";
import { routeStockBackend } from "../apps/api/src/routes/stockBackend.mjs";
import { runNowBacktest } from "../apps/api/src/services/nowBacktestService.mjs";
import { getNowCapitalReturnHistory, getNowSubscriptionAgentHistory } from "../apps/api/src/services/nowSnapshotService.mjs";
import { NOW_BACKEND_DB_PATH, NOW_BACKEND_TABLES } from "../modules/now/db/schema.mjs";
import { NOW_BACKEND_MODEL_VERSION } from "../modules/now/valuation/modelVersion.mjs";

const TICKER = "NOW";
const MODEL_VERSION = NOW_BACKEND_MODEL_VERSION.version;
const checks = [];
const pass = (title, detail = "") => checks.push({ status: "PASS", title, detail });
const fail = (title, detail = "") => checks.push({ status: "FAIL", title, detail });
const warn = (title, detail = "") => checks.push({ status: "WARNING", title, detail });
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const count = (table, where = "ticker = 'NOW'") => query("SELECT COUNT(*) AS count FROM " + table + " WHERE " + where, [], NOW_BACKEND_DB_PATH)[0]?.count ?? 0;
const parseJson = (value, fallback = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };

function printAndExit() {
  const totals = { PASS: checks.filter((c) => c.status === "PASS").length, WARNING: checks.filter((c) => c.status === "WARNING").length, FAIL: checks.filter((c) => c.status === "FAIL").length };
  for (const check of checks) console.log(check.status + ": " + check.title + (check.detail ? " - " + check.detail : ""));
  console.log("\nPASS: " + totals.PASS);
  console.log("WARNING: " + totals.WARNING);
  console.log("FAIL: " + totals.FAIL);
  process.exit(totals.FAIL > 0 ? 1 : 0);
}

async function main() {
  console.log("NOW Backend Validation");
  if (!existsSync(NOW_BACKEND_DB_PATH)) { fail("DB file exists", NOW_BACKEND_DB_PATH + " missing. Run npm run now:backend:seed."); printAndExit(); return; }
  pass("DB file exists", NOW_BACKEND_DB_PATH);
  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], NOW_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of NOW_BACKEND_TABLES) tables.has(table) ? pass("Table exists: " + table) : fail("Table missing: " + table);
  const eventCount = count("reporting_events");
  eventCount >= 33 ? pass("At least 8 years of quarterly reporting events", eventCount + " events") : fail("At least 8 years of quarterly reporting events", eventCount + " events");
  const coverage = query("SELECT MIN(eventDate) AS firstDate, MAX(eventDate) AS lastDate FROM reporting_events WHERE ticker = ?", [TICKER], NOW_BACKEND_DB_PATH)[0];
  pass("Quarterly coverage", coverage.firstDate + " to " + coverage.lastDate);
  const metricRows = query("SELECT subscriptionRevenue, currentRpo, remainingPerformanceObligations, agenticAiArr, agenticAiCustomers, proPlusAdoptionRate, netRetentionRate FROM operating_metric_snapshots WHERE ticker = ?", [TICKER], NOW_BACKEND_DB_PATH);
  metricRows.length >= eventCount && metricRows.every((row) => finite(row.subscriptionRevenue) && finite(row.currentRpo) && finite(row.remainingPerformanceObligations) && finite(row.netRetentionRate)) ? pass("NOW-specific subscription/RPO metrics imported", metricRows.length + " rows") : fail("NOW-specific subscription/RPO metrics imported", metricRows.length + " rows");
  metricRows.some((row) => finite(row.agenticAiArr) && row.agenticAiArr > 0) ? pass("Agentic AI progress metrics present") : fail("Agentic AI progress metrics present");
  const baseRuns = query("SELECT id, reportingEventId, currentPrice, fairValue, dataSnapshotJson FROM valuation_runs WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?", [TICKER, MODEL_VERSION], NOW_BACKEND_DB_PATH);
  const eventIds = new Set(query("SELECT id FROM reporting_events WHERE ticker = ?", [TICKER], NOW_BACKEND_DB_PATH).map((row) => row.id));
  const runEventIds = new Set(baseRuns.map((row) => row.reportingEventId));
  runEventIds.size === eventIds.size ? pass("Base valuation exists for every reporting event", runEventIds.size + "/" + eventIds.size) : fail("Base valuation exists for every reporting event", runEventIds.size + "/" + eventIds.size);
  baseRuns.every((row) => finite(row.currentPrice) && finite(row.fairValue)) ? pass("Valuation outputs finite") : fail("Valuation outputs finite");
  new Set(baseRuns.map((row) => Math.round(row.fairValue * 100) / 100)).size > 8 ? pass("Historical fair values vary by event") : fail("Historical fair values vary by event");
  const leakage = baseRuns.filter((row) => { const snap = parseJson(row.dataSnapshotJson, {}); return snap.reportingEventDate && snap.sourceMaxAsOfDate && snap.sourceMaxAsOfDate > snap.reportingEventDate; });
  leakage.length === 0 ? pass("No future data leakage in valuation snapshots") : fail("No future data leakage in valuation snapshots", leakage.map((row) => row.id).join(", "));
  const oldAgentLeak = baseRuns.filter((row) => { const snap = parseJson(row.dataSnapshotJson, {}); return snap.reportingEventDate < "2023-01-01" && (snap.nowAnalyticalFramework?.agenticAiArr ?? 0) > 0; });
  oldAgentLeak.length === 0 ? pass("Historical Agent AI metrics do not leak into pre-2023 events") : fail("Historical Agent AI metrics do not leak into pre-2023 events", oldAgentLeak.map((row) => row.id).join(", "));
  for (const ticker of ["NOW", "SPY"]) { const row = query("SELECT COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker = ?", [ticker], NOW_BACKEND_DB_PATH)[0]; row.count > 1000 ? pass(ticker + " daily price bars exist", row.count + " rows, " + row.firstDate + " to " + row.lastDate) : fail(ticker + " daily price bars exist", row.count + " rows"); }
  const latestNowPrice = query("SELECT priceDate, adjustedClose, sourceType FROM daily_price_bars WHERE ticker = ? ORDER BY priceDate DESC LIMIT 1", [TICKER], NOW_BACKEND_DB_PATH)[0];
  const latestNowMarket = query("SELECT asOfDate, currentPrice, sharesOutstanding FROM market_snapshots WHERE ticker = ? ORDER BY asOfDate DESC LIMIT 1", [TICKER], NOW_BACKEND_DB_PATH)[0];
  Number(latestNowPrice?.adjustedClose) > 0 && Number(latestNowPrice?.adjustedClose) < 250
    ? pass("NOW daily prices are split-adjusted", latestNowPrice.priceDate + " adjustedClose=" + latestNowPrice.adjustedClose + " sourceType=" + latestNowPrice.sourceType)
    : fail("NOW daily prices are split-adjusted", JSON.stringify(latestNowPrice));
  Number(latestNowMarket?.currentPrice) > 0 && Number(latestNowMarket?.currentPrice) < 250 && Number(latestNowMarket?.sharesOutstanding) >= 1000
    ? pass("NOW market snapshots are split-adjusted", latestNowMarket.asOfDate + " price=" + latestNowMarket.currentPrice + " shares=" + latestNowMarket.sharesOutstanding)
    : fail("NOW market snapshots are split-adjusted", JSON.stringify(latestNowMarket));
  const backtest = runNowBacktest({ startDate: "2018-01-02", endDate: "2026-05-12" });
  backtest.status === "completed" && finite(backtest.metrics?.nowBuyHold?.cagr) && finite(backtest.metrics?.spy?.cagr) ? pass("NOW vs SPY backtest returns finite metrics", "curve=" + backtest.curve.length) : fail("NOW vs SPY backtest returns finite metrics", JSON.stringify(backtest).slice(0, 1000));
  const capital = getNowCapitalReturnHistory({ years: 8 });
  capital.rows.length === 8 ? pass("Capital-return service has 8 annual rows") : fail("Capital-return service has 8 annual rows", String(capital.rows.length));
  capital.rows.every((row) => finite(row.dividendPerShare) && finite(row.dividendCashCost) && finite(row.buybackAmount) && finite(row.equityFreeCashFlow) && finite(row.totalCapitalReturn)) ? pass("Capital-return rows have finite frontend fields") : fail("Capital-return rows have finite frontend fields");
  capital.chartSeries?.some((row) => row.buybacks != null || row.forecastBuybacks != null) ? pass("Stacked capital-return buyback series exists") : fail("Stacked capital-return buyback series exists");
  capital.chartSeries?.some((row) => row.fcf != null || row.forecastFcf != null) ? pass("FCF comparison series exists") : fail("FCF comparison series exists");
  capital.forwardExpectation?.sourceType === "forecast_assumption" ? pass("Forward forecast row exists") : fail("Forward forecast row exists");
  capital.warnings?.some((warning) => warning.id === "now-capital-return-proxy-years") ? pass("Proxy rows generate warnings") : fail("Proxy rows generate warnings");
  capital.rows.every((row) => finite(row.fcfCoverage) || row.totalCapitalReturn === 0) ? pass("FCF coverage finite when buybacks consume FCF") : fail("FCF coverage finite when buybacks consume FCF");
  const sub = getNowSubscriptionAgentHistory({ quarters: 40 });
  sub.rows.length >= 33 && sub.rows.every((row) => finite(row.subscriptionRevenue) && finite(row.currentRpo)) ? pass("Subscription-Agent endpoint service has quarterly data", sub.rows.length + " rows") : fail("Subscription-Agent endpoint service has quarterly data", String(sub.rows.length));
  const routeLegacy = await routeStockBackend({ method: "GET" }, new URL("http://127.0.0.1:8787/api/now/subscription-agent-history?quarters=40"), null);
  const routeUnified = await routeStockBackend({ method: "GET" }, new URL("http://127.0.0.1:8787/api/stocks/now/subscription-agent-history?quarters=40"), null);
  routeLegacy?.status === 200 && routeUnified?.status === 200 ? pass("NOW subscription-agent endpoints work") : fail("NOW subscription-agent endpoints work", JSON.stringify({ legacy: routeLegacy?.status, unified: routeUnified?.status }));
  const build = spawnSync("npm", ["run", "build"], { encoding: "utf8", maxBuffer: 160 * 1024 * 1024 });
  build.status === 0 ? pass("npm run build passes") : warn("npm run build not passing in validation", (build.stderr || build.stdout).slice(0, 3000));
  printAndExit();
}

main().catch((error) => { fail("Validation crashed", error instanceof Error ? error.stack ?? error.message : String(error)); printAndExit(); });
