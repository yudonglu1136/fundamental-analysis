import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { LEGN_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/legn/market");

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
      const close = numberOrNull(row.close);
      if (!priceDate || close == null) return null;
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
        source: "Nasdaq historical quote API",
        sourceType: "market_data_close_proxy",
        fetchedAt: new Date().toISOString(),
        rawJson: JSON.stringify({ ...row, adjustedCloseProxy: true }),
      };
    })
    .filter(Boolean);
  return {
    rows,
    warning: `${ticker} Nasdaq history does not provide adjusted close in the local payload; close is used as adjustedClose proxy.`,
  };
}

function sourcesForTicker(ticker) {
  return [
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
    input: JSON.stringify({ dbPath: LEGN_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`LEGN price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertLegnDailyPriceBars({ tickers = ["LEGN", "SPY"] } = {}) {
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
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    LEGN_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
