import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { LEGN_BACKEND_DB_PATH } from "../../../../modules/legn/db/schema.mjs";
import { LEGN_BACKEND_MODEL_VERSION } from "../../../../modules/legn/valuation/modelVersion.mjs";

const TICKER = "LEGN";
const DEFAULT_MODEL_VERSION = LEGN_BACKEND_MODEL_VERSION.version;

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
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
    `SELECT ticker, priceDate, open, high, low, close, adjustedClose, volume, source, sourceType, rawJson
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate >= ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    LEGN_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    adjustedClose: Number(row.adjustedClose),
    close: Number(row.close),
    adjustedCloseProxy: parseJson(row.rawJson, {})?.adjustedCloseProxy === true || row.sourceType === "market_data_close_proxy",
  }));
}

function proxyWarning(ticker, bars) {
  return bars.some((row) => row.adjustedCloseProxy)
    ? `${ticker} daily price bars use close as an adjusted-close proxy because the local Nasdaq payload does not provide adjusted close. Returns may not be dividend-adjusted.`
    : null;
}

export function getLegnBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    LEGN_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runLegnBacktest({
  startDate = "2021-06-01",
  endDate = new Date().toISOString().slice(0, 10),
  modelVersion = DEFAULT_MODEL_VERSION,
  benchmarkTicker = "SPY",
} = {}) {
  const stockBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (stockBars.length < 2) warnings.push("LEGN daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  const stockProxyWarning = proxyWarning(TICKER, stockBars);
  const benchmarkProxyWarning = proxyWarning(benchmarkTicker, benchmarkBars);
  if (stockProxyWarning) warnings.push(stockProxyWarning);
  if (benchmarkProxyWarning) warnings.push(benchmarkProxyWarning);
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
  let stockValue = 1;
  let benchmarkValue = 1;
  let previousStock = null;
  let previousBenchmark = null;
  const curve = [];

  for (const stock of stockBars) {
    const benchmark = benchmarkByDate.get(stock.priceDate);
    if (!benchmark) continue;
    if (previousStock && previousBenchmark) {
      stockValue *= stock.adjustedClose / previousStock.adjustedClose;
      benchmarkValue *= benchmark.adjustedClose / previousBenchmark.adjustedClose;
    }
    curve.push({
      date: stock.priceDate,
      legnBuyHold: stockValue,
      stock: stockValue,
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
      warnings: [...warnings, "LEGN and benchmark histories do not have enough overlapping trading days."],
      priceBars: {
        [TICKER]: stockBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

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
      legnBuyHold: metrics(curve.map((row) => ({ date: row.date, value: row.legnBuyHold }))),
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
    LEGN_BACKEND_DB_PATH,
  );

  return { id, persisted: true, ...result };
}
