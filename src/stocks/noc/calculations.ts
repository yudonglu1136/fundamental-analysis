import type {
  DataSourceType,
  DataStatus,
  Scenario,
  SummaryMetric,
  ValuationResult,
  ValidationWarning,
} from "../types";
import { computeExpectedShareholderCagr, computeUpsideDownside, daysBetweenIso } from "../../utils/valuation";
import { nocDataset } from "./data";
import { defaultNocValuationAssumptions, nocScenarioPresets } from "./assumptions";
import { calculateNocBacklogEngine } from "./engines/backlogEngine";
import { calculateNocBudgetScenarioEngine } from "./engines/budgetScenarioEngine";
import { calculateNocCapitalReturnsEngine } from "./engines/capitalReturnsEngine";
import { calculateNocProgramExposureEngine } from "./engines/programExposureEngine";
import { calculateNocRiskRedTeamEngine } from "./engines/riskRedTeamEngine";
import { calculateNocSegmentEngine } from "./engines/segmentEngine";
import { buildNocSensitivityTables, calculateNocValuationEngine } from "./engines/valuationEngine";
import type { NocDataset, NocEarningsCallTopic, NocValuationAssumptions } from "./model";

export { nocDataset };
export { defaultNocValuationAssumptions, nocScenarioPresets };

type NocRuntimeContext = {
  __nocResolvedPeriod?: string;
  __nocRequestedDataSourceType?: DataSourceType;
};

type NocDatasetInput = NocDataset & Partial<NocRuntimeContext>;

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

function isNocDataset(value: unknown): value is NocDatasetInput {
  return Boolean(value && typeof value === "object" && "ticker" in value && (value as { ticker?: string }).ticker === "NOC" && "segments" in value);
}

export function resolveNocDataset(data: unknown): NocDatasetInput {
  return isNocDataset(data) ? data : nocDataset;
}

