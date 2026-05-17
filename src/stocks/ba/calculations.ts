import type {
  DataSourceType,
  DataStatus,
  Scenario,
  SummaryMetric,
  ValuationResult,
  ValidationWarning,
} from "../types";
import { computeExpectedShareholderCagr, computeUpsideDownside, daysBetweenIso } from "../../utils/valuation";
import { baDataset } from "./data";
import { defaultBaValuationAssumptions, baScenarioPresets } from "./assumptions";
import { calculateBaBacklogEngine } from "./engines/backlogEngine";
import { calculateBaDefenseCycleEngine } from "./engines/defenseCycleEngine";
import { calculateBaDividendEngine } from "./engines/dividendEngine";
import { calculateBaMoatEngine } from "./engines/moatEngine";
import { calculateBaProgramExposureEngine } from "./engines/programExposureEngine";
import { calculateBaReportingEventsEngine } from "./engines/reportingEventEngine";
import { calculateBaRiskRedTeamEngine } from "./engines/riskRedTeamEngine";
import { calculateBaSegmentEngine } from "./engines/segmentEngine";
import { buildBaSensitivityTables, calculateBaValuationEngine } from "./engines/valuationEngine";
import type { BaDataset, BaValuationAssumptions } from "./model";

export { baDataset };
export { defaultBaValuationAssumptions, baScenarioPresets };

type BaRuntimeContext = {
  __baResolvedPeriod?: string;
  __baRequestedDataSourceType?: DataSourceType;
};

type BaDatasetInput = BaDataset & Partial<BaRuntimeContext>;

function metric(
  label: string,
  value: number,
  delta: number | undefined,
  format: SummaryMetric["format"],
  description: string,
  badge: SummaryMetric["badge"],
): SummaryMetric {
  return { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, value, delta, format, description, badge };
}

function isBaDataset(value: unknown): value is BaDatasetInput {
  return Boolean(value && typeof value === "object" && "ticker" in value && "segments" in value && "guidance" in value);
}

export function resolveBaDataset(data: unknown): BaDatasetInput {
  return isBaDataset(data) ? data : baDataset;
}

