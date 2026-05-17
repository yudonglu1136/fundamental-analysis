import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { TRI_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/tri/market");

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFromUnix(timestamp) {
  return new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
}

function parseYahooChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Yahoo chart file not found: ${filePath}` };
  const raw = readFileSync(filePath, "utf8");
  if (!raw.trim().startsWith("{")) return { rows: [], warning: `${ticker} Yahoo chart payload is not JSON.` };
  const json = JSON.parse(raw);
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!timestamps.length) return { rows: [], warning: `${ticker} Yahoo chart payload does not include daily prices.` };
  const rows = timestamps.map((timestamp, index) => {
    const priceDate = dateFromUnix(timestamp);
    const yahooAdjustedClose = numberOrNull(adjclose[index]);
    const adjustedClose = yahooAdjustedClose ?? numberOrNull(quote.close?.[index]);
    return {
      id: `${ticker}-${priceDate}`,
      ticker,
      priceDate,
      open: numberOrNull(quote.open?.[index]),
      high: numberOrNull(quote.high?.[index]),
      low: numberOrNull(quote.low?.[index]),
      close: numberOrNull(quote.close?.[index]),
      adjustedClose,
      volume: numberOrNull(quote.volume?.[index]),
      dividendAmount: null,
      splitCoefficient: null,
      source: "Yahoo Finance chart API",
      sourceType: yahooAdjustedClose == null ? "market_data_unadjusted_or_close_fallback" : "market_data",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify({
        open: quote.open?.[index] ?? null,
        high: quote.high?.[index] ?? null,
        low: quote.low?.[index] ?? null,
        close: quote.close?.[index] ?? null,
        adjustedClose: adjclose[index] ?? null,
      }),
    };
  }).filter((row) => row.adjustedClose != null);
  return { rows, warning: null };
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
    input: JSON.stringify({ dbPath: TRI_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`TRI price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function sourcesForTicker(ticker) {
  return [
    () => parseYahooChart(path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`), ticker),
  ];
}

export function upsertTriDailyPriceBars({ tickers = ["TRI", "SPY"] } = {}) {
  const warnings = [];
  const imported = [];
  for (const ticker of tickers) {
    let rows = [];
    for (const parseSource of sourcesForTicker(ticker)) {
      const parsed = parseSource();
      if (parsed.rows.length) {
        rows = parsed.rows;
        break;
      }
      if (parsed.warning) warnings.push(parsed.warning);
    }
    const upsert = bulkUpsertRows(rows, ticker);
    imported.push({ ticker, rowCount: rows.length, upserted: upsert.upserted, source: rows[0]?.source ?? null });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    TRI_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
