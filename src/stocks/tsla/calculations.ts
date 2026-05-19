import type { Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildPriceAnchorWarnings, buildValidationWarning, mergeValidationWarnings } from "../../utils/validation";
import { defaultTslaValuationAssumptions, tslaScenarioPresets } from "./assumptions";
import { tslaDataset } from "./data";
import type { TslaDataset, TslaFinancialPeriod, TslaValuationAssumptions } from "./model";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function latestActual(dataset: TslaDataset) {
  return dataset.periods[dataset.periods.length - 1];
}

function priorComparable(dataset: TslaDataset, latest: TslaFinancialPeriod) {
  const rows = dataset.periods.filter((period) => period.periodType === latest.periodType);
  return rows[rows.length - 2] ?? null;
}

function riskMultiplier(assumptions: TslaValuationAssumptions) {
  return clamp(1 - assumptions.evCompetitionHaircut - assumptions.executionHaircut - assumptions.regulatoryHaircut, 0.45, 1.05);
}

function dcfEquityValue(assumptions: TslaValuationAssumptions, risk: number) {
  let revenue = assumptions.normalizedRevenue;
  let presentValue = 0;
  const fcfMargin = clamp(assumptions.normalizedFcfMargin, 0, 0.22);
  for (let year = 1; year <= 6; year += 1) {
    const fade = Math.max(0.4, 1 - (year - 1) * 0.12);
    const growth = assumptions.terminalGrowth + (assumptions.revenueGrowth - assumptions.terminalGrowth) * fade;
    revenue *= 1 + growth;
    presentValue += (revenue * fcfMargin) / (1 + assumptions.discountRate) ** year;
  }
  const terminalFcf = revenue * fcfMargin * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcf / Math.max(assumptions.discountRate - assumptions.terminalGrowth, 0.025);
  return (presentValue + terminalValue / (1 + assumptions.discountRate) ** 6) * risk + assumptions.netCashUsd;
}

function perShare(equityValue: number, shares: number) {
  return shares > 0 ? equityValue / shares : 0;
}

function computeMethods(input: Partial<TslaValuationAssumptions> | undefined, scenario: Scenario) {
  const assumptions: TslaValuationAssumptions = {
    ...defaultTslaValuationAssumptions,
    ...tslaScenarioPresets[scenario],
    ...(input ?? {}),
  };
  const shares = Math.max(assumptions.dilutedShares, 1);
  const risk = riskMultiplier(assumptions);
  const normalizedRevenue = assumptions.normalizedRevenue * (1 + assumptions.revenueGrowth);
  const autoRevenue = normalizedRevenue * clamp(assumptions.autoRevenueMix, 0, 1);
  const energyRevenue = normalizedRevenue * clamp(assumptions.energyRevenueMix, 0, 1) * (1 + assumptions.energyRevenueGrowth);
  const autoNetIncome = autoRevenue * assumptions.autoOperatingMargin * 0.84;
  const autoFairValue = (autoNetIncome / shares) * assumptions.targetAutoPe * risk;
  const energyFairValue = perShare(energyRevenue * assumptions.energySalesMultiple, shares) * risk;
  const normalizedFcf = normalizedRevenue * assumptions.normalizedFcfMargin;
  const fcfFairValue = perShare(normalizedFcf / Math.max(assumptions.targetFcfYield, 0.01) + assumptions.netCashUsd, shares) * risk;
  const dcfFairValue = perShare(dcfEquityValue(assumptions, risk), shares);
  const autonomyFairValue = assumptions.autonomyOptionValuePerShare * assumptions.autonomyProbability;
  const coreFairValue = autoFairValue * 0.33 + energyFairValue * 0.17 + fcfFairValue * 0.25 + dcfFairValue * 0.25;
  const fairValue = coreFairValue + autonomyFairValue;
  const targetPrice3Y = fairValue * (1 + assumptions.revenueGrowth * 0.35) ** 3;
  const expectedReturn3Y = assumptions.currentPrice > 0 ? (targetPrice3Y / assumptions.currentPrice) ** (1 / 3) - 1 : 0;
  return {
    assumptions,
    fairValue,
    targetPrice3Y,
    expectedReturn3Y,
    normalizedFcf,
    methodValues: { autoFairValue, energyFairValue, fcfFairValue, dcfFairValue, autonomyFairValue, coreFairValue },
  };
}