export function attachBaRuntimeContext(
  data: BaDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): BaDatasetInput {
  return {
    ...data,
    __baResolvedPeriod: context.periodId,
    __baRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultBaPeriod() {
  return "fy25";
}

export function getBaPeriods() {
  return baDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function resolveBaPeriodFromData(data: unknown, fallback = getDefaultBaPeriod()) {
  const dataset = resolveBaDataset(data);
  const runtimePeriod = dataset.__baResolvedPeriod;
  if (runtimePeriod && dataset.periods.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.periods.some((period) => period.id === fallback) ? fallback : getDefaultBaPeriod();
}

function getPeriod(data: BaDatasetInput, periodId = getDefaultBaPeriod()) {
  return data.periods.find((period) => period.id === periodId) ?? data.periods.find((period) => period.id === getDefaultBaPeriod()) ?? data.periods[data.periods.length - 1];
}

function buildDataSourceWarnings(data: BaDatasetInput): ValidationWarning[] {
  const requested = data.__baRequestedDataSourceType;
  const warnings: ValidationWarning[] = [];
  if (requested && requested !== "mock" && requested !== "manual") {
    warnings.push({
      id: "ba-unsupported-data-source",
      title: "Requested data source is not implemented for BA.L",
      detail: `BA.L currently uses the curated official-data module baseline plus manual valuation-assumption overrides. Requested source "${requested}" falls back to the module baseline.`,
      severity: "medium",
    });
  }
  if (requested === "manual") {
    warnings.push({
      id: "ba-manual-assumptions-active",
      title: "Manual valuation assumptions are active",
      detail: "Manual mode changes forecast assumptions only. It does not rewrite official actuals, guidance, or research-only notes.",
      severity: "low",
    });
  }
  return warnings;
}

function buildModelWarnings(data: BaDatasetInput, periodId: string, valuation: ReturnType<typeof calculateBaValuationEngine>) {
  const warnings: ValidationWarning[] = [...buildDataSourceWarnings(data), ...valuation.sourceIsolationWarnings];
  if (daysBetweenIso(data.marketData.priceDate, "2026-05-11") > 7) {
    warnings.push({
      id: "ba-stale-price",
      title: "Market price snapshot may be stale",
      detail: `BA.L price snapshot is dated ${data.marketData.priceDate}. Upside/downside and market-cap figures should be refreshed if the share price has moved.`,
      severity: "medium",
    });
  }
  if (valuation.dcf.terminalValueShareOfEv > 0.72) {
    warnings.push({
      id: "ba-terminal-value-heavy",
      title: "DCF terminal value is high",
      detail: `Terminal value is ${(valuation.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of enterprise value. Treat DCF as sensitive to WACC and terminal growth.`,
      severity: "medium",
    });
  }
  const weightSum = Object.values(valuation.finalWeights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(weightSum - 1) > 0.0001) {
    warnings.push({
      id: "ba-valuation-weight-sum",
      title: "Valuation weights do not sum to 100%",
      detail: `Weights sum to ${(weightSum * 100).toFixed(1)}%.`,
      severity: "high",
    });
  }
  const segment = calculateBaSegmentEngine(data, periodId);
  warnings.push(...segment.reconciliationWarnings);
  return warnings;
}

export function calculateBaSummary(data: unknown, periodId = getDefaultBaPeriod()): SummaryMetric[] {
  const dataset = resolveBaDataset(data);
  const period = getPeriod(dataset, periodId);
  const prior = dataset.periods.find((item) => item.fiscalYear === period.fiscalYear - 1);
  const backlog = calculateBaBacklogEngine(dataset, period.id);
  return [
    metric("Current Price", dataset.marketData.currentPriceGbp, undefined, "currency", dataset.marketData.notes, "Actual"),
    metric("Market Cap", dataset.marketData.marketCap, undefined, "number", "Derived from IR share price snapshot and FY2025 shares for EPS.", "Derived"),
    metric("Sales", period.sales, prior ? period.sales - prior.sales : undefined, "number", "BAE-defined sales, including share of equity-accounted investments.", "Actual"),
    metric("Underlying EBIT Margin", period.underlyingEbitMargin, prior ? period.underlyingEbitMargin - prior.underlyingEbitMargin : undefined, "percent", "Underlying EBIT / sales.", "Actual"),
    metric("Order Backlog", period.orderBacklog, prior ? period.orderBacklog - prior.orderBacklog : undefined, "number", "BAE-defined order backlog.", "Actual"),
    metric("Book-to-Bill", backlog.bookToBill, undefined, "multiple", "Order intake divided by sales.", "Derived"),
    metric("Backlog Coverage", backlog.backlogCoverageYears, undefined, "multiple", "Order backlog divided by annual sales.", "Derived"),
    metric("FCF Yield", dataset.marketData.fcfYield, undefined, "percent", "FY2025 FCF divided by derived market capitalization.", "Derived"),
  ];
}

export function calculateBaValuation(
  data: unknown,
  periodId = getDefaultBaPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<BaValuationAssumptions> = {},
): ValuationResult {
  const dataset = resolveBaDataset(data);
  const scenarioDefaults = baScenarioPresets[scenario] ?? defaultBaValuationAssumptions;
  const mergedAssumptions = { ...scenarioDefaults, ...assumptions };
  const backlog = calculateBaBacklogEngine(dataset, periodId);
  const valuation = calculateBaValuationEngine(dataset, scenario, mergedAssumptions, backlog);
  const warnings = buildModelWarnings(dataset, periodId, valuation);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const scenarioAssumptions = { ...baScenarioPresets[caseName], currentPrice: mergedAssumptions.currentPrice };
    const scenarioValuation = calculateBaValuationEngine(dataset, caseName, scenarioAssumptions, backlog);
    const targetPrice3Y = scenarioValuation.blendedFairValue * (1 + scenarioAssumptions.revenueCagr) ** 0.5;
    const cumulativeDividends = scenarioAssumptions.dividendPerShare * 3;
    return {
      scenario: caseName,
      fairValue: scenarioValuation.blendedFairValue,
      upsideDownside: computeUpsideDownside(scenarioValuation.blendedFairValue, scenarioAssumptions.currentPrice),
      expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y, scenarioAssumptions.currentPrice, cumulativeDividends),
      targetPrice3Y,
      cumulativeDividends,
      summary: dataset.defenseCycleScenarios.find((item) => item.scenario === caseName)?.narrative,
    };
  });
  const selectedPoint = fairValues.find((item) => item.scenario === scenario) ?? fairValues[1];

  return {
    currentPrice: mergedAssumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: warnings,
    warning: warnings.find((warning) => warning.severity === "high")?.title,
    fairValues,
    methodCards: [
      {
        key: "dcf",
        label: "DCF Fair Value",
        value: valuation.dcf.fairValuePerShare,
        format: "currency",
        description: "FCFF DCF using unlevered FCF, WACC, terminal growth, net debt, leases, pension surplus, and diluted shares.",
      },
      {
        key: "fcf-yield",
        label: "FCF Yield Value",
        value: valuation.fcfYieldFairValue,
        format: "currency",
        description: "Normalized equity FCF capitalized by target FCF yield.",
      },
      {
        key: "ev-ebit",
        label: "EV / EBIT Value",
        value: valuation.evEbitFairValue,
        format: "currency",
        description: "Forward underlying EBIT cross-check net of debt and lease liabilities, with pension surplus credit.",
      },
      {
        key: "pe",
        label: "P/E Value",
        value: valuation.peFairValue,
        format: "currency",
        description: "Forward EPS cross-check from operating assumptions, net finance costs, tax, NCI, and target P/E.",
      },
      {
        key: "backlog",
        label: "Backlog Durability Layer",
        value: valuation.backlogAdjustedFairValue,
        format: "currency",
        description: "Risk-adjusted core value informed by backlog coverage and book-to-bill; not a standalone capitalization of qualitative notes.",
      },
    ],
    expectedReturnBridge: [
      { key: "current-price", label: "Current Price", value: mergedAssumptions.currentPrice, format: "currency" },
      { key: "fair-value", label: "Selected Fair Value", value: selectedPoint.fairValue, format: "currency" },
      { key: "upside", label: "Upside / Downside", value: selectedPoint.upsideDownside, format: "percent" },
      { key: "target-price", label: "3Y Target Price", value: selectedPoint.targetPrice3Y ?? selectedPoint.fairValue, format: "currency" },
      { key: "dividends", label: "3Y Dividends", value: selectedPoint.cumulativeDividends ?? 0, format: "currency" },
      { key: "expected-return", label: "Expected 3Y CAGR", value: selectedPoint.expectedReturn3Y, format: "percent" },
    ],
    customSummary: `BA.L ${scenario} case fair value is £${selectedPoint.fairValue.toFixed(2)} with backlog coverage of ${backlog.backlogCoverageYears.toFixed(1)}x sales and book-to-bill of ${backlog.bookToBill.toFixed(2)}x.`,
    sensitivityTables: buildBaSensitivityTables(dataset, mergedAssumptions, backlog),
    peFairValue: valuation.peFairValue,
    fcfFairValue: valuation.fcfYieldFairValue,
    dcfValue: valuation.dcf.fairValuePerShare,
    blendedFairValue: valuation.blendedFairValue,
    recommendedFairValue: valuation.blendedFairValue,
    recommendedFairValueMethod: "DCF / FCF yield / EV-EBIT / PE with backlog durability layer",
    recommendedFairValueReason:
      "DCF and FCF yield anchor the cash-generative defence prime economics; EV/EBIT and P/E triangulate market convention; backlog durability influences risk-adjusted confidence rather than directly capitalising qualitative programme notes.",
    valuationRangeLow: valuation.valuationRangeLow,
    valuationRangeBase: valuation.blendedFairValue,
    valuationRangeHigh: valuation.valuationRangeHigh,
    probabilityWeightedFairValue: valuation.probabilityWeightedFairValue,
    targetPrice3Y: selectedPoint.targetPrice3Y,
    expectedReturn3Y: selectedPoint.expectedReturn3Y,
    upsideDownside: selectedPoint.upsideDownside,
    dataQualityScore: warnings.some((warning) => warning.severity === "high") ? 72 : warnings.length ? 84 : 92,
    recommendedValuationConfidence: Math.min(92, backlog.backlogDurabilityScore),
  };
}

export function buildBaDashboardData(data: unknown, periodId = getDefaultBaPeriod(), scenario: Scenario = "Base") {
  const dataset = resolveBaDataset(data);
  const period = getPeriod(dataset, periodId);
  const segment = calculateBaSegmentEngine(dataset, period.id);
  const backlog = calculateBaBacklogEngine(dataset, period.id);
  const defenseCycle = calculateBaDefenseCycleEngine(dataset, scenario);
  const programs = calculateBaProgramExposureEngine(dataset);
  const reportingEvents = calculateBaReportingEventsEngine(dataset);
  const moat = calculateBaMoatEngine(segment, backlog);
  const risks = calculateBaRiskRedTeamEngine(dataset);
  const dividend = calculateBaDividendEngine(dataset, period.id);
  const assumptions = baScenarioPresets[scenario] ?? defaultBaValuationAssumptions;
  const valuationEngine = calculateBaValuationEngine(dataset, scenario, assumptions, backlog);
  const valuation = calculateBaValuation(dataset, period.id, scenario, assumptions);
  const dataStatus: DataStatus = {
    sourceType: dataset.__baRequestedDataSourceType === "manual" ? "manual" : "mock",
    lastUpdated: dataset.marketData.priceDate,
    missingFields: [
      "live yfinance market-cap feed",
      "machine-parsed annual-report PDF tables",
      "programme-level revenue and margin disclosure",
      "segment prior-year backlog for all sectors",
      "peer historical multiple set",
    ],
    validationWarnings: [...(valuation.validationWarnings ?? []), ...reportingEvents.warnings],
    valuationReliable: !(valuation.validationWarnings ?? []).some((warning) => warning.severity === "high"),
  };

  return {
    dataset,
    period,
    summary: calculateBaSummary(dataset, period.id),
    segment,
    backlog,
    defenseCycle,
    programs,
    reportingEvents,
    moat,
    risks,
    dividend,
    valuation,
    valuationEngine,
    dataStatus,
  };
}
