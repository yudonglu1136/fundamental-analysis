import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { RTX_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/rtx/market");
const FALLBACK_MARKET_DIRS = [
  path.resolve("data/local/gild/market"),
  path.resolve("data/local/noc/market"),
  path.resolve("data/local/ba/market"),
];

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
  if (ticker === "SPY" && !force) {
    for (const dir of FALLBACK_MARKET_DIRS) {
      const fallbackPath = path.join(dir, "yahoo_spy_chart.json");
      if (existsSync(fallbackPath)) {
        const raw = readFileSync(fallbackPath, "utf8");
        if (raw.trim().startsWith("{")) {
          writeFileSync(filePath, raw);
          return { filePath, fetched: false, copiedFrom: fallbackPath };
        }
      }
    }
  }
  const response = await fetch(chartUrl(ticker, startDate, endDate), {
    headers: {
      "user-agent": "fundamental-analysis-rtx-backend/1.0 local-research",
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

function dateFromUnix(timestamp) {
  return new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
}

function parseYahooChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Yahoo chart file not found: ${filePath}` };
  const raw = readFileSync(filePath, "utf8");
  if (!raw.trim().startsWith("{")) return { rows: [], warning: `${ticker} Yahoo chart payload is not JSON.` };
  const json = JSON.parse(raw);
  const error = json.chart?.error;
  if (error) return { rows: [], warning: `${ticker} Yahoo chart error: ${error.description ?? JSON.stringify(error)}` };
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!timestamps.length) return { rows: [], warning: `${ticker} Yahoo chart payload does not include daily prices.` };
  const rows = timestamps
    .map((timestamp, index) => {
      const priceDate = dateFromUnix(timestamp);
      const close = numberOrNull(quote.close?.[index]);
      const adjustedClose = numberOrNull(adjclose[index]) ?? close;
      if (adjustedClose == null) return null;
      return {
        id: `${ticker}-${priceDate}`,
        ticker,
        priceDate,
        open: numberOrNull(quote.open?.[index]),
        high: numberOrNull(quote.high?.[index]),
        low: numberOrNull(quote.low?.[index]),
        close,
        adjustedClose,
        volume: numberOrNull(quote.volume?.[index]),
        dividendAmount: null,
        splitCoefficient: null,
        source: numberOrNull(adjclose[index]) == null ? "Yahoo Finance chart API close fallback" : "Yahoo Finance chart API adjusted close",
        sourceType: numberOrNull(adjclose[index]) == null ? "market_data_unadjusted_fallback" : "market_data",
        fetchedAt: new Date().toISOString(),
        rawJson: JSON.stringify({
          open: quote.open?.[index] ?? null,
          high: quote.high?.[index] ?? null,
          low: quote.low?.[index] ?? null,
          close: quote.close?.[index] ?? null,
          adjustedClose: adjclose[index] ?? null,
          volume: quote.volume?.[index] ?? null,
        }),
      };
    })
    .filter(Boolean);
  return {
    rows,
    warning: rows.some((row) => row.sourceType === "market_data_unadjusted_fallback")
      ? `${ticker} Yahoo chart payload has missing adjusted close rows; close was used as a fallback for those dates.`
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
    input: JSON.stringify({ dbPath: RTX_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`RTX price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export async function upsertRtxDailyPriceBars({
  tickers = ["RTX", "SPY"],
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
      copiedFrom: cache.copiedFrom ? path.relative(process.cwd(), cache.copiedFrom) : null,
    });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('RTX', 'SPY') GROUP BY ticker ORDER BY ticker",
    [],
    RTX_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
