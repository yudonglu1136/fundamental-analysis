#!/usr/bin/env node
import { existsSync } from "node:fs";
import { execute, query } from "../apps/api/src/db/client.mjs";
import { runGildBacktest } from "../apps/api/src/services/gildBacktestService.mjs";
import { createGildValuationRun } from "../apps/api/src/services/gildValuationService.mjs";
import { getGildReportingEvents } from "../apps/api/src/services/gildSnapshotService.mjs";
import { GILD_BACKEND_DB_PATH } from "../modules/gild/db/schema.mjs";
import { GILD_BACKEND_MODEL_VERSION } from "../modules/gild/valuation/modelVersion.mjs";

const TICKER = "GILD";
const requiredTables = [
  "reporting_events",
  "source_documents",
  "financial_periods",
  "product_financials",
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
  "franchise_financials",
  "product_lifecycle_events",
  "patent_exclusivity_events",
  "pipeline_assets",
  "pipeline_milestones",
  "pipeline_rnpv_components",
  "capital_allocation_events",
  "dividend_buyback_snapshots",
  "cash_debt_snapshots",
  "acquisition_bd_events",
  "veklury_normalization_snapshots",
];

const results = [];

function record(status, table, field, reason, suggestedFix = "") {
  results.push({ status, table, field, reason, suggestedFix });
}

function pass(table, field, reason) {
  record("PASS", table, field, reason);
}

function warn(table, field, reason, suggestedFix = "") {
  record("WARNING", table, field, reason, suggestedFix);
}

function fail(table, field, reason, suggestedFix = "") {
  record("FAIL", table, field, reason, suggestedFix);
}

function count(table, where = "ticker = 'GILD'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], GILD_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function latestRunByEvent(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.reportingEventId)) map.set(row.reportingEventId, row);
  }
  return [...map.values()];
}

