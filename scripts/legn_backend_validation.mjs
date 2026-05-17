import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { LEGN_BACKEND_DB_PATH } from "../modules/legn/db/schema.mjs";
import { LEGN_BACKEND_MODEL_VERSION } from "../modules/legn/valuation/modelVersion.mjs";
import { createLegnValuationRun, getLegnValuationRuns } from "../apps/api/src/services/legnValuationService.mjs";
import { getLegnSnapshot } from "../apps/api/src/services/legnSnapshotService.mjs";
import { runLegnBacktest } from "../apps/api/src/services/legnBacktestService.mjs";

const report = [];
function add(status, table, field, reason, suggestedFix = "") {
  report.push({ status, table, field, reason, suggestedFix });
}
function pass(table, field, reason) {
  add("PASS", table, field, reason);
}
function warn(table, field, reason, suggestedFix = "") {
  add("WARNING", table, field, reason, suggestedFix);
}
function fail(table, field, reason, suggestedFix = "") {
  add("FAIL", table, field, reason, suggestedFix);
}
function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function rows(sql, params = []) {
  return query(sql, params, LEGN_BACKEND_DB_PATH);
}
function tableExists(table) {
  return rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]).length === 1;
}
function finite(value) {
  return Number.isFinite(Number(value));
}

const requiredTables = [
  "reporting_events", "source_documents", "financial_periods", "market_snapshots", "peer_snapshots",
  "guidance_items", "transcript_events", "transcript_extractions", "assumption_sets", "model_versions",
  "valuation_runs", "validation_warnings", "backtest_runs", "daily_price_bars", "product_revenue_snapshots",
  "carvykti_commercial_snapshots", "collaboration_economics_snapshots", "cash_runway_snapshots",
  "operating_expense_snapshots", "dilution_snapshots", "pipeline_assets", "pipeline_milestones",
  "regulatory_events", "clinical_trial_events", "manufacturing_capacity_events", "competitive_landscape_snapshots",
];

if (!existsSync(LEGN_BACKEND_DB_PATH)) {
  fail("database", "path", `DB does not exist at ${LEGN_BACKEND_DB_PATH}.`, "Run npm run legn:backend:seed.");
} else {
  pass("database", "path", `DB exists at ${LEGN_BACKEND_DB_PATH}.`);
}

