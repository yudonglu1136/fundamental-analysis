#!/usr/bin/env node
import http from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { runAaplBacktest } from "../apps/api/src/services/aaplBacktestService.mjs";
import { getAaplCapitalReturnHistory } from "../apps/api/src/services/aaplSnapshotService.mjs";
import { createAaplValuationRun } from "../apps/api/src/services/aaplValuationService.mjs";
import { AAPL_BACKEND_DB_PATH, AAPL_BACKEND_TABLES } from "../modules/aapl/db/schema.mjs";
import { AAPL_BACKEND_MODEL_VERSION } from "../modules/aapl/valuation/modelVersion.mjs";

const TICKER = "AAPL";
const MODEL_VERSION = AAPL_BACKEND_MODEL_VERSION.version;
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

function count(table, where = "ticker = 'AAPL'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], AAPL_BACKEND_DB_PATH)[0]?.count ?? 0;
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

function expectedFiscalPeriods() {
  const periods = [];
  for (let fiscalYear = 2018; fiscalYear <= 2025; fiscalYear += 1) {
    for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) periods.push(`FY${fiscalYear} ${quarter}`);
  }
  periods.push("FY2026 Q1", "FY2026 Q2");
  return periods;
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
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.status === 0) {
    pass(title, `npm run ${scriptName}`);
  } else {
    fail(title, (result.stderr || result.stdout || `npm run ${scriptName} failed`).slice(0, 2500));
  }
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

