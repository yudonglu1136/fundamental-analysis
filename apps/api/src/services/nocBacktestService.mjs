import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { NOC_BACKEND_DB_PATH } from "../../../../modules/noc/db/schema.mjs";
import { NOC_BACKEND_MODEL_VERSION } from "../../../../modules/noc/valuation/modelVersion.mjs";

const TICKER = "NOC";

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

function priceRows(ticker, startDate, endDate) {
  return query(
    `SELECT priceDate, adjustedClose, close
     FROM daily_price_bars
     WHERE ticker = ?
       AND priceDate >= ?
       AND priceDate <= ?
       AND adjustedClose IS NOT NULL
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    NOC_BACKEND_DB_PATH,
  ).map((row) => ({
    date: row.priceDate,
    price: Number(row.adjustedClose ?? row.close),
  })).filter((row) => finite(row.price));
}

function alignRows(primary, benchmark) {
  const benchmarkByDate = new Map(benchmark.map((row) => [row.date, row.price]));
  return primary
    .filter((row) => benchmarkByDate.has(row.date))
    .map((row) => ({
      date: row.date,
      nocPrice: row.price,
      benchmarkPrice: benchmarkByDate.get(row.date),
    }));
}

function dailyReturns(values) {
  const returns = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous > 0 && current > 0) returns.push(current / previous - 1);
  }
  return returns;
}

function maxDrawdown(values) {
  let peak = values[0] ?? 1;
  let maxDd = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    const dd = value / peak - 1;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}

function std(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function metrics(series, startDate, endDate) {
  if (series.length < 2) {
    return { cagr: null, mdd: null, sharpe: null, vol: null, startValue: series[0] ?? null, endValue: series.at(-1) ?? null };
  }
  const years = Math.max((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / (365.25 * 24 * 60 * 60 * 1000), 1 / 365.25);
  const startValue = series[0];
  const endValue = series.at(-1);
  const returns = dailyReturns(series);
  const avgDaily = returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1);
  const dailyStd = std(returns);
  const vol = dailyStd * Math.sqrt(252);
  const sharpe = vol ? (avgDaily * 252) / vol : 0;
  return {
    cagr: startValue > 0 && endValue > 0 ? (endValue / startValue) ** (1 / years) - 1 : null,
    mdd: maxDrawdown(series),
    sharpe,
    vol,
    startValue,
    endValue,
  };
}

function parseBacktestRun(row) {
  return row ? {
    ...row,
    metricsJson: parseJson(row.metricsJson, {}),
    curveJson: parseJson(row.curveJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    requestJson: parseJson(row.requestJson, {}),
  } : row;
}

export function getNocBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    NOC_BACKEND_DB_PATH,
  ).map(parseBacktestRun);
}

export function runNocBacktest({
  startDate = "2018-01-02",
  endDate = "2026-05-12",
  benchmarkTicker = "SPY",
  scenario = "Base",
  modelVersion = NOC_BACKEND_MODEL_VERSION.version,
} = {}) {
  const nocPrices = priceRows(TICKER, startDate, endDate);
  const benchmarkPrices = priceRows(benchmarkTicker, startDate, endDate);
  const aligned = alignRows(nocPrices, benchmarkPrices);
  const warnings = [];
  if (nocPrices.length < 500) warnings.push({ id: "noc-price-history-short", severity: "medium", detail: "NOC price history has fewer than 500 daily bars in the selected interval." });
  if (benchmarkPrices.length < 500) warnings.push({ id: "benchmark-price-history-short", severity: "medium", detail: `${benchmarkTicker} price history has fewer than 500 daily bars in the selected interval.` });
  if (aligned.length < 2) {
    throw new Error("NOC backtest requires overlapping NOC and benchmark daily_price_bars. Run npm run noc:backend:import-prices first.");
  }
  const nocBase = aligned[0].nocPrice;
  const benchmarkBase = aligned[0].benchmarkPrice;
  const curve = aligned.map((row) => ({
    date: row.date,
    nocBuyHold: row.nocPrice / nocBase,
    noc: row.nocPrice / nocBase,
    spy: row.benchmarkPrice / benchmarkBase,
    benchmark: row.benchmarkPrice / benchmarkBase,
    nocPrice: row.nocPrice,
    benchmarkPrice: row.benchmarkPrice,
  }));
  const nocSeries = curve.map((row) => row.nocBuyHold);
  const spySeries = curve.map((row) => row.spy);
  const nocMetrics = metrics(nocSeries, curve[0].date, curve.at(-1).date);
  const spyMetrics = metrics(spySeries, curve[0].date, curve.at(-1).date);
  const metricPayload = {
    nocBuyHold: nocMetrics,
    noc: nocMetrics,
    spy: spyMetrics,
    benchmark: spyMetrics,
  };
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO backtest_runs (
      id, ticker, startDate, endDate, benchmarkTicker, scenario, modelVersion, status,
      metricsJson, curveJson, warningsJson, requestJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      TICKER,
      curve[0].date,
      curve.at(-1).date,
      benchmarkTicker,
      scenario,
      modelVersion,
      "completed",
      JSON.stringify(metricPayload),
      JSON.stringify(curve),
      JSON.stringify(warnings),
      JSON.stringify({ startDate, endDate, benchmarkTicker, scenario, modelVersion }),
      createdAt,
    ],
    NOC_BACKEND_DB_PATH,
  );
  return {
    id,
    ticker: TICKER,
    status: "completed",
    startDate: curve[0].date,
    endDate: curve.at(-1).date,
    benchmarkTicker,
    scenario,
    modelVersion,
    curve,
    metrics: metricPayload,
    warnings,
  };
}
