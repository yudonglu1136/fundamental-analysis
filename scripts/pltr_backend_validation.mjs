#!/usr/bin/env node
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { getPltrHistoricalValuations } from "../apps/api/src/services/pltrValuationService.mjs";
import { PLTR_BACKEND_DB_PATH, PLTR_BACKEND_TABLES } from "../modules/pltr/db/schema.mjs";
import { PLTR_BACKEND_MODEL_VERSION } from "../modules/pltr/valuation/modelVersion.mjs";

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

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function main() {
  console.log("PLTR Backend Validation");
  if (!existsSync(PLTR_BACKEND_DB_PATH)) {
    fail("DB file exists", `${PLTR_BACKEND_DB_PATH} missing. Run npm run pltr:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", PLTR_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], PLTR_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of PLTR_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`);
  }

  const events = query(
    "SELECT id, eventDate, fiscalPeriod FROM reporting_events WHERE ticker = 'PLTR' ORDER BY eventDate",
    [],
    PLTR_BACKEND_DB_PATH,
  );
  events.length >= 8 ? pass("Eight PLTR reporting events exist", `${events.length} events`) : fail("Eight PLTR reporting events exist", `${events.length} events found`);

  const prices = query(
    "SELECT COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source FROM daily_price_bars WHERE ticker = 'PLTR'",
    [],
    PLTR_BACKEND_DB_PATH,
  )[0];
  prices?.count > 200 ? pass("PLTR daily price bars imported", `${prices.count} rows, ${prices.firstDate} to ${prices.lastDate}; source=${prices.source}`) : fail("PLTR daily price bars imported", "Run npm run pltr:backend:import-prices.");

  const missingPriceEvents = events.filter((event) => {
    const row = query(
      "SELECT adjustedClose FROM daily_price_bars WHERE ticker = 'PLTR' AND priceDate <= ? AND adjustedClose IS NOT NULL ORDER BY priceDate DESC LIMIT 1",
      [event.eventDate],
      PLTR_BACKEND_DB_PATH,
    )[0];
    return !isFiniteNumber(row?.adjustedClose);
  });
  missingPriceEvents.length === 0
    ? pass("Every reporting event has nearest-prior as-of price", `${events.length} event prices resolved`)
    : fail("Every reporting event has nearest-prior as-of price", missingPriceEvents.map((event) => event.id).join(", "));

  const modelVersionCount = query(
    "SELECT COUNT(*) AS count FROM model_versions WHERE ticker = 'PLTR' AND version = ?",
    [PLTR_BACKEND_MODEL_VERSION.version],
    PLTR_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  modelVersionCount > 0 ? pass("PLTR model version exists", PLTR_BACKEND_MODEL_VERSION.version) : fail("PLTR model version exists");

  const valuationRuns = query(
    "SELECT COUNT(*) AS count FROM valuation_runs WHERE ticker = 'PLTR' AND scenario = 'Base' AND modelVersion = ?",
    [PLTR_BACKEND_MODEL_VERSION.version],
    PLTR_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  valuationRuns >= events.length ? pass("Base price-anchor valuation rows exist", `${valuationRuns}/${events.length}`) : warn("Base price-anchor valuation rows exist", `${valuationRuns}/${events.length}; endpoint can synthesize price anchors but run npm run pltr:backend:backfill-valuations to persist them.`);

  const history = getPltrHistoricalValuations({ scenario: "Base", modelVersion: PLTR_BACKEND_MODEL_VERSION.version });
  const pricedHistory = history.filter((row) => isFiniteNumber(row.valuationRun?.currentPrice));
  pricedHistory.length === history.length
    ? pass("Historical valuations endpoint returns as-of prices", `${pricedHistory.length}/${history.length}`)
    : fail("Historical valuations endpoint returns as-of prices", `${pricedHistory.length}/${history.length}`);

  const failed = checks.filter((check) => check.status === "FAIL");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.title}${check.detail ? ` - ${check.detail}` : ""}`);
  }
  if (failed.length) process.exitCode = 1;
}

function printAndExit() {
  for (const check of checks) {
    console.log(`[${check.status}] ${check.title}${check.detail ? ` - ${check.detail}` : ""}`);
  }
  process.exitCode = checks.some((check) => check.status === "FAIL") ? 1 : 0;
}

main();
