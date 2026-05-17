#!/usr/bin/env node
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { stockBackendRegistry } from "../apps/api/src/stockBackend/registry.mjs";
import { getDgeHistoricalValuations } from "../apps/api/src/services/dgeValuationService.mjs";
import { runDgeBacktest } from "../apps/api/src/services/dgeBacktestService.mjs";
import { DGE_BACKEND_DB_PATH } from "../modules/dge/db/schema.mjs";
import { DGE_BACKEND_MODEL_VERSION } from "../modules/dge/valuation/modelVersion.mjs";

const REQUIRED_TABLES = [
  "reporting_events",
  "source_documents",
  "financial_periods",
  "segment_financials",
  "market_snapshots",
  "peer_snapshots",
  "guidance_items",
  "transcript_events",
  "transcript_extractions",
  "assumption_sets",
  "model_versions",
  "valuation_runs",
  "validation_warnings",
  "backtest_runs",
  "daily_price_bars",
];

const rows = [];

function record(status, area, item, detail, remediation = "") {
  rows.push({ status, area, item, detail, remediation });
}

function pass(area, item, detail) {
  record("PASS", area, item, detail);
}

function warn(area, item, detail, remediation = "") {
  record("WARN", area, item, detail, remediation);
}

function fail(area, item, detail, remediation = "") {
  record("FAIL", area, item, detail, remediation);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function scalar(sql, params = []) {
  return query(sql, params, DGE_BACKEND_DB_PATH)[0] ?? {};
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

console.log("DGE.L backend validation report");
console.log(`DB: ${DGE_BACKEND_DB_PATH}`);

if (!existsSync(DGE_BACKEND_DB_PATH)) {
  fail("db", "sqlite_file", "DGE.L backend SQLite file does not exist.", "Run npm run dge:backend:seed.");
} else {
  pass("db", "sqlite_file", "DGE.L backend SQLite file exists.");
}

const tables = new Set(query("SELECT name FROM sqlite_master WHERE type='table'", [], DGE_BACKEND_DB_PATH).map((row) => row.name));
for (const table of REQUIRED_TABLES) {
  tables.has(table) ? pass("schema", table, "Required table exists.") : fail("schema", table, "Required table is missing.", "Apply apps/api/src/db/migrations/001_dge_schema.sql.");
}

const eventStats = scalar(
  "SELECT COUNT(*) AS count, MIN(eventDate) AS firstDate, MAX(eventDate) AS lastDate FROM reporting_events WHERE ticker = 'DGE.L'",
);
if (eventStats.count >= 18 && eventStats.firstDate <= "2018-07-26" && eventStats.lastDate >= "2026-05-06") {
  pass("reporting_events", "coverage", `${eventStats.count} events from ${eventStats.firstDate} to ${eventStats.lastDate}.`);
} else {
  fail("reporting_events", "coverage", `Only ${eventStats.count ?? 0} events from ${eventStats.firstDate ?? "n/a"} to ${eventStats.lastDate ?? "n/a"}.`, "Seed the previous-eight-year DGE event set.");
}

const eventSources = query(
  "SELECT sourceType, COUNT(*) AS count FROM reporting_events WHERE ticker = 'DGE.L' GROUP BY sourceType ORDER BY sourceType",
  [],
  DGE_BACKEND_DB_PATH,
);
const officialEvents = eventSources.find((row) => row.sourceType === "official_actual")?.count ?? 0;
const proxyEvents = eventSources.find((row) => row.sourceType === "forecast_assumption")?.count ?? 0;
officialEvents >= 4
  ? pass("reporting_events", "official_actual", `${officialEvents} official actual / trading-update events.`)
  : fail("reporting_events", "official_actual", `Only ${officialEvents} official event rows.`, "Include FY2025, FY2026 Q1, H1 and Q3 official events.");
proxyEvents >= 10
  ? pass("reporting_events", "proxy_rows_marked", `${proxyEvents} historical proxy slots are explicitly forecast_assumption.`)
  : warn("reporting_events", "proxy_rows_marked", `${proxyEvents} proxy rows found.`, "Historical non-official rows should remain forecast_assumption.");

const preFy2025Official = scalar(
  "SELECT COUNT(*) AS count FROM financial_periods WHERE ticker = 'DGE.L' AND asOfDate < '2025-08-05' AND sourceType = 'official_actual'",
);
preFy2025Official.count === 0
  ? pass("source_layer", "no_fake_quarterly_actuals", "Pre-FY2025 historical pilot rows are not marked official_actual.")
  : fail("source_layer", "no_fake_quarterly_actuals", `${preFy2025Official.count} pre-FY2025 rows are incorrectly official_actual.`, "Mark unsupported quarterly/proxy rows as forecast_assumption or research_only.");

const tradingPnl = scalar(
  "SELECT COUNT(*) AS count FROM financial_periods WHERE ticker = 'DGE.L' AND periodType = 'trading-update' AND sourceType = 'official_actual' AND operatingIncome IS NOT NULL",
);
tradingPnl.count === 0
  ? pass("financial_periods", "trading_update_partial", "Q1/Q3 trading updates do not pretend to include full operating profit.")
  : fail("financial_periods", "trading_update_partial", `${tradingPnl.count} trading-update rows contain operatingIncome.`, "Keep unavailable quarterly P&L fields null unless official.");

const mixedMetricRows = scalar(
  "SELECT COUNT(*) AS count FROM financial_periods WHERE ticker = 'DGE.L' AND reportedNetSales IS NOT NULL AND organicNetSalesGrowth IS NOT NULL AND reportedNetSales = organicNetSalesGrowth",
);
mixedMetricRows.count === 0
  ? pass("financial_periods", "reported_vs_organic_separate", "Reported net sales and organic growth fields are separate.")
  : fail("financial_periods", "reported_vs_organic_separate", `${mixedMetricRows.count} rows appear to mix reported sales and organic growth.`, "Do not store organic growth in reported sales fields.");

const regionCount = scalar(
  "SELECT COUNT(DISTINCT segment) AS count FROM segment_financials WHERE ticker = 'DGE.L' AND taxonomy = 'regional_segment'",
);
regionCount.count >= 5
  ? pass("segment_financials", "regional_segments", `${regionCount.count} regional segments are present.`)
  : fail("segment_financials", "regional_segments", `Only ${regionCount.count ?? 0} regional segments found.`, "Seed North America, Europe, APAC, LAC and Africa.");

const categoryCount = scalar(
  "SELECT COUNT(*) AS count FROM segment_financials WHERE ticker = 'DGE.L' AND taxonomy = 'category_mix'",
);
categoryCount.count >= 8
  ? pass("segment_financials", "category_mix", `${categoryCount.count} category mix rows are present as research_only.`)
  : warn("segment_financials", "category_mix", `Only ${categoryCount.count ?? 0} category mix rows found.`, "Add Scotch, Tequila, Guinness/Beer, Vodka, Rum, Gin, RTD and Liqueurs where available.");

const sourceDocCount = scalar("SELECT COUNT(*) AS count FROM source_documents WHERE ticker = 'DGE.L'");
sourceDocCount.count >= 30
  ? pass("source_documents", "coverage", `${sourceDocCount.count} source document/evidence records imported.`)
  : fail("source_documents", "coverage", `Only ${sourceDocCount.count ?? 0} source records imported.`, "Load src/stocks/dge/data/evidence.ts into source_documents.");

const assumptionCount = scalar(
  "SELECT COUNT(*) AS count FROM assumption_sets WHERE ticker = 'DGE.L' AND modelVersion = ?",
  [DGE_BACKEND_MODEL_VERSION.version],
);
assumptionCount.count === 3
  ? pass("assumption_sets", "scenario_sets", "Bear/Base/Bull assumption sets are present.")
  : fail("assumption_sets", "scenario_sets", `${assumptionCount.count ?? 0} assumption sets found.`, "Seed all three DGE scenario presets.");

const priceRows = query(
  "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('DGE.L', 'SPY') GROUP BY ticker ORDER BY ticker",
  [],
  DGE_BACKEND_DB_PATH,
);
const priceMap = new Map(priceRows.map((row) => [row.ticker, row]));
const dgeBars = priceMap.get("DGE.L");
const spyBars = priceMap.get("SPY");
dgeBars?.count >= 2000
  ? pass("daily_price_bars", "DGE.L", `${dgeBars.count} DGE.L bars, ${dgeBars.firstDate} to ${dgeBars.lastDate}, ${dgeBars.sourceType}.`)
  : fail("daily_price_bars", "DGE.L", `Only ${dgeBars?.count ?? 0} DGE.L bars found.`, "Run npm run dge:backend:import-prices.");
spyBars?.count >= 2000
  ? pass("daily_price_bars", "SPY", `${spyBars.count} SPY bars, ${spyBars.firstDate} to ${spyBars.lastDate}, ${spyBars.sourceType}.`)
  : fail("daily_price_bars", "SPY", `Only ${spyBars?.count ?? 0} SPY bars found.`, "Run npm run dge:backend:import-prices.");

const dgeUnitRows = scalar(
  "SELECT COUNT(*) AS count FROM daily_price_bars WHERE ticker = 'DGE.L' AND rawJson LIKE '%GBp%'",
);
dgeUnitRows.count >= 2000
  ? pass("currency", "dge_gbp_bar_unit", "DGE.L daily bars carry GBp unit metadata.")
  : fail("currency", "dge_gbp_bar_unit", "DGE.L daily bars lack GBp metadata.", "Preserve DGE.L London quote unit metadata in rawJson.");

const valuationStats = scalar(
  "SELECT COUNT(*) AS count, COUNT(DISTINCT ROUND(fairValue, 2)) AS distinctFairValues, MIN(currentPrice) AS minPrice, MAX(currentPrice) AS maxPrice, MIN(fairValue) AS minFairValue, MAX(fairValue) AS maxFairValue FROM valuation_runs WHERE ticker = 'DGE.L' AND scenario = 'Base' AND modelVersion = ?",
  [DGE_BACKEND_MODEL_VERSION.version],
);
if (valuationStats.count >= eventStats.count && valuationStats.distinctFairValues >= 5 && valuationStats.maxPrice < 100) {
  pass("valuation_runs", "base_backfill", `${valuationStats.count} Base runs with ${valuationStats.distinctFairValues} distinct fair values; prices stored in GBP.`);
} else {
  fail("valuation_runs", "base_backfill", `Runs=${valuationStats.count ?? 0}, distinct fair values=${valuationStats.distinctFairValues ?? 0}, max price=${valuationStats.maxPrice ?? "n/a"}.`, "Run npm run dge:backend:backfill-valuations and verify GBp-to-GBP conversion.");
}

const fairValueRange = Number(valuationStats.maxFairValue ?? 0) - Number(valuationStats.minFairValue ?? 0);
if (fairValueRange >= 6 && valuationStats.distinctFairValues >= 8) {
  pass("valuation_runs", "historical_fair_value_dispersion", `Fair values vary from £${Number(valuationStats.minFairValue).toFixed(2)} to £${Number(valuationStats.maxFairValue).toFixed(2)}.`);
} else {
  fail("valuation_runs", "historical_fair_value_dispersion", `Fair value range is only £${fairValueRange.toFixed(2)} with ${valuationStats.distinctFairValues ?? 0} rounded values.`, "Audit for current-period assumptions leaking into historical runs or null financial fields being treated as zero.");
}

const valuationRunRows = query(
  "SELECT reportingEventId, asOfDate, dataSnapshotJson FROM valuation_runs WHERE ticker = 'DGE.L' AND scenario = 'Base' AND modelVersion = ? ORDER BY asOfDate",
  [DGE_BACKEND_MODEL_VERSION.version],
  DGE_BACKEND_DB_PATH,
);
const lookaheadBreaches = [];
const missingBoundaries = [];
const nullAsZeroBreaches = [];
for (const row of valuationRunRows) {
  const snapshot = parseJson(row.dataSnapshotJson, {});
  const boundary = snapshot.backendNoLookahead ?? {};
  if (boundary.noFutureData !== true || !boundary.asOfDataCutoff || !boundary.sourceMaxDate) {
    missingBoundaries.push(row.reportingEventId);
  } else if (boundary.asOfDataCutoff > row.asOfDate || boundary.sourceMaxDate > row.asOfDate) {
    lookaheadBreaches.push(`${row.reportingEventId}:${boundary.sourceMaxDate}>${row.asOfDate}`);
  }
  const inputs = boundary.methodInputs ?? {};
  if (/q[13]-fy2026/.test(row.reportingEventId) && (Number(inputs.normalizedFcfUsdM ?? 0) <= 1_000 || Number(inputs.netDebtUsdM ?? 0) <= 10_000)) {
    nullAsZeroBreaches.push(row.reportingEventId);
  }
}
if (!missingBoundaries.length && !lookaheadBreaches.length) {
  pass("valuation_runs", "no_future_data_boundary", "Every Base run stores an as-of data cutoff and latest source date at or before the event date.");
} else {
  fail("valuation_runs", "no_future_data_boundary", `Missing boundaries: ${missingBoundaries.join(", ") || "none"}; lookahead breaches: ${lookaheadBreaches.join(", ") || "none"}.`, "Rebuild valuation runs with the backend no-lookahead adapter.");
}
if (!nullAsZeroBreaches.length) {
  pass("valuation_runs", "trading_update_not_null_as_zero", "Q1/Q3 trading-update valuations fall back to latest available FY/H1 actuals instead of treating missing P&L/FCF fields as zero.");
} else {
  fail("valuation_runs", "trading_update_not_null_as_zero", `Trading update runs with zero-like fallback inputs: ${nullAsZeroBreaches.join(", ")}.`, "Fix numeric parsing so null does not become zero and rerun valuation backfill.");
}

const valuationNulls = scalar(
  "SELECT COUNT(*) AS count FROM valuation_runs WHERE ticker = 'DGE.L' AND (currentPrice IS NULL OR fairValue IS NULL OR targetPrice3Y IS NULL OR expectedShareholderCagr IS NULL OR upsideDownside IS NULL)",
);
valuationNulls.count === 0
  ? pass("valuation_runs", "persisted_fields", "Required valuation fields are populated.")
  : fail("valuation_runs", "persisted_fields", `${valuationNulls.count} valuation runs have null required fields.`, "Persist currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr and upsideDownside.");

const historical = getDgeHistoricalValuations({ scenario: "Base", modelVersion: DGE_BACKEND_MODEL_VERSION.version });
historical.length >= eventStats.count && historical.every((row) => row.valuationRun)
  ? pass("api_services", "historical_valuations", `${historical.length} historical valuation rows resolve through the service.`)
  : fail("api_services", "historical_valuations", `${historical.length} historical rows; missing run count ${historical.filter((row) => !row.valuationRun).length}.`, "Backfill Base valuation runs for every reporting event.");

const registryEntry = stockBackendRegistry.dge;
registryEntry?.ticker === "DGE.L" && registryEntry?.getBacktests && registryEntry?.runBacktest
  ? pass("registry", "unified_backend", "DGE.L is registered in the unified stock backend with backtest handlers.")
  : fail("registry", "unified_backend", "DGE.L registry entry is missing or incomplete.", "Wire DGE services into apps/api/src/stockBackend/registry.mjs.");

const guidanceFcf = scalar(
  "SELECT COUNT(*) AS count FROM guidance_items WHERE ticker = 'DGE.L' AND metric = 'free_cash_flow' AND midpointValue = 3000",
);
guidanceFcf.count === 1
  ? pass("guidance_items", "fcf_3bn", "FY2026 $3bn FCF guidance is present as management guidance.")
  : fail("guidance_items", "fcf_3bn", "FY2026 $3bn FCF guidance row is missing.", "Seed the FCF guidance item from guidanceData.ts.");

const transcriptBlocked = scalar(
  "SELECT COUNT(*) AS count FROM transcript_extractions WHERE ticker = 'DGE.L' AND valuationImpactAllowed = 0",
);
transcriptBlocked.count >= 6
  ? pass("transcripts", "commentary_not_direct_valuation", `${transcriptBlocked.count} transcript extraction rows are commentary-only until reviewed.`)
  : warn("transcripts", "commentary_not_direct_valuation", `${transcriptBlocked.count} commentary-only extraction rows found.`, "Keep transcript commentary modelReady/valuationImpactAllowed flags explicit.");

try {
  const backtest = runDgeBacktest({ startDate: "2018-01-02", endDate: "2026-05-13", benchmarkTicker: "SPY" });
  const fields = [
    backtest.metrics?.dgeBuyHold?.cagr,
    backtest.metrics?.dgeBuyHold?.maxDrawdown,
    backtest.metrics?.dgeBuyHold?.sharpe,
    backtest.metrics?.dgeBuyHold?.volatility,
    backtest.metrics?.spy?.cagr,
    backtest.metrics?.spy?.maxDrawdown,
    backtest.metrics?.spy?.sharpe,
    backtest.metrics?.spy?.volatility,
  ];
  if (backtest.status === "completed" && backtest.curve?.length > 1000 && fields.every(finite)) {
    pass("backtest_runs", "dge_vs_spy", `Backtest returns finite DGE.L and SPY metrics; curve=${backtest.curve.length}.`);
  } else {
    fail("backtest_runs", "dge_vs_spy", "Backtest did not return finite metrics.", "Check overlapping DGE.L/SPY daily_price_bars.");
  }
  if ((backtest.warnings ?? []).some((warning) => /GBp.*SPY.*USD|not FX-hedged/i.test(warning))) {
    pass("backtest_runs", "currency_warning", "Backtest response warns that DGE.L GBp and SPY USD are local-price indexed, not FX-hedged.");
  } else {
    fail("backtest_runs", "currency_warning", "Backtest response lacks the required FX/currency warning.", "Return a currency warning from dgeBacktestService.");
  }
} catch (error) {
  fail("backtest_runs", "dge_vs_spy", error instanceof Error ? error.message : String(error), "Run npm run dge:backend:import-prices first.");
}

const failures = rows.filter((row) => row.status === "FAIL").length;
const warnings = rows.filter((row) => row.status === "WARN").length;
const passes = rows.filter((row) => row.status === "PASS").length;

for (const row of rows) {
  const tail = row.remediation ? ` | ${row.remediation}` : "";
  console.log(`${row.status} ${row.area}:${row.item} - ${row.detail}${tail}`);
}

console.log(JSON.stringify({ summary: { PASS: passes, WARN: warnings, FAIL: failures }, dbPath: DGE_BACKEND_DB_PATH }, null, 2));

if (failures > 0) process.exitCode = 1;
