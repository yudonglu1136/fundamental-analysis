import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { GILD_BACKEND_DB_PATH } from "../../../../modules/gild/db/schema.mjs";
import { GILD_BACKEND_MODEL_VERSION } from "../../../../modules/gild/valuation/modelVersion.mjs";

const TICKER = "GILD";

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
     WHERE ticker = ? AND priceDate >= ? AND priceDate <= ? AND (adjustedClose IS NOT NULL OR close IS NOT NULL)
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    GILD_BACKEND_DB_PATH,
  ).map((row) => {
    const adjustedClose = finiteNumber(row.adjustedClose);
    const close = finiteNumber(row.close);
    return {
      ...row,
      adjustedClose,
      close,
      price: adjustedClose ?? close,
      usedUnadjustedClose: adjustedClose == null && close != null,
    };
  }).filter((row) => row.price != null);
}

export function getGildBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    GILD_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runGildBacktest({
  startDate = "2018-01-01",
  endDate = new Date().toISOString().slice(0, 10),
  modelVersion = GILD_BACKEND_MODEL_VERSION.version,
  benchmarkTicker = "SPY",
} = {}) {
  const stockBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (stockBars.length < 2) warnings.push("GILD daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  if (stockBars.some((row) => row.usedUnadjustedClose)) warnings.push("GILD adjusted close was unavailable for at least one row; unadjusted close was used as a fallback.");
  if (benchmarkBars.some((row) => row.usedUnadjustedClose)) warnings.push(`${benchmarkTicker} adjusted close was unavailable for at least one row; unadjusted close was used as a fallback.`);
  if (stockBars.length < 2 || benchmarkBars.length < 2) {
    return {
      persisted: false,
      status: "insufficient_data",
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

  for (const stock of stockBars) {
    const benchmark = benchmarkByDate.get(stock.priceDate);
    if (!benchmark) continue;
    if (curve.length) {
      stockValue *= stock.price / previousStock.price;
      benchmarkValue *= benchmark.price / previousBenchmark.price;
    }
    curve.push({
      date: stock.priceDate,
      stock: stockValue,
      gildBuyHold: stockValue,
      spy: benchmarkValue,
      benchmark: benchmarkValue,
      stockPrice: stock.price,
      benchmarkPrice: benchmark.price,
    });
    previousStock = stock;
    previousBenchmark = benchmark;
  }

  if (curve.length < 2) {
    return {
      persisted: false,
      status: "insufficient_overlap",
      warnings: [...warnings, "GILD and SPY daily histories do not have enough overlapping trading dates."],
      priceBars: {
        [TICKER]: stockBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

  const stockSeries = curve.map((row) => ({ date: row.date, value: row.stock }));
  const benchmarkSeries = curve.map((row) => ({ date: row.date, value: row.spy }));
  const result = {
    ticker: TICKER,
    benchmarkTicker,
    startDate,
    endDate,
    modelVersion,
    priceBasis: "Daily adjusted close when available; unadjusted close only as an explicit fallback.",
    priceBars: {
      [TICKER]: stockBars.length,
      [benchmarkTicker]: benchmarkBars.length,
      overlap: curve.length,
      sources: {
        [TICKER]: stockBars[0]?.source ?? null,
        [benchmarkTicker]: benchmarkBars[0]?.source ?? null,
      },
    },
    metrics: {
      stock: metrics(stockSeries),
      gildBuyHold: metrics(stockSeries),
      spy: metrics(benchmarkSeries),
      benchmark: metrics(benchmarkSeries),
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
      JSON.stringify({ benchmarkTicker, priceBasis: result.priceBasis }),
      JSON.stringify(result),
      createdAt,
    ],
    GILD_BACKEND_DB_PATH,
  );

  return { id, persisted: true, status: "completed", ...result };
}
