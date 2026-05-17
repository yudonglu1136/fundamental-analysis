import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { executescript, query } from "../../../apps/api/src/db/client.mjs";
import { AZN_BACKEND_DB_PATH, aznSchemaSql } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/azn/market");
const DEFAULT_GBP_USD = 1.36372;

function numberOrNull(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDateFromNasdaq(value) {
  const [month, day, year] = String(value ?? "").split("/");
  if (!month || !day || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseNasdaqHistorical(filePath, ticker, options = {}) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Nasdaq file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const series = json.data?.tradesTable?.rows;
  if (!Array.isArray(series) || !series.length) return { rows: [], warning: `${ticker} Nasdaq payload does not include historical prices.` };

  const gbpUsd = Number(options.gbpUsd ?? DEFAULT_GBP_USD);
  const convertUsdToGbp = options.currency === "GBP";
  const rows = series
    .map((row) => {
      const priceDate = isoDateFromNasdaq(row.date);
      if (!priceDate) return null;
      const open = numberOrNull(row.open);
      const high = numberOrNull(row.high);
      const low = numberOrNull(row.low);
      const close = numberOrNull(row.close);
      const scale = convertUsdToGbp ? 1 / gbpUsd : 1;
      return {
        id: `${ticker}-${priceDate}`,
        ticker,
        priceDate,
        open: open == null ? null : open * scale,
        high: high == null ? null : high * scale,
        low: low == null ? null : low * scale,
        close: close == null ? null : close * scale,
        adjustedClose: close == null ? null : close * scale,
        volume: numberOrNull(row.volume),
        dividendAmount: null,
        splitCoefficient: null,
        source: options.source,
        sourceType: options.sourceType,
        fetchedAt: new Date().toISOString(),
        rawJson: JSON.stringify({
          originalTicker: json.data?.symbol ?? ticker,
          originalCurrency: "USD",
          storedCurrency: options.currency ?? "USD",
          gbpUsd: convertUsdToGbp ? gbpUsd : null,
          adjustmentNote: "Nasdaq historical quote API does not provide adjusted close in this cached payload; close is stored in adjustedClose with a warning.",
          row,
        }),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));

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
    input: JSON.stringify({ dbPath: AZN_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`AZN price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertAznDailyPriceBars() {
  mkdirSync(path.dirname(AZN_BACKEND_DB_PATH), { recursive: true });
  executescript(aznSchemaSql, AZN_BACKEND_DB_PATH);
  const warnings = [];
  const imported = [];

  const azn = parseNasdaqHistorical(path.join(MARKET_DIR, "nasdaq_azn_historical.json"), "AZN.L", {
    currency: "GBP",
    gbpUsd: DEFAULT_GBP_USD,
    source: "Nasdaq historical quote API: AZN US line converted to GBP using GBP/USD 1.36372 proxy",
    sourceType: "market_data_proxy_unadjusted",
  });
  if (azn.warning) warnings.push(azn.warning);
  const aznUpsert = bulkUpsertRows(azn.rows, "AZN.L");
  imported.push({ ticker: "AZN.L", rowCount: azn.rows.length, upserted: aznUpsert.upserted, source: azn.rows[0]?.source ?? null });

  const spy = parseNasdaqHistorical(path.join(MARKET_DIR, "nasdaq_spy_historical.json"), "SPY", {
    currency: "USD",
    source: "Nasdaq historical quote API",
    sourceType: "market_data_unadjusted",
  });
  if (spy.warning) warnings.push(spy.warning);
  const spyUpsert = bulkUpsertRows(spy.rows, "SPY");
  imported.push({ ticker: "SPY", rowCount: spy.rows.length, upserted: spyUpsert.upserted, source: spy.rows[0]?.source ?? null });

  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(sourceType) AS sourceType FROM daily_price_bars WHERE ticker IN ('AZN.L', 'SPY') GROUP BY ticker ORDER BY ticker",
    [],
    AZN_BACKEND_DB_PATH,
  );
  return {
    imported,
    counts,
    warnings: [
      ...warnings,
      "AZN.L daily bars use the Nasdaq AZN US line converted to GBP with a static GBP/USD proxy because direct London adjusted close history is not cached.",
      "Nasdaq cached rows do not include adjusted close; close is stored in adjustedClose and dividend-adjusted returns may be understated.",
    ],
  };
}
