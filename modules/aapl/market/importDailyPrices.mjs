import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { AAPL_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/aapl/market");

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseYahooChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Yahoo chart file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!timestamps.length) return { rows: [], warning: `${ticker} Yahoo chart payload has no daily timestamps.` };
  const rows = timestamps.map((timestamp, index) => {
    const priceDate = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const row = {
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      adjustedClose: adjclose[index] ?? quote.close?.[index],
      volume: quote.volume?.[index],
    };
    return {
      id: `${ticker}-${priceDate}`,
      ticker,
      priceDate,
      open: numberOrNull(row.open),
      high: numberOrNull(row.high),
      low: numberOrNull(row.low),
      close: numberOrNull(row.close),
      adjustedClose: numberOrNull(row.adjustedClose),
      volume: numberOrNull(row.volume),
      dividendAmount: null,
      splitCoefficient: null,
      source: "Yahoo Finance chart API",
      sourceType: "market_data",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify(row),
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
    input: JSON.stringify({ dbPath: AAPL_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`AAPL price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertAaplDailyPriceBars({ tickers = ["AAPL", "SPY"] } = {}) {
  const warnings = [];
  const imported = [];
  for (const ticker of tickers) {
    const parsed = parseYahooChart(path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`), ticker);
    if (parsed.warning) warnings.push(parsed.warning);
    const upsert = bulkUpsertRows(parsed.rows, ticker);
    imported.push({
      ticker,
      rowCount: parsed.rows.length,
      upserted: upsert.upserted,
      source: parsed.rows[0]?.source ?? null,
      firstDate: parsed.rows[0]?.priceDate ?? null,
      lastDate: parsed.rows.at(-1)?.priceDate ?? null,
    });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    AAPL_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