function sourceWarnings(dataset: TslaDataset, assumptions: TslaValuationAssumptions): ValidationWarning[] {
  const priceWarnings = buildPriceAnchorWarnings({
    ticker: "TSLA",
    currentPrice: assumptions.currentPrice,
    marketReference: dataset.marketData.currentPrice,
    priceDate: dataset.marketData.priceDate,
    staleDays: 10,
  });
  const sourceWarnings = [
    buildValidationWarning(
      "tsla-backend-deferred",
      "Backend workflow deferred",
      "TSLA does not yet have a local SQLite backend workflow, event-dated valuation history or daily-price backtest.",
      "medium",
    ),
    buildValidationWarning(
      "tsla-segment-data-gap",
      "Segment data needs official extraction",
      "Automotive, energy and services segment tables are not yet parsed from Tesla custom XBRL tags or official filing tables.",
      "medium",
    ),
    buildValidationWarning(
      "tsla-autonomy-optionality",
      "Autonomy is option value",
      "Autonomy is modeled as probability-weighted optionality outside core auto and energy valuation to reduce double counting.",
      "low",
    ),
  ];
  return mergeValidationWarnings(priceWarnings, sourceWarnings);
}

export function getTslaPeriods() {
  return tslaDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultTslaPeriod() {
  return tslaDataset.periods[tslaDataset.periods.length - 1]?.id ?? "fy2026-q1";
}

export function calculateTslaSummary(input: unknown): SummaryMetric[] {
  const dataset = input as TslaDataset;
  const latest = latestActual(dataset);
  const prior = priorComparable(dataset, latest);
  return [
    {
      key: "revenue",
      label: "Latest Revenue",
      value: latest.revenue,
      delta: prior ? latest.revenue - prior.revenue : undefined,
      format: "currency",
      description: "Latest reported consolidated revenue from SEC companyfacts, USDm.",
      badge: "Actual",
    },
    {
      key: "gross-margin",
      label: "Gross Margin",
      value: latest.grossMargin,
      delta: prior ? latest.grossMargin - prior.grossMargin : undefined,
      format: "percent",
      description: "Reported gross margin across auto, energy and services.",
      badge: "Actual",
    },
    {
      key: "operating-margin",
      label: "Operating Margin",
      value: latest.operatingMargin,
      delta: prior ? latest.operatingMargin - prior.operatingMargin : undefined,
      format: "percent",
      description: "Reported operating margin; the model separates auto margin from energy and autonomy.",
      badge: "Actual",
    },
    {
      key: "fcf",
      label: "Free Cash Flow",
      value: latest.freeCashFlow,
      delta: prior ? latest.freeCashFlow - prior.freeCashFlow : undefined,
      format: "currency",
      description: "Operating cash flow minus capex, USDm.",
      badge: "Derived",
    },
  ];
}

export function calculateTslaValuation(input: unknown, assumptionsInput?: Partial<TslaValuationAssumptions>, scenario: Scenario = "Base"): ValuationResult {
  const dataset = input as TslaDataset;
  const active = computeMethods(assumptionsInput, scenario);
  const warnings = sourceWarnings(dataset, active.assumptions);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((scenarioName) => {
    const scenarioValue = computeMethods(tslaScenarioPresets[scenarioName], scenarioName);
    return {
      scenario: scenarioName,
      fairValue: scenarioValue.fairValue,
      upsideDownside: active.assumptions.currentPrice > 0 ? scenarioValue.fairValue / active.assumptions.currentPrice - 1 : 0,
      expectedReturn3Y: scenarioValue.expectedReturn3Y,
      targetPrice3Y: scenarioValue.targetPrice3Y,
      cumulativeDividends: 0,
      summary:
        scenarioName === "Bear"
          ? "Auto margin stays pressured and autonomy remains low-probability option value."
          : scenarioName === "Bull"
            ? "Energy scales, auto margins stabilize and autonomy probability rises."
            : "Balanced auto stabilization, energy growth and probability-weighted autonomy.",
    };
  });
  const currentScenarioFairValue = fairValues.find((point) => point.scenario === scenario)?.fairValue ?? active.fairValue;
  return {
    warning: warnings.map((warning) => warning.title).join("; "),
    currentPrice: active.assumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: warnings,
    fairValues,
    methodCards: [
      { key: "auto-earnings", label: "Core Auto Earnings", value: active.methodValues.autoFairValue, format: "currency", description: "Auto revenue x auto operating margin x P/E, risk adjusted.", valuationBase: "Auto earnings", forecastYear: 2027, sourceConfidence: "medium" },
      { key: "energy-sotp", label: "Energy SOTP", value: active.methodValues.energyFairValue, format: "currency", description: "Energy revenue multiple as a separate growth asset.", valuationBase: "Energy revenue", forecastYear: 2027, sourceConfidence: "low" },
      { key: "fcf-yield", label: "FCF Yield", value: active.methodValues.fcfFairValue, format: "currency", description: "Consolidated normalized FCF yield guardrail.", valuationBase: "Normalized FCF", forecastYear: 2027, sourceConfidence: "medium" },
      { key: "dcf", label: "DCF", value: active.methodValues.dcfFairValue, format: "currency", description: "Six-year FCF fade with terminal value.", valuationBase: "FCF", forecastYear: 2027, sourceConfidence: "medium" },
      { key: "autonomy-option", label: "Autonomy Option", value: active.methodValues.autonomyFairValue, format: "currency", description: "Probability-weighted option value, explicitly outside core auto and energy value.", valuationBase: "Option value", forecastYear: 2027, sourceConfidence: "low" },
    ],
    expectedReturnBridge: [
      { key: "core-value", label: "Core Value", value: active.methodValues.coreFairValue, format: "currency", description: "Core auto, energy, FCF and DCF blended value before autonomy optionality." },
      { key: "autonomy", label: "Autonomy Add-On", value: active.methodValues.autonomyFairValue, format: "currency", description: "Standalone probability-weighted autonomy option." },
      { key: "selected-fair-value", label: "Selected Fair Value", value: currentScenarioFairValue, format: "currency", description: "Scenario-selected fair value." },
      { key: "upside", label: "Upside / Downside", value: active.assumptions.currentPrice > 0 ? currentScenarioFairValue / active.assumptions.currentPrice - 1 : 0, format: "percent", description: "Fair value gap versus current price." },
    ],
    customSummary: "TSLA valuation separates core auto earnings, energy storage scale, FCF/DCF guardrails and probability-weighted autonomy optionality.",
    sensitivityTables: [
      {
        title: "Autonomy probability vs auto margin",
        table: [
          ["Auto margin / Autonomy", "12% probability", "28% probability", "42% probability"],
          ["4% auto margin", computeMethods({ ...active.assumptions, autoOperatingMargin: 0.04, autonomyProbability: 0.12 }, scenario).fairValue, computeMethods({ ...active.assumptions, autoOperatingMargin: 0.04, autonomyProbability: 0.28 }, scenario).fairValue, computeMethods({ ...active.assumptions, autoOperatingMargin: 0.04, autonomyProbability: 0.42 }, scenario).fairValue],
          ["8% auto margin", computeMethods({ ...active.assumptions, autoOperatingMargin: 0.08, autonomyProbability: 0.12 }, scenario).fairValue, computeMethods({ ...active.assumptions, autoOperatingMargin: 0.08, autonomyProbability: 0.28 }, scenario).fairValue, computeMethods({ ...active.assumptions, autoOperatingMargin: 0.08, autonomyProbability: 0.42 }, scenario).fairValue],
          ["12% auto margin", computeMethods({ ...active.assumptions, autoOperatingMargin: 0.12, autonomyProbability: 0.12 }, scenario).fairValue, computeMethods({ ...active.assumptions, autoOperatingMargin: 0.12, autonomyProbability: 0.28 }, scenario).fairValue, computeMethods({ ...active.assumptions, autoOperatingMargin: 0.12, autonomyProbability: 0.42 }, scenario).fairValue],
        ],
      },
    ],
    dcfValue: active.methodValues.dcfFairValue,
    fcfFairValue: active.methodValues.fcfFairValue,
    sotpFairValue: active.methodValues.energyFairValue,
    strategicOptionalityPerShare: active.methodValues.autonomyFairValue,
    recommendedFairValue: currentScenarioFairValue,
    recommendedFairValueMethod: "Core auto + energy + FCF/DCF + explicit autonomy option bridge",
    recommendedFairValueReason: "The module keeps autonomy value visible and separate rather than hiding it inside core auto margins or multiples.",
    targetPrice3Y: active.targetPrice3Y,
    expectedReturn3Y: active.expectedReturn3Y,
    upsideDownside: active.assumptions.currentPrice > 0 ? currentScenarioFairValue / active.assumptions.currentPrice - 1 : 0,
    dataQualityScore: 64,
    recommendedValuationConfidence: 0.54,
  };
}

export function buildTslaDashboardData(dataset: TslaDataset, scenario: Scenario, assumptions?: Partial<TslaValuationAssumptions>) {
  const valuation = calculateTslaValuation(dataset, assumptions, scenario);
  return {
    summary: calculateTslaSummary(dataset),
    valuation,
    latestPeriod: latestActual(dataset),
    financialRows: dataset.periods.map((period) => ({
      label: period.label,
      revenue: period.revenue,
      grossProfit: period.grossProfit,
      operatingIncome: period.operatingIncome,
      freeCashFlow: period.freeCashFlow,
      grossMargin: period.grossMargin,
      operatingMargin: period.operatingMargin,
    })),
    operatingRows: dataset.operatingMetrics.map((metric) => ({
      label: dataset.periods.find((period) => period.id === metric.periodId)?.label ?? metric.periodId,
      autoDemandSignal: metric.autoDemandSignal,
      energyStorageSignal: metric.energyStorageSignal,
      autonomyProgressSignal: metric.autonomyProgressSignal,
      grossMarginDurabilitySignal: metric.grossMarginDurabilitySignal,
    })),
    historicalValuationRows: dataset.historicalValuations.map((event) => ({
      ...event,
      gapPct: event.asOfPrice > 0 ? event.fairValue / event.asOfPrice - 1 : 0,
    })),
    earningsCallRows: dataset.earningsCalls.map((call) => ({
      ...call,
      autoMargin: call.focusScores.autoMargin,
      energyStorage: call.focusScores.energyStorage,
      autonomyFsd: call.focusScores.autonomyFsd,
      chinaCompetition: call.focusScores.chinaCompetition,
      capexFcf: call.focusScores.capexFcf,
      regulatoryRisk: call.focusScores.regulatoryRisk,
    })),
    energyStorageRows: dataset.energyStorageDeployments.map((row) => ({
      ...row,
      label: `${row.year}${row.isForecast ? "E" : ""}`,
    })),
    fsdProxyRows: dataset.fsdSubscriptionProxy.map((row) => ({
      ...row,
      label: `${row.year}${row.isForecast ? "E" : ""}`,
    })),
    deepDive: dataset.deepDiveSystem,
    deepDiveIndicators: dataset.deepDiveSystem.indicators,
    driverScoreRows: dataset.deepDiveSystem.driverScores.map((row) => ({
      ...row,
      label: row.driver,
    })),
    quarterlyThesisRows: dataset.deepDiveSystem.quarterlyThesis.map((row) => ({
      ...row,
      fcfMarginPct: row.fcfMargin,
      storageGwhValue: row.storageGwh ?? null,
      activeFsdSubscriptionsMillions: row.activeFsdSubscriptions ?? null,
    })),
    scenarioBridgeRows: dataset.deepDiveSystem.scenarioBridge,
  };
}
