import { existsSync } from "node:fs";
import { execute, query } from "../apps/api/src/db/client.mjs";
import { AZN_BACKEND_DB_PATH } from "../modules/azn/db/schema.mjs";
import { AZN_BACKEND_MODEL_VERSION } from "../modules/azn/valuation/modelVersion.mjs";
import { createAznValuationRun, getAznHistoricalValuations } from "../apps/api/src/services/aznValuationService.mjs";
import { runAznBacktest } from "../apps/api/src/services/aznBacktestService.mjs";
import { getAznReportingEvents } from "../apps/api/src/services/aznSnapshotService.mjs";

const TICKER = "AZN.L";
const requiredTables = [
  "reporting_events",
  "source_documents",
  "financial_periods",
  "segment_financials",
  "therapy_area_financials",
  "product_financials",
  "pipeline_assets",
  "pipeline_milestones",
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
  "patent_exclusivity_events",
  "pipeline_rnpv_components",
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

function tableCount(table) {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ticker = ?`, [TICKER], AZN_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function finite(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

async function runValidation() {
  if (!existsSync(AZN_BACKEND_DB_PATH)) {
    fail(AZN_BACKEND_DB_PATH, "db", "AZN backend DB does not exist.", "Run npm run azn:backend:seed.");
    return;
  }
  pass(AZN_BACKEND_DB_PATH, "db", "AZN backend DB exists.");

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], AZN_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of requiredTables) {
    if (tables.has(table)) pass("apps/api/src/db/migrations/001_azn_schema.sql", table, "Required table exists.");
    else fail("apps/api/src/db/migrations/001_azn_schema.sql", table, "Required table is missing.", "Apply AZN schema migration.");
  }

  const eventCount = tableCount("reporting_events");
  if (eventCount >= 32) pass("reporting_events", "count", `${eventCount} reporting events exist, covering eight years of quarterly data.`);
  else fail("reporting_events", "count", `${eventCount} reporting events exist; eight-year quarterly coverage requires at least 32.`, "Seed Q2 2018 through Q1 2026 quarterly reporting events.");

  const quarterlyCoverage = query(
    "SELECT fiscalYear, COUNT(*) AS count FROM reporting_events WHERE ticker = ? GROUP BY fiscalYear ORDER BY fiscalYear",
    [TICKER],
    AZN_BACKEND_DB_PATH,
  );
  const hasEightYearCoverage =
    quarterlyCoverage.length >= 9 &&
    quarterlyCoverage.some((row) => row.fiscalYear === 2018 && row.count >= 3) &&
    quarterlyCoverage.filter((row) => row.fiscalYear >= 2019 && row.fiscalYear <= 2025 && row.count >= 4).length === 7 &&
    quarterlyCoverage.some((row) => row.fiscalYear === 2026 && row.count >= 1);
  if (hasEightYearCoverage) pass("reporting_events", "quarterly_coverage", "Quarterly reporting-event coverage spans Q2 2018 through Q1 2026.");
  else fail("reporting_events", "quarterly_coverage", "Quarterly reporting-event coverage has gaps in the eight-year window.", "Backfill every Q1/Q2/Q3/Q4 event from Q2 2018 through Q1 2026.");

  const financialSnapshotCount = tableCount("financial_periods");
  if (financialSnapshotCount >= eventCount && eventCount > 0) pass("financial_periods", "quarterly_snapshots", `${financialSnapshotCount} financial snapshots exist for ${eventCount} events.`);
  else fail("financial_periods", "quarterly_snapshots", "Every reporting event needs an event-visible financial snapshot.", "Seed one financial_periods row per reporting event.");

  const marketCount = tableCount("market_snapshots");
  if (marketCount >= eventCount && eventCount > 0) pass("market_snapshots", "count", `${marketCount} market snapshots exist.`);
  else fail("market_snapshots", "count", "Missing market snapshots for reporting events.", "Seed one market snapshot per event date.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('AZN.L', 'SPY') GROUP BY ticker",
    [],
    AZN_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const aznPriceBars = priceBarMap.get(TICKER);
  const spyPriceBars = priceBarMap.get("SPY");
  if (aznPriceBars?.count >= 2000) pass("daily_price_bars", "AZN.L", `${aznPriceBars.count} AZN.L daily bars, ${aznPriceBars.firstDate} to ${aznPriceBars.lastDate}.`);
  else fail("daily_price_bars", "AZN.L", "AZN.L daily price bars are missing or too short.", "Run npm run azn:backend:import-prices.");
  if (spyPriceBars?.count >= 2000) pass("daily_price_bars", "SPY", `${spyPriceBars.count} SPY daily bars, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}.`);
  else fail("daily_price_bars", "SPY", "SPY daily price bars are missing or too short.", "Run npm run azn:backend:import-prices.");

  const modelVersion = query("SELECT * FROM model_versions WHERE ticker = ? AND version = ? LIMIT 1", [TICKER, AZN_BACKEND_MODEL_VERSION.version], AZN_BACKEND_DB_PATH)[0] ?? null;
  if (modelVersion) pass("model_versions", "version", `${AZN_BACKEND_MODEL_VERSION.version} exists.`);
  else fail("model_versions", "version", "AZN backend model version is missing.", "Seed azn_v1_backend_pilot.");

  const scenarios = query("SELECT DISTINCT scenario FROM assumption_sets WHERE ticker = ?", [TICKER], AZN_BACKEND_DB_PATH).map((row) => row.scenario);
  for (const scenario of ["Bear", "Base", "Bull"]) {
    if (scenarios.includes(scenario)) pass("assumption_sets", scenario, `${scenario} assumption sets exist.`);
    else fail("assumption_sets", scenario, `${scenario} assumption sets are missing.`, "Seed Bear/Base/Bull assumption sets.");
  }

  const events = getAznReportingEvents();
  if (events[0]) {
    try {
      const result = await createAznValuationRun({ eventId: events[0].id, scenario: "Base" });
      const run = result.valuationRun;
      if (finite(run?.fairValue) && finite(run?.currentPrice)) pass("valuation_runs", "latest_create", "Latest-event valuation run can be created with finite fair value and current price.");
      else fail("valuation_runs", "latest_create", "Latest-event valuation run has non-finite fair value/current price.", "Inspect AZN backend adapter assumptions.");
      if (result.id) execute("DELETE FROM valuation_runs WHERE id = ?", [result.id], AZN_BACKEND_DB_PATH);
    } catch (error) {
      fail("valuation_runs", "latest_create", error instanceof Error ? error.message : String(error), "Fix adapter/service before validating historical runs.");
    }
  }

  const futureFinancialRows = query(
    `SELECT fp.id, fp.asOfDate, re.eventDate
     FROM financial_periods fp JOIN reporting_events re ON fp.eventId = re.id
     WHERE fp.ticker = ? AND fp.asOfDate > re.eventDate`,
    [TICKER],
    AZN_BACKEND_DB_PATH,
  );
  if (futureFinancialRows.length === 0) pass("financial_periods", "asOfDate", "Financial period rows are not dated after their reporting events.");
  else fail("financial_periods", "asOfDate", `${futureFinancialRows.length} financial rows leak future event dates.`, "Set financial_periods.asOfDate <= reporting_events.eventDate.");

  const futureGuidanceRows = query(
    `SELECT gi.id, gi.asOfDate, re.eventDate
     FROM guidance_items gi JOIN reporting_events re ON gi.eventId = re.id
     WHERE gi.ticker = ? AND gi.asOfDate > re.eventDate`,
    [TICKER],
    AZN_BACKEND_DB_PATH,
  );
  if (futureGuidanceRows.length === 0) pass("guidance_items", "asOfDate", "Guidance candidates are event-visible only.");
  else fail("guidance_items", "asOfDate", `${futureGuidanceRows.length} guidance rows are dated after the event.`, "Move guidance asOfDate to the public disclosure date.");

  const interimRuns = query(
    `SELECT vr.id, vr.reportingEventId, re.eventType, vr.dataSnapshotJson
     FROM valuation_runs vr JOIN reporting_events re ON vr.reportingEventId = re.id
     WHERE vr.ticker = ? AND vr.scenario = 'Base' AND re.eventType IN ('q1_results', 'h1_results', 'q3_9m_results')`,
    [TICKER],
    AZN_BACKEND_DB_PATH,
  );
  const staleInterim = interimRuns.filter((row) => parseJson(row.dataSnapshotJson, {})?.interimRunRateSnapshot !== true);
  if (interimRuns.length > 0 && staleInterim.length === 0) pass("valuation_runs", "interimRunRateSnapshot", "Q1/H1/Q3 valuations use event-visible run-rate snapshots.");
  else fail("valuation_runs", "interimRunRateSnapshot", "Interim valuation run-rate markers are missing.", "Backfill valuation runs after adapter generates interimRunRateSnapshot=true.");

  const shareMismatch = query(
    "SELECT id, dataSnapshotJson FROM valuation_runs WHERE ticker = ?",
    [TICKER],
    AZN_BACKEND_DB_PATH,
  ).filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const financialShares = Number(snapshot.financialWeightedAverageShares);
    const assumptionShares = Number(snapshot.assumptionDilutedShares);
    return Number.isFinite(financialShares) && Number.isFinite(assumptionShares) && Math.abs(financialShares - assumptionShares) > 0.01;
  });
  if (shareMismatch.length === 0) pass("valuation_runs", "share_count", "Financial share count reconciles to valuation share base.");
  else fail("valuation_runs", "share_count", `${shareMismatch.length} valuation runs mix share bases.`, "Use the event-visible weighted average share count consistently.");

  const therapyRows = query(
    `SELECT re.id AS eventId, re.label, fp.revenue AS runRateRevenue, fp.rawJson AS financialRawJson, SUM(taf.revenue) AS therapyRevenue
     FROM reporting_events re
     JOIN financial_periods fp ON fp.eventId = re.id
     LEFT JOIN therapy_area_financials taf ON taf.eventId = re.id
     WHERE re.ticker = ?
     GROUP BY re.id`,
    [TICKER],
    AZN_BACKEND_DB_PATH,
  );
  const therapyBreaks = therapyRows.filter((row) => {
    const raw = parseJson(row.financialRawJson, {});
    const disclosedRevenue = Number(raw.quarterRevenue ?? row.runRateRevenue ?? 0);
    return Math.abs(Number(row.therapyRevenue ?? 0) - disclosedRevenue) > 2;
  });
  if (therapyRows.length > 0 && therapyBreaks.length === 0) pass("therapy_area_financials", "revenue", "Therapy-area revenue reconciles to event-visible disclosed group revenue.");
  else fail("therapy_area_financials", "revenue", "Therapy-area revenue does not reconcile.", "Normalize therapy mix to financial_periods.revenue.");

  const productOverTherapy = query(
    `SELECT pf.eventId, pf.therapyArea, SUM(pf.revenue) AS productRevenue, taf.revenue AS therapyRevenue
     FROM product_financials pf
     JOIN therapy_area_financials taf ON taf.eventId = pf.eventId AND taf.therapyArea = pf.therapyArea
     WHERE pf.ticker = ?
     GROUP BY pf.eventId, pf.therapyArea`,
    [TICKER],
    AZN_BACKEND_DB_PATH,
  ).filter((row) => Number(row.productRevenue) > Number(row.therapyRevenue) + 1);
  if (productOverTherapy.length === 0) pass("product_financials", "revenue", "Key product revenue does not exceed therapy-area revenue.");
  else fail("product_financials", "revenue", `${productOverTherapy.length} product/therapy rows break revenue hierarchy.`, "Reduce product weights or add residual other-product row.");

  const pipelineBad = query(
    `SELECT id FROM pipeline_assets
     WHERE ticker = ? AND valuationImpactAllowed = 1
       AND (sourceDocumentId IS NULL OR phase IS NULL OR probabilityOfSuccess IS NULL OR launchYear IS NULL OR peakSales IS NULL)`,
    [TICKER],
    AZN_BACKEND_DB_PATH,
  );
  if (pipelineBad.length === 0) pass("pipeline_assets", "valuation_ready_fields", "Valuation-impact pipeline rows have source, phase, POS, launch year and peak sales.");
  else fail("pipeline_assets", "valuation_ready_fields", `${pipelineBad.length} pipeline rows are missing valuation fields.`, "Populate source/phase/POS/launchYear/peakSales before valuationImpactAllowed=true.");

  const transcriptReady = query("SELECT COUNT(*) AS count FROM transcript_extractions WHERE ticker = ? AND modelReady = 1", [TICKER], AZN_BACKEND_DB_PATH)[0]?.count ?? 0;
  if (transcriptReady === 0) pass("transcript_extractions", "modelReady", "Transcript candidates are modelReady=false by default.");
  else fail("transcript_extractions", "modelReady", "Transcript candidates are marked model-ready.", "Keep Q&A/commentary display-only until promoted.");

  const guidancePromoted = query("SELECT COUNT(*) AS count FROM guidance_items WHERE ticker = ? AND valuationImpactAllowed = 1", [TICKER], AZN_BACKEND_DB_PATH)[0]?.count ?? 0;
  if (guidancePromoted === 0) pass("guidance_items", "valuationImpactAllowed", "Guidance candidates are not valuation-impacting until promoted.");
  else warn("guidance_items", "valuationImpactAllowed", `${guidancePromoted} guidance rows are promoted into valuation.`, "Confirm human review status and source evidence.");

  const badPeerAbsolute = query(
    "SELECT COUNT(*) AS count FROM peer_snapshots WHERE ticker = ? AND (marketCap IS NOT NULL OR enterpriseValue IS NOT NULL) AND absoluteValueUse <> 'metadata_only'",
    [TICKER],
    AZN_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  if (badPeerAbsolute === 0) pass("peer_snapshots", "absoluteValueUse", "Peer absolute market values are metadata-only across mixed currencies.");
  else fail("peer_snapshots", "absoluteValueUse", "Mixed-currency peer absolute values are usable without metadata flag.", "Set absoluteValueUse='metadata_only'.");

  const frontendBad = query("SELECT id, fairValue, currentPrice, dataSnapshotJson FROM valuation_runs WHERE ticker = ?", [TICKER], AZN_BACKEND_DB_PATH).filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return !finite(row.fairValue) || !finite(row.currentPrice) || !snapshot.reportingEventId || !snapshot.marketSnapshotId || !snapshot.valuationPeriodId;
  });
  if (frontendBad.length === 0) pass("valuation_runs", "frontend_fields", "Frontend-required valuation fields exist.");
  else fail("valuation_runs", "frontend_fields", `${frontendBad.length} valuation runs lack frontend fields.`, "Persist event id, market snapshot id, period id, fair value and current price.");

  const weightRows = query("SELECT id, assumptionsJson FROM assumption_sets WHERE ticker = ?", [TICKER], AZN_BACKEND_DB_PATH);
  const badWeights = weightRows.filter((row) => {
    const weights = parseJson(row.assumptionsJson, {})?.backendMethodWeights;
    const sum = weights ? Object.values(weights).reduce((acc, value) => acc + Number(value), 0) : NaN;
    return !Number.isFinite(sum) || Math.abs(sum - 1) > 0.0001;
  });
  const modelMethodSum = AZN_BACKEND_MODEL_VERSION.valuationMethods.reduce((sum, method) => sum + method.weight, 0);
  if (badWeights.length === 0 && Math.abs(modelMethodSum - 1) < 0.0001) pass("assumption_sets", "backendMethodWeights", "Valuation weights sum to 100%.");
  else fail("assumption_sets", "backendMethodWeights", "Valuation weights do not sum to 100%.", "Normalize backendMethodWeights and modelVersion valuationMethods.");

  const terminalTight = weightRows.filter((row) => {
    const assumptions = parseJson(row.assumptionsJson, {});
    return Number(assumptions.wacc) - Number(assumptions.terminalGrowth) < 0.02;
  });
  if (terminalTight.length === 0) pass("assumption_sets", "dcf_terminal_threshold", "DCF terminal growth sits safely below WACC.");
  else warn("assumption_sets", "dcf_terminal_threshold", `${terminalTight.length} assumption sets have terminal spread below 200 bps.`, "Review terminal value dominance.");

  const pipelineDominantRuns = query("SELECT id, fairValue, methodOutputsJson, warningsJson FROM valuation_runs WHERE ticker = ?", [TICKER], AZN_BACKEND_DB_PATH).filter((row) => {
    const methods = parseJson(row.methodOutputsJson, []);
    const warnings = parseJson(row.warningsJson, []);
    const pipeline = methods.find((method) => method.key === "azn-pipeline");
    const dominates = Number(row.fairValue) > 0 && Number(pipeline?.value) / Number(row.fairValue) > 0.5;
    return dominates && !warnings.some((warning) => /pipeline/i.test(`${warning.title} ${warning.detail}`));
  });
  if (pipelineDominantRuns.length === 0) pass("valuation_runs", "pipeline_rnpv_dominance", "Pipeline rNPV does not dominate fair value without warning.");
  else warn("valuation_runs", "pipeline_rnpv_dominance", `${pipelineDominantRuns.length} valuation runs have large pipeline rNPV contribution without explicit warning.`, "Add a warning or reduce pipeline valuation weight.");

  const patentRows = query("SELECT id, erosionCurveJson, rationale FROM patent_exclusivity_events WHERE ticker = ?", [TICKER], AZN_BACKEND_DB_PATH);
  const badPatentRows = patentRows.filter((row) => {
    const erosion = parseJson(row.erosionCurveJson, {});
    return Number(erosion.cap) > 0.6 || !row.rationale;
  });
  if (badPatentRows.length === 0 && patentRows.length > 0) pass("patent_exclusivity_events", "erosion_curve", "Patent cliff erosion assumptions are capped and documented.");
  else fail("patent_exclusivity_events", "erosion_curve", "Patent cliff erosion assumptions are missing or uncapped.", "Add rationale and cap erosion assumptions at documented limits.");

  const historical = getAznHistoricalValuations({ scenario: "Base" });
  const missingHistorical = historical.filter((row) => !row.valuationRun);
  if (missingHistorical.length === 0 && historical.length > 0) pass("valuation_runs", "historical_coverage", "Every reporting event has a persisted Base valuation run.");
  else warn("valuation_runs", "historical_coverage", `${missingHistorical.length} reporting events lack a Base valuation run.`, "Run npm run azn:backend:backfill-valuations.");

  const baseFairValues = query(
    `SELECT ROUND(fairValue, 2) AS fairValue
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ? AND fairValue IS NOT NULL`,
    [TICKER, AZN_BACKEND_MODEL_VERSION.version],
    AZN_BACKEND_DB_PATH,
  );
  const distinctFairValues = new Set(baseFairValues.map((row) => row.fairValue));
  if (distinctFairValues.size > 3) pass("valuation_runs", "historical_fair_value_variation", `${distinctFairValues.size} distinct rounded historical fair values.`);
  else fail("valuation_runs", "historical_fair_value_variation", "Historical fair values look like a flat line.", "Check event-visible assumption mapping and valuation backfill.");

  const baseRunsWithPrices = query(
    `SELECT v.reportingEventId, v.asOfDate, v.currentPrice
     FROM valuation_runs v
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY v.asOfDate`,
    [TICKER, AZN_BACKEND_MODEL_VERSION.version],
    AZN_BACKEND_DB_PATH,
  );
  const priceAnchorBreaks = baseRunsWithPrices.filter((run) => {
    const price = query(
      `SELECT adjustedClose
       FROM daily_price_bars
       WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
       ORDER BY priceDate DESC LIMIT 1`,
      [TICKER, run.asOfDate],
      AZN_BACKEND_DB_PATH,
    )[0] ?? null;
    return price && Math.abs(Number(price.adjustedClose) - Number(run.currentPrice)) > 0.01;
  });
  if (baseRunsWithPrices.length > 0 && priceAnchorBreaks.length === 0) pass("valuation_runs", "daily_price_anchor", "Historical as-of prices use nearest prior daily market data where available.");
  else fail("valuation_runs", "daily_price_anchor", `${priceAnchorBreaks.length} valuation runs are not anchored to daily price bars.`, "Import prices, then rerun npm run azn:backend:backfill-valuations.");

  try {
    const backtest = runAznBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const stock = backtest.metrics?.stock ?? backtest.metrics?.aznBuyHold;
    const spy = backtest.metrics?.spy;
    const fields = [stock?.cagr, stock?.maxDrawdown, stock?.sharpe, stock?.volatility, spy?.cagr, spy?.maxDrawdown, spy?.sharpe, spy?.volatility];
    if (backtest.status === "completed" && fields.every(finite)) pass("backtest_runs", "endpoint_metrics", "Backtest endpoint returns finite CAGR, MDD, Sharpe and Vol for AZN.L and SPY.");
    else fail("backtest_runs", "endpoint_metrics", "Backtest did not return finite metrics.", "Check daily_price_bars for AZN.L/SPY and overlap dates.");
  } catch (error) {
    fail("backtest_runs", "endpoint_metrics", error instanceof Error ? error.message : String(error), "Fix AZN backtest service.");
  }
}

await runValidation();

const counts = {
  PASS: results.filter((row) => row.status === "PASS").length,
  WARNING: results.filter((row) => row.status === "WARNING").length,
  FAIL: results.filter((row) => row.status === "FAIL").length,
};

console.log("AZN Backend Validation");
console.log(`PASS: ${counts.PASS}`);
console.log(`WARNING: ${counts.WARNING}`);
console.log(`FAIL: ${counts.FAIL}`);

for (const row of results.filter((item) => item.status !== "PASS")) {
  console.log(`${row.status}: ${row.file} | ${row.field} | ${row.reason}${row.suggestedFix ? ` | Suggested fix: ${row.suggestedFix}` : ""}`);
}

if (counts.FAIL > 0) {
  process.exitCode = 1;
}
