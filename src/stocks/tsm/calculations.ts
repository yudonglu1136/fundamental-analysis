import type { DataSourceType, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { defaultTsmValuationAssumptions, tsmScenarioPresets, type TsmValuationAssumptions } from "./assumptions";
import { tsmDataset } from "./data";
import type { TsmDataset, TsmFinancialPeriod, TsmOperatingMetric, TsmPlatformMix, TsmTechnologyMix } from "./model";

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function periodRank(period: Pick<TsmFinancialPeriod, "fiscalYear" | "fiscalQuarter" | "periodType">) {
  const quarter = period.fiscalQuarter ? Number(period.fiscalQuarter.replace("Q", "")) : period.periodType === "annual" ? 4.5 : 5;
  return period.fiscalYear * 10 + quarter;
}

function latestActualPeriod(dataset: TsmDataset, periodId?: string) {
  if (periodId) {
    const selected = dataset.periods.find((period) => period.id === periodId);
    if (selected) return selected;
  }
  const actuals = dataset.periods.filter((period) => period.periodType !== "forecast");
  return [...actuals].sort((left, right) => periodRank(left) - periodRank(right))[actuals.length - 1] ?? dataset.periods[0];
}

function latestMetric(dataset: TsmDataset, periodId: string): TsmOperatingMetric | null {
  return dataset.operatingMetrics.find((metric) => metric.periodId === periodId) ?? dataset.operatingMetrics[dataset.operatingMetrics.length - 1] ?? null;
}

function latestGuidance(dataset: TsmDataset) {
  return [...dataset.periods].reverse().find((period) => period.periodType === "forecast") ?? null;
}

function annualRevenueBase(dataset: TsmDataset, period: TsmFinancialPeriod) {
  const guidance = latestGuidance(dataset);
  if (guidance && guidance.asOfDate >= period.asOfDate) {
    return guidance.revenueUsd * 4;
  }
  return period.periodType === "quarter" ? period.revenueUsd * 4 : period.revenueUsd;
}

function platformRows(dataset: TsmDataset, periodId: string): TsmPlatformMix[] {
  return dataset.platformMix.filter((row) => row.periodId === periodId);
}

function technologyRows(dataset: TsmDataset, periodId: string): TsmTechnologyMix[] {
  return dataset.technologyMix.filter((row) => row.periodId === periodId);
}

function warning(id: string, title: string, detail: string, severity: ValidationWarning["severity"] = "medium"): ValidationWarning {
  return { id, title, detail, severity };
}

function valuePerAdr(enterpriseValue: number, assumptions: TsmValuationAssumptions) {
  return assumptions.adrEquivalentShares ? (enterpriseValue + assumptions.netCashUsd) / assumptions.adrEquivalentShares : 0;
}

function dcfEnterpriseValue(revenueBase: number, assumptions: TsmValuationAssumptions) {
  let revenue = revenueBase;
  let presentValue = 0;
  for (let year = 1; year <= 6; year += 1) {
    const fade = Math.max(0.30, 1 - (year - 1) * 0.14);
    const growth = assumptions.terminalGrowth + (assumptions.revenueGrowth - assumptions.terminalGrowth) * fade;
    revenue *= 1 + growth;
    const marginDrag = Math.max(0, assumptions.capexIntensity - 0.34) * 0.20 + Math.max(0, assumptions.localizationCostDrag);
    const fcfMargin = clamp(assumptions.normalizedFcfMargin - marginDrag - Math.max(0, year - 3) * 0.006, 0.08, 0.48);
    presentValue += (revenue * fcfMargin) / (1 + assumptions.discountRate) ** year;
  }
  const terminalFcf = revenue * clamp(assumptions.normalizedFcfMargin - 0.015, 0.08, 0.46) * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcf / Math.max(assumptions.discountRate - assumptions.terminalGrowth, 0.025);
  return presentValue + terminalValue / (1 + assumptions.discountRate) ** 6;
}

export function getTsmPeriods() {
  return tsmDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultTsmPeriod() {
  return tsmDataset.latestReportingPeriod === "1Q26" ? "fy2026-q1" : tsmDataset.periods[tsmDataset.periods.length - 1]?.id ?? "fy2026-q1";
}

export function resolveTsmDataset(data: unknown): TsmDataset {
  const candidate = data as Partial<TsmDataset> | undefined;
  if (candidate?.periods?.length && candidate?.marketData) return candidate as TsmDataset;
  return tsmDataset;
}

export function resolveTsmPeriodFromData(data: unknown, periodId = getDefaultTsmPeriod()) {
  const dataset = resolveTsmDataset(data);
  return dataset.periods.some((period) => period.id === periodId) ? periodId : getDefaultTsmPeriod();
}

export function attachTsmRuntimeContext(data: unknown, { periodId, dataSourceType }: { periodId: string; dataSourceType?: DataSourceType }) {
  const dataset = resolveTsmDataset(data);
  return {
    ...dataset,
    selectedPeriodId: resolveTsmPeriodFromData(dataset, periodId),
    dataSourceType,
  };
}

export function calculateTsmSummary(data: unknown): SummaryMetric[] {
  const dataset = resolveTsmDataset(data);
  const period = latestActualPeriod(dataset, dataset.selectedPeriodId);
  const metric = latestMetric(dataset, period.id);
  const guidance = latestGuidance(dataset);
  return [
    {
      key: "revenue",
      label: "Quarter Revenue",
      value: period.revenueUsd,
      format: "currency",
      description: "Latest official quarterly revenue in US dollars.",
      badge: period.sourceStatus === "official_actual" ? "Actual" : "Needs Review",
    },
    {
      key: "grossMargin",
      label: "Gross Margin",
      value: period.grossMargin,
      format: "percent",
      description: "Core test of leading-edge pricing, utilization, N2 ramp and overseas fab cost drag.",
      badge: "Actual",
    },
    {
      key: "hpcMix",
      label: "HPC Mix",
      value: metric?.hpcMix ?? 0,
      format: "percent",
      description: "HPC/AI share of wafer revenue, used as evidence rather than a direct valuation input.",
      badge: metric?.sourceStatus === "official_actual" ? "Actual" : "Derived",
    },
    {
      key: "q2Guidance",
      label: "Q2 Revenue Guide",
      value: guidance?.revenueUsd ?? 0,
      format: "currency",
      description: "Midpoint of official management revenue guidance.",
      badge: "Assumption",
    },
  ];
}

export function calculateTsmValuation(
  data: unknown,
  assumptionOverrides: Partial<TsmValuationAssumptions> = {},
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolveTsmDataset(data);
  const period = latestActualPeriod(dataset, dataset.selectedPeriodId);
  const metric = latestMetric(dataset, period.id);
  const preset = tsmScenarioPresets[scenario] ?? tsmScenarioPresets.Base;
  const assumptions: TsmValuationAssumptions = {
    ...defaultTsmValuationAssumptions,
    ...preset,
    currentPrice: dataset.marketData.currentPrice,
    adrEquivalentShares: dataset.marketData.adrEquivalentShares,
    netCashUsd: dataset.marketData.netCashUsd,
    grossMargin: period.grossMargin || preset.grossMargin,
    operatingMargin: period.operatingMargin || preset.operatingMargin,
    advancedNodeMix: metric?.advancedNodeMix ?? preset.advancedNodeMix,
    ...assumptionOverrides,
  };
  const revenueBase = annualRevenueBase(dataset, period);

  function computePoint(name: Scenario, drivers: TsmValuationAssumptions) {
    const effectiveGrowth = clamp(
      drivers.revenueGrowth * 0.58 +
        drivers.hpcGrowth * 0.22 +
        (drivers.advancedNodeMix - 0.60) * 0.16 -
        drivers.aiCycleHaircut * 0.32,
      -0.05,
      0.42,
    );
    const normalizedRevenue = revenueBase * (1 + effectiveGrowth);
    const operatingMargin = clamp(
      drivers.operatingMargin +
        (drivers.advancedNodeMix - 0.68) * 0.12 -
        drivers.localizationCostDrag -
        Math.max(0, drivers.capexIntensity - 0.36) * 0.08,
      0.32,
      0.66,
    );
    const normalizedEbit = normalizedRevenue * operatingMargin;
    const taxRate = 0.16;
    const normalizedNetIncome = normalizedEbit * (1 - taxRate);
    const fcfMargin = clamp(
      drivers.normalizedFcfMargin +
        (operatingMargin - 0.52) * 0.25 -
        Math.max(0, drivers.capexIntensity - 0.34) * 0.35,
      0.10,
      0.48,
    );
    const normalizedFcf = normalizedRevenue * fcfMargin;
    const riskMultiplier = clamp(
      1 - drivers.customerConcentrationHaircut - drivers.geopoliticsHaircut - drivers.aiCycleHaircut,
      0.55,
      1.05,
    );
    const dcfFairValue = valuePerAdr(dcfEnterpriseValue(revenueBase, drivers) * riskMultiplier, drivers);
    const fcfYieldFairValue = valuePerAdr((normalizedFcf / drivers.targetFcfYield) * riskMultiplier, drivers);
    const peFairValue = drivers.adrEquivalentShares
      ? ((normalizedNetIncome * drivers.targetPe) * riskMultiplier + drivers.netCashUsd) / drivers.adrEquivalentShares
      : 0;
    const evEbitFairValue = valuePerAdr((normalizedEbit * drivers.evEbitMultiple) * riskMultiplier, drivers);
    const leadingEdgeRevenue = normalizedRevenue * drivers.advancedNodeMix;
    const matureRevenue = Math.max(0, normalizedRevenue - leadingEdgeRevenue);
    const sotpFairValue = valuePerAdr(
      (leadingEdgeRevenue * drivers.leadingEdgeRevenueMultiple + matureRevenue * drivers.matureNodeRevenueMultiple) * riskMultiplier,
      drivers,
    );
    const fairValue =
      dcfFairValue * 0.30 +
      fcfYieldFairValue * 0.24 +
      peFairValue * 0.18 +
      evEbitFairValue * 0.14 +
      sotpFairValue * 0.14;
    const targetPrice3Y = fairValue * (1 + clamp(effectiveGrowth * 0.45, 0.015, 0.16)) ** 3;
    const cumulativeDividends = drivers.currentPrice * 0.012 * 3;
    const expectedReturn3Y = drivers.currentPrice ? ((targetPrice3Y + cumulativeDividends) / drivers.currentPrice) ** (1 / 3) - 1 : 0;
    const upsideDownside = drivers.currentPrice ? fairValue / drivers.currentPrice - 1 : 0;
    return {
      scenario: name,
      fairValue,
      upsideDownside,
      expectedReturn3Y,
      targetPrice3Y,
      cumulativeDividends,
      effectiveGrowth,
      operatingMargin,
      fcfMargin,
      riskMultiplier,
      dcfFairValue,
      fcfYieldFairValue,
      peFairValue,
      evEbitFairValue,
      sotpFairValue,
    };
  }

  const selected = computePoint(scenario, assumptions);
  const scenarioPoints = (["Bear", "Base", "Bull"] as Scenario[]).map((name) =>
    computePoint(name, {
      ...defaultTsmValuationAssumptions,
      ...tsmScenarioPresets[name],
      currentPrice: assumptions.currentPrice,
      adrEquivalentShares: assumptions.adrEquivalentShares,
      netCashUsd: assumptions.netCashUsd,
      grossMargin: period.grossMargin || tsmScenarioPresets[name].grossMargin,
      operatingMargin: period.operatingMargin || tsmScenarioPresets[name].operatingMargin,
      advancedNodeMix: metric?.advancedNodeMix ?? tsmScenarioPresets[name].advancedNodeMix,
    }),
  );
  const { fairValue, effectiveGrowth, operatingMargin, fcfMargin, riskMultiplier, dcfFairValue, fcfYieldFairValue, peFairValue, evEbitFairValue, sotpFairValue, targetPrice3Y, expectedReturn3Y, upsideDownside } = selected;

  const sourceWarnings: ValidationWarning[] = [
    ...(dataset.marketData.sourceStatus !== "market_data"
      ? [
          warning(
            "tsm-market-data-proxy",
            "Market price is a proxy",
            "TSM should get a backend daily_price_bars table before relying on historical valuation or backtest conclusions.",
          ),
        ]
      : []),
    warning(
      "tsm-risk-haircuts-explicit",
      "Risk haircuts are explicit assumptions",
      "Geopolitical, AI-cycle and concentration risk do not change valuation unless the assumption sliders are changed.",
      "low",
    ),
  ];

  return {
    currentPrice: assumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    fairValues: scenarioPoints.map((point) => ({
      scenario: point.scenario,
      fairValue: point.fairValue,
      upsideDownside: point.upsideDownside,
      expectedReturn3Y: point.expectedReturn3Y,
      targetPrice3Y: point.targetPrice3Y,
      cumulativeDividends: point.cumulativeDividends,
      summary:
        point.scenario === scenario
          ? `${scenario} case: effective revenue growth ${pct(effectiveGrowth)}, FCF margin ${pct(fcfMargin)}, risk multiplier ${riskMultiplier.toFixed(2)}x.`
          : undefined,
    })),
    methodCards: [
      { key: "dcf", label: "DCF / FCFF", value: dcfFairValue, format: "currency", description: "Six-year FCFF fade from event-visible revenue, growth, FCF margin, WACC and terminal growth.", sourceConfidence: "medium" },
      { key: "fcf-yield", label: "FCF Yield", value: fcfYieldFairValue, format: "currency", description: "Normalized FCF per ADR capitalized at a target FCF yield.", sourceConfidence: "medium" },
      { key: "pe", label: "P/E", value: peFairValue, format: "currency", description: "Normalized net income valued at an explicit P/E multiple.", sourceConfidence: "medium" },
      { key: "ev-ebit", label: "EV / EBIT", value: evEbitFairValue, format: "currency", description: "Operating profit power valued with a foundry EV/EBIT multiple.", sourceConfidence: "medium" },
      { key: "sotp", label: "Node Mix SOTP", value: sotpFairValue, format: "currency", description: "Leading-edge and mature-node revenue pools capitalized separately.", sourceConfidence: "low" },
    ],
    expectedReturnBridge: [
      { key: "revenue-growth", label: "Effective Growth", value: effectiveGrowth, format: "percent", description: "Revenue growth blended with HPC growth, advanced-node mix and AI cycle risk." },
      { key: "operating-margin", label: "Operating Margin", value: operatingMargin, format: "percent", description: "Margin after advanced-node mix and localization cost drag." },
      { key: "fcf-margin", label: "FCF Margin", value: fcfMargin, format: "percent", description: "Cash conversion after capex intensity." },
      { key: "risk-multiplier", label: "Risk Multiplier", value: riskMultiplier, format: "multiple", description: "Concentration, geopolitical and AI-cycle risk haircuts." },
    ],
    sensitivityTables: [
      {
        title: "HPC Growth / FCF Yield Sensitivity",
        table: [
          ["Driver", "Bear", "Base", "Bull"],
          ["HPC growth", "15%", "32%", "43%"],
          ["Target FCF yield", "5.5%", "3.5%", "2.9%"],
          ["Fair value", scenarioPoints[0]?.fairValue ?? fairValue * 0.75, scenarioPoints[1]?.fairValue ?? fairValue, scenarioPoints[2]?.fairValue ?? fairValue * 1.25],
        ],
      },
      {
        title: "Risk Haircut Sensitivity",
        table: [
          ["Risk set", "Lower", "Base", "Higher"],
          ["Fair value", Math.round(fairValue / riskMultiplier * clamp(riskMultiplier + 0.08, 0.55, 1.05)), Math.round(fairValue), Math.round(fairValue / riskMultiplier * clamp(riskMultiplier - 0.10, 0.55, 1.05))],
        ],
      },
    ],
    recommendedFairValue: fairValue,
    blendedFairValue: fairValue,
    probabilityWeightedFairValue: scenarioPoints[0]?.fairValue * 0.25 + scenarioPoints[1]?.fairValue * 0.5 + scenarioPoints[2]?.fairValue * 0.25,
    dcfValue: dcfFairValue,
    fcfFairValue: fcfYieldFairValue,
    peFairValue,
    sotpFairValue,
    targetPrice3Y,
    expectedReturn3Y,
    upsideDownside,
    valuationRangeLow: Math.min(dcfFairValue, fcfYieldFairValue, peFairValue, evEbitFairValue, sotpFairValue),
    valuationRangeBase: fairValue,
    valuationRangeHigh: Math.max(dcfFairValue, fcfYieldFairValue, peFairValue, evEbitFairValue, sotpFairValue),
    validationWarnings: sourceWarnings,
    customSummary:
      "TSM valuation is organized around foundry economics: AI/HPC-driven leading-edge demand, 3nm/5nm/N2 pricing, advanced packaging constraints, capex intensity, overseas fab drag and geopolitical risk.",
  };
}

export function buildTsmDashboardData(data: unknown, periodId: string, scenario: Scenario, assumptions: Partial<TsmValuationAssumptions>) {
  const dataset = attachTsmRuntimeContext(data, { periodId });
  const period = latestActualPeriod(dataset, dataset.selectedPeriodId);
  const guidance = latestGuidance(dataset);
  const metric = latestMetric(dataset, period.id);
  const valuation = calculateTsmValuation(dataset, assumptions, scenario);
  const platform = platformRows(dataset, period.id);
  const technology = technologyRows(dataset, period.id);
  return {
    dataset,
    period,
    guidance,
    metric,
    platform,
    technology,
    valuation,
    annualRevenueBase: annualRevenueBase(dataset, period),
    dataStatus: {
      sourceType: dataset.dataSourceType ?? "mock",
      lastUpdated: period.asOfDate,
      missingFields: dataset.marketData.sourceStatus !== "market_data" ? ["backend_daily_price_bars"] : [],
      validationWarnings: valuation.validationWarnings ?? [],
      valuationReliable: true,
    },
    investmentQuestions: [
      {
        title: "Is AI/HPC demand structurally durable?",
        text: `HPC is ${pct(metric?.hpcMix ?? 0)} of latest wafer revenue; the model maps it only through explicit growth and margin assumptions.`,
      },
      {
        title: "Can leading-edge margins stay extraordinary?",
        text: `Q1 gross margin was ${pct(period.grossMargin)} and Q2 guidance midpoint is ${pct(guidance?.grossMargin ?? 0)}.`,
      },
      {
        title: "Does capex create moat or cash-flow pressure?",
        text: "Capex intensity funds N2, advanced packaging and global fabs, but it must be tested against normalized FCF per ADR.",
      },
      {
        title: "How much Taiwan risk is already priced?",
        text: "Geopolitical risk is an explicit haircut, not hidden inside a higher discount rate.",
      },
    ],
    risks: [
      ["Geopolitics / Taiwan concentration", "Export controls, cross-strait risk, customer contingency plans", "High"],
      ["AI accelerator digestion", "HPC growth slowdown, CoWoS order pushouts, hyperscaler capex revisions", "Medium"],
      ["Customer concentration", "Apple, NVIDIA, AMD, Broadcom demand concentration and pricing power", "Medium"],
      ["Overseas fab cost drag", "Arizona/Japan/Germany ramp cost, subsidies, utilization and depreciation", "Medium"],
      ["Node transition risk", "N2 yield, N3/N5 pricing, Intel/Samsung competition", "Medium"],
      ["Capex / FCF volatility", "Capex guidance, depreciation, working capital, dividend capacity", "Medium"],
    ],
  };
}
