import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { GILD_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/gild/market");

function numberOrNull(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFromUnixSeconds(seconds) {
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

function parseYahooChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Yahoo chart file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const error = json.chart?.error;
  if (error) return { rows: [], warning: `${ticker} Yahoo chart error: ${error.description ?? JSON.stringify(error)}` };
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!timestamps.length || !quote.close?.length) return { rows: [], warning: `${ticker} Yahoo chart payload does not include daily prices.` };

  const rows = timestamps
    .map((timestamp, index) => {
      const priceDate = dateFromUnixSeconds(timestamp);
      const adjustedClose = numberOrNull(adjclose[index]);
      const close = numberOrNull(quote.close?.[index]);
      if (!priceDate || close == null) return null;
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
        source: adjustedClose == null ? "Yahoo Finance chart API close (unadjusted fallback)" : "Yahoo Finance chart API adjusted close",
        sourceType: adjustedClose == null ? "market_data_unadjusted_fallback" : "market_data",
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

  const warning = rows.some((row) => row.sourceType === "market_data_unadjusted_fallback")
    ? `${ticker} Yahoo chart payload has missing adjusted-close rows; close was used as a fallback for those dates.`
    : null;
  return { rows, warning };
}

function sourcesForTicker(ticker) {
  return [
    () => parseYahooChart(path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`), ticker),
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
    input: JSON.stringify({ dbPath: GILD_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`GILD price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertGildDailyPriceBars({ tickers = ["GILD", "SPY"] } = {}) {
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
    imported.push({ ticker, rowCount: rows.length, upserted: upsert.upserted, source: rows[0]?.source ?? null });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    GILD_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
