import { randomUUID } from "node:crypto";
import { execute, query } from "../db/client.mjs";
import { MSFT_BACKEND_DB_PATH } from "../../../../modules/msft/db/schema.mjs";

const TICKER = "MSFT";
const DEFAULT_MODEL_VERSION = "msft_v1_backend_pilot";

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

function pctGap(fairValue, price) {
  return fairValue && price ? fairValue / price - 1 : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  if (series.length < 2) return { cagr: null, maxDrawdown: null, sharpe: null, volatility: null };
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
    `SELECT ticker, priceDate, open, high, low, close, adjustedClose, volume, source
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate >= ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate ASC`,
    [ticker, startDate, endDate],
    MSFT_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    adjustedClose: Number(row.adjustedClose),
  }));
}

function getValuationSignals({ startDate, endDate, scenario, modelVersion }) {
  return query(
    `SELECT
       vr.asOfDate, vr.reportingEventId, vr.currentPrice, vr.fairValue, vr.upsideDownside,
       re.label, re.fiscalPeriod, re.fiscalYear, re.eventType
     FROM valuation_runs vr
     LEFT JOIN reporting_events re ON re.id = vr.reportingEventId
     WHERE vr.ticker = ? AND vr.scenario = ? AND vr.modelVersion = ?
       AND vr.asOfDate <= ?
       AND vr.fairValue IS NOT NULL
       AND vr.currentPrice IS NOT NULL
     ORDER BY vr.asOfDate ASC, vr.createdAt ASC`,
    [TICKER, scenario, modelVersion, endDate],
    MSFT_BACKEND_DB_PATH,
  )
    .filter((row) => row.asOfDate <= endDate)
    .map((row) => ({
      date: row.asOfDate,
      eventId: row.reportingEventId,
      label: row.label ?? row.fiscalPeriod ?? row.asOfDate,
      eventType: row.eventType,
      currentPrice: Number(row.currentPrice),
      fairValue: Number(row.fairValue),
      gapPct: pctGap(Number(row.fairValue), Number(row.currentPrice)),
    }))
    .filter((row) => row.date <= endDate && (row.date >= startDate || row.date < startDate));
}

function latestSignalOnOrBefore(signals, date, cursorStart = 0) {
  let cursor = cursorStart;
  while (cursor + 1 < signals.length && signals[cursor + 1].date <= date) cursor += 1;
  return { signal: signals[cursor]?.date <= date ? signals[cursor] : null, cursor };
}

export function getMsftBacktests() {
  return query(
    "SELECT * FROM backtest_runs WHERE ticker = ? ORDER BY createdAt DESC LIMIT 25",
    [TICKER],
    MSFT_BACKEND_DB_PATH,
  ).map((row) => ({
    ...row,
    configJson: parseJson(row.assumptionsJson, {}),
    resultJson: parseJson(row.resultJson, {}),
    warningsJson: parseJson(row.resultJson, {})?.warnings ?? [],
  }));
}

export function runMsftBacktest({
  startDate = "2018-01-01",
  endDate = new Date().toISOString().slice(0, 10),
  scenario = "Base",
  modelVersion = DEFAULT_MODEL_VERSION,
  benchmarkTicker = "SPY",
  signalThreshold = 0,
  maxExposure = 1,
} = {}) {
  const msftBars = getPriceBars(TICKER, startDate, endDate);
  const benchmarkBars = getPriceBars(benchmarkTicker, startDate, endDate);
  const warnings = [];
  if (msftBars.length < 2) warnings.push("MSFT daily price history is unavailable or too short for the selected window.");
  if (benchmarkBars.length < 2) warnings.push(`${benchmarkTicker} daily price history is unavailable or too short for the selected window.`);
  if (warnings.length) {
    return {
      persisted: false,
      status: "insufficient_data",
      warnings,
      priceBars: {
        [TICKER]: msftBars.length,
        [benchmarkTicker]: benchmarkBars.length,
      },
    };
  }

  const benchmarkByDate = new Map(benchmarkBars.map((row) => [row.priceDate, row]));
  const signals = getValuationSignals({ startDate, endDate, scenario, modelVersion });
  if (!signals.length) warnings.push("No valuation signals were available before or during the selected window.");

  let modelValue = 1;
  let msftBuyHoldValue = 1;
  let benchmarkValue = 1;
  let previousMsft = msftBars[0];
  let previousBenchmark = benchmarkByDate.get(msftBars[0].priceDate) ?? benchmarkBars[0];
  let signalCursor = 0;
  let previousExposure = 0;
  const curve = [];

  for (let index = 0; index < msftBars.length; index += 1) {
    const msft = msftBars[index];
    const benchmark = benchmarkByDate.get(msft.priceDate);
    if (!benchmark) continue;
    const signalLookup = latestSignalOnOrBefore(signals, msft.priceDate, signalCursor);
    signalCursor = signalLookup.cursor;
    const signal = signalLookup.signal;
    const fairValue = signal?.fairValue ?? null;
    const gap = pctGap(fairValue, msft.adjustedClose);
    const exposure = signal && gap != null ? clamp((gap - signalThreshold) / 0.25, 0, maxExposure) : 0;

    if (curve.length) {
      const msftReturn = msft.adjustedClose / previousMsft.adjustedClose - 1;
      const benchmarkReturn = benchmark.adjustedClose / previousBenchmark.adjustedClose - 1;
      modelValue *= 1 + previousExposure * msftReturn;
      msftBuyHoldValue *= 1 + msftReturn;
      benchmarkValue *= 1 + benchmarkReturn;
    }

    curve.push({
      date: msft.priceDate,
      model: modelValue,
      spy: benchmarkValue,
      benchmark: benchmarkValue,
      msftBuyHold: msftBuyHoldValue,
      exposure,
      price: msft.adjustedClose,
      fairValue,
      gapPct: gap,
      signalDate: signal?.date ?? null,
      signalLabel: signal?.label ?? null,
    });

    previousMsft = msft;
    previousBenchmark = benchmark;
    previousExposure = exposure;
  }

  const result = {
    ticker: TICKER,
    benchmarkTicker,
    startDate,
    endDate,
    scenario,
    modelVersion,
    signalRule: "Exposure = clamp((fairValue / price - 1 - threshold) / 25%, 0%, maxExposure). Daily returns use prior-day exposure.",
    priceBars: {
      [TICKER]: msftBars.length,
      [benchmarkTicker]: benchmarkBars.length,
      sources: {
        [TICKER]: msftBars[0]?.source ?? null,
        [benchmarkTicker]: benchmarkBars[0]?.source ?? null,
      },
    },
    metrics: {
      model: metrics(curve.map((row) => ({ date: row.date, value: row.model }))),
      spy: metrics(curve.map((row) => ({ date: row.date, value: row.spy }))),
      benchmark: metrics(curve.map((row) => ({ date: row.date, value: row.benchmark }))),
      msftBuyHold: metrics(curve.map((row) => ({ date: row.date, value: row.msftBuyHold }))),
    },
    curve,
    signals,
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
      JSON.stringify({ scenario, benchmarkTicker, signalThreshold, maxExposure }),
      JSON.stringify(result),
      createdAt,
    ],
    MSFT_BACKEND_DB_PATH,
  );

  return { id, persisted: true, status: "completed", ...result };
}
