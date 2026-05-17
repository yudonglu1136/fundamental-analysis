#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { query } from "../apps/api/src/db/client.mjs";
import { runTriBacktest } from "../apps/api/src/services/triBacktestService.mjs";
import { getTriCapitalReturnHistory } from "../apps/api/src/services/triSnapshotService.mjs";
import { TRI_BACKEND_DB_PATH, TRI_BACKEND_TABLES } from "../modules/tri/db/schema.mjs";
import { TRI_BACKEND_MODEL_VERSION } from "../modules/tri/valuation/modelVersion.mjs";

const TICKER = "TRI";
const MODEL_VERSION = TRI_BACKEND_MODEL_VERSION.version;
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

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function count(table, where = "ticker = 'TRI'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], TRI_BACKEND_DB_PATH)[0]?.count ?? 0;
}

function getApiJsonWithCurl(path, priorReason = "http_unavailable") {
  const result = spawnSync("curl", ["-s", `http://127.0.0.1:8787${path}`], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return { ok: false, skipped: true, reason: `${priorReason}; curl_status_${result.status}` };
  }
  try {
    return { ok: true, statusCode: 200, body: JSON.parse(result.stdout || "{}"), fallback: "curl" };
  } catch (error) {
    return { ok: false, statusCode: 200, error: error instanceof Error ? error.message : String(error), fallback: "curl" };
  }
}

