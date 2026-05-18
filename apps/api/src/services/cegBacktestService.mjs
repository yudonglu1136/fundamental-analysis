import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { CEG_BACKEND_DB_PATH } from "../../../../modules/ceg/db/schema.mjs";
import { CEG_BACKEND_MODEL_VERSION } from "../../../../modules/ceg/valuation/modelVersion.mjs";

const TICKER = "CEG";

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
  return Number.isFinite(parsed) ? parsed : null;
}

function priceBars(ticker, startDate, endDate) {
  return query(
    `SELECT ticker, priceDate, close, adjustedClose, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate >= ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    CEG_BACKEND_DB_PATH,
  ).map((row) => ({ ...row, adjustedClose: Number(row.adjustedClose) }));
}

function dailyReturns(series) {
  const returns = [];
  for (let index = 1; index < series.length; index += 1) {
    const prev = finite(series[index - 1]?.value);
    const curr = finite(series[index]?.value);
    if (prev && curr) returns.push(curr / prev - 1);
  }
  return returns;
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
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
  const variance = returns.length > 1 ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1) : null;
  const volatility = variance != null ? Math.sqrt(variance) * Math.sqrt(252) : null;
  return { totalReturn, cagr, maxDrawdown: maxDrawdown(series), sharpe: volatility && mean != null ? (mean * 252) / volatility : null, volatility };
}

export function getCegBacktests() {
  return query("SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25", [TICKER], CEG_BACKEND_DB_PATH)
    .map((row) => ({ ...row, configJson: parseJson(row.assumptionsJson, {}), resultJson: parseJson(row.resultJson, {}) }));
}

export function runCegBacktest({
  startDate = "2022-01-19",
  endDate = new Date().toISOString().slice(0, 10),
  modelVersion = CEG_BACKEND_MODEL_VERSION.version,
  benchmarkTicker = "SPY",
} = {}) {
  const cegBars = priceBars(TICKER, startDate, endDate);
  const benchmarkBars = priceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (cegBars.length < 2) warnings.push("CEG daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  if (cegBars.some((row) => row.sourceType === "market_data_unadjusted_or_close_fallback")) warnings.push("CEG adjusted close falls back to Nasdaq close; dividend-adjusted return precision is limited.");
  if (benchmarkBars.some((row) => row.sourceType === "market_data_unadjusted_or_close_fallback")) warnings.push(`${benchmarkTicker} adjusted close falls back to Nasdaq close; dividend-adjusted return precision is limited.`);
  if (warnings.some((warning) => warning.includes("unavailable"))) {
    return { persisted: false, status: "insufficient_data", warnings, priceBars: { [TICKER]: cegBars.length, [benchmarkTicker]: benchmarkBars.length } };
  }

  const benchmarkByDate = new Map(benchmarkBars.map((row) => [row.priceDate, row]));
  let cegValue = 1;
  let benchmarkValue = 1;
  let previousCeg = cegBars[0];
  let previousBenchmark = benchmarkByDate.get(cegBars[0].priceDate) ?? benchmarkBars[0];
  const curve = [];
  for (const ceg of cegBars) {
    const benchmark = benchmarkByDate.get(ceg.priceDate);
    if (!benchmark) continue;
    if (curve.length) {
      cegValue *= ceg.adjustedClose / previousCeg.adjustedClose;
      benchmarkValue *= benchmark.adjustedClose / previousBenchmark.adjustedClose;
    }
    curve.push({ date: ceg.priceDate, cegBuyHold: cegValue, spy: benchmarkValue, benchmark: benchmarkValue, cegPrice: ceg.adjustedClose, benchmarkPrice: benchmark.adjustedClose });
    previousCeg = ceg;
    previousBenchmark = benchmark;
  }

  const result = {
    ticker: TICKER,
    benchmarkTicker,
    startDate,
    endDate,
    modelVersion,
    priceBars: { [TICKER]: cegBars.length, [benchmarkTicker]: benchmarkBars.length },
    metrics: {
      cegBuyHold: metrics(curve.map((row) => ({ date: row.date, value: row.cegBuyHold }))),
      spy: metrics(curve.map((row) => ({ date: row.date, value: row.spy }))),
      benchmark: metrics(curve.map((row) => ({ date: row.date, value: row.benchmark }))),
    },
    curve,
    warnings,
  };
  const id = randomUUID();
  execute(
    `INSERT INTO backtest_runs (
      id, ticker, modelVersion, startDate, endDate, rebalanceFrequency, assumptionsJson, resultJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, TICKER, modelVersion, startDate, endDate, "daily", JSON.stringify({ benchmarkTicker }), JSON.stringify(result), new Date().toISOString()],
    CEG_BACKEND_DB_PATH,
  );
  return { id, persisted: true, status: "completed", ...result };
}
