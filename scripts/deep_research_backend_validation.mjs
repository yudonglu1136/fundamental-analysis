#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { DEEP_RESEARCH_BACKEND_SLUGS, getDeepResearchBackendProfile } from "../modules/deepResearchBackend/config.mjs";
import { deepResearchStockBackendRegistry } from "../apps/api/src/services/deepResearchBackendService.mjs";

const sqlPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
conn.row_factory = sqlite3.Row
try:
    out = {}
    for name, sql in payload["queries"].items():
        out[name] = [dict(row) for row in conn.execute(sql).fetchall()]
    print(json.dumps(out))
finally:
    conn.close()
`;

function queryBundle(dbPath, queries) {
  const result = spawnSync("python3", ["-c", sqlPython], {
    input: JSON.stringify({ dbPath, queries }),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function parseArgs(argv) {
  const tickers = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--ticker") tickers.push(argv[++index]);
    else if (argv[index] === "--tickers") tickers.push(...String(argv[++index] ?? "").split(","));
  }
  return tickers.map((ticker) => ticker.trim().toLowerCase()).filter(Boolean);
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const selected = parseArgs(process.argv.slice(2));
const tickers = selected.length ? selected : DEEP_RESEARCH_BACKEND_SLUGS;
const summary = [];
let hasFailure = false;

for (const slug of tickers) {
  const profile = getDeepResearchBackendProfile(slug);
  const failures = [];
  assert(Boolean(profile), `Unknown profile ${slug}`, failures);
  assert(profile && existsSync(profile.dbPath), `${slug} DB does not exist at ${profile?.dbPath}`, failures);
  if (!failures.length) {
    const data = queryBundle(profile.dbPath, {
      counts: `SELECT 'reporting_events' AS tableName, COUNT(*) AS count FROM reporting_events
               UNION ALL SELECT 'financial_periods', COUNT(*) FROM financial_periods
               UNION ALL SELECT 'segment_financials', COUNT(*) FROM segment_financials
               UNION ALL SELECT 'source_documents', COUNT(*) FROM source_documents
               UNION ALL SELECT 'transcript_extractions', COUNT(*) FROM transcript_extractions
               UNION ALL SELECT 'assumption_sets', COUNT(*) FROM assumption_sets
               UNION ALL SELECT 'valuation_runs', COUNT(*) FROM valuation_runs
               UNION ALL SELECT 'daily_price_bars', COUNT(*) FROM daily_price_bars
               UNION ALL SELECT 'validation_warnings', COUNT(*) FROM validation_warnings`,
      valuationStats: "SELECT COUNT(*) AS count, MIN(fairValue) AS minFairValue, MAX(fairValue) AS maxFairValue FROM valuation_runs WHERE scenario = 'Base'",
      eventStats: "SELECT COUNT(*) AS count, MIN(eventDate) AS minDate, MAX(eventDate) AS maxDate FROM reporting_events",
      priceStats: `SELECT ticker, COUNT(*) AS count, MIN(priceDate) AS minDate, MAX(priceDate) AS maxDate, SUM(CASE WHEN sourceType LIKE '%proxy%' THEN 1 ELSE 0 END) AS proxyRows FROM daily_price_bars GROUP BY ticker`,
    });
    const countMap = Object.fromEntries(data.counts.map((row) => [row.tableName, row.count]));
    const eventStats = data.eventStats[0];
    const valuationStats = data.valuationStats[0];
    assert(countMap.reporting_events >= 33, `${profile.ticker} needs at least 33 quarterly events`, failures);
    assert(countMap.financial_periods >= 33, `${profile.ticker} needs financial periods`, failures);
    assert(countMap.segment_financials >= 90, `${profile.ticker} needs segment financials`, failures);
    assert(countMap.transcript_extractions >= 120, `${profile.ticker} needs quarterly question/transcript extraction rows`, failures);
    assert(countMap.assumption_sets >= 99, `${profile.ticker} needs Bear/Base/Bull assumption sets for each event`, failures);
    assert(valuationStats.count >= eventStats.count, `${profile.ticker} needs Base valuation run for each event`, failures);
    assert(Number.isFinite(Number(valuationStats.minFairValue)) && Number.isFinite(Number(valuationStats.maxFairValue)), `${profile.ticker} valuation outputs must be finite`, failures);
    assert(Number(valuationStats.maxFairValue) > Number(valuationStats.minFairValue), `${profile.ticker} fair values must vary by event`, failures);
    assert(data.priceStats.some((row) => row.ticker === profile.ticker && row.count >= 33), `${profile.ticker} price bars missing`, failures);
    assert(data.priceStats.some((row) => row.ticker === "SPY" && row.count >= 33), `${profile.ticker} SPY price bars missing`, failures);
    assert(countMap.validation_warnings >= 3, `${profile.ticker} source/proxy warnings missing`, failures);

    const backend = deepResearchStockBackendRegistry[slug];
    const backtest = backend?.runBacktest({ startDate: profile.historyStartDate, endDate: profile.latestDate });
    assert(backtest?.status === "completed" && Number.isFinite(backtest?.metrics?.stock?.cagr) && Number.isFinite(backtest?.metrics?.spy?.cagr), `${profile.ticker} backtest must return finite stock and SPY metrics`, failures);
    summary.push({
      slug,
      ticker: profile.ticker,
      dbPath: profile.dbPath,
      counts: countMap,
      quarterlyCoverage: `${eventStats.minDate} to ${eventStats.maxDate}`,
      valuationRuns: valuationStats.count,
      priceStats: data.priceStats,
      warnings: backtest?.warnings ?? [],
      failures,
    });
  } else {
    summary.push({ slug, failures });
  }
  if (failures.length) hasFailure = true;
}

console.log(JSON.stringify({ ok: !hasFailure, summary }, null, 2));
if (hasFailure) process.exitCode = 1;
