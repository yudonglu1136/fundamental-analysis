import type { DataSourceType, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import type { DefenseDataset, DefenseScenarioAssumption, DefenseValuationAssumptions } from "./model";

type RuntimeDefenseDataset = DefenseDataset & {
  __resolvedPeriod?: string;
  __requestedDataSourceType?: DataSourceType;
};

function safeRatio(numerator: number | undefined, denominator: number | undefined, fallback = 0) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !denominator) return fallback;
  return (numerator as number) / (denominator as number);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function metric(label: string, value: number, format: SummaryMetric["format"], description: string, badge: SummaryMetric["badge"], delta?: number): SummaryMetric {
  return { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, value, delta, format, description, badge };
}

function getLatestPeriod(data: DefenseDataset) {
  return data.periods.find((period) => period.periodType === "FY") ?? data.periods[0];
}

function scenarioPreset(data: DefenseDataset, scenario: Scenario) {
  return data.scenarios.find((item) => item.scenario === scenario) ?? data.scenarios.find((item) => item.scenario === "Base") ?? data.scenarios[0];
}

function assumptionsForScenario(data: DefenseDataset, scenario: Scenario): DefenseValuationAssumptions {
  const preset = scenarioPreset(data, scenario);
  return {
    ...data.assumptions,
    revenueCagr: preset.revenueCagr,
    operatingMargin: preset.operatingMargin,
    wacc: preset.wacc,
    terminalGrowth: preset.terminalGrowth,
    targetFcfYield: preset.targetFcfYield,
    targetPe: preset.targetPe,
    targetEvEbit: preset.targetEvEbit,
  };
}

export function attachDefenseRuntimeContext(
  data: DefenseDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): RuntimeDefenseDataset {
  return { ...data, __resolvedPeriod: context.periodId, __requestedDataSourceType: context.dataSourceType };
}

