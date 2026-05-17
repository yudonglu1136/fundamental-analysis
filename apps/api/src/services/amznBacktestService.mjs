import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { AMZN_BACKEND_DB_PATH } from "../../../../modules/amzn/db/schema.mjs";
import { AMZN_BACKEND_MODEL_VERSION } from "../../../../modules/amzn/valuation/modelVersion.mjs";

const TICKER = "AMZN";
const DEFAULT_MODEL_VERSION = AMZN_BACKEND_MODEL_VERSION.version;

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteNumber(value) {
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
     WHERE ticker = ? AND priceDate >= ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    AMZN_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    adjustedClose: Number(row.adjustedClose),
  }));
}

export function getAmznBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    AMZN_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runAmznBacktest({
  startDate = "2018-01-02",
  endDate = new Date().toISOString().slice(0, 10),
  modelVersion = DEFAULT_MODEL_VERSION,
  benchmarkTicker = "SPY",
} = {}) {
  const amznBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (amznBars.length < 2) warnings.push("AMZN daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  if (amznBars.some((row) => row.sourceType?.includes("unadjusted") || row.sourceType?.includes("proxy"))) {
    warnings.push("AMZN backtest uses rows where adjusted close is unavailable or proxy-sourced; returns may be price-return only.");
  }
  if (benchmarkBars.some((row) => row.sourceType?.includes("unadjusted") || row.sourceType?.includes("proxy"))) {
    warnings.push(`${benchmarkTicker} backtest uses rows where adjusted close is unavailable or proxy-sourced; returns may be price-return only.`);
  }
  if (warnings.some((warning) => warning.includes("unavailable"))) {
    return {
      persisted: false,
      status: "insufficient_data",
      warnings,
      priceBars: {
        [TICKER]: amznBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

  const benchmarkByDate = new Map(benchmarkBars.map((row) => [row.priceDate, row]));
  let amznValue = 1;
  let benchmarkValue = 1;
  let previousAmzn = amznBars[0];
  let previousBenchmark = benchmarkByDate.get(amznBars[0].priceDate) ?? benchmarkBars[0];
  const curve = [];

  for (let index = 0; index < amznBars.length; index += 1) {
    const amzn = amznBars[index];
    const benchmark = benchmarkByDate.get(amzn.priceDate);
    if (!benchmark) continue;
    if (curve.length) {
      const amznReturn = amzn.adjustedClose / previousAmzn.adjustedClose - 1;
      const benchmarkReturn = benchmark.adjustedClose / previousBenchmark.adjustedClose - 1;
      amznValue *= 1 + amznReturn;
      benchmarkValue *= 1 + benchmarkReturn;
    }
    curve.push({
      date: amzn.priceDate,
      spy: benchmarkValue,
      benchmark: benchmarkValue,
      amznBuyHold: amznValue,
    });
    previousAmzn = amzn;
    previousBenchmark = benchmark;
  }

  const result = {
    ticker: TICKER,
    benchmarkTicker,
    startDate,
    endDate,
    modelVersion,
    priceBars: {
      [TICKER]: amznBars.length,
      [benchmarkTicker]: benchmarkBars.length,
      sources: {
        [TICKER]: amznBars[0]?.source ?? null,
        [benchmarkTicker]: benchmarkBars[0]?.source ?? null,
      },
    },
    metrics: {
      amznBuyHold: metrics(curve.map((row) => ({ date: row.date, value: row.amznBuyHold }))),
      spy: metrics(curve.map((row) => ({ date: row.date, value: row.spy }))),
      benchmark: metrics(curve.map((row) => ({ date: row.date, value: row.benchmark }))),
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
      "buy_and_hold_daily",
      JSON.stringify({ benchmarkTicker }),
      JSON.stringify(result),
      createdAt,
    ],
    AMZN_BACKEND_DB_PATH,
  );

  return { id, persisted: true, status: "completed", ...result };
}
