import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPriceSeriesFromDb, writePriceSeriesToDb } from "./localDatabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const priceCacheDir = path.join(__dirname, "cache", "prices");
const localPriceDir = path.resolve(__dirname, "..", "..", "market-intel-dashboard", "data", "raw", "market_structure", "prices");
const priceCacheTtlMs = 1000 * 60 * 60 * 6;

function yahooSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(/\./g, "-");
}

function cacheKey(symbol, start, end) {
  return `${yahooSymbol(symbol)}-${start}-${end}.json`.replace(/[^A-Z0-9_.-]/gi, "_");
}

function dateMs(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function rangeCovered(points, start, end) {
  if (!points.length) return false;
  const first = dateMs(points[0].date);
  const last = dateMs(points[points.length - 1].date);
  const startTime = dateMs(start);
  const endTime = dateMs(end);
  const tradingGapMs = 1000 * 60 * 60 * 24 * 7;
  return first <= startTime + tradingGapMs && last >= endTime - tradingGapMs;
}

function unix(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

function isoDateFromUnix(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function loadLocalSeries(symbol, start, end) {
  const filePath = path.join(localPriceDir, `${String(symbol).toUpperCase()}.csv`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const rows = raw.trim().split(/\r?\n/).slice(1);
    return rows
      .map((row) => {
        const [date, rowSymbol, open, high, low, close, volume] = row.split(",");
        return {
          date,
          symbol: rowSymbol || symbol,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume)
        };
      })
      .filter((point) => point.date >= start && point.date <= end && Number.isFinite(point.close));
  } catch {
    return [];
  }
}

async function fetchYahooSeries(symbol, start, end) {
  const encoded = encodeURIComponent(yahooSymbol(symbol));
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?period1=${unix(start)}&period2=${unix(end) + 86400}&interval=1d&events=history`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 guru-analysis-dashboard/0.1",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo chart failed ${response.status} for ${symbol}`);
  }

  const json = await response.json();
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};

  return timestamps
    .map((timestamp, index) => ({
      date: isoDateFromUnix(timestamp),
      symbol: String(symbol).toUpperCase(),
      open: quote.open?.[index] ?? null,
      high: quote.high?.[index] ?? null,
      low: quote.low?.[index] ?? null,
      close: quote.close?.[index] ?? null,
      volume: quote.volume?.[index] ?? null
    }))
    .filter((point) => Number.isFinite(point.close));
}

export async function loadPriceSeries(symbol, { start, end }) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) return { symbol: "", source: "missing", points: [] };

  const dbPoints = readPriceSeriesFromDb(normalized, start, end);
  if (rangeCovered(dbPoints, start, end)) {
    return {
      symbol: normalized,
      source: "sqlite",
      generatedAt: new Date().toISOString(),
      cache: "sqlite-hit",
      points: dbPoints
    };
  }

  const cacheFile = path.join(priceCacheDir, cacheKey(normalized, start, end));
  const cached = await readJson(cacheFile);
  if (cached && Date.now() - new Date(cached.generatedAt).getTime() < priceCacheTtlMs) {
    writePriceSeriesToDb(normalized, cached.points || [], cached.source || "json-cache");
    return { ...cached, cache: "hit" };
  }

  let source = "yahoo";
  let points = [];

  try {
    points = await fetchYahooSeries(normalized, start, end);
  } catch {
    points = await loadLocalSeries(normalized, start, end);
    source = points.length ? "local-csv" : "unavailable";
  }

  const payload = {
    symbol: normalized,
    source,
    generatedAt: new Date().toISOString(),
    points
  };
  writePriceSeriesToDb(normalized, points, source);
  await writeJson(cacheFile, payload);
  return payload;
}

export function nearestPoint(points, date) {
  if (!points?.length || !date) return null;
  const target = new Date(date).getTime();
  let best = points[0];
  let bestDistance = Math.abs(new Date(best.date).getTime() - target);

  for (const point of points) {
    const distance = Math.abs(new Date(point.date).getTime() - target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
}