if (existsSync(LEGN_BACKEND_DB_PATH)) {
  for (const table of requiredTables) {
    if (tableExists(table)) pass(table, "exists", "Required table exists.");
    else fail(table, "exists", "Required table is missing.", "Re-run schema migration through npm run legn:backend:seed.");
  }

  const events = rows("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate ASC", ["LEGN"]);
  const quarterEvents = events.filter((event) => ["quarterly_results", "commercial_update"].includes(event.eventType));
  const annualEvents = events.filter((event) => event.eventType === "annual_report_20f");
  const expectedQuarterIds = [
    "q2-2021", "q3-2021", "q4-2021", "q1-2022", "q2-2022", "q3-2022", "q4-2022",
    "q1-2023", "q2-2023", "q3-2023", "q4-2023", "q1-2024", "q2-2024", "q3-2024",
    "q4-2024", "q1-2025", "q2-2025", "q3-2025", "q4-2025", "q1-2026-prelim",
  ];
  const missingQuarterIds = expectedQuarterIds.filter((id) => !quarterEvents.some((event) => event.id === id));
  if (events.length >= 25 && events.every((event) => event.eventDate >= "2021-06-01")) pass("reporting_events", "listing_onward", `${events.length} reporting events exist from listing onward.`);
  else fail("reporting_events", "listing_onward", `${events.length} events found or pre-listing dates present.`, "Seed all events from listing onward only.");
  if (missingQuarterIds.length === 0) pass("reporting_events", "quarterly_coverage", "Quarterly/commercial coverage exists from Q2 2021 through Q1 2026 preliminary.");
  else fail("reporting_events", "quarterly_coverage", `Missing quarters: ${missingQuarterIds.join(", ")}.`, "Add missing quarterly reporting events.");
  if (annualEvents.length >= 5) pass("reporting_events", "20f_coverage", `${annualEvents.length} annual/20-F events exist.`);
  else fail("reporting_events", "20f_coverage", `${annualEvents.length} annual/20-F events found.`, "Add FY 2021-FY 2025 20-F events.");

  const marketCount = rows("SELECT COUNT(*) AS count FROM market_snapshots WHERE ticker = ?", ["LEGN"])[0]?.count ?? 0;
  if (marketCount >= events.length) pass("market_snapshots", "coverage", `${marketCount} market snapshots exist for ${events.length} events.`);
  else fail("market_snapshots", "coverage", `${marketCount} market snapshots for ${events.length} events.`, "Add event-date market snapshots.");

  const legnDailyCount = tableExists("daily_price_bars")
    ? rows("SELECT COUNT(*) AS count FROM daily_price_bars WHERE ticker = ?", ["LEGN"])[0]?.count ?? 0
    : 0;
  const spyDailyCount = tableExists("daily_price_bars")
    ? rows("SELECT COUNT(*) AS count FROM daily_price_bars WHERE ticker = ?", ["SPY"])[0]?.count ?? 0
    : 0;
  if (legnDailyCount > 250) pass("daily_price_bars", "legn_prices", `${legnDailyCount} LEGN daily bars exist.`);
  else fail("daily_price_bars", "legn_prices", `${legnDailyCount} LEGN daily bars found.`, "Run npm run legn:backend:import-prices.");
  if (spyDailyCount > 250) pass("daily_price_bars", "spy_prices", `${spyDailyCount} SPY daily bars exist.`);
  else fail("daily_price_bars", "spy_prices", `${spyDailyCount} SPY daily bars found.`, "Run npm run legn:backend:import-prices.");

  const modelVersion = rows("SELECT * FROM model_versions WHERE ticker = ? AND version = ?", ["LEGN", LEGN_BACKEND_MODEL_VERSION.version])[0];
  if (modelVersion) pass("model_versions", "version", LEGN_BACKEND_MODEL_VERSION.version);
  else fail("model_versions", "version", "LEGN model version is missing.", "Seed model_versions.");

  const assumptionRows = rows("SELECT * FROM assumption_sets WHERE ticker = ?", ["LEGN"]);
  const scenarioSet = new Set(assumptionRows.map((row) => row.scenario));
  if (["Bear", "Base", "Bull"].every((scenario) => scenarioSet.has(scenario)) && assumptionRows.length >= events.length * 3) {
    pass("assumption_sets", "scenarios", `${assumptionRows.length} Bear/Base/Bull event-visible assumption sets exist.`);
  } else {
    fail("assumption_sets", "scenarios", "Bear/Base/Bull assumption sets are incomplete.", "Seed one assumption set per event and scenario.");
  }
  for (const row of assumptionRows) {
    const assumptions = parseJson(row.assumptionsJson, {});
    const weights = assumptions.weights ?? {};
    const weightSum = Object.values(weights).reduce((sum, value) => sum + Number(value), 0);
    if (Math.abs(weightSum - 1) <= 0.0001) pass("assumption_sets", row.id, "Valuation weights sum to 100%.");
    else fail("assumption_sets", row.id, `Weights sum to ${weightSum}.`, "Normalize valuation weights to 1.0.");
  }

  const latestQuarterEvent = quarterEvents.at(-1);
  if (latestQuarterEvent) {
    const created = await createLegnValuationRun({ eventId: latestQuarterEvent.id, scenario: "Base" });
    const run = created.valuationRun;
    if (run) pass("valuation_runs", "latest_create", `Latest Base valuation run created: ${run.id}.`);
    else fail("valuation_runs", "latest_create", "Latest valuation run was not persisted.", "Inspect createLegnValuationRun.");
    if (finite(run?.fairValue) && finite(run?.currentPrice)) pass("valuation_runs", "finite_values", `Fair value ${run.fairValue}; current price ${run.currentPrice}.`);
    else fail("valuation_runs", "finite_values", "Fair value or current price is not finite.", "Check market and valuation snapshots.");
  }

  const valuationRuns = getLegnValuationRuns({ modelVersion: LEGN_BACKEND_MODEL_VERSION.version });
  const baseRunsByEvent = new Set(valuationRuns.filter((run) => run.scenario === "Base").map((run) => run.reportingEventId));
  const missingBaseQuarterRuns = quarterEvents.filter((event) => !baseRunsByEvent.has(event.id));
  if (missingBaseQuarterRuns.length === 0) pass("valuation_runs", "historical_base", "Base valuation runs exist for every quarterly/commercial event.");
  else fail("valuation_runs", "historical_base", `Missing Base valuation runs: ${missingBaseQuarterRuns.map((event) => event.id).join(", ")}.`, "Run npm run legn:backend:backfill-valuations.");

  const baseQuarterRuns = valuationRuns
    .filter((run) => run.scenario === "Base" && quarterEvents.some((event) => event.id === run.reportingEventId) && finite(run.fairValue))
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const distinctBaseFairValues = new Set(baseQuarterRuns.map((run) => Number(run.fairValue).toFixed(2)));
  if (distinctBaseFairValues.size > 3) pass("valuation_runs", "fair_value_variation", `${distinctBaseFairValues.size} distinct rounded Base fair values exist.`);
  else fail("valuation_runs", "fair_value_variation", "Historical Base fair values are flat or missing.", "Backfill event-visible valuation runs after updating price and quarterly snapshots.");

  const priceAnchorMismatches = baseQuarterRuns.filter((run) => {
    const dailyPrice = rows(
      "SELECT adjustedClose FROM daily_price_bars WHERE ticker = ? AND priceDate <= ? ORDER BY priceDate DESC LIMIT 1",
      ["LEGN", run.asOfDate],
    )[0];
    return dailyPrice && Math.abs(Number(dailyPrice.adjustedClose) - Number(run.currentPrice)) > 0.01;
  });
  if (priceAnchorMismatches.length === 0) pass("valuation_runs", "daily_price_anchor", "Historical as-of prices use daily market data where available.");
  else fail("valuation_runs", "daily_price_anchor", `Runs not anchored to daily prices: ${priceAnchorMismatches.map((run) => run.id).join(", ")}.`, "Run npm run legn:backend:import-prices then npm run legn:backend:backfill-valuations.");

  for (const run of valuationRuns) {
    const dataSnapshot = parseJson(run.dataSnapshotJson, {});
    const dataRows = dataSnapshot.dataSnapshotRows ?? [];
    const futureRows = dataRows.filter((row) => row.asOfDate && row.asOfDate > run.asOfDate);
    if (futureRows.length === 0) pass("valuation_runs", `${run.id}:no_future_rows`, "No valuation snapshot row is dated after the run asOfDate.");
    else fail("valuation_runs", `${run.id}:no_future_rows`, `Future-dated rows used: ${futureRows.map((row) => `${row.table}:${row.id}`).join(", ")}.`, "Filter snapshots with asOfDate <= eventDate.");
    const event = events.find((item) => item.id === run.reportingEventId);
    if (event && ["quarterly_results", "commercial_update"].includes(event.eventType)) {
      if (dataSnapshot.quarterlyAnchorGuardrail === true) pass("valuation_runs", `${run.id}:quarterly_anchor`, "Quarterly run uses event-specific financial snapshot.");
      else fail("valuation_runs", `${run.id}:quarterly_anchor`, "Quarterly run fell back to a stale annual anchor.", "Use eventId-specific financial/cash/market snapshots.");
    }
    if (dataSnapshot.cashRunwayQuarters == null || finite(dataSnapshot.cashRunwayQuarters)) pass("valuation_runs", `${run.id}:runway`, "Cash runway calculation is finite or not applicable.");
    else fail("valuation_runs", `${run.id}:runway`, "Cash runway is not finite.", "Check cash and quarterly burn inputs.");
    if (Number(dataSnapshot.dilutionPct ?? 0) <= 0.25) pass("valuation_runs", `${run.id}:dilution_cap`, "Dilution adjustment is documented and capped at 25%.");
    else fail("valuation_runs", `${run.id}:dilution_cap`, "Dilution adjustment exceeds cap.", "Cap expected dilution at 25%.");
    if (dataSnapshot.carvyktiCurrentCommercialValue != null && dataSnapshot.labelExpansionAndPipelineRnpv != null) pass("valuation_runs", `${run.id}:value_separation`, "Current CARVYKTI commercial value and pipeline/label option value are separated.");
    else fail("valuation_runs", `${run.id}:value_separation`, "CARVYKTI commercial value and pipeline/label rNPV are not separated.", "Store both fields in dataSnapshotJson.");
    const pipelineComponents = dataSnapshot.pipelineComponents ?? [];
    if (pipelineComponents.every((item) => finite(item.probabilityOfSuccess) && finite(item.rnpv) && item.rnpv <= item.unadjustedValue)) pass("valuation_runs", `${run.id}:pipeline_probability`, "Pipeline rNPV is probability-adjusted.");
    else fail("valuation_runs", `${run.id}:pipeline_probability`, "Pipeline rNPV lacks probability adjustment.", "Persist probabilityAdjustedValue and rNPV per asset.");
    const directResearchRows = dataRows.filter((row) => row.sourceType === "research_only");
    if (directResearchRows.length === 0) pass("valuation_runs", `${run.id}:research_only`, "No direct research_only rows enter valuation snapshots.");
    else fail("valuation_runs", `${run.id}:research_only`, `Direct research_only rows used: ${directResearchRows.map((row) => row.id).join(", ")}.`, "Promote to forecast/collaboration/pipeline assumption with rationale before valuation.");
  }

  const transcriptRows = rows("SELECT * FROM transcript_events WHERE ticker = ?", ["LEGN"]);
  const transcriptBadRows = transcriptRows.filter((row) => Number(row.modelReady) !== 0 || Number(row.valuationImpactAllowed) !== 0);
  if (transcriptBadRows.length === 0) pass("transcript_events", "display_only", "Transcript events are modelReady=false and valuationImpactAllowed=false by default.");
  else fail("transcript_events", "display_only", `Transcript rows are valuation-enabled: ${transcriptBadRows.map((row) => row.id).join(", ")}.`, "Keep transcripts display-only unless explicitly promoted.");
  const missingTranscriptRows = transcriptRows.filter((row) => Number(row.transcriptImported) === 0);
  if (missingTranscriptRows.every((row) => row.gapReason)) pass("transcript_events", "missing_gaps", `${missingTranscriptRows.length} missing transcript quarters are explicitly flagged.`);
  else fail("transcript_events", "missing_gaps", "Some missing transcripts lack gapReason.", "Add sourceName, retrievalDate and gapReason.");

  const guidanceBad = rows("SELECT * FROM guidance_items WHERE ticker = ? AND valuationImpactAllowed != 0", ["LEGN"]);
  if (guidanceBad.length === 0) pass("guidance_items", "valuation_gate", "Guidance candidates are valuationImpactAllowed=false unless promoted.");
  else fail("guidance_items", "valuation_gate", `Guidance rows valuation-enabled: ${guidanceBad.map((row) => row.id).join(", ")}.`, "Promote only through documented forecast_assumption rows.");

  const collaborationBad = rows("SELECT * FROM collaboration_economics_snapshots WHERE ticker = ? AND valuationImpactAllowed = 1 AND (sourceType IS NULL OR rationale IS NULL OR confidence IS NULL)", ["LEGN"]);
  if (collaborationBad.length === 0) pass("collaboration_economics_snapshots", "source_rationale", "Valuation-enabled collaboration assumptions have source, rationale and confidence.");
  else fail("collaboration_economics_snapshots", "source_rationale", `Missing metadata: ${collaborationBad.map((row) => row.id).join(", ")}.`, "Add source/rationale/confidence.");

  const pipelineBad = rows("SELECT * FROM pipeline_assets WHERE ticker = ? AND valuationImpactAllowed = 1 AND (sourceType IS NULL OR phase IS NULL OR probabilityOfSuccess IS NULL OR launchYear IS NULL OR peakSales IS NULL)", ["LEGN"]);
  if (pipelineBad.length === 0) pass("pipeline_assets", "valuation_fields", "Valuation-enabled pipeline assets have source, phase, probability, launch year and economics estimate.");
  else fail("pipeline_assets", "valuation_fields", `Missing pipeline fields: ${pipelineBad.map((row) => row.id).join(", ")}.`, "Fill required rNPV fields.");

  const shareMismatches = valuationRuns.filter((run) => {
    const dataSnapshot = parseJson(run.dataSnapshotJson, {});
    const snapshot = getLegnSnapshot({ eventId: run.reportingEventId });
    const market = snapshot.marketSnapshots.at(-1);
    const financial = snapshot.financialPeriods.filter((row) => row.eventId === run.reportingEventId).at(-1);
    return market && financial && Math.abs(Number(market.adsOutstanding) - Number(financial.adsOutstanding)) > 1;
  });
  if (shareMismatches.length === 0) pass("market_snapshots", "share_reconciliation", "Share count used in valuation reconciles to event-visible ADS base.");
  else fail("market_snapshots", "share_reconciliation", `Share mismatches in runs: ${shareMismatches.map((run) => run.id).join(", ")}.`, "Use event-visible ADS count.");

  const latestSnapshot = getLegnSnapshot({ eventId: latestQuarterEvent?.id });
  const requiredFrontendFields = [
    latestSnapshot.reportingEvent,
    latestSnapshot.marketSnapshots?.length,
    latestSnapshot.carvyktiCommercialSnapshots?.length,
    latestSnapshot.collaborationEconomicsSnapshots?.length,
    latestSnapshot.cashRunwaySnapshots?.length,
    latestSnapshot.pipelineAssets?.length,
    latestSnapshot.transcriptEvents?.length,
    latestSnapshot.validationWarnings?.length >= 0,
  ];
  if (requiredFrontendFields.every(Boolean)) pass("snapshot", "frontend_required_fields", "Frontend-required LEGN API fields exist.");
  else fail("snapshot", "frontend_required_fields", "Snapshot is missing required frontend sections.", "Populate market, Carvykti, collaboration, cash, pipeline and transcript sections.");

  const backtest = runLegnBacktest({ startDate: "2021-06-01", endDate: "2026-05-12", benchmarkTicker: "SPY" });
  const stockMetrics = backtest.metrics?.legnBuyHold ?? {};
  const spyMetrics = backtest.metrics?.spy ?? {};
  const backtestFinite =
    backtest.status === "completed" &&
    ["cagr", "maxDrawdown", "sharpe", "volatility"].every((metric) => finite(stockMetrics[metric]) && finite(spyMetrics[metric]));
  if (backtestFinite) pass("backtest_runs", "finite_metrics", "LEGN vs SPY backtest returns finite CAGR, MDD, Sharpe and Vol.");
  else fail("backtest_runs", "finite_metrics", `Backtest did not return finite metrics: ${JSON.stringify(backtest.warnings ?? [])}.`, "Import LEGN and SPY daily prices.");
}

const passCount = report.filter((row) => row.status === "PASS").length;
const warningCount = report.filter((row) => row.status === "WARNING").length;
const failCount = report.filter((row) => row.status === "FAIL").length;

console.log("LEGN Backend Validation");
console.log(`PASS: ${passCount}`);
console.log(`WARNING: ${warningCount}`);
console.log(`FAIL: ${failCount}`);
if (failCount > 0) {
  console.table(report.filter((row) => row.status === "FAIL"));
} else {
  const warnings = report.filter((row) => row.status === "WARNING");
  if (warnings.length > 0) console.table(warnings);
}
process.exitCode = failCount > 0 ? 1 : 0;
