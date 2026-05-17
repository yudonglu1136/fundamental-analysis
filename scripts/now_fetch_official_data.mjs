#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const MARKET_DIR = path.resolve("data/local/now/market");
const CHART_URLS = {
  NOW: "https://query1.finance.yahoo.com/v8/finance/chart/NOW?range=10y&interval=1d&events=history%7Cdiv%7Csplit&includeAdjustedClose=true",
  SPY: "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=10y&interval=1d&events=history%7Cdiv%7Csplit&includeAdjustedClose=true",
};

async function fetchYahooChart(ticker, url) {
  const filePath = path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`);
  let payload;
  let cacheFallback = false;
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 fundamental-analysis local data refresh",
        accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    payload = await response.json();
  } catch (error) {
    const curl = spawnSync("curl", ["-L", "-A", "Mozilla/5.0 fundamental-analysis local data refresh", "-s", url], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (curl.status !== 0 || !curl.stdout) {
      try {
        payload = JSON.parse(await readFile(filePath, "utf8"));
        cacheFallback = true;
      } catch {
        throw new Error(`${ticker} Yahoo chart fetch failed: ${error instanceof Error ? error.message : String(error)}; curl fallback failed: ${curl.stderr || curl.stdout}`);
      }
    } else {
      payload = JSON.parse(curl.stdout);
    }
  }
  const result = payload.chart?.result?.[0];
  const error = payload.chart?.error;
  const timestamps = result?.timestamp ?? [];
  if (error) throw new Error(`${ticker} Yahoo chart error: ${JSON.stringify(error)}`);
  if (!timestamps.length) throw new Error(`${ticker} Yahoo chart payload has no timestamps.`);
  if (!cacheFallback) await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    ticker,
    filePath,
    status: cacheFallback ? "cached" : "fetched",
    symbol: result.meta?.symbol ?? ticker,
    currency: result.meta?.currency ?? null,
    rowCount: timestamps.length,
    firstTimestamp: timestamps[0],
    lastTimestamp: timestamps[timestamps.length - 1],
    regularMarketPrice: result.meta?.regularMarketPrice ?? null,
  };
}

async function main() {
  await mkdir(MARKET_DIR, { recursive: true });
  const fetched = [];
  for (const [ticker, url] of Object.entries(CHART_URLS)) {
    fetched.push(await fetchYahooChart(ticker, url));
  }
  console.log(JSON.stringify({
    ticker: "NOW",
    status: "fetched",
    source: "Yahoo Finance chart API",
    note: "Use npm run now:backend:import-prices after this fetch to promote these files into daily_price_bars.",
    fetched,
    officialFilingSources: [
      "https://investors.servicenow.com/financials/sec-filings/default.aspx",
      "https://www.sec.gov/edgar/browse/?CIK=1373715",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