export function getDefensePeriods(data: DefenseDataset) {
  return data.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultDefensePeriod(data: DefenseDataset) {
  return getLatestPeriod(data).id;
}

function buildSegmentRows(data: DefenseDataset) {
  const totalSales = data.segments.reduce((sum, row) => sum + row.sales, 0);
  return data.segments.map((row) => ({
    ...row,
    salesMix: safeRatio(row.sales, totalSales),
    backlogCoverage: row.backlog ? safeRatio(row.backlog, row.sales) : null,
    qualityScore: Math.round(
      clamp(row.margin / 0.17, 0, 1) * 35 +
        clamp((row.growth ?? 0.03) / 0.12, 0, 1) * 25 +
        clamp((row.backlog ? row.backlog / Math.max(row.sales, 1) : 2) / 3, 0, 1) * 25 +
        15,
    ),
  }));
}

function buildReportingTrendRows(data: DefenseDataset) {
  const themes = [...new Set(data.reportingEvents.flatMap((event) => event.marketFocus.map((focus) => focus.theme)))];
  return data.reportingEvents.map((event) => {
    const row: Record<string, string | number> = { quarter: event.quarter };
    themes.forEach((theme) => {
      row[theme] = event.marketFocus.find((focus) => focus.theme === theme)?.intensity ?? 0;
    });
    return row;
  });
}

function buildDcf(data: DefenseDataset, assumptions: DefenseValuationAssumptions) {
  const latest = getLatestPeriod(data);
  const forecast = Array.from({ length: 5 }, (_, index) => {
    const sales = latest.sales * (1 + assumptions.revenueCagr) ** (index + 1);
    const priorSales = index === 0 ? latest.sales : latest.sales * (1 + assumptions.revenueCagr) ** index;
    const operatingProfit = sales * assumptions.operatingMargin;
    const nopat = operatingProfit * (1 - assumptions.taxRate);
    const dAndA = sales * assumptions.dAndAIntensity;
    const capex = sales * assumptions.capexIntensity;
    const workingCapital = Math.max(sales - priorSales, 0) * assumptions.workingCapitalDragPctRevenueGrowth;
    return {
      year: latest.fiscalYear + index + 1,
      sales,
      operatingProfit,
      unleveredFreeCashFlow: nopat + dAndA - capex - workingCapital,
    };
  });
  const discountFactors = forecast.map((_, index) => 1 / (1 + assumptions.wacc) ** (index + 1));
  const pvCashFlows = forecast.reduce((sum, row, index) => sum + row.unleveredFreeCashFlow * discountFactors[index], 0);
  const terminalValue = forecast[forecast.length - 1].unleveredFreeCashFlow * (1 + assumptions.terminalGrowth) /
    Math.max(assumptions.wacc - assumptions.terminalGrowth, 0.01);
  const pvTerminal = terminalValue * discountFactors[discountFactors.length - 1];
  const enterpriseValue = pvCashFlows + pvTerminal;
  const equityValue = enterpriseValue - assumptions.netDebt;
  return {
    forecast,
    enterpriseValue,
    equityValue,
    fairValuePerShare: equityValue / assumptions.dilutedShares,
    terminalValueShareOfEv: safeRatio(pvTerminal, enterpriseValue),
  };
}

function calculateSingleValuation(data: DefenseDataset, assumptions: DefenseValuationAssumptions) {
  const latest = getLatestPeriod(data);
  const dcf = buildDcf(data, assumptions);
  const forwardSales = latest.sales * (1 + assumptions.revenueCagr);
  const forwardOperatingProfit = forwardSales * assumptions.operatingMargin;
  const forwardEps = (data.guidance.epsLow + data.guidance.epsHigh) / 2;
  const normalizedFcf = Math.max((data.guidance.fcfLow + data.guidance.fcfHigh) / 2, latest.freeCashFlow);
  const fcfYieldFairValue = normalizedFcf / assumptions.targetFcfYield / assumptions.dilutedShares;
  const peFairValue = forwardEps * assumptions.targetPe;
  const evEbitFairValue = (forwardOperatingProfit * assumptions.targetEvEbit - assumptions.netDebt) / assumptions.dilutedShares;
  const backlogCoverage = safeRatio(latest.backlog, latest.sales);
  const backlogAdjustment = clamp(((backlogCoverage - 2) / 1.5) * assumptions.backlogDurabilityMaxAdjustment, -assumptions.backlogDurabilityMaxAdjustment, assumptions.backlogDurabilityMaxAdjustment);
  const coreWeight = assumptions.weightDcf + assumptions.weightFcfYield + assumptions.weightEvEbit + assumptions.weightPe;
  const coreValue = (
    dcf.fairValuePerShare * assumptions.weightDcf +
    fcfYieldFairValue * assumptions.weightFcfYield +
    evEbitFairValue * assumptions.weightEvEbit +
    peFairValue * assumptions.weightPe
  ) / Math.max(coreWeight, 0.01);
  const backlogAdjustedFairValue = coreValue * (1 + backlogAdjustment);
  const blendedFairValue =
    dcf.fairValuePerShare * assumptions.weightDcf +
    fcfYieldFairValue * assumptions.weightFcfYield +
    evEbitFairValue * assumptions.weightEvEbit +
    peFairValue * assumptions.weightPe +
    backlogAdjustedFairValue * assumptions.weightBacklogDurability;
  return {
    dcf,
    fcfYieldFairValue,
    peFairValue,
    evEbitFairValue,
    backlogAdjustedFairValue,
    blendedFairValue,
    normalizedFcf,
    forwardOperatingProfit,
    backlogCoverage,
  };
}

export function calculateDefenseSummary(data: DefenseDataset): SummaryMetric[] {
  const latest = getLatestPeriod(data);
  const bookToBill = latest.orderIntake ? safeRatio(latest.orderIntake, latest.sales) : 0;
  return [
    metric("Current Price", data.marketData.price, "currency", data.marketData.notes, "Actual"),
    metric("Market Cap", data.marketData.marketCap, "number", "Derived from market-data source and share count.", "Derived"),
    metric("Sales", latest.sales, "number", "Latest annual sales / net sales from official release.", "Actual"),
    metric("Backlog", latest.backlog, "number", "Company backlog from official release.", "Actual"),
    metric("Backlog Coverage", safeRatio(latest.backlog, latest.sales), "multiple", "Backlog divided by annual sales.", "Derived"),
    metric("Book-to-Bill", bookToBill, "multiple", latest.orderIntakeSourceStatus === "derived" ? "Derived order intake divided by sales." : "Order intake divided by sales.", latest.orderIntakeSourceStatus === "derived" ? "Derived" : "Actual"),
    metric("FCF Yield", safeRatio(latest.freeCashFlow, data.marketData.marketCap), "percent", "Free cash flow divided by market capitalization.", "Derived"),
    metric("Guided FCF", (data.guidance.fcfLow + data.guidance.fcfHigh) / 2, "number", "Midpoint of management FCF guidance.", "Assumption"),
    metric("Guided EPS", (data.guidance.epsLow + data.guidance.epsHigh) / 2, "currency", "Midpoint of management EPS guidance.", "Assumption"),
  ];
}

export function calculateDefenseValuation(
  data: DefenseDataset,
  scenario: Scenario = "Base",
  overrides: Partial<DefenseValuationAssumptions> = {},
): ValuationResult {
  const assumptions = { ...assumptionsForScenario(data, scenario), ...overrides };
  const selected = calculateSingleValuation(data, assumptions);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const scenarioAssumptions = { ...assumptionsForScenario(data, caseName), currentPrice: assumptions.currentPrice };
    const scenarioValuation = calculateSingleValuation(data, scenarioAssumptions);
    const targetPrice3Y = scenarioValuation.blendedFairValue * (1 + scenarioAssumptions.revenueCagr) ** 0.5;
    const cumulativeDividends = scenarioAssumptions.dividendPerShare * 3;
    return {
      scenario: caseName,
      fairValue: scenarioValuation.blendedFairValue,
      upsideDownside: computeUpsideDownside(scenarioValuation.blendedFairValue, scenarioAssumptions.currentPrice),
      expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y, scenarioAssumptions.currentPrice, cumulativeDividends),
      targetPrice3Y,
      cumulativeDividends,
      summary: scenarioPreset(data, caseName).narrative,
    };
  });
  const probabilities = data.scenarios.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.scenario]: item.probability }), {});
  const probabilityWeightedFairValue = fairValues.reduce((sum, item) => sum + item.fairValue * (probabilities[item.scenario] ?? 0), 0) /
    Math.max(Object.values(probabilities).reduce((sum, value) => sum + value, 0), 0.01);
  const current = fairValues.find((item) => item.scenario === scenario) ?? fairValues[1];
  const warnings: ValidationWarning[] = [];
  const weightSum = assumptions.weightDcf + assumptions.weightFcfYield + assumptions.weightEvEbit + assumptions.weightPe + assumptions.weightBacklogDurability;
  if (Math.abs(weightSum - 1) > 0.0001) {
    warnings.push({ id: `${data.ticker}-weight-sum`, title: "Valuation weights do not sum to 100%", detail: `Weights sum to ${weightSum.toFixed(3)}.`, severity: "high" });
  }
  if (selected.dcf.terminalValueShareOfEv > 0.75) {
    warnings.push({ id: `${data.ticker}-terminal-value-heavy`, title: "DCF terminal value is high", detail: `Terminal value is ${(selected.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`, severity: "medium" });
  }

  return {
    currentPrice: assumptions.currentPrice,
    priceDate: data.marketData.priceDate,
    validationWarnings: warnings,
    fairValues,
    methodCards: [
      { key: "dcf", label: "DCF Fair Value", value: selected.dcf.fairValuePerShare, format: "currency", description: "FCFF DCF with net debt deducted after enterprise value." },
      { key: "fcf-yield", label: "FCF Yield Fair Value", value: selected.fcfYieldFairValue, format: "currency", description: "Normalized FCF capitalized by target FCF yield." },
      { key: "ev-ebit", label: "EV / EBIT Fair Value", value: selected.evEbitFairValue, format: "currency", description: "Forward operating profit cross-check." },
      { key: "pe", label: "P/E Fair Value", value: selected.peFairValue, format: "currency", description: "Guided EPS midpoint times target P/E." },
      { key: "backlog", label: "Backlog Durability Layer", value: selected.backlogAdjustedFairValue, format: "currency", description: "Capped risk-adjusted core value informed by backlog coverage." },
    ],
    expectedReturnBridge: [
      { key: "price", label: "Current Price", value: assumptions.currentPrice, format: "currency" },
      { key: "fair-value", label: "Selected Fair Value", value: current.fairValue, format: "currency" },
      { key: "upside", label: "Upside / Downside", value: current.upsideDownside, format: "percent" },
      { key: "cagr", label: "Expected 3Y CAGR", value: current.expectedReturn3Y, format: "percent" },
    ],
    customSummary: `${data.ticker} ${scenario} fair value is $${current.fairValue.toFixed(2)} with backlog coverage of ${selected.backlogCoverage.toFixed(1)}x annual sales.`,
    sensitivityTables: [
      {
        title: "DCF sensitivity: WACC vs terminal growth",
        table: buildSensitivityTable(
          "WACC",
          "Terminal growth",
          [assumptions.wacc - 0.01, assumptions.wacc, assumptions.wacc + 0.01],
          [assumptions.terminalGrowth - 0.005, assumptions.terminalGrowth, assumptions.terminalGrowth + 0.005],
          (wacc, terminalGrowth) => calculateSingleValuation(data, { ...assumptions, wacc, terminalGrowth }).dcf.fairValuePerShare,
        ),
      },
    ],
    dcfValue: selected.dcf.fairValuePerShare,
    fcfFairValue: selected.fcfYieldFairValue,
    peFairValue: selected.peFairValue,
    blendedFairValue: selected.blendedFairValue,
    recommendedFairValue: selected.blendedFairValue,
    recommendedFairValueMethod: "DCF / FCF yield / EV-EBIT / PE with backlog durability layer",
    recommendedFairValueReason: "Defense-prime valuation is anchored to cash flow and cross-checked against earnings, operating profit, and backlog durability.",
    valuationRangeLow: Math.min(...fairValues.map((item) => item.fairValue)),
    valuationRangeBase: selected.blendedFairValue,
    valuationRangeHigh: Math.max(...fairValues.map((item) => item.fairValue)),
    probabilityWeightedFairValue,
    targetPrice3Y: current.targetPrice3Y,
    expectedReturn3Y: current.expectedReturn3Y,
    upsideDownside: current.upsideDownside,
  };
}

