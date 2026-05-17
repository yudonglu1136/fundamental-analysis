#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const MARKET_DIR = path.resolve("data/local/asml/market");
const OUTPUT_TS = path.resolve("src/stocks/asml/marketPrices.ts");
const CHART_URLS = {
  ASML: "https://query1.finance.yahoo.com/v8/finance/chart/ASML?range=10y&interval=1d&events=history%7Cdiv%7Csplit&includeAdjustedClose=true",
  SPY: "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=10y&interval=1d&events=history%7Cdiv%7Csplit&includeAdjustedClose=true",
};
const ASML_HISTORY_EVENT_DATES = [
  "2022-03-31",
  "2022-06-30",
  "2022-09-30",
  "2022-12-31",
  "2023-03-31",
  "2023-06-30",
  "2023-09-30",
  "2023-12-31",
  "2024-03-31",
  "2024-06-30",
  "2024-09-30",
  "2024-12-31",
  "2025-03-31",
  "2025-06-30",
  "2025-09-30",
  "2025-12-31",
];

function isoDateFromUnix(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function fetchYahooChart(ticker, url) {
  let payload;
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
      maxBuffer: 30 * 1024 * 1024,
    });
    if (curl.status !== 0 || !curl.stdout) {
      throw new Error(`${ticker} Yahoo chart fetch failed: ${error instanceof Error ? error.message : String(error)}; curl fallback failed: ${curl.stderr || curl.stdout}`);
    }
    payload = JSON.parse(curl.stdout);
  }

  const result = payload.chart?.result?.[0];
  const error = payload.chart?.error;
  if (error) throw new Error(`${ticker} Yahoo chart error: ${JSON.stringify(error)}`);
  if (!result?.timestamp?.length) throw new Error(`${ticker} Yahoo chart payload has no timestamps.`);

  await writeFile(path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`), `${JSON.stringify(payload, null, 2)}\n`);
  return { ticker, url, payload, result };
}

function parseBars(ticker, result, url) {
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  return result.timestamp
    .map((timestamp, index) => {
      const close = quote.close?.[index] ?? null;
      const adjustedClose = adjclose[index] ?? close;
      const adjustedCloseWasProxy = adjclose[index] == null && close != null;
      if (!Number.isFinite(adjustedClose)) return null;
      return {
        ticker,
        priceDate: isoDateFromUnix(timestamp),
        close: Number(close ?? adjustedClose),
        adjustedClose: Number(adjustedClose),
        source: "Yahoo Finance chart API",
        sourceType: adjustedCloseWasProxy ? "market_data_unadjusted_proxy" : "market_data",
        rawJson: { sourceUrl: url, adjustedCloseWasProxy },
      };
    })
    .filter(Boolean);
}

function annualHistoryRows(rows, years = 8) {
  if (!rows.length) return [];
  const latestYear = Number(rows[rows.length - 1].priceDate.slice(0, 4));
  const completedEndYear = latestYear - 1;
  const startYear = completedEndYear - years + 1;
  const output = [];

  for (let year = startYear; year <= completedEndYear; year += 1) {
    const yearRows = rows.filter((row) => Number(row.priceDate.slice(0, 4)) === year);
    if (!yearRows.length) continue;
    const first = yearRows[0];
    const last = yearRows[yearRows.length - 1];
    const high = Math.max(...yearRows.map((row) => row.adjustedClose));
    const low = Math.min(...yearRows.map((row) => row.adjustedClose));
    let peak = first.adjustedClose;
    let maxDrawdown = 0;
    for (const row of yearRows) {
      peak = Math.max(peak, row.adjustedClose);
      maxDrawdown = Math.min(maxDrawdown, row.adjustedClose / peak - 1);
    }
    output.push({
      year,
      startDate: first.priceDate,
      endDate: last.priceDate,
      startPrice: Number(first.adjustedClose.toFixed(4)),
      endPrice: Number(last.adjustedClose.toFixed(4)),
      annualReturn: Number((last.adjustedClose / first.adjustedClose - 1).toFixed(6)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      maxDrawdown: Number(maxDrawdown.toFixed(6)),
    });
  }
  return output;
}

function compareAnnualReturns(asmlAnnual, spyAnnual) {
  const spyByYear = new Map(spyAnnual.map((row) => [row.year, row]));
  return asmlAnnual
    .map((asml) => {
      const spy = spyByYear.get(asml.year);
      if (!spy) return null;
      return {
        year: asml.year,
        asmlReturn: asml.annualReturn,
        spyReturn: spy.annualReturn,
        relativeReturn: Number((asml.annualReturn - spy.annualReturn).toFixed(6)),
        asmlMaxDrawdown: asml.maxDrawdown,
        spyMaxDrawdown: spy.maxDrawdown,
      };
    })
    .filter(Boolean);
}

function emitAsmlPriceModule(rows, annualRows, comparisonRows, fullRowCount) {
  const latest = rows[rows.length - 1] ?? null;
  const serializableRows = rows.map((row) => ({
    ticker: "ASML",
    priceDate: row.priceDate,
    close: Number(row.close.toFixed(4)),
    adjustedClose: Number(row.adjustedClose.toFixed(4)),
    source: row.source,
    sourceType: row.sourceType,
  }));
  return `export type AsmlDailyPriceBar = {
  ticker: "ASML";
  priceDate: string;
  close: number;
  adjustedClose: number;
  source: string;
  sourceType: "market_data" | "market_data_unadjusted_proxy";
};

export const asmlDailyPriceBars: AsmlDailyPriceBar[] = ${JSON.stringify(serializableRows, null, 2)};

export type AsmlAnnualPriceHistory = {
  year: number;
  startDate: string;
  endDate: string;
  startPrice: number;
  endPrice: number;
  annualReturn: number;
  high: number;
  low: number;
  maxDrawdown: number;
};

export const asmlEightYearPriceHistory: AsmlAnnualPriceHistory[] = ${JSON.stringify(annualRows, null, 2)};

export type AsmlVsSpyAnnualReturn = {
  year: number;
  asmlReturn: number;
  spyReturn: number;
  relativeReturn: number;
  asmlMaxDrawdown: number;
  spyMaxDrawdown: number;
};

export const asmlVsSpyEightYearReturns: AsmlVsSpyAnnualReturn[] = ${JSON.stringify(comparisonRows, null, 2)};

export const asmlMarketPriceMetadata = {
  ticker: "ASML" as const,
  rowCount: ${rows.length},
  fullRawRowCount: ${fullRowCount},
  firstDate: ${JSON.stringify(rows[0]?.priceDate ?? null)},
  lastDate: ${JSON.stringify(latest?.priceDate ?? null)},
  latestPrice: ${latest ? Number(latest.adjustedClose.toFixed(4)) : "null"},
  source: "Yahoo Finance chart API",
  sourceType: ${JSON.stringify(latest?.sourceType ?? "source_gap")} as const,
};
`;
}

function nearestRowsForHistoricalEvents(rows) {
  const byDate = new Map();
  for (const eventDate of ASML_HISTORY_EVENT_DATES) {
    let nearest = null;
    for (const row of rows) {
      if (row.priceDate <= eventDate) nearest = row;
      else break;
    }
    if (nearest) byDate.set(nearest.priceDate, nearest);
  }
  const latest = rows[rows.length - 1] ?? null;
  if (latest) byDate.set(latest.priceDate, latest);
  return [...byDate.values()].sort((left, right) => left.priceDate.localeCompare(right.priceDate));
}

async function main() {
  await mkdir(MARKET_DIR, { recursive: true });
  const fetched = [];
  let asmlRows = [];
  let spyRows = [];

  for (const [ticker, url] of Object.entries(CHART_URLS)) {
    const { result } = await fetchYahooChart(ticker, url);
    const rows = parseBars(ticker, result, url);
    if (ticker === "ASML") asmlRows = rows;
    if (ticker === "SPY") spyRows = rows;
    fetched.push({
      ticker,
      rowCount: rows.length,
      firstDate: rows[0]?.priceDate ?? null,
      lastDate: rows[rows.length - 1]?.priceDate ?? null,
      latestAdjustedClose: rows[rows.length - 1]?.adjustedClose ?? null,
      source: "Yahoo Finance chart API",
    });
  }

  const frontendRows = nearestRowsForHistoricalEvents(asmlRows);
  const asmlAnnual = annualHistoryRows(asmlRows, 8);
  const spyAnnual = annualHistoryRows(spyRows, 8);
  const comparisonRows = compareAnnualReturns(asmlAnnual, spyAnnual);
  await writeFile(OUTPUT_TS, emitAsmlPriceModule(frontendRows, asmlAnnual, comparisonRows, asmlRows.length));
  console.log(JSON.stringify({
    ticker: "ASML",
    status: "fetched",
    note: "Full ASML daily ADR prices are cached under data/local/asml/market. The frontend module compiles nearest-prior event prices plus the latest price to keep the bundle small.",
    frontendRows: frontendRows.length,
    annualRows: asmlAnnual.length,
    comparisonRows: comparisonRows.length,
    fetched,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
