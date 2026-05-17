import type { DataSourceType, DataStatus, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import { triDataset } from "./data";
import type { TriDataset, TriPeriod, TriScenarioDriver, TriValuationAssumptions } from "./model";

export { triDataset };

type TriRuntimeContext = {
  __triResolvedPeriod?: string;
  __triRequestedDataSourceType?: DataSourceType;
};

type TriDatasetInput = TriDataset & Partial<TriRuntimeContext>;

function isTriDataset(value: unknown): value is TriDatasetInput {
  return Boolean(value && typeof value === "object" && "ticker" in value && "aiMilestones" in value);
}

export function resolveTriDataset(data: unknown): TriDatasetInput {
  return isTriDataset(data) ? data : triDataset;
}

export function attachTriRuntimeContext(data: TriDataset, context: { periodId?: string; dataSourceType?: DataSourceType }): TriDatasetInput {
  return { ...data, __triResolvedPeriod: context.periodId, __triRequestedDataSourceType: context.dataSourceType };
}

export function getDefaultTriPeriod() {
  return "q1-26";
}

export function getTriPeriods() {
  return triDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function resolveTriPeriodFromData(data: unknown, fallback = getDefaultTriPeriod()) {
  const dataset = resolveTriDataset(data);
  const runtimePeriod = dataset.__triResolvedPeriod;
  if (runtimePeriod && dataset.periods.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.periods.some((period) => period.id === fallback) ? fallback : getDefaultTriPeriod();
}

function getPeriod(data: TriDataset, periodId: string): TriPeriod {
  return data.periods.find((period) => period.id === periodId) ?? data.periods[0];
}

function getScenario(data: TriDataset, scenario: Scenario): TriScenarioDriver {
  return data.scenarioDrivers.find((driver) => driver.scenario === scenario) ?? data.scenarioDrivers[1];
}

function safeDivide(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function metric(label: string, value: number, format: SummaryMetric["format"], description: string, badge: SummaryMetric["badge"]): SummaryMetric {
  return {
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    value,
    format,
    description,
    badge,
  };
}

export const defaultTriValuationAssumptions: TriValuationAssumptions = {
  currentPrice: triDataset.marketData.currentPrice,
  revenueCagr: 0.074,
  big3OrganicGrowth: 0.092,
  terminalAdjustedEbitdaMargin: 0.405,
  fcfConversionOfEbitda: 0.64,
  targetFcfYield: 0.047,
  targetEvEbitda: 16,
  targetPe: 22,
  wacc: 0.079,
  terminalGrowth: 0.025,
  taxRate: 0.19,
  capexPctRevenue: 0.08,
  workingCapitalPctRevenueGrowth: 0.03,
  aiPremium: 0.04,
  aiPremiumCap: 0.08,
  riskDiscount: -0.035,
  riskDiscountCap: 0.12,
  dilutedShares: triDataset.marketData.sharesOutstanding,
  netDebt: triDataset.marketData.enterpriseValue - triDataset.marketData.marketCap,
  dividendPerShare: triDataset.marketData.dividendPerShare,
  weightDcf: 0.3,
  weightFcfYield: 0.2,
  weightEvEbitda: 0.2,
  weightPe: 0.1,
  weightSotp: 0.2,
};

export const triScenarioPresets = Object.fromEntries(
  triDataset.scenarioDrivers.map((driver) => [
    driver.scenario,
    {
      ...defaultTriValuationAssumptions,
      revenueCagr: driver.revenueCagr,
      big3OrganicGrowth: driver.big3OrganicGrowth,
      terminalAdjustedEbitdaMargin: driver.terminalAdjustedEbitdaMargin,
      fcfConversionOfEbitda: driver.fcfConversionOfEbitda,
      targetFcfYield: driver.targetFcfYield,
      targetEvEbitda: driver.targetEvEbitda,
      targetPe: driver.targetPe,
      wacc: driver.wacc,
      terminalGrowth: driver.terminalGrowth,
      aiPremium: driver.aiPremium,
      aiPremiumCap: driver.aiPremiumCap,
      riskDiscount: driver.riskDiscount,
      riskDiscountCap: driver.riskDiscountCap,
    },
  ]),
) as Record<Scenario, TriValuationAssumptions>;

export function calculateTriSummary(data: unknown, periodId = getDefaultTriPeriod()): SummaryMetric[] {
  const dataset = resolveTriDataset(data);
  const period = getPeriod(dataset, periodId);
  const big3Revenue = dataset.segments
    .filter((segment) => segment.periodId === period.id && ["Legal Professionals", "Corporates", "Tax, Audit & Accounting Professionals"].includes(segment.segment))
    .reduce((sum, segment) => sum + segment.revenue, 0);
  const aiMilestones = dataset.aiMilestones.length;
  return [
    metric("Current Price", dataset.marketData.currentPrice, "currency", `${dataset.marketData.priceDate} third-party market snapshot.`, "Actual"),
    metric("Revenue", period.revenue, "number", `${period.label} official revenue.`, "Actual"),
    metric("Organic Growth", period.organicRevenueGrowth, "percent", `${period.label} official organic revenue growth.`, "Actual"),
    metric("Adjusted EBITDA Margin", period.adjustedEbitdaMargin, "percent", "Adjusted EBITDA margin from official reporting.", "Actual"),
    metric("Free Cash Flow", period.freeCashFlow, "number", "Official free cash flow.", "Actual"),
    metric("Big 3 Revenue Mix", safeDivide(big3Revenue, period.revenue), "percent", "Legal, Corporates and Tax/Audit/Accounting revenue as a share of total.", "Derived"),
    metric("AI Milestones", aiMilestones, "number", "Curated management-commentary AI progress milestones.", "Derived"),
    metric("Dividend Yield", dataset.marketData.dividendYield, "percent", "Third-party market data dividend yield.", "Actual"),
  ];
}

function calculateTriSegmentEngine(data: TriDataset, periodId: string) {
  const rows = data.segments.filter((segment) => segment.periodId === periodId);
  return rows.map((segment) => {
    const recurring = segment.recurringRevenuePct ?? 0.5;
    const growth = segment.organicGrowth ?? 0;
    const aiScore = segment.aiExposure === "high" ? 25 : segment.aiExposure === "medium" ? 14 : 4;
    const qualityScore = Math.round(Math.min(95, Math.max(20, segment.adjustedEbitdaMargin * 80 + recurring * 25 + growth * 180 + aiScore)));
    const riskScore = Math.round(Math.min(90, Math.max(15, (segment.segment === "Global Print" ? 60 : 28) + (segment.aiExposure === "high" ? 10 : 0) - growth * 100)));
    return {
      ...segment,
      qualityScore,
      riskScore,
      contribution: segment.revenue > 0 ? `${(segment.revenue / getPeriod(data, periodId).revenue * 100).toFixed(1)}% of revenue` : "Corporate cost center",
    };
  });
}

function calculateTriAiProgressEngine(data: TriDataset, periodId: string) {
  const segments = calculateTriSegmentEngine(data, periodId);
  const highAiRevenue = segments.filter((segment) => segment.aiExposure === "high").reduce((sum, segment) => sum + segment.revenue, 0);
  const periodRevenue = getPeriod(data, periodId).revenue;
  const aiRevenueExposure = safeDivide(highAiRevenue, periodRevenue);
  const commercialMilestones = data.aiMilestones.filter((item) => item.status === "commercializing" || item.status === "scaling").length;
  const aiProgressScore = Math.round(Math.min(95, 35 + aiRevenueExposure * 35 + commercialMilestones * 7));
  return {
    aiRevenueExposure,
    commercialMilestones,
    aiProgressScore,
    milestoneRows: data.aiMilestones,
    thesis: "TRI's AI case is not generic model access; it is authoritative content, workflow integration and auditability embedded into professional legal, tax, audit and compliance tasks.",
    monitoring: [
      "CoCounsel paid adoption, seat expansion and renewal uplift.",
      "Organic growth in Legal Professionals, Corporates and Tax/Audit/Accounting versus the 2026 guide.",
      "Technology cost growth versus adjusted EBITDA margin expansion.",
      "Evidence that AI products expand ARPU rather than cannibalize existing Westlaw/Practical Law/Checkpoint workflows.",
    ],
  };
}

function calculateTriRiskEngine(data: TriDataset, assumptions: TriValuationAssumptions) {
  const cappedRiskDiscount = -Math.min(Math.abs(assumptions.riskDiscount), assumptions.riskDiscountCap);
  const items = [
    {
      risk: "AI adoption does not convert into paid workflow ARPU",
      affectedSegment: "Legal Professionals / Tax / Corporates",
      mechanism: "CoCounsel usage can be broad but monetization may be bundled, discounted or offset by seat compression.",
      leadingIndicator: "Big 3 organic growth slips below 7% for two quarters.",
      killCriterion: "AI commentary stays positive while recurring revenue growth decelerates materially.",
      valuationImpact: -0.12,
      probability: 0.3,
      severity: 0.75,
    },
    {
      risk: "General-purpose AI or legal AI specialists commoditize research workflows",
      affectedSegment: "Legal Professionals",
      mechanism: "Cheaper AI assistants pressure Westlaw/Practical Law pricing or reduce switching costs.",
      leadingIndicator: "Law firm tech budgets shift from legal research platforms to model-native tools.",
      killCriterion: "Legal organic growth falls below mid-single digits while AI competitors gain reference customers.",
      valuationImpact: -0.15,
      probability: 0.25,
      severity: 0.8,
    },
    {
      risk: "Technology and content costs consume AI gross profit",
      affectedSegment: "Total Thomson Reuters",
      mechanism: "Inference, product engineering, data rights and editorial verification costs offset AI price uplift.",
      leadingIndicator: "Adjusted EBITDA margin misses the +100bp guide despite revenue growth.",
      killCriterion: "Management lowers margin guide while keeping AI investment elevated.",
      valuationImpact: -0.1,
      probability: 0.28,
      severity: 0.65,
    },
    {
      risk: "Reuters News AI licensing is transactional rather than recurring",
      affectedSegment: "Reuters News",
      mechanism: "One-off GenAI licensing revenue can create difficult comps without a durable subscription stream.",
      leadingIndicator: "Reuters organic growth volatility and margin compression.",
      killCriterion: "Reuters declines while content costs rise and no recurring AI licensing framework appears.",
      valuationImpact: -0.05,
      probability: 0.35,
      severity: 0.45,
    },
  ];
  const redTeamScore = Math.round(items.reduce((sum, item) => sum + item.probability * item.severity * 100, 0) / items.length);
  return {
    items,
    cappedRiskDiscount,
    redTeamScore,
    verdict:
      redTeamScore > 55
        ? "AI execution risk is material enough to cap valuation upside."
        : "Risk is monitorable if Big 3 organic growth and margin expansion remain on track.",
  };
}

function calculateTriValuationEngine(data: TriDataset, scenario: Scenario, assumptions: TriValuationAssumptions) {
  const warnings: ValidationWarning[] = [];
  const weightSum = assumptions.weightDcf + assumptions.weightFcfYield + assumptions.weightEvEbitda + assumptions.weightPe + assumptions.weightSotp;
  const weights = {
    dcf: assumptions.weightDcf / weightSum,
    fcfYield: assumptions.weightFcfYield / weightSum,
    evEbitda: assumptions.weightEvEbitda / weightSum,
    pe: assumptions.weightPe / weightSum,
    sotp: assumptions.weightSotp / weightSum,
  };
  if (Math.abs(weightSum - 1) > 0.0001) {
    warnings.push({ id: "tri-weight-sum", title: "Valuation weights normalized", detail: `Input weights sum to ${(weightSum * 100).toFixed(1)}%.`, severity: "low" });
  }
  if (assumptions.terminalGrowth >= assumptions.wacc - 0.01) {
    warnings.push({ id: "tri-terminal-spread", title: "DCF terminal spread is narrow", detail: "Terminal growth is too close to WACC.", severity: "high" });
  }

  const baseYear = data.periods.find((period) => period.id === "fy25") ?? data.periods[0];
  let revenue = baseYear.revenue;
  const forecast = Array.from({ length: 5 }, (_, index) => {
    const year = 2026 + index;
    const growth = Math.max(assumptions.terminalGrowth + 0.015, assumptions.revenueCagr - index * 0.006);
    const priorRevenue = revenue;
    revenue *= 1 + growth;
    const margin = baseYear.adjustedEbitdaMargin + (assumptions.terminalAdjustedEbitdaMargin - baseYear.adjustedEbitdaMargin) * ((index + 1) / 5);
    const adjustedEbitda = revenue * margin;
    const depreciation = revenue * 0.115;
    const ebit = adjustedEbitda - depreciation;
    const nopat = ebit * (1 - assumptions.taxRate);
    const capex = revenue * assumptions.capexPctRevenue;
    const workingCapital = (revenue - priorRevenue) * assumptions.workingCapitalPctRevenueGrowth;
    const fcff = nopat + depreciation - capex - workingCapital;
    return { year, revenue, growth, adjustedEbitda, margin, depreciation, ebit, nopat, capex, workingCapital, fcff };
  });

  const terminalFcff = forecast[forecast.length - 1].fcff * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcff / (assumptions.wacc - assumptions.terminalGrowth);
  const pvFcff = forecast.reduce((sum, row, index) => sum + row.fcff / (1 + assumptions.wacc) ** (index + 1), 0);
  const pvTerminal = terminalValue / (1 + assumptions.wacc) ** forecast.length;
  const enterpriseValue = pvFcff + pvTerminal;
  const terminalValueShareOfEv = safeDivide(pvTerminal, enterpriseValue);
  if (terminalValueShareOfEv > 0.78) {
    warnings.push({ id: "tri-terminal-value-share", title: "DCF terminal value is high", detail: `Terminal value is ${(terminalValueShareOfEv * 100).toFixed(1)}% of EV.`, severity: "medium" });
  }
  const dcfFairValue = (enterpriseValue - assumptions.netDebt) / assumptions.dilutedShares;

  const guidedFcf = data.guidance.freeCashFlow;
  const fcfYieldFairValue = guidedFcf / assumptions.targetFcfYield / assumptions.dilutedShares;
  const forwardEbitda = baseYear.revenue * (1 + assumptions.revenueCagr) * assumptions.terminalAdjustedEbitdaMargin;
  const evEbitdaFairValue = (forwardEbitda * assumptions.targetEvEbitda - assumptions.netDebt) / assumptions.dilutedShares;
  const forwardAdjustedEps = (baseYear.adjustedEps ?? 3.92) * (1 + assumptions.revenueCagr * 1.15);
  const peFairValue = forwardAdjustedEps * assumptions.targetPe;

  const backendSegmentValues = (data as TriDataset & {
    __triBackendSegmentValues?: Array<{ label: string; ebitda: number; multiple: number; note: string }>;
  }).__triBackendSegmentValues;
  const segmentValues = backendSegmentValues ?? [
    { label: "Legal Professionals", ebitda: 1_420, multiple: 18, note: "High recurring legal workflow and CoCounsel exposure." },
    { label: "Corporates", ebitda: 810, multiple: 15, note: "Compliance, tax and legal workflow with Pagero and CLEAR exposure." },
    { label: "Tax, Audit & Accounting Professionals", ebitda: 620, multiple: 16, note: "Seasonal but high-margin tax/audit AI workflow." },
    { label: "Reuters News", ebitda: 170, multiple: 9, note: "Trusted content plus AI licensing optionality, but lower margin." },
    { label: "Global Print", ebitda: 180, multiple: 6, note: "Declining print cash-flow stream." },
    { label: "Corporate Costs", ebitda: -120, multiple: 10, note: "Central cost drag." },
  ];
  const sotpEnterpriseValue = segmentValues.reduce((sum, item) => sum + item.ebitda * item.multiple, 0);
  const cappedAiPremium = Math.min(Math.max(assumptions.aiPremium, 0), assumptions.aiPremiumCap);
  const cappedRiskDiscount = -Math.min(Math.abs(assumptions.riskDiscount), assumptions.riskDiscountCap);
  const sotpFairValue = ((sotpEnterpriseValue * (1 + cappedAiPremium + cappedRiskDiscount)) - assumptions.netDebt) / assumptions.dilutedShares;

  const methodBridge = [
    { method: "FCFF DCF", fairValue: dcfFairValue, weight: weights.dcf },
    { method: "FCF Yield", fairValue: fcfYieldFairValue, weight: weights.fcfYield },
    { method: "EV/EBITDA", fairValue: evEbitdaFairValue, weight: weights.evEbitda },
    { method: "P/E", fairValue: peFairValue, weight: weights.pe },
    { method: "SOTP", fairValue: sotpFairValue, weight: weights.sotp },
  ].map((row) => ({ ...row, contribution: row.fairValue * row.weight }));

  const blendedFairValue = methodBridge.reduce((sum, row) => sum + row.contribution, 0);
  const scenarioDriver = getScenario(data, scenario);
  return {
    weights,
    warnings,
    forecast,
    dcf: { fairValuePerShare: dcfFairValue, enterpriseValue, pvFcff, pvTerminal, terminalValueShareOfEv },
    fcfYieldFairValue,
    evEbitdaFairValue,
    peFairValue,
    sotpFairValue,
    segmentValues,
    cappedAiPremium,
    cappedRiskDiscount,
    methodBridge,
    blendedFairValue,
    valuationRangeLow: blendedFairValue * 0.82,
    valuationRangeHigh: blendedFairValue * 1.22,
    scenarioNarrative: scenarioDriver.narrative,
  };
}

export function calculateTriValuation(
  data: unknown,
  periodId = getDefaultTriPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<TriValuationAssumptions> = {},
): ValuationResult {
  const dataset = resolveTriDataset(data);
  const scenarioDefaults = triScenarioPresets[scenario] ?? defaultTriValuationAssumptions;
  const mergedAssumptions = { ...scenarioDefaults, ...assumptions };
  const valuation = calculateTriValuationEngine(dataset, scenario, mergedAssumptions);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const caseValuation = calculateTriValuationEngine(dataset, caseName, {
      ...triScenarioPresets[caseName],
      currentPrice: mergedAssumptions.currentPrice,
      dilutedShares: mergedAssumptions.dilutedShares,
      netDebt: mergedAssumptions.netDebt,
    });
    return {
      scenario: caseName,
      fairValue: caseValuation.blendedFairValue,
      upsideDownside: computeUpsideDownside(caseValuation.blendedFairValue, mergedAssumptions.currentPrice),
      expectedReturn3Y: computeExpectedShareholderCagr(caseValuation.blendedFairValue * 1.12, mergedAssumptions.currentPrice, mergedAssumptions.dividendPerShare * 3),
      targetPrice3Y: caseValuation.blendedFairValue * 1.12,
      cumulativeDividends: mergedAssumptions.dividendPerShare * 3,
      summary: getScenario(dataset, caseName).narrative,
    };
  });
  const selected = fairValues.find((point) => point.scenario === scenario) ?? fairValues[1];
  return {
    currentPrice: mergedAssumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: valuation.warnings,
    warning: valuation.warnings.find((warning) => warning.severity === "high")?.title,
    fairValues,
    methodCards: valuation.methodBridge.map((row) => ({
      key: row.method.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: row.method,
      value: row.fairValue,
      format: "currency",
      description: `Weight ${(row.weight * 100).toFixed(0)}%; contribution $${row.contribution.toFixed(1)} per share.`,
    })),
    expectedReturnBridge: [
      { key: "current-price", label: "Current Price", value: mergedAssumptions.currentPrice, format: "currency" },
      { key: "fair-value", label: "Selected Fair Value", value: selected.fairValue, format: "currency" },
      { key: "upside", label: "Upside / Downside", value: selected.upsideDownside, format: "percent" },
      { key: "three-year-target", label: "3Y Target Price", value: selected.targetPrice3Y ?? selected.fairValue, format: "currency" },
      { key: "dividends", label: "3Y Dividends", value: selected.cumulativeDividends ?? 0, format: "currency" },
    ],
    customSummary: `TRI ${scenario} fair value is $${selected.fairValue.toFixed(1)}. The dominant debate is whether CoCounsel and fiduciary-grade AI sustain high-single-digit organic growth without margin dilution.`,
    sensitivityTables: [
      {
        title: "AI premium / risk discount sensitivity",
        table: [
          ["AI premium", "Risk discount", "Fair value"],
          [valuation.cappedAiPremium, valuation.cappedRiskDiscount, valuation.blendedFairValue],
        ],
      },
    ],
    peFairValue: valuation.peFairValue,
    fcfFairValue: valuation.fcfYieldFairValue,
    dcfValue: valuation.dcf.fairValuePerShare,
    sotpFairValue: valuation.sotpFairValue,
    blendedFairValue: valuation.blendedFairValue,
    recommendedFairValue: valuation.blendedFairValue,
    recommendedFairValueMethod: "FCFF DCF / FCF yield / EV-EBITDA / P-E / SOTP with capped AI premium and risk discount",
    recommendedFairValueReason: "TRI is valued as a recurring professional workflow and authoritative-content platform, with AI progress capped until paid adoption and margin proof are clearer.",
    valuationRangeLow: valuation.valuationRangeLow,
    valuationRangeBase: valuation.blendedFairValue,
    valuationRangeHigh: valuation.valuationRangeHigh,
    probabilityWeightedFairValue: fairValues.reduce((sum, point) => sum + point.fairValue / 3, 0),
    targetPrice3Y: selected.targetPrice3Y,
    expectedReturn3Y: selected.expectedReturn3Y,
    upsideDownside: selected.upsideDownside,
    dataQualityScore: valuation.warnings.some((warning) => warning.severity === "high") ? 72 : valuation.warnings.length ? 84 : 92,
    recommendedValuationConfidence: valuation.warnings.some((warning) => warning.severity === "high") ? 65 : 82,
  };
}

export function buildTriDashboardData(data: unknown, periodId = getDefaultTriPeriod(), scenario: Scenario = "Base", assumptions: Partial<TriValuationAssumptions> = {}) {
  const dataset = resolveTriDataset(data);
  const resolvedPeriod = getPeriod(dataset, periodId);
  const mergedAssumptions = { ...(triScenarioPresets[scenario] ?? defaultTriValuationAssumptions), ...assumptions };
  const valuationEngine = calculateTriValuationEngine(dataset, scenario, mergedAssumptions);
  const valuation = calculateTriValuation(dataset, periodId, scenario, mergedAssumptions);
  const segment = calculateTriSegmentEngine(dataset, resolvedPeriod.id);
  const aiProgress = calculateTriAiProgressEngine(dataset, resolvedPeriod.id);
  const risk = calculateTriRiskEngine(dataset, mergedAssumptions);
  const dataStatus: DataStatus = {
    sourceType: dataset.__triRequestedDataSourceType === "manual" ? "manual" : "mock",
    lastUpdated: dataset.marketData.priceDate,
    missingFields: [
      "official live share price feed",
      "CoCounsel paid seat count and ARPU",
      "AI-specific revenue disclosure by segment",
      "exact FY2025 segment EBITDA table in local structured form",
      "current consensus estimates and peer multiples",
    ],
    validationWarnings: valuation.validationWarnings ?? [],
    valuationReliable: !(valuation.validationWarnings ?? []).some((warning) => warning.severity === "high"),
  };
  return {
    dataset,
    period: resolvedPeriod,
    summary: calculateTriSummary(dataset, resolvedPeriod.id),
    valuation,
    valuationEngine,
    segment,
    aiProgress,
    risk,
    dataStatus,
  };
}
