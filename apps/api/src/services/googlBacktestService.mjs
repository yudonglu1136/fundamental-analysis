import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { GOOGL_BACKEND_DB_PATH } from "../../../../modules/googl/db/schema.mjs";

const TICKER = "GOOGL";
const DEFAULT_MODEL_VERSION = "googl_v1_backend_pilot";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteNumber(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dailyReturns(series) {
  const returns = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = finiteNumber(series[index - 1]?.value);
    const current = finiteNumber(series[index]?.value);
    if (previous && current) returns.push(current / previous - 1);
  }
  return returns;
}

function annualizedVolatility(returns) {
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function maxDrawdown(series) {
  let peak = series[0]?.value ?? 1;
  let drawdown = 0;
  for (const point of series) {
    peak = Math.max(peak, point.value);
    if (peak > 0) drawdown = Math.min(drawdown, point.value / peak - 1);
  }
  return drawdown;
}

function metrics(series) {
  if (series.length < 2) return { totalReturn: null, cagr: null, maxDrawdown: null, sharpe: null, volatility: null };
  const start = series[0];
  const end = series[series.length - 1];
  const days = Math.max(1, (Date.parse(end.date) - Date.parse(start.date)) / 86400000);
  const totalReturn = end.value / start.value - 1;
  const cagr = (end.value / start.value) ** (365.25 / days) - 1;
  const returns = dailyReturns(series);
  const volatility = annualizedVolatility(returns);
  const averageDailyReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
  const sharpe = volatility && averageDailyReturn != null ? (averageDailyReturn * 252) / volatility : null;
  return {
    totalReturn,
    cagr,
    maxDrawdown: maxDrawdown(series),
    sharpe,
    volatility,
  };
}

function getPriceBars(ticker, startDate, endDate) {
  return query(
    `SELECT ticker, priceDate, open, high, low, close, adjustedClose, volume, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ?
       AND priceDate >= ?
       AND priceDate <= ?
       AND (adjustedClose IS NOT NULL OR close IS NOT NULL)
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    GOOGL_BACKEND_DB_PATH,
  ).map((row) => {
    const adjustedClose = finiteNumber(row.adjustedClose);
    const close = finiteNumber(row.close);
    return {
      ...row,
      close,
      adjustedClose,
      value: adjustedClose ?? close,
      usesAdjustedClose: adjustedClose != null,
    };
  }).filter((row) => row.value != null);
}

export function getGooglBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    GOOGL_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runGooglBacktest({
  startDate = "2018-01-02",
  endDate = new Date().toISOString().slice(0, 10),
  modelVersion = DEFAULT_MODEL_VERSION,
  benchmarkTicker = "SPY",
} = {}) {
  const stockBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (stockBars.length < 2) warnings.push("GOOGL daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  if (stockBars.some((row) => !row.usesAdjustedClose)) warnings.push("GOOGL daily price history uses unadjusted close where adjusted close is unavailable; returns are price-return only.");
  if (benchmarkBars.some((row) => !row.usesAdjustedClose)) warnings.push(`${benchmarkTicker} daily price history uses unadjusted close where adjusted close is unavailable; returns are price-return only.`);
  if (warnings.some((warning) => warning.includes("unavailable or too short"))) {
    return {
      persisted: false,
      status: "insufficient_data",
      ticker: TICKER,
      benchmarkTicker,
      startDate,
      endDate,
      warnings,
      priceBars: {
        [TICKER]: stockBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

  const benchmarkByDate = new Map(benchmarkBars.map((row) => [row.priceDate, row]));
  let stockValue = 1;
  let benchmarkValue = 1;
  let previousStock = stockBars[0];
  let previousBenchmark = benchmarkByDate.get(stockBars[0].priceDate) ?? benchmarkBars[0];
  const curve = [];

  for (let index = 0; index < stockBars.length; index += 1) {
    const stock = stockBars[index];
    const benchmark = benchmarkByDate.get(stock.priceDate);
    if (!benchmark) continue;

    if (curve.length) {
      stockValue *= 1 + (stock.value / previousStock.value - 1);
      benchmarkValue *= 1 + (benchmark.value / previousBenchmark.value - 1);
    }

    curve.push({
      date: stock.priceDate,
      spy: benchmarkValue,
      benchmark: benchmarkValue,
      googlBuyHold: stockValue,
    });

    previousStock = stock;
    previousBenchmark = benchmark;
  }

  const stockMetrics = metrics(curve.map((row) => ({ date: row.date, value: row.googlBuyHold })));
  const spyMetrics = metrics(curve.map((row) => ({ date: row.date, value: row.spy })));
  const result = {
    status: "completed",
    ticker: TICKER,
    benchmarkTicker,
    startDate,
    endDate,
    modelVersion,
    priceBars: {
      [TICKER]: stockBars.length,
      [benchmarkTicker]: benchmarkBars.length,
      sources: {
        [TICKER]: stockBars[0]?.source ?? null,
        [benchmarkTicker]: benchmarkBars[0]?.source ?? null,
      },
    },
    metrics: {
      googlBuyHold: stockMetrics,
      stock: stockMetrics,
      spy: spyMetrics,
      benchmark: spyMetrics,
    },
    curve,
    warnings,
  };

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO backtest_runs (
      id, ticker, modelVersion, startDate, endDate, rebalanceFrequency, assumptionsJson,
      resultJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      TICKER,
      modelVersion,
      startDate,
      endDate,
      "daily",
      JSON.stringify({ benchmarkTicker }),
      JSON.stringify(result),
      createdAt,
    ],
    GOOGL_BACKEND_DB_PATH,
  );

  return { id, persisted: true, ...result };
}
