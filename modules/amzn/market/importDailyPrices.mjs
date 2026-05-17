import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { AMZN_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/amzn/market");
const FALLBACK_MARKET_DIRS = [
  path.resolve("data/local/amzn/market"),
  path.resolve("data/local/msft/market"),
  path.resolve("data/local/meta/market"),
  path.resolve("data/local/googl/market"),
];

function numberOrNull(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseYahooChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Yahoo chart file not found: ${filePath}` };
  try {
    const json = JSON.parse(readFileSync(filePath, "utf8"));
    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0] ?? {};
    const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
    if (!timestamps.length) return { rows: [], warning: `${ticker} Yahoo chart payload does not include daily prices.` };
    const rows = timestamps.map((timestamp, index) => {
      const priceDate = new Date(timestamp * 1000).toISOString().slice(0, 10);
      const close = numberOrNull(quote.close?.[index]);
      const adjustedClose = numberOrNull(adjusted[index]) ?? close;
      if (close == null && adjustedClose == null) return null;
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
        dividendAmount: null,
        splitCoefficient: null,
        source: "Yahoo Finance chart API local cache",
        sourceType: adjusted[index] != null ? "market_data_adjusted" : "market_data_unadjusted_close_used_as_adjusted",
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
    }).filter(Boolean).sort((left, right) => left.priceDate.localeCompare(right.priceDate));
    return {
      rows,
      warning: rows.some((row) => row.sourceType !== "market_data_adjusted") ? `${ticker} Yahoo rows are missing adjusted close on some dates.` : null,
    };
  } catch (error) {
    return { rows: [], warning: `${ticker} Yahoo chart parse failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function parseStooqCsv(csv, ticker, source = "Stooq daily CSV") {
  const lines = String(csv ?? "").trim().split(/\r?\n/);
  if (!lines[0]?.toLowerCase().startsWith("date,")) return [];
  return lines.slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(",");
    const parsedClose = numberOrNull(close);
    if (!date || parsedClose == null) return null;
    return {
      id: `${ticker}-${date}`,
      ticker,
      priceDate: date,
      open: numberOrNull(open),
      high: numberOrNull(high),
      low: numberOrNull(low),
      close: parsedClose,
      adjustedClose: parsedClose,
      volume: numberOrNull(volume),
      dividendAmount: null,
      splitCoefficient: null,
      source,
      sourceType: "market_data_unadjusted_close_used_as_adjusted",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify({ date, open, high, low, close, volume }),
    };
  }).filter(Boolean);
}

async function fetchStooq(ticker) {
  const symbol = ticker === "SPY" ? "spy.us" : "amzn.us";
  const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d&d1=20180102&d2=20260512`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "fundamental-analysis-amzn-backend/1.0" } });
    if (!response.ok) return { rows: [], warning: `${ticker} Stooq fetch failed with HTTP ${response.status}.` };
    const text = await response.text();
    const rows = parseStooqCsv(text, ticker, "Stooq daily CSV public endpoint");
    if (!rows.length) return { rows: [], warning: `${ticker} Stooq response did not contain parseable daily prices.` };
    return {
      rows,
      warning: `${ticker} Stooq rows are close-price based; adjusted close is not separately available in this endpoint.`,
    };
  } catch (error) {
    return { rows: [], warning: `${ticker} Stooq fetch failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function sourcesForTicker(ticker) {
  const lower = ticker.toLowerCase();
  const localSources = [];
  for (const directory of FALLBACK_MARKET_DIRS) {
    localSources.push(() => parseYahooChart(path.join(directory, `yahoo_${lower}_chart.json`), ticker));
  }
  return localSources;
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

const AMZN_ANCHORS = [
  ["2018-01-02", 59],
  ["2018-12-31", 75],
  ["2019-12-31", 92],
  ["2020-12-31", 163],
  ["2021-12-31", 167],
  ["2022-12-30", 84],
  ["2023-12-29", 151],
  ["2024-12-31", 220],
  ["2025-12-31", 232],
  ["2026-05-12", 188],
];

const SPY_ANCHORS = [
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
];

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
  const anchors = ticker === "SPY" ? SPY_ANCHORS : AMZN_ANCHORS;
  const rows = [];
  let cursor = new Date("2018-01-02T00:00:00.000Z");
  const end = new Date("2026-05-12T00:00:00.000Z");
  while (cursor <= end) {
    if (isWeekday(cursor)) {
      const priceDate = cursor.toISOString().slice(0, 10);
      const base = interpolateAnchors(anchors, priceDate);
      const wave = Math.sin(rows.length / 17) * 0.014 + Math.cos(rows.length / 41) * 0.009;
      const close = Math.max(1, base * (1 + wave));
      rows.push({
        id: `${ticker}-${priceDate}`,
        ticker,
        priceDate,
        open: Number((close * 0.996).toFixed(4)),
        high: Number((close * 1.01).toFixed(4)),
        low: Number((close * 0.99).toFixed(4)),
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
    input: JSON.stringify({ dbPath: AMZN_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`AMZN price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

async function rowsForTicker(ticker) {
  const warnings = [];
  for (const parseSource of sourcesForTicker(ticker)) {
    const parsed = parseSource();
    if (parsed.rows.length) {
      if (parsed.warning) warnings.push(parsed.warning);
      return { rows: parsed.rows, warnings };
    }
    if (parsed.warning && parsed.warning.includes(MARKET_DIR)) warnings.push(parsed.warning);
  }
  const fetched = await fetchStooq(ticker);
  if (fetched.rows.length) {
    if (fetched.warning) warnings.push(fetched.warning);
    return { rows: fetched.rows, warnings };
  }
  if (fetched.warning) warnings.push(fetched.warning);
  const proxy = generateProxyRows(ticker);
  warnings.push(`${ticker} uses research-only proxy daily price bars because no local or fetched market-data source was available.`);
  return { rows: proxy, warnings };
}

export async function upsertAmznDailyPriceBars({ tickers = ["AMZN", "SPY"] } = {}) {
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
    AMZN_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
