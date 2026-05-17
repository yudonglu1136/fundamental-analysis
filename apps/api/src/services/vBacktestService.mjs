import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { V_BACKEND_DB_PATH } from "../../../../modules/v/db/schema.mjs";
import { V_BACKEND_MODEL_VERSION } from "../../../../modules/v/valuation/modelVersion.mjs";

const TICKER = "V";
const DEFAULT_MODEL_VERSION = V_BACKEND_MODEL_VERSION.version;

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
  const days = Math.max(1, (Date.parse(end.date) - Date.parse(start.date)) / 86_400_000);
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
    `SELECT ticker, priceDate, open, high, low, close, adjustedClose, volume, source
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate >= ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    V_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    adjustedClose: Number(row.adjustedClose),
  }));
}

export function getVBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    V_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runVBacktest({
  startDate = "2018-01-02",
  endDate = "2026-05-12",
  modelVersion = DEFAULT_MODEL_VERSION,
  benchmarkTicker = "SPY",
} = {}) {
  const vBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (vBars.length < 2) warnings.push("V daily adjusted price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily adjusted price history is unavailable or too short for the selected window.`);
  if (warnings.length) {
    return {
      persisted: false,
      status: "insufficient_data",
      warnings,
      priceBars: {
        [TICKER]: vBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

  const benchmarkByDate = new Map(benchmarkBars.map((row) => [row.priceDate, row]));
  let vBuyHoldValue = 1;
  let benchmarkValue = 1;
  let previousV = vBars[0];
  let previousBenchmark = benchmarkByDate.get(vBars[0].priceDate) ?? benchmarkBars[0];
  const curve = [];

  for (let index = 0; index < vBars.length; index += 1) {
    const v = vBars[index];
    const benchmark = benchmarkByDate.get(v.priceDate);
    if (!benchmark) continue;
    if (curve.length) {
      const vReturn = v.adjustedClose / previousV.adjustedClose - 1;
      const benchmarkReturn = benchmark.adjustedClose / previousBenchmark.adjustedClose - 1;
      vBuyHoldValue *= 1 + vReturn;
      benchmarkValue *= 1 + benchmarkReturn;
    }
    curve.push({
      date: v.priceDate,
      vBuyHold: vBuyHoldValue,
      spy: benchmarkValue,
      benchmark: benchmarkValue,
      price: v.adjustedClose,
    });
    previousV = v;
    previousBenchmark = benchmark;
  }

  const result = {
    ticker: TICKER,
    benchmarkTicker,
    startDate,
    endDate,
    priceBars: {
      [TICKER]: vBars.length,
      [benchmarkTicker]: benchmarkBars.length,
      sources: {
        [TICKER]: vBars[0]?.source ?? null,
        [benchmarkTicker]: benchmarkBars[0]?.source ?? null,
      },
    },
    metrics: {
      vBuyHold: metrics(curve.map((row) => ({ date: row.date, value: row.vBuyHold }))),
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
      "buy_and_hold",
      JSON.stringify({ benchmarkTicker }),
      JSON.stringify(result),
      createdAt,
    ],
    V_BACKEND_DB_PATH,
  );

  return { id, persisted: true, status: "completed", ...result };
}
