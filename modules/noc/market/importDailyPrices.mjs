import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { NOC_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/noc/market");

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unixSeconds(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

function chartUrl(ticker, startDate, endDate) {
  const period1 = unixSeconds(startDate);
  const period2 = unixSeconds(endDate) + 86_400;
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits`;
}

async function fetchYahooChart(ticker, { startDate, endDate, force = false } = {}) {
  mkdirSync(MARKET_DIR, { recursive: true });
  const filePath = path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`);
  if (existsSync(filePath) && !force) {
    return { filePath, fetched: false };
  }
  const response = await fetch(chartUrl(ticker, startDate, endDate), {
    headers: {
      "user-agent": "fundamental-analysis-noc-backend/1.0 contact: local-research",
      accept: "application/json,text/plain,*/*",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Yahoo chart fetch failed for ${ticker}: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  writeFileSync(filePath, text);
  return { filePath, fetched: true };
}

function parseYahooChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Yahoo chart file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!timestamps.length) return { rows: [], warning: `${ticker} Yahoo chart payload does not include daily prices.` };
  const rows = timestamps.map((timestamp, index) => {
    const priceDate = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const close = numberOrNull(quote.close?.[index]);
    const adjustedClose = numberOrNull(adjusted[index]);
    return {
      id: `${ticker}-${priceDate}`,
      ticker,
      priceDate,
      open: numberOrNull(quote.open?.[index]),
      high: numberOrNull(quote.high?.[index]),
      low: numberOrNull(quote.low?.[index]),
      close,
      adjustedClose: adjustedClose ?? close,
      volume: numberOrNull(quote.volume?.[index]),
      dividendAmount: null,
      splitCoefficient: null,
      source: "Yahoo Finance chart API",
      sourceType: adjustedClose != null ? "market_data_adjusted" : "market_data_unadjusted",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify({
        open: quote.open?.[index],
        high: quote.high?.[index],
        low: quote.low?.[index],
        close: quote.close?.[index],
        adjustedClose: adjusted[index],
        volume: quote.volume?.[index],
      }),
    };
  }).filter((row) => row.close != null || row.adjustedClose != null);
  return {
    rows,
    warning: rows.some((row) => row.adjustedClose == null)
      ? `${ticker} Yahoo chart rows are missing adjusted close on some dates; close is used as fallback.`
      : null,
  };
}

const bulkUpsertPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    rows = payload["rows"]
    ticker = payload.get("ticker")
    if ticker:
        conn.execute("DELETE FROM daily_price_bars WHERE ticker = ?", (ticker,))
    conn.executemany("""
      INSERT OR REPLACE INTO daily_price_bars (
        id, ticker, priceDate, open, high, low, close, adjustedClose, volume,
        dividendAmount, splitCoefficient, source, sourceType, fetchedAt, rawJson
      ) VALUES (
        :id, :ticker, :priceDate, :open, :high, :low, :close, :adjustedClose, :volume,
        :dividendAmount, :splitCoefficient, :source, :sourceType, :fetchedAt, :rawJson
      )
    """, rows)
    conn.commit()
    print(json.dumps({"upserted": len(rows)}))
finally:
    conn.close()
`;

function bulkUpsertRows(rows, ticker) {
  if (!rows.length) return { upserted: 0 };
  const result = spawnSync("python3", ["-c", bulkUpsertPython], {
    input: JSON.stringify({ dbPath: NOC_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`NOC price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export async function upsertNocDailyPriceBars({
  tickers = ["NOC", "SPY"],
  startDate = "2018-01-01",
  endDate = "2026-05-12",
  force = false,
} = {}) {
  const warnings = [];
  const imported = [];
  for (const ticker of tickers) {
    const cache = await fetchYahooChart(ticker, { startDate, endDate, force });
    const parsed = parseYahooChart(cache.filePath, ticker);
    if (parsed.warning) warnings.push(parsed.warning);
    const upsert = bulkUpsertRows(parsed.rows, ticker);
    imported.push({
      ticker,
      rowCount: parsed.rows.length,
      upserted: upsert.upserted,
      source: parsed.rows[0]?.source ?? null,
      sourceType: parsed.rows[0]?.sourceType ?? null,
      cachePath: path.relative(process.cwd(), cache.filePath),
      fetched: cache.fetched,
    });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('NOC', 'SPY') GROUP BY ticker ORDER BY ticker",
    [],
    NOC_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
