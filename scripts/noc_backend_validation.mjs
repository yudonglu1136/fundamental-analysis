#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { runNocBacktest } from "../apps/api/src/services/nocBacktestService.mjs";
import { NOC_BACKEND_DB_PATH, NOC_BACKEND_TABLES } from "../modules/noc/db/schema.mjs";
import { NOC_BACKEND_MODEL_VERSION } from "../modules/noc/valuation/modelVersion.mjs";

const TICKER = "NOC";
const MODEL_VERSION = NOC_BACKEND_MODEL_VERSION.version;
const checks = [];

function record(status, title, detail = "") {
  checks.push({ status, title, detail });
}

function pass(title, detail) {
  record("PASS", title, detail);
}

function warn(title, detail) {
  record("WARNING", title, detail);
}

function fail(title, detail) {
  record("FAIL", title, detail);
}

function count(table, where = "ticker = 'NOC'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], NOC_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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
  console.log("NOC Backend Validation");

  if (!existsSync(NOC_BACKEND_DB_PATH)) {
    fail("DB file exists", `${NOC_BACKEND_DB_PATH} is missing. Run npm run noc:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", NOC_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], NOC_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of NOC_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run noc:backend:seed to apply migrations.");
  }

  const allEvents = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate ASC, id ASC", [TICKER], NOC_BACKEND_DB_PATH);
  const quarterlyEvents = allEvents.filter((event) => /^q[1-4]_results$/.test(event.eventType));
  const earliestQuarter = quarterlyEvents[0];
  const latestQuarter = quarterlyEvents.at(-1);
  quarterlyEvents.length >= 33 && earliestQuarter?.id === "sec-q1-fy18" && latestQuarter?.id === "sec-q1-fy26"
    ? pass("Quarterly reporting events cover FY2018 Q1 through FY2026 Q1", `${quarterlyEvents.length} quarterly events`)
    : fail(
        "Quarterly reporting events cover FY2018 Q1 through FY2026 Q1",
        `Found ${quarterlyEvents.length}; earliest=${earliestQuarter?.id ?? "n/a"}; latest=${latestQuarter?.id ?? "n/a"}`,
      );

  const officialQuarterRows = query(
    `SELECT periodId, sales, operatingIncome, sourceType
     FROM financial_periods
     WHERE ticker = ? AND periodType = 'quarter'
     ORDER BY asOfDate ASC`,
    [TICKER],
    NOC_BACKEND_DB_PATH,
  );
  const usableQuarterRows = officialQuarterRows.filter((row) => isFiniteNumber(row.sales) && isFiniteNumber(row.operatingIncome));
  usableQuarterRows.length >= quarterlyEvents.length
    ? pass("Quarterly financial rows are model usable", `${usableQuarterRows.length}/${quarterlyEvents.length} rows with sales and operating income`)
    : fail("Quarterly financial rows are model usable", `${usableQuarterRows.length}/${quarterlyEvents.length} rows have finite sales and operating income.`);

  const sourceDocs = count("source_documents");
  sourceDocs > 0 ? pass("Source documents imported", `${sourceDocs} rows`) : fail("Source documents imported", "No NOC source documents found.");

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", "No NOC market snapshots found.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('NOC', 'SPY') GROUP BY ticker ORDER BY ticker",
    [],
    NOC_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const nocPriceBars = priceBarMap.get("NOC");
  const spyPriceBars = priceBarMap.get("SPY");
  nocPriceBars?.count >= 2000
    ? pass("NOC daily price bars imported", `${nocPriceBars.count} rows, ${nocPriceBars.firstDate} to ${nocPriceBars.lastDate}, ${nocPriceBars.sourceType}`)
    : fail("NOC daily price bars imported", "Run npm run noc:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}, ${spyPriceBars.sourceType}`)
    : fail("SPY daily price bars imported", "Run npm run noc:backend:import-prices.");

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No NOC model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    NOC_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0
      ? pass(`Assumption set exists: ${scenario}`)
      : fail(`Assumption set missing: ${scenario}`, "Seed must create Bear/Base/Bull defaults for historical runs.");
  }

  const baseHistoricalRuns = query(
    `SELECT reportingEventId, COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ? AND scenario = ? AND modelVersion = ?
     GROUP BY reportingEventId`,
    [TICKER, "Base", MODEL_VERSION],
    NOC_BACKEND_DB_PATH,
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  const missingQuarterRuns = quarterlyEvents.map((event) => event.id).filter((eventId) => !historicalRunEventIds.has(eventId));
  missingQuarterRuns.length === 0
    ? pass("Base valuation exists for every quarterly reporting event", `${quarterlyEvents.length}/${quarterlyEvents.length} quarterly events`)
    : fail("Base valuation exists for every quarterly reporting event", JSON.stringify(missingQuarterRuns));

  const finiteHistoricalRuns = query(
    `SELECT COUNT(DISTINCT reportingEventId) AS count
     FROM valuation_runs
     WHERE ticker = ?
       AND scenario = 'Base'
       AND modelVersion = ?
       AND currentPrice IS NOT NULL
       AND fairValue IS NOT NULL
       AND targetPrice3Y IS NOT NULL
       AND expectedShareholderCagr IS NOT NULL`,
    [TICKER, MODEL_VERSION],
    NOC_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  finiteHistoricalRuns >= quarterlyEvents.length
    ? pass("Historical valuation output fields are persisted", `${finiteHistoricalRuns} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${quarterlyEvents.length} complete Base valuation rows.`);

  const baseFairValues = query(
    `SELECT reportingEventId, ROUND(fairValue, 2) AS fairValue
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ? AND fairValue IS NOT NULL`,
    [TICKER, MODEL_VERSION],
    NOC_BACKEND_DB_PATH,
  );
  const distinctBaseFairValues = new Set(baseFairValues.map((row) => row.fairValue));
  distinctBaseFairValues.size > 6
    ? pass("Historical Base fair values vary by event", `${distinctBaseFairValues.size} distinct rounded fair values`)
    : fail("Historical Base fair values vary by event", `Only ${distinctBaseFairValues.size} distinct rounded fair values.`);

  const orderedQuarterRuns = query(
    `SELECT e.id, e.eventDate, e.fiscalPeriod, v.currentPrice, v.fairValue, v.targetPrice3Y,
            v.expectedShareholderCagr, v.upsideDownside, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ?
       AND v.scenario = 'Base'
       AND v.modelVersion = ?
       AND e.eventType IN ('q1_results', 'q2_results', 'q3_results', 'q4_results')
     ORDER BY e.eventDate ASC, e.id ASC`,
    [TICKER, MODEL_VERSION],
    NOC_BACKEND_DB_PATH,
  );
  const badUpsideRows = orderedQuarterRuns.filter((row) => {
    const expected = row.currentPrice && row.fairValue ? row.fairValue / row.currentPrice - 1 : null;
    return expected == null || Math.abs(expected - row.upsideDownside) > 0.0001;
  });
  badUpsideRows.length === 0
    ? pass("Historical upside/downside uses persisted fair value versus event price")
    : fail("Historical upside/downside uses persisted fair value versus event price", JSON.stringify(badUpsideRows.slice(0, 5)));

  const missingDailyPrice = orderedQuarterRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return !snapshot.asOfPriceSource || snapshot.asOfPriceSource.sourceType?.startsWith("market_data") === false;
  });
  missingDailyPrice.length === 0
    ? pass("Historical as-of prices use daily market data where available", `${orderedQuarterRuns.length} quarterly runs checked`)
    : fail("Historical as-of prices use daily market data where available", JSON.stringify(missingDailyPrice.map((row) => row.id).slice(0, 10)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'NOC' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are not model-ready")
    : fail("Transcript candidates are not model-ready", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'NOC' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
  );
  guidanceCandidatesPromoted === 0
    ? pass("Guidance candidates are not valuation-impacting")
    : fail("Guidance candidates are not valuation-impacting", `${guidanceCandidatesPromoted} candidate guidance rows allow valuation impact.`);

  const mixedCurrencyPeerMisuse = query(
    `SELECT peerTicker, currency, absoluteValueUse
     FROM peer_snapshots
     WHERE ticker = ?
       AND currency IS NOT NULL
       AND currency != 'USD'
       AND (absoluteValueUse IS NULL OR absoluteValueUse NOT LIKE '%metadata_only%')`,
    [TICKER],
    NOC_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only across mixed currencies")
    : fail("Peer absolute values are metadata-only across mixed currencies", JSON.stringify(mixedCurrencyPeerMisuse));

  try {
    const backtest = runNocBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    backtest.status === "completed" &&
      backtest.curve?.length >= 2000 &&
      isFiniteNumber(backtest.metrics?.nocBuyHold?.cagr) &&
      isFiniteNumber(backtest.metrics?.spy?.cagr) &&
      isFiniteNumber(backtest.metrics?.nocBuyHold?.mdd) &&
      isFiniteNumber(backtest.metrics?.spy?.sharpe) &&
      isFiniteNumber(backtest.metrics?.nocBuyHold?.vol)
      ? pass("NOC buy-and-hold backtest compares against SPY", `curve=${backtest.curve.length}; nocCagr=${backtest.metrics.nocBuyHold.cagr}; spyCagr=${backtest.metrics.spy.cagr}`)
      : fail("NOC buy-and-hold backtest compares against SPY", JSON.stringify(backtest).slice(0, 1000));
  } catch (error) {
    fail("NOC buy-and-hold backtest compares against SPY", error instanceof Error ? error.message : String(error));
  }

  const health = await getHealthStatus();
  if (health.ok && health.body?.nocBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected NOC health payload.");
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