async function main() {
  console.log("AAPL Backend Validation");

  if (!existsSync(AAPL_BACKEND_DB_PATH)) {
    fail("DB file exists", `${AAPL_BACKEND_DB_PATH} is missing. Run npm run aapl:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", AAPL_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], AAPL_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of AAPL_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run aapl:backend:seed.");
  }
  tables.has("daily_price_bars")
    ? pass("Table exists: daily_price_bars")
    : fail("Table missing: daily_price_bars", "Run npm run aapl:backend:import-prices.");

  const events = query(
    "SELECT id, eventDate, fiscalPeriod, fiscalYear, fiscalQuarter, eventType FROM reporting_events WHERE ticker = ? ORDER BY fiscalYear, fiscalQuarter",
    [TICKER],
    AAPL_BACKEND_DB_PATH,
  );
  const eventCount = events.length;
  eventCount >= 34 ? pass("Quarterly reporting events imported", `${eventCount} rows`) : fail("Quarterly reporting events imported", `${eventCount} rows`);
  const presentPeriods = new Set(events.map((event) => event.fiscalPeriod));
  const missingPeriods = expectedFiscalPeriods().filter((period) => !presentPeriods.has(period));
  missingPeriods.length === 0
    ? pass("Eight-year quarterly history covers FY2018 Q1 through FY2026 Q2", `${expectedFiscalPeriods().length} expected periods`)
    : fail("Eight-year quarterly history covers FY2018 Q1 through FY2026 Q2", `Missing: ${missingPeriods.join(", ")}`);

  const financialRows = query(
    `SELECT periodId, asOfDate, revenue, operatingIncome, freeCashFlow
     FROM financial_periods
     WHERE ticker = ? AND periodType = 'quarter'
     ORDER BY asOfDate`,
    [TICKER],
    AAPL_BACKEND_DB_PATH,
  );
  financialRows.length >= 34 && financialRows.every((row) => isFiniteNumber(row.revenue) && isFiniteNumber(row.operatingIncome))
    ? pass("Quarterly financial rows are model usable", `${financialRows.length} rows with revenue and operating income`)
    : fail("Quarterly financial rows are model usable", `Found ${financialRows.length}; missing core fields.`);

  const productRows = count("product_financials");
  productRows >= 150
    ? pass("Product financial rows imported", `${productRows} rows`)
    : warn("Product financial rows imported", `${productRows} rows; source filings may not include all product categories.`);
  const geoRows = count("geographic_financials");
  geoRows >= 120
    ? pass("Geographic financial rows imported", `${geoRows} rows`)
    : warn("Geographic financial rows imported", `${geoRows} rows; source filings may not include all geographies.`);

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", "No market snapshots found.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('AAPL', 'SPY') GROUP BY ticker",
    [],
    AAPL_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const aaplPriceBars = priceBarMap.get("AAPL");
  const spyPriceBars = priceBarMap.get("SPY");
  aaplPriceBars?.count >= 2000
    ? pass("AAPL daily price bars imported", `${aaplPriceBars.count} rows, ${aaplPriceBars.firstDate} to ${aaplPriceBars.lastDate}`)
    : fail("AAPL daily price bars imported", "Run npm run aapl:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}`)
    : fail("SPY daily price bars imported", "Run npm run aapl:backend:import-prices.");

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No AAPL model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    AAPL_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0
      ? pass(`Assumption set exists: ${scenario}`)
      : fail(`Assumption set missing: ${scenario}`, "Seed must create Bear/Base/Bull defaults.");
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", [TICKER], AAPL_BACKEND_DB_PATH)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate}, ${latestEvent.fiscalPeriod})`);
    try {
      const valuation = await createAaplValuationRun({ eventId: latestEvent.id, scenario: "Base", modelVersion: MODEL_VERSION });
      const fairValue = valuation.valuationRun?.fairValue ?? valuation.valuationResult?.recommendedFairValue ?? null;
      if (isFiniteNumber(valuation.valuationRun?.currentPrice) && isFiniteNumber(fairValue)) {
        pass("Backend valuation run created", `currentPrice=${valuation.valuationRun.currentPrice}; fairValue=${fairValue}`);
      } else {
        fail("Backend valuation run created", "Valuation result did not return finite currentPrice and fairValue.");
      }
      if (isFiniteNumber(valuation.valuationRun?.targetPrice3Y) && isFiniteNumber(valuation.valuationRun?.expectedShareholderCagr)) {
        pass("Target price and CAGR persisted", `targetPrice3Y=${valuation.valuationRun.targetPrice3Y}`);
      } else {
        fail("Target price and CAGR persisted", "Missing targetPrice3Y or expectedShareholderCagr.");
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
    AAPL_BACKEND_DB_PATH,
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  eventCount > 0 && historicalRunEventIds.size >= eventCount
    ? pass("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events`)
    : fail("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events. Run npm run aapl:backend:backfill-valuations -- --base-only.`);

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
    AAPL_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  finiteHistoricalRuns >= eventCount
    ? pass("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${eventCount} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${eventCount} complete Base valuation rows.`);

  const baseFairValues = query(
    `SELECT reportingEventId, ROUND(fairValue, 2) AS fairValue
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ? AND fairValue IS NOT NULL`,
    [TICKER, MODEL_VERSION],
    AAPL_BACKEND_DB_PATH,
  );
  const distinctBaseFairValues = new Set(baseFairValues.map((row) => row.fairValue));
  distinctBaseFairValues.size > 8
    ? pass("Historical Base fair values vary by event", `${distinctBaseFairValues.size} distinct rounded fair values`)
    : fail("Historical Base fair values vary by event", `Only ${distinctBaseFairValues.size} distinct rounded fair values.`);

  const orderedBaseRuns = query(
    `SELECT e.id, e.eventDate, e.fiscalPeriod, v.currentPrice, v.fairValue, v.upsideDownside, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     JOIN (
       SELECT reportingEventId, MAX(createdAt) AS latestCreatedAt
       FROM valuation_runs
       WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?
       GROUP BY reportingEventId
     ) latest ON latest.reportingEventId = v.reportingEventId AND latest.latestCreatedAt = v.createdAt
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate, e.id`,
    [TICKER, MODEL_VERSION, TICKER, MODEL_VERSION],
    AAPL_BACKEND_DB_PATH,
  );
  let longestFlatRun = 1;
  let currentFlatRun = 1;
  for (let index = 1; index < orderedBaseRuns.length; index += 1) {
    if (Math.round(orderedBaseRuns[index].fairValue * 100) === Math.round(orderedBaseRuns[index - 1].fairValue * 100)) {
      currentFlatRun += 1;
      longestFlatRun = Math.max(longestFlatRun, currentFlatRun);
    } else {
      currentFlatRun = 1;
    }
  }
  longestFlatRun <= 2
    ? pass("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}`)
    : fail("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}.`);

  const futureLeakedRows = orderedBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const dates = [
      snapshot.sourceMaxAsOfDate,
      snapshot.latestFinancialAsOfDate,
      snapshot.latestProductAsOfDate,
      snapshot.latestGeographicAsOfDate,
      snapshot.asOfPriceSource?.priceDate,
      snapshot.priceDate,
    ].filter(Boolean);
    return dates.some((date) => date > row.eventDate);
  });
  futureLeakedRows.length === 0
    ? pass("Data snapshot dates do not exceed valuation as-of date")
    : fail("Data snapshot dates do not exceed valuation as-of date", JSON.stringify(futureLeakedRows.map((row) => row.id)));

  const badPriceAnchors = orderedBaseRuns.filter((row) => {
    const expected = query(
      `SELECT priceDate, adjustedClose
       FROM daily_price_bars
       WHERE ticker = ? AND priceDate <= ?
       ORDER BY priceDate DESC LIMIT 1`,
      [TICKER, row.eventDate],
      AAPL_BACKEND_DB_PATH,
    )[0] ?? null;
    return expected && (expected.priceDate > row.eventDate || Math.abs(Number(expected.adjustedClose) - Number(row.currentPrice)) > 0.01);
  });
  badPriceAnchors.length === 0
    ? pass("Historical as-of price uses nearest prior daily market data")
    : fail("Historical as-of price uses nearest prior daily market data", JSON.stringify(badPriceAnchors.map((row) => row.id)));

  const earlyRuns = orderedBaseRuns.filter((row) => row.fiscalPeriod?.startsWith("FY2018"));
  const oldYearLeakage = earlyRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const overrides = snapshot.asOfAssumptionOverrides ?? {};
    return (
      (snapshot.latestAnnualizedRevenue ?? 0) > 380_000 ||
      (overrides.servicesGrossMargin ?? 0) > 0.72 ||
      (overrides.aiOptionalityPerShare ?? 0) !== 0 ||
      (overrides.servicesRegulatoryHaircut ?? 0) > 0.04 ||
      (overrides.chinaRiskHaircut ?? 0) > 0.08
    );
  });
  earlyRuns.length >= 4 && oldYearLeakage.length === 0
    ? pass("FY2018 valuations do not leak latest AAPL scale, Services margin, AI, China or regulation assumptions")
    : fail("FY2018 valuations do not leak latest AAPL assumptions", JSON.stringify(oldYearLeakage.map((row) => row.id)));

  const preSplitShareMismatches = orderedBaseRuns.filter((row) => {
    if (row.eventDate >= "2020-08-31") return false;
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return (snapshot.asOfAssumptionOverrides?.dilutedShares ?? 0) < 10_000;
  });
  preSplitShareMismatches.length === 0
    ? pass("Pre-split AAPL valuations use split-adjusted share counts")
    : fail("Pre-split AAPL valuations use split-adjusted share counts", JSON.stringify(preSplitShareMismatches.map((row) => row.id)));

  const badUpsideRows = orderedBaseRuns.filter((row) => {
    const expected = row.currentPrice && row.fairValue ? row.fairValue / row.currentPrice - 1 : null;
    return expected == null || Math.abs(expected - row.upsideDownside) > 0.0001;
  });
  badUpsideRows.length === 0
    ? pass("Historical upside/downside uses persisted fair value versus event price")
    : fail("Historical upside/downside uses persisted fair value versus event price", JSON.stringify(badUpsideRows.map((row) => row.id)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'AAPL' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are not model-ready")
    : fail("Transcript candidates are not model-ready", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'AAPL' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
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
    AAPL_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only across mixed currencies")
    : fail("Peer absolute values are metadata-only across mixed currencies", JSON.stringify(mixedCurrencyPeerMisuse));

  try {
    const backtest = runAaplBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const metrics = backtest.metrics ?? {};
    backtest.status === "completed" &&
      backtest.curve?.length >= 2000 &&
      isFiniteNumber(metrics.aaplBuyHold?.cagr) &&
      isFiniteNumber(metrics.aaplBuyHold?.maxDrawdown) &&
      isFiniteNumber(metrics.aaplBuyHold?.sharpe) &&
      isFiniteNumber(metrics.aaplBuyHold?.volatility) &&
      isFiniteNumber(metrics.spy?.cagr) &&
      isFiniteNumber(metrics.spy?.maxDrawdown) &&
      isFiniteNumber(metrics.spy?.sharpe) &&
      isFiniteNumber(metrics.spy?.volatility)
      ? pass("AAPL vs SPY backtest returns finite metrics", `curve=${backtest.curve.length}; aaplCagr=${metrics.aaplBuyHold.cagr}; spyCagr=${metrics.spy.cagr}`)
      : fail("AAPL vs SPY backtest returns finite metrics", JSON.stringify(backtest).slice(0, 1200));
  } catch (error) {
    fail("AAPL vs SPY backtest returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  try {
    const capitalReturns = getAaplCapitalReturnHistory({ years: 8 });
    const rows = capitalReturns.rows ?? [];
    const completeRows = rows.filter((row) =>
      isFiniteNumber(row.fiscalYear) &&
      isFiniteNumber(row.dividendPerShare) &&
      isFiniteNumber(row.dividendPerShareCents) &&
      isFiniteNumber(row.dividendCashCost) &&
      isFiniteNumber(row.buybackAmount) &&
      isFiniteNumber(row.equityFreeCashFlow) &&
      isFiniteNumber(row.totalCapitalReturn) &&
      isFiniteNumber(row.fcfCoverage),
    );
    rows.length === 8 && completeRows.length === 8
      ? pass("AAPL capital-return endpoint/service has 8 annual rows", `${rows[0]?.fiscalYear}-${rows[rows.length - 1]?.fiscalYear}; latest DPS=${capitalReturns.summary.latestDividendPerShare}; latest buyback=${capitalReturns.summary.latestBuybackAmount}`)
      : fail("AAPL capital-return endpoint/service has 8 annual rows", JSON.stringify({ rows: rows.length, completeRows: completeRows.length, warnings: capitalReturns.warnings }));

    const hasStackedCapitalReturnSeries =
      rows.some((row) => (row.dividendCashCost ?? 0) > 0) &&
      rows.some((row) => (row.buybackAmount ?? 0) > 0) &&
      rows.every((row) => isFiniteNumber(row.totalCapitalReturn));
    hasStackedCapitalReturnSeries
      ? pass("AAPL stacked capital-return series exists", `cumulativeDividend=${capitalReturns.summary.cumulativeDividendCash}; cumulativeBuybacks=${capitalReturns.summary.cumulativeBuybacks}`)
      : fail("AAPL stacked capital-return series exists", JSON.stringify(capitalReturns.summary));

    const hasFcfComparisonSeries = rows.every((row) => isFiniteNumber(row.equityFreeCashFlow) && row.equityFreeCashFlow > 0);
    hasFcfComparisonSeries
      ? pass("AAPL FCF comparison series exists", `cumulativeFcf=${capitalReturns.summary.cumulativeFcf}`)
      : fail("AAPL FCF comparison series exists", JSON.stringify(rows.map((row) => ({ fiscalYear: row.fiscalYear, fcf: row.equityFreeCashFlow }))));

    const forward = capitalReturns.forwardExpectation;
    forward?.isForecast === true &&
      forward.sourceType === "forecast_assumption" &&
      isFiniteNumber(forward.dividendCashCost) &&
      isFiniteNumber(forward.buybackAmount) &&
      isFiniteNumber(forward.equityFreeCashFlow) &&
      isFiniteNumber(forward.totalCapitalReturn) &&
      isFiniteNumber(forward.fcfCoverage)
      ? pass("AAPL capital-return history includes forward forecast bar", `FY${forward.fiscalYear}E; dividendCash=${forward.dividendCashCost}; buyback=${forward.buybackAmount}; fcf=${forward.equityFreeCashFlow}`)
      : fail("AAPL capital-return history includes forward forecast bar", JSON.stringify(forward));

    const proxyRows = rows.filter((row) => ["market_data_proxy", "official_seed"].includes(row.sourceQuality));
    const proxyWarning = capitalReturns.warnings?.some((warning) => warning.id === "aapl-capital-return-proxy-years");
    proxyRows.length === 0 || proxyWarning
      ? pass("AAPL proxy capital-return rows generate warnings", proxyRows.length ? `Proxy years: ${proxyRows.map((row) => row.fiscalYear).join(", ")}` : "No proxy rows")
      : fail("AAPL proxy capital-return rows generate warnings", JSON.stringify(proxyRows));

    const frontendFieldsPresent = [...rows, forward].filter(Boolean).every((row) =>
      ["fiscalYear", "periodId", "asOfDate", "sourceType", "sourceQuality", "equityFreeCashFlow", "dividendPerShare", "dividendPerShareCents", "dividendCashCost", "buybackAmount", "totalCapitalReturn", "fcfCoverage", "payoutRatioOfFcf", "isForecast"]
        .every((field) => Object.prototype.hasOwnProperty.call(row, field)),
    );
    frontendFieldsPresent
      ? pass("AAPL capital-return frontend-required fields are present")
      : fail("AAPL capital-return frontend-required fields are present", JSON.stringify([...rows, forward].filter(Boolean)[0]));

    const buybackHeavyRows = rows.filter((row) => (row.buybackAmount ?? 0) > (row.dividendCashCost ?? 0));
    buybackHeavyRows.length >= 8 && buybackHeavyRows.some((row) => (row.buybackAmount ?? 0) > (row.dividendCashCost ?? 0) * 4)
      ? pass("AAPL buyback-heavy years are visible and not collapsed into dividends", `${buybackHeavyRows.length}/8 years buybacks exceed dividend cash cost`)
      : fail("AAPL buyback-heavy years are visible and not collapsed into dividends", JSON.stringify(rows.map((row) => ({ fiscalYear: row.fiscalYear, dividends: row.dividendCashCost, buybacks: row.buybackAmount }))));

    const coveragePressureRows = rows.filter((row) => (row.totalCapitalReturn ?? 0) > (row.equityFreeCashFlow ?? Infinity));
    coveragePressureRows.length > 0 && coveragePressureRows.every((row) => isFiniteNumber(row.fcfCoverage))
      ? pass("AAPL FCF coverage is finite when capital return exceeds FCF", coveragePressureRows.map((row) => `FY${row.fiscalYear}:${row.fcfCoverage}`).join(", "))
      : fail("AAPL FCF coverage is finite when capital return exceeds FCF", JSON.stringify(coveragePressureRows));
  } catch (error) {
    fail("AAPL capital-return endpoint/service has 8 annual rows", error instanceof Error ? error.message : String(error));
  }

  const health = await getHealthStatus();
  if (health.ok && health.body?.aaplBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected AAPL health payload.");
  }

  runNpmCheck("typecheck", "Typecheck passes");
  runNpmCheck("build", "Frontend build passes");
  printAndExit();
}

main().catch((error) => {
  fail("Validation crashed", error instanceof Error ? error.stack ?? error.message : String(error));
  printAndExit();
});
