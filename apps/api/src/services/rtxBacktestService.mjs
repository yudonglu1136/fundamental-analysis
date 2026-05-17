import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { RTX_BACKEND_DB_PATH } from "../../../../modules/rtx/db/schema.mjs";
import { RTX_BACKEND_MODEL_VERSION } from "../../../../modules/rtx/valuation/modelVersion.mjs";

const TICKER = "RTX";

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
    RTX_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    adjustedClose: Number(row.adjustedClose),
  }));
}

export function getRtxBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    RTX_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runRtxBacktest({
  startDate = "2018-01-02",
  endDate = "2026-05-12",
  benchmarkTicker = "SPY",
  modelVersion = RTX_BACKEND_MODEL_VERSION.version,
} = {}) {
  const rtxBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (rtxBars.length < 2) warnings.push("RTX daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  if (rtxBars.some((row) => String(row.sourceType).includes("unadjusted")) || benchmarkBars.some((row) => String(row.sourceType).includes("unadjusted"))) {
    warnings.push("One or more price rows use close as an adjusted-close fallback; dividend-adjusted returns may be understated.");
  }
  if (warnings.some((warning) => warning.includes("unavailable") || warning.includes("too short"))) {
    return {
      persisted: false,
      status: "insufficient_data",
      ticker: TICKER,
      benchmarkTicker,
      startDate,
      endDate,
      warnings,
      priceBars: {
        [TICKER]: rtxBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

  const benchmarkByDate = new Map(benchmarkBars.map((row) => [row.priceDate, row]));
  let rtxBuyHoldValue = 1;
  let benchmarkValue = 1;
  let previousRtx = null;
  let previousBenchmark = null;
  const curve = [];

  for (const rtx of rtxBars) {
    const benchmark = benchmarkByDate.get(rtx.priceDate);
    if (!benchmark) continue;
    if (previousRtx && previousBenchmark) {
      rtxBuyHoldValue *= rtx.adjustedClose / previousRtx.adjustedClose;
      benchmarkValue *= benchmark.adjustedClose / previousBenchmark.adjustedClose;
    }
    curve.push({
      date: rtx.priceDate,
      spy: benchmarkValue,
      benchmark: benchmarkValue,
      rtxBuyHold: rtxBuyHoldValue,
      price: rtx.adjustedClose,
      benchmarkPrice: benchmark.adjustedClose,
    });
    previousRtx = rtx;
    previousBenchmark = benchmark;
  }

  if (curve.length < 2) {
    return {
      persisted: false,
      status: "insufficient_data",
      ticker: TICKER,
      benchmarkTicker,
      startDate,
      endDate,
      warnings: [...warnings, "RTX and benchmark price histories do not overlap enough for the selected window."],
      priceBars: {
        [TICKER]: rtxBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

  if (curve[0]?.date > startDate) {
    warnings.push(`Backtest starts on first overlapping trading date ${curve[0].date}.`);
  }
  if (curve.at(-1)?.date < endDate) {
    warnings.push(`Backtest ends on last overlapping trading date ${curve.at(-1).date}.`);
  }

  const result = {
    status: "completed",
    ticker: TICKER,
    benchmarkTicker,
    startDate,
    endDate,
    modelVersion,
    priceBars: {
      [TICKER]: rtxBars.length,
      [benchmarkTicker]: benchmarkBars.length,
      overlap: curve.length,
      sources: {
        [TICKER]: rtxBars[0]?.source ?? null,
        [benchmarkTicker]: benchmarkBars[0]?.source ?? null,
      },
    },
    metrics: {
      rtxBuyHold: metrics(curve.map((row) => ({ date: row.date, value: row.rtxBuyHold }))),
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
    RTX_BACKEND_DB_PATH,
  );

  return { id, persisted: true, ...result };
}
