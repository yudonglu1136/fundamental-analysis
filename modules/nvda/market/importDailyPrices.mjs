import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { NVDA_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/nvda/market");
const START_DATE = "2018-01-02";
const END_DATE = "2026-05-12";

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function epochSeconds(isoDate) {
  return Math.floor(Date.parse(`${isoDate}T00:00:00.000Z`) / 1000);
}

function eventMap(events, type) {
  const rows = Object.values(events?.[type] ?? {});
  return new Map(rows.map((row) => [new Date(row.date * 1000).toISOString().slice(0, 10), row]));
}

function parseYahooChartJson(json, ticker, source = "Yahoo Finance chart API") {
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const dividends = eventMap(result?.events, "dividends");
  const splits = eventMap(result?.events, "splits");
  const fetchedAt = new Date().toISOString();
  const rows = timestamps.map((timestamp, index) => {
    const priceDate = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const close = numberOrNull(quote.close?.[index]);
    const adjustedClose = numberOrNull(adjusted[index]) ?? close;
    if (close == null && adjustedClose == null) return null;
    const split = splits.get(priceDate);
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
      dividendAmount: numberOrNull(dividends.get(priceDate)?.amount),
      splitCoefficient: split ? numberOrNull(split.numerator) / Math.max(numberOrNull(split.denominator) ?? 1, 1) : null,
      source,
      sourceType: adjusted[index] != null ? "market_data_adjusted" : "market_data_unadjusted_close_used_as_adjusted",
      fetchedAt,
      rawJson: JSON.stringify({
        open: quote.open?.[index],
        high: quote.high?.[index],
        low: quote.low?.[index],
        close: quote.close?.[index],
        adjustedClose: adjusted[index],
        volume: quote.volume?.[index],
      }),
    };
  }).filter(Boolean);
  return rows.sort((left, right) => left.priceDate.localeCompare(right.priceDate));
}

function readLocalYahoo(ticker) {
  const filePath = path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`);
  if (!existsSync(filePath)) return [];
  try {
    return parseYahooChartJson(JSON.parse(readFileSync(filePath, "utf8")), ticker, "Yahoo Finance chart API local cache");
  } catch {
    return [];
  }
}

async function fetchYahooChart(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${epochSeconds(START_DATE)}&period2=${epochSeconds("2026-05-13")}&interval=1d&events=div%2Csplits`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 fundamental-analysis NVDA backend",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) throw new Error(`${ticker} Yahoo chart fetch failed with HTTP ${response.status}`);
  const json = await response.json();
  mkdirSync(MARKET_DIR, { recursive: true });
  writeFileSync(path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`), `${JSON.stringify(json, null, 2)}\n`);
  return parseYahooChartJson(json, ticker);
}

function nextDay(date) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function isWeekday(date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

const PROXY_ANCHORS = {
  NVDA: [
    ["2018-01-02", 4.8],
    ["2018-12-31", 3.3],
    ["2019-12-31", 5.9],
    ["2020-12-31", 13.0],
    ["2021-12-31", 29.4],
    ["2022-12-30", 14.6],
    ["2023-12-29", 49.5],
    ["2024-12-31", 134.0],
    ["2025-12-31", 185.0],
    ["2026-05-12", 225.8],
  ],
  SPY: [
    ["2018-01-02", 268],
    ["2018-12-31", 250],
    ["2019-12-31", 322],
    ["2020-12-31", 373],
    ["2021-12-31", 475],
    ["2022-12-30", 383],
    ["2023-12-29", 476],
    ["2024-12-31", 586],
    ["2025-12-31", 682],
    ["2026-05-12", 738],
  ],
};

function interpolateAnchors(anchors, isoDate) {
  const target = Date.parse(`${isoDate}T00:00:00.000Z`);
  for (let index = 1; index < anchors.length; index += 1) {
    const [leftDate, leftValue] = anchors[index - 1];
    const [rightDate, rightValue] = anchors[index];
    const leftTime = Date.parse(`${leftDate}T00:00:00.000Z`);
    const rightTime = Date.parse(`${rightDate}T00:00:00.000Z`);
    if (target <= rightTime) {
      const ratio = (target - leftTime) / Math.max(rightTime - leftTime, 1);
      return leftValue + (rightValue - leftValue) * ratio;
    }
  }
  return anchors[anchors.length - 1][1];
}

function generateProxyRows(ticker) {
  const rows = [];
  let cursor = new Date(`${START_DATE}T00:00:00.000Z`);
  const end = new Date(`${END_DATE}T00:00:00.000Z`);
  const anchors = PROXY_ANCHORS[ticker];
  while (cursor <= end) {
    if (isWeekday(cursor)) {
      const priceDate = cursor.toISOString().slice(0, 10);
      const base = interpolateAnchors(anchors, priceDate);
      const wave = Math.sin(rows.length / 15) * 0.018 + Math.cos(rows.length / 43) * 0.011;
      const close = Math.max(0.01, base * (1 + wave));
      rows.push({
        id: `${ticker}-${priceDate}`,
        ticker,
        priceDate,
        open: Number((close * 0.996).toFixed(4)),
        high: Number((close * 1.012).toFixed(4)),
        low: Number((close * 0.988).toFixed(4)),
        close: Number(close.toFixed(4)),
        adjustedClose: Number(close.toFixed(4)),
        volume: null,
        dividendAmount: null,
        splitCoefficient: null,
        source: "Research-only proxy daily price curve",
        sourceType: "research_only_proxy_price_curve",
        fetchedAt: new Date().toISOString(),
        rawJson: JSON.stringify({ proxy: true, anchors }),
      });
    }
    cursor = nextDay(cursor);
  }
  return rows;
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
    input: JSON.stringify({ dbPath: NVDA_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`NVDA price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

async function rowsForTicker(ticker) {
  const warnings = [];
  const local = readLocalYahoo(ticker);
  if (local.length >= 2000) return { rows: local, warnings };
  try {
    const fetched = await fetchYahooChart(ticker);
    if (fetched.length >= 2000) return { rows: fetched, warnings };
    warnings.push(`${ticker} Yahoo chart returned only ${fetched.length} rows.`);
  } catch (error) {
    warnings.push(`${ticker} Yahoo chart fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const proxy = generateProxyRows(ticker);
  warnings.push(`${ticker} uses research-only proxy daily price bars because Yahoo market data was unavailable.`);
  return { rows: proxy, warnings };
}

export async function upsertNvdaDailyPriceBars({ tickers = ["NVDA", "SPY"] } = {}) {
  const warnings = [];
  const imported = [];
  for (const ticker of tickers) {
    const { rows, warnings: tickerWarnings } = await rowsForTicker(ticker);
    warnings.push(...tickerWarnings.filter(Boolean));
    const upsert = bulkUpsertRows(rows, ticker);
    imported.push({
      ticker,
      rowCount: rows.length,
      upserted: upsert.upserted,
      source: rows[0]?.source ?? null,
      sourceType: rows[0]?.sourceType ?? null,
      firstDate: rows[0]?.priceDate ?? null,
      lastDate: rows[rows.length - 1]?.priceDate ?? null,
    });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate, MIN(source) AS source, MIN(sourceType) AS sourceType FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    NVDA_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
