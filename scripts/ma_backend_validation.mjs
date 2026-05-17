#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { execute, query } from "../apps/api/src/db/client.mjs";
import { routeStockBackend } from "../apps/api/src/routes/stockBackend.mjs";
import { runMaBacktest } from "../apps/api/src/services/maBacktestService.mjs";
import { getMaCapitalReturnHistory } from "../apps/api/src/services/maSnapshotService.mjs";
import { createMaValuationRun } from "../apps/api/src/services/maValuationService.mjs";
import { MA_BACKEND_DB_PATH, MA_BACKEND_TABLES } from "../modules/ma/db/schema.mjs";
import { MA_BACKEND_MODEL_VERSION } from "../modules/ma/valuation/modelVersion.mjs";

const TICKER = "MA";
const MODEL_VERSION = MA_BACKEND_MODEL_VERSION.version;
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

function count(table, where = "ticker = 'MA'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], MA_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function expectedFiscalPeriods() {
  const periods = [];
  for (let fiscalYear = 2018; fiscalYear <= 2025; fiscalYear += 1) {
    for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) periods.push(`FY${fiscalYear} ${quarter}`);
  }
  periods.push("FY2026 Q1");
  return periods;
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

async function checkCapitalReturnRoute(path) {
  const route = await routeStockBackend({ method: "GET" }, new URL(`http://127.0.0.1:8787${path}`), null);
  return route;
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
  console.log("MA Backend Validation");

  if (!existsSync(MA_BACKEND_DB_PATH)) {
    fail("DB file exists", `${MA_BACKEND_DB_PATH} is missing. Run npm run ma:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", MA_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], MA_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of MA_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run ma:backend:seed.");
  }

  const events = query(
    "SELECT id, eventDate, fiscalPeriod, fiscalYear, fiscalQuarter, eventType FROM reporting_events WHERE ticker = ? ORDER BY fiscalYear, fiscalQuarter",
    [TICKER],
    MA_BACKEND_DB_PATH,
  );
  const eventCount = events.length;
  eventCount >= 32 ? pass("At least 8 years of quarterly reporting events imported", `${eventCount} rows`) : fail("At least 8 years of quarterly reporting events imported", `${eventCount} rows`);
  const presentPeriods = new Set(events.map((event) => event.fiscalPeriod));
  const missingPeriods = expectedFiscalPeriods().filter((period) => !presentPeriods.has(period));
  missingPeriods.length === 0
    ? pass("Quarterly history covers FY2018 Q1 through FY2026 Q1", `${expectedFiscalPeriods().length} expected periods`)
    : fail("Quarterly history covers FY2018 Q1 through FY2026 Q1", `Missing: ${missingPeriods.join(", ")}`);

  const financialRows = query(
    `SELECT periodId, asOfDate, revenue, operatingIncome, freeCashFlow, dilutedShares
     FROM financial_periods
     WHERE ticker = ? AND periodType = 'quarter'
     ORDER BY asOfDate`,
    [TICKER],
    MA_BACKEND_DB_PATH,
  );
  financialRows.length >= 32 && financialRows.every((row) => isFiniteNumber(row.revenue) && isFiniteNumber(row.operatingIncome) && isFiniteNumber(row.freeCashFlow))
    ? pass("Quarterly financial rows are model usable", `${financialRows.length} rows with revenue, operating income and FCF`)
    : fail("Quarterly financial rows are model usable", `Found ${financialRows.length}; missing core fields.`);

  const metricRows = query(
    `SELECT crossBorderVolumeGrowth, switchedTransactions, grossDollarVolume, purchaseVolume, takeRate
     FROM operating_metric_snapshots
     WHERE ticker = ?`,
    [TICKER],
    MA_BACKEND_DB_PATH,
  );
  metricRows.length >= eventCount && metricRows.every((row) => isFiniteNumber(row.switchedTransactions) && isFiniteNumber(row.grossDollarVolume) && isFiniteNumber(row.takeRate))
    ? pass("MA-specific payments metrics imported", `${metricRows.length} rows with GDV, purchase volume, cross-border and switched transaction fields`)
    : fail("MA-specific payments metrics imported", `${metricRows.length} rows; missing MA-specific fields.`);

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No MA model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    MA_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0
      ? pass(`Assumption set exists: ${scenario}`)
      : fail(`Assumption set missing: ${scenario}`, "Seed must create Bear/Base/Bull defaults.");
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", [TICKER], MA_BACKEND_DB_PATH)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate}, ${latestEvent.fiscalPeriod})`);
    let createdValuationId = null;
    try {
      const valuation = await createMaValuationRun({ eventId: latestEvent.id, scenario: "Base", modelVersion: MODEL_VERSION });
      createdValuationId = valuation.id ?? null;
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
    } finally {
      if (createdValuationId) {
        execute("DELETE FROM valuation_runs WHERE id = ?", [createdValuationId], MA_BACKEND_DB_PATH);
      }
    }
  }

  const baseHistoricalRuns = query(
    `SELECT reportingEventId, COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ? AND scenario = ? AND modelVersion = ?
     GROUP BY reportingEventId`,
    [TICKER, "Base", MODEL_VERSION],
    MA_BACKEND_DB_PATH,
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  eventCount > 0 && historicalRunEventIds.size >= eventCount
    ? pass("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events`)
    : fail("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events. Run npm run ma:backend:backfill-valuations -- --base-only.`);

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
    MA_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  finiteHistoricalRuns >= eventCount
    ? pass("Historical valuation outputs are finite", `${finiteHistoricalRuns}/${eventCount} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation outputs are finite", `${finiteHistoricalRuns}/${eventCount} complete Base valuation rows.`);

  const baseFairValues = query(
    `SELECT reportingEventId, ROUND(fairValue, 2) AS fairValue
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ? AND fairValue IS NOT NULL`,
    [TICKER, MODEL_VERSION],
    MA_BACKEND_DB_PATH,
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
    MA_BACKEND_DB_PATH,
  );

  const futureLeakedRows = orderedBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const dates = [
      snapshot.sourceMaxAsOfDate,
      snapshot.latestFinancialAsOfDate,
      snapshot.latestMetricAsOfDate,
      snapshot.asOfPriceSource?.priceDate,
      snapshot.priceDate,
    ].filter(Boolean);
    return dates.some((date) => date > row.eventDate);
  });
  futureLeakedRows.length === 0
    ? pass("No future data leakage in historical valuation snapshots")
    : fail("No future data leakage in historical valuation snapshots", JSON.stringify(futureLeakedRows.map((row) => row.id)));

  const badPriceAnchors = orderedBaseRuns.filter((row) => {
    const expected = query(
      `SELECT priceDate, adjustedClose
       FROM daily_price_bars
       WHERE ticker = ? AND priceDate <= ?
       ORDER BY priceDate DESC LIMIT 1`,
      [TICKER, row.eventDate],
      MA_BACKEND_DB_PATH,
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
      (snapshot.latestAnnualizedRevenue ?? 0) > 25_000 ||
      (overrides.valueAddedServicesGrowth ?? 0) > 0.18 ||
      (overrides.regulatoryHaircut ?? 0) > 0.10 ||
      (snapshot.maAnalyticalFramework?.takeRate ?? 0) > 0.004
    );
  });
  earlyRuns.length >= 4 && oldYearLeakage.length === 0
    ? pass("FY2018 valuations do not leak latest MA scale or current risk assumptions")
    : fail("FY2018 valuations do not leak latest MA scale or current risk assumptions", JSON.stringify(oldYearLeakage.map((row) => row.id)));

  const badUpsideRows = orderedBaseRuns.filter((row) => {
    const expected = row.currentPrice && row.fairValue ? row.fairValue / row.currentPrice - 1 : null;
    return expected == null || Math.abs(expected - row.upsideDownside) > 0.0001;
  });
  badUpsideRows.length === 0
    ? pass("Historical upside/downside uses persisted fair value versus event price")
    : fail("Historical upside/downside uses persisted fair value versus event price", JSON.stringify(badUpsideRows.map((row) => row.id)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'MA' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are not model-ready")
    : fail("Transcript candidates are not model-ready", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'MA' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
  );
  guidanceCandidatesPromoted === 0
    ? pass("Guidance candidates are not valuation-impacting")
    : fail("Guidance candidates are not valuation-impacting", `${guidanceCandidatesPromoted} candidate guidance rows allow valuation impact.`);

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('MA', 'SPY') GROUP BY ticker",
    [],
    MA_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const maPriceBars = priceBarMap.get("MA");
  const spyPriceBars = priceBarMap.get("SPY");
  maPriceBars?.count >= 2000
    ? pass("MA daily price bars exist", `${maPriceBars.count} rows, ${maPriceBars.firstDate} to ${maPriceBars.lastDate}`)
    : fail("MA daily price bars exist", "Run npm run ma:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars exist", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}`)
    : fail("SPY daily price bars exist", "Run npm run ma:backend:import-prices.");

  try {
    const backtest = runMaBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const metrics = backtest.metrics ?? {};
    backtest.status === "completed" &&
      backtest.curve?.length >= 2000 &&
      isFiniteNumber(metrics.maBuyHold?.cagr) &&
      isFiniteNumber(metrics.maBuyHold?.maxDrawdown) &&
      isFiniteNumber(metrics.maBuyHold?.sharpe) &&
      isFiniteNumber(metrics.maBuyHold?.volatility) &&
      isFiniteNumber(metrics.spy?.cagr) &&
      isFiniteNumber(metrics.spy?.maxDrawdown) &&
      isFiniteNumber(metrics.spy?.sharpe) &&
      isFiniteNumber(metrics.spy?.volatility)
      ? pass("MA vs SPY backtest returns finite metrics", `curve=${backtest.curve.length}; maCagr=${metrics.maBuyHold.cagr}; spyCagr=${metrics.spy.cagr}`)
      : fail("MA vs SPY backtest returns finite metrics", JSON.stringify(backtest).slice(0, 1200));
  } catch (error) {
    fail("MA vs SPY backtest returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  try {
    const legacyRoute = await checkCapitalReturnRoute("/api/ma/capital-returns?years=8");
    const unifiedRoute = await checkCapitalReturnRoute("/api/stocks/ma/capital-returns?years=8");
    legacyRoute?.status === 200 && unifiedRoute?.status === 200
      ? pass("Capital-return API endpoints work", "legacy and unified routes returned 200")
      : fail("Capital-return API endpoints work", JSON.stringify({ legacy: legacyRoute?.status, unified: unifiedRoute?.status }));

    const capitalReturns = getMaCapitalReturnHistory({ years: 8 });
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
      ? pass("MA capital-return service has 8 annual rows", `${rows[0]?.fiscalYear}-${rows[rows.length - 1]?.fiscalYear}`)
      : fail("MA capital-return service has 8 annual rows", JSON.stringify({ rows: rows.length, completeRows: completeRows.length, warnings: capitalReturns.warnings }));

    const hasStackedCapitalReturnSeries =
      rows.some((row) => (row.dividendCashCost ?? 0) > 0) &&
      rows.some((row) => (row.buybackAmount ?? 0) > 0) &&
      rows.every((row) => isFiniteNumber(row.totalCapitalReturn));
    hasStackedCapitalReturnSeries
      ? pass("MA stacked capital-return series exists", `cumulativeDividend=${capitalReturns.summary.cumulativeDividendCash}; cumulativeBuybacks=${capitalReturns.summary.cumulativeBuybacks}`)
      : fail("MA stacked capital-return series exists", JSON.stringify(capitalReturns.summary));

    const hasFcfComparisonSeries = rows.every((row) => isFiniteNumber(row.equityFreeCashFlow) && row.equityFreeCashFlow > 0);
    hasFcfComparisonSeries
      ? pass("MA FCF comparison series exists", `cumulativeFcf=${capitalReturns.summary.cumulativeFcf}`)
      : fail("MA FCF comparison series exists", JSON.stringify(rows.map((row) => ({ fiscalYear: row.fiscalYear, fcf: row.equityFreeCashFlow }))));

    const forward = capitalReturns.forwardExpectation;
    forward?.isForecast === true &&
      forward.sourceType === "forecast_assumption" &&
      isFiniteNumber(forward.dividendCashCost) &&
      isFiniteNumber(forward.buybackAmount) &&
      isFiniteNumber(forward.equityFreeCashFlow) &&
      isFiniteNumber(forward.totalCapitalReturn) &&
      isFiniteNumber(forward.fcfCoverage)
      ? pass("MA capital-return history includes forward forecast bar", `FY${forward.fiscalYear}E; capitalReturn=${forward.totalCapitalReturn}`)
      : fail("MA capital-return history includes forward forecast bar", JSON.stringify(forward));

    const proxyRows = rows.filter((row) => ["market_data_proxy", "official_seed"].includes(row.sourceType) || String(row.sourceQuality).includes("proxy") || String(row.sourceQuality).includes("seed"));
    const proxyWarning = capitalReturns.warnings?.some((warning) => warning.id === "ma-capital-return-proxy-years");
    proxyRows.length === 0 || proxyWarning
      ? pass("MA proxy capital-return rows generate warnings", proxyRows.length ? `Proxy/seed years: ${proxyRows.map((row) => row.fiscalYear).join(", ")}` : "No proxy rows")
      : fail("MA proxy capital-return rows generate warnings", JSON.stringify(proxyRows));

    const frontendFieldsPresent = [...rows, forward].filter(Boolean).every((row) =>
      ["fiscalYear", "periodId", "asOfDate", "sourceType", "sourceQuality", "equityFreeCashFlow", "dividendPerShare", "dividendPerShareCents", "dividendCashCost", "buybackAmount", "totalCapitalReturn", "fcfCoverage", "payoutRatioOfFcf", "isForecast"]
        .every((field) => Object.prototype.hasOwnProperty.call(row, field)),
    );
    frontendFieldsPresent
      ? pass("MA capital-return frontend-required fields are present")
      : fail("MA capital-return frontend-required fields are present", JSON.stringify([...rows, forward].filter(Boolean)[0]));

    const notCollapsedRows = rows.filter((row) => (row.buybackAmount ?? 0) > 0 && (row.dividendCashCost ?? 0) > 0 && Math.abs((row.buybackAmount + row.dividendCashCost) - row.totalCapitalReturn) < 0.01);
    notCollapsedRows.length === rows.length && rows.some((row) => (row.buybackAmount ?? 0) > (row.dividendCashCost ?? 0) * 3)
      ? pass("MA buybacks and dividends are not collapsed together", `${notCollapsedRows.length}/8 rows retain separate dividend and buyback fields`)
      : fail("MA buybacks and dividends are not collapsed together", JSON.stringify(rows.map((row) => ({ fiscalYear: row.fiscalYear, dividends: row.dividendCashCost, buybacks: row.buybackAmount, total: row.totalCapitalReturn }))));

    const coverageRows = rows.filter((row) => (row.totalCapitalReturn ?? 0) > (row.equityFreeCashFlow ?? Infinity));
    coverageRows.every((row) => isFiniteNumber(row.fcfCoverage))
      ? pass("MA FCF coverage is finite when capital return exceeds FCF", coverageRows.length ? coverageRows.map((row) => `FY${row.fiscalYear}:${row.fcfCoverage}`).join(", ") : "No coverage-pressure years")
      : fail("MA FCF coverage is finite when capital return exceeds FCF", JSON.stringify(coverageRows));
  } catch (error) {
    fail("MA capital-return endpoint/service works", error instanceof Error ? error.message : String(error));
  }

  try {
    const legacyRoute = await routeStockBackend({ method: "GET" }, new URL("http://127.0.0.1:8787/api/ma/incentives-vs-net-revenue?quarters=40"), null);
    const unifiedRoute = await routeStockBackend({ method: "GET" }, new URL("http://127.0.0.1:8787/api/stocks/ma/incentives-vs-net-revenue?quarters=40"), null);
    const rows = legacyRoute?.body?.rows ?? [];
    const completeRows = rows.filter((row) =>
      isFiniteNumber(row.netRevenue) &&
      isFiniteNumber(row.rebatesIncentives) &&
      isFiniteNumber(row.incentivesToNetRevenue) &&
      row.netRevenue !== row.rebatesIncentives,
    );
    legacyRoute?.status === 200 && unifiedRoute?.status === 200 && rows.length >= 32 && completeRows.length === rows.length
      ? pass("MA incentives-vs-net-revenue endpoints work", `${rows.length} quarterly rows`)
      : fail("MA incentives-vs-net-revenue endpoints work", JSON.stringify({ legacy: legacyRoute?.status, unified: unifiedRoute?.status, rows: rows.length, completeRows: completeRows.length }));
  } catch (error) {
    fail("MA incentives-vs-net-revenue endpoints work", error instanceof Error ? error.message : String(error));
  }

  runNpmCheck("build", "Frontend build passes");
  printAndExit();
}

main().catch((error) => {
  fail("Validation crashed", error instanceof Error ? error.stack ?? error.message : String(error));
  printAndExit();
});
