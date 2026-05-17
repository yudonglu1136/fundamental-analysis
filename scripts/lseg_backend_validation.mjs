#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { defaultLsegDbPath, query } from "../apps/api/src/db/client.mjs";
import { getLsegCapitalReturnHistory } from "../apps/api/src/services/lsegSnapshotService.mjs";
import { runLsegBacktest } from "../apps/api/src/services/lsegBacktestService.mjs";
import { createLsegValuationRun } from "../apps/api/src/services/lsegValuationService.mjs";

const requiredTables = [
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

function count(table, where = "ticker = 'LSEG.L'") {
  return query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`)[0]?.count ?? 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sensitivityTableMap(run, title) {
  const table = parseJson(run?.sensitivityTablesJson, []).find((item) => item.title === title)?.table ?? [];
  return Object.fromEntries(table.slice(1).map((row) => [row[0], row[1]]));
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
  console.log("LSEG Backend Validation");

  if (!existsSync(defaultLsegDbPath)) {
    fail("DB file exists", `${defaultLsegDbPath} is missing. Run npm run lseg:backend:seed.`);
    printAndExit();
    return;
  }
  pass("DB file exists", defaultLsegDbPath);

  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
  for (const table of requiredTables) {
    if (tables.has(table)) pass(`Table exists: ${table}`);
    else fail(`Table missing: ${table}`, "Run npm run lseg:backend:seed to apply migrations.");
  }

  const eventCount = count("reporting_events");
  eventCount > 0 ? pass("Reporting events imported", `${eventCount} rows`) : fail("Reporting events imported", "No LSEG reporting events found.");

  const marketCount = count("market_snapshots");
  marketCount > 0 ? pass("Market snapshots imported", `${marketCount} rows`) : fail("Market snapshots imported", "No market snapshots found.");

  const priceBars = query(
    "SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, SUM(CASE WHEN adjustedClose IS NULL THEN 1 ELSE 0 END) AS missingAdjustedClose FROM daily_price_bars WHERE ticker IN ('LSEG.L', 'SPY') GROUP BY ticker ORDER BY ticker",
  );
  const priceBarMap = new Map(priceBars.map((row) => [row.ticker, row]));
  const lsegPriceBars = priceBarMap.get("LSEG.L");
  const spyPriceBars = priceBarMap.get("SPY");
  lsegPriceBars?.count >= 500
    ? pass("LSEG.L daily price bars imported", `${lsegPriceBars.count} rows, ${lsegPriceBars.firstDate} to ${lsegPriceBars.lastDate}`)
    : fail("LSEG.L daily price bars imported", "Run npm run lseg:backend:import-prices.");
  spyPriceBars?.count >= 1000
    ? pass("SPY daily price bars imported", `${spyPriceBars.count} rows, ${spyPriceBars.firstDate} to ${spyPriceBars.lastDate}`)
    : fail("SPY daily price bars imported", "Run npm run lseg:backend:import-prices.");
  (lsegPriceBars?.missingAdjustedClose ?? 0) === 0 && (spyPriceBars?.missingAdjustedClose ?? 0) === 0
    ? pass("Daily price bars use adjusted close where available")
    : warn("Daily price bars use adjusted close where available", `Missing adjusted close rows: LSEG.L=${lsegPriceBars?.missingAdjustedClose ?? "n/a"}, SPY=${spyPriceBars?.missingAdjustedClose ?? "n/a"}`);

  const modelVersionCount = count("model_versions");
  modelVersionCount > 0 ? pass("Model versions imported", `${modelVersionCount} rows`) : fail("Model versions imported", "No LSEG model version rows found.");

  const scenarios = query(
    "SELECT scenario, COUNT(*) AS count FROM assumption_sets WHERE ticker = ? AND modelVersion = ? GROUP BY scenario",
    ["LSEG.L", "lseg_v1_backend_pilot"],
  );
  const scenarioMap = new Map(scenarios.map((row) => [row.scenario, row.count]));
  for (const scenario of ["Bear", "Base", "Bull"]) {
    scenarioMap.get(scenario) > 0
      ? pass(`Assumption set exists: ${scenario}`)
      : fail(`Assumption set missing: ${scenario}`, "Seed must create Bear/Base/Bull defaults for selectable historical runs.");
  }

  const latestEvent = query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC LIMIT 1", ["LSEG.L"])[0];
  if (!latestEvent) {
    fail("Latest event available", "No latest event can be selected.");
  } else {
    pass("Latest event available", `${latestEvent.id} (${latestEvent.eventDate}, ${latestEvent.eventType})`);
    try {
      const valuation = await createLsegValuationRun({
        eventId: latestEvent.id,
        scenario: "Base",
        modelVersion: "lseg_v1_backend_pilot",
      });
      const result = valuation.valuationResult;
      const fairValue = result.recommendedFairValue ?? result.blendedFairValue ?? null;
      if (isFiniteNumber(result.currentPrice) && isFiniteNumber(fairValue)) {
        pass("Backend valuation run created", `currentPrice=${result.currentPrice}; fairValue=${fairValue}`);
      } else {
        fail("Backend valuation run created", "Valuation result did not return finite currentPrice and fairValue.");
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
    ["LSEG.L", "Base", "lseg_v1_backend_pilot"],
  );
  const historicalRunEventIds = new Set(baseHistoricalRuns.map((row) => row.reportingEventId));
  if (eventCount > 0 && historicalRunEventIds.size >= eventCount) {
    pass("Historical Base valuations exist for each event", `${historicalRunEventIds.size}/${eventCount} events`);
  } else {
    fail(
      "Historical Base valuations exist for each event",
      `${historicalRunEventIds.size}/${eventCount} events. Run npm run lseg:backend:backfill-valuations -- --base-only.`,
    );
  }

  const finiteHistoricalRuns = query(
    `SELECT COUNT(DISTINCT reportingEventId) AS count
     FROM valuation_runs
     WHERE ticker = ?
       AND scenario = 'Base'
       AND modelVersion = 'lseg_v1_backend_pilot'
       AND currentPrice IS NOT NULL
       AND fairValue IS NOT NULL
       AND targetPrice3Y IS NOT NULL
       AND expectedShareholderCagr IS NOT NULL`,
    ["LSEG.L"],
  )[0]?.count ?? 0;
  finiteHistoricalRuns >= eventCount
    ? pass("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${eventCount} Base runs have price, fair value, target and CAGR`)
    : fail("Historical valuation output fields are persisted", `${finiteHistoricalRuns}/${eventCount} complete Base valuation rows.`);

  const baseFairValues = query(
    `SELECT ROUND(fairValue, 2) AS fairValue
     FROM valuation_runs
     WHERE ticker = ?
       AND scenario = 'Base'
       AND modelVersion = 'lseg_v1_backend_pilot'
       AND fairValue IS NOT NULL`,
    ["LSEG.L"],
  );
  const distinctBaseFairValues = new Set(baseFairValues.map((row) => row.fairValue));
  distinctBaseFairValues.size > 5
    ? pass("Historical Base fair values are not a flat line", `${distinctBaseFairValues.size} distinct rounded fair values`)
    : fail("Historical Base fair values are not a flat line", `Only ${distinctBaseFairValues.size} distinct rounded fair values.`);

  const mixedCurrencyPeerMisuse = query(
    `SELECT peerTicker, currency, absoluteValueUse
     FROM peer_snapshots
     WHERE ticker = ?
       AND currency IS NOT NULL
       AND currency != 'GBp'
       AND (absoluteValueUse IS NULL OR absoluteValueUse NOT LIKE '%metadata_only%')`,
    ["LSEG.L"],
  );
  mixedCurrencyPeerMisuse.length === 0
    ? pass("Peer absolute values are metadata-only across mixed currencies")
    : fail("Peer absolute values are metadata-only across mixed currencies", JSON.stringify(mixedCurrencyPeerMisuse));

  const transcriptModelReady = query(
    "SELECT COUNT(*) AS count FROM transcript_extractions WHERE ticker = ? AND (modelReady != 0 OR valuationImpactAllowed != 0)",
    ["LSEG.L"],
  )[0]?.count ?? 0;
  transcriptModelReady === 0
    ? pass("Transcript candidates are research-only")
    : fail("Transcript candidates are research-only", `${transcriptModelReady} transcript extraction rows are model-ready or valuation-impacting.`);

  const guidancePromoted = query(
    `SELECT COUNT(*) AS count
     FROM guidance_items
     WHERE ticker = ?
       AND valuationImpactAllowed != 0
       AND (guidanceType = 'candidate' OR humanReviewStatus IN ('needs_review', 'unreviewed'))`,
    ["LSEG.L"],
  )[0]?.count ?? 0;
  guidancePromoted === 0
    ? pass("Guidance candidates are not valuation-impacting")
    : fail("Guidance candidates are not valuation-impacting", `${guidancePromoted} candidate guidance rows allow valuation impact.`);

  const annualEvents = count("reporting_events", "ticker = 'LSEG.L' AND eventType IN ('annual_report', 'fy_preliminary_results')");
  annualEvents > 0 ? pass("Annual/FY event model supported", `${annualEvents} rows`) : warn("Annual/FY event model supported", "No annual/FY reporting event imported yet.");

  const tradingEvents = count("reporting_events", "ticker = 'LSEG.L' AND eventType IN ('q1_trading_update', 'h1_interim_results', 'q3_trading_update')");
  tradingEvents > 0 ? pass("Interim/trading update event model supported", `${tradingEvents} rows`) : warn("Interim/trading update event model supported", "No Q1/H1/Q3 reporting event imported yet.");

  const oldAnnuals = query(
    `SELECT fiscalYear, COUNT(*) AS count
     FROM reporting_events
     WHERE ticker = ?
       AND fiscalYear BETWEEN 2018 AND 2021
       AND eventType IN ('annual_report', 'fy_preliminary_results')
     GROUP BY fiscalYear`,
    ["LSEG.L"],
  );
  const annualMap = new Map(oldAnnuals.map((row) => [row.fiscalYear, row.count]));
  const missingOldAnnuals = [2018, 2019, 2020, 2021].filter((year) => !annualMap.get(year));
  missingOldAnnuals.length === 0
    ? pass("FY2018-FY2021 annual/preliminary events imported", "Historical annual source layer is present")
    : fail("FY2018-FY2021 annual/preliminary events imported", `Missing fiscal years: ${missingOldAnnuals.join(", ")}`);

  const visibleHistoryEvents = count("reporting_events", "ticker = 'LSEG.L' AND eventDate >= '2020-01-01' AND eventDate <= '2026-12-31'");
  visibleHistoryEvents >= 12
    ? pass("Frontend 2020-current history coverage", `${visibleHistoryEvents} disclosure events`)
    : fail("Frontend 2020-current history coverage", `${visibleHistoryEvents} events. Seed should include FY/H1/Q1/Q3 from 2020 onward.`);

  const eventRunRateRows = count("financial_periods", "ticker = 'LSEG.L' AND periodType = 'reporting_event_run_rate' AND sourceType = 'forecast_assumption'");
  eventRunRateRows >= 12
    ? pass("Event-visible run-rate valuation inputs imported", `${eventRunRateRows} Q/H trading update rows`)
    : fail("Event-visible run-rate valuation inputs imported", `${eventRunRateRows} rows. Q1/H1/Q3 events need non-official forecast-assumption snapshots.`);

  const baseRunsForLeakageAudit = query(
    `SELECT e.id AS eventId, e.eventDate, e.fiscalPeriod, e.eventType, v.fairValue, v.dataSnapshotJson, v.sensitivityTablesJson, v.createdAt
     FROM reporting_events e
     JOIN valuation_runs v ON v.ticker = e.ticker AND v.reportingEventId = e.id
     WHERE e.ticker = ?
       AND v.scenario = 'Base'
       AND v.modelVersion = 'lseg_v1_backend_pilot'
     ORDER BY e.eventDate ASC, v.createdAt DESC`,
    ["LSEG.L"],
  );
  const latestBaseRunByEvent = new Map();
  for (const row of baseRunsForLeakageAudit) {
    if (!latestBaseRunByEvent.has(row.eventId)) latestBaseRunByEvent.set(row.eventId, row);
  }
  const financialPeriodById = new Map(
    query("SELECT periodId, asOfDate FROM financial_periods WHERE ticker = ?", ["LSEG.L"])
      .map((row) => [row.periodId, row]),
  );
  const futureLeakedRuns = [...latestBaseRunByEvent.values()].filter((row) => {
    const snapshot = JSON.parse(row.dataSnapshotJson || "{}");
    const period = financialPeriodById.get(snapshot.valuationPeriodId);
    return period?.asOfDate && period.asOfDate > row.eventDate;
  });
  futureLeakedRuns.length === 0
    ? pass("Historical valuation runs do not use future financial periods", `${latestBaseRunByEvent.size} Base event runs checked`)
    : fail("Historical valuation runs do not use future financial periods", JSON.stringify(futureLeakedRuns.slice(0, 5)));

  const postTradeKnownRuns = query(
    `SELECT e.id AS eventId, e.eventDate, v.sensitivityTablesJson
     FROM reporting_events e
     JOIN valuation_runs v ON v.ticker = e.ticker AND v.reportingEventId = e.id
     WHERE e.ticker = ?
       AND e.eventDate >= '2025-10-23'
       AND v.scenario = 'Base'
       AND v.modelVersion = 'lseg_v1_backend_pilot'
     ORDER BY e.eventDate DESC`,
    ["LSEG.L"],
  );
  const postTradeBridgeRuns = postTradeKnownRuns.filter((row) =>
    String(row.sensitivityTablesJson ?? "").includes("Post Trade / SwapClear forward economics bridge"),
  );
  if (postTradeKnownRuns.length > 0 && postTradeBridgeRuns.length === postTradeKnownRuns.length) {
    pass("Post Trade forward economics bridge persisted for known events", `${postTradeBridgeRuns.length}/${postTradeKnownRuns.length} known-after-transaction runs`);
  } else if (postTradeKnownRuns.length === 0) {
    warn("Post Trade forward economics bridge persisted for known events", "No post-2025-10-23 valuation runs exist yet.");
  } else {
    fail("Post Trade forward economics bridge persisted for known events", `${postTradeBridgeRuns.length}/${postTradeKnownRuns.length} runs include the bridge table.`);
  }

  const modernTradingRunAudit = [...latestBaseRunByEvent.values()].filter((row) =>
    row.eventDate >= "2024-01-01"
      && ["q1_trading_update", "h1_interim_results", "q3_trading_update"].includes(row.eventType),
  );
  const staleModernTradingRuns = modernTradingRunAudit.filter((row) => {
    const match = String(row.fiscalPeriod).toLowerCase().match(/(q1|h1|q3)\s*(20\d{2})/);
    const expectedPeriodId = match ? `${match[1]}_${match[2]}_snapshot` : null;
    const snapshot = JSON.parse(row.dataSnapshotJson || "{}");
    return expectedPeriodId && snapshot.valuationPeriodId !== expectedPeriodId;
  });
  staleModernTradingRuns.length === 0
    ? pass("Modern Q/H valuation runs use event-visible run-rate snapshots", `${modernTradingRunAudit.length} Q1/H1/Q3 event runs checked`)
    : fail("Modern Q/H valuation runs use event-visible run-rate snapshots", JSON.stringify(staleModernTradingRuns.map((row) => {
      const snapshot = JSON.parse(row.dataSnapshotJson || "{}");
      return {
        eventId: row.eventId,
        fiscalPeriod: row.fiscalPeriod,
        eventDate: row.eventDate,
        valuationPeriodId: snapshot.valuationPeriodId,
        fairValue: row.fairValue,
      };
    }).slice(0, 8)));

  const q12026Run = latestBaseRunByEvent.get("lseg_q1_2026_trading_update_2026-04-23");
  const fy2025Run = latestBaseRunByEvent.get("lseg-fy2025-annual-report") ?? latestBaseRunByEvent.get("lseg_fy_2025_preliminary_results_2026-02-26");
  if (q12026Run && fy2025Run) {
    const q1Snapshot = parseJson(q12026Run.dataSnapshotJson, {});
    const q1Semantics = q1Snapshot.valuationSemantics ?? {};
    const dcfAudit = sensitivityTableMap(q12026Run, "Model QA: DCF year-one base audit");
    const balanceSheetAudit = sensitivityTableMap(q12026Run, "Model QA: balance-sheet bridge audit");
    const postTradeQ1 = sensitivityTableMap(q12026Run, "Model QA: Post Trade driver audit");
    const postTradeFy = sensitivityTableMap(fy2025Run, "Model QA: Post Trade driver audit");
    const runRateRevenue = Number(dcfAudit["Event run-rate revenue"]);
    const yearOneAfter = Number(dcfAudit["Year-one DCF revenue after fix"]);
    const yearOneBefore = Number(dcfAudit["Year-one DCF revenue before fix"]);
    const carriedLease = Number(balanceSheetAudit["Carried-forward lease liabilities"]);
    const leaseLiabilities = Number(balanceSheetAudit["Lease liabilities"]);
    const postTradeUpliftQ1 = Number(postTradeQ1["Post Trade layer uplift"]);
    const postTradeUpliftFy = Number(postTradeFy["Post Trade layer uplift"]);

    q1Semantics.isAnnualizedRunRate && q1Semantics.isSameYearForecastAnchor && q1Semantics.dcfYearOneGrowthSuppressed
      ? pass("Q1 2026 run-rate valuation semantics suppress same-year DCF growth", `forecastStartYear=${q1Semantics.forecastStartYear}; firstGrowthYear=${q1Semantics.firstGrowthYear}`)
      : fail("Q1 2026 run-rate valuation semantics suppress same-year DCF growth", JSON.stringify(q1Semantics));

    yearOneAfter <= runRateRevenue * 1.001 && yearOneBefore > yearOneAfter
      ? pass("Q1 2026 DCF year-one revenue avoids double compounding", `before=${yearOneBefore}; after=${yearOneAfter}; runRate=${runRateRevenue}`)
      : fail("Q1 2026 DCF year-one revenue avoids double compounding", JSON.stringify(dcfAudit));

    carriedLease >= 600 && leaseLiabilities >= 600
      ? pass("Q1 2026 lease liabilities carry forward from latest full-year actual", `lease=${leaseLiabilities}; carried=${carriedLease}`)
      : fail("Q1 2026 lease liabilities carry forward from latest full-year actual", JSON.stringify(balanceSheetAudit));

    q12026Run.fairValue > fy2025Run.fairValue && q12026Run.fairValue < 124.84
      ? pass("Q1 2026 post-fix FV is higher than FY2025 but below pre-fix aggressive value", `FY2025=${fy2025Run.fairValue}; Q1=${q12026Run.fairValue}`)
      : fail("Q1 2026 post-fix FV is higher than FY2025 but below pre-fix aggressive value", `FY2025=${fy2025Run.fairValue}; Q1=${q12026Run.fairValue}; preFix=124.84`);

    Math.abs(postTradeUpliftQ1 - postTradeUpliftFy) < 0.25
      ? pass("Post Trade layer remains a small overlay versus Q1 run-rate change", `FY2025=${postTradeUpliftFy}; Q1=${postTradeUpliftQ1}`)
      : fail("Post Trade layer remains a small overlay versus Q1 run-rate change", `FY2025=${postTradeUpliftFy}; Q1=${postTradeUpliftQ1}`);
  } else {
    fail("Q1 2026 model QA valuation runs exist", "Backfill Base valuation runs for FY2025 and Q1 2026.");
  }

  const staleFutureGuidanceRuns = [...latestBaseRunByEvent.values()].filter((row) => {
    const snapshot = JSON.parse(row.dataSnapshotJson || "{}");
    return row.eventDate < "2026-02-26" && (snapshot.guidanceFcfFloor ?? 0) >= 2600;
  });
  staleFutureGuidanceRuns.length === 0
    ? pass("Historical runs do not reuse current FY2026 FCF guidance", `${latestBaseRunByEvent.size} Base event runs checked`)
    : fail("Historical runs do not reuse current FY2026 FCF guidance", JSON.stringify(staleFutureGuidanceRuns.map((row) => {
      const snapshot = JSON.parse(row.dataSnapshotJson || "{}");
      return {
        eventId: row.eventId,
        eventDate: row.eventDate,
        valuationPeriodId: snapshot.valuationPeriodId,
        guidanceFcfFloor: snapshot.guidanceFcfFloor,
      };
    }).slice(0, 8)));

  const shareCountMismatches = [...latestBaseRunByEvent.values()].filter((row) => {
    const snapshot = JSON.parse(row.dataSnapshotJson || "{}");
    const financialShares = snapshot.financialWeightedAverageShares;
    const assumptionShares = snapshot.assumptionDilutedShares;
    return financialShares && assumptionShares && Math.abs(assumptionShares - financialShares) / Math.max(financialShares, 1) > 0.03;
  });
  shareCountMismatches.length === 0
    ? pass("Valuation share count matches financial snapshot share base", `${latestBaseRunByEvent.size} Base event runs checked`)
    : fail("Valuation share count matches financial snapshot share base", JSON.stringify(shareCountMismatches.map((row) => {
      const snapshot = JSON.parse(row.dataSnapshotJson || "{}");
      return {
        eventId: row.eventId,
        eventDate: row.eventDate,
        valuationPeriodId: snapshot.valuationPeriodId,
        assumptionDilutedShares: snapshot.assumptionDilutedShares,
        financialWeightedAverageShares: snapshot.financialWeightedAverageShares,
        marketSharesOutstanding: snapshot.marketSharesOutstanding,
      };
    }).slice(0, 8)));

  const dailyAnchoredModernRuns = [...latestBaseRunByEvent.values()].filter((row) => row.eventDate >= "2021-05-10");
  const missingDailyPriceAnchor = dailyAnchoredModernRuns.filter((row) => {
    const snapshot = JSON.parse(row.dataSnapshotJson || "{}");
    return !snapshot.asOfPriceSource?.priceDate;
  });
  missingDailyPriceAnchor.length === 0
    ? pass("Historical as-of price uses daily market data where available", `${dailyAnchoredModernRuns.length} modern Base event runs checked`)
    : fail("Historical as-of price uses daily market data where available", JSON.stringify(missingDailyPriceAnchor.map((row) => ({
      eventId: row.eventId,
      eventDate: row.eventDate,
    })).slice(0, 8)));

  try {
    const backtest = runLsegBacktest({ startDate: "2021-05-10", endDate: "2026-05-10", benchmarkTicker: "SPY" });
    const stockMetrics = backtest.metrics?.lsegBuyHold ?? {};
    const spyMetrics = backtest.metrics?.spy ?? {};
    const metricValues = [
      stockMetrics.cagr,
      stockMetrics.maxDrawdown,
      stockMetrics.sharpe,
      stockMetrics.volatility,
      spyMetrics.cagr,
      spyMetrics.maxDrawdown,
      spyMetrics.sharpe,
      spyMetrics.volatility,
    ];
    backtest.status === "completed" && backtest.curve?.length >= 500 && metricValues.every(isFiniteNumber)
      ? pass("LSEG.L vs SPY backtest returns finite metrics", `curve=${backtest.curve.length}; stockCagr=${stockMetrics.cagr}; spyCagr=${spyMetrics.cagr}`)
      : fail("LSEG.L vs SPY backtest returns finite metrics", JSON.stringify(backtest).slice(0, 1200));
  } catch (error) {
    fail("LSEG.L vs SPY backtest returns finite metrics", error instanceof Error ? error.message : String(error));
  }

  try {
    const capitalReturns = getLsegCapitalReturnHistory({ years: 8 });
    const rows = capitalReturns.rows ?? [];
    const completeRows = rows.filter((row) =>
      isFiniteNumber(row.fiscalYear) &&
      isFiniteNumber(row.dividendPerSharePence) &&
      isFiniteNumber(row.dividendCashCost) &&
      isFiniteNumber(row.buybackAmount) &&
      isFiniteNumber(row.equityFreeCashFlow) &&
      isFiniteNumber(row.totalCapitalReturn),
    );
    rows.length === 8 && completeRows.length === 8
      ? pass("Backend capital-return history has 8 annual rows", `${rows[0]?.fiscalYear}-${rows[rows.length - 1]?.fiscalYear}; latest DPS=${capitalReturns.summary.latestDividendPerSharePence}p; latest buyback=${capitalReturns.summary.latestBuybackAmount}`)
      : fail("Backend capital-return history has 8 annual rows", JSON.stringify({ rows: rows.length, completeRows: completeRows.length, warnings: capitalReturns.warnings }));
    const hasStackedCapitalReturnAndFcf =
      rows.some((row) => (row.dividendCashCost ?? 0) > 0) &&
      rows.some((row) => (row.buybackAmount ?? 0) > 0) &&
      rows.every((row) => isFiniteNumber(row.equityFreeCashFlow) && row.equityFreeCashFlow > 0);
    hasStackedCapitalReturnAndFcf
      ? pass(
          "Backend capital-return chart has stacked return and FCF series",
          `cumulativeDividend=${capitalReturns.summary.cumulativeDividendCash}; cumulativeBuybacks=${capitalReturns.summary.cumulativeBuybacks}; cumulativeFcf=${capitalReturns.summary.cumulativeFcf}`,
        )
      : fail("Backend capital-return chart has stacked return and FCF series", JSON.stringify(capitalReturns.summary));
    const forward = capitalReturns.forwardExpectation;
    forward?.isForecast === true &&
      forward.sourceType === "forecast_assumption" &&
      forward.fiscalYear === 2026 &&
      isFiniteNumber(forward.dividendCashCost) &&
      isFiniteNumber(forward.buybackAmount) &&
      isFiniteNumber(forward.equityFreeCashFlow) &&
      isFiniteNumber(forward.totalCapitalReturn)
      ? pass("Backend capital-return history includes 2026E forecast bar", `DPS=${forward.dividendPerSharePence}p; dividendCash=${forward.dividendCashCost}; buyback=${forward.buybackAmount}; fcf=${forward.equityFreeCashFlow}`)
      : fail("Backend capital-return history includes 2026E forecast bar", JSON.stringify(forward));
  } catch (error) {
    fail("Backend capital-return history has 8 annual rows", error instanceof Error ? error.message : String(error));
  }

  const missing2025EventVisibleCapitalInputs = query(
    `SELECT periodId, asOfDate, cashInterestExpense, minorityInterest, buybackAmount
     FROM financial_periods
     WHERE ticker = ?
       AND periodId IN ('q1_2025_snapshot', 'h1_2025_snapshot', 'q3_2025_snapshot')
       AND (cashInterestExpense IS NULL OR minorityInterest IS NULL OR buybackAmount IS NULL OR buybackAmount <= 0)`,
    ["LSEG.L"],
  );
  missing2025EventVisibleCapitalInputs.length === 0
    ? pass("2025 Q/H event snapshots carry capital-return and finance-cost inputs")
    : fail("2025 Q/H event snapshots carry capital-return and finance-cost inputs", JSON.stringify(missing2025EventVisibleCapitalInputs));

  const preRefinitivBridgeRows = count("segment_financials", "ticker = 'LSEG.L' AND splitSource = 'pre_refinitiv_taxonomy_bridge'");
  preRefinitivBridgeRows > 0
    ? pass("Pre-Refinitiv to post-Refinitiv segment bridge imported", `${preRefinitivBridgeRows} segment rows`)
    : fail("Pre-Refinitiv to post-Refinitiv segment bridge imported", "No pre-Refinitiv bridge rows found in segment_financials.");

  const segmentReconciliationRows = query(
    `SELECT
       fp.periodId,
       fp.revenue AS groupRevenue,
       fp.adjustedEbitda AS groupEbitda,
       SUM(CASE WHEN NOT (sf.segment = 'Markets' AND sf.taxonomy = 'reported_segment' AND EXISTS (
         SELECT 1 FROM segment_financials child
         WHERE child.ticker = sf.ticker
           AND child.periodId = sf.periodId
           AND child.taxonomy = 'analytical_split'
           AND child.parentReportedSegment = 'Markets'
       )) THEN sf.revenue ELSE 0 END) AS valuationRevenue,
       SUM(CASE WHEN NOT (sf.segment = 'Markets' AND sf.taxonomy = 'reported_segment' AND EXISTS (
         SELECT 1 FROM segment_financials child
         WHERE child.ticker = sf.ticker
           AND child.periodId = sf.periodId
           AND child.taxonomy = 'analytical_split'
           AND child.parentReportedSegment = 'Markets'
       )) THEN sf.adjustedEbitda ELSE 0 END) AS valuationEbitda
     FROM financial_periods fp
     JOIN segment_financials sf ON sf.ticker = fp.ticker AND sf.periodId = fp.periodId
     WHERE fp.ticker = ?
       AND fp.asOfDate >= '2021-01-01'
     GROUP BY fp.periodId, fp.revenue, fp.adjustedEbitda`,
    ["LSEG.L"],
  );
  const badSegmentReconciliations = segmentReconciliationRows.filter((row) => {
    const revenueGap = Math.abs((row.valuationRevenue ?? 0) - (row.groupRevenue ?? 0)) / Math.max(Math.abs(row.groupRevenue ?? 0), 1);
    const ebitdaGap = Math.abs((row.valuationEbitda ?? 0) - (row.groupEbitda ?? 0)) / Math.max(Math.abs(row.groupEbitda ?? 0), 1);
    return revenueGap > 0.01 || ebitdaGap > 0.01;
  });
  badSegmentReconciliations.length === 0
    ? pass("Valuation segment rows reconcile after Markets analytical split", `${segmentReconciliationRows.length} periods checked`)
    : fail("Valuation segment rows reconcile after Markets analytical split", JSON.stringify(badSegmentReconciliations.slice(0, 5)));

  const manualPriceRows = query(
    `SELECT COUNT(*) AS count
     FROM market_snapshots
     WHERE ticker = ?
       AND asOfDate >= '2020-01-01'
       AND rawJson LIKE '%manual_historical_price_seed%'`,
    ["LSEG.L"],
  )[0]?.count ?? 0;
  manualPriceRows > 0
    ? warn("Pre-2021 as-of prices use low-confidence manual seeds", `${manualPriceRows} market snapshots need future vendor backfill`)
    : pass("As-of market prices use local market cache where available");

  const health = await getHealthStatus();
  if (health.ok && health.body?.lsegBackendPilot) {
    pass("API health endpoint responds", "http://127.0.0.1:8787/api/health");
  } else if (health.skipped) {
    warn("API health endpoint responds", `API server not running or unreachable (${health.reason}). Start it with npm run api:dev.`);
  } else {
    fail("API health endpoint responds", "API server responded without the expected health payload.");
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
