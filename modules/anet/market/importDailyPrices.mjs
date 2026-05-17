import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { query } from "../../../apps/api/src/db/client.mjs";
import { ANET_BACKEND_DB_PATH } from "../db/schema.mjs";

const MARKET_DIR = path.resolve("data/local/anet/market");

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseYahooChart(filePath, ticker) {
  if (!existsSync(filePath)) return { rows: [], warning: `${ticker} Yahoo chart file not found: ${filePath}` };
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!timestamps.length) return { rows: [], warning: `${ticker} Yahoo chart payload has no daily timestamps.` };
  const rows = timestamps.map((timestamp, index) => {
    const priceDate = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const row = {
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      adjustedClose: adjclose[index] ?? quote.close?.[index],
      volume: quote.volume?.[index],
    };
    return {
      id: `${ticker}-${priceDate}`,
      ticker,
      priceDate,
      open: numberOrNull(row.open),
      high: numberOrNull(row.high),
      low: numberOrNull(row.low),
      close: numberOrNull(row.close),
      adjustedClose: numberOrNull(row.adjustedClose),
      volume: numberOrNull(row.volume),
      dividendAmount: null,
      splitCoefficient: null,
      source: "Yahoo Finance chart API",
      sourceType: "market_data",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify(row),
    };
  }).filter((row) => row.adjustedClose != null);
  return { rows, warning: null };
}

function interpolateAnchors(anchors, date) {
  const time = Date.parse(date);
  let previous = anchors[0];
  let next = anchors[anchors.length - 1];
  for (let index = 0; index < anchors.length; index += 1) {
    if (Date.parse(anchors[index][0]) <= time) previous = anchors[index];
    if (Date.parse(anchors[index][0]) >= time) {
      next = anchors[index];
      break;
    }
  }
  if (previous[0] === next[0]) return previous[1];
  const span = Date.parse(next[0]) - Date.parse(previous[0]);
  const progress = span > 0 ? (time - Date.parse(previous[0])) / span : 0;
  return previous[1] + (next[1] - previous[1]) * progress;
}

function generateProxyRows(ticker) {
  const anchors = ticker === "ANET"
    ? [
        ["2018-01-02", 12.5],
        ["2018-12-31", 13],
        ["2019-12-31", 12.75],
        ["2020-03-23", 10.5],
        ["2020-12-31", 18],
        ["2021-12-31", 32.5],
        ["2022-12-30", 30.25],
        ["2023-12-29", 58.75],
        ["2024-12-31", 110],
        ["2025-12-31", 96],
        ["2026-05-01", 141],
        ["2026-05-12", 141],
      ]
    : [
        ["2018-01-02", 245],
        ["2018-12-31", 250],
        ["2019-12-31", 321],
        ["2020-03-23", 222],
        ["2020-12-31", 371],
        ["2021-12-31", 475],
        ["2022-12-30", 383],
        ["2023-12-29", 475],
        ["2024-12-31", 586],
        ["2025-12-31", 640],
        ["2026-05-12", 660],
      ];
  const rows = [];
  const start = new Date("2018-01-02T00:00:00.000Z");
  const end = new Date("2026-05-12T00:00:00.000Z");
  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    const priceDate = date.toISOString().slice(0, 10);
    const baseline = interpolateAnchors(anchors, priceDate);
    const index = rows.length;
    const cycle = Math.sin(index / 19) * 0.012 + Math.sin(index / 53) * 0.018;
    const isAnchorDate = anchors.some(([anchorDate]) => anchorDate === priceDate);
    const adjustedClose = Math.max(1, isAnchorDate ? baseline : baseline * (1 + cycle));
    rows.push({
      id: `${ticker}-${priceDate}`,
      ticker,
      priceDate,
      open: adjustedClose * 0.995,
      high: adjustedClose * 1.012,
      low: adjustedClose * 0.988,
      close: adjustedClose,
      adjustedClose,
      volume: ticker === "ANET" ? 3_000_000 + (index % 10) * 35_000 : 72_000_000 + (index % 10) * 500_000,
      dividendAmount: null,
      splitCoefficient: null,
      source: "deterministic backend proxy curve from public market-history anchors",
      sourceType: "market_data_proxy",
      fetchedAt: new Date().toISOString(),
      rawJson: JSON.stringify({
        sourceQuality: "market_data_proxy",
        note: "Generated only because local official/Yahoo chart files were absent.",
      }),
    });
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
    input: JSON.stringify({ dbPath: ANET_BACKEND_DB_PATH, rows, ticker }),
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`ANET price bulk import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

export function upsertAnetDailyPriceBars({ tickers = ["ANET", "SPY"] } = {}) {
  const warnings = [];
  const imported = [];
  for (const ticker of tickers) {
    const parsed = parseYahooChart(path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`), ticker);
    const rows = parsed.rows.length ? parsed.rows : generateProxyRows(ticker);
    if (parsed.warning) warnings.push(`${parsed.warning}; generated proxy bars for ${ticker}.`);
    const upsert = bulkUpsertRows(rows, ticker);
    imported.push({
      ticker,
      rowCount: rows.length,
      upserted: upsert.upserted,
      source: rows[0]?.source ?? null,
      sourceType: rows[0]?.sourceType ?? null,
      firstDate: rows[0]?.priceDate ?? null,
      lastDate: rows.at(-1)?.priceDate ?? null,
    });
  }
  const counts = query(
    "SELECT ticker, COUNT(*) AS rowCount, MIN(priceDate) AS firstDate, MAX(priceDate) AS lastDate FROM daily_price_bars GROUP BY ticker ORDER BY ticker",
    [],
    ANET_BACKEND_DB_PATH,
  );
  return { imported, counts, warnings };
}
