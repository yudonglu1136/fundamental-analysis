import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { TSM_BACKEND_DB_PATH } from "../db/schema.mjs";

const TICKER = "TSM";
const OUT_DIR = path.resolve("data/local/tsm/market");
const START_DATE = "2018-01-01";
const SOURCE = "Yahoo Finance chart API";

const importPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    conn.execute("""
      CREATE TABLE IF NOT EXISTS daily_price_bars (
        ticker TEXT NOT NULL,
        priceDate TEXT NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        adjustedClose REAL,
        volume REAL,
        source TEXT,
        sourceType TEXT,
        rawJson TEXT,
        PRIMARY KEY (ticker, priceDate)
      )
    """)
    for row in payload["rows"]:
        conn.execute("""
          INSERT OR REPLACE INTO daily_price_bars
            (ticker, priceDate, open, high, low, close, adjustedClose, volume, source, sourceType, rawJson)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
          row.get("ticker"), row.get("priceDate"), row.get("open"), row.get("high"),
          row.get("low"), row.get("close"), row.get("adjustedClose"), row.get("volume"),
          row.get("source"), row.get("sourceType"), row.get("rawJson")
        ])
    conn.commit()
    print(json.dumps({
      "dbPath": payload["dbPath"],
      "inserted": len(payload["rows"]),
      "firstDate": payload["rows"][0]["priceDate"] if payload["rows"] else None,
      "lastDate": payload["rows"][-1]["priceDate"] if payload["rows"] else None
    }, indent=2))
finally:
    conn.close()
`;

function unix(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

function isoDateFromUnix(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function fetchYahooChart() {
  const period1 = unix(START_DATE);
  const period2 = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${TICKER}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
  const response = await fetch(url, {
    headers: { "User-Agent": "fundamental-analysis-tsm-backend-price-importer" },
  });
  if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
  const json = await response.json();
  const result = json.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error(`Yahoo response did not include timestamps: ${JSON.stringify(json.chart?.error ?? json).slice(0, 500)}`);
  return { url, result, json };
}

export async function importTsmDailyPrices() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { url, result, json } = await fetchYahooChart();
  writeFileSync(path.join(OUT_DIR, "yahoo_tsm_chart.json"), JSON.stringify(json, null, 2));
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const rows = result.timestamp.map((timestamp, index) => {
    const close = quote.close?.[index] ?? null;
    const adjustedClose = adjclose[index] ?? close;
    const adjustedCloseWasProxy = adjclose[index] == null && close != null;
    return {
      ticker: TICKER,
      priceDate: isoDateFromUnix(timestamp),
      open: quote.open?.[index] ?? null,
      high: quote.high?.[index] ?? null,
      low: quote.low?.[index] ?? null,
      close,
      adjustedClose,
      volume: quote.volume?.[index] ?? null,
      source: SOURCE,
      sourceType: adjustedCloseWasProxy ? "market_data_unadjusted_proxy" : "market_data",
      rawJson: JSON.stringify({ sourceUrl: url, adjustedCloseWasProxy }),
    };
  }).filter((row) => Number.isFinite(row.adjustedClose));
  const resultPayload = spawnSync("python3", ["-c", importPython], {
    input: JSON.stringify({ dbPath: TSM_BACKEND_DB_PATH, rows }),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (resultPayload.status !== 0) throw new Error(resultPayload.stderr || resultPayload.stdout);
  return JSON.parse(resultPayload.stdout);
}
