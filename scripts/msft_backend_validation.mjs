#!/usr/bin/env node
import http from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { runMsftBacktest } from "../apps/api/src/services/msftBacktestService.mjs";
import { getMsftCapitalReturnHistory } from "../apps/api/src/services/msftSnapshotService.mjs";
import { createMsftValuationRun } from "../apps/api/src/services/msftValuationService.mjs";
import { MSFT_BACKEND_DB_PATH, MSFT_BACKEND_TABLES } from "../modules/msft/db/schema.mjs";

const TICKER = "MSFT";
const MODEL_VERSION = "msft_v1_backend_pilot";
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

function count(table, where = "ticker = 'MSFT'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], MSFT_BACKEND_DB_PATH)[0]?.count ?? 0;
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
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status === 0) {
    pass(title, `npm run ${scriptName}`);
  } else {
    fail(title, (result.stderr || result.stdout || `npm run ${scriptName} failed`).slice(0, 2000));
  }
}

async function main() {
  console.log("MSFT Backend Validation");

  if (!existsSync(MSFT_BACKEND_DB_PATH)) {
    fail("DB file exists", `${MSFT_BACKEND_DB_PATH} is missing. Run npm run msft:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", MSFT_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], MSFT_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of MSFT_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run msft:backend:seed to apply migrations.");
  }
  tables.has("daily_price_bars")
    ? pass("Table exists: daily_price_bars")
    : fail("Table missing: daily_price_bars", "Run npm run msft:backend:import-prices to apply the price-bar migration.");

  const eventCount = count("reporting_events");
  eventCount > 0 ? pass("Reporting events imported", `${eventCount} rows`) : fail("Reporting events imported", "No MSFT reporting events found.");

  const secQuarterEvents = query(
    `SELECT id, eventDate, fiscalPeriod, eventType
     FROM reporting_events
     WHERE ticker = ?
       AND id LIKE 'sec-q%-fy%'
       AND eventType IN ('q1_results', 'q2_results', 'q3_results', 'q4_results')
     ORDER BY eventDate, id`,
    [TICKER],
    MSFT_BACKEND_DB_PATH,
  );
  const earliestSecQuarter = secQuarterEvents[0];
  const latestSecQuarter = secQuarterEvents[secQuarterEvents.length - 1];
  secQuarterEvents.length >= 35 && earliestSecQuarter?.id === "sec-q1-fy18" && latestSecQuarter?.id === "sec-q3-fy26"
    ? pass("SEC quarterly history covers FY2018 Q1 through FY2026 Q3", `${secQuarterEvents.length} quarterly events`)
    : fail(
        "SEC quarterly history covers FY2018 Q1 through FY2026 Q3",
        `Found ${secQuarterEvents.length}; earliest=${earliestSecQuarter?.id ?? "n/a"}; latest=${latestSecQuarter?.id ?? "n/a"}`,
      );

  const secQuarterFinancialRows = query(
    `SELECT periodId, asOfDate, revenue, operatingIncome, freeCashFlow
     FROM financial_periods
     WHERE ticker = ?
       AND id LIKE 'msft-sec-q%-fy%'
       AND periodType = 'quarter'
     ORDER BY asOfDate, periodId`,
    [TICKER],
    MSFT_BACKEND_DB_PATH,
  );
  secQuarterFinancialRows.length >= 35 && secQuarterFinancialRows.every((row) => isFiniteNumber(row.revenue) && isFiniteNumber(row.operatingIncome))
    ? pass("SEC quarterly financial rows are model usable", `${secQuarterFinancialRows.length} rows with revenue and operating income`)
    : fail("SEC quarterly financial rows are model usable", `Found ${secQuarterFinancialRows.length} quarterly rows; missing core fields.`);

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", "No market snapshots found.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('MSFT', 'SPY') GROUP BY ticker",
    [],
    MSFT_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const msftPriceBars = priceBarMap.get("MSFT");
  const spyPriceBars = priceBarMap.get("SPY");
  msftPriceBars?.count >= 2000
    ? pass("MSFT daily price bars imported", `${msftPriceBars.count} rows, ${msftPriceBars.firstDate} to ${msftPriceBars.lastDate}`)
    : fail("MSFT daily price bars imported", "Run npm run msft:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}`)
    : fail("SPY daily price bars imported", "Run npm run msft:backend:import-prices.");

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No MSFT model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    MSFT_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0
      ? pass(`Assumption set exists: ${scenario}`)
      : fail(`Assumption set missing: ${scenario}`, "Seed must create Bear/Base/Bull defaults for historical runs.");
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", [TICKER], MSFT_BACKEND_DB_PATH)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate}, ${latestEvent.eventType})`);
    try {
      const valuation = await createMsftValuationRun({ eventId: latestEvent.id, scenario: "Base", modelVersion: MODEL_VERSION });
      const result = valuation.valuationResult;
      const fairValue = valuation.valuationRun?.fairValue ?? result.recommendedFairValue ?? null;
      if (isFiniteNumber(result.currentPrice) && isFiniteNumber(fairValue)) {
        pass("Backend valuation run created", `currentPrice=${result.currentPrice}; fairValue=${fairValue}`);
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
    MSFT_BACKEND_DB_PATH,
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  eventCount > 0 && historicalRunEventIds.size >= eventCount
    ? pass("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events`)
    : fail("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events. Run npm run msft:backend:backfill-valuations -- --base-only.`);

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
    MSFT_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  finiteHistoricalRuns >= eventCount
    ? pass("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${eventCount} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${eventCount} complete Base valuation rows.`);

  const baseFairValues = query(
    `SELECT reportingEventId, ROUND(fairValue, 2) AS fairValue
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ? AND fairValue IS NOT NULL`,
    [TICKER, MODEL_VERSION],
    MSFT_BACKEND_DB_PATH,
  );
  const distinctBaseFairValues = new Set(baseFairValues.map((row) => row.fairValue));
  distinctBaseFairValues.size > 3
    ? pass("Historical Base fair values vary by event", `${distinctBaseFairValues.size} distinct rounded fair values`)
    : fail(
        "Historical Base fair values vary by event",
        `Only ${distinctBaseFairValues.size} distinct rounded fair values. Event-dated driver assumptions may not be flowing into valuation.`,
      );

  const orderedBaseRuns = query(
    `SELECT e.eventDate, e.fiscalPeriod, e.eventType, e.sourceType, v.reportingEventId,
            ROUND(v.fairValue, 2) AS fairValue, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate, e.id`,
    [TICKER, MODEL_VERSION],
    MSFT_BACKEND_DB_PATH,
  );
  const secQuarterOrderedBaseRuns = orderedBaseRuns.filter((row) => row.reportingEventId.startsWith("sec-q"));
  let longestFlatRun = 1;
  let currentFlatRun = 1;
  for (let index = 1; index < secQuarterOrderedBaseRuns.length; index += 1) {
    if (secQuarterOrderedBaseRuns[index].fairValue === secQuarterOrderedBaseRuns[index - 1].fairValue) {
      currentFlatRun += 1;
      longestFlatRun = Math.max(longestFlatRun, currentFlatRun);
    } else {
      currentFlatRun = 1;
    }
  }
  longestFlatRun <= 2
    ? pass("Historical SEC-quarter fair values are not a long flat line", `Longest identical rounded SEC-quarter run is ${longestFlatRun}`)
    : fail("Historical SEC-quarter fair values are not a long flat line", `Longest identical rounded SEC-quarter run is ${longestFlatRun}; check as-of driver mapping.`);

  const quarterlyRuns = orderedBaseRuns.filter((row) => /^q[1-4]_results$/.test(row.eventType));
  const quarterlyMissingOverrides = quarterlyRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return !snapshot.asOfAssumptionOverrides || Object.keys(snapshot.asOfAssumptionOverrides).length === 0;
  });
  quarterlyMissingOverrides.length === 0
    ? pass("Quarterly valuations persist as-of driver overrides", `${quarterlyRuns.length} quarterly result events checked`)
    : fail("Quarterly valuations persist as-of driver overrides", JSON.stringify(quarterlyMissingOverrides.map((row) => row.reportingEventId)));

  const quarterlyWithNoFreshData = quarterlyRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return (snapshot.financialPeriodCount ?? 0) === 0 && (snapshot.cloudAiKpiCount ?? 0) === 0;
  });
  quarterlyWithNoFreshData.length === 0
    ? pass("Quarterly valuations use financial/KPI evidence available as of event", `${quarterlyRuns.length} quarterly result events have financial rows or KPI rows`)
    : fail("Quarterly valuations use financial/KPI evidence available as of event", JSON.stringify(quarterlyWithNoFreshData.map((row) => row.reportingEventId)));

  const secQuarterBaseRuns = orderedBaseRuns.filter((row) => row.reportingEventId.startsWith("sec-q"));
  const missingSecQuarterRuns = secQuarterEvents
    .map((event) => event.id)
    .filter((eventId) => !secQuarterBaseRuns.some((row) => row.reportingEventId === eventId));
  missingSecQuarterRuns.length === 0
    ? pass("Base valuation exists for each SEC quarter", `${secQuarterBaseRuns.length}/${secQuarterEvents.length} SEC quarters`)
    : fail("Base valuation exists for each SEC quarter", JSON.stringify(missingSecQuarterRuns));

  const earlyMsftFairValues = query(
    `SELECT e.id, e.eventDate, v.currentPrice, v.fairValue, v.upsideDownside, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ?
       AND v.scenario = 'Base'
       AND v.modelVersion = ?
       AND e.id IN ('sec-q1-fy18', 'sec-q2-fy18', 'sec-q3-fy18', 'sec-q4-fy18')
     ORDER BY e.eventDate`,
    [TICKER, MODEL_VERSION],
    MSFT_BACKEND_DB_PATH,
  );
  const earlyLooksCurrentLeaked = earlyMsftFairValues.some((row) => row.fairValue > 220);
  earlyMsftFairValues.length === 4 && !earlyLooksCurrentLeaked
    ? pass("FY2018 valuation no longer leaks current MSFT scale", earlyMsftFairValues.map((row) => `${row.id}=$${row.fairValue.toFixed(2)}`).join(", "))
    : fail("FY2018 valuation no longer leaks current MSFT scale", JSON.stringify(earlyMsftFairValues));

  const earlyAiLeakage = earlyMsftFairValues.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return (snapshot.asOfAssumptionOverrides?.aiOptionalityValue ?? 0) !== 0;
  });
  earlyAiLeakage.length === 0
    ? pass("Pre-genAI FY2018 valuations carry no AI optionality value")
    : fail("Pre-genAI FY2018 valuations carry no AI optionality value", JSON.stringify(earlyAiLeakage.map((row) => row.id)));

  const badUpsideRows = earlyMsftFairValues.filter((row) => {
    const expected = row.currentPrice && row.fairValue ? row.fairValue / row.currentPrice - 1 : null;
    return expected == null || Math.abs(expected - row.upsideDownside) > 0.0001;
  });
  badUpsideRows.length === 0
    ? pass("Historical upside/downside uses persisted fair value versus event price")
    : fail("Historical upside/downside uses persisted fair value versus event price", JSON.stringify(badUpsideRows));

  const q2Fy26Run = query(
    `SELECT v.currentPrice, p.adjustedClose, p.priceDate
     FROM valuation_runs v
     JOIN daily_price_bars p ON p.ticker = v.ticker AND p.priceDate = v.asOfDate
     WHERE v.ticker = ?
       AND v.scenario = 'Base'
       AND v.modelVersion = ?
       AND v.reportingEventId = 'sec-q2-fy26'
     ORDER BY v.createdAt DESC
     LIMIT 1`,
    [TICKER, MODEL_VERSION],
    MSFT_BACKEND_DB_PATH,
  )[0] ?? null;
  q2Fy26Run && Math.abs(q2Fy26Run.currentPrice - q2Fy26Run.adjustedClose) < 0.01 && q2Fy26Run.currentPrice < 490
    ? pass("FY2026 Q2 as-of price uses daily market data, not proxy", `price=${q2Fy26Run.currentPrice}; priceDate=${q2Fy26Run.priceDate}`)
    : fail("FY2026 Q2 as-of price uses daily market data, not proxy", JSON.stringify(q2Fy26Run));

  try {
    const backtest = runMsftBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", scenario: "Base", modelVersion: MODEL_VERSION });
    backtest.status === "completed" && backtest.curve?.length >= 2000 && isFiniteNumber(backtest.metrics?.model?.cagr) && isFiniteNumber(backtest.metrics?.spy?.cagr)
      ? pass("MSFT backtest can compare model signal versus SPY", `curve=${backtest.curve.length}; modelCagr=${backtest.metrics.model.cagr}; spyCagr=${backtest.metrics.spy.cagr}`)
      : fail("MSFT backtest can compare model signal versus SPY", JSON.stringify(backtest).slice(0, 1000));
  } catch (error) {
    fail("MSFT backtest can compare model signal versus SPY", error instanceof Error ? error.message : String(error));
  }

  const latestOfficialQuarter = orderedBaseRuns.find((row) => row.reportingEventId === "period-q3-fy26");
  if (latestOfficialQuarter) {
    const snapshot = parseJson(latestOfficialQuarter.dataSnapshotJson, {});
    snapshot.financialPeriodCount >= 1 && snapshot.segmentFinancialCount >= 3 && snapshot.cloudAiKpiCount >= 1
      ? pass("Latest official quarter uses official financials, segments and cloud KPI rows", `financial=${snapshot.financialPeriodCount}, segments=${snapshot.segmentFinancialCount}, cloudKpis=${snapshot.cloudAiKpiCount}`)
      : fail("Latest official quarter uses official financials, segments and cloud KPI rows", JSON.stringify(snapshot));
  } else {
    fail("Latest official quarter uses official financials, segments and cloud KPI rows", "Missing period-q3-fy26 Base valuation run.");
  }

  try {
    const capitalReturns = getMsftCapitalReturnHistory({ years: 8 });
    const rows = capitalReturns.rows ?? [];
    const completeRows = rows.filter((row) =>
      isFiniteNumber(row.dividendPerShare)
      && isFiniteNumber(row.dividendPerShareCents)
      && isFiniteNumber(row.dividendCashCost)
      && isFiniteNumber(row.buybackAmount)
      && isFiniteNumber(row.equityFreeCashFlow)
      && isFiniteNumber(row.totalCapitalReturn),
    );
    rows.length === 8 && completeRows.length === 8
      ? pass("Backend capital-return history has 8 complete annual rows", `${rows[0]?.fiscalYear}-${rows[rows.length - 1]?.fiscalYear}; latest DPS=${capitalReturns.summary.latestDividendPerShareCents?.toFixed(1)}c`)
      : fail("Backend capital-return history has 8 complete annual rows", JSON.stringify({ rows: rows.length, completeRows: completeRows.length, warnings: capitalReturns.warnings }));

    const stackedSeriesOk = rows.some((row) => row.dividendCashCost > 0) && rows.some((row) => row.buybackAmount >= 0) && rows.some((row) => row.equityFreeCashFlow > 0);
    stackedSeriesOk && capitalReturns.summary.cumulativeCapitalReturn > 0 && capitalReturns.summary.cumulativeFcf > 0
      ? pass("Backend capital-return chart has stacked return and FCF series", `cumulativeReturn=${capitalReturns.summary.cumulativeCapitalReturn}; cumulativeFcf=${capitalReturns.summary.cumulativeFcf}`)
      : fail("Backend capital-return chart has stacked return and FCF series", JSON.stringify(capitalReturns.summary));

    const forward = capitalReturns.forwardExpectation;
    forward
      && forward.isForecast === true
      && forward.sourceType === "forecast_assumption"
      && isFiniteNumber(forward.dividendCashCost)
      && isFiniteNumber(forward.buybackAmount)
      && isFiniteNumber(forward.equityFreeCashFlow)
      && isFiniteNumber(forward.totalCapitalReturn)
      ? pass("Backend capital-return history includes forward forecast bar", `FY${forward.fiscalYear}E dividendCash=${forward.dividendCashCost}; buyback=${forward.buybackAmount}; fcf=${forward.equityFreeCashFlow}`)
      : fail("Backend capital-return history includes forward forecast bar", JSON.stringify(forward));

    const proxyRows = rows.filter((row) => row.sourceType !== "official_actual");
    const proxyWarnings = capitalReturns.warnings?.filter((warning) => warning.id === "msft-capital-return-proxy-years") ?? [];
    proxyRows.length === 0 || proxyWarnings.length > 0
      ? pass("Proxy capital-return rows generate warnings", proxyRows.length ? `Proxy years: ${proxyRows.map((row) => row.fiscalYear).join(", ")}` : "No proxy rows in current MSFT 8Y history")
      : fail("Proxy capital-return rows generate warnings", JSON.stringify(proxyRows));

    const frontendFieldsPresent = rows.every((row) =>
      "fiscalYear" in row
      && "dividendPerShareCents" in row
      && "dividendCashCost" in row
      && "buybackAmount" in row
      && "equityFreeCashFlow" in row
      && "fcfCoverage" in row
      && "sourceQuality" in row,
    );
    frontendFieldsPresent
      ? pass("Capital-return endpoint includes frontend-required fields")
      : fail("Capital-return endpoint includes frontend-required fields", JSON.stringify(rows[0] ?? null));
  } catch (error) {
    fail("Backend capital-return history has 8 complete annual rows", error instanceof Error ? error.message : String(error));
  }

  const transcriptModelReady = count("transcript_extractions", "ticker = 'MSFT' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are not model-ready")
    : fail("Transcript candidates are not model-ready", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'MSFT' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
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
    MSFT_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only across mixed currencies")
    : fail("Peer absolute values are metadata-only across mixed currencies", JSON.stringify(mixedCurrencyPeerMisuse));

  const health = await getHealthStatus();
  if (health.ok && health.body?.msftBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected MSFT health payload.");
  }

  runNpmCheck("build", "Frontend build still passes");
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
