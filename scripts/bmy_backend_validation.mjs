#!/usr/bin/env node
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { runBmyBacktest } from "../apps/api/src/services/bmyBacktestService.mjs";
import { BMY_BACKEND_DB_PATH, BMY_BACKEND_TABLES } from "../modules/bmy/db/schema.mjs";
import { BMY_BACKEND_MODEL_VERSION } from "../modules/bmy/valuation/modelVersion.mjs";

const TICKER = "BMY";
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function q(sql, params = []) {
  return query(sql, params, BMY_BACKEND_DB_PATH);
}

function tableExists(table) {
  return q("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]).length > 0;
}

function expectedQuarterIds() {
  const ids = [];
  for (let year = 2018; year <= 2025; year += 1) {
    for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) ids.push(`FY${year} ${quarter}`);
  }
  return ids;
}

function checkRowAuditNoFuture(runsByEvent) {
  for (const { run, event } of runsByEvent) {
    const snapshot = parseJson(run.dataSnapshotJson, {});
    for (const row of snapshot.rowAudit ?? []) {
      if (row.asOfDate && row.asOfDate > run.asOfDate) {
        fail(`Future data leakage: ${row.table}/${row.id} asOfDate ${row.asOfDate} appears in ${event.id} valuation as of ${run.asOfDate}.`);
      }
    }
    const priceSource = snapshot.asOfPriceSource;
    if (priceSource?.priceDate && priceSource.priceDate > event.eventDate) {
      fail(`Future market price leakage: ${event.id} uses ${priceSource.priceDate} after event date ${event.eventDate}.`);
    }
    if (Number(event.fiscalYear) < 2024) {
      const futureProductRows = (snapshot.rowAudit ?? []).filter((row) => row.table === "product_financials" && row.asOfDate > event.eventDate);
      if (futureProductRows.length) fail(`Old BMY valuation ${event.id} includes future product row ids: ${futureProductRows.map((row) => row.id).join(", ")}`);
    }
    if (Number(event.fiscalYear) < 2026) {
      const currentPipelineRows = (snapshot.rowAudit ?? []).filter((row) => row.table === "pipeline_events" && row.asOfDate >= "2026-05-12");
      if (currentPipelineRows.length) fail(`Old BMY valuation ${event.id} includes current pipeline source rows.`);
      const currentPatentRows = (snapshot.rowAudit ?? []).filter((row) => row.table === "patent_exclusivity_events" && row.asOfDate >= "2026-02-13");
      if (currentPatentRows.length && event.eventDate < "2026-02-13") fail(`Old BMY valuation ${event.id} includes future LOE/patent rows.`);
    }
  }
}

