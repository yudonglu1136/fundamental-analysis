import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { BA_BACKEND_DB_PATH } from "../db/schema.mjs";

const BA_MARKET_DIR = path.resolve("data/local/ba/market");
const SHARED_MARKET_DIR = path.resolve("data/local/msft/market");

function numberOrNull(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDateFromUnix(seconds) {
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
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

function parseNasdaqHistorical(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Nasdaq file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const series = json.data?.tradesTable?.rows;
  if (!Array.isArray(series) || !series.length) return { rows: [], warning: `${ticker} Nasdaq payload does not include historical prices.` };
  const rows = series.map((row) => {
    const [month, day, year] = String(row.date).split("/");
    const priceDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const close = numberOrNull(row.close);
    return {
      id: `${ticker}-${priceDate}`,
      ticker,
      priceDate,
      open: numberOrNull(row.open),
      high: numberOrNull(row.high),
      low: numberOrNull(row.low),
      close,
      adjustedClose: close,
      volume: numberOrNull(row.volume),
      dividendAmount: null,
      splitCoefficient: null,
      source: "Nasdaq historical quote API unadjusted close",
      sourceType: "market_data",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify({ ...row, adjustedCloseFallback: true }),
    };
  });
  return { rows, warning: `${ticker} Nasdaq fallback uses unadjusted close; returns may exclude dividends and split adjustments.` };
}

function sourcesForTicker(ticker) {
  if (ticker === "BA.L") {
    return [
      () => parseYahooChart(path.join(BA_MARKET_DIR, "yahoo_ba_l_chart.json"), ticker),
    ];
  }
  if (ticker === "SPY") {
    return [
      () => parseYahooChart(path.join(BA_MARKET_DIR, "yahoo_spy_chart.json"), ticker),
      () => parseNasdaqHistorical(path.join(SHARED_MARKET_DIR, "nasdaq_spy_historical.json"), ticker),
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
    input: JSON.stringify({ dbPath: BA_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 60 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`BA.L price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertBaDailyPriceBars({ tickers = ["BA.L", "SPY"] } = {}) {
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
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars WHERE ticker IN ('BA.L', 'SPY') GROUP BY ticker ORDER BY ticker",
    [],
    BA_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
