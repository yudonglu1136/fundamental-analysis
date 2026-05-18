import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { CEG_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/ceg/market");

function numberOrNull(value) {
  if (value == null) return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  const slashDate = String(value ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const [, month, day, year] = slashDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseNasdaqChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Nasdaq chart file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const chart = json.data?.chart ?? [];
  const rows = chart
    .map((point) => {
      const raw = point.z ?? point;
      const priceDate = isoDate(raw.dateTime ?? point.x);
      const close = numberOrNull(raw.close ?? raw.value ?? point.y);
      if (!priceDate || close == null) return null;
      return {
        id: `${ticker}-${priceDate}`,
        ticker,
        priceDate,
        open: numberOrNull(raw.open),
        high: numberOrNull(raw.high),
        low: numberOrNull(raw.low),
        close,
        adjustedClose: close,
        volume: numberOrNull(raw.volume),
        dividendAmount: null,
        splitCoefficient: null,
        source: "Nasdaq chart API",
        sourceType: "market_data_unadjusted_or_close_fallback",
        fetchedAt: new Date().toISOString(),
        rawJson: JSON.stringify(raw),
      };
    })
    .filter(Boolean);
  return rows.length ? { rows, warning: null } : { rows: [], warning: `${ticker} Nasdaq chart payload has no usable close bars.` };
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
    input: JSON.stringify({ dbPath: CEG_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`CEG price import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertCegDailyPriceBars({ tickers = ["CEG", "SPY"] } = {}) {
  const warnings = [];
  const imported = [];
  for (const ticker of tickers) {
    const parsed = parseNasdaqChart(path.join(MARKET_DIR, `nasdaq_${ticker.toLowerCase()}_chart.json`), ticker);
    if (parsed.warning) warnings.push(parsed.warning);
    const upsert = bulkUpsertRows(parsed.rows, ticker);
    imported.push({ ticker, rowCount: parsed.rows.length, upserted: upsert.upserted, source: parsed.rows[0]?.source ?? null });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    CEG_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