if (!existsSync(BMY_BACKEND_DB_PATH)) {
  fail(`DB file does not exist at ${BMY_BACKEND_DB_PATH}`);
} else {
  for (const table of BMY_BACKEND_TABLES) {
    if (!tableExists(table)) fail(`Required table is missing: ${table}`);
  }

  const tableCounts = Object.fromEntries(BMY_BACKEND_TABLES.map((table) => [table, tableExists(table) ? q(`SELECT COUNT(*) AS count FROM ${table}`)[0].count : 0]));
  const events = q("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate ASC", [TICKER]);
  const eventLabels = new Set(events.map((event) => event.fiscalPeriod));
  const missingQuarters = expectedQuarterIds().filter((id) => !eventLabels.has(id));
  if (events.length < 32) fail(`Expected at least 32 BMY quarterly reporting events for eight years; found ${events.length}.`);
  if (missingQuarters.length) warn(`Missing expected quarterly periods: ${missingQuarters.join(", ")}`);
  if (tableCounts.daily_price_bars <= 0) fail("daily_price_bars table has no rows.");
  if (tableCounts.market_snapshots <= 0) fail("Expected at least one market snapshot.");
  if (tableCounts.model_versions <= 0) fail("Expected at least one model version.");
  if (tableCounts.assumption_sets <= 0) fail("Expected assumption sets.");

  const baseRuns = q(
    "SELECT * FROM valuation_runs WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ? ORDER BY asOfDate ASC",
    [TICKER, BMY_BACKEND_MODEL_VERSION.version],
  );
  const latestBaseByEvent = new Map();
  for (const run of baseRuns) {
    if (!latestBaseByEvent.has(run.reportingEventId)) latestBaseByEvent.set(run.reportingEventId, run);
  }
  const missingBase = events.filter((event) => !latestBaseByEvent.has(event.id));
  if (missingBase.length) fail(`Missing Base valuation runs for events: ${missingBase.map((event) => event.id).join(", ")}`);

  for (const run of baseRuns) {
    if (!finite(run.currentPrice) || !finite(run.fairValue)) fail(`Valuation ${run.id} lacks finite currentPrice/fairValue.`);
    if (!finite(run.targetPrice3Y) || !finite(run.expectedShareholderCagr)) fail(`Valuation ${run.id} lacks finite targetPrice3Y/expectedShareholderCagr.`);
  }
  const distinctFairValues = new Set(baseRuns.map((run) => Number(run.fairValue).toFixed(2)));
  if (baseRuns.length > 4 && distinctFairValues.size <= 3) fail("Historical BMY fair values appear too flat across events.");

  const runsByEvent = events
    .map((event) => ({ event, run: latestBaseByEvent.get(event.id) }))
    .filter((item) => item.run);
  checkRowAuditNoFuture(runsByEvent);

  const priceLeaks = q(
    `SELECT vr.id, vr.reportingEventId, re.eventDate, json_extract(vr.dataSnapshotJson, '$.asOfPriceSource.priceDate') AS priceDate
     FROM valuation_runs vr
     LEFT JOIN reporting_events re ON re.id = vr.reportingEventId
     WHERE vr.ticker = ? AND vr.scenario = 'Base'`,
    [TICKER],
  ).filter((row) => row.priceDate && row.priceDate > row.eventDate);
  if (priceLeaks.length) fail(`Historical as-of price after event date: ${priceLeaks.map((row) => row.reportingEventId).join(", ")}`);

  const noPriceSource = q(
    `SELECT reportingEventId FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base'
       AND json_extract(dataSnapshotJson, '$.asOfPriceSource.priceDate') IS NULL`,
    [TICKER],
  );
  if (noPriceSource.length) warn(`Some Base valuations lack daily price anchors: ${noPriceSource.map((row) => row.reportingEventId).join(", ")}`);

  const transcriptReady = q("SELECT COUNT(*) AS count FROM transcript_extractions WHERE ticker = ? AND modelReady != 0", [TICKER])[0].count;
  if (transcriptReady > 0) fail("Transcript candidates should be modelReady=false.");

  const guidanceCandidateImpact = q(
    "SELECT COUNT(*) AS count FROM guidance_items WHERE ticker = ? AND guidanceType != 'explicit_guide' AND valuationImpactAllowed != 0",
    [TICKER],
  )[0].count;
  if (guidanceCandidateImpact > 0) fail("Guidance candidates are valuation-impacting without promotion.");

  const clinicalImpact = q("SELECT COUNT(*) AS count FROM clinical_readouts WHERE ticker = ? AND valuationImpactAllowed != 0", [TICKER])[0].count;
  if (clinicalImpact > 0) fail("Clinical readout candidates are valuation-impacting without promotion.");
  const pipelineCandidateImpact = q(
    "SELECT COUNT(*) AS count FROM pipeline_events WHERE ticker = ? AND modelReady = 0 AND valuationImpactAllowed != 0",
    [TICKER],
  )[0].count;
  if (pipelineCandidateImpact > 0) fail("Pipeline candidates are valuation-impacting without promotion.");

  const peerMixedValues = q(
    "SELECT COUNT(*) AS count FROM peer_snapshots WHERE ticker = ? AND (marketCap IS NOT NULL OR enterpriseValue IS NOT NULL) AND absoluteValueUse != 'metadata_only_not_aggregated'",
    [TICKER],
  )[0].count;
  if (peerMixedValues > 0) fail("Peer absolute market cap / EV rows are eligible for aggregation despite mixed-source risk.");

  const backtest = runBmyBacktest({
    startDate: "2018-01-02",
    endDate: "2026-05-12",
    benchmarkTicker: "SPY",
  });
  if (backtest.status !== "completed") {
    fail(`Backtest did not complete: ${(backtest.warnings ?? []).join(" ")}`);
  } else {
    for (const [label, metric] of Object.entries({
      bmyCagr: backtest.metrics.bmyBuyHold?.cagr,
      spyCagr: backtest.metrics.spy?.cagr,
      bmyMdd: backtest.metrics.bmyBuyHold?.maxDrawdown,
      spyMdd: backtest.metrics.spy?.maxDrawdown,
      bmySharpe: backtest.metrics.bmyBuyHold?.sharpe,
      spySharpe: backtest.metrics.spy?.sharpe,
      bmyVol: backtest.metrics.bmyBuyHold?.volatility,
      spyVol: backtest.metrics.spy?.volatility,
    })) {
      if (!finite(metric)) fail(`Backtest metric is not finite: ${label}`);
    }
  }

  console.log(JSON.stringify({
    ok: errors.length === 0,
    dbPath: BMY_BACKEND_DB_PATH,
    tableCounts,
    eventCount: events.length,
    quarterlyCoverage: {
      first: events[0]?.fiscalPeriod,
      last: events.at(-1)?.fiscalPeriod,
      missingQuarters,
    },
    baseValuationRuns: baseRuns.length,
    distinctBaseFairValues: distinctFairValues.size,
    backtest: {
      status: backtest.status,
      priceBars: backtest.priceBars,
      metrics: backtest.metrics,
      warnings: backtest.warnings,
    },
    warnings,
    errors,
  }, null, 2));
}

if (errors.length) {
  process.exitCode = 1;
}
