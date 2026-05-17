#!/usr/bin/env node
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { runNvdaBacktest } from "../apps/api/src/services/nvdaBacktestService.mjs";
import { NVDA_BACKEND_DB_PATH, NVDA_BACKEND_TABLES } from "../modules/nvda/db/schema.mjs";
import { NVDA_BACKEND_MODEL_VERSION } from "../modules/nvda/valuation/modelVersion.mjs";

const TICKER = "NVDA";
const MODEL_VERSION = NVDA_BACKEND_MODEL_VERSION.version;
const checks = [];

function record(status, title, detail = "") {
  checks.push({ status, title, detail });
}

function pass(title, detail = "") {
  record("PASS", title, detail);
}

function warn(title, detail = "") {
  record("WARNING", title, detail);
}

function fail(title, detail = "") {
  record("FAIL", title, detail);
}

function count(table, where = "ticker = 'NVDA'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], NVDA_BACKEND_DB_PATH)[0]?.count ?? 0;
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

function expectedQuarterIds(startYear, endYear) {
  const ids = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) ids.push(`sec-q${quarter}-fy${String(year).slice(2)}`);
  }
  return ids;
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
  console.log("NVDA Backend Validation");

  if (!existsSync(NVDA_BACKEND_DB_PATH)) {
    fail("DB file exists", `${NVDA_BACKEND_DB_PATH} is missing. Run npm run nvda:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", NVDA_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], NVDA_BACKEND_DB_PATH).map((row) => row.name));
  const requiredTables = [...NVDA_BACKEND_TABLES, "daily_price_bars"];
  for (const table of requiredTables) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run nvda:backend:seed to apply migrations.");
  }

  const quarterEvents = query(
    `SELECT id, eventDate, fiscalPeriod, fiscalYear, fiscalQuarter, eventType, sourceType
     FROM reporting_events
     WHERE ticker = ?
       AND eventType IN ('q1_results', 'q2_results', 'q3_results', 'q4_results')
     ORDER BY eventDate, id`,
    [TICKER],
    NVDA_BACKEND_DB_PATH,
  );
  const foundQuarterIds = new Set(quarterEvents.map((row) => row.id));
  const requiredEightYearIds = expectedQuarterIds(2019, 2026);
  const missingEightYearIds = requiredEightYearIds.filter((id) => !foundQuarterIds.has(id));
  if (quarterEvents.length >= 32 && missingEightYearIds.length === 0) {
    pass("Eight-year quarterly reporting-event history exists", `${quarterEvents.length} quarterly events; FY2019 Q1 through FY2026 Q4 present`);
  } else {
    fail("Eight-year quarterly reporting-event history exists", `Found ${quarterEvents.length}; missing=${missingEightYearIds.join(", ") || "none"}`);
  }

  const financialRows = query(
    `SELECT periodId, asOfDate, revenue, grossProfit, operatingIncome, freeCashFlow, sourceType
     FROM financial_periods
     WHERE ticker = ? AND periodType = 'quarter'
     ORDER BY asOfDate, periodId`,
    [TICKER],
    NVDA_BACKEND_DB_PATH,
  );
  financialRows.length >= 32 && financialRows.every((row) => isFiniteNumber(row.revenue) && isFiniteNumber(row.grossProfit) && isFiniteNumber(row.operatingIncome) && row.sourceType === "official_actual")
    ? pass("Quarterly consolidated financial rows are SEC-sourced and model usable", `${financialRows.length} rows`)
    : fail("Quarterly consolidated financial rows are SEC-sourced and model usable", `Found ${financialRows.length}; missing core fields or source tags.`);

  const segmentRows = count("segment_financials");
  const productRows = count("product_financials");
  segmentRows > 0 ? pass("Backend segment rows exist", `${segmentRows} rows`) : fail("Backend segment rows exist", "No NVDA segment rows found.");
  productRows > 0 ? pass("Backend product rows exist", `${productRows} rows`) : fail("Backend product rows exist", "No NVDA product rows found.");
  const officialSegmentRows = count("segment_financials", "ticker = 'NVDA' AND sourceType = 'official_actual'");
  if (officialSegmentRows === 0) {
    warn("Official platform segment disclosures not imported", "Segment/product rows are research_only and clearly tagged; SEC Companyfacts local source did not expose platform dimensions.");
  }

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", "No NVDA market snapshots found.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('NVDA', 'SPY') GROUP BY ticker",
    [],
    NVDA_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const nvdaPriceBars = priceBarMap.get("NVDA");
  const spyPriceBars = priceBarMap.get("SPY");
  nvdaPriceBars?.count >= 2000
    ? pass("NVDA daily price bars imported", `${nvdaPriceBars.count} rows, ${nvdaPriceBars.firstDate} to ${nvdaPriceBars.lastDate}; source=${nvdaPriceBars.source}`)
    : fail("NVDA daily price bars imported", "Run npm run nvda:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}; source=${spyPriceBars.source}`)
    : fail("SPY daily price bars imported", "Run npm run nvda:backend:import-prices.");
  if (nvdaPriceBars?.sourceType?.includes("proxy") || spyPriceBars?.sourceType?.includes("proxy")) {
    warn("Price data source quality", "At least one ticker uses research-only proxy price bars. Re-run import when Yahoo market data is available.");
  }
  if (nvdaPriceBars?.sourceType?.includes("unadjusted") || spyPriceBars?.sourceType?.includes("unadjusted")) {
    warn("Adjusted close availability", "At least one ticker uses close as adjustedClose because adjusted close was unavailable in the source.");
  }

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No NVDA model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    NVDA_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0 ? pass(`Assumption sets exist: ${scenario}`, `${scenarioMap.get(scenario)} event-dated rows`) : fail(`Assumption sets missing: ${scenario}`);
  }

  const baseRunEventIds = query(
    `SELECT reportingEventId, COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?
     GROUP BY reportingEventId`,
    [TICKER, MODEL_VERSION],
    NVDA_BACKEND_DB_PATH,
  ).map((row) => row.reportingEventId);
  const missingBaseRuns = quarterEvents.map((event) => event.id).filter((id) => !baseRunEventIds.includes(id));
  missingBaseRuns.length === 0
    ? pass("Base valuation exists for each quarterly reporting event", `${baseRunEventIds.length}/${quarterEvents.length} quarterly events`)
    : fail("Base valuation exists for each quarterly reporting event", JSON.stringify(missingBaseRuns));

  const orderedBaseRuns = query(
    `WITH latest_runs AS (
       SELECT reportingEventId, MAX(createdAt) AS createdAt
       FROM valuation_runs
       WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?
       GROUP BY reportingEventId
     )
     SELECT e.id, e.eventDate, e.fiscalYear, e.fiscalQuarter, v.currentPrice, v.fairValue AS fairValue,
            v.targetPrice3Y, v.expectedShareholderCagr, v.upsideDownside, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN latest_runs lr ON lr.reportingEventId = v.reportingEventId AND lr.createdAt = v.createdAt
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate, e.id`,
    [TICKER, MODEL_VERSION, TICKER, MODEL_VERSION],
    NVDA_BACKEND_DB_PATH,
  );
  const completeRuns = orderedBaseRuns.filter((row) => isFiniteNumber(row.currentPrice) && isFiniteNumber(row.fairValue) && isFiniteNumber(row.targetPrice3Y) && isFiniteNumber(row.expectedShareholderCagr));
  completeRuns.length >= quarterEvents.length
    ? pass("Historical valuation output fields are persisted", `${completeRuns.length}/${quarterEvents.length} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation output fields are persisted", `${completeRuns.length}/${quarterEvents.length} complete Base valuation rows.`);

  const distinctBaseFairValues = new Set(orderedBaseRuns.map((row) => row.fairValue));
  distinctBaseFairValues.size > 8
    ? pass("Historical Base fair values vary by event", `${distinctBaseFairValues.size} distinct rounded fair values`)
    : fail("Historical Base fair values vary by event", `Only ${distinctBaseFairValues.size} distinct rounded fair values.`);

  let longestFlatRun = 1;
  let currentFlatRun = 1;
  for (let index = 1; index < orderedBaseRuns.length; index += 1) {
    if (orderedBaseRuns[index].fairValue === orderedBaseRuns[index - 1].fairValue) {
      currentFlatRun += 1;
      longestFlatRun = Math.max(longestFlatRun, currentFlatRun);
    } else {
      currentFlatRun = 1;
    }
  }
  longestFlatRun <= 2
    ? pass("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}`)
    : fail("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}.`);

  const futureLeakRows = orderedBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const dates = [
      ...(snapshot.financialPeriodAsOfDates ?? []),
      ...(snapshot.segmentAsOfDates ?? []),
      ...(snapshot.productAsOfDates ?? []),
      ...(snapshot.operatingMetricAsOfDates ?? []),
      ...(snapshot.customerEndMarketAsOfDates ?? []),
      ...(snapshot.supplyChainAsOfDates ?? []),
    ];
    return dates.some((date) => date && date > row.eventDate);
  });
  futureLeakRows.length === 0
    ? pass("Snapshot rows are dated on or before valuation as-of date", `${orderedBaseRuns.length} Base runs checked`)
    : fail("Snapshot rows are dated on or before valuation as-of date", JSON.stringify(futureLeakRows.map((row) => row.id)));

  const badPriceRows = orderedBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const priceDate = snapshot.asOfPriceSource?.priceDate;
    return !priceDate || priceDate > row.eventDate;
  });
  badPriceRows.length === 0
    ? pass("Historical as-of price uses nearest prior daily market row", `${orderedBaseRuns.length} price anchors checked`)
    : fail("Historical as-of price uses nearest prior daily market row", JSON.stringify(badPriceRows.map((row) => row.id)));

  const wrongPriceRows = orderedBaseRuns.filter((row) => {
    const expected = query(
      `SELECT adjustedClose
       FROM daily_price_bars
       WHERE ticker = ? AND priceDate <= ?
       ORDER BY priceDate DESC
       LIMIT 1`,
      [TICKER, row.eventDate],
      NVDA_BACKEND_DB_PATH,
    )[0]?.adjustedClose;
    return expected == null || Math.abs(Number(expected) - Number(row.currentPrice)) > 0.0001;
  });
  wrongPriceRows.length === 0
    ? pass("Historical as-of price equals daily_price_bars nearest prior adjusted close")
    : fail("Historical as-of price equals daily_price_bars nearest prior adjusted close", JSON.stringify(wrongPriceRows.map((row) => row.id)));

  const earlyLeakage = orderedBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const assumptions = snapshot.asOfAssumptionOverrides ?? {};
    const eventDate = row.eventDate;
    return (
      (eventDate < "2023-05-01" && (assumptions.dataCenterGrowth ?? 0) > 0.40) ||
      (eventDate < "2024-03-18" && (assumptions.blackwellKnown ?? 0) !== 0) ||
      (eventDate < "2025-03-01" && (assumptions.rubinKnown ?? 0) !== 0) ||
      (eventDate < "2022-09-01" && (assumptions.chinaRiskHaircut ?? 0) !== 0) ||
      (eventDate < "2023-05-01" && (assumptions.supplyConstraintBenefit ?? 0) > 0.01) ||
      (eventDate < "2023-05-01" && (assumptions.grossMargin ?? 0) > 0.72)
    );
  });
  earlyLeakage.length === 0
    ? pass("Old-year valuations do not use latest AI scale, Blackwell/Rubin, China or supply assumptions", `${orderedBaseRuns.length} Base runs checked`)
    : fail("Old-year valuations do not use latest NVDA assumptions", JSON.stringify(earlyLeakage.map((row) => row.id)));

  const badUpsideRows = orderedBaseRuns.filter((row) => {
    const expected = row.currentPrice && row.fairValue ? row.fairValue / row.currentPrice - 1 : null;
    return expected == null || Math.abs(expected - row.upsideDownside) > 0.0001;
  });
  badUpsideRows.length === 0
    ? pass("Historical upside/downside uses persisted fair value versus event price")
    : fail("Historical upside/downside uses persisted fair value versus event price", JSON.stringify(badUpsideRows.map((row) => row.id)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'NVDA' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are not model-ready")
    : fail("Transcript candidates are not model-ready", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'NVDA' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
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
    NVDA_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only across mixed currencies")
    : fail("Peer absolute values are metadata-only across mixed currencies", JSON.stringify(mixedCurrencyPeerMisuse));

  try {
    const backtest = runNvdaBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY", modelVersion: MODEL_VERSION });
    const nvdaMetrics = backtest.metrics?.nvdaBuyHold;
    const spyMetrics = backtest.metrics?.spy;
    backtest.status === "completed" &&
      backtest.curve?.length >= 2000 &&
      isFiniteNumber(nvdaMetrics?.cagr) &&
      isFiniteNumber(nvdaMetrics?.maxDrawdown) &&
      isFiniteNumber(nvdaMetrics?.sharpe) &&
      isFiniteNumber(nvdaMetrics?.volatility) &&
      isFiniteNumber(spyMetrics?.cagr) &&
      isFiniteNumber(spyMetrics?.maxDrawdown) &&
      isFiniteNumber(spyMetrics?.sharpe) &&
      isFiniteNumber(spyMetrics?.volatility)
      ? pass("NVDA vs SPY backtest returns finite metrics", `curve=${backtest.curve.length}; nvdaCagr=${nvdaMetrics.cagr}; spyCagr=${spyMetrics.cagr}`)
      : fail("NVDA vs SPY backtest returns finite metrics", JSON.stringify(backtest).slice(0, 1000));
  } catch (error) {
    fail("NVDA vs SPY backtest returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  const frontend = existsSync("src/stocks/nvda/dashboard.tsx") ? readFileSync("src/stocks/nvda/dashboard.tsx", "utf8") : "";
  frontend.includes("/api/nvda/historical-valuations") && frontend.includes("/api/nvda/backtests") && frontend.includes("API offline")
    ? pass("Frontend is backend-aware and has offline fallback", "NVDA dashboard calls backend historical valuation/backtest APIs and labels offline state")
    : fail("Frontend is backend-aware and has offline fallback", "NVDA dashboard must call backend APIs and expose API offline state.");

  const health = await getHealthStatus();
  if (health.ok && health.body?.nvdaBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected NVDA health payload.");
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
