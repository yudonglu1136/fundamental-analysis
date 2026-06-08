import { gurus } from "./gurus.js";
import { load13fHoldingHistory } from "./secClient.js";
import { loadPriceSeries } from "./marketData.js";
import { readGuruBacktest, writeGuruBacktest } from "./localDatabase.js";

const defaultYears = 5;
const maxHoldingsPerFiling = Number(process.env.BACKTEST_MAX_HOLDINGS || 60);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function today() {
  return isoDate(new Date());
}

function dateMs(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isTicker(value) {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(value || "").trim().toUpperCase());
}

function nextTradingDate(spyPoints, date) {
  return spyPoints.find((point) => point.date >= date)?.date || null;
}

function priceMap(points) {
  return new Map((points || []).filter((point) => point.date).map((point) => [point.date, point.close]));
}

function dailyReturn(map, previousDate, date) {
  const previous = map.get(previousDate);
  const current = map.get(date);
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) return null;
  return current / previous - 1;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(equity) {
  let peak = equity[0]?.value || 1;
  let drawdown = 0;
  for (const point of equity) {
    peak = Math.max(peak, point.value);
    if (peak > 0) drawdown = Math.min(drawdown, point.value / peak - 1);
  }
  return drawdown;
}

function metrics(equity, returns) {
  if (!equity.length) {
    return { totalReturn: 0, cagr: 0, volatility: 0, sharpe: 0, maxDrawdown: 0 };
  }
  const first = equity[0];
  const last = equity[equity.length - 1];
  const days = Math.max(1, (dateMs(last.date) - dateMs(first.date)) / 86400000);
  const totalReturn = last.value / first.value - 1;
  const volatility = stdev(returns) * Math.sqrt(252);
  const avg = mean(returns);
  return {
    totalReturn,
    cagr: (last.value / first.value) ** (365.25 / days) - 1,
    volatility,
    sharpe: volatility ? (avg / stdev(returns)) * Math.sqrt(252) : 0,
    maxDrawdown: maxDrawdown(equity)
  };
}

function eligibleHolding(holding) {
  return (
    holding.value > 0 &&
    isTicker(holding.ticker) &&
    !holding.putCall &&
    holding.shares > 0
  );
}

function buildWeights(snapshot, priceMaps, executionDate) {
  const selected = (snapshot.holdings || [])
    .filter(eligibleHolding)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxHoldingsPerFiling);
  const selectedValue = selected.reduce((sum, holding) => sum + holding.value, 0);
  const priced = selected.filter((holding) => Number.isFinite(priceMaps.get(holding.ticker)?.get(executionDate)));
  const pricedValue = priced.reduce((sum, holding) => sum + holding.value, 0);
  const weights = pricedValue
    ? priced.map((holding) => ({
      ticker: holding.ticker,
      issuer: holding.issuer,
      value: holding.value,
      weight: holding.value / pricedValue
    }))
    : [];

  return {
    weights,
    selectedValue,
    pricedValue,
    coveragePct: selectedValue ? pricedValue / selectedValue : 0,
    selectedPositions: selected.length,
    pricedPositions: weights.length,
    topHoldings: weights
      .slice(0, 8)
      .map((holding) => ({
        ticker: holding.ticker,
        issuer: holding.issuer,
        value: holding.value,
        weight: holding.weight
      }))
  };
}

function portfolioReturn(weights, priceMaps, previousDate, date) {
  let value = 0;
  let coveredWeight = 0;
  for (const holding of weights) {
    const map = priceMaps.get(holding.ticker);
    const ret = map ? dailyReturn(map, previousDate, date) : null;
    if (Number.isFinite(ret)) {
      value += holding.weight * ret;
      coveredWeight += holding.weight;
    }
  }
  return { returnPct: value, coveredWeight };
}

function unsupportedBacktest(guru, years) {
  return {
    generatedAt: new Date().toISOString(),
    status: "unsupported",
    guru: {
      id: guru.id,
      name: guru.name,
      type: guru.type,
      thesisTag: guru.thesisTag
    },
    tag: {
      label: "非13F，不模拟抄作业",
      tone: "muted"
    },
    method: {
      years,
      benchmark: "SPY",
      reason: "This guru does not publish a quarterly long-equity 13F portfolio suitable for proportional copy-trading."
    }
  };
}

