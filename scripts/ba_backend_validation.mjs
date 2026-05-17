import { existsSync } from "node:fs";
import { execute, query } from "../apps/api/src/db/client.mjs";
import { BA_BACKEND_DB_PATH } from "../modules/ba/db/schema.mjs";
import { BA_BACKEND_MODEL_VERSION } from "../modules/ba/valuation/modelVersion.mjs";
import { createBaValuationRun, getBaHistoricalValuations } from "../apps/api/src/services/baValuationService.mjs";
import { getBaCapitalReturnHistory, getBaReportingEvents } from "../apps/api/src/services/baSnapshotService.mjs";
import { runBaBacktest } from "../apps/api/src/services/baBacktestService.mjs";

const TICKER = "BA.L";
const requiredTables = [
  "reporting_events",
  "source_documents",
  "financial_periods",
  "segment_financials",
  "market_snapshots",
  "daily_price_bars",
  "peer_snapshots",
  "guidance_items",
  "transcript_events",
  "transcript_extractions",
  "assumption_sets",
  "model_versions",
  "valuation_runs",
  "validation_warnings",
  "backtest_runs",
  "order_backlog_snapshots",
  "order_intake_snapshots",
  "program_exposures",
  "contract_awards",
  "defense_budget_indicators",
  "pension_snapshots",
  "capital_allocation_events",
];

const results = [];

function record(status, file, field, reason, suggestedFix = "") {
  results.push({ status, file, field, reason, suggestedFix });
}

function pass(file, field, reason) {
  record("PASS", file, field, reason);
}

function warn(file, field, reason, suggestedFix = "") {
  record("WARNING", file, field, reason, suggestedFix);
}

