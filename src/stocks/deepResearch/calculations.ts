import type {
  DataQualityBadgeType,
  MetricFormat,
  Scenario,
  StockValuationConfig,
  SummaryMetric,
  ValuationResult,
  ValuationScenarioPoint,
  ValidationWarning,
} from "../types";
import {
  buildPriceAnchorWarnings,
  buildSourceGapWarnings,
  deriveValuationReliability,
  mapSourceStatusToDataQualityTag,
  mergeValidationWarnings,
} from "../../utils/validation";
import type { DeepResearchDataset, DeepResearchSourceStatus, DeepResearchValuationAssumptions } from "./model";

export function resolveDeepResearchDataset(data: unknown): DeepResearchDataset {
  return data as DeepResearchDataset;
}

export function getDeepResearchPeriods(dataset: DeepResearchDataset) {
  return dataset.periods;
}

export function getDefaultDeepResearchPeriod(dataset: DeepResearchDataset) {
  return dataset.periods[0]?.value ?? "latest";
}

export function calculateDeepResearchSummary(data: unknown): SummaryMetric[] {
  return resolveDeepResearchDataset(data).summaryMetrics;
}

function toBadge(status: DeepResearchSourceStatus): DataQualityBadgeType {
  return mapSourceStatusToDataQualityTag(status);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function presentValue(value: number, discountRate: number, years: number) {
  return value / Math.pow(1 + discountRate, years);
}

function buildScenarioPoint(
  scenario: Scenario,
  assumptions: DeepResearchValuationAssumptions,
  summary: string,
): ValuationScenarioPoint & { dcfValue: number; fcfMultipleValue: number; revenueMultipleValue: number } {
  const revenueBase = finite(assumptions.revenueBase);
  const revenueCagr3Y = clamp(finite(assumptions.revenueCagr3Y), -0.25, 0.8);
  const terminalGrowth = clamp(finite(assumptions.terminalGrowth), -0.02, 0.06);
  const normalizedFcfMargin = clamp(finite(assumptions.normalizedFcfMargin), -0.2, 0.65);
  const exitFcfMultiple = clamp(finite(assumptions.exitFcfMultiple), 1, 80);
  const evRevenueMultiple = clamp(finite(assumptions.evRevenueMultiple), 0, 50);
  const discountRate = clamp(finite(assumptions.discountRate), 0.04, 0.25);
  const netCashDebt = finite(assumptions.netCashDebt);
  const dilutedShares = Math.max(1, finite(assumptions.dilutedShares, 1));
  const qualityAdjustment = clamp(finite(assumptions.qualityAdjustment, 1), 0.5, 1.5);
  const riskHaircut = clamp(finite(assumptions.riskHaircut), 0, 0.6);
  const shareholderYield = finite(assumptions.dividendYield) + finite(assumptions.buybackYield);

  const riskAdjustedMultiplier = qualityAdjustment * (1 - riskHaircut);
  const forwardRevenue = revenueBase * Math.pow(1 + revenueCagr3Y, 3);
  const forwardFcf = forwardRevenue * normalizedFcfMargin;
  const fcfMultipleEquity = forwardFcf * exitFcfMultiple + netCashDebt;
  const revenueMultipleEquity = forwardRevenue * evRevenueMultiple + netCashDebt;

  const fcfMultipleValue = presentValue(fcfMultipleEquity / dilutedShares, discountRate, 2) * riskAdjustedMultiplier;
  const revenueMultipleValue = presentValue(revenueMultipleEquity / dilutedShares, discountRate, 2) * riskAdjustedMultiplier;

  const cashFlows = Array.from({ length: 5 }, (_, index) => {
    const year = index + 1;
    const growthFade = revenueCagr3Y - ((revenueCagr3Y - terminalGrowth) * index) / 4;
    const revenue = revenueBase * Math.pow(1 + growthFade, year);
    const marginRamp = normalizedFcfMargin * (0.8 + 0.04 * index);
    return revenue * marginRamp;
  });
  const pvCashFlows = cashFlows.reduce((sum, cashFlow, index) => sum + presentValue(cashFlow, discountRate, index + 1), 0);
  const terminalFcf = cashFlows[cashFlows.length - 1] * (1 + terminalGrowth);
  const terminalValue = terminalFcf / Math.max(0.01, discountRate - terminalGrowth);
  const dcfValue = ((pvCashFlows + presentValue(terminalValue, discountRate, 5) + netCashDebt) / dilutedShares) * riskAdjustedMultiplier;

  const fairValue = dcfValue * 0.45 + fcfMultipleValue * 0.35 + revenueMultipleValue * 0.2;
  const targetPrice3Y = fairValue * Math.pow(1 + shareholderYield, 3);
  const currentPrice = Math.max(0.01, finite(assumptions.currentPrice, 0.01));
  const expectedReturn3Y = Math.pow(Math.max(0.01, targetPrice3Y) / currentPrice, 1 / 3) - 1;

  return {
    scenario,
    fairValue,
    upsideDownside: fairValue / currentPrice - 1,
    expectedReturn3Y,
    targetPrice3Y,
    summary,
    dcfValue,
    fcfMultipleValue,
    revenueMultipleValue,
  };
}

function buildWarnings(dataset: DeepResearchDataset, assumptions: DeepResearchValuationAssumptions): ValidationWarning[] {
  const sourceWarnings = buildSourceGapWarnings(
    dataset.ticker,
    dataset.sourceGaps.map((gap, index) => ({
      key: `source-gap-${index + 1}`,
      label: gap,
      value: null,
      severity: "medium" as const,
    })),
  );
  const priceWarnings = buildPriceAnchorWarnings({
    ticker: dataset.ticker,
    currentPrice: assumptions.currentPrice,
    marketReference: dataset.marketData.currentPrice,
    priceDate: dataset.marketData.priceDate,
  });
  const historyWarnings: ValidationWarning[] = dataset.historicalValuations.some((row) => row.sourceStatus !== "official_actual" && row.sourceStatus !== "market_data")
    ? [
        {
          id: `${dataset.ticker.toLowerCase()}-historical-valuation-local-fallback`,
          title: "Historical valuation is local research fallback",
          detail:
            "Historical event rows are shown in the MSFT/AAPL UX pattern but are not yet persisted in the unified backend daily price/valuation tables.",
          severity: "medium",
        },
      ]
    : [];
  return mergeValidationWarnings(sourceWarnings, priceWarnings, historyWarnings);
}

export function calculateDeepResearchValuation(
  data: unknown,
  rawAssumptions?: Partial<DeepResearchValuationAssumptions>,
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolveDeepResearchDataset(data);
  const baseAssumptions = dataset.valuation.scenarios[scenario] ?? dataset.valuation.defaultAssumptions;
  const assumptions = { ...baseAssumptions, ...rawAssumptions };
  const currentPrice = assumptions.currentPrice || dataset.marketData.currentPrice;
  const warnings = buildWarnings(dataset, assumptions);
  const reliable = deriveValuationReliability({
    warnings,
    sourceStatuses: [
      dataset.marketData.sourceStatus,
      ...dataset.historicalValuations.map((row) => row.sourceStatus),
      ...dataset.kpiSeries.map((series) => series.sourceStatus),
    ],
  });

  const points = (["Bear", "Base", "Bull"] as Scenario[]).map((item) =>
    buildScenarioPoint(item, dataset.valuation.scenarios[item], `${dataset.ticker} ${item} case uses distinct revenue, margin, multiple and risk assumptions.`),
  );
  const selected = buildScenarioPoint(scenario, assumptions, `${dataset.ticker} active ${scenario} case with current manual overrides.`);
  const fcfFairValue = selected.fcfMultipleValue;
  const dcfValue = selected.dcfValue;
  const salesFairValue = selected.revenueMultipleValue;

  return {
    currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: warnings,
    warning: reliable.reliable ? undefined : "Valuation reliability is limited by source gaps and local fallback historical rows.",
    fairValues: points.map(({ dcfValue: _dcf, fcfMultipleValue: _fcf, revenueMultipleValue: _sales, ...point }) => point),
    methodCards: [
      {
        key: "dcf",
        label: "DCF fair value",
        value: dcfValue,
        format: "currency",
        description: "Five-year revenue fade, normalized FCF margin and terminal growth. No current trading multiple is used.",
        sourceConfidence: "medium",
      },
      {
        key: "fcf-multiple",
        label: "Forward FCF multiple",
        value: fcfFairValue,
        format: "currency",
        description: "Three-year forward FCF capitalized at the scenario exit FCF multiple and discounted back.",
        sourceConfidence: "medium",
      },
      {
        key: "revenue-multiple",
        label: "EV / revenue cross-check",
        value: salesFairValue,
        format: "currency",
        description: "Revenue multiple cross-check is weighted lower and mainly supports high-growth / negative-FCF cases.",
        sourceConfidence: "low",
      },
      {
        key: "blended",
        label: "Blended fair value",
        value: selected.fairValue,
        format: "currency",
        description: dataset.valuation.modelDescription,
        sourceConfidence: reliable.reliable ? "medium" : "low",
      },
    ],
    expectedReturnBridge: [
      {
        key: "revenue-growth",
        label: "3Y revenue CAGR",
        value: assumptions.revenueCagr3Y,
        format: "percent",
        description: "Explicit scenario assumption, not a price-derived plug.",
      },
      {
        key: "fcf-margin",
        label: "Normalized FCF margin",
        value: assumptions.normalizedFcfMargin,
        format: "percent",
      },
      {
        key: "risk-haircut",
        label: "Model risk haircut",
        value: assumptions.riskHaircut,
        format: "percent",
      },
      {
        key: "expected-return",
        label: "3Y expected CAGR",
        value: selected.expectedReturn3Y,
        format: "percent",
      },
    ],
    sensitivityTables: [
      {
        title: "FCF margin / exit multiple sensitivity",
        table: [
          ["Margin / Multiple", `${(assumptions.exitFcfMultiple - 4).toFixed(1)}x`, `${assumptions.exitFcfMultiple.toFixed(1)}x`, `${(assumptions.exitFcfMultiple + 4).toFixed(1)}x`],
          [
            `${((assumptions.normalizedFcfMargin - 0.03) * 100).toFixed(1)}%`,
            Math.max(0, fcfFairValue * 0.82).toFixed(1),
            Math.max(0, fcfFairValue * 0.92).toFixed(1),
            Math.max(0, fcfFairValue * 1.02).toFixed(1),
          ],
          [
            `${(assumptions.normalizedFcfMargin * 100).toFixed(1)}%`,
            Math.max(0, fcfFairValue * 0.9).toFixed(1),
            Math.max(0, fcfFairValue).toFixed(1),
            Math.max(0, fcfFairValue * 1.1).toFixed(1),
          ],
          [
            `${((assumptions.normalizedFcfMargin + 0.03) * 100).toFixed(1)}%`,
            Math.max(0, fcfFairValue * 0.98).toFixed(1),
            Math.max(0, fcfFairValue * 1.1).toFixed(1),
            Math.max(0, fcfFairValue * 1.22).toFixed(1),
          ],
        ],
      },
    ],
    fcfFairValue,
    dcfValue,
    recommendedFairValue: selected.fairValue,
    recommendedFairValueMethod: "DCF / FCF multiple / revenue cross-check",
    recommendedFairValueReason: dataset.valuation.noFutureLeakageNote,
    targetPrice3Y: selected.targetPrice3Y,
    expectedReturn3Y: selected.expectedReturn3Y,
    upsideDownside: selected.upsideDownside,
    valuationRangeLow: points[0]?.fairValue,
    valuationRangeBase: points[1]?.fairValue,
    valuationRangeHigh: points[2]?.fairValue,
    dataQualityScore: reliable.score,
    overallIntegrityScore: reliable.score,
  };
}

export function buildDeepResearchValuationConfig(
  dataset: DeepResearchDataset,
  calculateValuation: StockValuationConfig["calculateValuation"],
): Omit<StockValuationConfig, "priceMetadata"> {
  const defaults = dataset.valuation.defaultAssumptions;
  const assumptionConfig = [
    ["currentPrice", "Current price", defaults.currentPrice, 0, defaults.currentPrice * 3, 1, "currency", "Market data"],
    ["revenueBase", "Revenue base", defaults.revenueBase, 0, Math.max(defaults.revenueBase * 3, 1000), 100, "currency", "Financial model"],
    ["revenueCagr3Y", "3Y revenue CAGR", defaults.revenueCagr3Y, -0.2, 0.7, 0.01, "percent", "Growth"],
    ["normalizedFcfMargin", "Normalized FCF margin", defaults.normalizedFcfMargin, -0.15, 0.55, 0.01, "percent", "Cash conversion"],
    ["exitFcfMultiple", "Exit FCF multiple", defaults.exitFcfMultiple, 4, 70, 1, "multiple", "Terminal value"],
    ["evRevenueMultiple", "EV / revenue cross-check", defaults.evRevenueMultiple, 0, 40, 0.25, "multiple", "Cross-check"],
    ["discountRate", "Discount rate", defaults.discountRate, 0.05, 0.2, 0.005, "percent", "Risk"],
    ["terminalGrowth", "Terminal growth", defaults.terminalGrowth, -0.02, 0.05, 0.005, "percent", "Terminal value"],
    ["netCashDebt", "Net cash / debt", defaults.netCashDebt, -100000, 100000, 250, "currency", "Balance sheet"],
    ["dilutedShares", "Diluted shares", defaults.dilutedShares, 1, Math.max(defaults.dilutedShares * 2, 10), 1, "number", "Share count"],
    ["qualityAdjustment", "Quality adjustment", defaults.qualityAdjustment, 0.6, 1.35, 0.01, "number", "Moat / execution"],
    ["riskHaircut", "Risk haircut", defaults.riskHaircut, 0, 0.5, 0.01, "percent", "Risk"],
    ["dividendYield", "Dividend yield", defaults.dividendYield, 0, 0.08, 0.0025, "percent", "Capital return"],
    ["buybackYield", "Buyback yield", defaults.buybackYield, -0.05, 0.08, 0.0025, "percent", "Capital return"],
  ] as const;

  return {
    ticker: dataset.ticker,
    modelType: `${dataset.ticker.toLowerCase()}_deep_research_local_history_v1`,
    assumptions: assumptionConfig.map(([key, label, value, min, max, step, format, category]) => ({
      key,
      label,
      value,
      min,
      max,
      step,
      format,
      source: key === "currentPrice" ? ("actual" as const) : ("assumption" as const),
      description: `${dataset.ticker} ${label.toLowerCase()} input. ${dataset.valuation.noFutureLeakageNote}`,
      category,
      unit: format === "currency" ? ("USD" as const) : format === "percent" ? ("percent" as const) : format === "multiple" ? ("multiple" as const) : ("number" as const),
      periodicity: key === "currentPrice" ? ("quarterly" as const) : ("forward annual" as const),
      asOfDate: dataset.marketData.priceDate,
      provenance: toBadge(dataset.marketData.sourceStatus),
    })),
    scenarios: (["Bear", "Base", "Bull"] as Scenario[]).map((name) => ({
      name,
      assumptions: dataset.valuation.scenarios[name],
    })),
    calculateValuation,
  };
}

export function formatMetricValue(value: number, format: MetricFormat) {
  if (!Number.isFinite(value)) return "n/a";
  if (format === "currency") return `$${value.toLocaleString(undefined, { maximumFractionDigits: value > 100 ? 0 : 1 })}`;
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  if (format === "multiple") return `${value.toFixed(1)}x`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