function getApiJson(path) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:8787${path}`, { timeout: 1000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            statusCode: response.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"),
          });
        } catch (error) {
          resolve({ ok: false, statusCode: response.statusCode, error: error instanceof Error ? error.message : String(error) });
        }
      });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(getApiJsonWithCurl(path, "timeout"));
    });
    request.on("error", (error) => resolve(getApiJsonWithCurl(path, error.code ?? error.message)));
  });
}

function expectedQuarterIds() {
  const ids = [];
  for (let fiscalYear = 2018; fiscalYear <= 2026; fiscalYear += 1) {
    const maxQuarter = fiscalYear === 2026 ? 1 : 4;
    for (let quarter = 1; quarter <= maxQuarter; quarter += 1) {
      ids.push(`tri-q${quarter}-${fiscalYear}`);
    }
  }
  return ids;
}

function firstFutureRow(rows = [], asOfDate, fields = ["asOfDate", "eventDate", "priceDate"]) {
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const field of fields) {
      const value = row[field];
      if (typeof value === "string" && value.slice(0, 10) > asOfDate) {
        return { row, field, value };
      }
    }
  }
  return null;
}

function printAndExit() {
  for (const check of checks) {
    const suffix = check.detail ? ` - ${check.detail}` : "";
    console.log(`${check.status}: ${check.title}${suffix}`);
  }
  const failed = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARNING");
  console.log(JSON.stringify({
    status: failed.length ? "failed" : "passed",
    failures: failed.length,
    warnings: warnings.length,
    dbPath: TRI_BACKEND_DB_PATH,
  }, null, 2));
  if (failed.length) process.exitCode = 1;
}

async function main() {
  console.log("TRI Backend Validation");

  if (!existsSync(TRI_BACKEND_DB_PATH)) {
    fail("DB file exists", `${TRI_BACKEND_DB_PATH} is missing. Run npm run tri:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", TRI_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], TRI_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of TRI_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run tri:backend:seed.");
  }
  tables.has("daily_price_bars")
    ? pass("Table exists: daily_price_bars")
    : fail("Table missing: daily_price_bars", "Run npm run tri:backend:import-prices.");

  const rowCounts = Object.fromEntries(TRI_BACKEND_TABLES.map((table) => [table, tables.has(table) ? count(table, table === "daily_price_bars" ? "ticker IN ('TRI','SPY')" : "ticker = 'TRI'") : 0]));
  pass("DB row counts", JSON.stringify(rowCounts));

  const events = query(
    `SELECT id, eventDate, fiscalPeriod, fiscalYear, fiscalQuarter, eventType, sourceType, sourceUrl
     FROM reporting_events
     WHERE ticker = ?
     ORDER BY eventDate ASC, id ASC`,
    [TICKER],
    TRI_BACKEND_DB_PATH,
  );
  const expectedIds = expectedQuarterIds();
  const eventIds = new Set(events.map((event) => event.id));
  const missingIds = expectedIds.filter((id) => !eventIds.has(id));
  const eightYearSpan = events[0]?.eventDate <= "2018-05-05" && events[events.length - 1]?.eventDate >= "2026-05-05";
  if (events.length >= expectedIds.length && missingIds.length === 0 && eightYearSpan) {
    pass("Eight-year quarterly reporting-event coverage", `${events.length} events, ${events[0]?.eventDate} to ${events[events.length - 1]?.eventDate}`);
  } else {
    warn(
      "Eight-year quarterly reporting-event coverage has gaps",
      `found=${events.length}; missing=${missingIds.join(", ") || "none"}; first=${events[0]?.eventDate ?? "n/a"}; latest=${events[events.length - 1]?.eventDate ?? "n/a"}`,
    );
  }

  const officialActualEvents = events.filter((event) => event.sourceType === "official_actual");
  const researchOnlyEvents = events.filter((event) => event.sourceType === "research_only");
  officialActualEvents.length
    ? pass("Official actual events imported", `${officialActualEvents.length} official event(s): ${officialActualEvents.map((event) => event.id).join(", ")}`)
    : fail("Official actual events imported", "No official TRI reporting events found.");
  researchOnlyEvents.length
    ? warn("Research-only historical events present", `${researchOnlyEvents.length} quarterly rows are proxy/research-only until official TRI documents are imported.`)
    : pass("Research-only historical events present", "No proxy reporting events found.");

  count("market_snapshots") > 0
    ? pass("Market snapshots imported", `${count("market_snapshots")} rows`)
    : fail("Market snapshots imported", "No TRI market snapshots found.");
  count("model_versions") > 0
    ? pass("Model versions imported", `${count("model_versions")} rows`)
    : fail("Model versions imported", "No TRI model version row found.");
  count("assumption_sets") > 0
    ? pass("Assumption sets imported", `${count("assumption_sets")} rows`)
    : fail("Assumption sets imported", "No TRI assumption sets found.");

  const annualRows = query(
    `SELECT fiscalYear, periodId, sourceType, dividendsPaid, buybacks, freeCashFlow, dilutedShares
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'annual'
       AND fiscalYear IS NOT NULL
     ORDER BY fiscalYear ASC`,
    [TICKER],
    TRI_BACKEND_DB_PATH,
  );
  annualRows.length >= 8
    ? pass("Annual financial_periods rows exist", `${annualRows.length} annual rows, FY${annualRows[0]?.fiscalYear}-FY${annualRows[annualRows.length - 1]?.fiscalYear}`)
    : fail("Annual financial_periods rows exist", `${annualRows.length} annual rows found; capital-return panel needs at least 8.`);

  const priceBars = query(
    `SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate,
            GROUP_CONCAT(DISTINCT source) AS sources,
            SUM(CASE WHEN sourceType = 'market_data_unadjusted_or_close_fallback' THEN 1 ELSE 0 END) AS fallbackRows
     FROM daily_price_bars
     WHERE ticker IN ('TRI', 'SPY')
     GROUP BY ticker`,
    [],
    TRI_BACKEND_DB_PATH,
  );
  const priceMap = new Map(priceBars.map((row) => [row.ticker, row]));
  for (const ticker of ["TRI", "SPY"]) {
    const row = priceMap.get(ticker);
    row?.count >= 1500
      ? pass(`${ticker} daily price bars imported`, `${row.count} rows, ${row.firstDate} to ${row.lastDate}; source=${row.sources}`)
      : fail(`${ticker} daily price bars imported`, "Run npm run tri:backend:import-prices.");
    if (row?.fallbackRows > 0) {
      warn(`${ticker} adjusted close fallback rows`, `${row.fallbackRows} rows used close as adjustedClose.`);
    }
  }

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    TRI_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0
      ? pass(`Assumption set exists: ${scenario}`, `${scenarioMap.get(scenario)} rows`)
      : fail(`Assumption set missing: ${scenario}`, "Seed must create Bear/Base/Bull TRI defaults.");
  }

  const baseRuns = query(
    `SELECT v.*, e.eventDate, e.fiscalYear, e.fiscalQuarter, e.eventType
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate ASC, e.id ASC, v.createdAt DESC`,
    [TICKER, MODEL_VERSION],
    TRI_BACKEND_DB_PATH,
  );
  const latestBaseByEvent = new Map();
  for (const run of baseRuns) {
    if (!latestBaseByEvent.has(run.reportingEventId)) latestBaseByEvent.set(run.reportingEventId, run);
  }
  const missingBaseEvents = events.map((event) => event.id).filter((eventId) => !latestBaseByEvent.has(eventId));
  missingBaseEvents.length === 0
    ? pass("Historical Base valuations exist for each quarterly event", `${latestBaseByEvent.size}/${events.length} events`)
    : fail("Historical Base valuations exist for each quarterly event", `Missing ${missingBaseEvents.join(", ")}. Run npm run tri:backend:backfill-valuations -- --base-only.`);

  const latestBaseRuns = Array.from(latestBaseByEvent.values());
  const incompleteRuns = latestBaseRuns.filter((run) => !isFiniteNumber(numberOrNull(run.currentPrice)) || !isFiniteNumber(numberOrNull(run.fairValue)) || !isFiniteNumber(numberOrNull(run.targetPrice3Y)) || !isFiniteNumber(numberOrNull(run.expectedShareholderCagr)));
  incompleteRuns.length === 0
    ? pass("Historical valuation output fields are finite", `${latestBaseRuns.length} latest Base runs checked`)
    : fail("Historical valuation output fields are finite", `Incomplete runs: ${incompleteRuns.map((run) => run.reportingEventId).join(", ")}`);

  const distinctFairValues = new Set(latestBaseRuns.map((run) => Number(run.fairValue).toFixed(2)));
  distinctFairValues.size > 5
    ? pass("Historical fair values vary by event", `${distinctFairValues.size} distinct rounded Base fair values`)
    : fail("Historical fair values vary by event", `Only ${distinctFairValues.size} distinct rounded Base fair values.`);
  let longestFlatRun = 1;
  let currentFlatRun = 1;
  for (let index = 1; index < latestBaseRuns.length; index += 1) {
    if (Number(latestBaseRuns[index].fairValue).toFixed(2) === Number(latestBaseRuns[index - 1].fairValue).toFixed(2)) {
      currentFlatRun += 1;
      longestFlatRun = Math.max(longestFlatRun, currentFlatRun);
    } else {
      currentFlatRun = 1;
    }
  }
  longestFlatRun <= 3
    ? pass("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}`)
    : fail("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}`);

  const futureLeakage = [];
  const staleScaleLeakage = [];
  const dailyPriceMismatches = [];
  for (const run of latestBaseRuns) {
    const asOfDate = run.asOfDate;
    const snapshot = parseJson(run.dataSnapshotJson, {});
    const collections = [
      ["financialPeriods", snapshot.financialPeriods],
      ["segmentFinancials", snapshot.segmentFinancials],
      ["peerSnapshots", snapshot.peerSnapshots],
      ["guidanceItems", snapshot.guidanceItems],
      ["transcriptEvents", snapshot.transcriptEvents],
      ["sourceDocuments", snapshot.sourceDocuments, ["publishedDate", "retrievedAt"]],
      ["assumptionSets", snapshot.assumptionSets],
    ];
    for (const [name, rows, fields] of collections) {
      const future = firstFutureRow(Array.isArray(rows) ? rows : [], asOfDate, fields);
      if (future) futureLeakage.push(`${run.reportingEventId}:${name}.${future.field}=${future.value}`);
    }
    const marketFuture = firstFutureRow(snapshot.marketSnapshot ? [snapshot.marketSnapshot] : [], asOfDate);
    if (marketFuture) futureLeakage.push(`${run.reportingEventId}:marketSnapshot.${marketFuture.field}=${marketFuture.value}`);
    const priceSource = snapshot.asOfPriceSource;
    if (priceSource?.priceDate && priceSource.priceDate > run.eventDate) {
      futureLeakage.push(`${run.reportingEventId}:asOfPriceSource.priceDate=${priceSource.priceDate}`);
    }
    if (run.fiscalYear <= 2020) {
      const futureScaleRows = (snapshot.financialPeriods ?? []).filter((row) => Number(row.fiscalYear) > Number(run.fiscalYear));
      if (futureScaleRows.length) staleScaleLeakage.push(`${run.reportingEventId}:${futureScaleRows.map((row) => row.periodId).join(",")}`);
    }
    const dailyBar = query(
      `SELECT priceDate, adjustedClose
       FROM daily_price_bars
       WHERE ticker = ? AND priceDate <= ?
       ORDER BY priceDate DESC
       LIMIT 1`,
      [TICKER, run.eventDate],
      TRI_BACKEND_DB_PATH,
    )[0] ?? null;
    if (dailyBar) {
      const currentPrice = Number(run.currentPrice);
      const adjustedClose = Number(dailyBar.adjustedClose);
      if (dailyBar.priceDate > run.eventDate || Math.abs(currentPrice - adjustedClose) > Math.max(0.02, adjustedClose * 0.001)) {
        dailyPriceMismatches.push(`${run.reportingEventId}:run=${currentPrice}, bar=${adjustedClose}, date=${dailyBar.priceDate}`);
      }
    }
  }
  futureLeakage.length === 0
    ? pass("No future-dated rows in valuation snapshots", `${latestBaseRuns.length} Base snapshots checked`)
    : fail("No future-dated rows in valuation snapshots", futureLeakage.slice(0, 10).join("; "));
  staleScaleLeakage.length === 0
    ? pass("Old years do not use later financial scale", "FY2018-FY2020 Base snapshots checked")
    : fail("Old years do not use later financial scale", staleScaleLeakage.slice(0, 10).join("; "));
  dailyPriceMismatches.length === 0
    ? pass("Historical as-of price uses nearest prior TRI daily price", `${latestBaseRuns.length} Base runs checked`)
    : fail("Historical as-of price uses nearest prior TRI daily price", dailyPriceMismatches.slice(0, 10).join("; "));

  const methodCompressionIssues = [];
  for (const run of latestBaseRuns) {
    const methods = parseJson(run.methodOutputsJson, []);
    const byLabel = new Map(methods.map((row) => [row.label, Number(row.value)]));
    const dcf = byLabel.get("FCFF DCF");
    const evEbitda = byLabel.get("EV/EBITDA");
    const pe = byLabel.get("P/E");
    const sotp = byLabel.get("SOTP");
    if (Number.isFinite(dcf) && Number.isFinite(pe) && pe < dcf * 0.35) {
      methodCompressionIssues.push(`${run.reportingEventId}: P/E=${pe.toFixed(2)} vs DCF=${dcf.toFixed(2)}`);
    }
    if (Number.isFinite(evEbitda) && Number.isFinite(sotp) && sotp < evEbitda * 0.30) {
      methodCompressionIssues.push(`${run.reportingEventId}: SOTP=${sotp.toFixed(2)} vs EV/EBITDA=${evEbitda.toFixed(2)}`);
    }
  }
  methodCompressionIssues.length === 0
    ? pass("Historical method outputs are annualized", "P/E and SOTP are not suspiciously compressed versus DCF/EV-EBITDA.")
    : fail("Historical method outputs are annualized", methodCompressionIssues.slice(0, 12).join("; "));

  const badTranscriptRows = query(
    "SELECT id FROM transcript_extractions WHERE ticker = ? AND (modelReady != 0 OR valuationImpactAllowed != 0)",
    [TICKER],
    TRI_BACKEND_DB_PATH,
  );
  badTranscriptRows.length === 0
    ? pass("Transcript candidates remain research-only", "modelReady=false and valuationImpactAllowed=false")
    : fail("Transcript candidates remain research-only", badTranscriptRows.map((row) => row.id).join(", "));

  const badGuidanceRows = query(
    "SELECT id FROM guidance_items WHERE ticker = ? AND guidanceType = 'candidate' AND valuationImpactAllowed != 0",
    [TICKER],
    TRI_BACKEND_DB_PATH,
  );
  badGuidanceRows.length === 0
    ? pass("Guidance candidates are not valuation-promoted", "valuationImpactAllowed=false")
    : fail("Guidance candidates are not valuation-promoted", badGuidanceRows.map((row) => row.id).join(", "));

  const mixedCurrencyPeerRows = query(
    `SELECT peerGroup, COUNT(DISTINCT currency) AS currencies,
            SUM(CASE WHEN marketCap IS NOT NULL OR enterpriseValue IS NOT NULL THEN 1 ELSE 0 END) AS absoluteRows
     FROM peer_snapshots
     WHERE ticker = ?
     GROUP BY peerGroup
     HAVING currencies > 1 AND absoluteRows > 0`,
    [TICKER],
    TRI_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerRows.length === 0
    ? pass("Peer absolute values are not aggregated across mixed currencies", "Mixed-currency peer rows keep absolute market cap and EV null.")
    : fail("Peer absolute values are not aggregated across mixed currencies", JSON.stringify(mixedCurrencyPeerRows));

  try {
    const backtest = runTriBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY" });
    const tri = backtest.metrics?.triBuyHold ?? {};
    const spy = backtest.metrics?.spy ?? {};
    const finiteBacktest = [tri.cagr, spy.cagr, tri.maxDrawdown, spy.maxDrawdown, tri.sharpe, spy.sharpe, tri.volatility, spy.volatility].every((value) => isFiniteNumber(value));
    finiteBacktest
      ? pass("Backtest returns finite TRI and SPY metrics", `TRI CAGR=${tri.cagr}; SPY CAGR=${spy.cagr}`)
      : fail("Backtest returns finite TRI and SPY metrics", JSON.stringify(backtest.warnings ?? backtest));
  } catch (error) {
    fail("Backtest returns finite TRI and SPY metrics", error instanceof Error ? error.message : String(error));
  }

  try {
    const capitalReturns = getTriCapitalReturnHistory({ years: 8 });
    const rows = capitalReturns.rows ?? [];
    const completeRows = rows.filter((row) =>
      isFiniteNumber(row.fiscalYear) &&
      isFiniteNumber(row.dividendCashCost) &&
      isFiniteNumber(row.buybackAmount) &&
      isFiniteNumber(row.totalCapitalReturn),
    );
    rows.length >= 8 && completeRows.length === rows.length
      ? pass("Backend capital-return history has 8 annual rows", `${rows[0]?.fiscalYear}-${rows[rows.length - 1]?.fiscalYear}; latest DPS=${capitalReturns.summary.latestDividendPerShare}; latest buyback=${capitalReturns.summary.latestBuybackAmount}`)
      : fail("Backend capital-return history has 8 annual rows", JSON.stringify({ rows: rows.length, completeRows: completeRows.length, warnings: capitalReturns.warnings }));

    const hasDividendAndBuyback = rows.some((row) => (row.dividendCashCost ?? 0) > 0) && rows.some((row) => (row.buybackAmount ?? 0) > 0);
    hasDividendAndBuyback
      ? pass("Backend capital-return chart has dividend and buyback series", `cumulativeDividend=${capitalReturns.summary.cumulativeDividendCash}; cumulativeBuybacks=${capitalReturns.summary.cumulativeBuybacks}`)
      : fail("Backend capital-return chart has dividend and buyback series", JSON.stringify(capitalReturns.summary));

    const forward = capitalReturns.forwardExpectation;
    forward?.isForecast === true &&
      forward.sourceType === "forecast_assumption" &&
      forward.fiscalYear === 2026 &&
      isFiniteNumber(forward.dividendCashCost) &&
      isFiniteNumber(forward.buybackAmount) &&
      isFiniteNumber(forward.totalCapitalReturn)
      ? pass("Backend capital-return history includes FY2026E forecast bar", `DPS=${forward.dividendPerShare}; dividendCash=${forward.dividendCashCost}; buyback=${forward.buybackAmount}`)
      : fail("Backend capital-return history includes FY2026E forecast bar", JSON.stringify(forward));

    const historicalDividendSum = rows.reduce((sum, row) => sum + (row.dividendCashCost ?? 0), 0);
    const historicalBuybackSum = rows.reduce((sum, row) => sum + (row.buybackAmount ?? 0), 0);
    Math.abs(historicalDividendSum - capitalReturns.summary.cumulativeDividendCash) < 0.01 &&
      Math.abs(historicalBuybackSum - capitalReturns.summary.cumulativeBuybacks) < 0.01
      ? pass("FY2026E is excluded from historical cumulative totals", `historical=${capitalReturns.summary.cumulativeCapitalReturn}; forward=${forward?.totalCapitalReturn ?? "n/a"}`)
      : fail("FY2026E is excluded from historical cumulative totals", JSON.stringify(capitalReturns.summary));

    const incompleteYears = rows
      .filter((row) => !isFiniteNumber(row.dividendCashCost) || !isFiniteNumber(row.buybackAmount))
      .map((row) => row.fiscalYear);
    incompleteYears.length === 0 || (capitalReturns.warnings ?? []).length > 0
      ? pass("Incomplete capital-return rows carry warnings", incompleteYears.length ? `warning years=${incompleteYears.join(", ")}` : "No incomplete annual rows")
      : fail("Incomplete capital-return rows carry warnings", incompleteYears.join(", "));
  } catch (error) {
    fail("Backend capital-return history has 8 annual rows", error instanceof Error ? error.message : String(error));
  }

  const apiCapitalReturn = await getApiJson("/api/stocks/tri/capital-returns?years=8");
  if (apiCapitalReturn.ok && apiCapitalReturn.body?.ticker === TICKER && Array.isArray(apiCapitalReturn.body.rows)) {
    pass("Capital-return frontend endpoint responds", `rows=${apiCapitalReturn.body.rows.length}; forward=${Boolean(apiCapitalReturn.body.forwardExpectation)}`);
  } else if (apiCapitalReturn.skipped) {
    warn("Capital-return frontend endpoint responds", `API server not running or unreachable (${apiCapitalReturn.reason}). Start it with npm run api:dev.`);
  } else {
    fail("Capital-return frontend endpoint responds", `status=${apiCapitalReturn.statusCode ?? "n/a"} error=${apiCapitalReturn.error ?? "unexpected payload"}`);
  }

  const validationWarnings = query(
    "SELECT severity, title, detail FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    TRI_BACKEND_DB_PATH,
  );
  if (validationWarnings.length) {
    warn("Seed validation warnings recorded", JSON.stringify(validationWarnings));
  } else {
    pass("Seed validation warnings recorded", "No stored validation warnings.");
  }

  printAndExit();
}

await main();
