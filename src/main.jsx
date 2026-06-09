import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Crosshair,
  ExternalLink,
  Filter,
  Gauge,
  Layers,
  LineChart,
  Loader2,
  LogOut,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wallet
} from "lucide-react";
import { apiFetch } from "./apiClient";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import { AuthCallbackPage } from "./auth/AuthCallbackPage.jsx";
import { LoginPage } from "./auth/LoginPage.jsx";
import { useAuth } from "./auth/useAuth";
import "./styles.css";

const I18nContext = React.createContext({ language: "zh", t: (key) => key });

const uiText = {
  zh: {
    "app.privateWorkspace": "Private Workspace",
    "app.logout": "退出",
    "app.refresh": "刷新",
    "app.refreshing": "刷新中",
    "lang.label": "语言",
    "mode.aria": "dashboard mode",
    "mode.guru": "Guru",
    "mode.dbmf": "DBMF",
    "mode.valuation": "Valuation",
    "page.guru.eyebrow": "Guru Analysis",
    "page.guru.title": "Guru Intelligence Terminal",
    "page.guru.subtitle": "季度 13F、Form 4、STOCK Act 的统一信号工作台",
    "page.dbmf.eyebrow": "Managed Futures",
    "page.dbmf.title": "DBMF Exposure Dashboard",
    "page.dbmf.subtitle": "DBMF 官方持仓、历史敞口与趋势仓位的统一工作台",
    "page.valuation.eyebrow": "Valuation",
    "page.valuation.title": "Valuation Research Terminal",
    "page.valuation.subtitle": "旧 Fundamental Analysis 股票估值、历史估值与最新股价的统一工作台",
    "guru.search": "搜索 guru / 机构",
    "guru.filter.all": "全部",
    "guru.deck.kicker": "Signal cockpit",
    "guru.deck.title": "从披露到可行动信号",
    "guru.bias.positive": "净买入/加仓倾向",
    "guru.bias.negative": "净卖出/减仓倾向",
    "guru.coverage": "Coverage",
    "guru.monitored": "监控对象",
    "guru.aum": "13F 规模",
    "guru.recentTrades": "近期交易",
    "guru.signalSpread": "信号差",
    "guru.latestTape": "Latest signal tape",
    "guru.heatmap": "Ticker heatmap",
    "guru.heatmapNote": "已过滤公司创始人 / 控制股东",
    "guru.noConsensus": "暂无外部共识持仓",
    "guru.transactions": "笔",
    "guru.holdings": "个持仓",
    "guru.tab.holdings": "总持仓",
    "guru.tab.activity": "买入卖出",
    "guru.tab.context": "市场环境",
    "guru.tab.backtest": "模拟",
    "guru.tab.contribution": "季度贡献",
    "guru.tab.notes": "披露说明",
    "guru.contribution.kicker": "13F copy contribution",
    "guru.contribution.title": "季度持仓贡献排名",
    "guru.contribution.subtitle": "选择一个或多个 13F 披露季度，查看各股票对复制组合净值的贡献",
    "guru.contribution.refresh": "重算",
    "guru.contribution.refreshing": "重算中",
    "guru.contribution.empty": "暂无季度贡献数据；点击重算会用已缓存价格和13F持仓重新生成。",
    "guru.contribution.selected": "已选季度",
    "guru.contribution.rank": "排名",
    "guru.contribution.avgWeight": "平均权重",
    "guru.contribution.return": "区间收益",
    "guru.contribution.contribution": "净值贡献",
    "guru.contribution.periods": "季度数",
    "guru.contribution.note": "贡献基于 13F 披露日复制组合，不等同于真实基金净值；13F 不含空头、现金、私募、海外持仓和披露后的实际交易。",
    "valuation.cockpit": "Valuation cockpit",
    "valuation.deckTitle": "从旧 Fundamental 模型到当前市场价格",
    "valuation.avg": "平均",
    "valuation.coverage": "Coverage",
    "valuation.stockCount": "股票数",
    "valuation.history": "历史估值",
    "valuation.pricePoints": "价格点",
    "valuation.livePrice": "实时价格",
    "valuation.extremes": "Valuation extremes",
    "valuation.fair": "fair",
    "valuation.heatmap": "Fair value heatmap",
    "valuation.heatmapSub": "Base fair value vs latest price",
    "valuation.search": "搜索 ticker / 公司",
    "valuation.allSectors": "全部行业",
    "valuation.sort.upside": "按 upside",
    "valuation.sort.ticker": "按 ticker",
    "valuation.sort.price": "按最新价",
    "valuation.sort.history": "按历史行",
    "valuation.latest": "最新",
    "valuation.historyPoints": "历史点",
    "valuation.latestPrice": "最新股价",
    "valuation.baseFairValue": "Base fair value",
    "valuation.fairValueSource.sec": "SEC 财务数据 / 指引模型",
    "valuation.fairValueSource.youtube": "财报电话会指标模型",
    "valuation.fairValueSource.unsupported": "未验证估值",
    "valuation.fairValueSource.legacy": "财务/指引模型",
    "valuation.upside": "Upside / downside",
    "valuation.fairLatest": "fair / latest price",
    "valuation.target3y": "3Y target",
    "valuation.vsLatest": "vs latest",
    "valuation.chartKicker": "HISTORICAL VALUATION + PRICE",
    "valuation.chartTitleSuffix": "历史估值与股价",
    "valuation.loadingPrice": "加载价格线...",
    "valuation.emptyChart": "暂无历史价格/估值数据",
    "valuation.tableTitle": "历史 valuation",
    "valuation.tableSub": "valuation run vs as-of price",
    "valuation.datePeriod": "日期 / 期间",
    "valuation.anchorPrice": "当时股价（对比用）",
	    "valuation.method": "方法",
	    "valuation.methodTitle": "模型方法与假设",
	    "valuation.methodEmpty": "旧模型没有暴露 method card",
	    "valuation.qualityTitle": "数据质量提示",
	    "valuation.qualityUnsupported": "这只股票没有可验证的财务/指引/transcript 估值输入；当前只保留价格线和原始薄 snapshot，不能当作模型结论。",
	    "valuation.qualityPartial": "这只股票不是 MA 级别的完整季度序列；图中只展示旧模型已完成的事件估值。",
	    "valuation.qualityLimited": "这只股票目前只有有限 valuation snapshot，不能按完整历史季度模型解读。",
	    "valuation.qualityYoutubeNoMetrics": "已找到 earnings-call transcript，但结构化 metric 不足，尚不能用 transcript 数据重算估值。",
	    "valuation.qualityNoDaily": "本地库没有可靠日线价格，图中只显示披露日价格标记，不连接成价格线。",
	    "valuation.qualityExcluded": "已过滤异常/重复 valuation 行：",
    "valuation.qualityInputReview": "估值输入需要复核：历史点不足、来源为研究代理，或无法完整验证 fair value 只来自财务/指引。",
    "valuation.qualityInputFail": "发现疑似价格锚定 valuation method；不要把这只股票当作独立估值模型使用。",
    "valuation.qualityUnifiedReview": "统一估值 QA 标记为复核：模型稳定性、外部共识或数据覆盖存在异常。",
    "valuation.qualityUnifiedFail": "统一估值 QA 标记为失败：当前结果不应作为有效估值结论。",
    "valuation.qualityConsensusDivergent": "Base fair value 与外部 12-month consensus 明显背离。",
    "valuation.priceAnchors": "价格标记",
	    "valuation.note": "估值来自旧 Fundamental Analysis module 的 valuation output；fair value 必须由事件可见财务、管理层指引和场景假设驱动，股价只用于图表对比、upside/downside 和回报计算。",
    "dbmf.dashboard": "DBMF dashboard",
    "dbmf.toolbarTitle": "趋势复制仓位：看当前，也看相对上期怎么变",
    "dbmf.currentDate": "当前日期",
    "dbmf.compareDate": "对比日期",
    "dbmf.sort": "排序",
    "dbmf.sort.exposure": "按敞口",
    "dbmf.sort.delta": "按变化",
    "dbmf.sort.risk": "按风险占比",
    "dbmf.sort.market": "按市值",
    "dbmf.holdingsType": "ETF 持仓",
    "dbmf.profileSub": "iMGP DBi Managed Futures Strategy ETF · 官方日度持仓 + 本地历史敞口",
    "dbmf.snapshot": "当前快照",
    "dbmf.totalAssets": "总资产",
    "dbmf.topLong": "最大多头",
    "dbmf.topShort": "最大空头",
    "dbmf.long": "多头",
    "dbmf.short": "空头",
    "dbmf.waiting": "等待 DBMF 数据",
    "dbmf.primaryRead": "Primary read",
    "dbmf.flowBalance": "Flow balance",
    "dbmf.netDirection": "净方向变化",
    "dbmf.rebalance": "Rebalance",
    "dbmf.upDownFlip": "增 / {down} 降 / {flip} 反向",
    "dbmf.assetExposure": "资产敞口",
    "dbmf.officialHoldings": "官方持仓",
    "dbmf.historyCurve": "历史曲线",
    "dbmf.notes": "说明"
  },
  en: {
    "app.privateWorkspace": "Private Workspace",
    "app.logout": "Sign out",
    "app.refresh": "Refresh",
    "app.refreshing": "Refreshing",
    "lang.label": "Language",
    "mode.aria": "dashboard mode",
    "mode.guru": "Guru",
    "mode.dbmf": "DBMF",
    "mode.valuation": "Valuation",
    "page.guru.eyebrow": "Guru Analysis",
    "page.guru.title": "Guru Intelligence Terminal",
    "page.guru.subtitle": "Unified signal workspace for quarterly 13F, Form 4, and STOCK Act disclosures",
    "page.dbmf.eyebrow": "Managed Futures",
    "page.dbmf.title": "DBMF Exposure Dashboard",
    "page.dbmf.subtitle": "Official DBMF holdings, historical exposure, and trend-position dashboard",
    "page.valuation.eyebrow": "Valuation",
    "page.valuation.title": "Valuation Research Terminal",
    "page.valuation.subtitle": "Legacy Fundamental Analysis valuation history, fair value, and latest market price",
    "guru.search": "Search guru / institution",
    "guru.filter.all": "All",
    "guru.deck.kicker": "Signal cockpit",
    "guru.deck.title": "From disclosure to actionable signals",
    "guru.bias.positive": "Net buying / add bias",
    "guru.bias.negative": "Net selling / trim bias",
    "guru.coverage": "Coverage",
    "guru.monitored": "Tracked people",
    "guru.aum": "13F AUM",
    "guru.recentTrades": "Recent trades",
    "guru.signalSpread": "Signal spread",
    "guru.latestTape": "Latest signal tape",
    "guru.heatmap": "Ticker heatmap",
    "guru.heatmapNote": "Founders / control holders filtered out",
    "guru.noConsensus": "No external consensus holdings",
    "guru.transactions": "txns",
    "guru.holdings": "holdings",
    "guru.tab.holdings": "Holdings",
    "guru.tab.activity": "Buys / sells",
    "guru.tab.context": "Market context",
    "guru.tab.backtest": "Simulation",
    "guru.tab.contribution": "Quarter contribution",
    "guru.tab.notes": "Disclosure notes",
    "guru.contribution.kicker": "13F copy contribution",
    "guru.contribution.title": "Quarterly holding contribution ranking",
    "guru.contribution.subtitle": "Select one or multiple 13F quarters to rank each stock's contribution to the copy portfolio NAV",
    "guru.contribution.refresh": "Recompute",
    "guru.contribution.refreshing": "Recomputing",
    "guru.contribution.empty": "No quarterly contribution data yet. Recompute to rebuild it from cached prices and 13F holdings.",
    "guru.contribution.selected": "Selected quarters",
    "guru.contribution.rank": "Rank",
    "guru.contribution.avgWeight": "Avg weight",
    "guru.contribution.return": "Period return",
    "guru.contribution.contribution": "NAV contribution",
    "guru.contribution.periods": "Quarters",
    "guru.contribution.note": "Contribution is based on the 13F copy portfolio, not the actual fund NAV. 13F excludes shorts, cash, private holdings, overseas holdings, and post-disclosure trading.",
    "valuation.cockpit": "Valuation cockpit",
    "valuation.deckTitle": "Legacy Fundamental models vs current market prices",
    "valuation.avg": "Average",
    "valuation.coverage": "Coverage",
    "valuation.stockCount": "Stocks",
    "valuation.history": "Historical valuations",
    "valuation.pricePoints": "Price points",
    "valuation.livePrice": "Live prices",
    "valuation.extremes": "Valuation extremes",
    "valuation.fair": "fair",
    "valuation.heatmap": "Fair value heatmap",
    "valuation.heatmapSub": "Base fair value vs latest price",
    "valuation.search": "Search ticker / company",
    "valuation.allSectors": "All sectors",
    "valuation.sort.upside": "Sort by upside",
    "valuation.sort.ticker": "Sort by ticker",
    "valuation.sort.price": "Sort by latest price",
    "valuation.sort.history": "Sort by history rows",
    "valuation.latest": "latest",
    "valuation.historyPoints": "history points",
    "valuation.latestPrice": "Latest price",
    "valuation.baseFairValue": "Base fair value",
    "valuation.fairValueSource.sec": "SEC financials / guidance model",
    "valuation.fairValueSource.youtube": "Earnings-call metric model",
    "valuation.fairValueSource.unsupported": "Unverified valuation",
    "valuation.fairValueSource.legacy": "Financial/guidance model",
    "valuation.upside": "Upside / downside",
    "valuation.fairLatest": "fair / latest price",
    "valuation.target3y": "3Y target",
    "valuation.vsLatest": "vs latest",
    "valuation.chartKicker": "HISTORICAL VALUATION + PRICE",
    "valuation.chartTitleSuffix": "historical valuation and price",
    "valuation.loadingPrice": "Loading price line...",
    "valuation.emptyChart": "No historical price / valuation data",
    "valuation.tableTitle": "Historical valuation",
    "valuation.tableSub": "valuation run vs as-of price",
    "valuation.datePeriod": "Date / period",
    "valuation.anchorPrice": "As-of price (comparison)",
	    "valuation.method": "Method",
	    "valuation.methodTitle": "Model methods and assumptions",
	    "valuation.methodEmpty": "No method card exposed by legacy model",
	    "valuation.qualityTitle": "Data quality",
	    "valuation.qualityUnsupported": "This ticker has no verified financial/guidance/transcript valuation inputs; only price and thin raw snapshots remain, so it should not be read as a model conclusion.",
	    "valuation.qualityPartial": "This ticker is not a MA-grade full quarterly series; the chart only shows completed legacy model event valuations.",
	    "valuation.qualityLimited": "This ticker currently has limited valuation snapshots and should not be read as a full quarterly history.",
	    "valuation.qualityYoutubeNoMetrics": "Earnings-call transcripts exist, but structured metrics are insufficient to recompute valuation from transcript data.",
	    "valuation.qualityNoDaily": "The local database has no reliable daily price series, so the chart shows as-of price markers instead of a connected price line.",
	    "valuation.qualityExcluded": "Filtered abnormal / duplicate valuation rows:",
    "valuation.qualityInputReview": "Model inputs need review: limited history, research-proxy source, or incomplete proof that fair value is driven only by financials/guidance.",
    "valuation.qualityInputFail": "Potential price-anchored valuation method detected; do not treat this ticker as an independent valuation model.",
    "valuation.qualityUnifiedReview": "Unified valuation QA marked this for review: model stability, external consensus, or data coverage looks abnormal.",
    "valuation.qualityUnifiedFail": "Unified valuation QA marked this as fail; do not treat the current result as a valid valuation conclusion.",
    "valuation.qualityConsensusDivergent": "Base fair value is materially divergent from external 12-month consensus.",
    "valuation.priceAnchors": "Markers",
	    "valuation.note": "Data comes from legacy Fundamental Analysis module valuation output. Fair value must be driven by event-visible financials, management guidance, and scenario assumptions; price is used only for chart comparison, upside/downside, and return math.",
    "dbmf.dashboard": "DBMF dashboard",
    "dbmf.toolbarTitle": "Trend replication positioning: current exposure and changes vs prior snapshot",
    "dbmf.currentDate": "Current date",
    "dbmf.compareDate": "Compare date",
    "dbmf.sort": "Sort",
    "dbmf.sort.exposure": "By exposure",
    "dbmf.sort.delta": "By change",
    "dbmf.sort.risk": "By risk share",
    "dbmf.sort.market": "By market value",
    "dbmf.holdingsType": "ETF holdings",
    "dbmf.profileSub": "iMGP DBi Managed Futures Strategy ETF · official daily holdings + local historical exposure",
    "dbmf.snapshot": "Current snapshot",
    "dbmf.totalAssets": "Total assets",
    "dbmf.topLong": "Largest long",
    "dbmf.topShort": "Largest short",
    "dbmf.long": "long",
    "dbmf.short": "short",
    "dbmf.waiting": "Waiting for DBMF data",
    "dbmf.primaryRead": "Primary read",
    "dbmf.flowBalance": "Flow balance",
    "dbmf.netDirection": "net directional change",
    "dbmf.rebalance": "Rebalance",
    "dbmf.upDownFlip": "up / {down} down / {flip} flips",
    "dbmf.assetExposure": "Asset exposure",
    "dbmf.officialHoldings": "Official holdings",
    "dbmf.historyCurve": "History",
    "dbmf.notes": "Notes"
  }
};

function currentLanguage() {
  const stored = window.localStorage.getItem("guru-analysis-language");
  return stored === "en" ? "en" : "zh";
}

function useI18n() {
  return React.useContext(I18nContext);
}

const disclosureLabels = {
  manager13f: "13F 机构",
  insider: "Form 4 个人",
  congress: "STOCK Act"
};

const actionLabels = {
  new: "新增",
  increased: "加仓",
  reduced: "减仓",
  sold_out: "清仓",
  unchanged: "不变",
  buy: "买入",
  sell: "卖出",
  award: "授予",
  option_exercise: "行权",
  tax_withholding: "税务扣缴",
  gift: "赠与",
  disposed_to_issuer: "回售公司",
  other: "其他"
};

