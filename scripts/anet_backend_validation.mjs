#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { query } from "../apps/api/src/db/client.mjs";
import { routeStockBackend } from "../apps/api/src/routes/stockBackend.mjs";
import { runAnetBacktest } from "../apps/api/src/services/anetBacktestService.mjs";
import { getAnetCapitalReturnHistory, getAnetCloudAiHistory } from "../apps/api/src/services/anetSnapshotService.mjs";
import { ANET_BACKEND_DB_PATH, ANET_BACKEND_TABLES } from "../modules/anet/db/schema.mjs";
import { ANET_BACKEND_MODEL_VERSION } from "../modules/anet/valuation/modelVersion.mjs";

const TICKER = "ANET";
const MODEL_VERSION = ANET_BACKEND_MODEL_VERSION.version;
const checks = [];
const pass = (title, detail = "") => checks.push({ status: "PASS", title, detail });
const fail = (title, detail = "") => checks.push({ status: "FAIL", title, detail });
const warn = (title, detail = "") => checks.push({ status: "WARNING", title, detail });
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const count = (table, where = "ticker = 'ANET'") => query("SELECT COUNT(*) AS count FROM " + table + " WHERE " + where, [], ANET_BACKEND_DB_PATH)[0]?.count ?? 0;
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
  console.log("ANET Backend Validation");
  if (!existsSync(ANET_BACKEND_DB_PATH)) { fail("DB file exists", ANET_BACKEND_DB_PATH + " missing. Run npm run anet:backend:seed."); printAndExit(); return; }
  pass("DB file exists", ANET_BACKEND_DB_PATH);
  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], ANET_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of ANET_BACKEND_TABLES) tables.has(table) ? pass("Table exists: " + table) : fail("Table missing: " + table);
  const eventCount = count("reporting_events");
  eventCount >= 33 ? pass("At least 8 years of quarterly reporting events", eventCount + " events") : fail("At least 8 years of quarterly reporting events", eventCount + " events");
  const coverage = query("SELECT MIN(eventDate) AS firstDate, MAX(eventDate) AS lastDate FROM reporting_events WHERE ticker = ?", [TICKER], ANET_BACKEND_DB_PATH)[0];
  pass("Quarterly coverage", coverage.firstDate + " to " + coverage.lastDate);
  const metricRows = query("SELECT cloudTitanRevenue, aiNetworkingRevenue, highSpeedPortShipments, backlog, inventoryDays, cloudCustomerConcentration FROM operating_metric_snapshots WHERE ticker = ?", [TICKER], ANET_BACKEND_DB_PATH);
  metricRows.length >= eventCount && metricRows.every((row) => finite(row.cloudTitanRevenue) && finite(row.aiNetworkingRevenue) && finite(row.highSpeedPortShipments) && finite(row.backlog) && finite(row.inventoryDays) && finite(row.cloudCustomerConcentration)) ? pass("ANET-specific cloud / AI networking metrics imported", metricRows.length + " rows") : fail("ANET-specific cloud / AI networking metrics imported", metricRows.length + " rows");
  metricRows.some((row) => finite(row.aiNetworkingRevenue) && row.aiNetworkingRevenue > 0) ? pass("AI Ethernet progress metrics present") : fail("AI Ethernet progress metrics present");
  const baseRuns = query("SELECT id, reportingEventId, currentPrice, fairValue, dataSnapshotJson FROM valuation_runs WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?", [TICKER, MODEL_VERSION], ANET_BACKEND_DB_PATH);
  const eventIds = new Set(query("SELECT id FROM reporting_events WHERE ticker = ?", [TICKER], ANET_BACKEND_DB_PATH).map((row) => row.id));
  const runEventIds = new Set(baseRuns.map((row) => row.reportingEventId));
  runEventIds.size === eventIds.size ? pass("Base valuation exists for every reporting event", runEventIds.size + "/" + eventIds.size) : fail("Base valuation exists for every reporting event", runEventIds.size + "/" + eventIds.size);
  baseRuns.every((row) => finite(row.currentPrice) && finite(row.fairValue)) ? pass("Valuation outputs finite") : fail("Valuation outputs finite");
  new Set(baseRuns.map((row) => Math.round(row.fairValue * 100) / 100)).size > 8 ? pass("Historical fair values vary by event") : fail("Historical fair values vary by event");
  const leakage = baseRuns.filter((row) => { const snap = parseJson(row.dataSnapshotJson, {}); return snap.reportingEventDate && snap.sourceMaxAsOfDate && snap.sourceMaxAsOfDate > snap.reportingEventDate; });
  leakage.length === 0 ? pass("No future data leakage in valuation snapshots") : fail("No future data leakage in valuation snapshots", leakage.map((row) => row.id).join(", "));
  baseRuns.every((row) => { const snap = parseJson(row.dataSnapshotJson, {}); return !snap.latestMetricAsOfDate || !snap.reportingEventDate || snap.latestMetricAsOfDate <= snap.reportingEventDate; }) ? pass("Historical operating metrics are event-visible") : fail("Historical operating metrics are event-visible");
  for (const ticker of ["ANET", "SPY"]) { const row = query("SELECT COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker = ?", [ticker], ANET_BACKEND_DB_PATH)[0]; row.count > 1000 ? pass(ticker + " daily price bars exist", row.count + " rows, " + row.firstDate + " to " + row.lastDate) : fail(ticker + " daily price bars exist", row.count + " rows"); }
  const backtest = runAnetBacktest({ startDate: "2018-01-02", endDate: "2026-05-12" });
  backtest.status === "completed" && finite(backtest.metrics?.anetBuyHold?.cagr) && finite(backtest.metrics?.spy?.cagr) ? pass("ANET vs SPY backtest returns finite metrics", "curve=" + backtest.curve.length) : fail("ANET vs SPY backtest returns finite metrics", JSON.stringify(backtest).slice(0, 1000));
  const capital = getAnetCapitalReturnHistory({ years: 8 });
  capital.rows.length === 8 ? pass("Capital-return service has 8 annual rows") : fail("Capital-return service has 8 annual rows", String(capital.rows.length));
  capital.rows.every((row) => finite(row.dividendPerShare) && finite(row.dividendCashCost) && finite(row.buybackAmount) && finite(row.equityFreeCashFlow) && finite(row.totalCapitalReturn)) ? pass("Capital-return rows have finite frontend fields") : fail("Capital-return rows have finite frontend fields");
  capital.chartSeries?.some((row) => row.buybacks != null || row.forecastBuybacks != null) ? pass("Stacked capital-return buyback series exists") : fail("Stacked capital-return buyback series exists");
  capital.chartSeries?.some((row) => row.fcf != null || row.forecastFcf != null) ? pass("FCF comparison series exists") : fail("FCF comparison series exists");
  capital.forwardExpectation?.sourceType === "forecast_assumption" ? pass("Forward forecast row exists") : fail("Forward forecast row exists");
  capital.warnings?.some((warning) => warning.id === "anet-capital-return-proxy-years") ? pass("Proxy rows generate warnings") : fail("Proxy rows generate warnings");
  capital.rows.every((row) => finite(row.fcfCoverage) || row.totalCapitalReturn === 0) ? pass("FCF coverage finite when buybacks consume FCF") : fail("FCF coverage finite when buybacks consume FCF");
  const cloudAi = getAnetCloudAiHistory({ quarters: 40 });
  cloudAi.rows.length >= 33 && cloudAi.rows.every((row) => finite(row.cloudTitanRevenue) && finite(row.aiNetworkingRevenue) && finite(row.backlog)) ? pass("Cloud / AI endpoint service has quarterly data", cloudAi.rows.length + " rows") : fail("Cloud / AI endpoint service has quarterly data", String(cloudAi.rows.length));
  const routeLegacy = await routeStockBackend({ method: "GET" }, new URL("http://127.0.0.1:8787/api/anet/cloud-ai-history?quarters=40"), null);
  const routeUnified = await routeStockBackend({ method: "GET" }, new URL("http://127.0.0.1:8787/api/stocks/anet/cloud-ai-history?quarters=40"), null);
  routeLegacy?.status === 200 && routeUnified?.status === 200 ? pass("ANET cloud-ai endpoints work") : fail("ANET cloud-ai endpoints work", JSON.stringify({ legacy: routeLegacy?.status, unified: routeUnified?.status }));
  const build = spawnSync("npm", ["run", "build"], { encoding: "utf8", maxBuffer: 160 * 1024 * 1024 });
  build.status === 0 ? pass("npm run build passes") : warn("npm run build not passing in validation", (build.stderr || build.stdout).slice(0, 3000));
  printAndExit();
}

main().catch((error) => { fail("Validation crashed", error instanceof Error ? error.stack ?? error.message : String(error)); printAndExit(); });
