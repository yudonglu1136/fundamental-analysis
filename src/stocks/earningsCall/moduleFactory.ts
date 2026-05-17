import type { StockModule, StockValuationConfig, SummaryMetric, ValuationResult } from "../types";
import { computeUpsideDownside } from "../../utils/valuation";
import { EarningsCallDashboard } from "./dashboard";
import { buildEarningsCallTrend } from "./engine";
import type { EarningsCallDataset } from "./types";

function metric(label: string, value: number, format: SummaryMetric["format"], description: string, badge: SummaryMetric["badge"]): SummaryMetric {
  return { key: label.toLowerCase().replace(/\s+/g, "-"), label, value, format, description, badge };
}

function calculateSummary(data: EarningsCallDataset): SummaryMetric[] {
  const latest = data.quarters[data.quarters.length - 1];
  const first = data.quarters[0];
  const trend = buildEarningsCallTrend(data);
  return [
    metric("Current Price", data.currentPrice, "currency", "Dated public market price snapshot.", "Actual"),
    metric("Latest Revenue", latest.totalRevenue, "currency", `Reported revenue in ${latest.label}.`, "Actual"),
    metric(data.primaryMetricName, latest.primaryMetric, "currency", `Primary product / segment metric in ${latest.label}.`, "Actual"),
    metric("8Q Revenue Growth", latest.totalRevenue / Math.max(first.totalRevenue, 1) - 1, "percent", "Latest quarter revenue versus first quarter in the 8Q window.", "Derived"),
    metric("Top Focus Intensity", trend.topicTrendRows[0]?.latestIntensity ?? 0, "number", "Highest latest-quarter market-focus score.", "Derived"),
    metric("Evidence Count", data.evidence.length, "number", "Evidence records supporting the module.", "Actual"),
  ];
}

function calculateValuation(data: EarningsCallDataset): ValuationResult {
  return {
    warning: `${data.ticker} module is an earnings-call intelligence module. Fair value is intentionally not underwritten here.`,
    currentPrice: data.currentPrice,
    priceDate: data.priceDate,
    fairValues: [
      { scenario: "Bear", fairValue: data.currentPrice * 0.85, upsideDownside: -0.15, expectedReturn3Y: -0.052, summary: "Placeholder only; not an underwriting valuation." },
      { scenario: "Base", fairValue: data.currentPrice, upsideDownside: 0, expectedReturn3Y: 0, summary: "Placeholder only; not an underwriting valuation." },
      { scenario: "Bull", fairValue: data.currentPrice * 1.15, upsideDownside: 0.15, expectedReturn3Y: 0.048, summary: "Placeholder only; not an underwriting valuation." },
    ],
    methodCards: [
      { key: "current-price", label: "Current Price Anchor", value: data.currentPrice, format: "currency", description: data.valuationNote },
    ],
    expectedReturnBridge: [
      { key: "eight-quarter-growth", label: "8Q Revenue Growth", value: data.quarters[data.quarters.length - 1].totalRevenue / Math.max(data.quarters[0].totalRevenue, 1) - 1, format: "percent" },
      { key: "current-price", label: "Current Price", value: data.currentPrice, format: "currency" },
    ],
    sensitivityTables: [
      {
        title: "Price Anchor Sensitivity",
        table: [
          ["Scenario", "Fair value", "Upside/downside"],
          ["Bear", Number((data.currentPrice * 0.85).toFixed(2)), -0.15],
          ["Base", Number(data.currentPrice.toFixed(2)), 0],
          ["Bull", Number((data.currentPrice * 1.15).toFixed(2)), 0.15],
        ],
      },
    ],
    recommendedFairValue: data.currentPrice,
    recommendedFairValueMethod: "Not underwritten",
    recommendedFairValueReason: data.valuationNote,
    valuationRangeLow: data.currentPrice * 0.85,
    valuationRangeBase: data.currentPrice,
    valuationRangeHigh: data.currentPrice * 1.15,
    upsideDownside: computeUpsideDownside(data.currentPrice, data.currentPrice),
    dataQualityScore: Math.min(100, data.evidence.length * 10),
    integrityScore: data.quarters.length === 8 ? 85 : 60,
  };
}

export function createEarningsCallModule(dataset: EarningsCallDataset): StockModule {
  const valuationConfig: StockValuationConfig = {
    ticker: dataset.ticker,
    modelType: "Eight-quarter earnings-call intelligence / market-focus trend",
    priceMetadata: {
      ticker: dataset.ticker,
      currentPrice: dataset.currentPrice,
      currency: "USD",
      unit: "share",
      asOfDate: dataset.priceDate,
      source: "actual",
      marketReference: dataset.currentPrice,
      provenance: "Dated public market snapshot; valuation is not underwritten in this module.",
    },
    assumptions: [],
    scenarios: [
      { name: "Bear", assumptions: {} },
      { name: "Base", assumptions: {} },
      { name: "Bull", assumptions: {} },
    ],
    calculateValuation: (_assumptions, data) => calculateValuation(data as EarningsCallDataset),
  };

  return {
    ticker: dataset.ticker,
    name: dataset.name,
    sector: dataset.sector,
    currency: "USD",
    description: dataset.moduleSummary,
    tabs: [
      { value: "calls", label: "Earnings Calls" },
      { value: "trend", label: "Trend Overview" },
      { value: "evidence", label: "Evidence" },
    ],
    periods: dataset.quarters.map((quarter) => ({ value: quarter.id, label: quarter.label })),
    data: dataset,
    getDefaultPeriod: () => dataset.currentPeriodId,
    calculateSummary: (data) => calculateSummary(data as EarningsCallDataset),
    calculateValuation: (data) => calculateValuation(data as EarningsCallDataset),
    valuationConfig,
    Dashboard: EarningsCallDashboard,
  };
}
