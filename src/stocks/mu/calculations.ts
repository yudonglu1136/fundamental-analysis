import type { Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildPriceAnchorWarnings, buildValidationWarning, mergeValidationWarnings } from "../../utils/validation";
import { defaultMuValuationAssumptions, muScenarioPresets } from "./assumptions";
import { muDataset } from "./data";
import type { MuDataset, MuFinancialPeriod, MuValuationAssumptions } from "./model";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function latestActual(dataset: MuDataset) {
  return dataset.periods[dataset.periods.length - 1];
}

function priorComparable(dataset: MuDataset, latest: MuFinancialPeriod) {
  const annuals = dataset.periods.filter((period) => period.periodType === latest.periodType);
  return annuals[annuals.length - 2] ?? null;
}

function blendedRiskMultiplier(assumptions: MuValuationAssumptions) {
  return clamp(
    1 +
      assumptions.hbmMixUplift -
      assumptions.memoryCycleHaircut -
      assumptions.chinaRestrictionHaircut -
      assumptions.capexIntensityHaircut,
    0.45,
    1.25,
  );
}

function dcfEquityValue(assumptions: MuValuationAssumptions, riskMultiplier: number) {
  let revenue = assumptions.normalizedRevenue;
  let presentValue = 0;
  const fcfMargin = clamp(assumptions.normalizedFcfMargin, 0, 0.35);
  for (let year = 1; year <= 6; year += 1) {
    const growthFade = Math.max(0.35, 1 - (year - 1) * 0.13);
    const growth = assumptions.terminalGrowth + (assumptions.revenueGrowth - assumptions.terminalGrowth) * growthFade;
    revenue *= 1 + growth;
    presentValue += (revenue * fcfMargin) / (1 + assumptions.discountRate) ** year;
  }
  const terminalFcf = revenue * fcfMargin * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcf / Math.max(assumptions.discountRate - assumptions.terminalGrowth, 0.025);
  return (presentValue + terminalValue / (1 + assumptions.discountRate) ** 6) * riskMultiplier + assumptions.netCashUsd;
}

function perShare(equityValue: number, shares: number) {
  return shares > 0 ? equityValue / shares : 0;
}

function computeMethods(input: Partial<MuValuationAssumptions> | undefined, scenario: Scenario) {
  const assumptions: MuValuationAssumptions = {
    ...defaultMuValuationAssumptions,
    ...muScenarioPresets[scenario],
    ...(input ?? {}),
  };
  const shares = Math.max(assumptions.dilutedShares, 1);
  const riskMultiplier = blendedRiskMultiplier(assumptions);
  const nextRevenue = assumptions.normalizedRevenue * (1 + assumptions.revenueGrowth);
  const normalizedEbit = nextRevenue * assumptions.operatingMargin;
  const normalizedFcf = nextRevenue * assumptions.normalizedFcfMargin;
  const normalizedNetIncome = normalizedEbit * 0.82;
  const normalizedEps = normalizedNetIncome / shares;
  const salesFairValue = perShare(nextRevenue * assumptions.targetSalesMultiple + assumptions.netCashUsd, shares) * riskMultiplier;
  const ebitFairValue = perShare(normalizedEbit * assumptions.targetEbitMultiple + assumptions.netCashUsd, shares) * riskMultiplier;
  const fcfFairValue = perShare(normalizedFcf / Math.max(assumptions.targetFcfYield, 0.01) + assumptions.netCashUsd, shares) * riskMultiplier;
  const peFairValue = normalizedEps * assumptions.targetPe * riskMultiplier;
  const dcfFairValue = perShare(dcfEquityValue(assumptions, riskMultiplier), shares);
  const fairValue = salesFairValue * 0.22 + ebitFairValue * 0.22 + fcfFairValue * 0.24 + peFairValue * 0.14 + dcfFairValue * 0.18;
  const targetPrice3Y = fairValue * (1 + assumptions.revenueGrowth * 0.45 + assumptions.buybackYield) ** 3;
  const expectedReturn3Y = assumptions.currentPrice > 0 ? (targetPrice3Y / assumptions.currentPrice) ** (1 / 3) - 1 + assumptions.dividendYield : 0;
  return {
    assumptions,
    fairValue,
    targetPrice3Y,
    expectedReturn3Y,
    normalizedFcf,
    normalizedEps,
    methodValues: { salesFairValue, ebitFairValue, fcfFairValue, peFairValue, dcfFairValue },
  };
}

