import https from "node:https";
import { spawnSync } from "node:child_process";
import { query } from "../../../apps/api/src/db/client.mjs";
import { DGE_BACKEND_DB_PATH } from "../db/schema.mjs";

const STOOQ_SYMBOLS = {
  "DGE.L": "dge.uk",
  SPY: "spy.us",
};

const YAHOO_SYMBOLS = {
  "DGE.L": "DGE.L",
  SPY: "SPY",
};

function numberOrNull(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        response.resume();
        return;
      }
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        raw += chunk;
      });
      response.on("end", () => resolve(raw));
    }).on("error", reject);
  });
}

function epochSecondsFromYyyymmdd(value, endOfDay = false) {
  const text = String(value ?? "");
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const millis = Date.UTC(year, month - 1, day + (endOfDay ? 1 : 0));
  return Math.floor(millis / 1000);
}

function parseYahooChart(jsonText, ticker) {
  const json = JSON.parse(jsonText);
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!timestamps.length) {
    throw new Error(`Yahoo chart response for ${ticker} did not include daily timestamps.`);
  }
  const fetchedAt = new Date().toISOString();
  return timestamps.map((timestamp, index) => {
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
      fetchedAt,
      rawJson: JSON.stringify({
        close: quote.close?.[index],
        adjustedClose: adjusted[index],
        unit: ticker === "DGE.L" ? "GBp" : "USD",
      }),
    };
  }).filter((row) => (row.adjustedClose ?? row.close ?? 0) > 0);
}

function parseStooqCsv(csv, ticker) {
  const lines = String(csv ?? "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2 || !/^date,open,high,low,close,volume$/i.test(lines[0])) {
    throw new Error(`Stooq response for ${ticker} did not include a daily OHLCV CSV payload.`);
  }
  const fetchedAt = new Date().toISOString();
  return lines.slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(",");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const closeValue = numberOrNull(close);
    return {
      id: `${ticker}-${date}`,
      ticker,
      priceDate: date,
      open: numberOrNull(open),
      high: numberOrNull(high),
      low: numberOrNull(low),
      close: closeValue,
      adjustedClose: null,
      volume: numberOrNull(volume),
      dividendAmount: null,
      splitCoefficient: null,
      source: `Stooq daily OHLCV ${STOOQ_SYMBOLS[ticker]}`,
      sourceType: "market_data_unadjusted",
      fetchedAt,
      rawJson: JSON.stringify({
        date,
        open,
        high,
        low,
        close,
        volume,
        unit: ticker === "DGE.L" ? "GBp" : "USD",
      }),
    };
  }).filter((row) => row?.close != null);
}

const bulkUpsertPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    ticker = payload.get("ticker")
    rows = payload["rows"]
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
    input: JSON.stringify({ dbPath: DGE_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`DGE.L price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export async function upsertDgeDailyPriceBars({
  tickers = ["DGE.L", "SPY"],
  startDate = "20180101",
  endDate = new Date().toISOString().slice(0, 10).replace(/-/g, ""),
} = {}) {
  const imported = [];
  const warnings = [];
  for (const ticker of tickers) {
    const yahooSymbol = YAHOO_SYMBOLS[ticker];
    const stooqSymbol = STOOQ_SYMBOLS[ticker];
    if (!yahooSymbol && !stooqSymbol) {
      warnings.push(`No market-data symbol mapping is configured for ${ticker}.`);
      continue;
    }
    let rows = [];
    let url = null;
    try {
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${epochSecondsFromYyyymmdd(startDate)}&period2=${epochSecondsFromYyyymmdd(endDate, true)}&interval=1d&events=history%7Cdiv%7Csplits`;
      rows = parseYahooChart(await fetchText(url, { "user-agent": "Mozilla/5.0" }), ticker);
      if (rows.some((row) => row.adjustedClose == null)) {
        warnings.push(`${ticker} Yahoo chart rows are missing adjusted close on some dates; close is used as fallback for those rows.`);
      }
    } catch (error) {
      warnings.push(`${ticker} Yahoo chart import failed: ${error instanceof Error ? error.message : String(error)}. Trying Stooq fallback.`);
      url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=${startDate}&d2=${endDate}&i=d`;
      rows = parseStooqCsv(await fetchText(url, { "user-agent": "Mozilla/5.0" }), ticker);
      warnings.push(`${ticker} Stooq daily feed provides close prices but not adjusted close; backtest metrics are price-return only unless a richer adjusted-close source is added.`);
    }
    const upsert = bulkUpsertRows(rows, ticker);
    imported.push({
      ticker,
      rowCount: rows.length,
      upserted: upsert.upserted,
      source: rows[0]?.source ?? null,
      sourceType: rows[0]?.sourceType ?? null,
      firstDate: rows[0]?.priceDate ?? null,
      lastDate: rows[rows.length - 1]?.priceDate ?? null,
      unit: ticker === "DGE.L" ? "GBp" : "USD",
      url,
    });
  }

  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    DGE_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