function fail(file, field, reason, suggestedFix = "") {
  record("FAIL", file, field, reason, suggestedFix);
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function count(table) {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ticker = ?`, [TICKER], BA_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function daysLater(left, right) {
  return String(left ?? "") > String(right ?? "");
}

async function runValidation() {
  if (!existsSync(BA_BACKEND_DB_PATH)) {
    fail(BA_BACKEND_DB_PATH, "db", "BA.L backend DB does not exist.", "Run npm run ba:backend:seed.");
    return;
  }
  pass(BA_BACKEND_DB_PATH, "db", "BA.L backend DB exists.");

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], BA_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of requiredTables) {
    if (tables.has(table)) pass("apps/api/src/db/migrations/001_ba_schema.sql", table, "Required table exists.");
    else fail("apps/api/src/db/migrations/001_ba_schema.sql", table, "Required table is missing.", "Apply BA schema migration through ba_backend_seed.");
  }

  const eventCount = count("reporting_events");
  if (eventCount >= 16) pass("reporting_events", "count", `${eventCount} reporting events exist.`);
  else fail("reporting_events", "count", `Only ${eventCount} reporting events exist.`, "Seed at least eight years of FY/interim/trading events.");

  const fiscalYears = query("SELECT COUNT(DISTINCT fiscalYear) AS count FROM financial_periods WHERE ticker = ? AND periodType = 'FY'", [TICKER], BA_BACKEND_DB_PATH)[0]?.count ?? 0;
  if (fiscalYears >= 8) pass("financial_periods", "fiscalYear", `${fiscalYears} official fiscal years are covered.`);
  else fail("financial_periods", "fiscalYear", `Only ${fiscalYears} fiscal years are covered.`, "Seed at least eight annual official periods.");

  const marketCount = count("market_snapshots");
  if (marketCount >= eventCount && eventCount > 0) pass("market_snapshots", "count", `${marketCount} event-visible market snapshots exist.`);
  else fail("market_snapshots", "count", "Missing market snapshots for reporting events.", "Seed one market snapshot per event.");

  const dailyCounts = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('BA.L', 'SPY') GROUP BY ticker",
    [],
    BA_BACKEND_DB_PATH,
  );
  const dailyByTicker = new Map(dailyCounts.map((row) => [row.ticker, row]));
  const baDaily = dailyByTicker.get("BA.L");
  const spyDaily = dailyByTicker.get("SPY");
  baDaily?.count >= 1500
    ? pass("daily_price_bars", "BA.L", `${baDaily.count} BA.L daily prices exist from ${baDaily.firstDate} to ${baDaily.lastDate}.`)
    : fail("daily_price_bars", "BA.L", `Only ${baDaily?.count ?? 0} BA.L daily prices exist.`, "Run npm run ba:backend:import-prices.");
  spyDaily?.count >= 1500
    ? pass("daily_price_bars", "SPY", `${spyDaily.count} SPY daily prices exist from ${spyDaily.firstDate} to ${spyDaily.lastDate}.`)
    : fail("daily_price_bars", "SPY", `Only ${spyDaily?.count ?? 0} SPY daily prices exist.`, "Run npm run ba:backend:import-prices.");
  const fallbackRows = query(
    "SELECT COUNT(*) AS count FROM daily_price_bars WHERE ticker IN ('BA.L', 'SPY') AND rawJson LIKE '%adjustedCloseFallback%true%'",
    [],
    BA_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  fallbackRows === 0
    ? pass("daily_price_bars", "adjustedClose", "BA.L and SPY daily returns use adjusted close where available.")
    : warn("daily_price_bars", "adjustedClose", `${fallbackRows} daily price rows use unadjusted close fallback.`, "Refresh Yahoo adjusted chart data where possible.");

  const modelVersion = query("SELECT * FROM model_versions WHERE ticker = ? AND version = ? LIMIT 1", [TICKER, BA_BACKEND_MODEL_VERSION.version], BA_BACKEND_DB_PATH)[0] ?? null;
  if (modelVersion) pass("model_versions", "version", `${BA_BACKEND_MODEL_VERSION.version} exists.`);
  else fail("model_versions", "version", "BA.L model version is missing.", "Seed BA_BACKEND_MODEL_VERSION.");

  const scenarios = query("SELECT DISTINCT scenario FROM assumption_sets WHERE ticker = ?", [TICKER], BA_BACKEND_DB_PATH).map((row) => row.scenario);
  for (const scenario of ["Bear", "Base", "Bull"]) {
    if (scenarios.includes(scenario)) pass("assumption_sets", scenario, `${scenario} assumption sets exist.`);
    else fail("assumption_sets", scenario, `${scenario} assumption sets are missing.`, "Seed Bear/Base/Bull assumption sets.");
  }

  const events = getBaReportingEvents();
  if (events[0]) {
    try {
      const result = await createBaValuationRun({ eventId: events[0].id, scenario: "Base" });
      const run = result.valuationRun;
      if (finite(run?.fairValue) && finite(run?.currentPrice)) pass("valuation_runs", "latest_create", "Latest-event valuation run can be created with finite fair value and current price.");
      else fail("valuation_runs", "latest_create", "Latest-event valuation run has non-finite fair value/current price.", "Inspect BA backend adapter and market snapshot.");
      if (result.id) execute("DELETE FROM valuation_runs WHERE id = ?", [result.id], BA_BACKEND_DB_PATH);
    } catch (error) {
      fail("valuation_runs", "latest_create", error instanceof Error ? error.message : String(error), "Fix BA adapter/service before validating historical runs.");
    }
  }

  const runs = query(
    `SELECT vr.*, re.eventDate, re.eventType, re.isInterim, re.isTradingUpdate
     FROM valuation_runs vr JOIN reporting_events re ON vr.reportingEventId = re.id
     WHERE vr.ticker = ?`,
    [TICKER],
    BA_BACKEND_DB_PATH,
  );

  const baseRuns = runs.filter((run) => run.scenario === "Base");
  const distinctBaseFairValues = new Set(baseRuns.map((run) => Number(run.fairValue).toFixed(2)));
  distinctBaseFairValues.size > 3
    ? pass("valuation_runs", "historical_fair_value_shape", `${distinctBaseFairValues.size} distinct rounded Base fair values exist.`)
    : fail("valuation_runs", "historical_fair_value_shape", "Historical fair values are a flat line or near-flat line.", "Verify event-visible assumptions and daily price anchoring are flowing into valuation runs.");

  const futureLeaks = [];
  for (const run of runs) {
    const snapshot = parseJson(run.dataSnapshotJson, {});
    for (const [table, rows] of Object.entries(snapshot.rowUsage ?? {})) {
      for (const row of rows ?? []) {
        const rowDate = row.asOfDate;
        if (rowDate && daysLater(rowDate, run.eventDate)) futureLeaks.push({ runId: run.id, table, rowId: row.id, rowDate, eventDate: run.eventDate });
      }
    }
  }
  if (futureLeaks.length === 0) pass("valuation_runs", "dataSnapshotJson.rowUsage", "No valuation run uses rows with asOfDate after the reporting event date.");
  else fail("valuation_runs", "dataSnapshotJson.rowUsage", `${futureLeaks.length} future-data leaks found.`, "Filter all snapshot rows by asOfDate <= reporting event date.");

  const interimBad = runs.filter((run) => (Number(run.isInterim) === 1 || Number(run.isTradingUpdate) === 1) && parseJson(run.dataSnapshotJson, {})?.interimRunRateSnapshot !== true);
  if (interimBad.length === 0) pass("valuation_runs", "interimRunRateSnapshot", "Q1/H1/Q3/trading-update valuations use event-visible run-rate snapshots.");
  else fail("valuation_runs", "interimRunRateSnapshot", `${interimBad.length} interim/trading runs lack run-rate markers.`, "Use event-visible interim/LTM/run-rate rows instead of stale annual anchors.");

  const staleAnchor = runs.filter((run) => parseJson(run.dataSnapshotJson, {})?.staleAnnualAnchor === true);
  if (staleAnchor.length === 0) pass("valuation_runs", "staleAnnualAnchor", "No interim/trading valuation is marked as using a stale annual anchor.");
  else fail("valuation_runs", "staleAnnualAnchor", `${staleAnchor.length} runs use stale annual anchors.`, "Create event-visible run-rate snapshots.");

  const shareMismatch = runs.filter((run) => {
    const snapshot = parseJson(run.dataSnapshotJson, {});
    return finite(snapshot.financialWeightedAverageShares) && finite(snapshot.assumptionDilutedShares) && Math.abs(snapshot.financialWeightedAverageShares - snapshot.assumptionDilutedShares) > 0.01;
  });
  if (shareMismatch.length === 0) pass("valuation_runs", "share_count", "Share count used in valuation reconciles to event-visible share base.");
  else fail("valuation_runs", "share_count", `${shareMismatch.length} runs mix share bases.`, "Use financial_periods.dilutedShares consistently.");

  const gbxBad = runs.filter((run) => {
    const snapshot = parseJson(run.dataSnapshotJson, {});
    return Math.abs(Number(snapshot.currentPriceGbp) - Number(snapshot.currentPriceGbx) / 100) > 0.0001 || Number(snapshot.gbxToGbpDivisor) !== 100;
  });
  if (gbxBad.length === 0) pass("market_snapshots", "GBX_GBP", "GBX to GBP conversion is explicit and correct.");
  else fail("market_snapshots", "GBX_GBP", `${gbxBad.length} valuation runs have incorrect GBX/GBP conversion.`, "Set currentPriceGbp = currentPriceGbx / 100.");

  const dailyPriceBad = baseRuns.filter((run) => {
    const snapshot = parseJson(run.dataSnapshotJson, {});
    return !snapshot.asOfPriceSource?.priceDate || snapshot.asOfPriceSource?.source == null;
  });
  if (dailyPriceBad.length === 0 && baseRuns.length > 0) pass("valuation_runs", "asOfPriceSource", "Historical as-of prices use daily market data where available.");
  else fail("valuation_runs", "asOfPriceSource", `${dailyPriceBad.length} Base runs lack daily as-of price sources.`, "Import daily prices and rerun npm run ba:backend:backfill-valuations.");

  const gbpUsdBad = runs.filter((run) => !finite(parseJson(run.dataSnapshotJson, {})?.gbpUsd));
  if (gbpUsdBad.length === 0) pass("market_snapshots", "gbpUsd", "GBP/USD conversion is explicit where USD peer/defense metadata is present.");
  else fail("market_snapshots", "gbpUsd", `${gbpUsdBad.length} runs lack GBP/USD metadata.`, "Persist gbpUsd in market_snapshots and dataSnapshotJson.");

  const segmentBreaks = query(
    `SELECT sf.eventId, fp.sales AS groupSales, SUM(sf.sales) AS segmentSales
     FROM segment_financials sf JOIN financial_periods fp ON sf.eventId = fp.eventId
     WHERE sf.ticker = ?
     GROUP BY sf.eventId`,
    [TICKER],
    BA_BACKEND_DB_PATH,
  ).filter((row) => Math.abs(Number(row.segmentSales) - Number(row.groupSales)) > 2);
  if (segmentBreaks.length === 0) pass("segment_financials", "sales", "Segment revenue reconciles to group sales where disclosed or modeled.");
  else fail("segment_financials", "sales", `${segmentBreaks.length} event segment snapshots do not reconcile.`, "Add HQ/elimination row or normalize segment mix.");

  const backlogRevenueBad = query(
    "SELECT id, rawJson FROM order_backlog_snapshots WHERE ticker = ?",
    [TICKER],
    BA_BACKEND_DB_PATH,
  ).filter((row) => parseJson(row.rawJson, {})?.orderBacklogIsRevenue === true);
  const intakeRevenueBad = query(
    "SELECT id, rawJson FROM order_intake_snapshots WHERE ticker = ?",
    [TICKER],
    BA_BACKEND_DB_PATH,
  ).filter((row) => parseJson(row.rawJson, {})?.orderIntakeIsRevenue === true);
  if (backlogRevenueBad.length === 0 && intakeRevenueBad.length === 0) pass("order_backlog_snapshots", "revenue_boundary", "Order backlog and order intake are not treated as revenue.");
  else fail("order_backlog_snapshots", "revenue_boundary", "Backlog/order intake crossed into revenue treatment.", "Keep backlog/intake as visibility metrics only.");

  const transcriptReady = query("SELECT COUNT(*) AS count FROM transcript_extractions WHERE ticker = ? AND modelReady = 1", [TICKER], BA_BACKEND_DB_PATH)[0]?.count ?? 0;
  if (transcriptReady === 0) pass("transcript_extractions", "modelReady", "Transcript rows are modelReady=false by default.");
  else fail("transcript_extractions", "modelReady", "Transcript rows are model-ready by default.", "Keep transcript commentary display-only until promoted.");

  const guidancePromoted = query("SELECT COUNT(*) AS count FROM guidance_items WHERE ticker = ? AND valuationImpactAllowed = 1", [TICKER], BA_BACKEND_DB_PATH)[0]?.count ?? 0;
  if (guidancePromoted === 0) pass("guidance_items", "valuationImpactAllowed", "Guidance candidates are valuationImpactAllowed=false unless explicitly promoted.");
  else warn("guidance_items", "valuationImpactAllowed", `${guidancePromoted} guidance rows are promoted.`, "Confirm source review before allowing guidance into valuation.");

  const peerBad = query(
    "SELECT COUNT(*) AS count FROM peer_snapshots WHERE ticker = ? AND currency <> 'GBP' AND absoluteValueUse <> 'metadata_only'",
    [TICKER],
    BA_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  if (peerBad === 0) pass("peer_snapshots", "mixed_currency", "Research-only peer absolute market values are metadata-only if currencies are mixed.");
  else fail("peer_snapshots", "mixed_currency", "Mixed-currency peer values are not metadata-only.", "Set absoluteValueUse='metadata_only'.");

  const assumptionRows = query("SELECT id, assumptionsJson FROM assumption_sets WHERE ticker = ?", [TICKER], BA_BACKEND_DB_PATH);
  const badWeights = assumptionRows.filter((row) => {
    const weights = parseJson(row.assumptionsJson, {})?.backendMethodWeights;
    const sum = weights ? Object.values(weights).reduce((acc, value) => acc + Number(value), 0) : NaN;
    return !Number.isFinite(sum) || Math.abs(sum - 1) > 0.0001;
  });
  const modelWeightSum = BA_BACKEND_MODEL_VERSION.valuationMethods.reduce((sum, method) => sum + method.weight, 0);
  if (badWeights.length === 0 && Math.abs(modelWeightSum - 1) < 0.0001) pass("assumption_sets", "backendMethodWeights", "Valuation weights sum to 100%.");
  else fail("assumption_sets", "backendMethodWeights", "Valuation weights do not sum to 100%.", "Normalize backendMethodWeights and modelVersion valuationMethods.");

  if (BA_BACKEND_MODEL_VERSION.terminalValueWarningThreshold <= 0.75) pass("model_versions", "terminalValueWarningThreshold", "Terminal value warning threshold exists.");
  else warn("model_versions", "terminalValueWarningThreshold", "Terminal value warning threshold is loose.", "Keep threshold at or below 75% of EV.");

  const backlogDominant = runs.filter((run) => {
    const snapshot = parseJson(run.dataSnapshotJson, {});
    const bridge = snapshot.methodBridge ?? [];
    const backlog = bridge.find((method) => method.key === "backlogOverlay");
    return Number(backlog?.weight ?? 0) > BA_BACKEND_MODEL_VERSION.backlogOverlayWarningThreshold;
  });
  if (backlogDominant.length === 0) pass("valuation_runs", "backlog_overlay", "Backlog value overlay does not dominate fair value without warning.");
  else warn("valuation_runs", "backlog_overlay", `${backlogDominant.length} runs have high backlog overlay weight.`, "Add warning or reduce backlog overlay weight.");

  const frontendBad = runs.filter((run) => {
    const snapshot = parseJson(run.dataSnapshotJson, {});
    return !finite(run.fairValue) || !finite(run.currentPrice) || !run.reportingEventId || !run.marketSnapshotId || !run.valuationPeriodId || !(snapshot.methodBridge ?? []).length;
  });
  if (frontendBad.length === 0) pass("valuation_runs", "frontend_fields", "Frontend-required fields exist.");
  else fail("valuation_runs", "frontend_fields", `${frontendBad.length} valuation runs lack frontend fields.`, "Persist event id, market id, period id, fair value, current price, and method bridge.");

  const historical = getBaHistoricalValuations({ scenario: "Base" });
  const missingHistorical = historical.filter((row) => !row.valuationRun);
  if (missingHistorical.length === 0 && historical.length > 0) pass("valuation_runs", "historical_coverage", "Every reporting event has a persisted Base valuation run.");
  else fail("valuation_runs", "historical_coverage", `${missingHistorical.length} reporting events lack a Base valuation run.`, "Run npm run ba:backend:backfill-valuations.");

  try {
    const backtest = runBaBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const stockMetrics = backtest.metrics?.baBuyHold ?? backtest.metrics?.stock ?? {};
    const spyMetrics = backtest.metrics?.spy ?? {};
    const metricValues = [
      stockMetrics.cagr,
      spyMetrics.cagr,
      stockMetrics.maxDrawdown,
      spyMetrics.maxDrawdown,
      stockMetrics.sharpe,
      spyMetrics.sharpe,
      stockMetrics.volatility,
      spyMetrics.volatility,
    ];
    backtest.status === "completed" && backtest.curve?.length >= 1500 && metricValues.every(finite)
      ? pass("backtest_runs", "ba_vs_spy", `Backtest returns finite BA.L and SPY metrics; curve=${backtest.curve.length}.`)
      : fail("backtest_runs", "ba_vs_spy", JSON.stringify(backtest).slice(0, 1000), "Import daily prices and rerun validation.");
  } catch (error) {
    fail("backtest_runs", "ba_vs_spy", error instanceof Error ? error.message : String(error), "Fix BA backtest service or price import.");
  }

  try {
    const capitalReturns = getBaCapitalReturnHistory({ years: 8 });
    const annualRows = capitalReturns.rows ?? [];
    const forward = capitalReturns.forwardExpectation ?? null;
    const finiteAnnualRows = annualRows.filter((row) => [
      row.dividendPerSharePence,
      row.dividendCashCost,
      row.buybackAmount,
      row.equityFreeCashFlow,
      row.totalCapitalReturn,
    ].every(finite));
    annualRows.length === 8
      ? pass("capital_returns", "annual_rows", "Capital-return service returns 8 annual rows.")
      : fail("capital_returns", "annual_rows", `Expected 8 annual rows; got ${annualRows.length}.`, "Backfill financial_periods FY rows.");
    finiteAnnualRows.length === annualRows.length && annualRows.length === 8
      ? pass("capital_returns", "finite_annual_fields", "Every annual row has finite DPS, dividend cash, buyback, FCF, and total capital return.")
      : fail("capital_returns", "finite_annual_fields", `${annualRows.length - finiteAnnualRows.length} annual rows have missing fields.`, "Populate DPS, diluted shares, FCF, and buyback defaults.");
    (capitalReturns.chartSeries ?? []).some((row) => row.dividendCashCost != null && row.buybackAmount != null)
      ? pass("capital_returns", "stacked_capital_return_series", "Stacked dividend + buyback capital-return series exists.")
      : fail("capital_returns", "stacked_capital_return_series", "Missing stacked dividend/buyback chart series.", "Build chartSeries with dividendCashCost and buybackAmount.");
    (capitalReturns.chartSeries ?? []).some((row) => row.equityFreeCashFlow != null)
      ? pass("capital_returns", "fcf_comparison_series", "FCF comparison series exists.")
      : fail("capital_returns", "fcf_comparison_series", "Missing FCF comparison chart series.", "Build chartSeries with equityFreeCashFlow.");
    forward && forward.isForecast === true && forward.sourceType === "forecast_assumption"
      ? pass("capital_returns", "forward_forecast_row", "Forward forecast row exists and is marked forecast_assumption.")
      : fail("capital_returns", "forward_forecast_row", "Forward forecast row missing or not marked forecast_assumption.", "Create one forwardExpectation row.");
    forward && [forward.dividendCashCost, forward.buybackAmount, forward.equityFreeCashFlow, forward.totalCapitalReturn].every(finite)
      ? pass("capital_returns", "forward_forecast_fields", "Forward forecast has dividend cash, buyback, FCF, and total capital return.")
      : fail("capital_returns", "forward_forecast_fields", "Forward forecast has missing numeric fields.", "Populate forward capital-return assumptions.");
    capitalReturns.warnings?.some((warning) => String(warning.id).includes("proxy") || String(warning.detail).includes("official_seed"))
      ? pass("capital_returns", "proxy_warning", "Proxy/seeded buyback years generate warnings.")
      : fail("capital_returns", "proxy_warning", "Proxy/seeded years did not generate warnings.", "Warn when sourceQuality is not official_actual.");
    const summary = capitalReturns.summary ?? {};
    [
      summary.latestFiscalYear,
      summary.latestDividendPerSharePence,
      summary.latestEquityFreeCashFlow,
      summary.cumulativeCapitalReturn,
      summary.forwardFiscalYear,
      summary.forwardTotalCapitalReturn,
    ].every((value) => value != null) && summary.excludesForwardFromCumulativeTotals === true
      ? pass("capital_returns", "frontend_required_fields", "Capital-return frontend-required fields exist.")
      : fail("capital_returns", "frontend_required_fields", "Capital-return payload lacks frontend fields.", "Populate rows, chartSeries, summary, and forwardExpectation.");
  } catch (error) {
    fail("capital_returns", "service", error instanceof Error ? error.message : String(error), "Fix getBaCapitalReturnHistory.");
  }
}

await runValidation();

const passCount = results.filter((row) => row.status === "PASS").length;
const warningCount = results.filter((row) => row.status === "WARNING").length;
const failCount = results.filter((row) => row.status === "FAIL").length;

console.log("BA.L Backend Validation");
console.log(`PASS: ${passCount}`);
console.log(`WARNING: ${warningCount}`);
console.log(`FAIL: ${failCount}`);

for (const row of results.filter((item) => item.status !== "PASS")) {
  console.log(`${row.status}: ${row.file} | ${row.field} | ${row.reason}${row.suggestedFix ? ` | Suggested fix: ${row.suggestedFix}` : ""}`);
}

if (failCount > 0) {
  process.exitCode = 1;
}