function sourceWarnings(dataset: MuDataset, assumptions: MuValuationAssumptions): ValidationWarning[] {
  const priceWarnings = buildPriceAnchorWarnings({
    ticker: "MU",
    currentPrice: assumptions.currentPrice,
    marketReference: dataset.marketData.currentPrice,
    priceDate: dataset.marketData.priceDate,
    staleDays: 10,
  });
  const sourceWarnings = [
    buildValidationWarning(
      "mu-backend-deferred",
      "Backend workflow deferred",
      "MU does not yet have a local SQLite backend workflow, event-dated valuation history or daily-price backtest.",
      "medium",
    ),
    buildValidationWarning(
      "mu-hbm-placeholder",
      "HBM and pricing metrics need official extraction",
      "HBM mix, DRAM/NAND pricing and customer qualification data are research-only until filings, presentations and transcripts are parsed.",
      "medium",
    ),
    buildValidationWarning(
      "mu-cycle-normalization",
      "Memory cycle normalization required",
      "Spot EPS and latest-quarter margins may overstate through-cycle earning power; model fair value uses normalized revenue, EBIT and FCF.",
      "low",
    ),
  ];
  return mergeValidationWarnings(priceWarnings, sourceWarnings);
}

export function getMuPeriods() {
  return muDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultMuPeriod() {
  return muDataset.periods[muDataset.periods.length - 1]?.id ?? "fy2026-q2";
}

export function calculateMuSummary(input: unknown): SummaryMetric[] {
  const dataset = input as MuDataset;
  const latest = latestActual(dataset);
  const prior = priorComparable(dataset, latest);
  return [
    {
      key: "revenue",
      label: "Latest Revenue",
      value: latest.revenue,
      delta: prior ? latest.revenue - prior.revenue : undefined,
      format: "currency",
      description: "Latest reported revenue from SEC companyfacts, USDm.",
      badge: "Actual",
    },
    {
      key: "gross-margin",
      label: "Gross Margin",
      value: latest.grossMargin,
      delta: prior ? latest.grossMargin - prior.grossMargin : undefined,
      format: "percent",
      description: "Reported gross margin, useful but not sufficient for peak-cycle valuation.",
      badge: "Actual",
    },
    {
      key: "operating-margin",
      label: "Operating Margin",
      value: latest.operatingMargin,
      delta: prior ? latest.operatingMargin - prior.operatingMargin : undefined,
      format: "percent",
      description: "Reported operating margin; model applies explicit memory-cycle haircut.",
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

export function calculateMuValuation(input: unknown, assumptionsInput?: Partial<MuValuationAssumptions>, scenario: Scenario = "Base"): ValuationResult {
  const dataset = input as MuDataset;
  const active = computeMethods(assumptionsInput, scenario);
  const warnings = sourceWarnings(dataset, active.assumptions);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((scenarioName) => {
    const scenarioValue = computeMethods(muScenarioPresets[scenarioName], scenarioName);
    return {
      scenario: scenarioName,
      fairValue: scenarioValue.fairValue,
      upsideDownside: active.assumptions.currentPrice > 0 ? scenarioValue.fairValue / active.assumptions.currentPrice - 1 : 0,
      expectedReturn3Y: scenarioValue.expectedReturn3Y,
      targetPrice3Y: scenarioValue.targetPrice3Y,
      cumulativeDividends: active.assumptions.currentPrice * active.assumptions.dividendYield * 3,
      summary:
        scenarioName === "Bear"
          ? "HBM enthusiasm fades, DRAM/NAND cycle rolls and capex consumes FCF."
          : scenarioName === "Bull"
            ? "HBM mix, pricing and supply discipline support premium normalized margins."
            : "Balanced HBM durability, cycle fade and capital intensity.",
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
      { key: "ev-sales", label: "EV/Sales", value: active.methodValues.salesFairValue, format: "currency", description: "Normalized revenue multiple after risk multiplier.", valuationBase: "Normalized revenue", forecastYear: 2027, sourceConfidence: "medium" },
      { key: "ev-ebit", label: "EV/EBIT", value: active.methodValues.ebitFairValue, format: "currency", description: "Normalized operating profit multiple.", valuationBase: "Normalized EBIT", forecastYear: 2027, sourceConfidence: "medium" },
      { key: "fcf-yield", label: "FCF Yield", value: active.methodValues.fcfFairValue, format: "currency", description: "FCF yield guardrail after HBM capex.", valuationBase: "Normalized FCF", forecastYear: 2027, sourceConfidence: "medium" },
      { key: "pe", label: "P/E Cross-Check", value: active.methodValues.peFairValue, format: "currency", description: "Normalized EPS cross-check, not latest spot EPS.", valuationBase: "Normalized EPS", forecastYear: 2027, sourceConfidence: "low" },
      { key: "dcf", label: "DCF", value: active.methodValues.dcfFairValue, format: "currency", description: "Six-year FCF fade with terminal value.", valuationBase: "FCF", forecastYear: 2027, sourceConfidence: "medium" },
    ],
    expectedReturnBridge: [
      { key: "fair-value", label: "Selected Fair Value", value: currentScenarioFairValue, format: "currency", description: "Scenario-selected fair value from weighted method triangulation." },
      { key: "upside", label: "Upside / Downside", value: active.assumptions.currentPrice > 0 ? currentScenarioFairValue / active.assumptions.currentPrice - 1 : 0, format: "percent", description: "Fair value gap versus current price." },
      { key: "normalized-fcf", label: "Normalized FCF", value: active.normalizedFcf, format: "currency", description: "Forward normalized FCF in USDm." },
      { key: "normalized-eps", label: "Normalized EPS", value: active.normalizedEps, format: "currency", description: "Normalized EPS after assumed tax and shares." },
    ],
    customSummary: "MU valuation uses normalized memory-cycle earnings and FCF, with explicit HBM uplift, China/export-control haircut and capex intensity haircut.",
    sensitivityTables: [
      {
        title: "HBM uplift vs cycle haircut",
        table: [
          ["Cycle / HBM", "8% HBM", "14% HBM", "22% HBM"],
          ["10% cycle haircut", computeMethods({ ...active.assumptions, hbmMixUplift: 0.08, memoryCycleHaircut: 0.10 }, scenario).fairValue, computeMethods({ ...active.assumptions, hbmMixUplift: 0.14, memoryCycleHaircut: 0.10 }, scenario).fairValue, computeMethods({ ...active.assumptions, hbmMixUplift: 0.22, memoryCycleHaircut: 0.10 }, scenario).fairValue],
          ["18% cycle haircut", computeMethods({ ...active.assumptions, hbmMixUplift: 0.08, memoryCycleHaircut: 0.18 }, scenario).fairValue, computeMethods({ ...active.assumptions, hbmMixUplift: 0.14, memoryCycleHaircut: 0.18 }, scenario).fairValue, computeMethods({ ...active.assumptions, hbmMixUplift: 0.22, memoryCycleHaircut: 0.18 }, scenario).fairValue],
          ["28% cycle haircut", computeMethods({ ...active.assumptions, hbmMixUplift: 0.08, memoryCycleHaircut: 0.28 }, scenario).fairValue, computeMethods({ ...active.assumptions, hbmMixUplift: 0.14, memoryCycleHaircut: 0.28 }, scenario).fairValue, computeMethods({ ...active.assumptions, hbmMixUplift: 0.22, memoryCycleHaircut: 0.28 }, scenario).fairValue],
        ],
      },
    ],
    dcfValue: active.methodValues.dcfFairValue,
    fcfFairValue: active.methodValues.fcfFairValue,
    peFairValue: active.methodValues.peFairValue,
    recommendedFairValue: currentScenarioFairValue,
    recommendedFairValueMethod: "Weighted normalized memory-cycle triangulation",
    recommendedFairValueReason: "The module avoids anchoring on spot EPS or price by triangulating across normalized sales, EBIT, FCF, P/E and DCF.",
    targetPrice3Y: active.targetPrice3Y,
    expectedReturn3Y: active.expectedReturn3Y,
    upsideDownside: active.assumptions.currentPrice > 0 ? currentScenarioFairValue / active.assumptions.currentPrice - 1 : 0,
    dataQualityScore: 68,
    recommendedValuationConfidence: 0.58,
  };
}

export function buildMuDashboardData(dataset: MuDataset, scenario: Scenario, assumptions?: Partial<MuValuationAssumptions>) {
  const valuation = calculateMuValuation(dataset, assumptions, scenario);
  return {
    summary: calculateMuSummary(dataset),
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
      hbmDemandSignal: metric.hbmDemandSignal,
      dramCycleSignal: metric.dramCycleSignal,
      nandCycleSignal: metric.nandCycleSignal,
      capexIntensity: metric.capexIntensity,
    })),
    historicalValuationRows: dataset.historicalValuations.map((event) => ({
      ...event,
      gapPct: event.asOfPrice > 0 ? event.fairValue / event.asOfPrice - 1 : 0,
    })),
    earningsCallRows: dataset.earningsCalls.map((call) => ({
      ...call,
      hbmDemand: call.focusScores.hbmDemand,
      dramPricing: call.focusScores.dramPricing,
      nandPricing: call.focusScores.nandPricing,
      capexFcf: call.focusScores.capexFcf,
      chinaRisk: call.focusScores.chinaRisk,
      supplyDiscipline: call.focusScores.supplyDiscipline,
    })),
    memoryCycleForecastRows: dataset.memoryCycleForecast.map((year) => ({
      ...year,
      fcf: year.revenue * year.fcfMargin,
      hbmMixPct: year.hbmRevenueMix,
    })),
    cycleConclusion: dataset.cycleDecisionSystem,
    cycleIndicatorRows: dataset.cycleDecisionSystem.indicators.map((indicator) => ({
      ...indicator,
      displayValue:
        typeof indicator.currentValue === "number" && indicator.unit === "percent"
          ? indicator.currentValue
          : indicator.currentValue,
    })),
    cyclePhaseRows: dataset.cycleDecisionSystem.phaseScores.map((phase) => ({
      ...phase,
      label: phase.phase,
    })),
    cycleSignalRows: dataset.cycleDecisionSystem.quarterlySignals.map((signal) => ({
      ...signal,
      pricingComposite: (signal.dramPricingIndex + signal.nandPricingIndex) / 2,
      fcfMarginPct: signal.fcfMargin,
      grossMarginPct: signal.grossMargin,
    })),
    hbmAiDemandSystem: dataset.hbmAiDemandSystem,
    hbmForecastRows: dataset.hbmAiDemandSystem.forecastRows.map((row) => ({
      ...row,
      demandSupplyGap: row.hbmBitDemandIndex - row.customerDemandCoverage * 100,
      hbmMixPct: row.muHbmRevenueMix,
    })),
    hbmScenarioRows: dataset.hbmAiDemandSystem.scenarios.map((row) => ({
      ...row,
      hbmMixPct: row.fy2028HbmMix,
    })),
    hbmDebateRows: dataset.hbmAiDemandSystem.debates,
    hbmBottleneckRows: dataset.hbmAiDemandSystem.bottlenecks,
  };
}