const actionTone = {
  new: "positive",
  increased: "positive",
  buy: "positive",
  reduced: "negative",
  sold_out: "negative",
  sell: "negative",
  award: "neutral",
  option_exercise: "neutral",
  tax_withholding: "muted",
  gift: "muted"
};

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function formatMoney(value) {
  if (!Number.isFinite(value) || value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatNumber(value, options = {}) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatReturnPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function mean(values = []) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

function dateValue(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function compactName(value) {
  return String(value || "").replace(/ - COMMON STOCK.*$/i, "").replace(/\s+/g, " ").trim();
}

function buildSignalModel(gurus) {
  const signals = [];
  const exposureMap = new Map();
  let total13fValue = 0;
  let totalTransactions = 0;
  let buySignals = 0;
  let sellSignals = 0;

  for (const guru of gurus) {
    if (guru.type === "manager13f") {
      total13fValue += guru.summary?.totalValue || 0;
      for (const item of guru.activity?.slice(0, 12) || []) {
        const bullish = item.action === "new" || item.action === "increased";
        if (bullish) buySignals += 1;
        if (item.action === "reduced" || item.action === "sold_out") sellSignals += 1;
        signals.push({
          guruId: guru.id,
          guruName: guru.name,
          type: disclosureLabels[guru.type],
          ticker: item.ticker || compactName(item.issuer),
          issuer: compactName(item.issuer),
          action: item.action,
          date: guru.summary?.reportDate,
          value: item.value || item.previousValue || 0,
          detail: `${formatNumber(Math.abs(item.changeShares || 0))} 股变化`,
          tone: bullish ? "positive" : "negative"
        });
      }

      if (!isHeatmapExcludedGuru(guru)) {
        for (const holding of (guru.holdings || []).filter(isLongTickerExposure).slice(0, 20)) {
          addExposure(exposureMap, holding, guru, holding.value || 0, holding.action);
        }
      }
    } else {
      totalTransactions += guru.summary?.recentTransactions || 0;
      for (const tx of guru.transactions?.slice(0, 18) || []) {
        if (tx.action === "buy") buySignals += 1;
        if (tx.action === "sell") sellSignals += 1;
        const txValue = tx.value || tx.notional || 0;
        signals.push({
          guruId: guru.id,
          guruName: guru.name,
          type: disclosureLabels[guru.type],
          ticker: tx.ticker || compactName(tx.issuer),
          issuer: compactName(tx.issuer),
          action: tx.action,
          date: tx.transactionDate || tx.filingDate,
          value: txValue,
          detail: tx.amountRange || (tx.shares ? `${formatNumber(tx.shares)} 股` : tx.securityTitle || ""),
          tone: actionTone[tx.action] || "muted"
        });

        if (guru.type !== "congress" && txValue > 0 && !isHeatmapExcludedGuru(guru)) {
          addExposure(exposureMap, tx, guru, txValue, tx.action);
        }
      }

      if (guru.type === "congress" && !isHeatmapExcludedGuru(guru)) {
        for (const holding of guru.holdings?.slice(0, 14) || []) {
          addExposure(exposureMap, holding, guru, holding.value || holding.buyValue || 0, "watch");
        }
      }
    }
  }

  const exposures = [...exposureMap.values()]
    .map((item) => ({
      ...item,
      guruCount: item.gurus.size,
      guruNames: [...item.gurus].join(", ")
    }))
    .sort((a, b) => b.guruCount - a.guruCount || b.value - a.value)
    .slice(0, 8);

  const groupedSignals = [...signals.reduce((map, signal) => {
    const key = `${signal.guruId}-${signal.ticker}-${signal.action}-${signal.date}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...signal, count: 1 });
      return map;
    }

    current.value += signal.value || 0;
    current.count += 1;
    current.detail = `${current.count} 笔合并`;
    return map;
  }, new Map()).values()];

  const sortedSignals = groupedSignals
    .filter((signal) => signal.ticker)
    .sort((a, b) => dateValue(b.date) - dateValue(a.date) || b.value - a.value)
    .slice(0, 10);

  return {
    stats: {
      gurus: gurus.length,
      total13fValue,
      totalTransactions,
      buySignals,
      sellSignals,
      netBias: buySignals - sellSignals,
      sourceCount: new Set(gurus.map((guru) => guru.disclosureKind || guru.type)).size
    },
    signals: sortedSignals,
    exposures
  };
}

function isHeatmapExcludedGuru(guru) {
  return Boolean(guru?.excludeFromHeatmap);
}

function isMarketTicker(value) {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(value || "").trim().toUpperCase());
}

function isLongTickerExposure(item) {
  return !item?.putCall && isMarketTicker(item?.ticker);
}

function addExposure(map, item, guru, value, action) {
  const ticker = String(item.ticker || "").trim().toUpperCase();
  if (!isMarketTicker(ticker)) return;

  const current = map.get(ticker) || {
    ticker,
    issuer: compactName(item.issuer || ticker),
    value: 0,
    gurus: new Set(),
    positive: 0,
    negative: 0
  };

  current.value += Number.isFinite(value) ? value : 0;
  current.gurus.add(guru.name);
  if (["new", "increased", "buy"].includes(action)) current.positive += 1;
  if (["reduced", "sold_out", "sell"].includes(action)) current.negative += 1;
  map.set(ticker, current);
}

function guruSignalScore(guru) {
  const summary = guru.summary || {};
  if (guru.type === "manager13f") {
    const active = (summary.newPositions || 0) + (summary.increasedPositions || 0);
    const defensive = (summary.reducedPositions || 0) + (summary.soldOutPositions || 0);
    return Math.max(28, Math.min(96, 54 + active * 1.8 - defensive * 1.2));
  }

  if (guru.type === "congress") {
    return Math.max(30, Math.min(92, 56 + (summary.buys || 0) * 2 - (summary.sells || 0) * 1.6));
  }

  return Math.max(24, Math.min(94, 52 + (summary.buys || 0) * 4 - (summary.sells || 0) * 1.2));
}

function latestSignalLabel(guru) {
  if (guru.type === "manager13f") {
    const top = guru.activity?.[0];
    return top ? `${actionLabels[top.action] || top.action} ${top.ticker || compactName(top.issuer)}` : "季度披露";
  }
  const tx = guru.transactions?.[0];
  return tx ? `${actionLabels[tx.action] || tx.action} ${tx.ticker || compactName(tx.issuer)}` : guru.disclosureKind;
}

function useGuruData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load({ refresh = false } = {}) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const json = await apiFetch(`/api/gurus${refresh ? "?refresh=1" : ""}`);
      setData(json);
    } catch (err) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { data, loading, refreshing, error, refresh: () => load({ refresh: true }) };
}

function useDbmfData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load({ refresh = false } = {}) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const json = await apiFetch(`/api/dbmf${refresh ? "?refresh=1" : ""}`);
      setData(json);
    } catch (err) {
      setError(err.message || "加载 DBMF 失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { data, loading, refreshing, error, refresh: () => load({ refresh: true }) };
}

function useValuationData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load({ refresh = false } = {}) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const json = await apiFetch("/api/valuation");
      setData(json);
    } catch (err) {
      setError(err.message || "加载 Valuation 失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { data, loading, refreshing, error, refresh: () => load({ refresh: true }) };
}

function useValuationTicker(ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ticker) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");

    apiFetch(`/api/valuation/${encodeURIComponent(ticker)}`, { signal: controller.signal })
      .then((json) => setData(json.ticker || null))
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "加载估值详情失败");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [ticker]);

  return { data, loading, error };
}

function useGuruContext(guruId, ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!guruId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    const params = ticker ? `?ticker=${encodeURIComponent(ticker)}` : "";
    apiFetch(`/api/gurus/${guruId}/context${params}`, { signal: controller.signal })
      .then((json) => setData(json))
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "加载市场环境失败");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [guruId, ticker]);

  return { data, loading, error };
}

function useGuruBacktest(guruId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load({ refresh = false } = {}) {
    if (!guruId) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ years: "5" });
      if (refresh) params.set("refresh", "1");
      const json = await apiFetch(`/api/gurus/${guruId}/backtest?${params}`);
      setData(json);
    } catch (err) {
      setError(err.message || "加载模拟失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setData(null);
    load();
  }, [guruId]);

  return { data, loading, refreshing, error, refresh: () => load({ refresh: true }) };
}

function useOperationCommentary(guruId, operation) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!guruId || !operation?.ticker || !operation?.date) {
      setData(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      ticker: operation.ticker || "",
      issuer: operation.issuer || "",
      action: operation.action || "",
      date: operation.date || "",
      filingDate: operation.filingDate || "",
      disclosureKind: operation.disclosureKind || "",
      source: operation.source || "",
      selectedClose: String(operation.selectedClose || ""),
      spyClose: String(operation.spyClose || "")
    });

    setLoading(true);
    setError("");

    apiFetch(`/api/gurus/${guruId}/commentary?${params}`, { signal: controller.signal })
      .then((json) => setData(json))
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "搜索公开发言失败");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [
    guruId,
    operation?.id,
    operation?.ticker,
    operation?.date,
    operation?.action,
    operation?.selectedClose,
    operation?.spyClose
  ]);

  return { data, loading, error };
}

function App() {
  const guruState = useGuruData();
  const dbmfState = useDbmfData();
  const valuationState = useValuationData();
  const [mode, setModeState] = useState(() => currentDashboardMode());
  const [language, setLanguageState] = useState(() => currentLanguage());
  const { user, logout } = useAuth();

  useEffect(() => {
    function handleHashChange() {
      setModeState(currentDashboardMode());
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("guru-analysis-language", language);
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  }, [language]);

  function setLanguage(nextLanguage) {
    setLanguageState(nextLanguage === "en" ? "en" : "zh");
  }

  const i18n = useMemo(() => {
    const dictionary = uiText[language] || uiText.zh;
    return {
      language,
      t(key) {
        return dictionary[key] ?? uiText.zh[key] ?? key;
      }
    };
  }, [language]);
  const { t } = i18n;

  function setMode(nextMode) {
    setModeState(nextMode);
    const nextHash = nextMode === "dbmf" ? "#dbmf" : nextMode === "valuation" ? "#valuation" : "#guru";
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }

  const activeState = mode === "guru" ? guruState : mode === "dbmf" ? dbmfState : valuationState;
  const pageMeta = {
    guru: {
      eyebrow: t("page.guru.eyebrow"),
      title: t("page.guru.title"),
      subtitle: t("page.guru.subtitle"),
      source: "SEC EDGAR"
    },
    dbmf: {
      eyebrow: t("page.dbmf.eyebrow"),
      title: t("page.dbmf.title"),
      subtitle: t("page.dbmf.subtitle"),
      source: "DBMF local data"
    },
    valuation: {
      eyebrow: t("page.valuation.eyebrow"),
      title: t("page.valuation.title"),
      subtitle: t("page.valuation.subtitle"),
      source: "Local valuation database"
    }
  }[mode] || {};
  const sourceLabel = activeState.data?.source?.label || pageMeta.source;

  return (
    <I18nContext.Provider value={i18n}>
      <main className="app-shell">
        <header className="top-bar">
          <div>
            <div className="eyebrow">{pageMeta.eyebrow}</div>
            <h1>{pageMeta.title}</h1>
            <p className="page-subtitle">{pageMeta.subtitle}</p>
          </div>
          <div className="top-actions">
            <ModeSwitch mode={mode} onChange={setMode} />
            <LanguageSwitch language={language} onChange={setLanguage} />
            <div className="source-pill">
              <CheckCircle2 size={16} />
              <span>{sourceLabel}</span>
              <span>{activeState.data?.generatedAt ? formatDate(activeState.data.generatedAt) : "-"}</span>
            </div>
            <div className="source-pill auth-user-pill">
              <span>{user?.name || user?.email || t("app.privateWorkspace")}</span>
            </div>
            <button className="icon-button" onClick={() => void logout()}>
              <LogOut size={18} />
              <span>{t("app.logout")}</span>
            </button>
            <button
              className="icon-button primary"
              onClick={activeState.refresh}
              disabled={activeState.refreshing || activeState.loading}
            >
              {activeState.refreshing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              <span>{activeState.refreshing ? t("app.refreshing") : t("app.refresh")}</span>
            </button>
          </div>
        </header>

        {mode === "guru" ? <GuruWorkspace {...guruState} /> : mode === "dbmf" ? <DbmfWorkspace {...dbmfState} /> : <ValuationWorkspace {...valuationState} />}
      </main>
    </I18nContext.Provider>
  );
}

function AuthenticatedRoot() {
  const { isAuthenticated, loading } = useAuth();
  const [route, setRoute] = useState(() => window.location.pathname);

  useEffect(() => {
    function handleRouteChange() {
      setRoute(window.location.pathname);
    }
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  if (route === "/auth/callback") return <AuthCallbackPage />;
  if (route === "/login") return <LoginPage />;
  if (loading) return <AuthLoadingScreen />;
  if (!isAuthenticated) {
    const redirectTo = encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    window.history.replaceState(null, "", `/login?redirectTo=${redirectTo}`);
    return <LoginPage />;
  }
  return <App />;
}

function AuthLoadingScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-mark">
          <Radar size={22} />
          <span>Guru Intelligence Terminal</span>
        </div>
        <h1>Checking sign in</h1>
        <p>正在确认你的 Google 登录状态。</p>
        <Loader2 className="spin auth-loader" size={22} />
      </section>
    </main>
  );
}

function currentDashboardMode() {
  const hash = window.location.hash.toLowerCase();
  if (hash.includes("valuation")) return "valuation";
  if (hash.includes("dbmf")) return "dbmf";
  return "guru";
}

function ModeSwitch({ mode, onChange }) {
  const { t } = useI18n();
  return (
    <div className="mode-switch" aria-label={t("mode.aria")}>
      <button className={mode === "guru" ? "active" : ""} onClick={() => onChange("guru")}>
        {t("mode.guru")}
      </button>
      <button className={mode === "dbmf" ? "active" : ""} onClick={() => onChange("dbmf")}>
        {t("mode.dbmf")}
      </button>
      <button className={mode === "valuation" ? "active" : ""} onClick={() => onChange("valuation")}>
        {t("mode.valuation")}
      </button>
    </div>
  );
}

function LanguageSwitch({ language, onChange }) {
  const { t } = useI18n();
  return (
    <div className="language-switch" aria-label={t("lang.label")}>
      <button className={language === "zh" ? "active" : ""} onClick={() => onChange("zh")}>
        中
      </button>
      <button className={language === "en" ? "active" : ""} onClick={() => onChange("en")}>
        EN
      </button>
    </div>
  );
}

function GuruWorkspace({ data, loading, error }) {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const gurus = data?.gurus || [];
  const visibleGurus = useMemo(() => {
    return gurus.filter((guru) => {
      const matchesFilter = filter === "all" || guru.type === filter;
      const haystack = `${guru.name} ${guru.chineseName} ${guru.entityName} ${guru.role}`.toLowerCase();
      return matchesFilter && haystack.includes(query.toLowerCase());
    });
  }, [gurus, filter, query]);

  useEffect(() => {
    if (!activeId && visibleGurus[0]) setActiveId(visibleGurus[0].id);
    if (activeId && visibleGurus.length && !visibleGurus.some((guru) => guru.id === activeId)) {
      setActiveId(visibleGurus[0].id);
    }
  }, [activeId, visibleGurus]);

  const activeGuru = gurus.find((guru) => guru.id === activeId) || visibleGurus[0] || gurus[0];
  const signalModel = useMemo(() => buildSignalModel(gurus), [gurus]);

  return (
    <>
      {error ? <ErrorBanner error={error} /> : null}

      <CommandDeck
        loading={loading}
        model={signalModel}
        activeGuruId={activeGuru?.id}
        onSelectGuru={setActiveId}
      />

      <section className="workspace">
        <aside className="guru-rail">
          <div className="rail-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("guru.search")}
              />
            </label>
            <div className="segmented" aria-label="disclosure filter">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
                {t("guru.filter.all")}
              </button>
              <button
                className={filter === "manager13f" ? "active" : ""}
                onClick={() => setFilter("manager13f")}
              >
                13F
              </button>
              <button
                className={filter === "insider" ? "active" : ""}
                onClick={() => setFilter("insider")}
              >
                Form 4
              </button>
              <button
                className={filter === "congress" ? "active" : ""}
                onClick={() => setFilter("congress")}
              >
                STOCK
              </button>
            </div>
          </div>

          <div className="guru-list">
            {loading ? (
              <SkeletonList />
            ) : (
              visibleGurus.map((guru) => (
                <GuruButton
                  key={guru.id}
                  guru={guru}
                  active={activeGuru?.id === guru.id}
                  onClick={() => setActiveId(guru.id)}
                />
              ))
            )}
          </div>
        </aside>

        <section className="detail-pane">
          {loading || !activeGuru ? <DetailSkeleton /> : <GuruDetail guru={activeGuru} />}
        </section>
      </section>
    </>
  );
}

function valuationCurrency(value, currency = "USD") {
  if (!Number.isFinite(value)) return "-";
  const symbol = currency === "GBP" ? "£" : currency === "GBX" ? "p" : "$";
  if (currency === "GBX") return `${value.toFixed(value >= 100 ? 0 : 1)}p`;
  if (Math.abs(value) >= 1000) return `${symbol}${value.toFixed(0)}`;
  return `${symbol}${value.toFixed(2)}`;
}

function fairValueSourceLabel(ticker, t) {
  const quality = ticker?.dataQuality || {};
  const source = String(ticker?.latest?.fairValueSource || "");
  if (quality.legacyBackendValuationRows > 0 && /legacy|fundamental analysis/i.test(source)) return t("valuation.fairValueSource.legacy");
  if (source && /sec|companyfacts|financials/i.test(source)) return t("valuation.fairValueSource.sec");
  if (source && /youtube|earnings-call|transcript/i.test(source)) return t("valuation.fairValueSource.youtube");
  if (source && /legacy|fundamental analysis/i.test(source)) return t("valuation.fairValueSource.legacy");
  if (source) return source;
  if (quality.secCompanyFactsQuarterlyRows > 0) return t("valuation.fairValueSource.sec");
  if (quality.youtubeEarningsMetricValuationRows > 0) return t("valuation.fairValueSource.youtube");
  if (quality.valuationCoverageKind === "unsupported") return t("valuation.fairValueSource.unsupported");
  return quality.modelInputAudit?.sourceGrade || t("valuation.fairValueSource.legacy");
}

function buildValuationModel(data, tickers) {
  const rows = tickers || [];
  const sortedUpside = [...rows]
    .filter((row) => Number.isFinite(row.latest?.upsideToBase))
    .sort((a, b) => b.latest.upsideToBase - a.latest.upsideToBase);
  const livePriceCount = rows.filter((row) => row.dataQuality?.hasLivePriceSeries).length;
  const avgUpside = sortedUpside.length
    ? sortedUpside.reduce((sum, row) => sum + row.latest.upsideToBase, 0) / sortedUpside.length
    : 0;

  return {
    rows: sortedUpside,
    topUpside: sortedUpside[0] || null,
    topDownside: sortedUpside.at(-1) || null,
    livePriceCount,
    avgUpside,
    summary: data?.summary || {}
  };
}

function ValuationWorkspace({ data, loading, error }) {
  const { t } = useI18n();
  const [activeTicker, setActiveTicker] = useState("");
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [sortBy, setSortBy] = useState("upside");
  const tickers = data?.tickers || [];
  const sectors = useMemo(() => {
    const names = [...new Set(tickers.map((item) => item.sector).filter(Boolean))];
    return ["all", ...names.sort()];
  }, [tickers]);

  const visibleTickers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sorters = {
      upside: (a, b) => (b.latest?.upsideToBase ?? -Infinity) - (a.latest?.upsideToBase ?? -Infinity),
      ticker: (a, b) => String(a.ticker).localeCompare(String(b.ticker)),
      price: (a, b) => (b.latest?.latestPrice || 0) - (a.latest?.latestPrice || 0),
      history: (a, b) => (b.history?.length || 0) - (a.history?.length || 0)
    };
    return tickers
      .filter((item) => {
        const matchesSector = sector === "all" || item.sector === sector;
        const haystack = `${item.ticker} ${item.name} ${item.sector} ${item.modelType}`.toLowerCase();
        return matchesSector && (!normalizedQuery || haystack.includes(normalizedQuery));
      })
      .sort(sorters[sortBy] || sorters.upside);
  }, [query, sector, sortBy, tickers]);

  useEffect(() => {
    if (!activeTicker && visibleTickers[0]) setActiveTicker(visibleTickers[0].ticker);
    if (activeTicker && visibleTickers.length && !visibleTickers.some((item) => item.ticker === activeTicker)) {
      setActiveTicker(visibleTickers[0].ticker);
    }
  }, [activeTicker, visibleTickers]);

  const activeCompact = tickers.find((item) => item.ticker === activeTicker) || visibleTickers[0] || tickers[0];
  const tickerDetail = useValuationTicker(activeCompact?.ticker);
  const active = tickerDetail.data || activeCompact;
  const model = useMemo(() => buildValuationModel(data, tickers), [data, tickers]);

  if (loading && !data) {
    return (
      <section className="dbmf-shell">
        <div className="command-deck loading-block" />
        <div className="table-panel loading-table" />
      </section>
    );
  }

  return (
    <>
      {error ? <ErrorBanner error={error} /> : null}
      <ValuationCommandDeck data={data} model={model} loading={loading} onSelectTicker={setActiveTicker} />

      <section className="workspace valuation-workspace">
        <aside className="guru-rail valuation-rail">
          <div className="rail-tools">
            <label className="search-box">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("valuation.search")} />
            </label>
            <div className="valuation-select-row">
              <select value={sector} onChange={(event) => setSector(event.target.value)}>
                {sectors.map((option) => (
                  <option value={option} key={option}>{option === "all" ? t("valuation.allSectors") : option}</option>
                ))}
              </select>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="upside">{t("valuation.sort.upside")}</option>
                <option value="ticker">{t("valuation.sort.ticker")}</option>
                <option value="price">{t("valuation.sort.price")}</option>
                <option value="history">{t("valuation.sort.history")}</option>
              </select>
            </div>
          </div>
          <div className="guru-list valuation-list">
            {loading ? <SkeletonList /> : visibleTickers.map((item) => (
              <ValuationTickerButton
                key={item.ticker}
                ticker={item}
                active={active?.ticker === item.ticker}
                onClick={() => setActiveTicker(item.ticker)}
              />
            ))}
          </div>
        </aside>

        <section className="detail-pane">
          {!active ? <DetailSkeleton /> : (
            <ValuationDetail
              ticker={active}
              compact={activeCompact}
              loading={tickerDetail.loading}
              error={tickerDetail.error}
            />
          )}
        </section>
      </section>
    </>
  );
}

function ValuationCommandDeck({ data, model, loading, onSelectTicker }) {
  const { t } = useI18n();
  const summary = model.summary || {};
  const movers = [model.topUpside, model.topDownside].filter(Boolean);
  const maxAbsUpside = Math.max(...(model.rows || []).map((row) => Math.abs(row.latest?.upsideToBase || 0)), 0.01);

  return (
    <section className="command-deck valuation-command">
      <div className="deck-head">
        <div>
          <span className="deck-kicker">
            <BadgeDollarSign size={15} />
            {t("valuation.cockpit")}
          </span>
          <h2>{t("valuation.deckTitle")}</h2>
        </div>
        <div className={`bias-chip ${(model.avgUpside || 0) >= 0 ? "positive" : "negative"}`}>
          {(model.avgUpside || 0) >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span>{t("valuation.avg")} {formatReturnPct(model.avgUpside || 0)}</span>
        </div>
      </div>

      <div className="command-grid valuation-command-grid">
        <section className="terminal-panel stat-panel">
          <div className="panel-title">
            <Layers size={16} />
            {t("valuation.coverage")}
          </div>
          <div className="terminal-stats">
            <TerminalStat icon={Layers} label={t("valuation.stockCount")} value={formatNumber(summary.tickerCount || 0)} sub="legacy modules" />
            <TerminalStat icon={LineChart} label={t("valuation.history")} value={formatNumber(summary.historyRows || 0)} sub="valuation rows" />
            <TerminalStat icon={Activity} label={t("valuation.pricePoints")} value={formatNumber(summary.pricePointCount || 0)} sub="cached bars" />
            <TerminalStat icon={CheckCircle2} label={t("valuation.livePrice")} value={`${formatNumber(model.livePriceCount || 0)}/${formatNumber(summary.tickerCount || 0)}`} sub={formatDate(summary.latestPriceDate)} />
          </div>
        </section>

        <section className="terminal-panel signal-panel">
          <div className="panel-title">
            <Sparkles size={16} />
            {t("valuation.extremes")}
          </div>
          <div className="signal-list">
            {loading ? <SignalSkeleton /> : movers.map((item) => (
              <button className="signal-row" key={item.ticker} onClick={() => onSelectTicker(item.ticker)}>
                <div className={`signal-marker ${(item.latest?.upsideToBase || 0) >= 0 ? "positive" : "negative"}`} />
                <div className="signal-main">
                  <strong>{item.ticker}</strong>
                  <span>{item.name} · {item.currency}</span>
                </div>
                <div className="signal-meta">
                  <strong>{formatReturnPct(item.latest?.upsideToBase)}</strong>
                  <span>{valuationCurrency(item.latest?.baseFairValue, item.currency)} {t("valuation.fair")}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="terminal-panel exposure-panel">
          <div className="panel-title">
            <Crosshair size={16} />
            {t("valuation.heatmap")}
            <small>{t("valuation.heatmapSub")}</small>
          </div>
          <div className="exposure-list">
            {(model.rows || []).slice(0, 8).map((item) => (
              <div className="exposure-row valuation-heat-row" key={item.ticker}>
                <div className="exposure-copy">
                  <strong>{item.ticker}</strong>
                  <span>{item.name}</span>
                </div>
                <div className="exposure-meter" aria-label={`${item.ticker} upside`}>
                  <span style={{ width: `${Math.max(8, Math.min(100, Math.abs(item.latest?.upsideToBase || 0) / maxAbsUpside * 100))}%` }} />
                </div>
                <div className={`exposure-value ${(item.latest?.upsideToBase || 0) >= 0 ? "positive-text" : "negative-text"}`}>
                  {formatReturnPct(item.latest?.upsideToBase)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ValuationTickerButton({ ticker, active, onClick }) {
  const { t } = useI18n();
  const upside = ticker.latest?.upsideToBase;
  const historyCount = ticker.dataQuality?.fullHistoryRowsAvailable || ticker.history?.length || 0;
  return (
    <button className={`guru-card valuation-card ${active ? "active" : ""}`} onClick={onClick}>
      <div className="guru-avatar">{ticker.ticker.slice(0, 1)}</div>
      <div className="guru-copy">
        <div className="guru-name-row">
          <strong>{ticker.ticker}</strong>
          <span className={`mini-badge ${(upside || 0) >= 0 ? "simulatable" : "muted"}`}>{formatReturnPct(upside)}</span>
        </div>
        <span>{ticker.name}</span>
        <small>{valuationCurrency(ticker.latest?.latestPrice, ticker.currency)} {t("valuation.latest")} · {formatNumber(historyCount)} {t("valuation.historyPoints")}</small>
      </div>
      <div className="score-ring">{ticker.dataQuality?.hasLivePriceSeries ? "P" : "A"}</div>
    </button>
  );
}

function ValuationDetail({ ticker, compact, loading, error }) {
  const { t } = useI18n();
  const active = ticker || compact;
  const scenarios = active.scenarios || [];
  const base = scenarios.find((item) => item.scenario === "Base") || scenarios[0] || {};
  const history = active.history || [];
  const scenarioCards = scenarios.length
    ? [...scenarios].sort((left, right) => ["Bear", "Base", "Bull"].indexOf(left.scenario) - ["Bear", "Base", "Bull"].indexOf(right.scenario))
    : [base].filter((item) => item?.scenario);

  return (
    <article className="guru-detail valuation-detail">
      {error ? <ErrorBanner error={error} /> : null}
      <section className="profile-band valuation-profile">
        <div className="profile-main">
          <div className="identity-stack">
            <span className="type-chip">Valuation</span>
            <h2>{active.ticker} · {active.name}</h2>
            <p>{active.sector}</p>
          </div>
          <div className="profile-meta">
            <span>{active.modelType || "Fundamental valuation model"}</span>
            <span>{active.dataQuality?.sourceNote || "Local valuation snapshot"}</span>
          </div>
        </div>
        <div className="metric-grid">
          <MetricBox metric={{ label: t("valuation.latestPrice"), value: valuationCurrency(active.latest?.latestPrice, active.currency), sub: formatDate(active.latest?.latestPriceDate), icon: LineChart }} />
          <MetricBox metric={{ label: t("valuation.baseFairValue"), value: valuationCurrency(active.latest?.baseFairValue, active.currency), sub: fairValueSourceLabel(active, t), icon: BadgeDollarSign }} />
          <MetricBox metric={{ label: t("valuation.upside"), value: formatReturnPct(active.latest?.upsideToBase), sub: t("valuation.fairLatest"), tone: (active.latest?.upsideToBase || 0) >= 0 ? "positive" : "negative", icon: active.latest?.upsideToBase >= 0 ? ArrowUpRight : ArrowDownRight }} />
          <MetricBox metric={{ label: t("valuation.target3y"), value: valuationCurrency(base.targetPrice3Y || active.latest?.targetPrice3Y, active.currency), sub: `CAGR ${formatReturnPct(base.expectedReturn3Y || active.latest?.expectedReturn3Y)}`, icon: TrendingUp }} />
        </div>
      </section>

	      <section className="insight-deck valuation-scenarios">
	        {scenarioCards.map((item) => {
          const scenarioUpside =
            Number.isFinite(item.fairValue) && Number.isFinite(active.latest?.latestPrice) && active.latest.latestPrice
              ? item.fairValue / active.latest.latestPrice - 1
              : item.upsideDownside;
          return (
            <div className={`insight-item ${item.scenario === "Base" ? "primary" : ""}`} key={item.scenario}>
              <div className="insight-icon"><BadgeDollarSign size={17} /></div>
              <span>{item.scenario}</span>
              <strong>{valuationCurrency(item.fairValue, active.currency)}</strong>
              <small>{formatReturnPct(scenarioUpside)} {t("valuation.vsLatest")}</small>
            </div>
          );
	        })}
	      </section>
	      <ValuationQualityBanner ticker={active} />

	      <div className="dbmf-panel-stack valuation-stack">
	        <ValuationHistoryPanel ticker={active} loading={loading} />
        <ValuationTable ticker={active} history={history} />
        <ValuationMethodPanel ticker={active} />
      </div>
    </article>
	  );
	}

function ValuationQualityBanner({ ticker }) {
  const { t } = useI18n();
  const quality = ticker.dataQuality || {};
  const inputAudit = quality.modelInputAudit || {};
  const unifiedAudit = quality.unifiedValuationAudit || {};
  const messages = [];
  if (quality.valuationCoverageKind === "unsupported") {
    messages.push(t("valuation.qualityUnsupported"));
  } else if (quality.valuationCoverageKind === "limited" || (!quality.legacyBackendValuationRows && (ticker.history || []).length < 12)) {
    messages.push(t("valuation.qualityLimited"));
  } else if (quality.valuationCoverageKind && quality.valuationCoverageKind !== "quarterly") {
    messages.push(t("valuation.qualityPartial"));
  }
  if (quality.youtubeEarnings?.calls > 0 && !quality.youtubeEarningsMetricValuationRows && quality.youtubeEarnings?.metricPeriods < 5) {
    messages.push(t("valuation.qualityYoutubeNoMetrics"));
  }
  if (quality.priceDisplayMode === "as-of-price-anchors" || (!quality.hasLivePriceSeries && (ticker.history || []).some((row) => Number.isFinite(row.priceAtDate)))) {
    messages.push(t("valuation.qualityNoDaily"));
  }
  const excludedRows = Number(quality.excludedLegacyBackendRows || 0) + Number(quality.excludedSnapshotRows || 0);
  if (excludedRows > 0) {
    messages.push(`${t("valuation.qualityExcluded")} ${formatNumber(excludedRows)}`);
  }
  if (inputAudit.status === "fail") {
    messages.push(t("valuation.qualityInputFail"));
  } else if (inputAudit.status === "review") {
    messages.push(t("valuation.qualityInputReview"));
  }
  if (unifiedAudit.status === "fail") {
    messages.push(t("valuation.qualityUnifiedFail"));
  } else if (unifiedAudit.status === "review") {
    messages.push(t("valuation.qualityUnifiedReview"));
  }
  if (unifiedAudit.externalConsensusCheck?.status === "divergent") {
    const target = valuationCurrency(unifiedAudit.externalConsensus?.averageTarget, ticker.currency);
    messages.push(`${t("valuation.qualityConsensusDivergent")} Consensus ${target}`);
  }
  for (const warning of (unifiedAudit.warnings || []).slice(0, 2)) {
    if (!messages.includes(warning)) messages.push(warning);
  }
  if (!messages.length) return null;
  return (
    <section className="quality-banner valuation-quality-banner">
      <ShieldAlert size={18} />
      <div>
        <strong>{t("valuation.qualityTitle")}</strong>
        {messages.map((message) => <span key={message}>{message}</span>)}
      </div>
    </section>
  );
}

	function ValuationHistoryPanel({ ticker, loading }) {
	  const { t } = useI18n();
  return (
    <section className="chart-panel valuation-chart-panel">
      <div className="chart-head">
        <div>
          <span>{t("valuation.chartKicker")}</span>
          <h3>{ticker.ticker} {t("valuation.chartTitleSuffix")}</h3>
        </div>
        <strong>{loading ? t("valuation.loadingPrice") : ticker.currency}</strong>
      </div>
      <ValuationHistoryChart ticker={ticker} />
    </section>
  );
}

function ValuationHistoryChart({ ticker }) {
  const { t } = useI18n();
  const [hover, setHover] = useState(null);
  const width = 860;
  const height = 320;
  const padding = { top: 24, right: 22, bottom: 38, left: 58 };
  const pricePoints = useMemo(() => (ticker.priceHistory || [])
    .filter((point) => point.date && Number.isFinite(point.close))
    .sort((a, b) => dateValue(a.date) - dateValue(b.date)), [ticker.priceHistory]);
	  const hideUnverifiedValuation = ticker.dataQuality?.valuationCoverageKind === "unsupported";
	  const valuationPoints = useMemo(() => (ticker.history || [])
	    .filter(() => !hideUnverifiedValuation)
	    .filter((point) => point.asOfDate && Number.isFinite(point.fairValue))
	    .map((point) => ({
      date: point.asOfDate,
      close: point.fairValue,
      priceAtDate: point.priceAtDate,
      label: point.label,
      upsideDownside: point.upsideDownside,
      method: point.method,
      fiscalYear: point.fiscalYear,
	      fiscalQuarter: point.fiscalQuarter,
	      dataSnapshot: point.dataSnapshot
	    }))
	    .reduce((rows, point) => {
	      const existingIndex = rows.findIndex((row) => row.date === point.date);
	      if (existingIndex === -1) return [...rows, point];
	      const existing = rows[existingIndex];
	      const next = chartValuationPointPriority(point) > chartValuationPointPriority(existing) ? point : existing;
	      return rows.map((row, index) => index === existingIndex ? next : row);
	    }, [])
	    .sort((a, b) => dateValue(a.date) - dateValue(b.date)), [ticker.history, hideUnverifiedValuation]);
	  const fallbackPricePoints = useMemo(() => (ticker.history || [])
	    .filter((point) => point.asOfDate && Number.isFinite(point.priceAtDate))
	    .map((point) => ({ date: point.asOfDate, close: point.priceAtDate, anchor: true }))
	    .sort((a, b) => dateValue(a.date) - dateValue(b.date)), [ticker.history]);
	  const hasDailyPriceLine = pricePoints.length >= 120 && ticker.dataQuality?.priceDisplayMode !== "as-of-price-anchors";
	  const chartPricePoints = hasDailyPriceLine ? pricePoints : [];
	  const priceAnchorPoints = hasDailyPriceLine ? [] : fallbackPricePoints;
	  const tooltipPricePoints = hasDailyPriceLine ? pricePoints : fallbackPricePoints;
	  const allPoints = [...chartPricePoints, ...valuationPoints, ...priceAnchorPoints]
	    .filter((point) => point.date && Number.isFinite(point.close))
	    .sort((a, b) => dateValue(a.date) - dateValue(b.date));
	  const chart = makeChartModel(allPoints, width, height, padding);

  if (!chart) {
    return <div className="chart-empty">{t("valuation.emptyChart")}</div>;
  }

	  const priceLine = linePath(chartPricePoints, chart.xScale, chart.yScale);
	  const gridValues = chartGridValues(chart.minY, chart.maxY);
	  const innerWidth = width - padding.left - padding.right;
	  const innerHeight = height - padding.top - padding.bottom;
	  const barWidth = valuationBarWidth(valuationPoints, chart, innerWidth);
	  const hoverModel = hover ? makeValuationHoverModel({
	    hoverX: hover.x,
	    chart,
	    pricePoints: tooltipPricePoints,
	    valuationPoints,
	    ticker,
	    width,
	    height,
	    padding,
	    hasDailyPriceLine
	  }) : null;

  function handlePointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const y = ((event.clientY - rect.top) / rect.height) * height;
    setHover({
      x: Math.max(padding.left, Math.min(width - padding.right, x)),
      y: Math.max(padding.top, Math.min(height - padding.bottom, y))
    });
  }

  return (
    <svg className="price-chart valuation-chart interactive-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${ticker.ticker} valuation chart`}>
      <rect className="chart-bg" x="0" y="0" width={width} height={height} />
      {gridValues.map((value) => (
        <g key={value}>
          <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={chart.yScale(value)} y2={chart.yScale(value)} />
          <text className="chart-axis-label" x={padding.left - 10} y={chart.yScale(value) + 4} textAnchor="end">
            {valuationCurrency(value, ticker.currency)}
          </text>
        </g>
      ))}
      {valuationPoints.map((point) => {
        const x = chart.xScale(point.date);
        const y = chart.yScale(point.close);
        const active = hoverModel?.valuation?.date === point.date;
        return (
          <rect
            className={`valuation-bar ${active ? "active" : ""}`}
            key={`${point.date}-${point.label}`}
            x={x - barWidth / 2}
            y={y}
            width={barWidth}
            height={Math.max(2, padding.top + innerHeight - y)}
            rx="2"
          />
        );
	      })}
	      {priceAnchorPoints.map((point) => (
	        <circle
	          className="valuation-price-anchor"
	          key={`price-anchor-${point.date}`}
	          cx={chart.xScale(point.date)}
	          cy={chart.yScale(point.close)}
	          r="3.3"
	        />
	      ))}
	      {priceLine ? <path className="price-line" d={priceLine} /> : null}
	      {hoverModel ? <ValuationChartHover model={hoverModel} chart={chart} ticker={ticker} padding={padding} height={height} /> : null}
      <text className="chart-axis-label" x={padding.left} y={height - 12}>
        {formatDate(allPoints[0]?.date)}
      </text>
      <text className="chart-axis-label" x={width - padding.right} y={height - 12} textAnchor="end">
        {formatDate(allPoints.at(-1)?.date)}
      </text>
	      <g className="valuation-legend">
	        {valuationPoints.length ? (
	          <>
	            <rect x={width - 204} y={17} width="12" height="12" rx="2" />
	            <text x={width - 186} y={28}>Fair value</text>
	          </>
	        ) : null}
	        {hasDailyPriceLine ? <line x1={width - 104} x2={width - 76} y1={24} y2={24} /> : <circle className="valuation-price-anchor" cx={width - 90} cy={24} r="3.3" />}
	        <text x={width - 68} y={28}>{hasDailyPriceLine ? "Price" : t("valuation.priceAnchors")}</text>
	      </g>
      <rect
        className="chart-hover-target"
        x={padding.left}
        y={padding.top}
        width={innerWidth}
        height={innerHeight}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
      />
    </svg>
	  );
	}

function valuationBarWidth(points, chart, innerWidth) {
  if (points.length <= 1) return 14;
  const xs = [...new Set(points.map((point) => Math.round(chart.xScale(point.date) * 10) / 10))]
    .sort((left, right) => left - right);
  const gaps = [];
  for (let index = 1; index < xs.length; index += 1) {
    const gap = xs[index] - xs[index - 1];
    if (gap > 0) gaps.push(gap);
  }
  const minGap = gaps.length ? Math.min(...gaps) : innerWidth / Math.max(points.length, 1);
  return Math.max(4, Math.min(18, minGap * 0.54));
}

function chartValuationPointPriority(point) {
  const label = String(point.label || "").toLowerCase();
  const text = label;
  let score = 0;
  if (/q[1-4]/.test(label) || point.fiscalQuarter) score += 20;
  if (/fy\d{2,4}/.test(label)) score += 8;
  if (label.includes("market snapshot")) score -= 16;
  if (/(q[1-4]|fy\d{2,4})e\b/.test(text) || /estimate|estimated|consensus|forecast/.test(text)) score -= 8;
  const yearMatch = text.match(/(?:fy)?(20\d{2}|\d{2})/);
  if (yearMatch) {
    const year = Number(yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]);
    if (Number.isFinite(year)) score += (year - 2000) / 100;
  }
  const quarterMatch = text.match(/q([1-4])/);
  if (quarterMatch) score += Number(quarterMatch[1]) / 10;
  if (Number.isFinite(point.priceAtDate) && point.priceAtDate > 0) score += 4;
  return score;
}

function nearestChartPointWithDistance(points, target) {
  const point = nearestChartPointByTime(points, target);
  if (!point) return null;
  return { point, distance: Math.abs(dateValue(point.date) - target) };
}

	function makeValuationHoverModel({ hoverX, chart, pricePoints, valuationPoints, ticker, width, height, padding, hasDailyPriceLine }) {
	  const innerWidth = width - padding.left - padding.right;
	  const xPct = innerWidth ? (hoverX - padding.left) / innerWidth : 0;
	  const targetTime = chart.minX + Math.max(0, Math.min(1, xPct)) * (chart.maxX - chart.minX);
	  const dayMs = 24 * 60 * 60 * 1000;
	  const valuationTolerance = Math.max(10 * dayMs, Math.min(62 * dayMs, (chart.maxX - chart.minX) / Math.max(valuationPoints.length * 2.2, 1)));
	  const priceTolerance = hasDailyPriceLine ? 8 * dayMs : valuationTolerance;
	  const valuationCandidate = nearestChartPointWithDistance(valuationPoints, targetTime);
	  const valuation = valuationCandidate && valuationCandidate.distance <= valuationTolerance ? valuationCandidate.point : null;
	  const priceTarget = valuation ? dateValue(valuation.date) : targetTime;
	  const priceCandidate = nearestChartPointWithDistance(pricePoints, priceTarget);
	  const firstPriceTime = dateValue(pricePoints[0]?.date);
	  const lastPriceTime = dateValue(pricePoints.at(-1)?.date);
	  const targetInsidePriceLine = hasDailyPriceLine && targetTime >= firstPriceTime && targetTime <= lastPriceTime;
	  let price = !valuation && targetInsidePriceLine
	    ? priceCandidate?.point || null
	    : priceCandidate && priceCandidate.distance <= priceTolerance ? priceCandidate.point : null;
	  if (!price && !valuation && priceCandidate) {
	    price = priceCandidate.point;
	  }
	  if (!price && valuation && Number.isFinite(valuation.priceAtDate)) {
	    price = { date: valuation.date, close: valuation.priceAtDate, anchor: true };
	  }
	  const x = valuation ? chart.xScale(valuation.date) : price ? chart.xScale(price.date) : hoverX;
	  const rows = [];

	  if (price) rows.push({ label: "Price", value: valuationCurrency(price.close, ticker.currency), tone: "benchmark" });
  if (valuation) {
    rows.push({ label: `${valuation.label || "Fair value"}`, value: valuationCurrency(valuation.close, ticker.currency), tone: "portfolio" });
    const comparisonPrice = price?.close || valuation.priceAtDate;
    if (Number.isFinite(comparisonPrice) && comparisonPrice) {
      rows.push({ label: "Fair / price", value: formatReturnPct(valuation.close / comparisonPrice - 1) });
    }
  }

  const tooltipWidth = 178;
  const tooltipHeight = 44 + rows.length * 15;
  const tooltipX = x + tooltipWidth + 12 > width - padding.right ? x - tooltipWidth - 12 : x + 12;
  const tooltipY = Math.max(padding.top + 8, Math.min(height - padding.bottom - tooltipHeight, 36));

  return {
    x,
    price,
    valuation,
    rows,
    tooltip: {
      x: tooltipX,
      y: tooltipY,
      width: tooltipWidth,
	      height: tooltipHeight,
	      title: formatDate(valuation?.date || price?.date)
	    }
	  };
	}

function ValuationChartHover({ model, chart, ticker, padding, height }) {
  return (
    <g className="chart-hover-layer valuation-hover-layer">
      <line className="chart-hover-line" x1={model.x} x2={model.x} y1={padding.top} y2={height - padding.bottom} />
      {model.valuation ? (
        <circle
          className="chart-hover-dot portfolio"
          cx={chart.xScale(model.valuation.date)}
          cy={chart.yScale(model.valuation.close)}
          r="5"
        />
      ) : null}
      {model.price ? (
        <circle
          className="chart-hover-dot benchmark"
          cx={chart.xScale(model.price.date)}
          cy={chart.yScale(model.price.close)}
          r="4"
        />
      ) : null}
      <g className="chart-tooltip" transform={`translate(${model.tooltip.x} ${model.tooltip.y})`}>
        <rect width={model.tooltip.width} height={model.tooltip.height} rx="7" />
        <text className="chart-tooltip-title" x="10" y="17">{model.tooltip.title}</text>
        {model.rows.map((row, index) => (
          <g key={`${row.label}-${index}`} transform={`translate(10 ${34 + index * 15})`}>
            <text className={`chart-tooltip-row ${row.tone || ""}`} x="0" y="0">{row.label}</text>
            <text className="chart-tooltip-value" x={model.tooltip.width - 20} y="0" textAnchor="end">{row.value}</text>
          </g>
        ))}
        {model.valuation?.method ? (
          <text className="chart-tooltip-row" x="10" y={model.tooltip.height - 8}>
            {model.valuation.method.slice(0, 28)}
          </text>
        ) : null}
      </g>
    </g>
  );
}

function ValuationTable({ ticker, history }) {
  const { t } = useI18n();
  const unsupported = ticker.dataQuality?.valuationCoverageKind === "unsupported";
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>{t("valuation.tableTitle")}</h3>
          <p>{ticker.ticker} · {t("valuation.tableSub")}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("valuation.datePeriod")}</th>
              <th>Fair value</th>
              <th>{t("valuation.anchorPrice")}</th>
              <th>Upside</th>
              <th>3Y Target</th>
              <th>{t("valuation.method")}</th>
            </tr>
          </thead>
          <tbody>
            {(history || []).map((row) => (
              <tr key={`${row.periodId}-${row.asOfDate}-${row.label}`}>
                <td>
                  <strong>{formatDate(row.asOfDate)}</strong>
                  <span>{row.label || row.periodId}</span>
                </td>
                <td className="num">{unsupported ? "-" : valuationCurrency(row.fairValue, ticker.currency)}</td>
                <td className="num">{valuationCurrency(row.priceAtDate, ticker.currency)}</td>
                <td className={`num ${!unsupported && (row.upsideDownside || 0) >= 0 ? "positive-text" : "negative-text"}`}>{unsupported ? "-" : formatReturnPct(row.upsideDownside)}</td>
                <td className="num">{unsupported ? "-" : valuationCurrency(row.targetPrice3Y, ticker.currency)}</td>
                <td>{unsupported ? "unverified raw snapshot" : row.method || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ValuationMethodPanel({ ticker }) {
  const { t } = useI18n();
  const inputAudit = ticker.dataQuality?.modelInputAudit;
  const unifiedAudit = ticker.dataQuality?.unifiedValuationAudit;
  const unsupported = ticker.dataQuality?.valuationCoverageKind === "unsupported";
  const methodCards = unsupported ? [] : (ticker.methodCards || []);
  const assumptions = unsupported ? [] : (ticker.assumptions || []);
  return (
    <section className="table-panel valuation-method-panel">
      <div className="panel-head">
        <div>
          <h3>{t("valuation.methodTitle")}</h3>
          <p>{ticker.modelType || "legacy fundamental-analysis valuation model"}</p>
        </div>
      </div>
      <div className="valuation-method-grid">
        <div>
          <h4>Method cards</h4>
          <div className="valuation-chip-list">
            {methodCards.length ? methodCards.map((card) => (
              <div className="valuation-chip" key={card.key || card.label}>
                <strong>{card.label}</strong>
                <span>{card.format === "percent" ? formatPct(card.value) : valuationCurrency(card.value, ticker.currency)}</span>
                <small>{card.description}</small>
              </div>
            )) : <div className="empty-panel">{t("valuation.methodEmpty")}</div>}
          </div>
        </div>
        <div>
          {inputAudit ? (
            <>
              <h4>Input audit</h4>
              <div className="valuation-chip-list">
                <div className={`valuation-chip compact audit-${inputAudit.status || "review"}`}>
                  <strong>{String(inputAudit.status || "review").toUpperCase()}</strong>
                  <span>{inputAudit.fairValueInputPolicy || "financial-guidance-and-scenario-inputs"}</span>
                  <small>{inputAudit.priceUsage || "price used only for comparison"}</small>
                </div>
                <div className="valuation-chip compact">
                  <strong>Evidence</strong>
                  <span>{formatNumber(inputAudit.financialOrGuidanceEvidenceRows || 0)} / {formatNumber(inputAudit.valuationRows || 0)}</span>
                  <small>{inputAudit.sourceGrade || "event-financials-guidance"}</small>
                </div>
                <div className="valuation-chip compact">
                  <strong>Price-anchor signals</strong>
                  <span>{formatNumber(inputAudit.methodPriceAnchorSignalCount || 0)}</span>
                  <small>{Number.isFinite(inputAudit.fairValuePriceCorrelation) ? `fair/price corr ${inputAudit.fairValuePriceCorrelation.toFixed(2)}` : "not enough history"}</small>
                </div>
              </div>
            </>
          ) : null}
          {unifiedAudit ? (
            <>
              <h4>Unified QA</h4>
              <div className="valuation-chip-list">
                <div className={`valuation-chip compact audit-${unifiedAudit.status || "review"}`}>
                  <strong>{String(unifiedAudit.status || "review").toUpperCase()}</strong>
                  <span>{unifiedAudit.externalConsensusCheck?.status || "no consensus"}</span>
                  <small>{unifiedAudit.framework || "Unified valuation sanity loop"}</small>
                </div>
                <div className="valuation-chip compact">
                  <strong>Consensus target</strong>
                  <span>{valuationCurrency(unifiedAudit.externalConsensus?.averageTarget, ticker.currency)}</span>
                  <small>{Number.isFinite(unifiedAudit.externalConsensusCheck?.fairToConsensus) ? `fair / consensus ${formatReturnPct(unifiedAudit.externalConsensusCheck.fairToConsensus - 1)}` : unifiedAudit.externalConsensusCheck?.message || "not available"}</small>
                </div>
                <div className="valuation-chip compact">
                  <strong>Stability</strong>
                  <span>{Number.isFinite(unifiedAudit.stability?.maxAbsFairValueStep) ? formatReturnPct(unifiedAudit.stability.maxAbsFairValueStep) : "-"}</span>
                  <small>max fair-value step · {formatNumber(unifiedAudit.stability?.rows || 0)} rows</small>
                </div>
              </div>
            </>
          ) : null}
          <h4>Assumptions</h4>
          <div className="valuation-chip-list">
            {assumptions.slice(0, 8).map((item) => (
              <div className="valuation-chip compact" key={item.key}>
                <strong>{item.label || item.key}</strong>
                <span>{item.format === "percent" ? formatPct(item.value) : item.format === "multiple" ? `${formatNumber(item.value)}x` : formatNumber(item.value)}</span>
                <small>{item.category || item.source || item.description}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="valuation-note">
        {t("valuation.note")}
      </div>
    </section>
  );
}

const dbmfAssetColors = ["#356d9b", "#16784f", "#9b6b23", "#6b5aa8", "#b33b38", "#394645", "#5b8f7b"];

function formatExposure(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatWeight(value) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

function dbmfDateOptions(data) {
  return (data?.registry?.snapshots || [])
    .map((snapshot) => snapshot.date)
    .filter(Boolean)
    .sort((a, b) => dateValue(b) - dateValue(a));
}

function buildDbmfModel(data, selectedDate, compareDate, sortBy) {
  const snapshots = new Map((data?.snapshots || []).map((snapshot) => [snapshot.date, snapshot]));
  const selectedSnapshot = snapshots.get(selectedDate) || data?.snapshots?.at(-1) || null;
  const compareSnapshot = snapshots.get(compareDate) || null;
  const selectedAssets = selectedSnapshot?.assets || [];
  const compareAssets = compareSnapshot?.assets || [];
  const compareMap = new Map(compareAssets.map((row) => [row.assetKey, row]));

  const mergedRows = selectedAssets.map((row) => {
    const previous = compareMap.get(row.assetKey);
    const previousExposure = previous?.exposure ?? null;
    const delta = Number.isFinite(row.exposure) && Number.isFinite(previousExposure)
      ? row.exposure - previousExposure
      : row.delta;
    return {
      ...row,
      previousExposure,
      delta: Number.isFinite(delta) ? delta : null
    };
  });

  const sorters = {
    exposure: (a, b) => Math.abs(b.exposure || 0) - Math.abs(a.exposure || 0),
    delta: (a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0),
    risk: (a, b) => (b.riskShare || 0) - (a.riskShare || 0),
    market: (a, b) => Math.abs(b.marketValue || 0) - Math.abs(a.marketValue || 0)
  };
  const rows = [...mergedRows].sort(sorters[sortBy] || sorters.exposure);
  const riskRows = rows.filter((row) => !["cash", "other"].includes(row.assetKey));
  const topLong = riskRows.reduce((best, row) => (!best || (row.exposure || 0) > (best.exposure || 0) ? row : best), null);
  const topShort = riskRows.reduce((best, row) => (!best || (row.exposure || 0) < (best.exposure || 0) ? row : best), null);
  const netDirectionalChange = riskRows.reduce((sum, row) => sum + (Number.isFinite(row.delta) ? row.delta : 0), 0);
  const increased = riskRows.filter((row) => (row.delta || 0) > 0.001).length;
  const decreased = riskRows.filter((row) => (row.delta || 0) < -0.001).length;
  const signFlips = riskRows.filter((row) => {
    if (!Number.isFinite(row.previousExposure) || !Number.isFinite(row.exposure)) return false;
    return Math.sign(row.previousExposure) !== 0 && Math.sign(row.exposure) !== 0 && Math.sign(row.previousExposure) !== Math.sign(row.exposure);
  }).length;

  return {
    selectedSnapshot,
    compareSnapshot,
    rows,
    riskRows,
    topLong,
    topShort,
    netDirectionalChange,
    increased,
    decreased,
    signFlips,
    totalNetAssets: selectedSnapshot?.meta?.totalNetAssets || data?.summary?.total_net_assets || 0,
    rawHoldings: selectedSnapshot?.holdings || []
  };
}

function DbmfWorkspace({ data, loading, error }) {
  const { t } = useI18n();
  const [selectedDate, setSelectedDate] = useState("");
  const [compareDate, setCompareDate] = useState("");
  const [sortBy, setSortBy] = useState("exposure");
  const dates = useMemo(() => dbmfDateOptions(data), [data]);

  useEffect(() => {
    if (!dates.length) return;
    const latest = data?.summary?.latest_date || dates[0];
    const previous = data?.summary?.previous_date || dates[1] || dates[0];
    if (!selectedDate || !dates.includes(selectedDate)) setSelectedDate(latest);
    if (!compareDate || !dates.includes(compareDate)) setCompareDate(previous);
  }, [compareDate, data?.summary?.latest_date, data?.summary?.previous_date, dates, selectedDate]);

  const model = useMemo(() => buildDbmfModel(data, selectedDate, compareDate, sortBy), [data, selectedDate, compareDate, sortBy]);

  if (loading && !data) {
    return (
      <section className="dbmf-shell">
        <div className="command-deck loading-block" />
        <div className="table-panel loading-table" />
      </section>
    );
  }

  return (
    <>
      {error ? <ErrorBanner error={error} /> : null}
      <DbmfCommandDeck data={data} model={model} loading={loading} />

      <section className="dbmf-shell">
        <section className="dbmf-toolbar">
          <div>
            <span className="deck-kicker">
              <Radar size={15} />
              {t("dbmf.dashboard")}
            </span>
            <h2>{t("dbmf.toolbarTitle")}</h2>
          </div>
          <div className="dbmf-controls">
            <DbmfSelect label={t("dbmf.currentDate")} value={selectedDate} onChange={setSelectedDate} options={dates} />
            <DbmfSelect label={t("dbmf.compareDate")} value={compareDate} onChange={setCompareDate} options={dates.filter((date) => date !== selectedDate)} />
            <DbmfSelect
              label={t("dbmf.sort")}
              value={sortBy}
              onChange={setSortBy}
              options={[
                ["exposure", t("dbmf.sort.exposure")],
                ["delta", t("dbmf.sort.delta")],
                ["risk", t("dbmf.sort.risk")],
                ["market", t("dbmf.sort.market")]
              ]}
            />
          </div>
        </section>

        <section className="profile-band dbmf-profile">
          <div className="profile-main">
            <div className="identity-stack">
              <span className="type-chip">{t("dbmf.holdingsType")}</span>
              <h2>DBMF Managed Futures</h2>
              <p>{t("dbmf.profileSub")}</p>
            </div>
            <div className="profile-meta">
              <span>{model.rawHoldings.length} 条官方持仓 · {data?.registry?.snapshot_count || dates.length} 个历史 snapshot</span>
              {data?.source?.officialUrl ? (
                <a href={data.source.officialUrl} target="_blank" rel="noreferrer">
                  iMGP official holdings
                  <ExternalLink size={14} />
                </a>
              ) : null}
            </div>
          </div>
          <div className="metric-grid">
            <MetricBox metric={{ label: t("dbmf.snapshot"), value: formatDate(selectedDate), sub: model.selectedSnapshot?.meta?.sourceFile || "-", icon: CalendarDays }} />
            <MetricBox metric={{ label: t("dbmf.totalAssets"), value: formatMoney(model.totalNetAssets), sub: "Total net assets", icon: Wallet }} />
            <MetricBox metric={{ label: t("dbmf.topLong"), value: model.topLong?.assetName || "-", sub: formatExposure(model.topLong?.exposure), tone: "positive", icon: ArrowUpRight }} />
            <MetricBox metric={{ label: t("dbmf.topShort"), value: model.topShort?.assetName || "-", sub: formatExposure(model.topShort?.exposure), tone: "negative", icon: ArrowDownRight }} />
          </div>
        </section>

        <section className="insight-deck">
          <div className="insight-item primary">
          <div className="insight-icon"><TrendingUp size={17} /></div>
            <span>{t("dbmf.primaryRead")}</span>
            <strong>{model.topShort && model.topLong ? `${model.topShort.assetName} ${t("dbmf.short")} / ${model.topLong.assetName} ${t("dbmf.long")}` : t("dbmf.waiting")}</strong>
          </div>
          <div className="insight-item">
            <div className="insight-icon"><BarChart3 size={17} /></div>
            <span>{t("dbmf.flowBalance")}</span>
            <strong>{formatExposure(model.netDirectionalChange)} {t("dbmf.netDirection")}</strong>
          </div>
          <div className="insight-item">
            <div className="insight-icon"><Filter size={17} /></div>
            <span>{t("dbmf.rebalance")}</span>
            <strong>{model.increased} {t("dbmf.upDownFlip").replace("{down}", model.decreased).replace("{flip}", model.signFlips)}</strong>
          </div>
        </section>

        <nav className="tab-row dbmf-anchor-row" aria-label="dbmf sections">
          <a href="#dbmf-exposure">{t("dbmf.assetExposure")}</a>
          <a href="#dbmf-holdings">{t("dbmf.officialHoldings")}</a>
          <a href="#dbmf-history">{t("dbmf.historyCurve")}</a>
          <a href="#dbmf-notes">{t("dbmf.notes")}</a>
        </nav>

        <div className="dbmf-panel-stack">
          <div id="dbmf-exposure">
            <DbmfExposureTable rows={model.rows} selectedDate={selectedDate} compareDate={compareDate} />
          </div>
          <div id="dbmf-holdings">
            <DbmfHoldingsTable rows={model.rawHoldings} selectedDate={selectedDate} />
          </div>
          <div id="dbmf-history">
            <DbmfHistoryPanel data={data} rows={model.riskRows} />
          </div>
          <div id="dbmf-notes">
            <DbmfNotes data={data} />
          </div>
        </div>
      </section>
    </>
  );
}

function DbmfSelect({ label, value, onChange, options }) {
  const normalized = (options || []).map((option) => Array.isArray(option) ? option : [option, formatDate(option)]);
  return (
    <label className="dbmf-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {normalized.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function DbmfCommandDeck({ data, model, loading }) {
  const { t } = useI18n();
  const maxAbsExposure = Math.max(...(model.rows || []).map((row) => Math.abs(row.exposure || 0)), 1);
  const changeRows = [...(model.riskRows || [])]
    .filter((row) => Number.isFinite(row.delta))
    .sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0))
    .slice(0, 7);

  return (
    <section className="command-deck">
      <div className="deck-head">
        <div>
          <span className="deck-kicker">
            <Gauge size={15} />
            Managed futures cockpit
          </span>
          <h2>{t("dbmf.dashboard")}</h2>
        </div>
        <div className={`bias-chip ${(model.netDirectionalChange || 0) >= 0 ? "positive" : "negative"}`}>
          {(model.netDirectionalChange || 0) >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span>{formatExposure(model.netDirectionalChange || 0)} net change</span>
        </div>
      </div>

      <div className="command-grid dbmf-command-grid">
        <section className="terminal-panel stat-panel">
          <div className="panel-title">
            <Gauge size={16} />
            Snapshot
          </div>
          <div className="terminal-stats">
            <TerminalStat icon={CalendarDays} label={t("dbmf.currentDate")} value={formatDate(data?.summary?.latest_date)} sub="official holdings" />
            <TerminalStat icon={Layers} label={t("dbmf.historyCurve")} value={formatNumber(data?.registry?.snapshot_count || 0)} sub="local DBMF history" />
            <TerminalStat icon={Wallet} label={t("dbmf.totalAssets")} value={formatMoney(model.totalNetAssets || 0)} sub="total net assets" />
            <TerminalStat icon={Activity} label={t("dbmf.assetExposure")} value={formatNumber(data?.summary?.asset_count || 0)} sub="normalized buckets" />
          </div>
        </section>

        <section className="terminal-panel signal-panel">
          <div className="panel-title">
            <Crosshair size={16} />
            Current exposure
          </div>
          <div className="dbmf-mini-list">
            {loading && !model.rows?.length ? <SignalSkeleton /> : model.rows.slice(0, 8).map((row) => (
              <DbmfFlowRow key={row.assetKey} row={row} value={row.exposure} maxValue={maxAbsExposure} />
            ))}
          </div>
        </section>

        <section className="terminal-panel exposure-panel">
          <div className="panel-title">
            <LineChart size={16} />
            Biggest changes
          </div>
          <div className="dbmf-mini-list">
            {changeRows.map((row) => (
              <DbmfFlowRow key={`delta-${row.assetKey}`} row={row} value={row.delta} maxValue={0.4} mode="delta" />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function DbmfFlowRow({ row, value, maxValue, mode = "exposure" }) {
  const width = Math.max(6, Math.min(100, (Math.abs(value || 0) / maxValue) * 100));
  const tone = (value || 0) >= 0 ? "positive" : "negative";
  return (
    <div className="dbmf-flow-row">
      <div className="dbmf-flow-copy">
        <strong>{row.assetName}</strong>
        <span>{mode === "delta" ? "change vs compare" : `${row.componentCount || 0} components`}</span>
      </div>
      <div className={`dbmf-flow-meter ${tone}`}>
        <span style={{ width: `${width}%` }} />
      </div>
      <strong className={tone === "positive" ? "up" : "down"}>{formatExposure(value)}</strong>
    </div>
  );
}

function DbmfExposureTable({ rows, selectedDate, compareDate }) {
  const maxAbs = Math.max(...(rows || []).map((row) => Math.abs(row.exposure || 0)), 1);
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>资产敞口</h3>
          <p>{formatDate(selectedDate)} vs {formatDate(compareDate)} · 按所选规则排序</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="dbmf-table">
          <thead>
            <tr>
              <th>资产</th>
              <th>敞口条</th>
              <th className="num">当前敞口</th>
              <th className="num">对比敞口</th>
              <th className="num">变化</th>
              <th className="num">风险占比</th>
              <th className="num">市值</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.assetKey}>
                <td><HoldingName item={{ ticker: row.assetName, issuer: row.assetKey }} /></td>
                <td><DbmfCenteredBar value={row.exposure} maxAbs={maxAbs} /></td>
                <td className={`num ${(row.exposure || 0) >= 0 ? "up" : "down"}`}>{formatExposure(row.exposure)}</td>
                <td className={`num ${(row.previousExposure || 0) >= 0 ? "up" : "down"}`}>{formatExposure(row.previousExposure)}</td>
                <td className={`num ${(row.delta || 0) >= 0 ? "up" : "down"}`}>{formatExposure(row.delta)}</td>
                <td className="num">{formatPct(row.riskShare)}</td>
                <td className="num">{formatMoney(row.marketValue || 0)}</td>
              </tr>
            )) : (
              <tr><td colSpan="7" className="empty-cell">暂无 DBMF 敞口数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DbmfCenteredBar({ value, maxAbs }) {
  const width = Math.max(5, Math.min(50, (Math.abs(value || 0) / maxAbs) * 50));
  const positive = (value || 0) >= 0;
  return (
    <div className="dbmf-centered-bar">
      <span className="midline" />
      <span
        className={`fill ${positive ? "positive" : "negative"}`}
        style={positive ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
      />
    </div>
  );
}

function DbmfHoldingsTable({ rows, selectedDate }) {
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>官方持仓</h3>
          <p>{formatDate(selectedDate)} · 来自 iMGP 页面，已写入本地数据库</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>Security Name</th>
              <th>CUSIP</th>
              <th>Ticker</th>
              <th className="num">Shares Qty</th>
              <th className="num">Market Value</th>
              <th className="num">Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.date)}</td>
                <td><HoldingName item={{ ticker: row.securityName, issuer: row.assetName }} /></td>
                <td>{row.cusip || "-"}</td>
                <td>{row.ticker || "-"}</td>
                <td className="num">{formatNumber(row.shares || 0)}</td>
                <td className="num">{formatMoney(row.marketValue || 0)}</td>
                <td className={`num ${(row.weight || 0) >= 0 ? "up" : "down"}`}>{formatWeight(row.weight)}</td>
              </tr>
            )) : (
              <tr><td colSpan="7" className="empty-cell">暂无官方持仓明细</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DbmfHistoryPanel({ data, rows }) {
  const focusRows = [...(rows || [])]
    .filter((row) => !["cash", "other"].includes(row.assetKey))
    .sort((a, b) => Math.abs(b.exposure || 0) - Math.abs(a.exposure || 0))
    .slice(0, 7);

  return (
    <section className="chart-panel dbmf-history-panel">
      <div className="chart-head">
        <div>
          <span>historical exposure</span>
          <h3>DBMF 资产敞口历史曲线</h3>
        </div>
        <strong>{formatNumber(data?.history?.records?.length || 0)} records</strong>
      </div>
      <DbmfHistoryChart records={data?.history?.records || []} focusRows={focusRows} />
    </section>
  );
}

function DbmfHistoryChart({ records, focusRows }) {
  const width = 1180;
  const height = 360;
  const padding = { top: 22, right: 24, bottom: 38, left: 62 };
  const dates = [...new Set(records.map((record) => record.date).filter(Boolean))].sort((a, b) => dateValue(a) - dateValue(b));
  const keys = focusRows.map((row) => row.assetKey);
  const filtered = records.filter((record) => keys.includes(record.asset_key));
  const values = filtered.map((record) => record.exposure).filter(Number.isFinite);

  if (!dates.length || !values.length) {
    return <div className="chart-empty">暂无历史曲线数据</div>;
  }

  const minX = dateValue(dates[0]);
  const maxX = dateValue(dates[dates.length - 1]);
  const minY = Math.min(-1, Math.min(...values) - 0.08);
  const maxY = Math.max(1, Math.max(...values) + 0.08);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xScale = (date) => padding.left + ((dateValue(date) - minX) / Math.max(1, maxX - minX)) * innerWidth;
  const yScale = (value) => padding.top + (1 - ((value - minY) / Math.max(1e-9, maxY - minY))) * innerHeight;
  const zeroY = yScale(0);

  return (
    <div className="dbmf-history-wrap">
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="DBMF historical exposure">
        <rect className="chart-bg" x="0" y="0" width={width} height={height} />
        {[-1, -0.5, 0, 0.5, 1].map((value) => (
          <g key={value}>
            <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={yScale(value)} y2={yScale(value)} />
            <text className="chart-axis-label" x={padding.left - 10} y={yScale(value) + 4} textAnchor="end">
              {formatExposure(value)}
            </text>
          </g>
        ))}
        <line className="dbmf-zero-line" x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} />
        {keys.map((key, index) => {
          const series = records
            .filter((record) => record.asset_key === key && Number.isFinite(record.exposure))
            .sort((a, b) => dateValue(a.date) - dateValue(b.date));
          const path = series.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${xScale(point.date).toFixed(2)} ${yScale(point.exposure).toFixed(2)}`).join(" ");
          return <path className="dbmf-history-line" d={path} stroke={dbmfAssetColors[index % dbmfAssetColors.length]} key={key} />;
        })}
        <text className="chart-axis-label" x={padding.left} y={height - 12}>{formatDate(dates[0])}</text>
        <text className="chart-axis-label" x={width - padding.right} y={height - 12} textAnchor="end">{formatDate(dates.at(-1))}</text>
      </svg>
      <div className="dbmf-legend">
        {focusRows.map((row, index) => (
          <span key={row.assetKey}>
            <i style={{ background: dbmfAssetColors[index % dbmfAssetColors.length] }} />
            {row.assetName}
          </span>
        ))}
      </div>
    </div>
  );
}

function DbmfNotes({ data }) {
  return (
    <section className="notes-grid">
      <div className="note-block">
        <h3>数据口径</h3>
        <p>DBMF 的官方持仓表按日披露具体期货、T-bills 与总资产；本平台把这些行按资产桶聚合，保留多空方向、市场价值、风险占比和相对上一期变化。</p>
        <p>现金/T-bills 会进入总敞口表，但不计入非现金风险占比；期货敞口可以大于或小于 ETF 净资产，因此这里看的是方向和杠杆化敞口，不是普通股票组合权重。</p>
      </div>
      <div className="note-block">
        <h3>来源链接</h3>
        {data?.source?.officialUrl ? (
          <a href={data.source.officialUrl} target="_blank" rel="noreferrer">
            iMGP 官方 DBMF 持仓页 <ExternalLink size={14} />
          </a>
        ) : null}
        <p>本地 processed 路径：{data?.source?.processedPath || "-"}</p>
        <p>SQLite 缓存：{data?.cache?.database || "-"}</p>
      </div>
    </section>
  );
}

function ErrorBanner({ error }) {
  return (
    <div className="error-banner">
      <ShieldAlert size={18} />
      <span>{error}</span>
    </div>
  );
}

function DataStatusBanner({ guru }) {
  const status = guru.dataStatus;
  if (!status && guru.status !== "rate_limited") return null;

  const state = status?.status || guru.status;
  const stale = state === "stale" || state === "local-db";
  const missing = state === "local_missing";
  const limited = state === "rate_limited";
  const message = status?.message || "SEC archive is temporarily rate-limiting requests. Wait a few minutes, then refresh.";
  const title = missing
    ? "本地数据库暂无快照"
    : stale
      ? "正在使用本地数据库"
      : limited
        ? "SEC 官方接口正在限流"
        : "数据源状态";

  return (
    <div className={`data-status-banner ${limited || missing ? "limited" : "stale"}`}>
      <ShieldAlert size={18} />
      <div>
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
    </div>
  );
}

function CommandDeck({ loading, model, activeGuruId, onSelectGuru }) {
  const { t } = useI18n();
  const stats = model?.stats || {};
  const maxExposure = Math.max(...(model?.exposures || []).map((item) => item.value), 1);
  const biasPositive = (stats.netBias || 0) >= 0;

  return (
    <section className="command-deck">
      <div className="deck-head">
        <div>
          <span className="deck-kicker">
            <Radar size={15} />
            {t("guru.deck.kicker")}
          </span>
          <h2>{t("guru.deck.title")}</h2>
        </div>
        <div className={`bias-chip ${biasPositive ? "positive" : "negative"}`}>
          {biasPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span>{biasPositive ? t("guru.bias.positive") : t("guru.bias.negative")}</span>
        </div>
      </div>

      <div className="command-grid">
        <section className="terminal-panel stat-panel">
          <div className="panel-title">
            <Gauge size={16} />
            {t("guru.coverage")}
          </div>
          <div className="terminal-stats">
            <TerminalStat icon={Layers} label={t("guru.monitored")} value={formatNumber(stats.gurus || 0)} sub="guru universe" />
            <TerminalStat icon={Wallet} label={t("guru.aum")} value={formatMoney(stats.total13fValue || 0)} sub="live 13F AUM" />
            <TerminalStat icon={Activity} label={t("guru.recentTrades")} value={formatNumber(stats.totalTransactions || 0)} sub="Form 4 / STOCK" />
            <TerminalStat icon={LineChart} label={t("guru.signalSpread")} value={`${(stats.netBias || 0) > 0 ? "+" : ""}${formatNumber(stats.netBias || 0)}`} sub="buy minus sell" />
          </div>
        </section>

        <section className="terminal-panel signal-panel">
          <div className="panel-title">
            <Sparkles size={16} />
            {t("guru.latestTape")}
          </div>
          <div className="signal-list">
            {loading ? (
              <SignalSkeleton />
            ) : (
              model.signals.map((signal) => (
                <button
                  className={`signal-row ${activeGuruId === signal.guruId ? "active" : ""}`}
                  key={`${signal.guruId}-${signal.ticker}-${signal.date}-${signal.action}-${signal.detail}`}
                  onClick={() => onSelectGuru(signal.guruId)}
                >
                  <div className={`signal-marker ${signal.tone || ""}`} />
                  <div className="signal-main">
                    <strong>{signal.ticker}</strong>
                    <span>{signal.guruName} · {signal.type} · {actionLabels[signal.action] || signal.action}</span>
                  </div>
                  <div className="signal-meta">
                    <strong>{signal.value ? formatMoney(signal.value) : signal.detail || "-"}</strong>
                    <span>{formatDate(signal.date)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="terminal-panel exposure-panel">
          <div className="panel-title">
            <Crosshair size={16} />
            {t("guru.heatmap")}
            <small>{t("guru.heatmapNote")}</small>
          </div>
          <div className="exposure-list">
            {(model.exposures || []).length ? (model.exposures || []).map((item) => (
              <div className="exposure-row" key={item.ticker}>
                <div className="exposure-copy">
                  <strong>{item.ticker}</strong>
                  <span>{item.guruCount} 位 · {item.guruNames}</span>
                </div>
                <div className="exposure-meter" aria-label={`${item.ticker} exposure`}>
                  <span style={{ width: `${Math.max(8, Math.min(100, (item.value / maxExposure) * 100))}%` }} />
                </div>
                <div className="exposure-value">{formatMoney(item.value || 0)}</div>
              </div>
            )) : (
              <div className="empty-panel">{t("guru.noConsensus")}</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function TerminalStat({ icon: Icon, label, value, sub }) {
  return (
    <div className="terminal-stat">
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function SignalSkeleton() {
  return Array.from({ length: 5 }).map((_, index) => (
    <div className="signal-row loading-signal" key={index}>
      <div className="signal-marker" />
      <div className="skeleton-lines">
        <span />
        <span />
      </div>
    </div>
  ));
}

function GuruButton({ guru, active, onClick }) {
  const { t } = useI18n();
  const metric = guru.type === "manager13f"
    ? formatMoney(guru.summary?.totalValue || 0)
    : `${formatNumber(guru.summary?.recentTransactions || 0)} ${t("guru.transactions")}`;
  const subtitle = guru.type === "manager13f"
    ? `${formatNumber(guru.summary?.totalPositions || 0)} ${t("guru.holdings")}`
    : guru.summary?.latestTicker || guru.focusTicker || guru.disclosureKind;
  const score = Math.round(guruSignalScore(guru));

  return (
    <button className={`guru-card ${active ? "active" : ""}`} onClick={onClick}>
      <div className="guru-avatar">{guru.name.slice(0, 1)}</div>
      <div className="guru-copy">
        <div className="guru-name-row">
          <strong>{guru.name}</strong>
          <span className="mini-badge">{disclosureLabels[guru.type]}</span>
          {guru.simulationTag ? <span className={`mini-badge sim ${guru.simulationTag.tone || ""}`}>{guru.simulationTag.label}</span> : null}
        </div>
        <span>{latestSignalLabel(guru)}</span>
      </div>
      <div className="guru-metric">
        <strong>{metric}</strong>
        <span>{subtitle}</span>
        <small>S{score}</small>
      </div>
    </button>
  );
}

function GuruDetail({ guru }) {
  const { t } = useI18n();
  const [tab, setTab] = useState(guru.type === "manager13f" ? "holdings" : "transactions");

  useEffect(() => {
    setTab(guru.type === "manager13f" ? "holdings" : "transactions");
  }, [guru.id, guru.type]);

  const metrics = guru.type === "manager13f"
    ? managerMetrics(guru)
    : guru.type === "congress"
      ? congressMetrics(guru)
      : insiderMetrics(guru);
  const profileUrl = guru.secCompanyUrl || guru.profileUrl;
  const profileLabel = guru.secCompanyUrl ? `CIK ${guru.cik}` : guru.sourceLabel || guru.disclosureKind;

  return (
    <div className="detail-content">
      <section className="profile-band">
        <div className="profile-main">
          <div className="identity-stack">
            <span className="type-chip">{disclosureLabels[guru.type]}</span>
            {guru.simulationTag ? <span className={`type-chip sim ${guru.simulationTag.tone || ""}`}>{guru.simulationTag.label}</span> : null}
            <h2>{guru.name}</h2>
            <p>{guru.chineseName} · {guru.entityName}</p>
          </div>
          <div className="profile-meta">
            <span>{guru.thesisTag}</span>
            {profileUrl ? (
              <a href={profileUrl} target="_blank" rel="noreferrer">
                {profileLabel}
                <ExternalLink size={14} />
              </a>
            ) : null}
          </div>
        </div>
        <div className="metric-grid">
          {metrics.map((metric) => (
            <MetricBox key={metric.label} metric={metric} />
          ))}
        </div>
      </section>

      <InsightDeck guru={guru} />

      <nav className="tab-row" aria-label="detail tabs">
        {guru.type === "manager13f" ? (
          <>
            <TabButton active={tab === "holdings"} onClick={() => setTab("holdings")}>
              {t("guru.tab.holdings")}
            </TabButton>
            <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
              {t("guru.tab.activity")}
            </TabButton>
            <TabButton active={tab === "context"} onClick={() => setTab("context")}>
              {t("guru.tab.context")}
            </TabButton>
            <TabButton active={tab === "backtest"} onClick={() => setTab("backtest")}>
              {t("guru.tab.backtest")}
            </TabButton>
            <TabButton active={tab === "contribution"} onClick={() => setTab("contribution")}>
              {t("guru.tab.contribution")}
            </TabButton>
            <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
              {t("guru.tab.notes")}
            </TabButton>
          </>
        ) : guru.type === "congress" ? (
          <>
            <TabButton active={tab === "transactions"} onClick={() => setTab("transactions")}>
              交易披露
            </TabButton>
            <TabButton active={tab === "holdings"} onClick={() => setTab("holdings")}>
              披露标的
            </TabButton>
            <TabButton active={tab === "context"} onClick={() => setTab("context")}>
              市场环境
            </TabButton>
            <TabButton active={tab === "backtest"} onClick={() => setTab("backtest")}>
              模拟
            </TabButton>
            <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
              披露说明
            </TabButton>
          </>
        ) : (
          <>
            <TabButton active={tab === "transactions"} onClick={() => setTab("transactions")}>
              交易披露
            </TabButton>
            <TabButton active={tab === "holdings"} onClick={() => setTab("holdings")}>
              持股记录
            </TabButton>
            <TabButton active={tab === "context"} onClick={() => setTab("context")}>
              市场环境
            </TabButton>
            <TabButton active={tab === "backtest"} onClick={() => setTab("backtest")}>
              模拟
            </TabButton>
            <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
              披露说明
            </TabButton>
          </>
        )}
      </nav>

      <DataStatusBanner guru={guru} />
      {guru.status === "error" ? <ErrorBanner error={guru.summary?.message || "数据源错误"} /> : null}

      {tab === "holdings" && guru.type === "manager13f" ? <HoldingsTable guru={guru} /> : null}
      {tab === "activity" && guru.type === "manager13f" ? <ActivityTable guru={guru} /> : null}
      {tab === "transactions" && guru.type === "insider" ? <TransactionTable guru={guru} /> : null}
      {tab === "holdings" && guru.type === "insider" ? <InsiderHoldings guru={guru} /> : null}
      {tab === "transactions" && guru.type === "congress" ? <CongressTransactionTable guru={guru} /> : null}
      {tab === "holdings" && guru.type === "congress" ? <CongressHoldings guru={guru} /> : null}
      {tab === "context" ? <MarketContextPanel guru={guru} /> : null}
      {tab === "backtest" ? <BacktestPanel guru={guru} /> : null}
      {tab === "contribution" && guru.type === "manager13f" ? <QuarterContributionPanel guru={guru} /> : null}
      {tab === "notes" ? <NotesPanel guru={guru} /> : null}
    </div>
  );
}

function InsightDeck({ guru }) {
  const insights = guruInsights(guru);

  return (
    <section className="insight-deck">
      <div className="insight-item primary">
        <div className="insight-icon"><TrendingUp size={17} /></div>
        <span>Primary read</span>
        <strong>{insights.primary}</strong>
      </div>
      <div className="insight-item">
        <div className="insight-icon"><BarChart3 size={17} /></div>
        <span>Flow balance</span>
        <strong>{insights.flow}</strong>
      </div>
      <div className="insight-item">
        <div className="insight-icon"><Clock3 size={17} /></div>
        <span>Disclosure lag</span>
        <strong>{insights.lag}</strong>
      </div>
    </section>
  );
}

function guruInsights(guru) {
  const summary = guru.summary || {};
  const lagDays = filingLagDays(summary.reportDate, summary.filingDate);

  if (guru.status === "rate_limited") {
    return {
      primary: "SEC archive 正在限流",
      flow: "等待几分钟后刷新",
      lag: "临时数据源状态"
    };
  }

  if (guru.status === "local_missing") {
    return {
      primary: "本地数据库暂无快照",
      flow: "点击刷新后写入本地",
      lag: "local DB first"
    };
  }

  if (guru.type === "manager13f") {
    const top = guru.activity?.[0];
    return {
      primary: top
        ? `${actionLabels[top.action] || top.action} ${top.ticker || compactName(top.issuer)}，${formatMoney(top.value || top.previousValue || 0)} 级别`
        : "本季无显著变动",
      flow: `${summary.newPositions || 0} 新增 / ${summary.soldOutPositions || 0} 清仓`,
      lag: lagDays === null ? "季度 13F 披露" : `${lagDays} 天 filing lag`
    };
  }

  if (guru.type === "congress") {
    return {
      primary: summary.latestTicker
        ? `${summary.latestTicker} ${summary.latestAmountRange || ""}`
        : "等待最新 PTR",
      flow: `${summary.buys || 0} 买入 / ${summary.sells || 0} 卖出`,
      lag: lagDays === null ? "STOCK Act 区间披露" : `${lagDays} 天 disclosure lag`
    };
  }

  return {
    primary: summary.latestTicker
      ? `${summary.latestTicker} 持股后 ${formatNumber(summary.latestSharesOwned || 0)} 股`
      : "最近 Form 4",
    flow: `${summary.buys || 0} 买入 / ${summary.sells || 0} 卖出 / ${summary.optionExercises || 0} 行权`,
    lag: lagDays === null ? "Form 4 披露" : `${lagDays} 天 filing lag`
  };
}

function filingLagDays(reportDate, filingDate) {
  const report = dateValue(reportDate);
  const filing = dateValue(filingDate);
  if (!report || !filing) return null;
  return Math.max(0, Math.round((filing - report) / (1000 * 60 * 60 * 24)));
}

function managerMetrics(guru) {
  const summary = guru.summary || {};
  return [
    {
      label: "最新季度",
      value: formatDate(summary.reportDate),
      sub: `Filed ${formatDate(summary.filingDate)}`,
      icon: CalendarDays
    },
    {
      label: "总持仓市值",
      value: formatMoney(summary.totalValue || 0),
      sub: `${formatDeltaMoney(summary.valueChange || 0)} vs ${formatDate(summary.previousReportDate)}`,
      tone: (summary.valueChange || 0) >= 0 ? "positive" : "negative",
      icon: Wallet
    },
    {
      label: "持仓数量",
      value: formatNumber(summary.totalPositions || 0),
      sub: `${summary.newPositions || 0} 新增 · ${summary.soldOutPositions || 0} 清仓`,
      icon: Filter
    },
    {
      label: "加减仓",
      value: `${summary.increasedPositions || 0}/${summary.reducedPositions || 0}`,
      sub: "加仓 / 减仓",
      icon: BadgeDollarSign
    }
  ];
}

function insiderMetrics(guru) {
  const summary = guru.summary || {};
  return [
    {
      label: "最新披露",
      value: formatDate(summary.filingDate),
      sub: summary.latestTicker || guru.focusTicker || guru.disclosureKind,
      icon: CalendarDays
    },
    {
      label: "最近交易数",
      value: formatNumber(summary.recentTransactions || 0),
      sub: `${summary.buys || 0} 买入 · ${summary.sells || 0} 卖出`,
      icon: BadgeDollarSign
    },
    {
      label: "交易后持股",
      value: formatNumber(summary.latestSharesOwned || 0),
      sub: summary.latestIssuer || guru.focusIssuer || "latest issuer",
      icon: Wallet
    },
    {
      label: "其他动作",
      value: `${summary.awards || 0}/${summary.optionExercises || 0}`,
      sub: "授予 / 行权",
      icon: Filter
    }
  ];
}

function congressMetrics(guru) {
  const summary = guru.summary || {};
  return [
    {
      label: "最新披露",
      value: formatDate(summary.filingDate),
      sub: `Traded ${formatDate(summary.reportDate)}`,
      icon: CalendarDays
    },
    {
      label: "最近披露数",
      value: formatNumber(summary.recentTransactions || 0),
      sub: `${summary.buys || 0} 买入 · ${summary.sells || 0} 卖出`,
      icon: BadgeDollarSign
    },
    {
      label: "估算披露金额",
      value: formatMoney(summary.estimatedActivityValue || 0),
      sub: "按金额区间中点估算",
      icon: Wallet
    },
    {
      label: "最新标的",
      value: summary.latestTicker || "-",
      sub: summary.latestAmountRange || summary.latestIssuer || "STOCK Act",
      icon: Filter
    }
  ];
}

function formatDeltaMoney(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
}

function MetricBox({ metric }) {
  const Icon = metric.icon;
  return (
    <div className={`metric-box ${metric.tone || ""}`}>
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small>{metric.sub}</small>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  function handlePointerDown(event) {
    event.preventDefault();
    onClick?.(event);
  }

  return (
    <button type="button" className={active ? "active" : ""} onClick={onClick} onPointerDown={handlePointerDown}>
      {children}
    </button>
  );
}

function HoldingName({ item }) {
  const primary = item.ticker || item.issuer || "-";
  const secondary = item.ticker ? item.issuer : item.title || item.cusip || "";

  return (
    <div className="holding-name">
      <strong>{primary}</strong>
      {secondary && secondary !== primary ? <span>{secondary}</span> : null}
    </div>
  );
}

function ActionPill({ action }) {
  return <span className={`action-pill ${actionTone[action] || "muted"}`}>{actionLabels[action] || action}</span>;
}

function emptyGuruMessage(guru) {
  if (guru.status === "rate_limited") {
    return "SEC 正在限流，当前没有可用缓存。等几分钟后点击刷新即可重新拉取。";
  }
  if (guru.status === "local_missing") {
    return "本地数据库还没有这位 guru 的快照。点击刷新后会拉取并写入本地。";
  }
  if (guru.dataStatus?.status === "stale") {
    return "当前使用缓存数据；如果要更新，请稍后刷新。";
  }
  return "暂无可显示数据";
}

function HoldingsTable({ guru }) {
  const rows = guru.holdings || [];
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>总持仓</h3>
          <p>{formatDate(guru.summary?.reportDate)} · 按市值排序</p>
        </div>
        <FilingLink filing={guru.latestFiling} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标的</th>
              <th>动作</th>
              <th className="num">市值</th>
              <th className="num">组合占比</th>
              <th className="num">股数</th>
              <th className="num">季度变化</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((item) => (
              <tr key={item.id}>
                <td><HoldingName item={item} /></td>
                <td><ActionPill action={item.action} /></td>
                <td className="num">{formatMoney(item.value)}</td>
                <td className="num">{formatPct(item.pctPortfolio)}</td>
                <td className="num">{formatNumber(item.shares)}</td>
                <td className={`num ${item.changeShares >= 0 ? "up" : "down"}`}>
                  {item.changeShares > 0 ? "+" : ""}{formatNumber(item.changeShares)}
                </td>
              </tr>
            )) : (
              <tr><td colSpan="6" className="empty-cell">{emptyGuruMessage(guru)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActivityTable({ guru }) {
  const rows = guru.activity || [];
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>买入卖出</h3>
          <p>{formatDate(guru.summary?.previousReportDate)} 到 {formatDate(guru.summary?.reportDate)}</p>
        </div>
        <FilingLink filing={guru.latestFiling} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标的</th>
              <th>动作</th>
              <th className="num">当前股数</th>
              <th className="num">上季股数</th>
              <th className="num">变化</th>
              <th className="num">当前市值</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((item) => (
              <tr key={`${item.id}-${item.action}`}>
                <td><HoldingName item={item} /></td>
                <td><ActionPill action={item.action} /></td>
                <td className="num">{formatNumber(item.shares)}</td>
                <td className="num">{formatNumber(item.prevShares)}</td>
                <td className={`num ${item.changeShares >= 0 ? "up" : "down"}`}>
                  {item.changeShares > 0 ? "+" : ""}{formatNumber(item.changeShares)}
                </td>
                <td className="num">{formatMoney(item.value)}</td>
              </tr>
            )) : (
              <tr><td colSpan="6" className="empty-cell">{emptyGuruMessage(guru)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TransactionTable({ guru }) {
  const rows = guru.transactions || [];
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>交易披露</h3>
          <p>最近 Form 4 交易记录</p>
        </div>
        <FilingLink filing={guru.latestFiling} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>标的</th>
              <th>动作</th>
              <th className="num">股数</th>
              <th className="num">价格</th>
              <th className="num">交易后持股</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tx, index) => (
              <tr key={`${tx.accessionNumber}-${tx.id}-${index}`}>
                <td>{formatDate(tx.transactionDate || tx.filingDate)}</td>
                <td><HoldingName item={{ ticker: tx.ticker, issuer: tx.issuer }} /></td>
                <td><ActionPill action={tx.action} /></td>
                <td className="num">{formatNumber(tx.shares)}</td>
                <td className="num">{tx.price ? formatMoney(tx.price) : "-"}</td>
                <td className="num">{formatNumber(tx.sharesOwned)}</td>
                <td>
                  <a className="inline-link" href={tx.formUrl} target="_blank" rel="noreferrer">
                    XML <ExternalLink size={13} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CongressTransactionTable({ guru }) {
  const rows = guru.transactions || [];
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>交易披露</h3>
          <p>STOCK Act / Congressional household transaction reports</p>
        </div>
        <FilingLink filing={guru.latestFiling} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>交易日</th>
              <th>披露日</th>
              <th>标的</th>
              <th>动作</th>
              <th className="num">金额区间</th>
              <th className="num">估算中点</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tx) => (
              <tr key={tx.id}>
                <td>{formatDate(tx.transactionDate)}</td>
                <td>{formatDate(tx.filingDate)}</td>
                <td><HoldingName item={{ ticker: tx.ticker, issuer: tx.issuer }} /></td>
                <td><ActionPill action={tx.action} /></td>
                <td className="num">{tx.amountRange || "-"}</td>
                <td className="num">{formatMoney(tx.value || 0)}</td>
                <td className="description-cell">{tx.description || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CongressHoldings({ guru }) {
  const rows = guru.holdings || [];
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>披露标的</h3>
          <p>按最近交易披露金额区间中点聚合，不等同于真实持仓市值</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标的</th>
              <th className="num">估算披露金额</th>
              <th className="num">买入估算</th>
              <th className="num">卖出估算</th>
              <th className="num">披露次数</th>
              <th>最近交易</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td><HoldingName item={item} /></td>
                <td className="num">{formatMoney(item.value || 0)}</td>
                <td className="num up">{formatMoney(item.buyValue || 0)}</td>
                <td className="num down">{formatMoney(item.sellValue || 0)}</td>
                <td className="num">{formatNumber(item.transactions || 0)}</td>
                <td>{formatDate(item.latestDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InsiderHoldings({ guru }) {
  const rows = guru.holdings || [];
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>持股记录</h3>
          <p>来自最近 Form 4 的 post-transaction holdings</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标的</th>
              <th>证券</th>
              <th>持股性质</th>
              <th className="num">交易后持股</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((item, index) => (
              <tr key={`${item.issuer}-${item.securityTitle}-${index}`}>
                <td><HoldingName item={item} /></td>
                <td>{item.securityTitle || "-"}</td>
                <td>{item.ownership || "-"}</td>
                <td className="num">{formatNumber(item.sharesOwned)}</td>
              </tr>
            )) : (
              <tr><td colSpan="4" className="empty-cell">最近 Form 4 未披露独立 holding 行</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BacktestPanel({ guru }) {
  const { data, loading, refreshing, error, refresh } = useGuruBacktest(guru.id);
  const benchmark = data?.summary?.benchmark || {};

  if (guru.type !== "manager13f") {
    return (
      <section className="backtest-shell">
        <div className="panel-head compact">
          <div>
            <h3>复制模拟不适用</h3>
            <p>{guru.simulationTag?.description || "该披露不是完整季度13F组合。"}</p>
          </div>
        </div>
        <div className="rationale-note subdued">
          <span>为什么过滤</span>
          <p>Form 4 / STOCK Act 不是完整组合披露，无法按季度总持仓权重调仓；创始人控制性持股也会严重扭曲“抄作业”信号。</p>
        </div>
      </section>
    );
  }

  const metrics = [
    {
      label: "CAGR",
      value: formatReturnPct(data?.summary?.cagr),
      sub: `SPY ${formatReturnPct(benchmark.cagr)}`,
      tone: (data?.summary?.cagr || 0) >= (benchmark.cagr || 0) ? "positive" : "negative",
      icon: TrendingUp
    },
    {
      label: "Sharpe",
      value: formatNumber(data?.summary?.sharpe, { maximumFractionDigits: 2 }),
      sub: `SPY ${formatNumber(benchmark.sharpe, { maximumFractionDigits: 2 })}`,
      tone: (data?.summary?.sharpe || 0) >= (benchmark.sharpe || 0) ? "positive" : "negative",
      icon: Gauge
    },
    {
      label: "Max drawdown",
      value: formatReturnPct(data?.summary?.maxDrawdown),
      sub: `SPY ${formatReturnPct(benchmark.maxDrawdown)}`,
      tone: "negative",
      icon: ArrowDownRight
    },
    {
      label: "Vol",
      value: formatReturnPct(data?.summary?.volatility),
      sub: `SPY ${formatReturnPct(benchmark.volatility)}`,
      icon: Activity
    }
  ];

  return (
    <section className="backtest-shell">
      <div className="market-head">
        <div>
          <span className="market-kicker">
            <LineChart size={15} />
            Copy-trade simulation
          </span>
          <h3>{guru.name} 披露日复制模拟</h3>
          <p>
            {data?.window
              ? `${formatDate(data.window.start)} - ${formatDate(data.window.end)} · benchmark SPY`
              : "五年13F披露日调仓 · benchmark SPY"}
          </p>
        </div>
        <button className="secondary-action" onClick={refresh} disabled={loading || refreshing}>
          {refreshing ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          <span>{refreshing ? "重算中" : "重算"}</span>
        </button>
      </div>

      {error ? <ErrorBanner error={error} /> : null}

      {loading && !data ? (
        <div className="table-panel loading-table" />
      ) : data?.status === "ready" ? (
        <>
          <div className="metric-grid">
            {metrics.map((metric) => <MetricBox metric={metric} key={metric.label} />)}
          </div>
          <div className="backtest-stats-row">
            <MarketChip label="Total return" value={formatReturnPct(data.summary.totalReturn)} tone={data.summary.totalReturn >= benchmark.totalReturn ? "positive" : "negative"} />
            <MarketChip label="SPY total" value={formatReturnPct(benchmark.totalReturn)} />
            <MarketChip label="Rebalances" value={formatNumber(data.summary.rebalances)} />
            <MarketChip label="Avg positions" value={formatNumber(data.summary.averagePositions, { maximumFractionDigits: 0 })} />
            <MarketChip label="Coverage" value={formatPct(data.summary.averageCoverage)} />
          </div>
          <BacktestChart equity={data.equity || []} />
          <BacktestRebalanceTable rebalances={data.rebalances || []} />
          <BacktestMethod data={data} />
        </>
      ) : (
        <div className="rationale-note subdued">
          <span>{data?.tag?.label || "模拟待补数据"}</span>
          <p>{data?.method?.reason || "还没有足够的历史13F和价格数据。点击重算会尝试从SEC和Yahoo补齐。"}</p>
        </div>
      )}
    </section>
  );
}

function QuarterContributionPanel({ guru }) {
  const { t } = useI18n();
  const { data, loading, refreshing, error, refresh } = useGuruBacktest(guru.id);
  const quarters = useMemo(() => [...(data?.quarterContributions || [])].reverse(), [data?.quarterContributions]);
  const quarterKey = quarters.map((quarter) => quarter.id).join("|");
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!quarters.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((current) => {
      const available = new Set(quarters.map((quarter) => quarter.id));
      const kept = current.filter((id) => available.has(id));
      return kept.length ? kept : [quarters[0].id];
    });
  }, [quarterKey]);

  const selectedQuarters = quarters.filter((quarter) => selectedIds.includes(quarter.id));
  const rows = useMemo(() => aggregateContributionRows(selectedQuarters), [selectedQuarters]);
  const maxContribution = Math.max(...rows.map((row) => Math.abs(row.contributionPct || 0)), 0.0001);
  const selectedReturn = selectedQuarters.reduce((sum, quarter) => sum + (quarter.portfolioReturn || 0), 0);
  const selectedBenchmark = selectedQuarters.reduce((sum, quarter) => sum + (quarter.benchmarkReturn || 0), 0);

  function toggleQuarter(id) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  }

  return (
    <section className="backtest-shell contribution-shell">
      <div className="market-head">
        <div>
          <span className="market-kicker">
            <BarChart3 size={15} />
            {t("guru.contribution.kicker")}
          </span>
          <h3>{guru.name} {t("guru.contribution.title")}</h3>
          <p>{t("guru.contribution.subtitle")}</p>
        </div>
        <button className="secondary-action" onClick={refresh} disabled={loading || refreshing}>
          {refreshing ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          <span>{refreshing ? t("guru.contribution.refreshing") : t("guru.contribution.refresh")}</span>
        </button>
      </div>

      {error ? <ErrorBanner error={error} /> : null}

      {loading && !data ? (
        <div className="table-panel loading-table" />
      ) : data?.status !== "ready" || !quarters.length ? (
        <div className="rationale-note subdued">
          <span>{data?.tag?.label || t("guru.contribution.empty")}</span>
          <p>{data?.method?.reason || t("guru.contribution.empty")}</p>
        </div>
      ) : (
        <>
          <div className="quarter-chip-panel">
            <div>
              <span>{t("guru.contribution.selected")}</span>
              <strong>{formatNumber(selectedQuarters.length)} / {formatNumber(quarters.length)}</strong>
            </div>
            <div className="quarter-chip-row">
              {quarters.map((quarter) => (
                <button
                  type="button"
                  key={quarter.id}
                  className={selectedIds.includes(quarter.id) ? "active" : ""}
                  onClick={() => toggleQuarter(quarter.id)}
                >
                  <strong>{quarter.label}</strong>
                  <span>{formatReturnPct(quarter.portfolioReturn)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="backtest-stats-row">
            <MarketChip label="Copy return" value={formatReturnPct(selectedReturn)} tone={selectedReturn >= selectedBenchmark ? "positive" : "negative"} />
            <MarketChip label="SPY return" value={formatReturnPct(selectedBenchmark)} />
            <MarketChip label={t("guru.contribution.periods")} value={formatNumber(selectedQuarters.length)} />
            <MarketChip label="Positions" value={formatNumber(rows.length)} />
            <MarketChip label="Coverage" value={formatPct(mean(selectedQuarters.map((quarter) => quarter.coveragePct || 0)))} />
          </div>

          <section className="table-panel contribution-panel">
            <div className="panel-head">
              <div>
                <h3>{t("guru.contribution.rank")}</h3>
                <p>{selectedQuarters.map((quarter) => quarter.label).join(" · ")}</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>标的</th>
                    <th>{t("guru.contribution.contribution")}</th>
                    <th className="num">{t("guru.contribution.avgWeight")}</th>
                    <th className="num">{t("guru.contribution.return")}</th>
                    <th className="num">{t("guru.contribution.periods")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.ticker}>
                      <td><HoldingName item={{ ticker: row.ticker, issuer: row.issuer }} /></td>
                      <td>
                        <div className="contribution-meter">
                          <span
                            className={(row.contributionPct || 0) >= 0 ? "positive" : "negative"}
                            style={{ width: `${Math.max(4, Math.min(100, Math.abs(row.contributionPct || 0) / maxContribution * 100))}%` }}
                          />
                          <strong className={(row.contributionPct || 0) >= 0 ? "up" : "down"}>
                            {formatReturnPct(row.contributionPct)}
                          </strong>
                        </div>
                      </td>
                      <td className="num">{formatPct(row.avgWeight)}</td>
                      <td className={`num ${(row.weightedReturn || 0) >= 0 ? "up" : "down"}`}>{formatReturnPct(row.weightedReturn)}</td>
                      <td className="num">{formatNumber(row.periods)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="rationale-note subdued">
            <span>{t("guru.contribution.kicker")}</span>
            <p>{t("guru.contribution.note")}</p>
          </div>
        </>
      )}
    </section>
  );
}

function aggregateContributionRows(quarters) {
  const byTicker = new Map();
  for (const quarter of quarters || []) {
    for (const row of quarter.contributions || []) {
      const current = byTicker.get(row.ticker) || {
        ticker: row.ticker,
        issuer: row.issuer,
        contributionPct: 0,
        weightSum: 0,
        weightedReturnSum: 0,
        periods: 0
      };
      current.issuer = current.issuer || row.issuer;
      current.contributionPct += row.contributionPct || 0;
      current.weightSum += row.weight || 0;
      current.weightedReturnSum += row.returnPct || 0;
      current.periods += 1;
      byTicker.set(row.ticker, current);
    }
  }
  return [...byTicker.values()]
    .map((row) => ({
      ...row,
      avgWeight: row.periods ? row.weightSum / row.periods : 0,
      weightedReturn: row.periods ? row.weightedReturnSum / row.periods : 0
    }))
    .sort((left, right) => right.contributionPct - left.contributionPct);
}

function BacktestChart({ equity }) {
  const width = 860;
  const height = 320;
  const padding = { top: 28, right: 28, bottom: 38, left: 58 };
  const points = useMemo(() => (equity || []).filter((point) => point.date && Number.isFinite(point.value) && Number.isFinite(point.benchmark)), [equity]);
  const chart = useMemo(() => makeBacktestChartModel(points, width, height, padding), [points]);
  const [hoverPoint, setHoverPoint] = useState(null);

  if (!chart) {
    return (
      <section className="chart-panel">
        <div className="chart-head">
          <div>
            <span>portfolio vs SPY</span>
            <h3>回测曲线</h3>
          </div>
        </div>
        <div className="chart-empty">暂无回测曲线</div>
      </section>
    );
  }

  const portfolioPath = valueLinePath(points, chart.xScale, chart.yScale, "value");
  const benchmarkPath = valueLinePath(points, chart.xScale, chart.yScale, "benchmark");
  const gridValues = chartGridValues(chart.minY, chart.maxY);
  const hover = hoverPoint ? backtestHoverModel(hoverPoint, chart, width, height, padding) : null;

  function handlePointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    setHoverPoint(nearestBacktestPoint(points, chart, x));
  }

  return (
    <section className="chart-panel backtest-chart-panel">
      <div className="chart-head">
        <div>
          <span>portfolio vs SPY</span>
          <h3>披露日复制组合走势</h3>
        </div>
        <div className="chart-legend">
          <span><i className="portfolio" />Copy</span>
          <span><i className="benchmark" />SPY</span>
        </div>
      </div>
      <svg
        className="price-chart interactive-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="backtest chart"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverPoint(null)}
      >
        <rect className="chart-bg" x="0" y="0" width={width} height={height} />
        {gridValues.map((value) => (
          <g key={value}>
            <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={chart.yScale(value)} y2={chart.yScale(value)} />
            <text className="chart-axis-label" x={padding.left - 10} y={chart.yScale(value) + 4} textAnchor="end">
              {formatReturnPct(value - 1)}
            </text>
          </g>
        ))}
        <path className="backtest-line benchmark" d={benchmarkPath} />
        <path className="backtest-line portfolio" d={portfolioPath} />
        {hover ? (
          <g className="chart-hover-layer">
            <line className="chart-hover-line" x1={hover.x} x2={hover.x} y1={padding.top} y2={height - padding.bottom} />
            <circle className="chart-hover-dot benchmark" cx={hover.x} cy={hover.benchmarkY} r="5" />
            <circle className="chart-hover-dot portfolio" cx={hover.x} cy={hover.portfolioY} r="5" />
            <g className="chart-tooltip" transform={`translate(${hover.tooltipX} ${hover.tooltipY})`}>
              <rect width={hover.tooltipWidth} height="82" rx="7" />
              <text className="chart-tooltip-title" x="10" y="18">{formatDate(hover.point.date)}</text>
              <text className="chart-tooltip-row portfolio" x="10" y="38">Copy</text>
              <text className="chart-tooltip-value" x={hover.tooltipWidth - 10} y="38" textAnchor="end">{formatReturnPct(hover.point.value - 1)}</text>
              <text className="chart-tooltip-row benchmark" x="10" y="56">SPY</text>
              <text className="chart-tooltip-value" x={hover.tooltipWidth - 10} y="56" textAnchor="end">{formatReturnPct(hover.point.benchmark - 1)}</text>
              <text className="chart-tooltip-row" x="10" y="74">差值</text>
              <text className="chart-tooltip-value" x={hover.tooltipWidth - 10} y="74" textAnchor="end">{formatReturnPct(hover.point.value - hover.point.benchmark)}</text>
            </g>
          </g>
        ) : null}
        <text className="chart-axis-label" x={padding.left} y={height - 12}>
          {formatDate(points[0]?.date)}
        </text>
        <text className="chart-axis-label" x={width - padding.right} y={height - 12} textAnchor="end">
          {formatDate(points[points.length - 1]?.date)}
        </text>
        <rect
          className="chart-hover-target"
          x={padding.left}
          y={padding.top}
          width={width - padding.left - padding.right}
          height={height - padding.top - padding.bottom}
        />
      </svg>
    </section>
  );
}

function nearestBacktestPoint(points, chart, x) {
  if (!points.length) return null;
  const targetX = Math.max(chart.bounds.left, Math.min(chart.bounds.right, x));
  return points.reduce((nearest, point) => {
    const distance = Math.abs(chart.xScale(point.date) - targetX);
    if (!nearest || distance < nearest.distance) return { point, distance };
    return nearest;
  }, null)?.point || null;
}

function backtestHoverModel(point, chart, width, height, padding) {
  const x = chart.xScale(point.date);
  const portfolioY = chart.yScale(point.value);
  const benchmarkY = chart.yScale(point.benchmark);
  const tooltipWidth = 148;
  const tooltipHeight = 82;
  const tooltipX = x > width - padding.right - tooltipWidth - 14 ? x - tooltipWidth - 12 : x + 12;
  const preferredY = Math.min(portfolioY, benchmarkY) - tooltipHeight - 12;
  const tooltipY = Math.max(padding.top + 4, Math.min(height - padding.bottom - tooltipHeight, preferredY));
  return { point, x, portfolioY, benchmarkY, tooltipX, tooltipY, tooltipWidth };
}

function makeBacktestChartModel(points, width, height, padding) {
  if (!points.length) return null;
  const times = points.map((point) => dateValue(point.date)).filter(Boolean);
  const values = points.flatMap((point) => [point.value, point.benchmark]).filter(Number.isFinite);
  if (!times.length || !values.length) return null;
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  if (minY === maxY) {
    minY -= 0.1;
    maxY += 0.1;
  }
  const padY = (maxY - minY) * 0.08;
  minY = Math.max(0, minY - padY);
  maxY += padY;
  const minX = Math.min(...times);
  const maxX = Math.max(...times);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  return {
    minY,
    maxY,
    bounds: {
      left: padding.left,
      right: width - padding.right,
      top: padding.top,
      bottom: height - padding.bottom
    },
    xScale(value) {
      const pct = maxX === minX ? 0 : (dateValue(value) - minX) / (maxX - minX);
      return padding.left + Math.max(0, Math.min(1, pct)) * innerWidth;
    },
    yScale(value) {
      const pct = maxY === minY ? 0.5 : (value - minY) / (maxY - minY);
      return padding.top + (1 - Math.max(0, Math.min(1, pct))) * innerHeight;
    }
  };
}

function valueLinePath(points, xScale, yScale, key) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.date).toFixed(2)} ${yScale(point[key]).toFixed(2)}`)
    .join(" ");
}

function BacktestRebalanceTable({ rebalances }) {
  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h3>调仓日志</h3>
          <p>13F filing date 后第一个可交易日执行</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>执行日</th>
              <th>报告季度</th>
              <th>覆盖</th>
              <th>持仓数</th>
              <th>Top weights</th>
            </tr>
          </thead>
          <tbody>
            {rebalances.length ? rebalances.slice().reverse().map((rebalance) => (
              <tr key={`${rebalance.reportDate}-${rebalance.executionDate}`}>
                <td>
                  <strong>{formatDate(rebalance.executionDate)}</strong>
                  <span>{formatDate(rebalance.filingDate)} 披露</span>
                </td>
                <td>{formatDate(rebalance.reportDate)}</td>
                <td>{formatPct(rebalance.coveragePct)}</td>
                <td>{formatNumber(rebalance.pricedPositions)} / {formatNumber(rebalance.selectedPositions)}</td>
                <td>
                  <div className="weight-chip-row">
                    {(rebalance.topHoldings || []).slice(0, 5).map((holding) => (
                      <span key={`${rebalance.executionDate}-${holding.ticker}`}>{holding.ticker} {formatPct(holding.weight)}</span>
                    ))}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="5" className="empty-cell">暂无调仓记录</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BacktestMethod({ data }) {
  return (
    <section className="notes-grid">
      <div className="note-block">
        <h3>模拟规则</h3>
        <p>{data.method?.execution}</p>
        <p>{data.method?.weighting}</p>
        <p>最多纳入每次披露前 {formatNumber(data.method?.maxHoldingsPerFiling || 0)} 个公开长仓，按可交易且有价格的数据重新归一。</p>
      </div>
      <div className="note-block">
        <h3>边界</h3>
        {(data.method?.assumptions || []).map((item) => <p key={item}>{item}</p>)}
      </div>
    </section>
  );
}

function MarketContextPanel({ guru }) {
  const seedTicker = guru.focusTicker || guru.summary?.latestTicker || "";
  const [selectedTicker, setSelectedTicker] = useState(seedTicker);
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const { data, loading, error } = useGuruContext(guru.id, selectedTicker);

  useEffect(() => {
    setSelectedTicker(guru.focusTicker || guru.summary?.latestTicker || "");
  }, [guru.id, guru.focusTicker, guru.summary?.latestTicker]);

  useEffect(() => {
    if (!selectedTicker && data?.selectedTicker) {
      setSelectedTicker(data.selectedTicker);
    }
  }, [data?.selectedTicker, selectedTicker]);

  const operations = data?.operations || [];
  const tickers = data?.tickers || [];
  const selectedOps = operations.filter((operation) => operation.ticker === data?.selectedTicker);
  const latestOp = operations[operations.length - 1];
  const firstOp = operations[0];
  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ||
    selectedOps[selectedOps.length - 1] ||
    latestOp;

  useEffect(() => {
    if (!operations.length) return;
    const current = operations.find((operation) => operation.id === selectedOperationId);
    if (current && (!data?.selectedTicker || current.ticker === data.selectedTicker)) return;
    const fallback = selectedOps[selectedOps.length - 1] || latestOp;
    if (fallback) setSelectedOperationId(fallback.id);
  }, [data?.selectedTicker, latestOp, operations, selectedOperationId, selectedOps]);

  function handleSelectTicker(ticker) {
    setSelectedTicker(ticker);
    setSelectedOperationId("");
  }

  function handleSelectOperation(operation) {
    setSelectedTicker(operation.ticker);
    setSelectedOperationId(operation.id);
  }

  return (
    <section className="market-lab">
      <div className="market-head">
        <div>
          <span className="market-kicker">
            <Radar size={15} />
            Market replay
          </span>
          <h3>{guru.name} 历史操作环境</h3>
          <p>{data?.selectedTicker ? `SPY + ${data.selectedTicker}` : "SPY + ticker context"}</p>
        </div>
        <div className="market-summary">
          <MarketChip label="Regime" value={data?.market?.regime?.label || (loading ? "Loading" : "-")} />
          <MarketChip label="SPY return" value={formatReturnPct(data?.market?.regime?.returnPct)} tone={(data?.market?.regime?.returnPct || 0) >= 0 ? "positive" : "negative"} />
          <MarketChip label="Max DD" value={formatReturnPct(data?.market?.regime?.drawdown)} tone="negative" />
          <MarketChip label="Window" value={data?.window ? `${formatDate(data.window.start)} - ${formatDate(data.window.end)}` : "-"} />
        </div>
      </div>

      {error ? <ErrorBanner error={error} /> : null}

      <div className="ticker-chip-row" aria-label="context ticker selector">
        {(tickers.length ? tickers : [selectedTicker].filter(Boolean)).map((ticker) => (
          <button
            className={`ticker-chip ${ticker === data?.selectedTicker ? "active" : ""}`}
            key={ticker}
            onClick={() => handleSelectTicker(ticker)}
            disabled={loading && ticker === selectedTicker}
          >
            {ticker}
          </button>
        ))}
      </div>

      <div className="market-stats">
        <MarketStat label="操作样本" value={formatNumber(operations.length)} sub={data?.guru?.disclosureKind || guru.disclosureKind} />
        <MarketStat label="当前标的" value={data?.selectedTicker || "-"} sub={`${formatNumber(selectedOps.length)} 笔相关操作`} />
        <MarketStat label="最早操作" value={firstOp ? formatDate(firstOp.date) : "-"} sub={firstOp?.source || "-"} />
        <MarketStat label="最近操作" value={latestOp ? formatDate(latestOp.date) : "-"} sub={latestOp?.ticker || "-"} />
      </div>

      <div className="chart-grid">
        <PriceContextChart
          title="SPY 历史走势"
          subtitle="market backdrop"
          symbol="SPY"
          points={data?.market?.spy?.points || []}
          operations={operations}
          selectedTicker={data?.selectedTicker}
          loading={loading}
          mode="spy"
        />
        <PriceContextChart
          title={`${data?.selectedTicker || selectedTicker || "Ticker"} 操作区间`}
          subtitle={selectedOps.length ? `${formatNumber(selectedOps.length)} operations` : "selected stock"}
          symbol={data?.selectedTicker || selectedTicker}
          points={data?.market?.selected?.points || []}
          operations={operations}
          selectedTicker={data?.selectedTicker}
          loading={loading}
          mode="stock"
        />
      </div>

      <div className="market-research-grid">
        <OperationStream
          operations={operations}
          selectedTicker={data?.selectedTicker}
          selectedOperationId={selectedOperation?.id}
          onSelectOperation={handleSelectOperation}
        />
        <OperationRationalePanel guru={guru} operation={selectedOperation} />
      </div>
    </section>
  );
}

function MarketChip({ label, value, tone }) {
  return (
    <div className={`market-chip ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MarketStat({ label, value, sub }) {
  return (
    <div className="market-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function PriceContextChart({ title, subtitle, symbol, points, operations, selectedTicker, loading, mode }) {
  const width = 860;
  const height = 324;
  const padding = { top: 24, right: 22, bottom: 38, left: 58 };
  const cleanPoints = useMemo(() => {
    return (points || [])
      .filter((point) => point.date && Number.isFinite(point.close))
      .sort((a, b) => dateValue(a.date) - dateValue(b.date));
  }, [points]);
  const chart = useMemo(() => makeChartModel(cleanPoints, width, height, padding), [cleanPoints]);
  const chartOperations = useMemo(() => {
    const filtered = mode === "stock"
      ? operations.filter((operation) => operation.ticker === selectedTicker)
      : operations;
    return filtered
      .map((operation) => {
        const fallback = nearestChartPoint(cleanPoints, operation.date);
        const close = mode === "spy" ? operation.spyClose : operation.selectedClose;
        const resolvedClose = Number.isFinite(close) ? close : fallback?.close;
        return { ...operation, chartClose: resolvedClose };
      })
      .filter((operation) => Number.isFinite(operation.chartClose))
      .slice(-120);
  }, [cleanPoints, mode, operations, selectedTicker]);
  const buyWindows = useMemo(() => {
    if (mode !== "stock") return [];
    return chartOperations.filter((operation) => isConstructiveAction(operation.action));
  }, [chartOperations, mode]);

  if (loading && !cleanPoints.length) {
    return (
      <section className="chart-panel">
        <div className="chart-head">
          <div>
            <span>{subtitle}</span>
            <h3>{title}</h3>
          </div>
          <strong>{symbol || "-"}</strong>
        </div>
        <div className="chart-empty loading-block" />
      </section>
    );
  }

  if (!chart) {
    return (
      <section className="chart-panel">
        <div className="chart-head">
          <div>
            <span>{subtitle}</span>
            <h3>{title}</h3>
          </div>
          <strong>{symbol || "-"}</strong>
        </div>
        <div className="chart-empty">暂无价格数据</div>
      </section>
    );
  }

  const line = linePath(cleanPoints, chart.xScale, chart.yScale);
  const gridValues = chartGridValues(chart.minY, chart.maxY);

  return (
    <section className="chart-panel">
      <div className="chart-head">
        <div>
          <span>{subtitle}</span>
          <h3>{title}</h3>
        </div>
        <strong>{symbol || "-"}</strong>
      </div>
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} price chart`}>
        <rect className="chart-bg" x="0" y="0" width={width} height={height} />
        {gridValues.map((value) => (
          <g key={value}>
            <line
              className="chart-gridline"
              x1={padding.left}
              x2={width - padding.right}
              y1={chart.yScale(value)}
              y2={chart.yScale(value)}
            />
            <text className="chart-axis-label" x={padding.left - 10} y={chart.yScale(value) + 4} textAnchor="end">
              {formatPrice(value)}
            </text>
          </g>
        ))}

        {buyWindows.map((operation) => {
          const window = operationBand(operation, chart);
          return (
            <rect
              className={`buy-window ${operationToneClass(operation.action)}`}
              key={`band-${operation.id}`}
              x={window.x}
              y={padding.top}
              width={window.width}
              height={height - padding.top - padding.bottom}
            >
              <title>{operationTooltip(operation, mode)}</title>
            </rect>
          );
        })}

        <path className="price-line" d={line} />

        {chartOperations.map((operation) => {
          const x = chart.xScale(operation.date);
          const y = chart.yScale(operation.chartClose);
          return (
            <g className={`chart-marker ${operationToneClass(operation.action)}`} key={`${mode}-${operation.id}`}>
              <circle cx={x} cy={y} r={mode === "spy" ? 5 : 6} />
              <title>{operationTooltip(operation, mode)}</title>
            </g>
          );
        })}

        <text className="chart-axis-label" x={padding.left} y={height - 12}>
          {formatDate(cleanPoints[0]?.date)}
        </text>
        <text className="chart-axis-label" x={width - padding.right} y={height - 12} textAnchor="end">
          {formatDate(cleanPoints[cleanPoints.length - 1]?.date)}
        </text>
      </svg>
    </section>
  );
}

function OperationStream({ operations, selectedTicker, selectedOperationId, onSelectOperation }) {
  const rows = useMemo(() => [...(operations || [])].reverse().slice(0, 64), [operations]);

  return (
    <section className="operation-stream">
      <div className="panel-head compact">
        <div>
          <h3>关键操作流</h3>
          <p>{selectedTicker ? `${selectedTicker} 与全部披露动作` : "historical operations"}</p>
        </div>
      </div>
      <div className="operation-list">
        {rows.length ? rows.map((operation) => (
          <button
            className={`operation-row ${operation.id === selectedOperationId ? "selected" : operation.ticker === selectedTicker ? "active" : ""}`}
            key={operation.id}
            onClick={() => onSelectOperation(operation)}
          >
            <span className={`operation-dot ${operationToneClass(operation.action)}`} />
            <div className="operation-main">
              <strong>
                {operation.ticker}
                <ActionPill action={operation.action} />
              </strong>
              <span>{operation.issuer || operation.detail || "-"}</span>
            </div>
            <div className="operation-meta">
              <strong>{operationSize(operation)}</strong>
              <span>{formatDate(operation.date)} · {operation.source || operation.disclosureKind}</span>
            </div>
            <div className="operation-prices">
              <strong>{formatPrice(operation.spyClose)}</strong>
              <span>SPY</span>
              <strong>{operation.ticker === selectedTicker ? formatPrice(operation.selectedClose) : "-"}</strong>
              <span>{selectedTicker || "Ticker"}</span>
            </div>
          </button>
        )) : (
          <div className="chart-empty">暂无历史操作数据</div>
        )}
      </div>
    </section>
  );
}

function OperationRationalePanel({ guru, operation }) {
  const { data, loading, error } = useOperationCommentary(guru.id, operation);

  if (!operation) {
    return (
      <section className="rationale-panel">
        <div className="panel-head compact">
          <div>
            <h3>当时思路</h3>
            <p>选择一笔操作后搜索公开发言</p>
          </div>
        </div>
        <div className="rationale-empty">暂无选中操作</div>
      </section>
    );
  }

  const articles = data?.articles || [];
  const evidence = data?.evidence;

  return (
    <section className="rationale-panel">
      <div className="panel-head compact">
        <div>
          <h3>当时思路</h3>
          <p>{operation.ticker} · {formatDate(operation.date)} · {actionLabels[operation.action] || operation.action}</p>
        </div>
        <span className={`evidence-badge ${evidence?.tone || "muted"}`}>
          {loading ? <Loader2 className="spin" size={14} /> : null}
          {loading ? "搜索中" : evidence?.label || "等待搜索"}
        </span>
      </div>

      <div className="rationale-body">
        <div className="selected-operation-card">
          <span className={`operation-dot ${operationToneClass(operation.action)}`} />
          <div>
            <strong>{operation.ticker} <ActionPill action={operation.action} /></strong>
            <p>{operation.issuer || operation.detail || "-"}</p>
          </div>
          <div className="selected-operation-meta">
            <strong>{operationSize(operation)}</strong>
            <span>{formatPrice(operation.selectedClose)} · SPY {formatPrice(operation.spyClose)}</span>
          </div>
        </div>

        {error ? <div className="rationale-error">{error}</div> : null}

        <div className="rationale-note">
          <span>可协商假设</span>
          <p>{loading && !data ? "正在搜索同期公开发言和报道..." : data?.hypothesis || "等待搜索结果"}</p>
        </div>

        <div className="rationale-note subdued">
          <span>披露边界</span>
          <p>{data?.caveat || "披露文件通常不直接解释交易动机，需要和公开发言交叉验证。"}</p>
        </div>

        <div className="source-stack">
          <div className="source-head">
            <strong>公开线索</strong>
            <span>{data?.window ? `${formatDate(data.window.start)} - ${formatDate(data.window.end)}` : "-"}</span>
          </div>
          {articles.length ? articles.map((article) => (
            <a className="source-row" href={article.url} target="_blank" rel="noreferrer" key={article.id}>
              <div>
                <strong>{article.title}</strong>
                <span>{article.source || article.provider} · {article.publishedAt ? formatDate(article.publishedAt) : article.provider}</span>
              </div>
              <ExternalLink size={14} />
            </a>
          )) : (
            <div className="rationale-empty small">
              {loading ? "搜索中..." : "没有找到足够相关的公开发言；当前只保留基于披露类型和市场环境的推断。"}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function makeChartModel(points, width, height, padding) {
  if (!points.length) return null;
  const times = points.map((point) => dateValue(point.date)).filter(Boolean);
  const closes = points.map((point) => point.close).filter(Number.isFinite);
  if (!times.length || !closes.length) return null;

  const minX = Math.min(...times);
  const maxX = Math.max(...times);
  const rawMinY = Math.min(...closes);
  const rawMaxY = Math.max(...closes);
  let minY = rawMinY;
  let maxY = rawMaxY;
  if (minY === maxY) {
    const singlePointPad = Math.max(Math.abs(minY) * 0.08, 1);
    minY -= singlePointPad;
    maxY += singlePointPad;
  }
  const padY = (maxY - minY) * 0.08;
  minY -= padY;
  maxY += padY;
  if (rawMinY >= 0 && minY < 0) {
    minY = rawMinY > 0 ? rawMinY * 0.8 : 0;
  }

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  return {
    minX,
    maxX,
    minY,
    maxY,
    padding,
    xScale(value) {
      const time = dateValue(value);
      const pct = maxX === minX ? 0 : (time - minX) / (maxX - minX);
      return padding.left + Math.max(0, Math.min(1, pct)) * innerWidth;
    },
    yScale(value) {
      const pct = maxY === minY ? 0.5 : (value - minY) / (maxY - minY);
      return padding.top + (1 - Math.max(0, Math.min(1, pct))) * innerHeight;
    }
  };
}

function linePath(points, xScale, yScale) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.date).toFixed(2)} ${yScale(point.close).toFixed(2)}`)
    .join(" ");
}

function nearestChartPoint(points, date) {
  if (!points.length || !date) return null;
  const target = dateValue(date);
  return nearestChartPointByTime(points, target);
}

function nearestChartPointByTime(points, target) {
  if (!points.length || !Number.isFinite(target)) return null;
  let best = points[0];
  let bestDistance = Math.abs(dateValue(best.date) - target);
  for (const point of points) {
    const distance = Math.abs(dateValue(point.date) - target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

function chartGridValues(min, max) {
  const values = [];
  for (let index = 0; index < 4; index += 1) {
    values.push(min + ((max - min) * index) / 3);
  }
  return values;
}

function operationToneClass(action) {
  return actionTone[action] || "muted";
}

function isConstructiveAction(action) {
  return ["new", "increased", "buy"].includes(action);
}

function operationBand(operation, chart) {
  const date = dateValue(operation.date);
  const quarterMs = 1000 * 60 * 60 * 24 * 90;
  const shortMs = 1000 * 60 * 60 * 24 * 10;
  const lookback = operation.disclosureKind === "13F-HR" || operation.source === "13F" ? quarterMs : shortMs;
  const lookahead = operation.disclosureKind === "13F-HR" || operation.source === "13F" ? 0 : shortMs;
  const x0 = chart.xScale(new Date(date - lookback).toISOString().slice(0, 10));
  const x1 = chart.xScale(new Date(date + lookahead).toISOString().slice(0, 10));
  return {
    x: Math.min(x0, x1),
    width: Math.max(5, Math.abs(x1 - x0))
  };
}

function operationSize(operation) {
  if (operation.amountRange) return operation.amountRange;
  if (operation.value) return formatMoney(Math.abs(operation.value));
  if (operation.changeShares) return `${operation.changeShares > 0 ? "+" : ""}${formatNumber(operation.changeShares)} 股`;
  if (operation.shares) return `${formatNumber(operation.shares)} 股`;
  if (operation.price) return formatPrice(operation.price);
  return operation.detail || "-";
}

function operationTooltip(operation, mode) {
  const price = mode === "spy" ? operation.spyClose : operation.selectedClose;
  const priceLabel = mode === "spy" ? "SPY" : operation.ticker;
  return `${formatDate(operation.date)} · ${operation.ticker} · ${actionLabels[operation.action] || operation.action} · ${operationSize(operation)} · ${priceLabel} ${formatPrice(price)}`;
}

function NotesPanel({ guru }) {
  return (
    <section className="notes-grid">
      <div className="note-block">
        <h3>披露边界</h3>
        {guru.notes?.map((note) => <p key={note}>{note}</p>)}
      </div>
      <div className="note-block">
        <h3>来源链接</h3>
        {guru.secCompanyUrl ? (
          <a href={guru.secCompanyUrl} target="_blank" rel="noreferrer">
            EDGAR entity page <ExternalLink size={14} />
          </a>
        ) : null}
        {!guru.secCompanyUrl && guru.profileUrl ? (
          <a href={guru.profileUrl} target="_blank" rel="noreferrer">
            {guru.sourceLabel || "Source page"} <ExternalLink size={14} />
          </a>
        ) : null}
        {guru.latestFiling ? <FilingLink filing={guru.latestFiling} /> : null}
        {guru.previousFiling ? <FilingLink filing={guru.previousFiling} label="Previous filing" /> : null}
      </div>
    </section>
  );
}

function FilingLink({ filing, label = "Latest filing" }) {
  if (!filing?.filingIndexUrl) return null;
  return (
    <a className="filing-link" href={filing.filingIndexUrl} target="_blank" rel="noreferrer">
      {label}
      <ExternalLink size={14} />
    </a>
  );
}

function SkeletonList() {
  return Array.from({ length: 6 }).map((_, index) => (
    <div className="guru-card skeleton" key={index}>
      <div className="guru-avatar" />
      <div className="skeleton-lines">
        <span />
        <span />
      </div>
    </div>
  ));
}

function DetailSkeleton() {
  return (
    <div className="detail-content">
      <div className="profile-band loading-block" />
      <div className="table-panel loading-table" />
    </div>
  );
}

const rootElement = document.getElementById("root");
const root = globalThis.__guruAnalysisRoot || createRoot(rootElement);
globalThis.__guruAnalysisRoot = root;
root.render(
  <AuthProvider>
    <AuthenticatedRoot />
  </AuthProvider>
);