export function attachNocRuntimeContext(
  data: NocDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): NocDatasetInput {
  return {
    ...data,
    __nocResolvedPeriod: context.periodId,
    __nocRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultNocPeriod() {
  return "q1-26";
}

export function getNocPeriods() {
  return nocDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function resolveNocPeriodFromData(data: unknown, fallback = getDefaultNocPeriod()) {
  const dataset = resolveNocDataset(data);
  const runtimePeriod = dataset.__nocResolvedPeriod;
  if (runtimePeriod && dataset.periods.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.periods.some((period) => period.id === fallback) ? fallback : getDefaultNocPeriod();
}

function getPeriod(data: NocDatasetInput, periodId = getDefaultNocPeriod()) {
  return data.periods.find((period) => period.id === periodId) ?? data.periods.find((period) => period.id === getDefaultNocPeriod()) ?? data.periods[data.periods.length - 1];
}

function annualizeIfQuarter(value: number, periodType: "annual" | "quarter") {
  return periodType === "quarter" ? value * 4 : value;
}

function buildDataSourceWarnings(data: NocDatasetInput): ValidationWarning[] {
  const requested = data.__nocRequestedDataSourceType;
  const warnings: ValidationWarning[] = [];
  if (requested && requested !== "mock" && requested !== "manual") {
    warnings.push({
      id: "noc-unsupported-data-source",
      title: "Requested data source is not implemented for NOC",
      detail: `NOC currently uses the curated official-data module baseline plus manual valuation-assumption overrides. Requested source "${requested}" falls back to the module baseline.`,
      severity: "medium",
    });
  }
  if (requested === "manual") {
    warnings.push({
      id: "noc-manual-assumptions-active",
      title: "Manual valuation assumptions are active",
      detail: "Manual mode changes forecast assumptions only. It does not rewrite official actuals, guidance, programme notes, or market data.",
      severity: "low",
    });
  }
  return warnings;
}

function buildModelWarnings(data: NocDatasetInput, periodId: string, valuation: ReturnType<typeof calculateNocValuationEngine>) {
  const warnings: ValidationWarning[] = [...buildDataSourceWarnings(data), ...valuation.sourceIsolationWarnings];
  if (daysBetweenIso(data.marketData.priceDate, "2026-05-11") > 7) {
    warnings.push({
      id: "noc-stale-price",
      title: "Market price snapshot may be stale",
      detail: `NOC price snapshot is dated ${data.marketData.priceDate}. Refresh before using upside/downside for live trading work.`,
      severity: "medium",
    });
  }
  if (valuation.dcf.terminalValueShareOfEv > 0.75) {
    warnings.push({
      id: "noc-terminal-value-heavy",
      title: "DCF terminal value is high",
      detail: `Terminal value is ${(valuation.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of enterprise value. Treat DCF as sensitive to WACC and terminal growth.`,
      severity: "medium",
    });
  }
  const segment = calculateNocSegmentEngine(data, periodId);
  warnings.push(...segment.reconciliationWarnings);
  return warnings;
}

export function calculateNocSummary(data: unknown, periodId = getDefaultNocPeriod()): SummaryMetric[] {
  const dataset = resolveNocDataset(data);
  const period = getPeriod(dataset, periodId);
  const prior = period.id === "q1-26" ? dataset.periods.find((item) => item.id === "fy25") : dataset.periods.find((item) => item.fiscalYear === period.fiscalYear - 1 && item.periodType === "annual");
  const backlog = calculateNocBacklogEngine(dataset, period.id);
  return [
    metric("Current Price", dataset.marketData.currentPrice, undefined, "currency", dataset.marketData.notes, "Placeholder"),
    metric("Sales", period.sales, prior ? annualizeIfQuarter(period.sales, period.periodType) - prior.sales : undefined, "number", `${period.label} sales. Quarterly periods are annualized for delta context only.`, "Actual"),
    metric("Segment Op Margin", period.segmentOperatingMargin, prior ? period.segmentOperatingMargin - prior.segmentOperatingMargin : undefined, "percent", "Segment operating income divided by sales.", "Actual"),
    metric("Free Cash Flow", period.freeCashFlow, prior && period.periodType === "annual" ? period.freeCashFlow - prior.freeCashFlow : undefined, "number", "Operating cash flow less capital expenditures.", "Actual"),
    metric("Backlog", period.totalBacklog, prior ? period.totalBacklog - prior.totalBacklog : undefined, "number", "Funded plus unfunded backlog.", "Actual"),
    metric("Funded Backlog Ratio", backlog.fundedRatio, undefined, "percent", "Funded backlog divided by total backlog.", "Derived"),
    metric("Book-to-Bill", backlog.bookToBill, undefined, "multiple", "Net awards divided by sales.", "Derived"),
    metric("FCF Yield", dataset.marketData.fcfYield, undefined, "percent", "FY2025 FCF divided by isolated market-cap snapshot.", "Derived"),
  ];
}

export function calculateNocValuation(
  data: unknown,
  periodId = getDefaultNocPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<NocValuationAssumptions> = {},
): ValuationResult {
  const dataset = resolveNocDataset(data);
  const scenarioDefaults = nocScenarioPresets[scenario] ?? defaultNocValuationAssumptions;
  const mergedAssumptions = { ...scenarioDefaults, ...assumptions };
  const backlog = calculateNocBacklogEngine(dataset, periodId);
  const valuation = calculateNocValuationEngine(dataset, scenario, mergedAssumptions, backlog);
  const warnings = buildModelWarnings(dataset, periodId, valuation);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const scenarioAssumptions = { ...nocScenarioPresets[caseName], currentPrice: mergedAssumptions.currentPrice };
    const scenarioValuation = calculateNocValuationEngine(dataset, caseName, scenarioAssumptions, backlog);
    const targetPrice3Y = scenarioValuation.blendedFairValue * (1 + scenarioAssumptions.revenueCagr) ** 0.5;
    const cumulativeDividends = scenarioAssumptions.dividendPerShare * 3;
    return {
      scenario: caseName,
      fairValue: scenarioValuation.blendedFairValue,
      upsideDownside: computeUpsideDownside(scenarioValuation.blendedFairValue, scenarioAssumptions.currentPrice),
      expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y, scenarioAssumptions.currentPrice, cumulativeDividends),
      targetPrice3Y,
      cumulativeDividends,
      summary: dataset.budgetScenarios.find((item) => item.scenario === caseName)?.narrative,
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
        label: "Defense FCFF DCF",
        value: valuation.dcf.fairValuePerShare,
        format: "currency",
        description: "FCFF DCF using segment operating margin, B-21 scale, Sentinel risk charge, Space growth premium, WACC and terminal growth.",
      },
      {
        key: "fcf-yield",
        label: "FCF Yield Value",
        value: valuation.fcfYieldFairValue,
        format: "currency",
        description: "Normalized FCF capitalized by target FCF yield, cross-checked to management FY2026 FCF guidance.",
      },
      {
        key: "ev-ebit",
        label: "EV / EBIT Value",
        value: valuation.evEbitFairValue,
        format: "currency",
        description: "Forward segment operating income multiple less net debt plus pension surplus credit.",
      },
      {
        key: "pe",
        label: "P/E Value",
        value: valuation.peFairValue,
        format: "currency",
        description: "Forward MTM-adjusted EPS / model EPS cross-check.",
      },
      {
        key: "sotp",
        label: "Segment SOTP",
        value: valuation.sotpFairValue,
        format: "currency",
        description: "Segment-level EV/EBIT cross-check with different multiples for Aero, Defense, Mission and Space.",
      },
      {
        key: "backlog",
        label: "Backlog Durability Layer",
        value: valuation.backlogAdjustedFairValue,
        format: "currency",
        description: "Core value adjusted by funded/unfunded backlog, book-to-bill and coverage. It is a discipline layer, not a capitalization of press releases.",
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
    customSummary: `NOC ${scenario} case fair value is $${selectedPoint.fairValue.toFixed(0)} with backlog coverage of ${backlog.backlogCoverageYears.toFixed(1)}x annualized sales and funded backlog at ${(backlog.fundedRatio * 100).toFixed(1)}% of total backlog.`,
    sensitivityTables: buildNocSensitivityTables(dataset, mergedAssumptions, backlog),
    peFairValue: valuation.peFairValue,
    fcfFairValue: valuation.fcfYieldFairValue,
    dcfValue: valuation.dcf.fairValuePerShare,
    sotpFairValue: valuation.sotpFairValue,
    blendedFairValue: valuation.blendedFairValue,
    recommendedFairValue: valuation.blendedFairValue,
    recommendedFairValueMethod: "DCF / FCF yield / EV-EBIT / P/E / SOTP with backlog durability layer",
    recommendedFairValueReason:
      "NOC needs method triangulation because the company combines long-duration bomber/nuclear/space programs, high-margin mission electronics, material fixed-price exposure, and backlog visibility with uneven cash conversion timing.",
    valuationRangeLow: valuation.valuationRangeLow,
    valuationRangeBase: valuation.blendedFairValue,
    valuationRangeHigh: valuation.valuationRangeHigh,
    probabilityWeightedFairValue: valuation.probabilityWeightedFairValue,
    targetPrice3Y: selectedPoint.targetPrice3Y,
    expectedReturn3Y: selectedPoint.expectedReturn3Y,
    upsideDownside: selectedPoint.upsideDownside,
    dataQualityScore: warnings.some((warning) => warning.severity === "high") ? 70 : warnings.length ? 82 : 92,
    recommendedValuationConfidence: Math.min(92, backlog.backlogDurabilityScore),
  };
}

export function buildNocDashboardData(data: unknown, periodId = getDefaultNocPeriod(), scenario: Scenario = "Base") {
  const dataset = resolveNocDataset(data);
  const period = getPeriod(dataset, periodId);
  const segment = calculateNocSegmentEngine(dataset, period.id);
  const backlog = calculateNocBacklogEngine(dataset, period.id);
  const budget = calculateNocBudgetScenarioEngine(dataset, scenario);
  const programs = calculateNocProgramExposureEngine(dataset);
  const risks = calculateNocRiskRedTeamEngine(dataset);
  const capitalReturns = calculateNocCapitalReturnsEngine(dataset, period.periodType === "annual" ? period.id : "fy25");
  const assumptions = nocScenarioPresets[scenario] ?? defaultNocValuationAssumptions;
  const valuationEngine = calculateNocValuationEngine(dataset, scenario, assumptions, backlog);
  const valuation = calculateNocValuation(dataset, period.id, scenario, assumptions);
  const earningsCalls = buildNocEarningsCallDashboard(dataset);
  const dataStatus: DataStatus = {
    sourceType: dataset.__nocRequestedDataSourceType === "manual" ? "manual" : "mock",
    lastUpdated: dataset.latestReportingPeriod,
    missingFields: [
      "live share-price feed and consensus estimate feed",
      "machine-parsed PDF table extraction from cached official files",
      "program-level revenue/margin disclosure for B-21, Sentinel and classified programs",
      "peer live multiple set for LMT / RTX / GD / BAE / HII",
      "updated FY2026 10-Q once filed after the Q1 2026 release",
    ],
    validationWarnings: valuation.validationWarnings ?? [],
    valuationReliable: !(valuation.validationWarnings ?? []).some((warning) => warning.severity === "high"),
  };

  return {
    dataset,
    period,
    summary: calculateNocSummary(dataset, period.id),
    segment,
    backlog,
    budget,
    programs,
    risks,
    earningsCalls,
    capitalReturns,
    valuation,
    valuationEngine,
    dataStatus,
  };
}

export function buildNocEarningsCallDashboard(data: NocDataset) {
  const records = data.earningsCalls.records;
  const topics = Object.keys(records[0]?.topicScores ?? {}) as NocEarningsCallTopic[];
  const trendRows = records
    .slice()
    .reverse()
    .map((record) => ({
      quarter: record.fiscalQuarter,
      ...record.topicScores,
    }));
  const latest = records[0];
  const oldest = records[records.length - 1];
  const topicMomentum = topics
    .map((topic) => ({
      topic,
      latestScore: latest?.topicScores[topic] ?? 0,
      eightQuarterChange: (latest?.topicScores[topic] ?? 0) - (oldest?.topicScores[topic] ?? 0),
      averageScore: records.reduce((sum, record) => sum + record.topicScores[topic], 0) / Math.max(records.length, 1),
    }))
    .sort((a, b) => Math.abs(b.eightQuarterChange) - Math.abs(a.eightQuarterChange));
  return {
    ...data.earningsCalls,
    topics,
    trendRows,
    topicMomentum,
    selectedDefaultId: records[0]?.id,
  };
}