export function buildDefenseDashboardData(data: DefenseDataset, scenario: Scenario = "Base") {
  const latest = getLatestPeriod(data);
  const segmentRows = buildSegmentRows(data);
  const valuation = calculateDefenseValuation(data, scenario);
  const assumptions = assumptionsForScenario(data, scenario);
  const singleValuation = calculateSingleValuation(data, assumptions);
  const reportingThemes = [...new Set(data.reportingEvents.flatMap((event) => event.marketFocus.map((focus) => focus.theme)))];
  return {
    dataset: data,
    latest,
    summary: calculateDefenseSummary(data),
    segmentRows,
    valuation,
    valuationDetails: singleValuation,
    reportingTrendRows: buildReportingTrendRows(data),
    reportingThemes,
    latestReportingEvent: data.reportingEvents[data.reportingEvents.length - 1],
    riskRows: data.risks.map((risk) => ({ ...risk, weightedScore: Math.round((risk.probability * 0.4 + risk.impact * 0.6) * 100) })).sort((a, b) => b.weightedScore - a.weightedScore),
    warnings: valuation.validationWarnings ?? [],
  };
}

export function buildDefenseValuationConfig(data: DefenseDataset) {
  const assumptions = data.assumptions;
  return {
    ticker: data.ticker,
    modelType: "Defense-prime FCFF / FCF yield / multiples / backlog durability",
    priceMetadata: {
      ticker: data.ticker,
      currentPrice: data.marketData.price,
      currency: "USD" as const,
      unit: "share" as const,
      asOfDate: data.marketData.priceDate,
      source: "actual" as const,
      marketReference: data.marketData.price,
      provenance: `market_data: ${data.marketData.notes}`,
    },
    assumptions: [
      { key: "currentPrice", label: "Current Price", value: assumptions.currentPrice, min: assumptions.currentPrice * 0.4, max: assumptions.currentPrice * 1.8, step: 0.5, format: "currency" as const, source: "actual" as const, description: "Current share price used for upside/downside.", category: "Market", unit: "USD" as const, periodicity: "annual" as const, asOfDate: data.marketData.priceDate, provenance: data.marketData.notes },
      { key: "revenueCagr", label: "Revenue CAGR", value: assumptions.revenueCagr, min: 0, max: 0.12, step: 0.0025, format: "percent" as const, source: "assumption" as const, description: "Forecast revenue CAGR.", category: "Growth", unit: "percent" as const, periodicity: "annual" as const },
      { key: "operatingMargin", label: "Operating Margin", value: assumptions.operatingMargin, min: 0.06, max: 0.18, step: 0.001, format: "percent" as const, source: "assumption" as const, description: "Long-run operating margin.", category: "Margin", unit: "percent" as const, periodicity: "annual" as const },
      { key: "wacc", label: "WACC", value: assumptions.wacc, min: 0.065, max: 0.11, step: 0.001, format: "percent" as const, source: "assumption" as const, description: "DCF discount rate.", category: "DCF", unit: "percent" as const, periodicity: "annual" as const },
      { key: "terminalGrowth", label: "Terminal Growth", value: assumptions.terminalGrowth, min: 0.01, max: 0.035, step: 0.0005, format: "percent" as const, source: "assumption" as const, description: "Long-run terminal growth.", category: "DCF", unit: "percent" as const, periodicity: "annual" as const },
      { key: "targetFcfYield", label: "Target FCF Yield", value: assumptions.targetFcfYield, min: 0.03, max: 0.08, step: 0.0005, format: "percent" as const, source: "assumption" as const, description: "FCF yield valuation cross-check.", category: "Multiples", unit: "percent" as const, periodicity: "forward annual" as const },
      { key: "targetPe", label: "Target P/E", value: assumptions.targetPe, min: 10, max: 32, step: 0.25, format: "multiple" as const, source: "assumption" as const, description: "Forward P/E cross-check.", category: "Multiples", unit: "multiple" as const, periodicity: "forward annual" as const },
      { key: "targetEvEbit", label: "Target EV / EBIT", value: assumptions.targetEvEbit, min: 10, max: 28, step: 0.25, format: "multiple" as const, source: "assumption" as const, description: "Forward EV / EBIT cross-check.", category: "Multiples", unit: "multiple" as const, periodicity: "forward annual" as const },
    ],
    scenarios: data.scenarios.map((item) => ({ name: item.scenario, assumptions: { ...assumptionsForScenario(data, item.scenario) } })),
    calculateValuation: (values: Record<string, number>, rawData: unknown, scenario: Scenario = "Base") =>
      calculateDefenseValuation((rawData as DefenseDataset) ?? data, scenario, values as Partial<DefenseValuationAssumptions>),
  };
}
