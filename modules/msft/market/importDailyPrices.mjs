import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { MSFT_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/msft/market");

function numberOrNull(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAlphaVantageDailyAdjusted(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Alpha Vantage file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const series = json["Time Series (Daily)"];
  if (!series) return { rows: [], warning: `${ticker} Alpha Vantage payload does not include daily adjusted prices.` };
  const rows = Object.entries(series).map(([priceDate, row]) => ({
    id: `${ticker}-${priceDate}`,
    ticker,
    priceDate,
    open: numberOrNull(row["1. open"]),
    high: numberOrNull(row["2. high"]),
    low: numberOrNull(row["3. low"]),
    close: numberOrNull(row["4. close"]),
    adjustedClose: numberOrNull(row["5. adjusted close"]) ?? numberOrNull(row["4. close"]),
    volume: numberOrNull(row["6. volume"]),
    dividendAmount: numberOrNull(row["7. dividend amount"]),
    splitCoefficient: numberOrNull(row["8. split coefficient"]),
    source: "Alpha Vantage TIME_SERIES_DAILY_ADJUSTED",
    sourceType: "market_data",
    fetchedAt: new Date().toISOString(),
    rawJson: JSON.stringify(row),
  }));
  return { rows, warning: null };
}

function parseFmpHistorical(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} FMP file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const series = Array.isArray(json.historical) ? json.historical : [];
  if (!series.length) return { rows: [], warning: `${ticker} FMP payload does not include historical prices.` };
  const rows = series.map((row) => ({
    id: `${ticker}-${row.date}`,
    ticker,
    priceDate: row.date,
    open: numberOrNull(row.open),
    high: numberOrNull(row.high),
    low: numberOrNull(row.low),
    close: numberOrNull(row.close),
    adjustedClose: numberOrNull(row.adjClose) ?? numberOrNull(row.close),
    volume: numberOrNull(row.volume),
    dividendAmount: null,
    splitCoefficient: null,
    source: "Financial Modeling Prep historical-price-full",
    sourceType: "market_data",
    fetchedAt: new Date().toISOString(),
    rawJson: JSON.stringify(row),
  }));
  return { rows, warning: null };
}

function parseNasdaqHistorical(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Nasdaq file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const series = json.data?.tradesTable?.rows;
  if (!Array.isArray(series) || !series.length) return { rows: [], warning: `${ticker} Nasdaq payload does not include historical prices.` };
  const rows = series.map((row) => {
    const [month, day, year] = String(row.date).split("/");
    const priceDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return {
      id: `${ticker}-${priceDate}`,
      ticker,
      priceDate,
      open: numberOrNull(row.open),
      high: numberOrNull(row.high),
      low: numberOrNull(row.low),
      close: numberOrNull(row.close),
      adjustedClose: numberOrNull(row.close),
      volume: numberOrNull(row.volume),
      dividendAmount: null,
      splitCoefficient: null,
      source: "Nasdaq historical quote API",
      sourceType: "market_data",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify(row),
    };
  });
  return { rows, warning: null };
}

function sourcesForTicker(ticker) {
  return [
    () => parseAlphaVantageDailyAdjusted(path.join(MARKET_DIR, `alphavantage_${ticker.toLowerCase()}_daily_adjusted.json`), ticker),
    () => parseFmpHistorical(path.join(MARKET_DIR, `fmp_${ticker.toLowerCase()}_historical.json`), ticker),
    () => parseNasdaqHistorical(path.join(MARKET_DIR, `nasdaq_${ticker.toLowerCase()}_historical.json`), ticker),
  ];
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
    input: JSON.stringify({ dbPath: MSFT_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`MSFT price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertMsftDailyPriceBars({ tickers = ["MSFT", "SPY"] } = {}) {
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
    MSFT_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
