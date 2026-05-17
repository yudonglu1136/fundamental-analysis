#!/usr/bin/env node
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { getTsmHistoricalValuations } from "../apps/api/src/services/tsmValuationService.mjs";
import { TSM_BACKEND_DB_PATH, TSM_BACKEND_TABLES } from "../modules/tsm/db/schema.mjs";
import { TSM_BACKEND_MODEL_VERSION } from "../modules/tsm/valuation/modelVersion.mjs";

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
  return Number.isFinite(Number(value));
}

function uniqueRounded(values) {
  return new Set(values.filter(isFiniteNumber).map((value) => Number(value).toFixed(2)));
}

function main() {
  console.log("TSM Backend Validation");
  if (!existsSync(TSM_BACKEND_DB_PATH)) {
    fail("DB file exists", `${TSM_BACKEND_DB_PATH} missing. Run npm run tsm:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", TSM_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], TSM_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of TSM_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`);
  }

  const events = query(
    "SELECT id, eventDate, fiscalPeriod, sourceType, sourceUrl FROM reporting_events WHERE ticker = 'TSM' ORDER BY eventDate",
    [],
    TSM_BACKEND_DB_PATH,
  );
  events.length >= 32 ? pass("At least eight years of TSM reporting events exist", `${events.length} events`) : fail("At least eight years of TSM reporting events exist", `${events.length} events found`);
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  firstEvent?.eventDate <= "2018-04-30" && lastEvent?.eventDate >= "2026-04-01"
    ? pass("TSM reporting-event coverage spans 2018 to 2026", `${firstEvent.eventDate} to ${lastEvent.eventDate}`)
    : fail("TSM reporting-event coverage spans 2018 to 2026", `${firstEvent?.eventDate ?? "n/a"} to ${lastEvent?.eventDate ?? "n/a"}`);

  const financialRows = query(
    "SELECT id, eventId, asOfDate, revenueUsd, grossMargin, operatingMargin, sourceType, sourceUrl FROM financial_periods WHERE ticker = 'TSM' ORDER BY asOfDate",
    [],
    TSM_BACKEND_DB_PATH,
  );
  financialRows.length >= events.length
    ? pass("Financial period rows cover reporting events", `${financialRows.length}/${events.length}`)
    : fail("Financial period rows cover reporting events", `${financialRows.length}/${events.length}`);

  const missingSources = financialRows.filter((row) => !row.sourceUrl || row.sourceType !== "official_actual");
  missingSources.length === 0
    ? pass("Official actual rows carry source URLs", `${financialRows.length} rows`)
    : warn("Some financial rows lack official source discipline", missingSources.map((row) => row.id).join(", "));

  const prices = query(
    "SELECT COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source FROM daily_price_bars WHERE ticker = 'TSM'",
    [],
    TSM_BACKEND_DB_PATH,
  )[0];
  prices?.count > 1500
    ? pass("TSM daily price bars imported", `${prices.count} rows, ${prices.firstDate} to ${prices.lastDate}; source=${prices.source}`)
    : fail("TSM daily price bars imported", "Run npm run tsm:backend:import-prices.");

  const missingPriceEvents = events.filter((event) => {
    const row = query(
      "SELECT priceDate, adjustedClose FROM daily_price_bars WHERE ticker = 'TSM' AND priceDate <= ? AND adjustedClose IS NOT NULL ORDER BY priceDate DESC LIMIT 1",
      [event.eventDate],
      TSM_BACKEND_DB_PATH,
    )[0];
    return !isFiniteNumber(row?.adjustedClose);
  });
  missingPriceEvents.length === 0
    ? pass("Every reporting event has nearest-prior as-of ADR price", `${events.length} event prices resolved`)
    : fail("Every reporting event has nearest-prior as-of ADR price", missingPriceEvents.map((event) => event.id).join(", "));

  const modelVersionCount = query(
    "SELECT COUNT(*) AS count FROM model_versions WHERE ticker = 'TSM' AND version = ?",
    [TSM_BACKEND_MODEL_VERSION.version],
    TSM_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  modelVersionCount > 0 ? pass("TSM model version exists", TSM_BACKEND_MODEL_VERSION.version) : fail("TSM model version exists");

  const assumptionCount = query(
    "SELECT COUNT(*) AS count FROM assumption_sets WHERE ticker = 'TSM' AND modelVersion = ?",
    [TSM_BACKEND_MODEL_VERSION.version],
    TSM_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  assumptionCount >= 3 ? pass("Scenario assumption sets exist", `${assumptionCount} rows`) : fail("Scenario assumption sets exist", `${assumptionCount} rows`);

  const valuationRuns = query(
    "SELECT currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, dataSnapshotJson FROM valuation_runs WHERE ticker = 'TSM' AND scenario = 'Base' AND modelVersion = ? ORDER BY asOfDate",
    [TSM_BACKEND_MODEL_VERSION.version],
    TSM_BACKEND_DB_PATH,
  );
  valuationRuns.length >= events.length
    ? pass("Base valuation rows exist for reporting events", `${valuationRuns.length}/${events.length}`)
    : fail("Base valuation rows exist for reporting events", `${valuationRuns.length}/${events.length}; run npm run tsm:backend:backfill-valuations.`);

  const nonFiniteRuns = valuationRuns.filter(
    (row) => !isFiniteNumber(row.currentPrice) || !isFiniteNumber(row.fairValue) || !isFiniteNumber(row.targetPrice3Y) || !isFiniteNumber(row.expectedShareholderCagr),
  );
  nonFiniteRuns.length === 0 ? pass("Valuation outputs are finite") : fail("Valuation outputs are finite", `${nonFiniteRuns.length} bad rows`);

  const fairValueVariation = uniqueRounded(valuationRuns.map((row) => row.fairValue)).size;
  fairValueVariation > Math.min(3, valuationRuns.length - 1)
    ? pass("Historical fair values vary by event", `${fairValueVariation} distinct rounded fair values`)
    : fail("Historical fair values vary by event", `${fairValueVariation} distinct rounded fair values; likely future-data leakage or static inputs.`);

  const history = getTsmHistoricalValuations({ scenario: "Base", modelVersion: TSM_BACKEND_MODEL_VERSION.version });
  const pricedHistory = history.filter((row) => isFiniteNumber(row.valuationRun?.currentPrice) && isFiniteNumber(row.valuationRun?.fairValue));
  pricedHistory.length === history.length
    ? pass("Historical valuations endpoint returns price and fair value", `${pricedHistory.length}/${history.length}`)
    : fail("Historical valuations endpoint returns price and fair value", `${pricedHistory.length}/${history.length}`);

  const futureLeakage = history.filter((row) => {
    const fp = row.valuationRun?.dataSnapshotJson?.financialPeriod;
    const priceDate = row.valuationRun?.dataSnapshotJson?.asOfPriceSource?.priceDate;
    return (fp?.asOfDate && fp.asOfDate > row.event.eventDate) || (priceDate && priceDate > row.event.eventDate);
  });
  futureLeakage.length === 0
    ? pass("No obvious future-data leakage in valuation snapshots")
    : fail("No obvious future-data leakage in valuation snapshots", futureLeakage.map((row) => row.event.id).join(", "));

  const proxyRows = query(
    "SELECT COUNT(*) AS count FROM platform_mix WHERE ticker = 'TSM' AND sourceType != 'official_actual'",
    [],
    TSM_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  proxyRows > 0
    ? warn("Proxy/research-only mix rows remain", `${proxyRows} platform rows need management-report backfill`)
    : pass("All platform mix rows are official");

  printAndExit();
}

function printAndExit() {
  for (const check of checks) {
    console.log(`[${check.status}] ${check.title}${check.detail ? ` - ${check.detail}` : ""}`);
  }
  process.exitCode = checks.some((check) => check.status === "FAIL") ? 1 : 0;
}

main();
