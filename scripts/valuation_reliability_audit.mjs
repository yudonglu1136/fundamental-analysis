#!/usr/bin/env node
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { getIsrgReportingEvents, getIsrgSnapshot, defaultIsrgDbPath } from "../apps/api/src/services/isrgSnapshotService.mjs";
import { getMaReportingEvents, getMaSnapshot } from "../apps/api/src/services/maSnapshotService.mjs";
import { getVReportingEvents, getVSnapshot } from "../apps/api/src/services/vSnapshotService.mjs";
import { runIsrgBackendValuation } from "../modules/isrg/valuation/adapter.mjs";
import { ISRG_BACKEND_MODEL_VERSION } from "../modules/isrg/valuation/modelVersion.mjs";
import { MA_BACKEND_DB_PATH } from "../modules/ma/db/schema.mjs";
import { runMaBackendValuation } from "../modules/ma/valuation/adapter.mjs";
import { MA_BACKEND_MODEL_VERSION } from "../modules/ma/valuation/modelVersion.mjs";
import { V_BACKEND_DB_PATH } from "../modules/v/db/schema.mjs";
import { runVBackendValuation } from "../modules/v/valuation/adapter.mjs";
import { V_BACKEND_MODEL_VERSION } from "../modules/v/valuation/modelVersion.mjs";

const checks = [];

function record(status, ticker, title, detail = "") {
  checks.push({ status, ticker, title, detail });
}

function pass(ticker, title, detail = "") {
  record("PASS", ticker, title, detail);
}

function warn(ticker, title, detail = "") {
  record("WARNING", ticker, title, detail);
}

