import { readGuruBacktest, readPriceSeriesFromDb } from "./localDatabase.js";

export const GURU_CONSENSUS_STRATEGY_ID = "guru-top3-consensus";

const initialEquity = 100000;
const periodId = "evaluation_2020_2026";
const managers = [
  { id: "gavin-baker", name: "Gavin Baker" },
  { id: "bill-ackman", name: "Bill Ackman" },
  { id: "stanley-druckenmiller", name: "Stanley Druckenmiller" }
];

let cachedBundle = null;
let cachedKey = "";

function finite(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateMs(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00Z`).getTime();
}

function stdev(values) {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function maxDrawdown(values) {
  let peak = values[0] || 1;
  let result = 0;
  values.forEach((value) => {
    peak = Math.max(peak, value);
    result = Math.min(result, peak > 0 ? value / peak - 1 : 0);
  });
  return result;
}

function metrics(rows, returnField, navField) {
  if (rows.length < 2) return {};
  const returns = rows.slice(1).map((row) => finite(row[returnField]));
  const totalReturn = finite(rows.at(-1)?.[navField], 1) / finite(rows[0]?.[navField], 1) - 1;
  const days = Math.max(1, (dateMs(rows.at(-1).date) - dateMs(rows[0].date)) / 86400000);
  const volatility = stdev(returns) * Math.sqrt(252);
  const average = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  return {
    days: rows.length,
    total_return: totalReturn,
    cagr: (1 + totalReturn) ** (365.25 / days) - 1,
    volatility,
    sharpe: volatility ? average / stdev(returns) * Math.sqrt(252) : 0,
    max_drawdown: maxDrawdown(rows.map((row) => finite(row[navField], 1)))
  };
}

function marketBeta(rows) {
  const pairs = rows.slice(1).map((row) => [finite(row.daily_return), finite(row.spy_return)]);
  if (pairs.length < 2) return 0;
  const strategyMean = pairs.reduce((sum, row) => sum + row[0], 0) / pairs.length;
  const spyMean = pairs.reduce((sum, row) => sum + row[1], 0) / pairs.length;
  const covariance = pairs.reduce((sum, row) => sum + (row[0] - strategyMean) * (row[1] - spyMean), 0) / (pairs.length - 1);
  const variance = pairs.reduce((sum, row) => sum + (row[1] - spyMean) ** 2, 0) / (pairs.length - 1);
  return variance ? covariance / variance : 0;
}

function priceMap(points) {
  return new Map(points.map((point) => [point.date, finite(point.close, null)]));
}

function dailyReturn(map, previousDate, date) {
  const previous = map?.get(previousDate);
  const current = map?.get(date);
  return Number.isFinite(previous) && Number.isFinite(current) && previous > 0 ? current / previous - 1 : null;
}

function normalizedTicker(value) {
  const ticker = String(value || "").trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) ? ticker : "";
}

export function mergeManagerTopHoldings(latestByManager) {
  const holdings = new Map();
  managers.forEach((manager) => {
    const filing = latestByManager.get(manager.id);
    (filing?.topHoldings || []).slice(0, 3).forEach((holding, rank) => {
      const ticker = normalizedTicker(holding.ticker);
      if (!ticker) return;
      const current = holdings.get(ticker) || {
        ticker,
        issuer: holding.issuer || ticker,
        managerIds: [],
        managerNames: [],
        sourceRanks: []
      };
      if (!current.managerIds.includes(manager.id)) {
        current.managerIds.push(manager.id);
        current.managerNames.push(manager.name);
        current.sourceRanks.push(rank + 1);
      }
      holdings.set(ticker, current);
    });
  });
  const unique = [...holdings.values()];
  const weight = unique.length ? 1 / unique.length : 0;
  return unique.map((holding) => ({ ...holding, weight }));
}

export function buildConsensusRebalances(sourceBacktests) {
  const events = [];
  managers.forEach((manager) => {
    const backtest = sourceBacktests.get(manager.id);
    (backtest?.rebalances || []).forEach((rebalance) => {
      if (!rebalance.executionDate || !(rebalance.topHoldings || []).length) return;
      events.push({ manager, rebalance });
    });
  });
  events.sort((left, right) => left.rebalance.executionDate.localeCompare(right.rebalance.executionDate));

  const grouped = new Map();
  events.forEach((event) => {
    const date = event.rebalance.executionDate;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(event);
  });

  const latestByManager = new Map();
  const result = [];
  [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([executionDate, dateEvents]) => {
    dateEvents.forEach(({ manager, rebalance }) => latestByManager.set(manager.id, rebalance));
    if (!managers.every((manager) => latestByManager.has(manager.id))) return;
    const holdings = mergeManagerTopHoldings(latestByManager);
    if (!holdings.length) return;
    result.push({
      executionDate,
      reportDates: Object.fromEntries(managers.map((manager) => [manager.id, latestByManager.get(manager.id).reportDate])),
      filingDates: Object.fromEntries(managers.map((manager) => [manager.id, latestByManager.get(manager.id).filingDate])),
      updatedManagers: dateEvents.map(({ manager }) => manager.name),
      holdings
    });
  });
  return result;
}

function annualRows(nav) {
  const years = new Map();
  nav.forEach((row) => {
    const year = Number(row.date.slice(0, 4));
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(row);
  });
  return [...years.entries()].map(([year, rows]) => ({
    year,
    strategy_return: rows.reduce((value, row) => value * (1 + finite(row.daily_return)), 1) - 1,
    spy_return: rows.reduce((value, row) => value * (1 + finite(row.spy_return)), 1) - 1
  }));
}

function enrichPositionHistory(rebalances, priceMaps) {
  let previous = new Map();
  return rebalances.map((rebalance) => {
    const positions = rebalance.holdings.map((holding) => {
      const existing = previous.get(holding.ticker);
      const currentPrice = priceMaps.get(holding.ticker)?.get(rebalance.executionDate);
      return {
        ...holding,
        entryDate: existing?.entryDate || rebalance.executionDate,
        entryPrice: existing?.entryPrice || currentPrice,
        currentPrice
      };
    });
    const activity = [];
    const currentTickers = new Set(positions.map((row) => row.ticker));
    positions.forEach((row) => {
      activity.push({
        side: previous.has(row.ticker) ? "HOLD" : "BUY",
        ticker: row.ticker,
        date: rebalance.executionDate,
        shares: 0,
        reason: `${row.managerNames.join(" + ")} Top 3`
      });
    });
    previous.forEach((row, ticker) => {
      if (!currentTickers.has(ticker)) activity.push({ side: "SELL", ticker, date: rebalance.executionDate, shares: 0, reason: "No longer in the combined Top 3" });
    });
    previous = new Map(positions.map((row) => [row.ticker, row]));
    return { ...rebalance, positions, activity };
  });
}

export function runConsensusBacktest({ sourceBacktests, priceReader = readPriceSeriesFromDb }) {
  const rawRebalances = buildConsensusRebalances(sourceBacktests);
  if (!rawRebalances.length) throw new Error("The three required all-history 13F backtests are not available.");
  const start = rawRebalances[0].executionDate;
  const spyPoints = priceReader("SPY", start, "9999-12-31");
  if (spyPoints.length < 30) throw new Error("SPY price history is unavailable for the consensus backtest.");
  const end = spyPoints.at(-1).date;
  const dates = spyPoints.map((point) => point.date);
  const universe = [...new Set(rawRebalances.flatMap((rebalance) => rebalance.holdings.map((holding) => holding.ticker)))];
  const priceMaps = new Map([["SPY", priceMap(spyPoints)]]);
  universe.forEach((ticker) => priceMaps.set(ticker, priceMap(priceReader(ticker, start, end))));

  const rebalances = rawRebalances.map((rebalance) => {
    const priced = rebalance.holdings.filter((holding) => Number.isFinite(priceMaps.get(holding.ticker)?.get(rebalance.executionDate)));
    const weight = priced.length ? 1 / priced.length : 0;
    return { ...rebalance, holdings: priced.map((holding) => ({ ...holding, weight })) };
  }).filter((rebalance) => rebalance.holdings.length);
  const enrichedRebalances = enrichPositionHistory(rebalances, priceMaps);
  const firstDate = enrichedRebalances[0].executionDate;
  const activeDates = dates.filter((date) => date >= firstDate);
  let rebalanceIndex = 0;
  let activeHoldings = enrichedRebalances[0].holdings;
  let positionValues = new Map(activeHoldings.map((holding) => [holding.ticker, holding.weight]));
  let cumulativeTurnover = 1;
  let strategyNav = 1;
  let spyNav = 1;
  const nav = activeDates.length ? [{
    date: activeDates[0], strategy_nav: 1, spy_nav: 1, daily_return: 0, spy_return: 0,
    equity: initialEquity, cash: 0, n_positions: activeHoldings.length, gross_exposure: 1
  }] : [];

  for (let index = 1; index < activeDates.length; index += 1) {
    const previousDate = activeDates[index - 1];
    const date = activeDates[index];
    const previousPortfolioValue = [...positionValues.values()].reduce((sum, value) => sum + value, 0);
    activeHoldings.forEach((holding) => {
      const value = dailyReturn(priceMaps.get(holding.ticker), previousDate, date);
      const previousValue = positionValues.get(holding.ticker) || 0;
      positionValues.set(holding.ticker, previousValue * (1 + (Number.isFinite(value) ? value : 0)));
    });
    const portfolioValue = [...positionValues.values()].reduce((sum, value) => sum + value, 0);
    const strategyReturn = previousPortfolioValue > 0 ? portfolioValue / previousPortfolioValue - 1 : 0;
    const spyReturn = dailyReturn(priceMaps.get("SPY"), previousDate, date) || 0;
    strategyNav *= 1 + strategyReturn;
    spyNav *= 1 + spyReturn;
    while (rebalanceIndex + 1 < enrichedRebalances.length && enrichedRebalances[rebalanceIndex + 1].executionDate <= date) {
      rebalanceIndex += 1;
      const currentWeights = new Map([...positionValues.entries()].map(([ticker, value]) => [ticker, portfolioValue > 0 ? value / portfolioValue : 0]));
      activeHoldings = enrichedRebalances[rebalanceIndex].holdings;
      const targetWeights = new Map(activeHoldings.map((holding) => [holding.ticker, holding.weight]));
      const tickers = new Set([...currentWeights.keys(), ...targetWeights.keys()]);
      cumulativeTurnover += 0.5 * [...tickers].reduce((sum, ticker) => (
        sum + Math.abs((targetWeights.get(ticker) || 0) - (currentWeights.get(ticker) || 0))
      ), 0);
      positionValues = new Map(targetWeights);
    }
    nav.push({
      date,
      strategy_nav: strategyNav,
      spy_nav: spyNav,
      daily_return: strategyReturn,
      spy_return: spyReturn,
      equity: initialEquity * strategyNav,
      cash: 0,
      n_positions: activeHoldings.length,
      gross_exposure: 1
    });
  }

  const strategyMetrics = metrics(nav, "daily_return", "strategy_nav");
  const benchmarkMetrics = metrics(nav, "spy_return", "spy_nav");
  const years = Math.max((dateMs(end) - dateMs(firstDate)) / (365.25 * 86400000), 1 / 12);
  Object.assign(strategyMetrics, {
    market_beta: marketBeta(nav),
    period: periodId,
    strategy: GURU_CONSENSUS_STRATEGY_ID,
    spy_cagr: benchmarkMetrics.cagr,
    excess_cagr_vs_spy: strategyMetrics.cagr - benchmarkMetrics.cagr,
    ending_equity: initialEquity * nav.at(-1).strategy_nav,
    average_positions: nav.reduce((sum, row) => sum + row.n_positions, 0) / nav.length,
    average_gross_exposure: 1,
    annual_turnover: cumulativeTurnover / years,
    total_cost: 0,
    buys: enrichedRebalances.reduce((sum, row) => sum + row.activity.filter((item) => item.side === "BUY").length, 0),
    sells: enrichedRebalances.reduce((sum, row) => sum + row.activity.filter((item) => item.side === "SELL").length, 0)
  });
  return { start: firstDate, end, nav, rebalances: enrichedRebalances, strategyMetrics, benchmarkMetrics, priceMaps };
}

function buildSnapshot(result, rebalance) {
  const navRow = [...result.nav].reverse().find((row) => row.date <= rebalance.executionDate) || result.nav[0];
  const equity = navRow?.equity || initialEquity;
  const positions = rebalance.positions.map((row) => {
    const positionValue = equity * row.weight;
    const shares = row.currentPrice ? positionValue / row.currentPrice : 0;
    const unrealizedPnl = row.entryPrice ? shares * (row.currentPrice - row.entryPrice) : 0;
    return {
      action: rebalance.activity.some((item) => item.side === "BUY" && item.ticker === row.ticker) ? "BUY" : "HOLD",
      ticker: row.ticker,
      name: row.issuer,
      weight: row.weight,
      shares,
      entry_date: row.entryDate,
      average_cost: row.entryPrice,
      current_price: row.currentPrice,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_pct: row.entryPrice ? row.currentPrice / row.entryPrice - 1 : 0,
      selection_source: row.managerNames.join(" + "),
      selection_reason: `Unique holding selected from ${row.managerNames.length} manager Top 3 list${row.managerNames.length > 1 ? "s" : ""}.`,
      selection_score_label: `13F Top ${Math.min(...row.sourceRanks)}`,
      ontology_score: null,
      prediction: null
    };
  });
  const activities = rebalance.activity.map((item) => ({
    ...item,
    shares: positions.find((row) => row.ticker === item.ticker)?.shares || 0
  }));
  return {
    strategy_id: GURU_CONSENSUS_STRATEGY_ID,
    period: periodId,
    snapshot_date: rebalance.executionDate,
    equity,
    cash: 0,
    positions_count: positions.length,
    gross_exposure: 1,
    unrealized_pnl: positions.reduce((sum, row) => sum + row.unrealized_pnl, 0),
    positions,
    activity: activities
  };
}

function pendingCatalogEntry(message = "等待三位经理的历史 13F 回测缓存") {
  return {
    id: GURU_CONSENSUS_STRATEGY_ID,
    name: "Guru Top 3 共识",
    short_name: "3 Gurus · Top 3",
    type: "13F 跟随策略",
    version: "guru-consensus-v1",
    description: "三位基金经理披露后，各取 Top 3，重复股票合并并按唯一标的等权。",
    tagline: "Gavin Baker + Bill Ackman + Stanley Druckenmiller",
    accent: "#f0b84b",
    validation_status: message,
    latest_date: null,
    evaluation: {}
  };
}

function buildBundle() {
  const sourceBacktests = new Map(managers.map((manager) => [manager.id, readGuruBacktest(manager.id, 0)]));
  const missing = managers.filter((manager) => sourceBacktests.get(manager.id)?.status !== "ready");
  if (missing.length) return { catalog: pendingCatalogEntry(`等待 ${missing.map((manager) => manager.name).join("、")} 的全历史 13F 缓存`) };
  const spyLatest = readPriceSeriesFromDb("SPY", "2000-01-01", "9999-12-31").at(-1)?.date || "";
  const key = `${spyLatest}:${managers.map((manager) => sourceBacktests.get(manager.id)?.generatedAt || "").join(":")}`;
  if (cachedBundle && cachedKey === key) return cachedBundle;
  const result = runConsensusBacktest({ sourceBacktests });
  const snapshots = new Map(result.rebalances.map((rebalance) => [rebalance.executionDate, buildSnapshot(result, rebalance)]));
  const catalog = {
    ...pendingCatalogEntry(),
    validation_status: "按真实 13F 披露日执行；重复持仓只买一次",
    latest_date: result.end,
    evaluation: result.strategyMetrics,
    development: null
  };
  const detail = {
    ...catalog,
    strategy_kind: "event_driven_13f",
    execution_costs_modeled: false,
    closed_trade_analytics_available: false,
    execution_summary: {
      rebalances: result.rebalances.length,
      buys: result.strategyMetrics.buys,
      sells: result.strategyMetrics.sells,
      latest_unique_holdings: result.rebalances.at(-1)?.holdings.length || 0,
      annual_turnover: result.strategyMetrics.annual_turnover,
      modeled_cost: result.strategyMetrics.total_cost
    },
    methodology: {
      objective: "检验三位高信念成长/集中型经理的头部持仓交集与并集，能否在公开披露后形成可执行的等权组合。",
      process: [
        { step: "等待公开披露", detail: "只在 13F 被 SEC 公开后使用数据，不读取季度末尚未披露的仓位。" },
        { step: "各取 Top 3", detail: "Gavin Baker、Bill Ackman、Stanley Druckenmiller 各取披露市值最高的三只股票。" },
        { step: "合并重复", detail: "同一股票被多位经理持有时只进入一次，并保留全部来源经理标签。" },
        { step: "唯一标的等权", detail: "对合并后的唯一股票等权配置；缺少可用价格的股票在当次调仓中剔除并重新归一。" },
        { step: "事件驱动再平衡", detail: "任一经理发布新 13F 后，在首个可交易日收盘更新组合，新权重从下一交易日起生效。" }
      ],
      formula: [
        { name: "股票集合", value: "Unique(Top3 Gavin ∪ Top3 Ackman ∪ Top3 Druckenmiller)" },
        { name: "目标权重", value: "每只可定价唯一股票权重 = 1 / N" },
        { name: "重复规则", value: "重复股票不叠加权重，只增强来源标签与信念解释" }
      ],
      parameters: [
        { name: "初始资金", value: "$100,000" },
        { name: "单经理持仓数", value: "Top 3" },
        { name: "最大唯一持仓", value: "9" },
        { name: "基准", value: "SPY" },
        { name: "执行", value: "披露日后首个交易日收盘" }
      ],
      risk_controls: [
        "只有本地历史行情覆盖的普通股票才能进入当次组合。",
        "重复股票不重复买入，避免共识票机械放大集中度。",
        "全程不使用杠杆，唯一标的等权，单票最高权重由持仓数自然约束。"
      ],
      caveats: [
        "13F 最长滞后季度末 45 天，无法观察空头、现金、海外非申报资产及季度内交易。",
        "回测未计佣金、税费与滑点，结果是研究模拟而非可实现收益承诺。",
        "经理披露时间不同；某位经理尚未发布新季度时，继续使用其最近一次公开 Top 3。"
      ]
    },
    data: {
      price_source: "Local adjusted daily prices from the production research database",
      holdings_source: "Cached SEC 13F filing histories for Gavin Baker, Bill Ackman, and Stanley Druckenmiller",
      benchmark: "SPY",
      latest_date: result.end,
      research_only: true
    },
    periods: {
      [periodId]: {
        id: periodId,
        label: `披露日回测 ${result.start.slice(0, 4)}-${result.end.slice(0, 4)}`,
        start: result.start,
        end: result.end,
        strategy_metrics: result.strategyMetrics,
        benchmark_metrics: result.benchmarkMetrics,
        annual: annualRows(result.nav),
        nav: result.nav,
        snapshot_dates: result.rebalances.map((row) => row.executionDate),
        analytics: { closed_trades: [] }
      }
    }
  };
  cachedKey = key;
  cachedBundle = { catalog, detail, snapshots };
  return cachedBundle;
}

export function loadGuruConsensusCatalogEntry() {
  return buildBundle().catalog;
}

export function loadGuruConsensusStrategyDetail() {
  const bundle = buildBundle();
  if (!bundle.detail) throw new Error(bundle.catalog.validation_status);
  return bundle.detail;
}

export function loadGuruConsensusStrategySnapshot({ period, asOf }) {
  if (period !== periodId) throw new Error(`Unsupported Guru consensus period: ${period}`);
  const bundle = buildBundle();
  const snapshot = bundle.snapshots?.get(String(asOf).slice(0, 10));
  if (!snapshot) throw new Error(`Guru consensus snapshot is unavailable: ${asOf}`);
  return snapshot;
}
