#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { query } from "../apps/api/src/db/client.mjs";
import { runMetaBacktest } from "../apps/api/src/services/metaBacktestService.mjs";
import { createMetaValuationRun } from "../apps/api/src/services/metaValuationService.mjs";
import { META_BACKEND_DB_PATH, META_BACKEND_TABLES } from "../modules/meta/db/schema.mjs";
import { META_BACKEND_MODEL_VERSION } from "../modules/meta/valuation/modelVersion.mjs";

const TICKER = "META";
const MODEL_VERSION = META_BACKEND_MODEL_VERSION.version;
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

function count(table, where = "ticker = 'META'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], META_BACKEND_DB_PATH)[0]?.count ?? 0;
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

function collectDates(value, path = "$", acc = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDates(item, `${path}[${index}]`, acc));
    return acc;
  }
  if (!value || typeof value !== "object") return acc;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && /^\d{4}-\d{2}-\d{2}$/.test(child) && /(?:asOfDate|eventDate|priceDate|callDate|publishedDate|retrievedAt)$/i.test(key)) {
      acc.push({ path: `${path}.${key}`, date: child });
    } else {
      collectDates(child, `${path}.${key}`, acc);
    }
  }
  return acc;
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
  console.log("META Backend Validation");

  if (!existsSync(META_BACKEND_DB_PATH)) {
    fail("DB file exists", `${META_BACKEND_DB_PATH} is missing. Run npm run meta:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", META_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], META_BACKEND_DB_PATH).map((row) => row.name));
  for (const table of META_BACKEND_TABLES) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run meta:backend:seed to apply migrations.");
  }
  tables.has("daily_price_bars")
    ? pass("Table exists: daily_price_bars")
    : fail("Table missing: daily_price_bars", "Run npm run meta:backend:import-prices to apply the price-bar migration.");

  const events = query(
    `SELECT id, eventDate, fiscalPeriod, fiscalQuarter, fiscalYear, eventType, sourceType
     FROM reporting_events
     WHERE ticker = ?
       AND eventType IN ('q1_results', 'q2_results', 'q3_results', 'q4_results')
     ORDER BY eventDate ASC, id ASC`,
    [TICKER],
    META_BACKEND_DB_PATH,
  );
  const earliest = events[0];
  const latest = events[events.length - 1];
  events.length >= 32 && earliest?.eventDate <= "2018-05-13" && latest?.eventDate >= "2026-04-29"
    ? pass("Quarterly reporting-event history covers at least eight years", `${events.length} events, ${earliest?.fiscalPeriod} to ${latest?.fiscalPeriod}`)
    : fail("Quarterly reporting-event history covers at least eight years", `Found ${events.length}; earliest=${earliest?.id ?? "n/a"}; latest=${latest?.id ?? "n/a"}`);

  const expectedPeriods = [];
  for (let year = 2018; year <= 2025; year += 1) {
    for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) expectedPeriods.push(`${quarter} FY${year}`);
  }
  expectedPeriods.push("Q1 FY2026");
  const foundPeriods = new Set(events.map((event) => event.fiscalPeriod));
  const missingPeriods = expectedPeriods.filter((period) => !foundPeriods.has(period));
  missingPeriods.length === 0
    ? pass("Expected quarterly periods are present", `${expectedPeriods.length} expected periods`)
    : fail("Expected quarterly periods are present", `Missing: ${missingPeriods.join(", ")}`);

  const officialFinancials = count("financial_periods", "ticker = 'META' AND sourceType = 'official_actual'");
  const proxyFinancials = count("financial_periods", "ticker = 'META' AND sourceType != 'official_actual'");
  officialFinancials > 0
    ? pass("Official actual financial rows imported", `${officialFinancials} rows`)
    : fail("Official actual financial rows imported", "No official actual financial rows found.");
  proxyFinancials > 0
    ? warn("Research-only financial proxies are present", `${proxyFinancials} historical rows are explicit research-only proxies pending full SEC Companyfacts import.`)
    : pass("Research-only financial proxies are absent", "All financial rows are official actuals.");

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", "No META market snapshots found.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(sourceType) AS sourceType, MIN(source) AS source FROM daily_price_bars WHERE ticker IN ('META', 'SPY') GROUP BY ticker",
    [],
    META_BACKEND_DB_PATH,
  );
  const priceMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const metaPriceBars = priceMap.get("META");
  const spyPriceBars = priceMap.get("SPY");
  metaPriceBars?.count >= 2000
    ? pass("META daily price bars imported", `${metaPriceBars.count} rows, ${metaPriceBars.firstDate} to ${metaPriceBars.lastDate}; ${metaPriceBars.sourceType}`)
    : fail("META daily price bars imported", "Run npm run meta:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}; ${spyPriceBars.sourceType}`)
    : fail("SPY daily price bars imported", "Run npm run meta:backend:import-prices.");
  if (metaPriceBars?.sourceType !== "market_data_adjusted") {
    warn("META adjusted-close quality", `Source type is ${metaPriceBars?.sourceType ?? "n/a"}; validation accepts it only with explicit warning.`);
  }
  if (spyPriceBars?.sourceType !== "market_data_adjusted") {
    warn("SPY adjusted-close quality", `Source type is ${spyPriceBars?.sourceType ?? "n/a"}; validation accepts it only with explicit warning.`);
  }

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No META model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    META_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) >= events.length
      ? pass(`Assumption sets exist: ${scenario}`, `${scenarioMap.get(scenario)} rows`)
      : fail(`Assumption sets missing: ${scenario}`, `${scenarioMap.get(scenario) ?? 0}/${events.length} event-dated rows`);
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", [TICKER], META_BACKEND_DB_PATH)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate}, ${latestEvent.eventType})`);
    try {
      const valuation = await createMetaValuationRun({ eventId: latestEvent.id, scenario: "Base", modelVersion: MODEL_VERSION });
      const result = valuation.valuationRun;
      if (isFiniteNumber(result?.currentPrice) && isFiniteNumber(result?.fairValue)) {
        pass("Backend valuation run created", `currentPrice=${result.currentPrice}; fairValue=${result.fairValue}`);
      } else {
        fail("Backend valuation run created", "Valuation run did not persist finite currentPrice and fairValue.");
      }
      if (isFiniteNumber(result?.targetPrice3Y) && isFiniteNumber(result?.expectedShareholderCagr)) {
        pass("Target price and CAGR persisted", `targetPrice3Y=${result.targetPrice3Y}; cagr=${result.expectedShareholderCagr}`);
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
    META_BACKEND_DB_PATH,
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  historicalRunEventIds.size >= events.length
    ? pass("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${events.length} events`)
    : fail("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${events.length} events. Run npm run meta:backend:backfill-valuations -- --base-only.`);

  const completeHistoricalRuns = query(
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
    META_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  completeHistoricalRuns >= events.length
    ? pass("Historical valuation output fields are persisted", `${completeHistoricalRuns}/${events.length} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation output fields are persisted", `${completeHistoricalRuns}/${events.length} complete Base valuation rows.`);

  const orderedBaseRuns = query(
    `SELECT e.id, e.eventDate, e.fiscalPeriod, e.fiscalYear, v.currentPrice, v.fairValue, v.targetPrice3Y,
            v.expectedShareholderCagr, v.upsideDownside, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate, e.id, v.createdAt DESC`,
    [TICKER, MODEL_VERSION],
    META_BACKEND_DB_PATH,
  );
  const latestRunByEvent = new Map();
  for (const row of orderedBaseRuns) {
    if (!latestRunByEvent.has(row.id)) latestRunByEvent.set(row.id, row);
  }
  const baseRuns = [...latestRunByEvent.values()].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const distinctFairValues = new Set(baseRuns.map((row) => Math.round(row.fairValue * 100) / 100));
  distinctFairValues.size > 8
    ? pass("Historical Base fair values vary by event", `${distinctFairValues.size} distinct rounded fair values`)
    : fail("Historical Base fair values vary by event", `Only ${distinctFairValues.size} distinct rounded fair values.`);

  let longestFlatRun = 1;
  let currentFlatRun = 1;
  for (let index = 1; index < baseRuns.length; index += 1) {
    if (Math.round(baseRuns[index].fairValue * 100) === Math.round(baseRuns[index - 1].fairValue * 100)) {
      currentFlatRun += 1;
      longestFlatRun = Math.max(longestFlatRun, currentFlatRun);
    } else {
      currentFlatRun = 1;
    }
  }
  longestFlatRun <= 2
    ? pass("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}`)
    : fail("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}; check as-of driver mapping.`);

  const missingOverrides = baseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return !snapshot.asOfAssumptionOverrides || Object.keys(snapshot.asOfAssumptionOverrides).length === 0;
  });
  missingOverrides.length === 0
    ? pass("Quarterly valuations persist as-of driver overrides", `${baseRuns.length} Base runs checked`)
    : fail("Quarterly valuations persist as-of driver overrides", JSON.stringify(missingOverrides.map((row) => row.id)));

  const noEvidenceRows = baseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return (snapshot.financialPeriodCount ?? 0) === 0 && !snapshot.selectedFinancialPeriod;
  });
  noEvidenceRows.length === 0
    ? pass("Quarterly valuations use financial evidence available as of event", `${baseRuns.length} Base runs have financial-period evidence`)
    : fail("Quarterly valuations use financial evidence available as of event", JSON.stringify(noEvidenceRows.map((row) => row.id)));

  const futureDateLeaks = [];
  for (const row of baseRuns) {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    for (const item of collectDates(snapshot)) {
      if (item.date > row.eventDate) futureDateLeaks.push({ eventId: row.id, eventDate: row.eventDate, ...item });
    }
  }
  futureDateLeaks.length === 0
    ? pass("Data snapshot dates do not exceed valuation as-of date")
    : fail("Data snapshot dates do not exceed valuation as-of date", JSON.stringify(futureDateLeaks.slice(0, 8)));

  const badPriceDates = baseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return snapshot.asOfPriceSource?.priceDate && snapshot.asOfPriceSource.priceDate > row.eventDate;
  });
  badPriceDates.length === 0
    ? pass("Historical priceDate is on or before eventDate")
    : fail("Historical priceDate is on or before eventDate", JSON.stringify(badPriceDates.map((row) => row.id)));

  const earlyRuns = baseRuns.filter((row) => row.fiscalYear <= 2020);
  const earlyAiLeakage = earlyRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return (snapshot.asOfAssumptionOverrides?.aiRevenueUpliftPct ?? 0) !== 0;
  });
  earlyAiLeakage.length === 0
    ? pass("Pre-2023 valuations carry no post-genAI revenue uplift")
    : fail("Pre-2023 valuations carry no post-genAI revenue uplift", JSON.stringify(earlyAiLeakage.map((row) => row.id)));

  const latestRevenueScale = Math.max(...baseRuns.map((row) => parseJson(row.dataSnapshotJson, {})?.selectedFinancialPeriod?.revenue ?? 0));
  const oldScaleLeaks = earlyRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const revenue = snapshot.selectedFinancialPeriod?.revenue ?? 0;
    return revenue > latestRevenueScale * 0.55;
  });
  oldScaleLeaks.length === 0
    ? pass("Old years do not use latest META financial scale")
    : fail("Old years do not use latest META financial scale", JSON.stringify(oldScaleLeaks.map((row) => row.id)));

  const latestCapex = Math.max(...baseRuns.map((row) => parseJson(row.dataSnapshotJson, {})?.asOfAssumptionOverrides?.capex2026 ?? 0));
  const earlyCapexLeaks = earlyRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    return (snapshot.asOfAssumptionOverrides?.capex2026 ?? 0) > latestCapex * 0.4;
  });
  earlyCapexLeaks.length === 0
    ? pass("Old years do not use latest AI/capex buildout assumptions")
    : fail("Old years do not use latest AI/capex buildout assumptions", JSON.stringify(earlyCapexLeaks.map((row) => row.id)));

  const badUpsideRows = baseRuns.filter((row) => {
    const expected = row.currentPrice && row.fairValue ? row.fairValue / row.currentPrice - 1 : null;
    return expected == null || Math.abs(expected - row.upsideDownside) > 0.0001;
  });
  badUpsideRows.length === 0
    ? pass("Historical upside/downside uses persisted fair value versus event price")
    : fail("Historical upside/downside uses persisted fair value versus event price", JSON.stringify(badUpsideRows.map((row) => row.id)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'META' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are not model-ready")
    : fail("Transcript candidates are not model-ready", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'META' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
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
    META_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only across mixed currencies")
    : fail("Peer absolute values are metadata-only across mixed currencies", JSON.stringify(mixedCurrencyPeerMisuse));

  try {
    const backtest = runMetaBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY", modelVersion: MODEL_VERSION });
    backtest.status === "completed" && backtest.curve?.length >= 2000 && isFiniteNumber(backtest.metrics?.metaBuyHold?.cagr) && isFiniteNumber(backtest.metrics?.spy?.cagr)
      ? pass("META backtest can compare buy-and-hold versus SPY", `curve=${backtest.curve.length}; metaCagr=${backtest.metrics.metaBuyHold.cagr}; spyCagr=${backtest.metrics.spy.cagr}`)
      : fail("META backtest can compare buy-and-hold versus SPY", JSON.stringify(backtest).slice(0, 1000));
  } catch (error) {
    fail("META backtest can compare buy-and-hold versus SPY", error instanceof Error ? error.message : String(error));
  }

  const health = await getHealthStatus();
  if (health.ok && health.body?.metaBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected META health payload.");
  }

  if (process.argv.includes("--with-build")) {
    runNpmCheck("typecheck", "Typecheck passes");
    runNpmCheck("build", "Frontend build passes");
  } else {
    warn("Typecheck/build validation", "Skipped inside meta_backend_validation; run npm run typecheck and npm run build as final verification.");
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
