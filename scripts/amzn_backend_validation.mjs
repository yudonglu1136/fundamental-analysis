#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { query } from "../apps/api/src/db/client.mjs";
import { runAmznBacktest } from "../apps/api/src/services/amznBacktestService.mjs";
import { AMZN_BACKEND_DB_PATH, AMZN_BACKEND_TABLES } from "../modules/amzn/db/schema.mjs";
import { AMZN_BACKEND_MODEL_VERSION } from "../modules/amzn/valuation/modelVersion.mjs";

const TICKER = "AMZN";
const MODEL_VERSION = AMZN_BACKEND_MODEL_VERSION.version;
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

function count(table, where = "ticker = 'AMZN'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, [], AMZN_BACKEND_DB_PATH)[0]?.count ?? 0;
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

function expectedQuarterIds(startYear, endYear) {
  const ids = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) ids.push(`sec-q${quarter}-fy${String(year).slice(2)}`);
  }
  return ids;
}

function quarterRank(row) {
  const match = /^Q([1-4])$/.exec(row?.fiscalQuarter ?? "");
  return match ? Number(match[1]) : 4;
}

function periodSortValue(row) {
  return (row?.fiscalYear ?? 0) * 10 + quarterRank(row);
}

function quarterEndDate(row) {
  const year = row?.fiscalYear;
  if (!year) return null;
  const quarter = quarterRank(row);
  const endByQuarter = {
    1: `${year}-03-31`,
    2: `${year}-06-30`,
    3: `${year}-09-30`,
    4: `${year}-12-31`,
  };
  return endByQuarter[quarter] ?? null;
}

function daysBetween(left, right) {
  return Math.round((Date.parse(`${right}T00:00:00.000Z`) - Date.parse(`${left}T00:00:00.000Z`)) / 86400000);
}