function fail(ticker, title, detail = "") {
  record("FAIL", ticker, title, detail);
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function rounded(value, decimals = 2) {
  return Number(Number(value).toFixed(decimals));
}

function priceRows(dbPath, ticker) {
  return query(
    `SELECT ticker, sourceType, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate
     FROM daily_price_bars
     WHERE ticker = ?
     GROUP BY ticker, sourceType
     ORDER BY sourceType`,
    [ticker],
    dbPath,
  );
}

function nearestDailyPrice(dbPath, ticker, eventDate) {
  return query(
    `SELECT priceDate, adjustedClose, close, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [ticker, eventDate],
    dbPath,
  )[0] ?? null;
}

function latestBaseRuns(dbPath, ticker, modelVersion) {
  return query(
    `SELECT e.id AS eventId, e.eventDate, e.fiscalPeriod, v.id AS valuationRunId,
            v.currentPrice, v.fairValue, v.upsideDownside, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     JOIN (
       SELECT reportingEventId, MAX(createdAt) AS latestCreatedAt
       FROM valuation_runs
       WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?
       GROUP BY reportingEventId
     ) latest ON latest.reportingEventId = v.reportingEventId AND latest.latestCreatedAt = v.createdAt
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate`,
    [ticker, modelVersion, ticker, modelVersion],
    dbPath,
  );
}

function scenarioRowsForLatestEvent(dbPath, ticker, modelVersion, eventId) {
  return query(
    `SELECT scenario, currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, dataSnapshotJson
     FROM valuation_runs
     WHERE ticker = ? AND modelVersion = ? AND reportingEventId = ?
     ORDER BY scenario, createdAt DESC`,
    [ticker, modelVersion, eventId],
    dbPath,
  );
}

function cloneWithPrice(snapshot, price) {
  const cloned = JSON.parse(JSON.stringify(snapshot));
  cloned.marketSnapshot = {
    ...(cloned.marketSnapshot ?? {}),
    currentPrice: price,
    priceDate: cloned.marketSnapshot?.priceDate ?? cloned.asOfDate,
    rawJson: {
      ...((cloned.marketSnapshot?.rawJson && typeof cloned.marketSnapshot.rawJson === "object") ? cloned.marketSnapshot.rawJson : {}),
      reliabilityAuditOverride: "Current price overridden to test whether fair value is mechanically anchored to price.",
    },
  };
  return cloned;
}

function extractSnapshotDates(snapshot) {
  return [
    snapshot.sourceMaxAsOfDate,
    snapshot.latestFinancialAsOfDate,
    snapshot.latestMetricAsOfDate,
    snapshot.asOfPriceSource?.priceDate,
    snapshot.priceDate,
    snapshot.reportingEventDate,
  ].filter(Boolean);
}

function checkPersistedRuns(config, events) {
  const runs = latestBaseRuns(config.dbPath, config.ticker, config.modelVersion);
  const eventIds = new Set(events.map((event) => event.id));
  const runEventIds = new Set(runs.map((row) => row.eventId));
  runEventIds.size === eventIds.size
    ? pass(config.ticker, "Base valuation exists for every reporting event", `${runEventIds.size}/${eventIds.size}`)
    : fail(config.ticker, "Base valuation exists for every reporting event", `${runEventIds.size}/${eventIds.size}`);

  const duplicates = query(
    `SELECT reportingEventId, COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?
     GROUP BY reportingEventId
     HAVING COUNT(*) > 1`,
    [config.ticker, config.modelVersion],
    config.dbPath,
  );
  duplicates.length === 0
    ? pass(config.ticker, "No duplicate persisted Base runs")
    : warn(config.ticker, "Duplicate persisted Base runs", JSON.stringify(duplicates.slice(0, 6)));

  const nonFinite = runs.filter((row) => !finite(Number(row.currentPrice)) || !finite(Number(row.fairValue)) || !finite(Number(row.upsideDownside)));
  nonFinite.length === 0
    ? pass(config.ticker, "Persisted Base outputs are finite", `${runs.length} rows`)
    : fail(config.ticker, "Persisted Base outputs are finite", JSON.stringify(nonFinite.slice(0, 4)));

  const fairValueCount = new Set(runs.map((row) => rounded(row.fairValue))).size;
  fairValueCount >= Math.min(8, Math.max(1, runs.length - 1))
    ? pass(config.ticker, "Historical fair values vary by event", `${fairValueCount} distinct rounded Base fair values`)
    : fail(config.ticker, "Historical fair values vary by event", `${fairValueCount} distinct rounded Base fair values`);

  const futureLeaks = runs.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return extractSnapshotDates(snapshot).some((date) => String(date) > String(row.eventDate));
  });
  futureLeaks.length === 0
    ? pass(config.ticker, "No future-dated fields in persisted Base snapshots")
    : fail(config.ticker, "No future-dated fields in persisted Base snapshots", JSON.stringify(futureLeaks.slice(0, 4)));

  const badPrices = runs.filter((row) => {
    const expected = nearestDailyPrice(config.dbPath, config.ticker, row.eventDate);
    if (!expected) return true;
    return expected.priceDate > row.eventDate || Math.abs(Number(expected.adjustedClose) - Number(row.currentPrice)) > 0.01;
  });
  badPrices.length === 0
    ? pass(config.ticker, "Persisted prices use nearest prior daily price bars")
    : fail(config.ticker, "Persisted prices use nearest prior daily price bars", JSON.stringify(badPrices.slice(0, 4)));

  const latest = events[0];
  const scenarioRows = scenarioRowsForLatestEvent(config.dbPath, config.ticker, config.modelVersion, latest.id);
  const latestByScenario = new Map();
  for (const row of scenarioRows) {
    if (!latestByScenario.has(row.scenario)) latestByScenario.set(row.scenario, row);
  }
  const bear = Number(latestByScenario.get("Bear")?.fairValue);
  const base = Number(latestByScenario.get("Base")?.fairValue);
  const bull = Number(latestByScenario.get("Bull")?.fairValue);
  finite(bear) && finite(base) && finite(bull) && bear < base && base < bull
    ? pass(config.ticker, "Latest Bear/Base/Bull fair values are monotonic", `Bear=${rounded(bear)}, Base=${rounded(base)}, Bull=${rounded(bull)}`)
    : fail(config.ticker, "Latest Bear/Base/Bull fair values are monotonic", JSON.stringify({ bear, base, bull }));
}

async function checkPriceAnchorSensitivity(config, latestEvent) {
  const snapshot = config.getSnapshot({ eventId: latestEvent.id });
  const expectedPrice = nearestDailyPrice(config.dbPath, config.ticker, latestEvent.eventDate);
  const snapshotPrice = Number(snapshot.marketSnapshot?.currentPrice);
  expectedPrice && Math.abs(Number(expectedPrice.adjustedClose) - snapshotPrice) <= 0.01
    ? pass(config.ticker, "Snapshot endpoint price matches nearest prior daily price", `${snapshot.marketSnapshot?.priceDate}: ${snapshotPrice}`)
    : fail(config.ticker, "Snapshot endpoint price matches nearest prior daily price", JSON.stringify({ expectedPrice, snapshotPrice }));

  const priceSet = [100, snapshotPrice, 1000].filter((value) => finite(value) && value > 0);
  const fairValues = [];
  for (const price of priceSet) {
    const result = await config.runValuation({
      snapshot: cloneWithPrice(snapshot, price),
      scenario: "Base",
      modelVersion: config.modelVersion,
      assumptions: {},
    });
    fairValues.push({
      price,
      fairValue: Number(result.recommendedFairValue ?? result.blendedFairValue),
      upsideDownside: Number(result.upsideDownside),
    });
  }
  const uniqueFairValues = new Set(fairValues.map((row) => rounded(row.fairValue))).size;
  uniqueFairValues === 1
    ? pass(config.ticker, "Fair value is not mechanically anchored to currentPrice", JSON.stringify(fairValues.map((row) => ({ price: row.price, fairValue: rounded(row.fairValue), gap: rounded(row.upsideDownside, 4) }))))
    : fail(config.ticker, "Fair value is not mechanically anchored to currentPrice", JSON.stringify(fairValues));
}

function checkPriceSourceQuality(config) {
  const rows = priceRows(config.dbPath, config.ticker);
  if (!rows.length) {
    fail(config.ticker, "Daily price bars exist", "No daily_price_bars rows found");
    return;
  }
  const sourceSummary = JSON.stringify(rows);
  rows.some((row) => String(row.sourceType).includes("unadjusted") || String(row.sourceType).includes("proxy"))
    ? warn(config.ticker, "Daily price source quality needs upgrade", sourceSummary)
    : pass(config.ticker, "Daily price source uses adjusted market data", sourceSummary);
}

async function audit(config) {
  if (!existsSync(config.dbPath)) {
    fail(config.ticker, "DB exists", config.dbPath);
    return;
  }
  pass(config.ticker, "DB exists", config.dbPath);
  const events = config.getEvents();
  events.length >= config.minimumEvents
    ? pass(config.ticker, "Reporting-event coverage", `${events.length} events`)
    : fail(config.ticker, "Reporting-event coverage", `${events.length}/${config.minimumEvents} events`);
  checkPriceSourceQuality(config);
  checkPersistedRuns(config, events);
  await checkPriceAnchorSensitivity(config, events[0]);
}

await audit({
  ticker: "ISRG",
  dbPath: defaultIsrgDbPath,
  modelVersion: ISRG_BACKEND_MODEL_VERSION.version,
  minimumEvents: 32,
  getEvents: getIsrgReportingEvents,
  getSnapshot: getIsrgSnapshot,
  runValuation: runIsrgBackendValuation,
});

await audit({
  ticker: "MA",
  dbPath: MA_BACKEND_DB_PATH,
  modelVersion: MA_BACKEND_MODEL_VERSION.version,
  minimumEvents: 32,
  getEvents: getMaReportingEvents,
  getSnapshot: getMaSnapshot,
  runValuation: runMaBackendValuation,
});

await audit({
  ticker: "V",
  dbPath: V_BACKEND_DB_PATH,
  modelVersion: V_BACKEND_MODEL_VERSION.version,
  minimumEvents: 34,
  getEvents: getVReportingEvents,
  getSnapshot: getVSnapshot,
  runValuation: runVBackendValuation,
});

for (const check of checks) {
  const suffix = check.detail ? ` - ${check.detail}` : "";
  console.log(`${check.status}: ${check.ticker}: ${check.title}${suffix}`);
}

const totals = {
  PASS: checks.filter((check) => check.status === "PASS").length,
  WARNING: checks.filter((check) => check.status === "WARNING").length,
  FAIL: checks.filter((check) => check.status === "FAIL").length,
};
console.log(JSON.stringify({ result: totals.FAIL ? "FAIL" : "PASS", ...totals }, null, 2));
if (totals.FAIL) process.exitCode = 1;
