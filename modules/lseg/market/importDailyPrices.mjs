import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { defaultLsegDbPath, query } from "../../../apps/api/src/db/client.mjs";

const LSEG_MARKET_DIR = path.resolve("data/local/lseg/yfinance/raw");
const SHARED_BA_MARKET_DIR = path.resolve("data/local/ba/market");
const SHARED_MSFT_MARKET_DIR = path.resolve("data/local/msft/market");

function numberOrNull(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDateFromUnix(seconds) {
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function toIsoDate(value) {
  return String(value ?? "").slice(0, 10);
}

function penceToGbp(value) {
  const parsed = numberOrNull(value);
  return parsed == null ? null : parsed / 100;
}

function parseLsegYfinanceCsv(filePath) {
  const ticker = "LSEG.L";
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} yfinance price file not found: ${filePath}` };
  const lines = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0] ?? "");
  if (!headers.includes("Adj Close")) return { rows: [], warning: `${ticker} yfinance CSV does not include adjusted close.` };
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const raw = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    const priceDate = toIsoDate(raw.Date);
    const close = penceToGbp(raw.Close);
    const adjustedClose = penceToGbp(raw["Adj Close"]) ?? close;
    return {
      id: `${ticker}-${priceDate}`,
      ticker,
      priceDate,
      open: penceToGbp(raw.Open),
      high: penceToGbp(raw.High),
      low: penceToGbp(raw.Low),
      close,
      adjustedClose,
      volume: numberOrNull(raw.Volume),
      dividendAmount: penceToGbp(raw.Dividends),
      splitCoefficient: numberOrNull(raw["Stock Splits"]),
      source: "Yahoo Finance yfinance price history adjusted close; GBp converted to GBP",
      sourceType: "market_data",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify({ ...raw, originalCurrency: "GBp", storedCurrency: "GBP" }),
    };
  }).filter((row) => row.priceDate && Number.isFinite(row.close) && Number.isFinite(row.adjustedClose));
  return { rows, warning: null };
}

function parseYahooChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Yahoo chart file not found: ${filePath}` };
  let json;
  try {
    json = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return { rows: [], warning: `${ticker} Yahoo chart file is not valid JSON: ${filePath}` };
  }
  const result = json.chart?.result?.[0];
  if (!result?.timestamp?.length) return { rows: [], warning: `${ticker} Yahoo chart payload does not include daily timestamps.` };
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const dividendsByDate = new Map(
    Object.values(result.events?.dividends ?? {}).map((event) => [isoDateFromUnix(event.date), numberOrNull(event.amount)]),
  );
  const splitsByDate = new Map(
    Object.values(result.events?.splits ?? {}).map((event) => [isoDateFromUnix(event.date), numberOrNull(event.splitRatio)]),
  );
  const rows = result.timestamp.map((timestamp, index) => {
    const priceDate = isoDateFromUnix(timestamp);
    const close = numberOrNull(quote.close?.[index]);
    const adjustedClose = numberOrNull(adjusted[index]) ?? close;
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
      dividendAmount: dividendsByDate.get(priceDate) ?? null,
      splitCoefficient: splitsByDate.get(priceDate) ?? null,
      source: "Yahoo Finance chart API adjusted close",
      sourceType: "market_data",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify({
        currency: result.meta?.currency ?? null,
        exchangeName: result.meta?.exchangeName ?? null,
        close,
        adjustedClose,
        adjustedCloseFallback: adjustedClose === close && adjusted[index] == null,
      }),
    };
  }).filter((row) => row.priceDate && Number.isFinite(row.close) && Number.isFinite(row.adjustedClose));
  return { rows, warning: null };
}

function parseAlphaVantageDailyAdjusted(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Alpha Vantage file not found: ${filePath}` };
  let json;
  try {
    json = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return { rows: [], warning: `${ticker} Alpha Vantage file is not valid JSON: ${filePath}` };
  }
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

function sourcesForTicker(ticker) {
  if (ticker === "LSEG.L") {
    return [
      () => parseLsegYfinanceCsv(path.join(LSEG_MARKET_DIR, "lseg_price_history.csv")),
    ];
  }
  if (ticker === "SPY") {
    return [
      () => parseYahooChart(path.join(SHARED_BA_MARKET_DIR, "yahoo_spy_chart.json"), ticker),
      () => parseAlphaVantageDailyAdjusted(path.join(SHARED_MSFT_MARKET_DIR, "alphavantage_spy_daily_adjusted.json"), ticker),
    ];
  }
  return [];
}

const bulkUpsertPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
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
    """, payload["rows"])
    conn.commit()
    print(json.dumps({"upserted": len(payload["rows"])}))
finally:
    conn.close()
`;

function bulkUpsertRows(rows, ticker) {
  if (!rows.length) return { upserted: 0 };
  const result = spawnSync("python3", ["-c", bulkUpsertPython], {
    input: JSON.stringify({ dbPath: defaultLsegDbPath, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 60 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`LSEG price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertLsegDailyPriceBars({ tickers = ["LSEG.L", "SPY"] } = {}) {
  const warnings = [];
  const imported = [];
  for (const ticker of tickers) {
    let rows = [];
    let sourceWarning = null;
    for (const parseSource of sourcesForTicker(ticker)) {
      const parsed = parseSource();
      if (parsed.rows.length) {
        rows = parsed.rows;
        sourceWarning = parsed.warning;
        break;
      }
      if (parsed.warning) warnings.push(parsed.warning);
    }
    if (sourceWarning) warnings.push(sourceWarning);
    const upsert = bulkUpsertRows(rows, ticker);
    imported.push({ ticker, rowCount: rows.length, upserted: upsert.upserted, source: rows[0]?.source ?? null });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('LSEG.L', 'SPY') GROUP BY ticker ORDER BY ticker",
  );
  return { imported, counts, warnings };
}