function sumRows(rows, key) {
  let total = 0;
  let hasValue = false;
  for (const row of rows) {
    if (isFiniteNumber(row?.[key])) {
      total += row[key];
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function expectedTtmNormalizedFcfMargin(period, financialRowsForTtm) {
  const trailing = [...financialRowsForTtm]
    .filter((row) => row.periodType === "quarter" && periodSortValue(row) <= periodSortValue(period))
    .sort((left, right) => periodSortValue(left) - periodSortValue(right))
    .slice(-4);
  const base = trailing.length >= 4
    ? {
        revenue: sumRows(trailing, "revenue") ?? period.revenue,
        capex: sumRows(trailing, "capex") ?? period.capex,
        freeCashFlow: sumRows(trailing, "freeCashFlow") ?? period.freeCashFlow,
      }
    : period;
  const maturity = Math.max(0, Math.min(1, ((period.fiscalYear ?? 2018) - 2018) / 8));
  const capexIntensity = base.revenue && base.capex ? Math.max(0.035, Math.min(0.22, base.capex / base.revenue)) : 0.08 + maturity * 0.04;
  return Math.max(0.035, ((base.freeCashFlow ?? base.revenue * 0.05) / Math.max(base.revenue, 1)) + Math.max(capexIntensity - (0.055 + maturity * 0.01), 0) * 0.55);
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

async function main() {
  console.log("AMZN Backend Validation");

  if (!existsSync(AMZN_BACKEND_DB_PATH)) {
    fail("DB file exists", `${AMZN_BACKEND_DB_PATH} is missing. Run npm run amzn:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", AMZN_BACKEND_DB_PATH);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'", [], AMZN_BACKEND_DB_PATH).map((row) => row.name));
  const requiredTables = [...AMZN_BACKEND_TABLES, "daily_price_bars"];
  for (const table of requiredTables) {
    tables.has(table) ? pass(`Table exists: ${table}`) : fail(`Table missing: ${table}`, "Run npm run amzn:backend:seed to apply migrations.");
  }

  const eventCount = count("reporting_events");
  eventCount > 0 ? pass("Reporting events imported", `${eventCount} rows`) : fail("Reporting events imported", "No AMZN reporting events found.");

  const quarterEvents = query(
    `SELECT id, eventDate, fiscalPeriod, fiscalYear, fiscalQuarter, eventType, sourceType
     FROM reporting_events
     WHERE ticker = ?
       AND eventType IN ('q1_results', 'q2_results', 'q3_results', 'q4_results')
     ORDER BY eventDate, id`,
    [TICKER],
    AMZN_BACKEND_DB_PATH,
  );
  const foundQuarterIds = new Set(quarterEvents.map((row) => row.id));
  const requiredEightYearIds = expectedQuarterIds(2018, 2025);
  const missingEightYearIds = requiredEightYearIds.filter((id) => !foundQuarterIds.has(id));
  if (quarterEvents.length >= 32 && missingEightYearIds.length === 0) {
    pass("Eight-year quarterly reporting-event history exists", `${quarterEvents.length} quarterly events; FY2018 Q1 through FY2025 Q4 present`);
  } else {
    fail("Eight-year quarterly reporting-event history exists", `Found ${quarterEvents.length}; missing=${missingEightYearIds.join(", ") || "none"}`);
  }

  const delayedReportingEvents = quarterEvents.filter((event) => {
    const quarterEnd = quarterEndDate(event);
    if (!quarterEnd) return true;
    const lagDays = daysBetween(quarterEnd, event.eventDate);
    return lagDays < 0 || lagDays > 125;
  });
  delayedReportingEvents.length === 0
    ? pass("Quarterly event dates are timely official filing anchors", `${quarterEvents.length} reporting events checked`)
    : fail(
        "Quarterly event dates are timely official filing anchors",
        JSON.stringify(delayedReportingEvents.map((event) => ({ id: event.id, eventDate: event.eventDate, quarterEnd: quarterEndDate(event) }))),
      );

  const financialRows = query(
    `SELECT periodId, asOfDate, revenue, operatingIncome, freeCashFlow, sourceType
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'quarter'
     ORDER BY asOfDate, periodId`,
    [TICKER],
    AMZN_BACKEND_DB_PATH,
  );
  financialRows.length >= 32 && financialRows.every((row) => isFiniteNumber(row.revenue) && isFiniteNumber(row.operatingIncome) && row.sourceType === "official_actual")
    ? pass("Quarterly consolidated financial rows are SEC-sourced and model usable", `${financialRows.length} rows`)
    : fail("Quarterly consolidated financial rows are SEC-sourced and model usable", `Found ${financialRows.length}; missing core fields or source tags.`);

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", "No AMZN market snapshots found.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('AMZN', 'SPY') GROUP BY ticker",
    [],
    AMZN_BACKEND_DB_PATH,
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const amznPriceBars = priceBarMap.get("AMZN");
  const spyPriceBars = priceBarMap.get("SPY");
  amznPriceBars?.count >= 2000
    ? pass("AMZN daily price bars imported", `${amznPriceBars.count} rows, ${amznPriceBars.firstDate} to ${amznPriceBars.lastDate}; source=${amznPriceBars.source}`)
    : fail("AMZN daily price bars imported", "Run npm run amzn:backend:import-prices.");
  spyPriceBars?.count >= 2000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}; source=${spyPriceBars.source}`)
    : fail("SPY daily price bars imported", "Run npm run amzn:backend:import-prices.");
  if (amznPriceBars?.sourceType?.includes("proxy") || spyPriceBars?.sourceType?.includes("proxy")) {
    warn("Price data source quality", "At least one ticker uses research-only proxy price bars. Re-run import with network access or local Yahoo/Stooq data for market-data rows.");
  }
  if (amznPriceBars?.sourceType?.includes("unadjusted") || spyPriceBars?.sourceType?.includes("unadjusted")) {
    warn("Adjusted close availability", "At least one ticker uses close as adjustedClose because adjusted close was unavailable in the source.");
  }

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No AMZN model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    [TICKER, MODEL_VERSION],
    AMZN_BACKEND_DB_PATH,
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0
      ? pass(`Assumption sets exist: ${scenario}`, `${scenarioMap.get(scenario)} event-dated rows`)
      : fail(`Assumption sets missing: ${scenario}`, "Seed must create Bear/Base/Bull event-dated defaults.");
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC, id DESC LIMIT 1", [TICKER], AMZN_BACKEND_DB_PATH)[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate}, ${latestEvent.eventType})`);
    try {
      const valuationRun = query(
        `SELECT *
         FROM valuation_runs
         WHERE ticker = ? AND reportingEventId = ? AND scenario = 'Base' AND modelVersion = ?
         ORDER BY createdAt DESC
         LIMIT 1`,
        [TICKER, latestEvent.id, MODEL_VERSION],
        AMZN_BACKEND_DB_PATH,
      )[0] ?? null;
      const fairValue = valuationRun?.fairValue ?? null;
      if (isFiniteNumber(valuationRun?.currentPrice) && isFiniteNumber(fairValue)) {
        pass("Backend valuation run available", `currentPrice=${valuationRun.currentPrice}; fairValue=${fairValue}`);
      } else {
        fail("Backend valuation run available", "No finite latest-event Base valuation run found. Run npm run amzn:backend:backfill-valuations.");
      }
      if (isFiniteNumber(valuationRun?.targetPrice3Y) && isFiniteNumber(valuationRun?.expectedShareholderCagr)) {
        pass("Target price and CAGR persisted", `targetPrice3Y=${valuationRun.targetPrice3Y}`);
      } else {
        fail("Target price and CAGR persisted", "Missing targetPrice3Y or expectedShareholderCagr.");
      }
    } catch (error) {
      fail("Backend valuation run created", error instanceof Error ? error.message : String(error));
    }
  }

  const baseRunEventIds = query(
    `SELECT reportingEventId, COUNT(*) AS count
     FROM valuation_runs
     WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?
     GROUP BY reportingEventId`,
    [TICKER, MODEL_VERSION],
    AMZN_BACKEND_DB_PATH,
  ).map((row) => row.reportingEventId);
  const missingBaseRuns = quarterEvents.map((event) => event.id).filter((id) => !baseRunEventIds.includes(id));
  missingBaseRuns.length === 0
    ? pass("Base valuation exists for each quarterly reporting event", `${baseRunEventIds.length}/${quarterEvents.length} quarterly events`)
    : fail("Base valuation exists for each quarterly reporting event", JSON.stringify(missingBaseRuns));

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
    AMZN_BACKEND_DB_PATH,
  )[0]?.count ?? 0;
  finiteHistoricalRuns >= quarterEvents.length
    ? pass("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${quarterEvents.length} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${quarterEvents.length} complete Base valuation rows.`);

  const orderedBaseRuns = query(
    `WITH latest_runs AS (
       SELECT reportingEventId, MAX(createdAt) AS createdAt
       FROM valuation_runs
       WHERE ticker = ? AND scenario = 'Base' AND modelVersion = ?
       GROUP BY reportingEventId
     )
     SELECT e.id, e.eventDate, e.fiscalYear, e.fiscalQuarter, v.currentPrice, ROUND(v.fairValue, 2) AS fairValue, v.upsideDownside, v.dataSnapshotJson
     FROM valuation_runs v
     JOIN latest_runs lr ON lr.reportingEventId = v.reportingEventId AND lr.createdAt = v.createdAt
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ? AND v.scenario = 'Base' AND v.modelVersion = ?
     ORDER BY e.eventDate, e.id`,
    [TICKER, MODEL_VERSION, TICKER, MODEL_VERSION],
    AMZN_BACKEND_DB_PATH,
  );
  const distinctBaseFairValues = new Set(orderedBaseRuns.map((row) => row.fairValue));
  distinctBaseFairValues.size > 8
    ? pass("Historical Base fair values vary by event", `${distinctBaseFairValues.size} distinct rounded fair values`)
    : fail("Historical Base fair values vary by event", `Only ${distinctBaseFairValues.size} distinct rounded fair values.`);

  let longestFlatRun = 1;
  let currentFlatRun = 1;
  for (let index = 1; index < orderedBaseRuns.length; index += 1) {
    if (orderedBaseRuns[index].fairValue === orderedBaseRuns[index - 1].fairValue) {
      currentFlatRun += 1;
      longestFlatRun = Math.max(longestFlatRun, currentFlatRun);
    } else {
      currentFlatRun = 1;
    }
  }
  longestFlatRun <= 2
    ? pass("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}`)
    : fail("Historical fair values are not a long flat line", `Longest identical rounded run is ${longestFlatRun}.`);

  const futureLeakRows = orderedBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const asOfDate = row.eventDate;
    const dates = [
      ...(snapshot.financialPeriodAsOfDates ?? []),
      ...(snapshot.segmentAsOfDates ?? []),
      ...(snapshot.businessUnitAsOfDates ?? []),
      ...(snapshot.operatingMetricAsOfDates ?? []),
    ];
    return dates.some((date) => date && date > asOfDate);
  });
  futureLeakRows.length === 0
    ? pass("Snapshot rows are dated on or before valuation as-of date", `${orderedBaseRuns.length} Base runs checked`)
    : fail("Snapshot rows are dated on or before valuation as-of date", JSON.stringify(futureLeakRows.map((row) => row.id)));

  const badPriceRows = orderedBaseRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const priceDate = snapshot.asOfPriceSource?.priceDate;
    return !priceDate || priceDate > row.eventDate;
  });
  badPriceRows.length === 0
    ? pass("Historical as-of price uses nearest prior daily market row", `${orderedBaseRuns.length} price anchors checked`)
    : fail("Historical as-of price uses nearest prior daily market row", JSON.stringify(badPriceRows.map((row) => row.id)));

  const earlyRuns = orderedBaseRuns.filter((row) => row.fiscalYear <= 2019);
  const earlyLeakage = earlyRuns.filter((row) => {
    const snapshot = parseJson(row.dataSnapshotJson, {});
    const assumptions = snapshot.asOfAssumptionOverrides ?? {};
    return (
      (assumptions.awsOperatingMargin ?? 0) > 0.30 ||
      (assumptions.advertisingContributionMargin ?? 0) > 0.41 ||
      (assumptions.aiCapexDrag ?? 0) !== 0 ||
      (row.eventDate < "2019-04-01" && (assumptions.kuiperOptionValue ?? 0) !== 0)
    );
  });
  earlyRuns.length >= 8 && earlyLeakage.length === 0
    ? pass("Old-year valuations do not use latest AWS/ad/AI/Kuiper assumptions", `${earlyRuns.length} FY2018-FY2019 runs checked`)
    : fail("Old-year valuations do not use latest AWS/ad/AI/Kuiper assumptions", JSON.stringify(earlyLeakage.map((row) => row.id)));

  const financialRowsForTtm = query(
    `SELECT eventId, fiscalYear, fiscalQuarter, periodType, revenue, capex, freeCashFlow
     FROM financial_periods
     WHERE ticker = ? AND periodType = 'quarter'
     ORDER BY fiscalYear, fiscalQuarter`,
    [TICKER],
    AMZN_BACKEND_DB_PATH,
  );
  const financialRowsByEventId = new Map(financialRowsForTtm.map((row) => [row.eventId, row]));
  const baseAssumptionRows = query(
    `SELECT e.id, e.fiscalPeriod, e.fiscalYear, e.fiscalQuarter, a.assumptionsJson
     FROM assumption_sets a
     JOIN reporting_events e ON e.id = REPLACE(a.id, 'amzn-base-${MODEL_VERSION}-', '')
     WHERE a.ticker = ? AND a.scenario = 'Base' AND a.modelVersion = ?
     ORDER BY e.eventDate, e.id`,
    [TICKER, MODEL_VERSION],
    AMZN_BACKEND_DB_PATH,
  );
  const badFcfMarginRows = baseAssumptionRows.filter((row) => {
    const period = financialRowsByEventId.get(row.id);
    const assumptions = parseJson(row.assumptionsJson, {});
    if (!period || !isFiniteNumber(assumptions.normalizedFcfMargin)) return true;
    const expected = expectedTtmNormalizedFcfMargin(period, financialRowsForTtm);
    return Math.abs(assumptions.normalizedFcfMargin - expected) > 0.0025;
  });
  badFcfMarginRows.length === 0
    ? pass("Base normalized FCF margin uses TTM, not single-quarter seasonality", `${baseAssumptionRows.length} Base assumption sets checked`)
    : fail("Base normalized FCF margin uses TTM, not single-quarter seasonality", JSON.stringify(badFcfMarginRows.map((row) => row.fiscalPeriod)));

  const badUpsideRows = orderedBaseRuns.filter((row) => {
    const expected = row.currentPrice && row.fairValue ? row.fairValue / row.currentPrice - 1 : null;
    return expected == null || Math.abs(expected - row.upsideDownside) > 0.0001;
  });
  badUpsideRows.length === 0
    ? pass("Historical upside/downside uses persisted fair value versus event price")
    : fail("Historical upside/downside uses persisted fair value versus event price", JSON.stringify(badUpsideRows.map((row) => row.id)));

  const transcriptModelReady = count("transcript_extractions", "ticker = 'AMZN' AND (modelReady != 0 OR valuationImpactAllowed != 0)");
  transcriptModelReady === 0
    ? pass("Transcript candidates are not model-ready")
    : fail("Transcript candidates are not model-ready", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidanceCandidatesPromoted = count(
    "guidance_items",
    "ticker = 'AMZN' AND valuationImpactAllowed != 0 AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))",
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
    AMZN_BACKEND_DB_PATH,
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only across mixed currencies")
    : fail("Peer absolute values are metadata-only across mixed currencies", JSON.stringify(mixedCurrencyPeerMisuse));

  try {
    const backtest = runAmznBacktest({ startDate: "2018-01-02", endDate: "2026-05-12", benchmarkTicker: "SPY", modelVersion: MODEL_VERSION });
    const amznMetrics = backtest.metrics?.amznBuyHold;
    const spyMetrics = backtest.metrics?.spy;
    backtest.status === "completed" &&
      backtest.curve?.length >= 2000 &&
      isFiniteNumber(amznMetrics?.cagr) &&
      isFiniteNumber(amznMetrics?.maxDrawdown) &&
      isFiniteNumber(amznMetrics?.sharpe) &&
      isFiniteNumber(amznMetrics?.volatility) &&
      isFiniteNumber(spyMetrics?.cagr) &&
      isFiniteNumber(spyMetrics?.maxDrawdown) &&
      isFiniteNumber(spyMetrics?.sharpe) &&
      isFiniteNumber(spyMetrics?.volatility)
      ? pass("AMZN vs SPY backtest returns finite metrics", `curve=${backtest.curve.length}; amznCagr=${amznMetrics.cagr}; spyCagr=${spyMetrics.cagr}`)
      : fail("AMZN vs SPY backtest returns finite metrics", JSON.stringify(backtest).slice(0, 1000));
  } catch (error) {
    fail("AMZN vs SPY backtest returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  const health = await getHealthStatus();
  if (health.ok && health.body?.amznBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected AMZN health payload.");
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