export async function loadGuruBacktest(guruId, { refresh = false, years = defaultYears } = {}) {
  const normalizedYears = Number.isFinite(Number(years)) ? Math.max(1, Math.min(10, Number(years))) : defaultYears;
  const guru = gurus.find((item) => item.id === guruId);
  if (!guru) throw new Error(`Guru not found: ${guruId}`);

  if (guru.type !== "manager13f") {
    return unsupportedBacktest(guru, normalizedYears);
  }

  const cached = readGuruBacktest(guruId, normalizedYears);
  if (cached && !refresh) {
    return {
      ...cached,
      cache: { status: "sqlite-hit", source: "sqlite" }
    };
  }

  const end = today();
  const start = isoDate(new Date(new Date(end).setFullYear(new Date(end).getFullYear() - normalizedYears)));
  const [history, spySeries] = await Promise.all([
    load13fHoldingHistory(guru, { years: normalizedYears, limit: normalizedYears * 4 + 4 }),
    loadPriceSeries("SPY", { start, end })
  ]);
  const spyPoints = (spySeries.points || []).filter((point) => point.date >= start && point.date <= end);

  if (history.length < 2 || spyPoints.length < 30) {
    const payload = {
      generatedAt: new Date().toISOString(),
      status: "insufficient_data",
      guru: {
        id: guru.id,
        name: guru.name,
        type: guru.type,
        thesisTag: guru.thesisTag
      },
      tag: {
        label: "13F copy 模拟待补数据",
        tone: "muted"
      },
      window: { start, end },
      method: {
        years: normalizedYears,
        benchmark: "SPY",
        maxHoldingsPerFiling,
        reason: "Not enough historical 13F filings or SPY price points are available."
      },
      summary: {},
      equity: [],
      rebalances: []
    };
    writeGuruBacktest(guruId, normalizedYears, payload);
    return payload;
  }

  const universe = [...new Set(history
    .flatMap((snapshot) => (snapshot.holdings || [])
      .filter(eligibleHolding)
      .sort((a, b) => b.value - a.value)
      .slice(0, maxHoldingsPerFiling)
      .map((holding) => holding.ticker)))];
  const priceMaps = new Map([["SPY", priceMap(spyPoints)]]);

  for (const ticker of universe) {
    try {
      const series = await loadPriceSeries(ticker, { start, end });
      priceMaps.set(ticker, priceMap(series.points || []));
    } catch {
      priceMaps.set(ticker, new Map());
    }
    await wait(80);
  }

  const rebalances = history
    .map((snapshot) => ({
      ...snapshot,
      executionDate: nextTradingDate(spyPoints, snapshot.filingDate)
    }))
    .filter((snapshot) => snapshot.executionDate)
    .map((snapshot) => {
      const weightModel = buildWeights(snapshot, priceMaps, snapshot.executionDate);
      return {
        reportDate: snapshot.reportDate,
        filingDate: snapshot.filingDate,
        executionDate: snapshot.executionDate,
        totalValue: snapshot.totalValue,
        selectedValue: weightModel.selectedValue,
        pricedValue: weightModel.pricedValue,
        coveragePct: weightModel.coveragePct,
        positions: snapshot.holdings?.length || 0,
        selectedPositions: weightModel.selectedPositions,
        pricedPositions: weightModel.pricedPositions,
        weights: weightModel.weights,
        topHoldings: weightModel.topHoldings,
        filing: snapshot.filing
      };
    })
    .filter((rebalance) => rebalance.weights.length);

  if (rebalances.length < 1) {
    const payload = {
      generatedAt: new Date().toISOString(),
      status: "insufficient_data",
      guru: {
        id: guru.id,
        name: guru.name,
        type: guru.type,
        thesisTag: guru.thesisTag
      },
      tag: {
        label: "13F copy 模拟待补价格",
        tone: "muted"
      },
      window: { start, end },
      method: {
        years: normalizedYears,
        benchmark: "SPY",
        maxHoldingsPerFiling,
        reason: "Historical filings were found, but no holdings had usable ticker price coverage."
      },
      summary: {},
      equity: [],
      rebalances: []
    };
    writeGuruBacktest(guruId, normalizedYears, payload);
    return payload;
  }

  const firstDate = rebalances[0]?.executionDate;
  const dates = spyPoints.map((point) => point.date).filter((date) => date >= firstDate);
  let activeWeights = rebalances[0]?.weights || [];
  let rebalanceIndex = 0;
  let portfolioValue = 1;
  let benchmarkValue = 1;
  const equity = dates.length ? [{ date: dates[0], value: portfolioValue, benchmark: benchmarkValue }] : [];
  const portfolioReturns = [];
  const benchmarkReturns = [];
  const coverage = [];

  for (let index = 1; index < dates.length; index += 1) {
    const previousDate = dates[index - 1];
    const date = dates[index];

    while (rebalanceIndex + 1 < rebalances.length && rebalances[rebalanceIndex + 1].executionDate <= date) {
      rebalanceIndex += 1;
      activeWeights = rebalances[rebalanceIndex].weights;
    }

    const portfolio = portfolioReturn(activeWeights, priceMaps, previousDate, date);
    const spyReturn = dailyReturn(priceMaps.get("SPY"), previousDate, date) ?? 0;
    portfolioValue *= 1 + portfolio.returnPct;
    benchmarkValue *= 1 + spyReturn;
    portfolioReturns.push(portfolio.returnPct);
    benchmarkReturns.push(spyReturn);
    coverage.push(portfolio.coveredWeight);
    equity.push({
      date,
      value: portfolioValue,
      benchmark: benchmarkValue
    });
  }

  const portfolioEquity = equity.map((point) => ({ date: point.date, value: point.value }));
  const benchmarkEquity = equity.map((point) => ({ date: point.date, value: point.benchmark }));
  const portfolioMetrics = metrics(portfolioEquity, portfolioReturns);
  const benchmarkMetrics = metrics(benchmarkEquity, benchmarkReturns);
  const payload = {
    generatedAt: new Date().toISOString(),
    status: "ready",
    guru: {
      id: guru.id,
      name: guru.name,
      chineseName: guru.chineseName,
      entityName: guru.entityName,
      type: guru.type,
      thesisTag: guru.thesisTag
    },
    tag: {
      label: "13F 披露日复制模拟",
      tone: portfolioMetrics.cagr >= benchmarkMetrics.cagr ? "positive" : "negative"
    },
    window: {
      start: equity[0]?.date || firstDate || start,
      end: equity.at(-1)?.date || end
    },
    method: {
      years: normalizedYears,
      benchmark: "SPY",
      execution: "Use the first tradable SPY date on or after each 13F filing date.",
      weighting: "Use disclosed 13F market values, cap to top holdings, then normalize priced holdings to 100%.",
      maxHoldingsPerFiling,
      assumptions: [
        "13F only contains long U.S.-reportable holdings and is delayed from quarter end.",
        "The simulation trades at the first market date on or after the public filing date.",
        "Missing, non-ticker, option, or unpriced rows are excluded before weights are normalized.",
        "Transaction costs, taxes, slippage, shorts, private holdings, and fund-level cash are excluded."
      ]
    },
    summary: {
      ...portfolioMetrics,
      benchmark: benchmarkMetrics,
      excessCagr: portfolioMetrics.cagr - benchmarkMetrics.cagr,
      excessTotalReturn: portfolioMetrics.totalReturn - benchmarkMetrics.totalReturn,
      rebalances: rebalances.length,
      averagePositions: rebalances.length
        ? rebalances.reduce((sum, item) => sum + item.pricedPositions, 0) / rebalances.length
        : 0,
      averageCoverage: coverage.length ? mean(coverage) : 0,
      filings: history.length,
      universe: universe.length
    },
    equity,
    rebalances: rebalances.map(({ weights, ...rebalance }) => rebalance),
    cache: {
      status: "refreshed",
      source: "SEC EDGAR + Yahoo + SQLite"
    }
  };

  writeGuruBacktest(guruId, normalizedYears, payload);
  return payload;
}

export async function loadGuruBacktests({ refresh = false, years = defaultYears } = {}) {
  const results = [];
  for (const guru of gurus.filter((item) => item.type === "manager13f")) {
    results.push(await loadGuruBacktest(guru.id, { refresh, years }));
  }
  return {
    generatedAt: new Date().toISOString(),
    years,
    benchmark: "SPY",
    backtests: results
  };
}
