import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { GOOGL_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/googl/market");

function numberOrNull(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNasdaqDate(value) {
  const [month, day, year] = String(value ?? "").split("/");
  if (!month || !day || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseNasdaqHistorical(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Nasdaq file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const series = json.data?.tradesTable?.rows;
  if (!Array.isArray(series) || !series.length) return { rows: [], warning: `${ticker} Nasdaq payload does not include historical prices.` };
  const rows = series
    .map((row) => {
      const priceDate = parseNasdaqDate(row.date);
      if (!priceDate) return null;
      return {
        id: `${ticker}-${priceDate}`,
        ticker,
        priceDate,
        open: numberOrNull(row.open),
        high: numberOrNull(row.high),
        low: numberOrNull(row.low),
        close: numberOrNull(row.close),
        adjustedClose: null,
        volume: numberOrNull(row.volume),
        dividendAmount: null,
        splitCoefficient: null,
        source: "Nasdaq historical quote API",
        sourceType: "market_data_unadjusted",
        fetchedAt: new Date().toISOString(),
        rawJson: JSON.stringify(row),
      };
    })
    .filter(Boolean);
  return {
    rows,
    warning: `${ticker} Nasdaq historical quote data provides close prices but not adjusted close; return series and backtest metrics are price-return only.`,
  };
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
  return { rows, warning: rows.some((row) => row.adjustedClose == null) ? `${ticker} Yahoo chart rows are missing adjusted close on some dates.` : null };
}

function sourcesForTicker(ticker) {
  return [
    () => parseYahooChart(path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`), ticker),
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
    input: JSON.stringify({ dbPath: GOOGL_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`GOOGL price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertGooglDailyPriceBars({ tickers = ["GOOGL", "SPY"] } = {}) {
  const warnings = [];
  const imported = [];
  for (const ticker of tickers) {
    let rows = [];
    for (const parseSource of sourcesForTicker(ticker)) {
      const parsed = parseSource();
      if (parsed.rows.length) {
        rows = parsed.rows;
        if (parsed.warning) warnings.push(parsed.warning);
        break;
      }
      if (parsed.warning) warnings.push(parsed.warning);
    }
    const upsert = bulkUpsertRows(rows, ticker);
    imported.push({ ticker, rowCount: rows.length, upserted: upsert.upserted, source: rows[0]?.source ?? null, sourceType: rows[0]?.sourceType ?? null });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    GOOGL_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
