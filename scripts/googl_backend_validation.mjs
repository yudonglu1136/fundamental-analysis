#!/usr/bin/env node
import http from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { runGooglBacktest } from "../apps/api/src/services/googlBacktestService.mjs";
import { execute, query } from "../apps/api/src/db/client.mjs";
import { createGooglValuationRun, getGooglHistoricalValuations } from "../apps/api/src/services/googlValuationService.mjs";
import { GOOGL_BACKEND_DB_PATH, GOOGL_BACKEND_TABLES } from "../modules/googl/db/schema.mjs";

const TICKER = "GOOGL";
const MODEL_VERSION = "googl_v1_backend_pilot";
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

function count(table, where = "ticker = 'GOOGL'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], GOOGL_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function daysBetweenIso(start, end) {
  return (new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${start}T00:00:00.000Z`).getTime()) / 86_400_000;
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

function runNpmCheck(scriptName, title) {
  const result = spawnSync("npm", ["run", scriptName], {
    encoding: "utf8",
    maxBuffer: 120 * 1024 * 1024,
  });
  if (result.status === 0) {
    pass(title, `npm run ${scriptName}`);
  } else {
    fail(title, (result.stderr || result.stdout || `npm run ${scriptName} failed`).slice(0, 3000));
  }
}

async function main() {
  console.log("GOOGL Backend Validation");

  if (!existsSync(GOOGL_BACKEND_DB_PATH)) {
    fail("DB file exists", `${GOOGL_BACKEND_DB_PATH} is missing. Run npm run googl:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", GOOGL_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], GOOGL_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of GOOGL_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run googl:backend:seed to apply migrations.");
  }

  const annualEventCount = count("reporting_events", "ticker = 'GOOGL' AND eventType = 'annual_report'");
  annualEventCount >= 8 ? pass("At least 8 annual reporting events exist", `${annualEventCount} rows`) : fail("At least 8 annual reporting events exist", `${annualEventCount} rows`);

  const quarterlyEventCount = count("reporting_events", "ticker = 'GOOGL' AND eventType IN ('q1_results','q2_results','q3_results','q4_results')");
  quarterlyEventCount >= 32
    ? pass("Quarterly reporting events exist", `${quarterlyEventCount} quarterly rows`)
    : fail("Quarterly reporting events exist", `${quarterlyEventCount} quarterly rows; expected at least 32 for eight years.`);

  const eventCount = count("reporting_events");
  eventCount > 0 ? pass("Reporting events imported", `${eventCount} rows`) : fail("Reporting events imported", "No GOOGL reporting events found.");

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("At least one market snapshot exists", `${marketCount} rows`) : fail("At least one market snapshot exists", "No market snapshots found.");

  const priceBarRows = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('GOOGL', 'SPY') GROUP BY ticker",
    [],
    GOOGL_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBarRows.map((row) => [row.ticker, row]));
  const googlPriceBars = priceBarMap.get("GOOGL");
  const spyPriceBars = priceBarMap.get("SPY");
  googlPriceBars?.count > 250
    ? pass("GOOGL daily price bars imported", `${googlPriceBars.count} rows, ${googlPriceBars.firstDate} to ${googlPriceBars.lastDate}`)
    : fail("GOOGL daily price bars imported", "Run npm run googl:backend:import-prices.");
  spyPriceBars?.count > 250
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}`)
    : fail("SPY daily price bars imported", "Run npm run googl:backend:import-prices.");

  const latestMarketSnapshot = query(
    "SELECT asOfDate, currentPrice FROM market_snapshots WHERE ticker = ? ORDER BY asOfDate DESC LIMIT 1",
    [TICKER],
    GOOGL_BACKEND_DB_PATH,
  )[0];
  const distantHistoricalCurrentPriceReuse = latestMarketSnapshot
    ? query(
        "SELECT id, asOfDate, currentPrice FROM market_snapshots WHERE ticker = ? AND asOfDate < ? AND currentPrice = ?",
        [TICKER, latestMarketSnapshot.asOfDate, latestMarketSnapshot.currentPrice],
        GOOGL_BACKEND_DB_PATH,
      ).filter((row) => daysBetweenIso(row.asOfDate, latestMarketSnapshot.asOfDate) > 180)
    : [];
  distantHistoricalCurrentPriceReuse.length === 0
    ? pass("Historical market proxies do not reuse the latest current price")
    : fail("Historical market proxies do not reuse the latest current price", JSON.stringify(distantHistoricalCurrentPriceReuse.slice(0, 5)));

  const invalidProxySignals = query(
    `SELECT id, priceQuality, signalBacktestAllowed
     FROM market_snapshots
     WHERE ticker = ?
       AND priceQuality IN ('research_proxy', 'missing')
       AND signalBacktestAllowed != 0`,
    [TICKER],
    GOOGL_BACKEND_DB_PATH,
  );
  invalidProxySignals.length === 0
    ? pass("Proxy or missing market prices are not signal-backtestable")
    : fail("Proxy or missing market prices are not signal-backtestable", JSON.stringify(invalidProxySignals.slice(0, 5)));

  const anyBacktestableMarketSignals = count("market_snapshots", "ticker = 'GOOGL' AND signalBacktestAllowed != 0");
  anyBacktestableMarketSignals === 0
    ? pass("No GOOGL event claims investable signal readiness without audited prices")
    : fail("No GOOGL event claims investable signal readiness without audited prices", `${anyBacktestableMarketSignals} market rows are signal-backtestable.`);

  const futureDatedFacts = query(
    `SELECT fp.id, fp.asOfDate, e.eventDate
     FROM financial_periods fp
     JOIN reporting_events e ON e.id = fp.eventId
     WHERE fp.ticker = ? AND fp.asOfDate > e.eventDate`,
    [TICKER],
    GOOGL_BACKEND_DB_PATH,
  );
  futureDatedFacts.length === 0
    ? pass("No future-dated financial facts attached to reporting events")
    : fail("No future-dated financial facts attached to reporting events", JSON.stringify(futureDatedFacts.slice(0, 5)));

  const lateQuarterlyFacts = query(
    `SELECT id, periodId, asOfDate, rawJson
     FROM financial_periods
     WHERE ticker = ? AND periodType = 'quarterly' AND sourceType = 'official_actual'`,
    [TICKER],
    GOOGL_BACKEND_DB_PATH,
  ).filter((row) => {
    const raw = parseJson(row.rawJson, {});
    return raw.periodEnd && daysBetweenIso(raw.periodEnd, row.asOfDate) > 120;
  });
  lateQuarterlyFacts.length === 0
    ? pass("Quarterly SEC facts are timely, not future comparative rows")
    : fail("Quarterly SEC facts are timely, not future comparative rows", JSON.stringify(lateQuarterlyFacts.slice(0, 5).map((row) => ({ id: row.id, periodId: row.periodId, asOfDate: row.asOfDate }))));

  const invalidShareCounts = query(
    `SELECT id, periodId, dilutedShares
     FROM financial_periods
     WHERE ticker = ?
       AND sourceType = 'official_actual'
       AND dilutedShares IS NOT NULL
       AND dilutedShares <= 0`,
    [TICKER],
    GOOGL_BACKEND_DB_PATH,
  );
  invalidShareCounts.length === 0
    ? pass("Official actual diluted share counts are positive")
    : fail("Official actual diluted share counts are positive", JSON.stringify(invalidShareCounts.slice(0, 5)));

  const modelVersionCount = count("model_versions", `ticker = 'GOOGL' AND version = '${MODEL_VERSION}'`);
  modelVersionCount > 0 ? pass("Model version exists", MODEL_VERSION) : fail("Model version exists", `No ${MODEL_VERSION} row found.`);

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    GOOGL_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0
      ? pass(`Assumption set exists: ${scenario}`)
      : fail(`Assumption set missing: ${scenario}`, "Seed must create Bear/Base/Bull defaults for historical runs.");
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", [TICKER], GOOGL_BACKEND_DB_PATH)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate}, ${latestEvent.eventType})`);
    try {
      const valuation = await createGooglValuationRun({ eventId: latestEvent.id, scenario: "Base", modelVersion: MODEL_VERSION });
      const result = valuation.valuationResult;
      const fairValue = valuation.valuationRun?.fairValue ?? result.recommendedFairValue ?? null;
      if (isFiniteNumber(result.currentPrice) && isFiniteNumber(fairValue)) {
        pass("Backend valuation run created", `currentPrice=${result.currentPrice}; fairValue=${fairValue}`);
      } else {
        fail("Backend valuation run created", "Valuation result did not return finite currentPrice and fairValue.");
      }
      if (isFiniteNumber(valuation.valuationRun?.targetPrice3Y) && isFiniteNumber(valuation.valuationRun?.expectedShareholderCagr)) {
        pass("Target price and CAGR persisted", `targetPrice3Y=${valuation.valuationRun.targetPrice3Y}`);
      } else {
        fail("Target price and CAGR persisted", "Missing targetPrice3Y or expectedShareholderCagr.");
      }
      if (valuation.id) {
        execute("DELETE FROM valuation_runs WHERE id = ?", [valuation.id], GOOGL_BACKEND_DB_PATH);
      }
    } catch (error) {
      fail("Backend valuation run created", error instanceof Error ? error.message : String(error));
    }
  }

  const baseHistoricalRuns = query(
    `SELECT reportingEventId, COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ? AND scenario = ? AND modelVersion = ?
     GROUP BY reportingEventId`,
    [TICKER, "Base", MODEL_VERSION],
    GOOGL_BACKEND_DB_PATH,
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  eventCount > 0 && historicalRunEventIds.size >= eventCount
    ? pass("Base valuation exists for every reporting event", `${historicalRunEventIds.size}/${eventCount} events`)
    : fail("Base valuation exists for every reporting event", `${historicalRunEventIds.size}/${eventCount} events. Run npm run googl:backend:backfill-valuations -- --base-only.`);

  const canonicalQuarterRows = getGooglHistoricalValuations({ scenario: "Base", modelVersion: MODEL_VERSION, series: "quarterly" });
  const canonicalQuarterKeys = canonicalQuarterRows.map((row) => {
    const quarter = row.event?.eventType?.match(/^q([1-4])_results$/)?.[1];
    return `${row.event?.fiscalYear}-Q${quarter}`;
  });
  const duplicateCanonicalQuarterKeys = canonicalQuarterKeys.filter((key, index) => canonicalQuarterKeys.indexOf(key) !== index);
  const nonQuarterCanonicalEvents = canonicalQuarterRows.filter((row) => !/^q[1-4]_results$/.test(row.event?.eventType ?? ""));
  duplicateCanonicalQuarterKeys.length === 0 && nonQuarterCanonicalEvents.length === 0
    ? pass("Historical valuation API defaults to one canonical point per fiscal quarter", `${canonicalQuarterRows.length} quarterly rows`)
    : fail(
        "Historical valuation API defaults to one canonical point per fiscal quarter",
        JSON.stringify({
          duplicateCanonicalQuarterKeys: [...new Set(duplicateCanonicalQuarterKeys)].slice(0, 5),
          nonQuarterCanonicalEvents: nonQuarterCanonicalEvents.slice(0, 5).map((row) => row.event?.id),
        }),
      );

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
    GOOGL_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  finiteHistoricalRuns >= eventCount
    ? pass("currentPrice/fairValue/targetPrice3Y/expectedShareholderCagr are finite", `${finiteHistoricalRuns}/${eventCount} complete Base runs`)
    : fail("currentPrice/fairValue/targetPrice3Y/expectedShareholderCagr are finite", `${finiteHistoricalRuns}/${eventCount} complete Base valuation rows.`);

  const dailyPriceAnchorRows = query(
    `SELECT v.reportingEventId, v.currentPrice, v.priceQuality, e.eventDate,
            (
              SELECT COALESCE(p.adjustedClose, p.close)
              FROM daily_price_bars p
              WHERE p.ticker = v.ticker
                AND p.priceDate <= e.eventDate
                AND (p.adjustedClose IS NOT NULL OR p.close IS NOT NULL)
              ORDER BY p.priceDate DESC
              LIMIT 1
            ) AS dailyPrice
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ?
       AND v.scenario = 'Base'
       AND v.modelVersion = ?`,
    [TICKER, MODEL_VERSION],
    GOOGL_BACKEND_DB_PATH,
  );
  const stalePriceAnchors = dailyPriceAnchorRows.filter((row) => {
    if (row.dailyPrice == null) return false;
    return Math.abs(Number(row.currentPrice) - Number(row.dailyPrice)) > 0.01;
  });
  const missingDailyMarketAnchors = dailyPriceAnchorRows.filter((row) => row.dailyPrice != null && !["adjusted_market_data", "unadjusted_market_data"].includes(row.priceQuality));
  stalePriceAnchors.length === 0 && missingDailyMarketAnchors.length === 0
    ? pass("Historical as-of price uses daily market data where available")
    : fail(
        "Historical as-of price uses daily market data where available",
        JSON.stringify({
          stalePriceAnchors: stalePriceAnchors.slice(0, 5),
          missingDailyMarketAnchors: missingDailyMarketAnchors.slice(0, 5),
        }),
      );

  const baseFairValues = query(
    `SELECT reportingEventId, ROUND(fairValue, 2) AS fairValue
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ? AND fairValue IS NOT NULL`,
    [TICKER, MODEL_VERSION],
    GOOGL_BACKEND_DB_PATH,
  );
  const distinctBaseFairValues = new Set(baseFairValues.map((row) => row.fairValue));
  distinctBaseFairValues.size > 3
    ? pass("Base fair values vary across history", `${distinctBaseFairValues.size} distinct rounded fair values`)
    : fail(
        "Base fair values vary across history",
        `Only ${distinctBaseFairValues.size} distinct rounded fair values. Event-dated driver assumptions may not be flowing into valuation.`,
      );

  const outlierBaseFairValues = baseFairValues.filter((row) => row.fairValue <= 0 || row.fairValue > 1000);
  outlierBaseFairValues.length === 0
    ? pass("Base fair values stay within per-share sanity bounds", "0 < fairValue <= 1000")
    : fail("Base fair values stay within per-share sanity bounds", JSON.stringify(outlierBaseFairValues.slice(0, 5)));

  const futureStaticBlockedRows = query(
    `SELECT COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ?
       AND scenario = 'Base'
       AND modelVersion = ?
       AND dataSnapshotJson LIKE '%"futureStaticDataBlocked":true%'`,
    [TICKER, MODEL_VERSION],
    GOOGL_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  futureStaticBlockedRows >= eventCount
    ? pass("Adapter blocks future static data in Base runs", `${futureStaticBlockedRows}/${eventCount} Base runs carry the no-lookahead marker`)
    : fail("Adapter blocks future static data in Base runs", `${futureStaticBlockedRows}/${eventCount} Base runs carry the no-lookahead marker.`);

  const valuationRunsWithAudit = query(
    `SELECT v.id, v.reportingEventId, v.scenario, v.priceQuality, v.signalBacktestAllowed,
            v.assumptionAuditJson, v.dataSnapshotJson, v.warningsJson, v.qualityFlagsJson,
            e.eventDate, e.eventType
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ? AND v.modelVersion = ?`,
    [TICKER, MODEL_VERSION],
    GOOGL_BACKEND_DB_PATH,
  );
  valuationRunsWithAudit.length > 0
    ? pass("Valuation runs include audit payload candidates", `${valuationRunsWithAudit.length} rows`)
    : fail("Valuation runs include audit payload candidates", "No valuation runs found for audit validation.");

  const missingAuditPayloads = valuationRunsWithAudit.filter((row) => !row.assumptionAuditJson || !row.dataSnapshotJson || !row.qualityFlagsJson);
  missingAuditPayloads.length === 0
    ? pass("Assumption audit and quality flags are persisted")
    : fail("Assumption audit and quality flags are persisted", JSON.stringify(missingAuditPayloads.slice(0, 5).map((row) => row.id)));

  const futureDatedAssumptions = valuationRunsWithAudit.flatMap((row) => {
    const audit = parseJson(row.assumptionAuditJson, []);
    return audit
      .filter((item) => item?.sourceDate && item.sourceDate > row.eventDate)
      .map((item) => ({ runId: row.id, eventDate: row.eventDate, key: item.key, sourceDate: item.sourceDate }));
  });
  futureDatedAssumptions.length === 0
    ? pass("No assumption sourceDate is after eventDate")
    : fail("No assumption sourceDate is after eventDate", JSON.stringify(futureDatedAssumptions.slice(0, 5)));

  const blockedAssumptionLeaks = valuationRunsWithAudit.flatMap((row) => {
    const audit = parseJson(row.assumptionAuditJson, []);
    return audit
      .filter((item) => item?.dataQuality === "blocked" && (item.valuationImpactAllowed !== false || item.applied !== false))
      .map((item) => ({ runId: row.id, key: item.key, applied: item.applied, valuationImpactAllowed: item.valuationImpactAllowed }));
  });
  blockedAssumptionLeaks.length === 0
    ? pass("Blocked assumptions cannot affect fair value")
    : fail("Blocked assumptions cannot affect fair value", JSON.stringify(blockedAssumptionLeaks.slice(0, 5)));

  const snapshotAsOfLeaks = valuationRunsWithAudit.flatMap((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return Object.entries(snapshot.snapshotAsOfAudit ?? {})
      .filter(([, audit]) => audit && audit.passes === false)
      .map(([table, audit]) => ({ runId: row.id, table, maxAsOfDate: audit.maxAsOfDate, eventDate: audit.eventDate }));
  });
  snapshotAsOfLeaks.length === 0
    ? pass("No dataSnapshot item has asOfDate after eventDate")
    : fail("No dataSnapshot item has asOfDate after eventDate", JSON.stringify(snapshotAsOfLeaks.slice(0, 5)));

  const proxyRunSignals = valuationRunsWithAudit.filter((row) => ["research_proxy", "missing"].includes(row.priceQuality) && row.signalBacktestAllowed !== 0);
  proxyRunSignals.length === 0
    ? pass("Proxy valuation runs are not investable backtest signals")
    : fail("Proxy valuation runs are not investable backtest signals", JSON.stringify(proxyRunSignals.slice(0, 5).map((row) => row.id)));

  const missingProxyWarnings = valuationRunsWithAudit.filter((row) => {
    if (!["research_proxy", "missing"].includes(row.priceQuality)) return false;
    const warnings = parseJson(row.warningsJson, []);
    return !warnings.some((warning) => warning?.id === "googl-not-backtestable-proxy-price");
  });
  missingProxyWarnings.length === 0
    ? pass("Research proxy prices generate not-backtestable warnings")
    : fail("Research proxy prices generate not-backtestable warnings", JSON.stringify(missingProxyWarnings.slice(0, 5).map((row) => row.id)));

  const pre2023NarrativeLeaks = valuationRunsWithAudit.flatMap((row) => {
    if (row.eventDate >= "2023-01-01") return [];
    const audit = parseJson(row.assumptionAuditJson, []);
    return audit
      .filter((item) => ["searchAiCannibalization", "searchMonetizationChange", "tpuEfficiencyBenefit"].includes(item.key))
      .filter((item) => item.applied === true && Math.abs(item.value ?? 0) > 0.000001)
      .map((item) => ({ runId: row.id, eventDate: row.eventDate, key: item.key, value: item.value }));
  });
  pre2023NarrativeLeaks.length === 0
    ? pass("Blocked AI/TPU narratives do not affect pre-2023 valuations")
    : fail("Blocked AI/TPU narratives do not affect pre-2023 valuations", JSON.stringify(pre2023NarrativeLeaks.slice(0, 5)));

  const scenarioOrderRows = query(
    `SELECT reportingEventId,
            MAX(CASE WHEN scenario = 'Bear' THEN fairValue END) AS bear,
            MAX(CASE WHEN scenario = 'Base' THEN fairValue END) AS base,
            MAX(CASE WHEN scenario = 'Bull' THEN fairValue END) AS bull
     FROM valuation_runs
     WHERE ticker = ? AND modelVersion = ?
     GROUP BY reportingEventId`,
    [TICKER, MODEL_VERSION],
    GOOGL_BACKEND_DB_PATH,
  );
  const scenarioOrderViolations = scenarioOrderRows.filter((row) => !(row.bear < row.base && row.base < row.bull));
  scenarioOrderViolations.length === 0
    ? pass("Scenario ordering holds: Bear < Base < Bull")
    : fail("Scenario ordering holds: Bear < Base < Bull", JSON.stringify(scenarioOrderViolations.slice(0, 5)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'GOOGL' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are modelReady=false")
    : fail("Transcript candidates are modelReady=false", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'GOOGL' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
  );
  guidanceCandidatesPromoted === 0
    ? pass("Guidance candidates are not valuation-impacting unless promoted")
    : fail("Guidance candidates are not valuation-impacting unless promoted", `${guidanceCandidatesPromoted} candidate guidance rows allow valuation impact.`);

  const mixedCurrencyPeerMisuse = query(
    `SELECT peerTicker, currency, absoluteValueUse
     FROM peer_snapshots
     WHERE ticker = ?
       AND currency IS NOT NULL
       AND currency != 'USD'
       AND (absoluteValueUse IS NULL OR absoluteValueUse NOT LIKE '%metadata_only%')`,
    [TICKER],
    GOOGL_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Mixed currency peer absolute EV/market cap is not aggregated")
    : fail("Mixed currency peer absolute EV/market cap is not aggregated", JSON.stringify(mixedCurrencyPeerMisuse));

  try {
    const backtest = runGooglBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", modelVersion: MODEL_VERSION, benchmarkTicker: "SPY" });
    const metrics = backtest.metrics ?? {};
    const finiteBacktestMetrics = [
      metrics.googlBuyHold?.cagr,
      metrics.spy?.cagr,
      metrics.googlBuyHold?.maxDrawdown,
      metrics.spy?.maxDrawdown,
      metrics.googlBuyHold?.sharpe,
      metrics.spy?.sharpe,
      metrics.googlBuyHold?.volatility,
      metrics.spy?.volatility,
    ].every(isFiniteNumber);
    backtest.status === "completed" && finiteBacktestMetrics
      ? pass("Backtest endpoint returns finite metrics", `GOOGL CAGR=${metrics.googlBuyHold.cagr}; SPY CAGR=${metrics.spy.cagr}`)
      : fail("Backtest endpoint returns finite metrics", JSON.stringify({ status: backtest.status, metrics, warnings: backtest.warnings }));
  } catch (error) {
    fail("Backtest endpoint returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  const health = await getHealthStatus();
  if (health.ok && health.body?.googlBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected GOOGL health payload.");
  }

  runNpmCheck("build", "Frontend build passes");
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
