#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { query } from "../apps/api/src/db/client.mjs";
import { runRtxBacktest } from "../apps/api/src/services/rtxBacktestService.mjs";
import { createRtxValuationRun } from "../apps/api/src/services/rtxValuationService.mjs";
import { RTX_BACKEND_DB_PATH, RTX_BACKEND_TABLES } from "../modules/rtx/db/schema.mjs";
import { RTX_BACKEND_MODEL_VERSION } from "../modules/rtx/valuation/modelVersion.mjs";

const TICKER = "RTX";
const MODEL_VERSION = RTX_BACKEND_MODEL_VERSION.version;
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

function count(table, where = "ticker = 'RTX'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], RTX_BACKEND_DB_PATH)[0]?.count ?? 0;
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

function expectedQuarterIds() {
  const ids = [];
  for (let year = 2018; year <= 2026; year += 1) {
    const lastQuarter = year === 2026 ? 1 : 4;
    for (let quarter = 1; quarter <= lastQuarter; quarter += 1) {
      ids.push(`rtx-cy${year}-q${quarter}`);
    }
  }
  return ids;
}

function runNpmCheck(scriptName, title) {
  const result = spawnSync("npm", ["run", scriptName], {
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status === 0) {
    pass(title, `npm run ${scriptName}`);
  } else {
    fail(title, (result.stderr || result.stdout || `npm run ${scriptName} failed`).slice(0, 2000));
  }
}

async function main() {
  console.log("RTX Backend Validation");

  if (!existsSync(RTX_BACKEND_DB_PATH)) {
    fail("DB file exists", `${RTX_BACKEND_DB_PATH} is missing. Run npm run rtx:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", RTX_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], RTX_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of RTX_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run rtx:backend:seed to apply migrations.");
  }

  const events = query(
    "SELECT id, eventDate, fiscalPeriod, fiscalYear, fiscalQuarter, eventType, sourceType FROM reporting_events WHERE ticker = ? ORDER BY eventDate, id",
    [TICKER],
    RTX_BACKEND_DB_PATH,
  );
  const eventIds = new Set(events.map((row) => row.id));
  const missingPeriods = expectedQuarterIds().filter((id) => !eventIds.has(id));
  events.length >= 33 && missingPeriods.length === 0
    ? pass("Eight-year quarterly reporting event coverage", `${events.length} events, CY2018 Q1 through CY2026 Q1`)
    : fail("Eight-year quarterly reporting event coverage", `Found ${events.length}; missing ${missingPeriods.join(", ") || "none"}`);

  const eventTypeMismatch = events.filter((row) => !/^q[1-4]_results$/.test(row.eventType));
  eventTypeMismatch.length === 0
    ? pass("Quarter event types are normalized", "q1_results/q2_results/q3_results/q4_results")
    : fail("Quarter event types are normalized", JSON.stringify(eventTypeMismatch));

  const comparabilityWarnings = query(
    "SELECT id, detail FROM validation_warnings WHERE ticker = ? AND id IN ('rtx-merger-comparability-warning', 'rtx-research-only-quarter-warning')",
    [TICKER],
    RTX_BACKEND_DB_PATH,
  );
  comparabilityWarnings.length === 2
    ? pass("Merger and segment taxonomy limitations are documented", comparabilityWarnings.map((row) => row.id).join(", "))
    : fail("Merger and segment taxonomy limitations are documented", "Expected RTX merger/research-only validation warnings.");

  const officialFinancialRows = count("financial_periods", "ticker = 'RTX' AND sourceType = 'official_actual'");
  officialFinancialRows >= 2
    ? pass("Official actual rows are separated", `${officialFinancialRows} rows promoted as official_actual`)
    : fail("Official actual rows are separated", "Expected FY2025 and Q1 2026 official rows.");

  const researchOnlyRows = count("financial_periods", "ticker = 'RTX' AND sourceType = 'research_only'");
  researchOnlyRows > 0
    ? pass("Research-only continuity rows are explicitly marked", `${researchOnlyRows} rows`)
    : fail("Research-only continuity rows are explicitly marked", "Older proxy/interpolated rows must not look official.");

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", "No RTX market snapshots found.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('RTX', 'SPY') GROUP BY ticker ORDER BY ticker",
    [],
    RTX_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const rtxPriceBars = priceBarMap.get("RTX");
  const spyPriceBars = priceBarMap.get("SPY");
  rtxPriceBars?.count >= 2000
    ? pass("RTX daily price bars imported", `${rtxPriceBars.count} rows, ${rtxPriceBars.firstDate} to ${rtxPriceBars.lastDate}; ${rtxPriceBars.source}`)
    : fail("RTX daily price bars imported", "Run npm run rtx:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}; ${spyPriceBars.source}`)
    : fail("SPY daily price bars imported", "Run npm run rtx:backend:import-prices.");

  const unadjustedSources = priceBars.filter((row) => String(row.sourceType).includes("unadjusted"));
  if (unadjustedSources.length) {
    warn("Adjusted-close source limitation", JSON.stringify(unadjustedSources));
  } else {
    pass("Adjusted close available for imported price bars", "No ticker-level unadjusted fallback source detected.");
  }

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No RTX model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    RTX_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) >= events.length
      ? pass(`Event-dated assumption sets exist: ${scenario}`, `${scenarioMap.get(scenario)} rows`)
      : fail(`Event-dated assumption sets exist: ${scenario}`, `Found ${scenarioMap.get(scenario) ?? 0}/${events.length}.`);
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", [TICKER], RTX_BACKEND_DB_PATH)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate}, ${latestEvent.eventType})`);
    try {
      const valuation = await createRtxValuationRun({ eventId: latestEvent.id, scenario: "Base", modelVersion: MODEL_VERSION });
      const run = valuation.valuationRun;
      if (isFiniteNumber(run?.currentPrice) && isFiniteNumber(run?.fairValue)) {
        pass("Backend valuation run created", `currentPrice=${run.currentPrice}; fairValue=${run.fairValue}`);
      } else {
        fail("Backend valuation run created", "Valuation result did not return finite currentPrice and fairValue.");
      }
      if (isFiniteNumber(run?.targetPrice3Y) && isFiniteNumber(run?.expectedShareholderCagr)) {
        pass("Target price and CAGR persisted", `targetPrice3Y=${run.targetPrice3Y}; cagr=${run.expectedShareholderCagr}`);
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
    RTX_BACKEND_DB_PATH,
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  historicalRunEventIds.size >= events.length
    ? pass("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${events.length} events`)
    : fail("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${events.length}. Run npm run rtx:backend:backfill-valuations.`);

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
    RTX_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  finiteHistoricalRuns >= events.length
    ? pass("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${events.length} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${events.length} complete Base valuation rows.`);

  const orderedBaseRuns = query(
    `SELECT e.id, e.eventDate, e.fiscalPeriod, e.eventType, v.currentPrice, v.fairValue, v.upsideDownside, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate, e.id, v.createdAt`,
    [TICKER, MODEL_VERSION],
    RTX_BACKEND_DB_PATH,
  );
  const latestRunByEvent = new Map();
  for (const row of orderedBaseRuns) latestRunByEvent.set(row.id, row);
  const baseRuns = [...latestRunByEvent.values()].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const distinctBaseFairValues = new Set(baseRuns.map((row) => Number(row.fairValue).toFixed(2)));
  distinctBaseFairValues.size > 8
    ? pass("Historical Base fair values vary by event", `${distinctBaseFairValues.size} distinct rounded fair values`)
    : fail("Historical Base fair values vary by event", `Only ${distinctBaseFairValues.size} distinct rounded fair values.`);

  let longestFlatRun = 1;
  let currentFlatRun = 1;
  for (let index = 1; index < baseRuns.length; index += 1) {
    if (Number(baseRuns[index].fairValue).toFixed(2) === Number(baseRuns[index - 1].fairValue).toFixed(2)) {
      currentFlatRun += 1;
      longestFlatRun = Math.max(longestFlatRun, currentFlatRun);
    } else {
      currentFlatRun = 1;
    }
  }
  longestFlatRun <= 2
    ? pass("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}`)
    : fail("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}.`);

  const futureRows = [];
  const badPriceRows = [];
  const earlyLeakageRows = [];
  const badUpsideRows = [];
  for (const row of baseRuns) {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    for (const rows of Object.values(snapshot.rowUsage ?? {})) {
      for (const used of rows ?? []) {
        if (used.asOfDate && used.asOfDate > row.eventDate) {
          futureRows.push({ eventId: row.id, tableRow: used });
        }
      }
    }
    const priceDate = snapshot.asOfPriceSource?.priceDate;
    if (priceDate && priceDate > row.eventDate) {
      badPriceRows.push({ eventId: row.id, priceDate, eventDate: row.eventDate });
    }
    if (row.eventDate < "2023-09-01") {
      if ((snapshot.gtfInspectionCharges ?? 0) !== 0 || (snapshot.gtfCashImpact ?? 0) !== 0) {
        earlyLeakageRows.push({ eventId: row.id, gtfInspectionCharges: snapshot.gtfInspectionCharges, gtfCashImpact: snapshot.gtfCashImpact });
      }
    }
    if (row.eventDate < "2020-04-01") {
      const usesCurrentTaxonomy = (snapshot.segmentTaxonomy ?? []).includes("rtx_current");
      if ((snapshot.annualizedSales ?? 0) > 80000 || usesCurrentTaxonomy) {
        earlyLeakageRows.push({ eventId: row.id, annualizedSales: snapshot.annualizedSales, segmentTaxonomy: snapshot.segmentTaxonomy });
      }
    }
    const expectedUpside = row.currentPrice && row.fairValue ? row.fairValue / row.currentPrice - 1 : null;
    if (expectedUpside == null || Math.abs(expectedUpside - row.upsideDownside) > 0.001) {
      badUpsideRows.push({ eventId: row.id, currentPrice: row.currentPrice, fairValue: row.fairValue, upsideDownside: row.upsideDownside });
    }
  }
  futureRows.length === 0
    ? pass("No future data leakage in valuation row usage", `${baseRuns.length} Base data snapshots checked`)
    : fail("No future data leakage in valuation row usage", JSON.stringify(futureRows.slice(0, 5)));
  badPriceRows.length === 0
    ? pass("Historical priceDate is on or before eventDate", `${baseRuns.length} Base runs checked`)
    : fail("Historical priceDate is on or before eventDate", JSON.stringify(badPriceRows.slice(0, 5)));
  earlyLeakageRows.length === 0
    ? pass("Old years do not use latest RTX scale, GTF assumptions, or current segment taxonomy")
    : fail("Old years do not use latest RTX scale, GTF assumptions, or current segment taxonomy", JSON.stringify(earlyLeakageRows.slice(0, 8)));
  badUpsideRows.length === 0
    ? pass("Historical upside/downside uses fair value versus event price")
    : fail("Historical upside/downside uses fair value versus event price", JSON.stringify(badUpsideRows.slice(0, 5)));

  const priceAnchorRows = query(
    `SELECT e.id, e.eventDate, v.currentPrice,
            (SELECT p.adjustedClose FROM daily_price_bars p WHERE p.ticker = 'RTX' AND p.priceDate <= e.eventDate ORDER BY p.priceDate DESC LIMIT 1) AS adjustedClose,
            (SELECT p.priceDate FROM daily_price_bars p WHERE p.ticker = 'RTX' AND p.priceDate <= e.eventDate ORDER BY p.priceDate DESC LIMIT 1) AS priceDate
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate`,
    [TICKER, MODEL_VERSION],
    RTX_BACKEND_DB_PATH,
  );
  const badAnchors = priceAnchorRows.filter((row) => row.adjustedClose != null && Math.abs(Number(row.currentPrice) - Number(row.adjustedClose)) > 0.02);
  badAnchors.length === 0
    ? pass("Historical as-of price uses nearest prior daily market data", `${priceAnchorRows.length} valuation rows checked`)
    : fail("Historical as-of price uses nearest prior daily market data", JSON.stringify(badAnchors.slice(0, 5)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'RTX' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are not model-ready")
    : fail("Transcript candidates are not model-ready", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'RTX' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed', 'reviewed_not_promoted'))",
  );
  guidanceCandidatesPromoted === 0
    ? pass("Guidance candidates are not valuation-impacting")
    : fail("Guidance candidates are not valuation-impacting", `${guidanceCandidatesPromoted} guidance rows allow valuation impact without promotion.`);

  const mixedCurrencyPeerMisuse = query(
    `SELECT peerTicker, currency, absoluteValueUse
     FROM peer_snapshots
     WHERE ticker = ?
       AND currency IS NOT NULL
       AND currency != 'USD'
       AND (absoluteValueUse IS NULL OR absoluteValueUse NOT LIKE '%metadata_only%')`,
    [TICKER],
    RTX_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only across mixed currencies")
    : fail("Peer absolute values are metadata-only across mixed currencies", JSON.stringify(mixedCurrencyPeerMisuse));

  try {
    const backtest = runRtxBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const rtxMetrics = backtest.metrics?.rtxBuyHold;
    const spyMetrics = backtest.metrics?.spy;
    backtest.status === "completed" &&
      backtest.curve?.length >= 2000 &&
      isFiniteNumber(rtxMetrics?.cagr) &&
      isFiniteNumber(rtxMetrics?.maxDrawdown) &&
      isFiniteNumber(rtxMetrics?.sharpe) &&
      isFiniteNumber(rtxMetrics?.volatility) &&
      isFiniteNumber(spyMetrics?.cagr) &&
      isFiniteNumber(spyMetrics?.maxDrawdown) &&
      isFiniteNumber(spyMetrics?.sharpe) &&
      isFiniteNumber(spyMetrics?.volatility)
      ? pass("RTX vs SPY backtest returns finite metrics", `curve=${backtest.curve.length}; rtxCagr=${rtxMetrics.cagr}; spyCagr=${spyMetrics.cagr}`)
      : fail("RTX vs SPY backtest returns finite metrics", JSON.stringify(backtest).slice(0, 1200));
  } catch (error) {
    fail("RTX vs SPY backtest returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  if (process.argv.includes("--with-typecheck")) {
    runNpmCheck("typecheck", "Frontend typecheck still passes");
  } else {
    warn("Frontend typecheck", "Skipped by default; final verification runs npm run typecheck.");
  }
  if (process.argv.includes("--with-build")) {
    runNpmCheck("build", "Frontend build still passes");
  } else {
    warn("Frontend build", "Skipped by default; final verification runs npm run build.");
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
