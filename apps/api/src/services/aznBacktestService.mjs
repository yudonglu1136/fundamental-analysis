import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { AZN_BACKEND_DB_PATH } from "../../../../modules/azn/db/schema.mjs";
import { AZN_BACKEND_MODEL_VERSION } from "../../../../modules/azn/valuation/modelVersion.mjs";

const TICKER = "AZN.L";
const DEFAULT_MODEL_VERSION = AZN_BACKEND_MODEL_VERSION.version;

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
    AZN_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    adjustedClose: Number(row.adjustedClose),
  }));
}

function sourceWarnings(stockBars, benchmarkBars, benchmarkTicker) {
  const warnings = [];
  const stockSourceType = stockBars[0]?.sourceType ?? "";
  const benchmarkSourceType = benchmarkBars[0]?.sourceType ?? "";
  if (/proxy/i.test(stockSourceType)) {
    warnings.push("AZN.L daily bars use Nasdaq AZN US-line history converted to GBP with a static GBP/USD proxy because direct London adjusted close history is not cached.");
  }
  if (!/adjusted/i.test(stockSourceType) || /unadjusted/i.test(stockSourceType)) {
    warnings.push("AZN.L cached daily bars do not include adjusted close; close is stored in adjustedClose and dividend-adjusted return may be understated.");
  }
  if (!/adjusted/i.test(benchmarkSourceType) || /unadjusted/i.test(benchmarkSourceType)) {
    warnings.push(`${benchmarkTicker} cached daily bars do not include adjusted close; benchmark total return may be understated.`);
  }
  return warnings;
}

export function getAznBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    AZN_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runAznBacktest({
  startDate = "2018-01-02",
  endDate = "2026-05-12",
  modelVersion = DEFAULT_MODEL_VERSION,
  benchmarkTicker = "SPY",
} = {}) {
  const stockBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = sourceWarnings(stockBars, benchmarkBars, benchmarkTicker);

  if (stockBars.length < 2) warnings.push("AZN.L daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  if (stockBars.length < 2 || benchmarkBars.length < 2) {
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
  const curve = [];
  let stockValue = 1;
  let benchmarkValue = 1;
  let previousStock = null;
  let previousBenchmark = null;

  for (const stock of stockBars) {
    const benchmark = benchmarkByDate.get(stock.priceDate);
    if (!benchmark) continue;
    if (previousStock && previousBenchmark) {
      stockValue *= stock.adjustedClose / previousStock.adjustedClose;
      benchmarkValue *= benchmark.adjustedClose / previousBenchmark.adjustedClose;
    }
    curve.push({
      date: stock.priceDate,
      stock: stockValue,
      aznBuyHold: stockValue,
      spy: benchmarkValue,
      benchmark: benchmarkValue,
    });
    previousStock = stock;
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
      warnings: [...warnings, "AZN.L and SPY do not have enough overlapping trading days for the selected window."],
      priceBars: {
        [TICKER]: stockBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
      curve,
    };
  }

  const stockMetrics = metrics(curve.map((row) => ({ date: row.date, value: row.stock })));
  const benchmarkMetrics = metrics(curve.map((row) => ({ date: row.date, value: row.spy })));
  const result = {
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
      stock: stockMetrics,
      aznBuyHold: stockMetrics,
      spy: benchmarkMetrics,
      benchmark: benchmarkMetrics,
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
    AZN_BACKEND_DB_PATH,
  );

  return { id, persisted: true, status: "completed", ...result };
}