function checkRowDates(table, ids, eventDate) {
  if (!ids?.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const dateColumn = table === "product_lifecycle_events" || table === "acquisition_bd_events" ? "eventDate" : table === "pipeline_milestones" ? "milestoneDate" : table === "daily_price_bars" ? "priceDate" : "asOfDate";
  return query(`SELECT id, ${dateColumn} AS rowDate FROM ${table} WHERE id IN (${placeholders})`, ids, GILD_BACKEND_DB_PATH)
    .filter((row) => row.rowDate > eventDate)
    .map((row) => ({ table, id: row.id, rowDate: row.rowDate, eventDate }));
}

async function runValidation() {
  console.log("GILD Backend Validation");

  if (!existsSync(GILD_BACKEND_DB_PATH)) {
    fail("data/local/gild/backend/gild_research.sqlite", "db", "GILD backend DB does not exist.", "Run npm run gild:backend:seed.");
    printAndExit();
    return;
  }
  pass("data/local/gild/backend/gild_research.sqlite", "db", `DB exists at ${GILD_BACKEND_DB_PATH}.`);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], GILD_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of requiredTables) {
    if (tables.has(table)) pass("apps/api/src/db/migrations/001_gild_schema.sql", table, "Required table exists.");
    else fail("apps/api/src/db/migrations/001_gild_schema.sql", table, "Required table is missing.", "Apply the GILD schema migration.");
  }

  const eventCount = count("reporting_events");
  eventCount >= 33 ? pass("reporting_events", "count", `${eventCount} reporting events imported.`) : fail("reporting_events", "count", `${eventCount} events; expected FY2018-Q1 through FY2026-Q1 coverage.`, "Rebuild from SEC submissions.");

  const annualYears = query("SELECT COUNT(DISTINCT fiscalYear) AS count FROM financial_periods WHERE ticker = ? AND periodType = 'annual'", [TICKER], GILD_BACKEND_DB_PATH)[0]?.count ?? 0;
  annualYears >= 8 ? pass("financial_periods", "annual_fiscal_years", `${annualYears} fiscal years of annual official data.`) : fail("financial_periods", "annual_fiscal_years", `${annualYears} fiscal years; expected at least 8.`, "Seed FY2018-FY2025 official rows.");

  const quarterRows = query(
    "SELECT COUNT(*) AS count, MIN(eventDate) AS minDate, MAX(eventDate) AS maxDate FROM reporting_events WHERE ticker = ? AND fiscalQuarter IN ('Q1','Q2','Q3')",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  )[0];
  Number(quarterRows?.count ?? 0) >= 25
    ? pass("reporting_events", "quarterly_coverage", `${quarterRows.count} Q1/Q2/Q3 events from ${quarterRows.minDate} to ${quarterRows.maxDate}.`)
    : fail("reporting_events", "quarterly_coverage", `${quarterRows?.count ?? 0} quarterly events; expected last eight-year window.`, "Import all 10-Q reporting events.");

  const fyEvents = count("reporting_events", "ticker = 'GILD' AND eventType = 'fy_earnings_release_10k'");
  fyEvents >= 8 ? pass("reporting_events", "annual_10k_events", `${fyEvents} FY/10-K events exist.`) : fail("reporting_events", "annual_10k_events", `${fyEvents} FY events.`, "Import annual report / 10-K events.");

  const marketCount = count("market_snapshots");
  marketCount >= eventCount ? pass("market_snapshots", "event_rows", `${marketCount}/${eventCount} event-dated market snapshots.`) : fail("market_snapshots", "event_rows", `${marketCount}/${eventCount} rows.`, "Seed one market snapshot per reporting event.");

  const priceRows = query(
    `SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS minDate, MAX(priceDate) AS maxDate,
            SUM(CASE WHEN adjustedClose IS NOT NULL THEN 1 ELSE 0 END) AS adjustedRows,
            SUM(CASE WHEN adjustedClose IS NULL AND close IS NOT NULL THEN 1 ELSE 0 END) AS unadjustedFallbackRows
     FROM daily_price_bars
     WHERE ticker IN ('GILD','SPY')
     GROUP BY ticker`,
    [],
    GILD_BACKEND_DB_PATH,
  );
  const priceMap = new Map(priceRows.map((row) => [row.ticker, row]));
  for (const ticker of ["GILD", "SPY"]) {
    const row = priceMap.get(ticker);
    if (Number(row?.count ?? 0) >= 1000 && Number(row?.adjustedRows ?? 0) > 0) {
      pass("daily_price_bars", ticker, `${row.count} ${ticker} rows from ${row.minDate} to ${row.maxDate}; adjusted rows=${row.adjustedRows}.`);
    } else {
      fail("daily_price_bars", ticker, `${Number(row?.count ?? 0)} ${ticker} rows; adjusted rows=${Number(row?.adjustedRows ?? 0)}.`, "Fetch/import daily adjusted prices with npm run gild:backend:import-prices.");
    }
    if (Number(row?.unadjustedFallbackRows ?? 0) > 0) {
      warn("daily_price_bars", `${ticker}_unadjusted_fallback`, `${row.unadjustedFallbackRows} rows use close because adjusted close was unavailable.`, "Prefer adjusted-close source files where available.");
    }
  }

  const modelVersionCount = count("model_versions", `ticker = 'GILD' AND version = '${GILD_BACKEND_MODEL_VERSION.version}'`);
  modelVersionCount === 1 ? pass("model_versions", "version", GILD_BACKEND_MODEL_VERSION.version) : fail("model_versions", "version", "GILD backend model version missing.", "Seed model_versions.");

  const scenarioRows = query("SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? GROUP BY scenario", [TICKER], GILD_BACKEND_DB_PATH);
  const scenarioMap = new Map(scenarioRows.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) >= eventCount
      ? pass("assumption_sets", scenario, `${scenarioMap.get(scenario)} event-visible ${scenario} assumption sets.`)
      : fail("assumption_sets", scenario, `${scenarioMap.get(scenario) ?? 0}/${eventCount} ${scenario} assumption sets.`, "Create one assumption set per event per scenario.");
  }

  const latestEvent = getGildReportingEvents()[0] ?? null;
  if (latestEvent) {
    let tempId = null;
    try {
      const result = await createGildValuationRun({ eventId: latestEvent.id, scenario: "Base" });
      tempId = result.id;
      const run = result.valuationRun;
      finite(run?.fairValue) && finite(run?.currentPrice)
        ? pass("valuation_runs", "latest_create", `Latest Base valuation finite: currentPrice=${Number(run.currentPrice).toFixed(2)}, fairValue=${Number(run.fairValue).toFixed(2)}.`)
        : fail("valuation_runs", "latest_create", "Latest valuation lacks finite fair value/current price.", "Inspect GILD adapter.");
    } catch (error) {
      fail("valuation_runs", "latest_create", error instanceof Error ? error.message : String(error), "Fix service/adapter.");
    } finally {
      if (tempId) {
        execute("DELETE FROM pipeline_rnpv_components WHERE valuationRunId = ?", [tempId], GILD_BACKEND_DB_PATH);
        execute("DELETE FROM valuation_runs WHERE id = ?", [tempId], GILD_BACKEND_DB_PATH);
      }
    }
  } else {
    fail("reporting_events", "latest_event", "No latest event available.", "Seed reporting events.");
  }

  const historicalBaseRuns = query(
    `SELECT * FROM valuation_runs WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ? ORDER BY createdAt DESC`,
    [TICKER, GILD_BACKEND_MODEL_VERSION.version],
    GILD_BACKEND_DB_PATH,
  );
  const latestBaseRuns = latestRunByEvent(historicalBaseRuns);
  latestBaseRuns.length >= eventCount
    ? pass("valuation_runs", "historical_base_coverage", `${latestBaseRuns.length}/${eventCount} events have Base valuation runs.`)
    : fail("valuation_runs", "historical_base_coverage", `${latestBaseRuns.length}/${eventCount} events have Base runs.`, "Run npm run gild:backend:backfill-valuations.");

  const finiteRuns = latestBaseRuns.filter((row) => finite(row.currentPrice) && finite(row.fairValue));
  finiteRuns.length === latestBaseRuns.length && finiteRuns.length > 0
    ? pass("valuation_runs", "finite_price_value", `${finiteRuns.length} latest Base runs have finite current price and fair value.`)
    : fail("valuation_runs", "finite_price_value", `${finiteRuns.length}/${latestBaseRuns.length} finite Base runs.`, "Inspect market snapshots and adapter outputs.");

  const distinctFairValues = new Set(finiteRuns.map((row) => Number(row.fairValue).toFixed(2))).size;
  distinctFairValues >= 8
    ? pass("valuation_runs", "historical_fair_value_variation", `${distinctFairValues} distinct historical Base fair values; not a flat line.`)
    : fail("valuation_runs", "historical_fair_value_variation", `${distinctFairValues} distinct fair values.`, "Backfill event-visible valuations instead of reusing one snapshot.");

  const dailyPriceMismatches = latestBaseRuns.filter((row) => {
    const daily = query(
      "SELECT id, priceDate, adjustedClose, close FROM daily_price_bars WHERE ticker = ? AND priceDate <= ? AND (adjustedClose IS NOT NULL OR close IS NOT NULL) ORDER BY priceDate DESC LIMIT 1",
      [TICKER, row.asOfDate],
      GILD_BACKEND_DB_PATH,
    )[0] ?? null;
    if (!daily) return false;
    const price = Number(daily.adjustedClose ?? daily.close);
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return snapshot.asOfPriceSource?.table !== "daily_price_bars"
      || snapshot.asOfPriceSource?.rowId !== daily.id
      || Math.abs(Number(row.currentPrice) - price) > 0.05;
  });
  const dailyComparableRuns = latestBaseRuns.filter((row) => query(
    "SELECT id FROM daily_price_bars WHERE ticker = ? AND priceDate <= ? LIMIT 1",
    [TICKER, row.asOfDate],
    GILD_BACKEND_DB_PATH,
  ).length > 0);
  dailyPriceMismatches.length === 0 && dailyComparableRuns.length > 0
    ? pass("valuation_runs/daily_price_bars", "as_of_price_source", `${dailyComparableRuns.length} Base runs use latest available daily market price as of event date.`)
    : fail("valuation_runs/daily_price_bars", "as_of_price_source", `${dailyPriceMismatches.length}/${dailyComparableRuns.length} runs are not daily-price anchored.`, "Run npm run gild:backend:backfill-valuations after importing prices.");

  const futureLeaks = [];
  const idTableMap = {
    financialPeriodIds: "financial_periods",
    ltmFinancialPeriodIds: "financial_periods",
    marketSnapshotIds: "market_snapshots",
    dailyPriceBarIds: "daily_price_bars",
    productFinancialIds: "product_financials",
    franchiseFinancialIds: "franchise_financials",
    ltmFranchiseFinancialIds: "franchise_financials",
    patentExclusivityEventIds: "patent_exclusivity_events",
    pipelineAssetIds: "pipeline_assets",
    guidanceItemIds: "guidance_items",
    cashDebtSnapshotIds: "cash_debt_snapshots",
    dividendBuybackSnapshotIds: "dividend_buyback_snapshots",
    vekluryNormalizationSnapshotIds: "veklury_normalization_snapshots",
  };
  for (const row of latestBaseRuns) {
    const event = query("SELECT eventDate FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, row.reportingEventId], GILD_BACKEND_DB_PATH)[0];
    const snapshot = parseJson(row.dataSnapshotJson, {});
    for (const [key, table] of Object.entries(idTableMap)) {
      futureLeaks.push(...checkRowDates(table, snapshot.sourceRowIds?.[key] ?? [], event?.eventDate ?? row.asOfDate));
    }
  }
  futureLeaks.length === 0
    ? pass("valuation_runs", "no_future_data", `${latestBaseRuns.length} Base runs checked for future-dated used rows.`)
    : fail("valuation_runs", "no_future_data", JSON.stringify(futureLeaks.slice(0, 6)), "Filter snapshots to event-visible rows only.");

  const staleQuarterRuns = latestBaseRuns.filter((row) => {
    const event = query("SELECT fiscalQuarter FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, row.reportingEventId], GILD_BACKEND_DB_PATH)[0];
    if (!["Q1", "Q2", "Q3"].includes(event?.fiscalQuarter)) return false;
    const expected = query("SELECT periodId FROM financial_periods WHERE ticker = ? AND eventId = ? LIMIT 1", [TICKER, row.reportingEventId], GILD_BACKEND_DB_PATH)[0]?.periodId;
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return snapshot.valuationPeriodId !== expected || snapshot.valuationPeriodType !== "reporting_event_quarterly_snapshot";
  });
  staleQuarterRuns.length === 0
    ? pass("valuation_runs", "quarterly_event_snapshots", "Quarterly valuations use event-specific quarterly snapshots.")
    : fail("valuation_runs", "quarterly_event_snapshots", JSON.stringify(staleQuarterRuns.slice(0, 5).map((row) => row.reportingEventId)), "Use event financial_period row for Q1/Q2/Q3 valuations.");

  const staleQuarterScaleRuns = latestBaseRuns.filter((row) => {
    const event = query("SELECT fiscalQuarter FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, row.reportingEventId], GILD_BACKEND_DB_PATH)[0];
    if (!["Q1", "Q2", "Q3"].includes(event?.fiscalQuarter)) return false;
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const sourceRevenue = Number(snapshot.valuationFinancialBasis?.sourceRevenue ?? 0);
    const annualizedRevenue = Number(snapshot.valuationFinancialBasis?.annualizedRevenueUsed ?? 0);
    return !["event_visible_ltm", "event_visible_ytd_annualized"].includes(snapshot.valuationFinancialBasis?.basis)
      || !Number.isFinite(annualizedRevenue)
      || annualizedRevenue <= sourceRevenue * 2.5;
  });
  staleQuarterScaleRuns.length === 0
    ? pass("valuation_runs", "quarterly_ltm_scale", "Quarterly valuation methods use event-visible LTM/YTD annualized revenue and EBIT scale, not single-quarter anchors.")
    : fail("valuation_runs", "quarterly_ltm_scale", JSON.stringify(staleQuarterScaleRuns.slice(0, 5).map((row) => row.reportingEventId)), "Annualize or LTM-normalize quarterly valuation inputs.");

  const shareMismatch = latestBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const period = query("SELECT dilutedShares FROM financial_periods WHERE ticker = ? AND periodId = ? LIMIT 1", [TICKER, snapshot.valuationPeriodId], GILD_BACKEND_DB_PATH)[0];
    return finite(period?.dilutedShares) && finite(snapshot.dilutedSharesUsed) && Math.abs(Number(period.dilutedShares) - Number(snapshot.dilutedSharesUsed)) > 0.01;
  });
  shareMismatch.length === 0
    ? pass("valuation_runs", "share_count", "Share count used in valuation reconciles to event-visible share base.")
    : fail("valuation_runs", "share_count", `${shareMismatch.length} share-count mismatches.`, "Use financial_periods.dilutedShares consistently.");

  const revenueBreaks = query(
    `SELECT fp.eventId,
            fp.revenue,
            (SELECT SUM(pf.revenue) FROM product_financials pf WHERE pf.ticker = fp.ticker AND pf.eventId = fp.eventId) AS productRevenue,
            (SELECT SUM(ff.revenue) FROM franchise_financials ff WHERE ff.ticker = fp.ticker AND ff.eventId = fp.eventId) AS franchiseRevenue
     FROM financial_periods fp
     WHERE fp.ticker = ?`,
    [TICKER],
    GILD_BACKEND_DB_PATH,
  ).filter((row) => {
    const tolerance = Math.max(Number(row.revenue ?? 0) * 0.02, 50);
    return Math.abs(Number(row.productRevenue ?? 0) - Number(row.revenue ?? 0)) > tolerance
      || Math.abs(Number(row.franchiseRevenue ?? 0) - Number(row.revenue ?? 0)) > tolerance;
  });
  if (revenueBreaks.length === 0) {
    pass("product_financials/franchise_financials", "revenue_reconciliation", "Product and franchise revenue reconcile to event-visible group revenue.");
  } else {
    fail("product_financials/franchise_financials", "revenue_reconciliation", `${revenueBreaks.length} event revenue breaks.`, "Normalize product/franchise rows to financial_periods.revenue.");
  }

  const vekluryRows = query("SELECT * FROM veklury_normalization_snapshots WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH);
  const badVeklury = vekluryRows.filter((row) => !finite(row.reportedVekluryRevenue) || !finite(row.normalizedVekluryRevenue) || !finite(row.normalizedBaseRevenue));
  badVeklury.length === 0 && vekluryRows.length >= eventCount
    ? pass("veklury_normalization_snapshots", "normalization", "Veklury revenue is separated from normalized base revenue for every event.")
    : fail("veklury_normalization_snapshots", "normalization", `${badVeklury.length} bad rows across ${vekluryRows.length}.`, "Populate reported and normalized Veklury fields.");

  const hcvBad = query(
    "SELECT id FROM franchise_financials WHERE ticker = ? AND franchise = 'HCV residual cash flow' AND (valuationTreatment NOT LIKE '%declining%' OR normalizedRevenue > revenue)",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  );
  hcvBad.length === 0 ? pass("franchise_financials", "hcv_decline", "HCV is treated as declining residual cash flow.") : fail("franchise_financials", "hcv_decline", `${hcvBad.length} rows treat HCV incorrectly.`, "Set HCV valuationTreatment and normalizedRevenue appropriately.");

  const dividendBad = query(
    "SELECT id FROM dividend_buyback_snapshots WHERE ticker = ? AND (payoutRatioFcf IS NULL OR payoutRatioEps IS NULL OR rawJson NOT LIKE '%FCF and adjusted diluted EPS%')",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  );
  dividendBad.length === 0 ? pass("dividend_buyback_snapshots", "coverage_basis", "Dividend coverage stores FCF and EPS bases consistently.") : fail("dividend_buyback_snapshots", "coverage_basis", `${dividendBad.length} rows lack coverage basis.`, "Populate payoutRatioFcf, payoutRatioEps and rawJson policy.");

  const cashDebtBad = query(
    `SELECT cds.id FROM cash_debt_snapshots cds
     JOIN reporting_events re ON re.id = cds.eventId
     WHERE cds.ticker = ? AND (cds.asOfDate > re.eventDate OR cds.cashAndInvestments IS NULL OR cds.debt IS NULL OR cds.netDebt IS NULL)`,
    [TICKER],
    GILD_BACKEND_DB_PATH,
  );
  cashDebtBad.length === 0 ? pass("cash_debt_snapshots", "event_visible", "Cash/debt rows are event-visible and populated.") : fail("cash_debt_snapshots", "event_visible", `${cashDebtBad.length} cash/debt rows fail.`, "Use event-date official balance-sheet rows.");

  const peerMisuse = query(
    "SELECT id FROM peer_snapshots WHERE ticker = ? AND absoluteValueUse NOT LIKE '%metadata_only%'",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  );
  peerMisuse.length === 0 ? pass("peer_snapshots", "research_only_policy", "Research-only peer data is metadata-only, not direct valuation input.") : fail("peer_snapshots", "research_only_policy", `${peerMisuse.length} peer rows are directly usable.`, "Mark research-only rows metadata-only.");

  const transcriptReady = count("transcript_extractions", "ticker = 'GILD' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptReady === 0 ? pass("transcript_extractions", "modelReady", "Transcript candidates are modelReady=false and valuationImpactAllowed=false.") : fail("transcript_extractions", "modelReady", `${transcriptReady} transcript rows are model-ready.`, "Keep transcripts display-only until promoted.");

  const missingTranscriptBad = query(
    "SELECT id FROM transcript_events WHERE ticker = ? AND transcriptImported = 0 AND (missingReason IS NULL OR sourceUrlChecked IS NULL OR retrievalDate IS NULL OR confidence IS NULL)",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  );
  missingTranscriptBad.length === 0 && count("transcript_events") >= eventCount
    ? pass("transcript_events", "missing_flags", "Missing transcript quarters are explicitly flagged with reason/source/date/confidence.")
    : fail("transcript_events", "missing_flags", `${missingTranscriptBad.length} missing transcript rows lack metadata.`, "Populate missing transcript metadata; do not invent Q&A.");

  const guidancePromoted = count("guidance_items", "ticker = 'GILD' AND guidanceType = 'candidate' AND valuationImpactAllowed != 0");
  guidancePromoted === 0 ? pass("guidance_items", "valuationImpactAllowed", "Guidance candidates are valuationImpactAllowed=false unless promoted.") : fail("guidance_items", "valuationImpactAllowed", `${guidancePromoted} candidate guidance rows are valuation-impacting.`, "Demote guidance candidates or add reviewed forecast assumptions.");

  const badPatent = query(
    "SELECT id FROM patent_exclusivity_events WHERE ticker = ? AND valuationImpactAllowed = 1 AND (sourceDocumentId IS NULL OR estimatedLoeYear IS NULL OR exposedRevenue IS NULL OR erosionCurveJson IS NULL OR confidence IS NULL)",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  );
  badPatent.length === 0 && count("patent_exclusivity_events") > 0 ? pass("patent_exclusivity_events", "required_fields", "Patent assumptions include source, LOE year, exposed revenue, erosion curve and confidence.") : fail("patent_exclusivity_events", "required_fields", `${badPatent.length} patent rows missing fields.`, "Populate patent assumption fields.");

  const badPipeline = query(
    "SELECT id FROM pipeline_assets WHERE ticker = ? AND valuationImpactAllowed = 1 AND (sourceDocumentId IS NULL OR phase IS NULL OR probabilityOfSuccess IS NULL OR launchYear IS NULL OR peakSalesOrEconomicsEstimate IS NULL)",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  );
  badPipeline.length === 0 && count("pipeline_assets") > 0 ? pass("pipeline_assets", "valuation_ready_fields", "Valuation-impact pipeline assets include source, phase, POS, launch year and peak economics.") : fail("pipeline_assets", "valuation_ready_fields", `${badPipeline.length} pipeline rows missing fields.`, "Populate pipeline valuation-ready fields.");

  const badRnpv = query(
    "SELECT id, probabilityOfSuccess, peakSalesOrEconomicsEstimate, margin, rnpv FROM pipeline_rnpv_components WHERE ticker = ?",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  ).filter((row) => Number(row.rnpv) > Number(row.peakSalesOrEconomicsEstimate) * Number(row.margin) * 4.5 + 1 || Number(row.probabilityOfSuccess) <= 0 || Number(row.probabilityOfSuccess) > 1);
  badRnpv.length === 0 && count("pipeline_rnpv_components") > 0 ? pass("pipeline_rnpv_components", "probability_adjusted", "Pipeline rNPV components are probability-adjusted.") : fail("pipeline_rnpv_components", "probability_adjusted", `${badRnpv.length} bad rNPV rows.`, "Apply POS and discounting to pipeline rNPV.");

  const noCarveout = latestBaseRuns.filter((row) => parseJson(row.dataSnapshotJson, {})?.launchedFranchiseVsPipeline?.pipelineCarvedOutOfSotp !== true);
  noCarveout.length === 0 ? pass("valuation_runs", "franchise_pipeline_carveout", "Launched franchise value is carved out from pipeline optionality.") : fail("valuation_runs", "franchise_pipeline_carveout", `${noCarveout.length} runs lack carve-out marker.`, "Persist launchedFranchiseVsPipeline.");

  const modelMethodSum = GILD_BACKEND_MODEL_VERSION.valuationMethods.reduce((total, method) => total + method.weight, 0);
  const badWeights = query("SELECT id, assumptionsJson FROM assumption_sets WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH).filter((row) => {
    const weights = parseJson(row.assumptionsJson, {})?.methodWeights;
    const sum = weights ? Object.values(weights).reduce((total, value) => total + Number(value), 0) : NaN;
    return !Number.isFinite(sum) || Math.abs(sum - 1) > 0.0001;
  });
  Math.abs(modelMethodSum - 1) < 0.0001 && badWeights.length === 0 ? pass("assumption_sets/model_versions", "valuation_weights", "Valuation weights sum to 100%.") : fail("assumption_sets/model_versions", "valuation_weights", "Weights do not sum to 100%.", "Normalize method weights.");

  const pipelineDominant = latestBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const ratio = Number(snapshot.launchedFranchiseVsPipeline?.pipelineRnpvPerShare ?? 0) * 0.1 / Math.max(Number(row.fairValue), 1);
    const warnings = parseJson(row.warningsJson, []);
    return ratio > 0.25 && !warnings.some((warning) => /pipeline/i.test(`${warning.title} ${warning.detail}`));
  });
  pipelineDominant.length === 0 ? pass("valuation_runs", "pipeline_dominance_warning", "Pipeline rNPV does not dominate fair value without warning.") : warn("valuation_runs", "pipeline_dominance_warning", `${pipelineDominant.length} high-pipeline runs lack warning.`, "Add explicit warning or lower pipeline contribution.");

  const dividendWeightBad = query(
    "SELECT id, methodOutputsJson, warningsJson FROM valuation_runs WHERE ticker = ?",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  ).filter((row) => {
    const methods = parseJson(row.methodOutputsJson, []);
    const dividend = methods.find((method) => method.key === "dividend_support");
    const warnings = parseJson(row.warningsJson, []);
    return Number(dividend?.weight ?? 0) > 0.051 || !warnings.some((warning) => /double-counting/i.test(`${warning.detail}`));
  });
  dividendWeightBad.length === 0 ? pass("valuation_runs", "dividend_double_count", "Dividend support overlay is capped at 5% and carries double-count disclosure.") : fail("valuation_runs", "dividend_double_count", `${dividendWeightBad.length} valuation rows fail dividend overlay policy.`, "Keep dividend overlay small and disclose no double-count policy.");

  const frontendBad = latestBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return !finite(row.currentPrice)
      || !finite(row.fairValue)
      || !snapshot.reportingEventId
      || !snapshot.marketSnapshotId
      || !snapshot.valuationPeriodId
      || !finite(snapshot.franchiseScores?.hivDurabilityScore)
      || !finite(snapshot.franchiseScores?.patentCliffScore)
      || !finite(snapshot.franchiseScores?.oncologyOptionalityScore);
  });
  frontendBad.length === 0 ? pass("valuation_runs", "frontend_required_fields", "Frontend-required fields and GILD scores exist.") : fail("valuation_runs", "frontend_required_fields", `${frontendBad.length} runs lack frontend fields.`, "Persist score fields in dataSnapshotJson.");

  try {
    const backtest = runGildBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const requiredMetricPaths = [
      ["stock", "cagr"],
      ["stock", "maxDrawdown"],
      ["stock", "sharpe"],
      ["stock", "volatility"],
      ["spy", "cagr"],
      ["spy", "maxDrawdown"],
      ["spy", "sharpe"],
      ["spy", "volatility"],
    ];
    const finiteMetrics = requiredMetricPaths.every(([bucket, key]) => finite(backtest.metrics?.[bucket]?.[key]));
    backtest.status === "completed" && finiteMetrics
      ? pass("backtest_runs", "gild_vs_spy_metrics", `Backtest endpoint returned finite GILD/SPY metrics across ${backtest.priceBars?.overlap ?? 0} overlapping sessions.`)
      : fail("backtest_runs", "gild_vs_spy_metrics", `status=${backtest.status}; warnings=${JSON.stringify(backtest.warnings ?? [])}`, "Import GILD and SPY daily prices.");
  } catch (error) {
    fail("backtest_runs", "gild_vs_spy_metrics", error instanceof Error ? error.message : String(error), "Fix GILD backtest service or price data.");
  }

  const warningRows = count("validation_warnings");
  warningRows > 0 ? warn("validation_warnings", "known_data_gaps", `${warningRows} known data-gap warnings are persisted.`) : pass("validation_warnings", "known_data_gaps", "No validation warnings persisted.");

  printAndExit();
}

function printAndExit() {
  const totals = {
    PASS: results.filter((row) => row.status === "PASS").length,
    WARNING: results.filter((row) => row.status === "WARNING").length,
    FAIL: results.filter((row) => row.status === "FAIL").length,
  };

  for (const result of results) {
    const detail = result.suggestedFix ? `${result.reason} Suggested fix: ${result.suggestedFix}` : result.reason;
    console.log(`${result.status}: ${result.table} | ${result.field} | ${detail}`);
  }
  console.log("");
  console.log(`PASS: ${totals.PASS}`);
  console.log(`WARNING: ${totals.WARNING}`);
  console.log(`FAIL: ${totals.FAIL}`);
  process.exit(totals.FAIL > 0 ? 1 : 0);
}

runValidation().catch((error) => {
  fail("gild_backend_validation.mjs", "crash", error instanceof Error ? error.stack ?? error.message : String(error), "Fix validation script or data shape.");
  printAndExit();
});
