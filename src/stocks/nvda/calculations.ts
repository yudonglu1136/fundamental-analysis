import type { DataSourceType, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { defaultNvdaValuationAssumptions, nvdaScenarioPresets, type NvdaValuationAssumptions } from "./assumptions";
import { nvdaDataset } from "./data";
import type { NvdaDataset, NvdaOperatingMetric, NvdaPeriod, NvdaSegment } from "./model";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fiscalQuarterRank(period: Pick<NvdaPeriod, "fiscalQuarter">) {
  const match = /^Q([1-4])$/.exec(period.fiscalQuarter ?? "");
  return match ? Number(match[1]) : 4;
}

function periodSortValue(period: Pick<NvdaPeriod, "fiscalYear" | "fiscalQuarter">) {
  return period.fiscalYear * 10 + fiscalQuarterRank(period);
}

function latestPeriod(dataset: NvdaDataset, periodId?: string) {
  if (periodId) {
    const selected = dataset.periods.find((period) => period.id === periodId);
    if (selected) return selected;
  }
  return [...dataset.periods].sort((left, right) => periodSortValue(left) - periodSortValue(right))[dataset.periods.length - 1] ?? dataset.periods[0];
}

function orderedQuarterPeriodsThrough(dataset: NvdaDataset, period: NvdaPeriod) {
  const selectedValue = periodSortValue(period);
  return [...dataset.periods]
    .filter((candidate) => candidate.periodType === "quarter" && periodSortValue(candidate) <= selectedValue)
    .sort((left, right) => periodSortValue(left) - periodSortValue(right));
}

function sumOptional(periods: NvdaPeriod[], key: keyof NvdaPeriod) {
  let total = 0;
  let hasValue = false;
  for (const period of periods) {
    if (typeof period[key] === "number") {
      total += period[key] as number;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function trailingAnnualPeriod(dataset: NvdaDataset, period: NvdaPeriod) {
  const trailing = orderedQuarterPeriodsThrough(dataset, period).slice(-4);
  if (trailing.length < 4) {
    const multiplier = period.periodType === "quarter" ? 4 : 1;
    return {
      ...period,
      periodType: "annual" as const,
      revenue: period.revenue * multiplier,
      grossProfit: period.grossProfit * multiplier,
      operatingIncome: period.operatingIncome * multiplier,
      netIncome: period.netIncome != null ? period.netIncome * multiplier : null,
      operatingCashFlow: period.operatingCashFlow != null ? period.operatingCashFlow * multiplier : null,
      capex: period.capex != null ? period.capex * multiplier : null,
      freeCashFlow: period.freeCashFlow != null ? period.freeCashFlow * multiplier : null,
    };
  }
  const revenue = trailing.reduce((sum, item) => sum + item.revenue, 0);
  const grossProfit = trailing.reduce((sum, item) => sum + item.grossProfit, 0);
  const operatingIncome = trailing.reduce((sum, item) => sum + item.operatingIncome, 0);
  return {
    ...period,
    label: `TTM through ${period.label}`,
    periodType: "annual" as const,
    revenue,
    grossProfit,
    grossMargin: revenue ? grossProfit / revenue : period.grossMargin,
    operatingIncome,
    operatingMargin: revenue ? operatingIncome / revenue : period.operatingMargin,
    netIncome: sumOptional(trailing, "netIncome"),
    operatingCashFlow: sumOptional(trailing, "operatingCashFlow"),
    capex: sumOptional(trailing, "capex"),
    freeCashFlow: sumOptional(trailing, "freeCashFlow"),
    inventory: period.inventory,
    accountsReceivable: period.accountsReceivable,
    deferredRevenue: period.deferredRevenue,
    dilutedShares: period.dilutedShares,
    cashAndMarketableSecurities: period.cashAndMarketableSecurities,
    debt: period.debt,
  };
}

function aggregateTrailingSegments(dataset: NvdaDataset, period: NvdaPeriod) {
  const trailingIds = orderedQuarterPeriodsThrough(dataset, period).slice(-4).map((row) => row.id);
  const rows = dataset.segments.filter((segment) => trailingIds.includes(segment.periodId));
  const bySegment = new Map<string, NvdaSegment>();
  for (const row of rows) {
    const existing = bySegment.get(row.segment);
    if (!existing) {
      bySegment.set(row.segment, { ...row, periodId: period.id });
      continue;
    }
    existing.revenue += row.revenue;
    existing.sourceStatus = existing.sourceStatus === "official_actual" && row.sourceStatus === "official_actual" ? "official_actual" : "research_only";
    existing.growth = row.periodId === period.id ? row.growth : existing.growth;
  }
  return [...bySegment.values()];
}

function metricForPeriod(dataset: NvdaDataset, periodId: string): NvdaOperatingMetric | null {
  return dataset.operatingMetrics.find((metric) => metric.periodId === periodId) ?? null;
}

function warning(id: string, title: string, detail: string, severity: "high" | "medium" | "low" = "medium"): ValidationWarning {
  return { id, title, detail, severity };
}

function valuePerShare(enterpriseValue: number, assumptions: NvdaValuationAssumptions) {
  const equityValue = enterpriseValue + assumptions.netCash;
  return assumptions.dilutedShares ? equityValue / assumptions.dilutedShares : 0;
}

function projectFcfDcf(annual: NvdaPeriod, assumptions: NvdaValuationAssumptions) {
  const startingRevenue = annual.revenue;
  const blendedGrowth = clamp(assumptions.dataCenterGrowth * 0.72 + assumptions.gamingGrowth * 0.08 + 0.04, -0.05, 0.70);
  let revenue = startingRevenue;
  let presentValue = 0;
  for (let year = 1; year <= 6; year += 1) {
    const fade = Math.max(0.25, 1 - (year - 1) * 0.15);
    const yearGrowth = assumptions.terminalGrowth + (blendedGrowth - assumptions.terminalGrowth) * fade;
    revenue *= 1 + yearGrowth;
    const marginFade = assumptions.normalizedFcfMargin - Math.max(0, year - 3) * 0.01;
    const fcf = revenue * clamp(marginFade, 0.08, 0.68);
    presentValue += fcf / (1 + assumptions.discountRate) ** year;
  }
  const terminalFcf = revenue * clamp(assumptions.normalizedFcfMargin - 0.025, 0.08, 0.65) * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcf / Math.max(assumptions.discountRate - assumptions.terminalGrowth, 0.02);
  presentValue += terminalValue / (1 + assumptions.discountRate) ** 6;
  return presentValue;
}

export function getNvdaPeriods() {
  return nvdaDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultNvdaPeriod() {
  return nvdaDataset.periods[nvdaDataset.periods.length - 1]?.id ?? "fy26-q4";
}

export function resolveNvdaDataset(data: unknown): NvdaDataset {
  const maybeDataset = data as Partial<NvdaDataset> | undefined;
  if (maybeDataset?.periods?.length && maybeDataset?.marketData) return maybeDataset as NvdaDataset;
  return nvdaDataset;
}

export function resolveNvdaPeriodFromData(data: unknown, periodId = getDefaultNvdaPeriod()) {
  const dataset = resolveNvdaDataset(data);
  return dataset.periods.some((period) => period.id === periodId) ? periodId : dataset.periods[dataset.periods.length - 1]?.id ?? periodId;
}

export function attachNvdaRuntimeContext(data: unknown, { periodId, dataSourceType }: { periodId: string; dataSourceType?: DataSourceType }) {
  const dataset = resolveNvdaDataset(data);
  return {
    ...dataset,
    selectedPeriodId: resolveNvdaPeriodFromData(dataset, periodId),
    dataSourceType,
  };
}

export function calculateNvdaValuation(
  data: unknown,
  partialAssumptions: Partial<NvdaValuationAssumptions> = {},
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolveNvdaDataset(data);
  const selectedPeriodId = (data as { selectedPeriodId?: string } | undefined)?.selectedPeriodId;
  const period = latestPeriod(dataset, selectedPeriodId);
  const annual = trailingAnnualPeriod(dataset, period);
  const segments = aggregateTrailingSegments(dataset, period);
  const baseAssumptions = nvdaScenarioPresets[scenario] ?? defaultNvdaValuationAssumptions;
  const assumptions: NvdaValuationAssumptions = {
    ...baseAssumptions,
    currentPrice: dataset.marketData.currentPrice,
    dilutedShares: period.dilutedShares || dataset.marketData.sharesOutstanding,
    netCash: (period.cashAndMarketableSecurities ?? 0) - (period.debt ?? 0),
    grossMargin: period.grossMargin || baseAssumptions.grossMargin,
    operatingMargin: period.operatingMargin || baseAssumptions.operatingMargin,
    ...partialAssumptions,
  };
  const metric = metricForPeriod(dataset, period.id);
  const segmentRevenue = (name: string, fallback: number) => finite(segments.find((segment) => segment.segment === name)?.revenue, fallback);
  const dataCenterRevenue = finite(metric?.dataCenterRevenue, segmentRevenue("Data Center", annual.revenue * 0.78));
  const networkingRevenue = finite(metric?.networkingRevenue, dataCenterRevenue * assumptions.networkingAttachRate);
  const gamingRevenue = finite(metric?.gamingRevenue, segmentRevenue("Gaming", annual.revenue * 0.10));
  const automotiveRevenue = segmentRevenue("Automotive", annual.revenue * 0.02);
  const proVizRevenue = segmentRevenue("Professional Visualization", annual.revenue * 0.03);
  const oemOtherRevenue = segmentRevenue("OEM / Other", annual.revenue * 0.02);
  const normalizedFcf = annual.revenue * assumptions.normalizedFcfMargin;
  const normalizedEbit = annual.revenue * assumptions.operatingMargin;
  const taxRate = 0.15;
  const normalizedNetIncome = normalizedEbit * (1 - taxRate);
  const riskMultiplier = clamp(
    1 - assumptions.productTransitionRisk - assumptions.chinaRiskHaircut - assumptions.customAsicShareRisk + assumptions.supplyConstraintBenefit,
    0.55,
    1.18,
  );

  const dcfFairValue = valuePerShare(projectFcfDcf(annual, assumptions) * riskMultiplier, assumptions);
  const fcfYieldFairValue = valuePerShare((normalizedFcf / assumptions.targetFcfYield) * riskMultiplier, assumptions);
  const peFairValue = assumptions.dilutedShares ? ((normalizedNetIncome * assumptions.targetPe) * riskMultiplier + assumptions.netCash) / assumptions.dilutedShares : 0;
  const evEbitFairValue = valuePerShare((normalizedEbit * assumptions.evEbitMultiple) * riskMultiplier, assumptions);
  const sotpEnterpriseValue =
    (dataCenterRevenue - networkingRevenue) * assumptions.dataCenterRevenueMultiple +
    networkingRevenue * assumptions.networkingRevenueMultiple +
    gamingRevenue * assumptions.gamingRevenueMultiple +
    automotiveRevenue * assumptions.automotiveRevenueMultiple +
    proVizRevenue * 4 +
    oemOtherRevenue * 2;
  const sotpFairValue = valuePerShare(sotpEnterpriseValue * riskMultiplier, assumptions);
  const weights = { dcf: 0.30, fcf: 0.22, pe: 0.16, evEbit: 0.16, sotp: 0.16 };
  const blendedFairValue =
    dcfFairValue * weights.dcf +
    fcfYieldFairValue * weights.fcf +
    peFairValue * weights.pe +
    evEbitFairValue * weights.evEbit +
    sotpFairValue * weights.sotp;
  const fairValue = Math.max(0, blendedFairValue);
  const targetPrice3Y = fairValue * (1 + clamp(assumptions.dataCenterGrowth * 0.20 + assumptions.gamingGrowth * 0.05, 0.02, 0.16)) ** 3;
  const cumulativeDividends = assumptions.currentPrice * 0.0005 * 3;
  const expectedReturn3Y = assumptions.currentPrice ? ((targetPrice3Y + cumulativeDividends) / assumptions.currentPrice) ** (1 / 3) - 1 : 0;
  const upsideDownside = assumptions.currentPrice ? fairValue / assumptions.currentPrice - 1 : 0;
  const sourceWarnings = [
    ...(segments.some((segment) => segment.sourceStatus === "research_only")
      ? [warning("nvda-segment-research-only", "Segment rows are research-only", "Segment and product rows are backend-owned but not marked official_actual unless official platform tables are imported.", "medium")]
      : []),
    ...(dataset.marketData.sourceStatus !== "market_data"
      ? [warning("nvda-price-source", "Price source requires backend market data", "Historical valuation runs should use daily_price_bars adjusted close from the backend.", "medium")]
      : []),
  ];

  return {
    currentPrice: assumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    fairValues: [
      {
        scenario,
        fairValue,
        upsideDownside,
        expectedReturn3Y,
        targetPrice3Y,
        cumulativeDividends,
        summary: `${scenario} case: Data Center growth ${pct(assumptions.dataCenterGrowth)}, FCF margin ${pct(assumptions.normalizedFcfMargin)}, risk multiplier ${riskMultiplier.toFixed(2)}x.`,
      },
    ],
    methodCards: [
      { key: "dcf", label: "DCF / FCFF", value: dcfFairValue, format: "currency", description: "Six-year FCFF fade from event-dated revenue, margin, discount-rate, and terminal-growth assumptions.", sourceConfidence: "medium" },
      { key: "fcf-yield", label: "FCF Yield", value: fcfYieldFairValue, format: "currency", description: "Normalized FCF capitalized at an explicit target FCF yield.", sourceConfidence: "medium" },
      { key: "pe", label: "P/E", value: peFairValue, format: "currency", description: "Normalized EBIT after tax, valued at an explicit P/E multiple.", sourceConfidence: "medium" },
      { key: "ev-ebit", label: "EV / EBIT", value: evEbitFairValue, format: "currency", description: "Operating profit power valued at an EV / EBIT multiple.", sourceConfidence: "medium" },
      { key: "sotp", label: "SOTP", value: sotpFairValue, format: "currency", description: "AI accelerators, networking/systems, Gaming, Automotive, ProViz, and OEM bridge.", sourceConfidence: "low" },
    ],
    expectedReturnBridge: [
      { key: "fair-value", label: "Fair value", value: fairValue, format: "currency" },
      { key: "upside", label: "Upside / downside", value: upsideDownside, format: "percent" },
      { key: "three-year-cagr", label: "3Y CAGR", value: expectedReturn3Y, format: "percent" },
    ],
    sensitivityTables: [
      {
        title: "Data Center Growth / FCF Yield Sensitivity",
        table: [
          ["Growth \\ FCF yield", "3.0%", "3.5%", "4.0%"],
          ["Base -10 pts", Math.round(fcfYieldFairValue * 0.84), Math.round(fcfYieldFairValue * 0.72), Math.round(fcfYieldFairValue * 0.63)],
          ["Base", Math.round(fcfYieldFairValue * 0.98), Math.round(fcfYieldFairValue), Math.round(fcfYieldFairValue * 0.88)],
          ["Base +10 pts", Math.round(fcfYieldFairValue * 1.20), Math.round(fcfYieldFairValue * 1.06), Math.round(fcfYieldFairValue * 0.95)],
        ],
      },
      {
        title: "Risk Haircut Sensitivity",
        table: [
          ["Risk haircut", "Low", "Base", "High"],
          ["Fair value", Math.round(fairValue / riskMultiplier * clamp(riskMultiplier + 0.08, 0.55, 1.18)), Math.round(fairValue), Math.round(fairValue / riskMultiplier * clamp(riskMultiplier - 0.10, 0.55, 1.18))],
        ],
      },
    ],
    dcfValue: dcfFairValue,
    fcfFairValue: fcfYieldFairValue,
    peFairValue,
    sotpFairValue,
    blendedFairValue: fairValue,
    recommendedFairValue: fairValue,
    recommendedFairValueMethod: "Blended DCF / FCF yield / P/E / EV-EBIT / SOTP",
    targetPrice3Y,
    expectedReturn3Y,
    upsideDownside,
    valuationRangeLow: Math.min(dcfFairValue, fcfYieldFairValue, peFairValue, evEbitFairValue, sotpFairValue),
    valuationRangeBase: fairValue,
    valuationRangeHigh: Math.max(dcfFairValue, fcfYieldFairValue, peFairValue, evEbitFairValue, sotpFairValue),
    validationWarnings: sourceWarnings,
    customSummary: "NVDA valuation is organized around AI infrastructure durability: Data Center growth, networking attach, ASP/gross-margin cycle, supply constraints, China controls, and custom silicon risk.",
  };
}

export function calculateNvdaSummary(data: unknown): SummaryMetric[] {
  const dataset = resolveNvdaDataset(data);
  const period = latestPeriod(dataset, dataset.selectedPeriodId);
  const metric = metricForPeriod(dataset, period.id);
  return [
    {
      key: "revenue",
      label: "Quarter Revenue",
      value: period.revenue,
      format: "currency",
      description: "Backend consolidated revenue for selected event when API is online.",
      badge: period.sourceStatus === "official_actual" ? "Actual" : "Needs Review",
    },
    {
      key: "grossMargin",
      label: "Gross Margin",
      value: period.grossMargin,
      format: "percent",
      description: "Gross margin is the central ASP and product-cycle debate.",
      badge: "Actual",
    },
    {
      key: "dataCenterGrowth",
      label: "Data Center Growth",
      value: metric?.dataCenterGrowth ?? 0,
      format: "percent",
      description: "Backend platform proxy unless official segment disclosures are imported.",
      badge: metric?.sourceStatus === "official_actual" ? "Actual" : "Derived",
    },
  ];
}

export function buildNvdaDashboardData(data: unknown, periodId: string, scenario: Scenario, assumptions: Partial<NvdaValuationAssumptions>) {
  const dataset = attachNvdaRuntimeContext(data, { periodId });
  const period = latestPeriod(dataset, dataset.selectedPeriodId);
  const annual = trailingAnnualPeriod(dataset, period);
  const segments = aggregateTrailingSegments(dataset, period);
  const metric = metricForPeriod(dataset, period.id);
  const valuation = calculateNvdaValuation(dataset, assumptions, scenario);
  const dataCenter = segments.find((segment) => segment.segment === "Data Center");
  const gaming = segments.find((segment) => segment.segment === "Gaming");
  return {
    period,
    annual,
    segments,
    metric,
    valuation,
    dataStatus: {
      sourceType: dataset.dataSourceType ?? "mock",
      lastUpdated: dataset.marketData.priceDate,
      missingFields: segments.some((segment) => segment.sourceStatus === "research_only") ? ["official_segment_revenue_by_platform"] : [],
      validationWarnings: valuation.validationWarnings ?? [],
      valuationReliable: true,
    },
    cockpit: {
      dataCenterRevenue: dataCenter?.revenue ?? metric?.dataCenterRevenue ?? 0,
      gamingRevenue: gaming?.revenue ?? metric?.gamingRevenue ?? 0,
      grossMargin: period.grossMargin,
      operatingMargin: period.operatingMargin,
      fcfConversion: metric?.fcfConversion ?? (period.netIncome ? finite(period.freeCashFlow) / period.netIncome : 0),
      productCyclePhase: metric?.productCyclePhase ?? "Product cycle not loaded",
    },
    insights: [
      { title: "Data Center AI Demand", text: "The dashboard tests whether Data Center growth is durable demand or supply/product-cycle pull-forward." },
      { title: "GPU Product Cycle: Hopper / Blackwell / Rubin", text: metric?.productCyclePhase ?? "Product-cycle phase loads from backend operating metrics." },
      { title: "Gross Margin and ASP Cycle", text: `Selected gross margin is ${pct(period.grossMargin)} and operating margin is ${pct(period.operatingMargin)}.` },
      { title: "Networking Attach / Systems Mix", text: "Networking attach is separated in backend product metrics where available and shown as research-only otherwise." },
      { title: "Training vs Inference Mix", text: "Inference scaling is monitored as a margin/volume variable rather than treated as a static growth story." },
      { title: "Hyperscaler Customer Concentration", text: "Cloud customer monetization and overbuild risk are core red-team variables." },
      { title: "China Export Controls", text: "China controls only enter as a dated assumption after they were knowable in the backend snapshot." },
      { title: "Supply Chain / CoWoS Constraint", text: "TSMC and CoWoS constraints are treated as supply-timing and margin-allocation variables after the AI cluster ramp." },
      { title: "Gaming Normalization", text: "Gaming is valued as support and cyclicality, not the core accelerator moat." },
      { title: "Risk Red Team", text: "Bear case focuses on hyperscaler digestion, ASIC share loss, China constraints, transition risk, and gross-margin normalization." },
    ],
  };
}
