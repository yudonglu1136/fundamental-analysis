import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { TRI_BACKEND_DB_PATH } from "../../../../modules/tri/db/schema.mjs";
import { TRI_BACKEND_MODEL_VERSION } from "../../../../modules/tri/valuation/modelVersion.mjs";

const TICKER = "TRI";

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
    TRI_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    adjustedClose: Number(row.adjustedClose),
  }));
}

export function getTriBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    TRI_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runTriBacktest({
  startDate = "2018-01-02",
  endDate = new Date().toISOString().slice(0, 10),
  modelVersion = TRI_BACKEND_MODEL_VERSION.version,
  benchmarkTicker = "SPY",
} = {}) {
  const triBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (triBars.length < 2) warnings.push("TRI daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  if (triBars.some((row) => row.sourceType === "market_data_unadjusted_or_close_fallback")) {
    warnings.push("TRI adjusted close fell back to close for at least one row; return series may not be dividend-adjusted.");
  }
  if (benchmarkBars.some((row) => row.sourceType === "market_data_unadjusted_or_close_fallback")) {
    warnings.push(`${benchmarkTicker} adjusted close fell back to close for at least one row; return series may not be dividend-adjusted.`);
  }
  if (warnings.some((warning) => warning.includes("unavailable"))) {
    return {
      persisted: false,
      status: "insufficient_data",
      warnings,
      priceBars: {
        [TICKER]: triBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

  const benchmarkByDate = new Map(benchmarkBars.map((row) => [row.priceDate, row]));
  let triBuyHoldValue = 1;
  let benchmarkValue = 1;
  let previousTri = triBars[0];
  let previousBenchmark = benchmarkByDate.get(triBars[0].priceDate) ?? benchmarkBars[0];
  const curve = [];

  for (let index = 0; index < triBars.length; index += 1) {
    const tri = triBars[index];
    const benchmark = benchmarkByDate.get(tri.priceDate);
    if (!benchmark) continue;

    if (curve.length) {
      const triReturn = tri.adjustedClose / previousTri.adjustedClose - 1;
      const benchmarkReturn = benchmark.adjustedClose / previousBenchmark.adjustedClose - 1;
      triBuyHoldValue *= 1 + triReturn;
      benchmarkValue *= 1 + benchmarkReturn;
    }

    curve.push({
      date: tri.priceDate,
      triBuyHold: triBuyHoldValue,
      spy: benchmarkValue,
      benchmark: benchmarkValue,
      triPrice: tri.adjustedClose,
      benchmarkPrice: benchmark.adjustedClose,
    });

    previousTri = tri;
    previousBenchmark = benchmark;
  }

  const result = {
    ticker: TICKER,
    benchmarkTicker,
    startDate,
    endDate,
    modelVersion,
    priceBars: {
      [TICKER]: triBars.length,
      [benchmarkTicker]: benchmarkBars.length,
      sources: {
        [TICKER]: triBars[0]?.source ?? null,
        [benchmarkTicker]: benchmarkBars[0]?.source ?? null,
      },
    },
    metrics: {
      triBuyHold: metrics(curve.map((row) => ({ date: row.date, value: row.triBuyHold }))),
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
      "daily",
      JSON.stringify({ benchmarkTicker }),
      JSON.stringify(result),
      createdAt,
    ],
    TRI_BACKEND_DB_PATH,
  );

  return { id, persisted: true, status: "completed", ...result };
}
