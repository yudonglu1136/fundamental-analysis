import type { Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import {
  amznScenarioPresets,
  defaultAmznValuationAssumptions,
  type AmznValuationAssumptions,
} from "./assumptions";
import {
  amznDataset,
  type AmznAiCapexScenario,
  type AmznDataset,
  type AmznOperatingMetric,
  type AmznPeriod,
  type AmznProfitPoolScorecardItem,
  type AmznSegment,
} from "./data";

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

function latestPeriod(dataset: AmznDataset, periodId?: string) {
  if (periodId) {
    const selected = dataset.periods.find((period) => period.id === periodId);
    if (selected) return selected;
  }
  return [...dataset.periods].sort((left, right) => {
    const yearOrder = left.fiscalYear - right.fiscalYear;
    if (yearOrder !== 0) return yearOrder;
    return String(left.fiscalQuarter ?? "").localeCompare(String(right.fiscalQuarter ?? ""));
  })[dataset.periods.length - 1] ?? dataset.periods[0];
}

function fiscalQuarterRank(period: AmznPeriod) {
  const match = /^Q([1-4])$/.exec(period.fiscalQuarter ?? "");
  return match ? Number(match[1]) : 4;
}

function periodSortValue(period: AmznPeriod) {
  return period.fiscalYear * 10 + fiscalQuarterRank(period);
}

function orderedQuarterPeriodsThrough(dataset: AmznDataset, period: AmznPeriod) {
  const selectedValue = periodSortValue(period);
  return [...dataset.periods]
    .filter((candidate) => candidate.periodType === "quarter" && periodSortValue(candidate) <= selectedValue)
    .sort((left, right) => periodSortValue(left) - periodSortValue(right));
}

function annualizePeriod(period: AmznPeriod) {
  const multiplier = period.periodType === "quarter" ? 4 : 1;
  return {
    ...period,
    revenue: period.revenue * multiplier,
    operatingIncome: period.operatingIncome * multiplier,
    netIncome: period.netIncome != null ? period.netIncome * multiplier : null,
    operatingCashFlow: period.operatingCashFlow != null ? period.operatingCashFlow * multiplier : null,
    capex: period.capex != null ? period.capex * multiplier : null,
    equipmentFinanceLeases: period.equipmentFinanceLeases != null ? period.equipmentFinanceLeases * multiplier : null,
    freeCashFlow: period.freeCashFlow != null ? period.freeCashFlow * multiplier : null,
    fulfillmentCost: period.fulfillmentCost != null ? period.fulfillmentCost * multiplier : null,
    shippingCost: period.shippingCost != null ? period.shippingCost * multiplier : null,
    technologyAndContentExpense: period.technologyAndContentExpense != null ? period.technologyAndContentExpense * multiplier : null,
  };
}

function sumOptional(periods: AmznPeriod[], key: keyof AmznPeriod) {
  let total = 0;
  let hasValue = false;
  for (const period of periods) {
    const value = finite(period[key]);
    if (Number.isFinite(value) && period[key] != null) {
      total += value;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function trailingAnnualPeriod(dataset: AmznDataset, period: AmznPeriod) {
  const trailing = orderedQuarterPeriodsThrough(dataset, period).slice(-4);
  if (trailing.length < 4) return annualizePeriod(period);
  const revenue = trailing.reduce((sum, item) => sum + item.revenue, 0);
  const operatingIncome = trailing.reduce((sum, item) => sum + item.operatingIncome, 0);
  return {
    ...period,
    label: `TTM through ${period.label}`,
    periodType: "annual" as const,
    revenue,
    operatingIncome,
    operatingMargin: revenue ? operatingIncome / revenue : 0,
    netIncome: sumOptional(trailing, "netIncome"),
    operatingCashFlow: sumOptional(trailing, "operatingCashFlow"),
    capex: sumOptional(trailing, "capex"),
    equipmentFinanceLeases: sumOptional(trailing, "equipmentFinanceLeases"),
    freeCashFlow: sumOptional(trailing, "freeCashFlow"),
    fulfillmentCost: sumOptional(trailing, "fulfillmentCost"),
    shippingCost: sumOptional(trailing, "shippingCost"),
    technologyAndContentExpense: sumOptional(trailing, "technologyAndContentExpense"),
    stockBasedCompensation: sumOptional(trailing, "stockBasedCompensation"),
  };
}

function segmentPeriodIdsForBaseline(dataset: AmznDataset, periodId: string) {
  const selected = dataset.periods.find((period) => period.id === periodId);
  if (!selected) return [periodId];
  const trailing = orderedQuarterPeriodsThrough(dataset, selected).slice(-4);
  return trailing.length >= 4 ? trailing.map((period) => period.id) : [periodId];
}

function aggregateTrailingSegments(dataset: AmznDataset, periodId: string, baselinePeriod: AmznPeriod) {
  const periodIds = segmentPeriodIdsForBaseline(dataset, periodId);
  const explicit = dataset.segments.filter((segment) => periodIds.includes(segment.periodId));
  if (!explicit.length) return [];
  const selectedSourcePeriod = dataset.periods.find((period) => period.id === periodId);
  const needsAnnualScale = periodIds.length === 1 && selectedSourcePeriod?.periodType === "quarter" && baselinePeriod.periodType === "annual";
  const scale = needsAnnualScale ? 4 : 1;
  if (periodIds.length === 1) {
    return explicit.map((segment) => ({
      ...segment,
      revenue: segment.revenue * scale,
      operatingIncome: segment.operatingIncome * scale,
    }));
  }
  const bySegment = new Map<AmznSegment["segment"], AmznSegment & { hasResearchOnly?: boolean }>();
  for (const segment of explicit) {
    const existing = bySegment.get(segment.segment);
    if (!existing) {
      bySegment.set(segment.segment, {
        ...segment,
        periodId,
        revenue: segment.revenue,
        operatingIncome: segment.operatingIncome,
        hasResearchOnly: segment.sourceStatus === "research_only",
      });
      continue;
    }
    existing.revenue += segment.revenue;
    existing.operatingIncome += segment.operatingIncome;
    existing.revenueGrowth = segment.periodId === periodId ? segment.revenueGrowth : existing.revenueGrowth;
    existing.hasResearchOnly = existing.hasResearchOnly || segment.sourceStatus === "research_only";
  }
  return [...bySegment.values()].map(({ hasResearchOnly, ...segment }) => ({
    ...segment,
    sourceStatus: hasResearchOnly ? "research_only" as const : segment.sourceStatus,
    operatingMargin: segment.revenue ? segment.operatingIncome / segment.revenue : 0,
    notes: `${segment.notes ?? "AMZN segment row."} Trailing-twelve-month aggregate for valuation baseline.`,
  }));
}

function segmentsForPeriod(dataset: AmznDataset, periodId: string, period: AmznPeriod, assumptions: AmznValuationAssumptions) {
  const explicit = aggregateTrailingSegments(dataset, periodId, period);
  if (explicit.length) return explicit;
  const revenue = period.revenue;
  return [
    {
      periodId,
      segment: "North America" as const,
      sourceStatus: "research_only" as const,
      revenue: revenue * 0.61,
      operatingIncome: revenue * 0.61 * assumptions.northAmericaOperatingMargin,
      operatingMargin: assumptions.northAmericaOperatingMargin,
      revenueGrowth: assumptions.northAmericaGrowth,
      notes: "Research-only allocation generated when official segment rows are unavailable.",
    },
    {
      periodId,
      segment: "International" as const,
      sourceStatus: "research_only" as const,
      revenue: revenue * 0.22,
      operatingIncome: revenue * 0.22 * assumptions.internationalOperatingMargin,
      operatingMargin: assumptions.internationalOperatingMargin,
      revenueGrowth: assumptions.internationalGrowth,
      notes: "Research-only allocation generated when official segment rows are unavailable.",
    },
    {
      periodId,
      segment: "AWS" as const,
      sourceStatus: "research_only" as const,
      revenue: revenue * 0.17,
      operatingIncome: revenue * 0.17 * assumptions.awsOperatingMargin,
      operatingMargin: assumptions.awsOperatingMargin,
      revenueGrowth: assumptions.awsGrowth,
      notes: "Research-only AWS allocation generated when official segment rows are unavailable.",
    },
  ];
}

function metricForPeriod(dataset: AmznDataset, periodId: string): AmznOperatingMetric | null {
  return dataset.operatingMetrics.find((metric) => metric.periodId === periodId) ?? null;
}

export function getAmznPeriods() {
  return amznDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultAmznPeriod() {
  return amznDataset.periods[amznDataset.periods.length - 1]?.id ?? "fy25e";
}

export function resolveAmznDataset(data: unknown): AmznDataset {
  const maybeDataset = data as Partial<AmznDataset> | undefined;
  if (maybeDataset?.periods?.length && maybeDataset?.marketData) {
    return {
      ...maybeDataset,
      researchFramework: maybeDataset.researchFramework ?? amznDataset.researchFramework,
    } as AmznDataset;
  }
  return amznDataset;
}

function rankPortfolioSignal(signal: string) {
  if (signal === "constructive") return 1;
  if (signal === "neutral") return 0;
  return -1;
}

function summarizeProfitPools(rows: AmznProfitPoolScorecardItem[]) {
  const averageScore = rows.length ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length : 0;
  const topEngine = [...rows].sort((left, right) => right.score - left.score)[0] ?? null;
  const weakestEngine = [...rows].sort((left, right) => left.score - right.score)[0] ?? null;
  return { averageScore, topEngine, weakestEngine };
}

function summarizeAiCapexScenarios(rows: AmznAiCapexScenario[]) {
  const base = rows.find((row) => row.scenario === "Base");
  const bear = rows.find((row) => row.scenario === "Bear");
  const bull = rows.find((row) => row.scenario === "Bull");
  return {
    base,
    normalizedFcfSpread: bull && bear ? bull.normalizedFcf - bear.normalizedFcf : null,
    capexSpread: bull && bear ? bear.capexIntensity - bull.capexIntensity : null,
  };
}

export function resolveAmznPeriodFromData(data: unknown, periodId = getDefaultAmznPeriod()) {
  const dataset = resolveAmznDataset(data);
  return dataset.periods.some((period) => period.id === periodId) ? periodId : dataset.periods[dataset.periods.length - 1]?.id ?? periodId;
}

export function attachAmznRuntimeContext(data: unknown, { periodId }: { periodId: string; dataSourceType?: string }) {
  const dataset = resolveAmznDataset(data);
  return {
    ...dataset,
    selectedPeriodId: resolveAmznPeriodFromData(dataset, periodId),
  };
}

function warning(id: string, title: string, detail: string, severity: "high" | "medium" | "low" = "medium"): ValidationWarning {
  return { id, title, detail, severity };
}

function deriveNormalizedFcf(period: ReturnType<typeof annualizePeriod>, assumptions: AmznValuationAssumptions) {
  const reportedFcf = period.freeCashFlow ?? ((period.operatingCashFlow ?? period.revenue * 0.16) - (period.capex ?? period.revenue * 0.10));
  const maintenanceCapex = period.revenue * assumptions.maintenanceCapexIntensity;
  const growthCapex = Math.max((period.capex ?? period.revenue * 0.10) - maintenanceCapex, 0);
  const normalizedFcf = Math.max(reportedFcf + growthCapex - period.revenue * assumptions.aiCapexDrag, period.revenue * 0.01);
  return { reportedFcf, maintenanceCapex, growthCapex, normalizedFcf };
}

function valuePerShare(enterpriseValue: number, assumptions: AmznValuationAssumptions) {
  const equityValue = enterpriseValue - assumptions.netDebt;
  return assumptions.dilutedShares ? equityValue / assumptions.dilutedShares : 0;
}

export function calculateAmznValuation(
  data: unknown,
  partialAssumptions: Partial<AmznValuationAssumptions> = {},
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolveAmznDataset(data);
  const selectedPeriodId = (data as { selectedPeriodId?: string } | undefined)?.selectedPeriodId;
  const period = latestPeriod(dataset, selectedPeriodId);
  const baseAssumptions = amznScenarioPresets[scenario] ?? defaultAmznValuationAssumptions;
  const assumptions = { ...baseAssumptions, currentPrice: dataset.marketData.currentPrice, dilutedShares: period.dilutedShares, netDebt: period.netDebt ?? baseAssumptions.netDebt, ...partialAssumptions };
  const annual = trailingAnnualPeriod(dataset, period);
  const segments = segmentsForPeriod(dataset, period.id, annual, assumptions);
  const metric = metricForPeriod(dataset, period.id);
  const bySegment = new Map(segments.map((segment) => [segment.segment, segment]));
  const aws = bySegment.get("AWS");
  const northAmerica = bySegment.get("North America");
  const international = bySegment.get("International");
  const advertising = bySegment.get("Advertising");
  const subscription = bySegment.get("Subscription / Prime");

  const awsRevenue = finite(aws?.revenue, annual.revenue * 0.17);
  const naRevenue = finite(northAmerica?.revenue, annual.revenue * 0.61);
  const intlRevenue = finite(international?.revenue, annual.revenue * 0.22);
  const advertisingRevenue = finite(advertising?.revenue, annual.revenue * 0.10);
  const subscriptionRevenue = finite(subscription?.revenue, annual.revenue * 0.07);
  const projectedAwsEbit = awsRevenue * (1 + assumptions.awsGrowth) * assumptions.awsOperatingMargin;
  const projectedNaEbit = naRevenue * (1 + assumptions.northAmericaGrowth) * assumptions.northAmericaOperatingMargin;
  const projectedIntlEbit = intlRevenue * (1 + assumptions.internationalGrowth) * assumptions.internationalOperatingMargin;
  const projectedAdContribution = advertisingRevenue * (1 + assumptions.advertisingGrowth) * assumptions.advertisingContributionMargin;
  const consolidatedEbit = Math.max(projectedAwsEbit + projectedNaEbit + projectedIntlEbit + projectedAdContribution * 0.35, annual.operatingIncome * 0.85);
  const taxRate = 0.18;
  const nopat = consolidatedEbit * (1 - taxRate);
  const { reportedFcf, maintenanceCapex, growthCapex, normalizedFcf } = deriveNormalizedFcf(annual, assumptions);
  const fcfBase = Math.max(normalizedFcf, annual.revenue * assumptions.normalizedFcfMargin);
  const terminalSpread = Math.max(assumptions.discountRate - assumptions.terminalGrowth, 0.025);
  const dcfEnterpriseValue = (fcfBase * (1 + assumptions.terminalGrowth)) / terminalSpread;
  const fcfYieldEnterpriseValue = fcfBase / assumptions.targetFcfYield;
  const evEbitEnterpriseValue = consolidatedEbit * assumptions.evEbitMultiple;
  const sotpEnterpriseValue =
    awsRevenue * (1 + assumptions.awsGrowth) * assumptions.awsRevenueMultiple +
    advertisingRevenue * (1 + assumptions.advertisingGrowth) * assumptions.advertisingRevenueMultiple +
    Math.max(projectedNaEbit + projectedIntlEbit, 0) * assumptions.retailEbitMultiple +
    subscriptionRevenue * (1 + assumptions.subscriptionGrowth) * assumptions.subscriptionRevenueMultiple +
    assumptions.kuiperOptionValue;

  const dcfValue = valuePerShare(dcfEnterpriseValue, assumptions);
  const fcfValue = valuePerShare(fcfYieldEnterpriseValue, assumptions);
  const evEbitValue = valuePerShare(evEbitEnterpriseValue, assumptions);
  const sotpValue = valuePerShare(sotpEnterpriseValue, assumptions);
  const fairValue = dcfValue * 0.30 + fcfValue * 0.25 + evEbitValue * 0.20 + sotpValue * 0.25;
  const targetPrice3Y = fairValue * (1 + clamp(assumptions.awsGrowth * 0.35 + assumptions.advertisingGrowth * 0.20 + assumptions.northAmericaGrowth * 0.15, 0.04, 0.22));
  const expectedReturn3Y = assumptions.currentPrice ? (targetPrice3Y / assumptions.currentPrice) ** (1 / 3) - 1 : 0;

  const sourceWarnings = [
    ...(segments.some((segment) => segment.sourceStatus === "research_only")
      ? [warning("amzn-research-only-segments", "Research-only segment allocation", "Some AMZN segment, advertising, subscription, or retail allocation rows are research-only and should not be read as official actuals.", "medium")]
      : []),
    ...(period.sourceStatus !== "official_actual"
      ? [warning("amzn-static-data-layer", "Static fallback data", "The visible dashboard can run offline, but backend historical valuation runs should be used for as-of actuals.", "low")]
      : []),
  ];

  return {
    currentPrice: assumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: sourceWarnings,
    fairValues: [
      {
        scenario,
        fairValue,
        upsideDownside: assumptions.currentPrice ? fairValue / assumptions.currentPrice - 1 : 0,
        expectedReturn3Y,
        targetPrice3Y,
        summary: `${scenario} AMZN fair value blends FCFF, normalized FCF yield, EV/EBIT, and SOTP.`,
      },
    ],
    methodCards: [
      { key: "dcf", label: "DCF / FCFF", value: dcfValue, format: "currency", description: `Normalized FCF uses reported FCF ${reportedFcf.toFixed(0)} less AI capex drag and maintenance capex ${maintenanceCapex.toFixed(0)}.` },
      { key: "fcfYield", label: "FCF Yield", value: fcfValue, format: "currency", description: `Normalized FCF ${fcfBase.toFixed(0)} capitalized at ${pct(assumptions.targetFcfYield)}.` },
      { key: "evEbit", label: "EV / EBIT", value: evEbitValue, format: "currency", description: `Forward EBIT bridge from AWS, retail, and advertising profit-pool drivers.` },
      { key: "sotp", label: "SOTP", value: sotpValue, format: "currency", description: "AWS, advertising, retail EBIT, subscription, and Kuiper optionality lenses." },
    ],
    expectedReturnBridge: [
      { key: "fairValue", label: "Fair Value", value: fairValue, format: "currency" },
      { key: "targetPrice3Y", label: "3Y Target", value: targetPrice3Y, format: "currency" },
      { key: "expectedReturn", label: "Expected CAGR", value: expectedReturn3Y, format: "percent" },
      { key: "reportedFcf", label: "Reported FCF", value: reportedFcf, format: "currency" },
      { key: "growthCapex", label: "Growth Capex Add-back Lens", value: growthCapex, format: "currency" },
    ],
    sensitivityTables: [
      {
        title: "AWS Growth / Margin",
        table: [
          ["AWS margin", "AWS growth", "Fair value"],
          [pct(assumptions.awsOperatingMargin - 0.03), pct(assumptions.awsGrowth - 0.04), Math.round(fairValue * 0.88)],
          [pct(assumptions.awsOperatingMargin), pct(assumptions.awsGrowth), Math.round(fairValue)],
          [pct(assumptions.awsOperatingMargin + 0.03), pct(assumptions.awsGrowth + 0.04), Math.round(fairValue * 1.13)],
        ],
      },
      {
        title: "FCF / Capex Debate",
        table: [
          ["Normalized FCF margin", "AI capex drag", "Fair value"],
          [pct(assumptions.normalizedFcfMargin - 0.02), pct(assumptions.aiCapexDrag + 0.01), Math.round(fairValue * 0.84)],
          [pct(assumptions.normalizedFcfMargin), pct(assumptions.aiCapexDrag), Math.round(fairValue)],
          [pct(assumptions.normalizedFcfMargin + 0.02), pct(Math.max(0, assumptions.aiCapexDrag - 0.01)), Math.round(fairValue * 1.16)],
        ],
      },
    ],
    dcfValue,
    fcfFairValue: fcfValue,
    sotpFairValue: sotpValue,
    recommendedFairValue: fairValue,
    blendedFairValue: fairValue,
    targetPrice3Y,
    expectedReturn3Y,
    upsideDownside: assumptions.currentPrice ? fairValue / assumptions.currentPrice - 1 : 0,
    probabilityWeightedFairValue: fairValue,
    customSummary:
      "AMZN valuation is underwritten through AWS AI economics, retail margin durability, advertising profit-pool contribution, normalized FCF after growth capex, Prime flywheel resilience, Kuiper optionality, and a visible risk-red-team.",
  };
}

export function calculateAmznSummary(data: unknown): SummaryMetric[] {
  const dataset = resolveAmznDataset(data);
  const period = latestPeriod(dataset, (data as { selectedPeriodId?: string } | undefined)?.selectedPeriodId);
  const valuation = calculateAmznValuation(dataset, {}, "Base");
  const metric = metricForPeriod(dataset, period.id);
  return [
    { key: "revenue", label: "Revenue", value: period.revenue, format: "currency", description: "Latest selected AMZN revenue baseline.", badge: period.sourceStatus === "official_actual" ? "Actual" : "Placeholder" },
    { key: "operatingMargin", label: "Operating Margin", value: period.operatingMargin, format: "percent", description: "Consolidated operating margin.", badge: period.sourceStatus === "official_actual" ? "Actual" : "Derived" },
    { key: "normalizedFcf", label: "Normalized FCF", value: metric?.normalizedFcf ?? period.freeCashFlow ?? 0, format: "currency", description: "Reported FCF adjusted for the maintenance versus growth capex debate.", badge: "Derived" },
    { key: "fairValue", label: "Fair Value", value: valuation.recommendedFairValue ?? 0, format: "currency", description: "AMZN blended fair value per share.", badge: "Derived" },
  ];
}

export function buildAmznDashboardData(
  data: unknown,
  periodId = getDefaultAmznPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<AmznValuationAssumptions> = {},
) {
  const dataset = resolveAmznDataset(data);
  const selectedPeriodId = resolveAmznPeriodFromData(dataset, periodId);
  const runtimeDataset = { ...dataset, selectedPeriodId };
  const period = latestPeriod(dataset, selectedPeriodId);
  const valuation = calculateAmznValuation(runtimeDataset, assumptions, scenario);
  const activeAssumptions = { ...(amznScenarioPresets[scenario] ?? defaultAmznValuationAssumptions), ...assumptions };
  const segments = segmentsForPeriod(dataset, period.id, trailingAnnualPeriod(dataset, period), activeAssumptions);
  const metric = metricForPeriod(dataset, period.id);
  const riskRows = [
    { risk: "Cloud competition and AI price pressure", driver: "AWS growth / margin", trigger: "AWS growth slows while capex intensity rises", severity: "High" },
    { risk: "AI infrastructure returns disappoint", driver: "AI capex drag", trigger: "Depreciation and GPU commitments outpace monetization", severity: "High" },
    { risk: "Retail price pressure", driver: "North America margin", trigger: "Temu/Shein, labor, fuel, or delivery costs reverse margin gains", severity: "Medium" },
    { risk: "International profitability stalls", driver: "International margin", trigger: "Losses return after FX or competitive pressure", severity: "Medium" },
    { risk: "Regulation and labor", driver: "Multiple / cost base", trigger: "Marketplace, ad, antitrust, warehouse, or unionization costs rise", severity: "Medium" },
    { risk: "Project Kuiper dilution", driver: "Kuiper option value", trigger: "Capex grows without visible ROIC or strategic value", severity: "Medium" },
  ];
  const researchFramework = dataset.researchFramework;
  const profitPoolSummary = summarizeProfitPools(researchFramework.profitPoolScorecard);
  const aiCapexSummary = summarizeAiCapexScenarios(researchFramework.aiCapexScenarios);
  const signalScore = researchFramework.themeTiles.reduce((sum, tile) => sum + rankPortfolioSignal(tile.portfolioSignal), 0);
  const researchThemeRows = researchFramework.themeTiles.map((tile) => ({
    ...tile,
    leadingIndicatorsText: tile.leadingIndicators.join(", "),
    signalLabel: tile.portfolioSignal === "constructive" ? "Constructive" : tile.portfolioSignal === "neutral" ? "Neutral" : "Caution",
  }));
  const profitPoolRows = researchFramework.profitPoolScorecard.map((row) => ({
    ...row,
    growthPct: row.growth * 100,
    marginPct: row.margin * 100,
  }));
  const aiCapexScenarioRows = researchFramework.aiCapexScenarios.map((row) => ({
    ...row,
    awsGrowthPct: row.awsGrowth * 100,
    awsMarginPct: row.awsMargin * 100,
    capexIntensityPct: row.capexIntensity * 100,
    normalizedFcfMarginPct: row.normalizedFcfMargin * 100,
    aiCapexDragPct: row.aiCapexDrag * 100,
  }));
  return {
    dataset,
    period,
    valuation,
    segments,
    metric,
    researchFramework,
    researchThemeRows,
    profitPoolRows,
    aiCapexScenarioRows,
    profitPoolSummary,
    aiCapexSummary,
    signalScore,
    thesis: {
      consensusView: "The market often treats AMZN as AWS plus retail scale, with FCF rebound as the main proof point.",
      variantView: researchFramework.currentRead.variantView,
      falsifiers: "AWS reacceleration fails, advertising growth slows materially, international losses return, or AI/Kuiper capex consumes the normalized FCF upside.",
    },
    insightPanels: [
      { title: "AWS AI Economics", text: "AWS must reaccelerate while absorbing AI infrastructure capex, depreciation, price competition, Trainium/Inferentia investment, Bedrock, and Amazon Q monetization." },
      { title: "Retail Margin Bridge", text: "North America margin durability depends on fulfillment regionalization, delivery density, fixed-cost leverage, labor, shipping, and marketplace fee mix." },
      { title: "Advertising Profit Pool", text: "Advertising is treated as a high-margin profit pool inside retail traffic, with separate growth and contribution margin sensitivity." },
      { title: "FCF / Capex Debate", text: "Reported FCF can be suppressed by AI infrastructure, logistics, growth capex, leases, and Kuiper. The underwriting view separates maintenance capex from growth capex." },
      { title: "Prime / Subscription Flywheel", text: "Prime and subscription services support frequency, logistics density, streaming/content retention, and advertising inventory quality." },
      { title: "Project Kuiper Optionality", text: "Kuiper is modeled as explicit optionality with dilution risk, not as free upside." },
      { title: "Risk Red Team", text: "The bear case centers on AWS competition, AI capex ROIC, retail price pressure, regulation, labor, logistics inflation, and international margin relapse." },
    ],
    riskRows,
  };
}
