import type { Scenario, SummaryMetric, ValidationWarning, ValuationResult } from "../types";
import type {
  BiopharmaDashboardData,
  BiopharmaPipelineValuation,
  BiopharmaResearchDataset,
  BiopharmaValuationOutput,
  BiopharmaValuationScenario,
} from "./types";

const currentYear = 2026;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculatePipelineRnpv(dataset: BiopharmaResearchDataset): BiopharmaPipelineValuation[] {
  return dataset.pipeline.map((asset) => {
    const yearsToLaunch = Math.max(0, asset.estimatedLaunchYear - currentYear);
    const steadyStateEconomics = asset.estimatedPeakSales * asset.economicsShare * 0.32;
    const unadjustedValue = steadyStateEconomics * 4.5;
    const probabilityAdjustedValue = unadjustedValue * asset.probabilityOfSuccess;
    const discountedValue = probabilityAdjustedValue / (1 + asset.discountRate) ** yearsToLaunch;
    const rnpv = discountedValue - asset.developmentCostRemaining;
    return {
      ...asset,
      yearsToLaunch,
      unadjustedValue,
      probabilityAdjustedValue,
      discountedValue,
      rnpv,
      valuePerShare: rnpv / dataset.sharesOutstanding,
    };
  });
}

function calculateScenarioValue(
  dataset: BiopharmaResearchDataset,
  scenarioInput: BiopharmaValuationScenario,
  pipelineValuations: BiopharmaPipelineValuation[],
): BiopharmaValuationOutput {
  const coreValue = scenarioInput.coreValue ?? ((scenarioInput.coreMetricValue ?? 0) * (scenarioInput.coreMultiple ?? 0) * dataset.sharesOutstanding);
  const pipelineValue = pipelineValuations.reduce((sum, asset) => sum + Math.max(0, asset.rnpv), 0) * scenarioInput.pipelineHaircut;
  const fairValue =
    (coreValue + pipelineValue + scenarioInput.platformOptionValue + scenarioInput.cashOrDebtAdjustment) / dataset.sharesOutstanding;
  const upsideDownside = fairValue / dataset.currentPrice - 1;
  const expectedDividends = scenarioInput.expectedDividends ?? 0;
  return {
    scenario: scenarioInput.scenario,
    coreValue,
    coreValuePerShare: coreValue / dataset.sharesOutstanding,
    pipelineValue,
    pipelineValuePerShare: pipelineValue / dataset.sharesOutstanding,
    platformOptionValue: scenarioInput.platformOptionValue,
    platformOptionPerShare: scenarioInput.platformOptionValue / dataset.sharesOutstanding,
    cashOrDebtAdjustment: scenarioInput.cashOrDebtAdjustment,
    cashOrDebtPerShare: scenarioInput.cashOrDebtAdjustment / dataset.sharesOutstanding,
    fairValue,
    upsideDownside,
    expectedReturn3Y: ((fairValue + expectedDividends) / dataset.currentPrice) ** (1 / 3) - 1,
    expectedDividends,
    summary: scenarioInput.summary,
  };
}

export function buildBiopharmaDashboardData(
  dataset: BiopharmaResearchDataset,
  scenario: Scenario = "Base",
): BiopharmaDashboardData {
  const latestFinancial = dataset.financials[dataset.financials.length - 1];
  const pipelineValuations = calculatePipelineRnpv(dataset);
  const valuationOutputs = dataset.valuationScenarios.map((item) => calculateScenarioValue(dataset, item, pipelineValuations));
  const selectedValuation = valuationOutputs.find((item) => item.scenario === scenario) ?? valuationOutputs.find((item) => item.scenario === "Base") ?? valuationOutputs[0];
  const pipelineEvidence = dataset.pipeline.reduce((sum, asset) => sum + asset.evidenceScore, 0) / Math.max(dataset.pipeline.length, 1);
  const riskPenalty = dataset.risks.reduce((sum, risk) => sum + risk.probability * risk.severity, 0) / Math.max(dataset.risks.length, 1);
  const evidenceWarnings: ValidationWarning[] = [];
  if (dataset.earnings.quarters.length !== 8) {
    evidenceWarnings.push({
      id: `${dataset.ticker.toLowerCase()}-earnings-eight-quarter`,
      title: "Earnings-call coverage incomplete",
      detail: `${dataset.ticker} has ${dataset.earnings.quarters.length} earnings-call quarters.`,
      severity: "high",
    });
  }
  const unsupportedPipeline = dataset.pipeline.filter((asset) => asset.assumptionType !== "research_only");
  if (unsupportedPipeline.length > 0) {
    evidenceWarnings.push({
      id: `${dataset.ticker.toLowerCase()}-pipeline-assumption-label`,
      title: "Pipeline assumptions need labels",
      detail: `${unsupportedPipeline.map((asset) => asset.assetName).join(", ")} should have research-only valuation assumptions.`,
      severity: "medium",
    });
  }
  return {
    dataset,
    latestFinancial,
    pipelineValuations,
    valuationOutputs,
    selectedValuation,
    researchScores: {
      fundamentals: clamp(((latestFinancial.primaryGrowthMetric / Math.max(latestFinancial.revenue, 1)) * 100) + 35, 0, 100),
      pipeline: clamp(pipelineEvidence, 0, 100),
      strategy: clamp(70 + dataset.strategyPriorities.length * 3 - riskPenalty * 2, 0, 100),
      riskAdjusted: clamp(85 - riskPenalty * 4, 0, 100),
    },
    topDrivers: [
      { label: "Primary growth engine", detail: `${latestFinancial.primaryGrowthMetricLabel}: $${(latestFinancial.primaryGrowthMetric / 1_000).toFixed(1)}bn in ${latestFinancial.period}.`, signal: "Positive", badge: "Actual" },
      { label: "Pipeline value", detail: `$${(pipelineValuations.reduce((sum, item) => sum + Math.max(0, item.rnpv), 0) / 1_000).toFixed(1)}bn research-only gross rNPV before scenario haircut.`, signal: "Inflecting", badge: "Assumption" },
      { label: "Analyst debate", detail: dataset.analystDebates[0]?.debate ?? "No debate captured.", signal: "Needs Review", badge: "Derived" },
      { label: "Risk red team", detail: dataset.risks[0]?.risk ?? "No risk captured.", signal: "Needs Review", badge: "Derived" },
    ],
    validationWarnings: evidenceWarnings,
  };
}

export function calculateBiopharmaSummary(dataset: BiopharmaResearchDataset, scenario: Scenario = "Base"): SummaryMetric[] {
  const dashboard = buildBiopharmaDashboardData(dataset, scenario);
  return [
    { key: "current-price", label: "Current Price", value: dataset.currentPrice, format: "currency", description: `Market-data snapshot as of ${dataset.priceDate}.`, badge: "Actual" },
    { key: "fair-value", label: "Base Fair Value", value: dashboard.valuationOutputs.find((item) => item.scenario === "Base")?.fairValue ?? dashboard.selectedValuation.fairValue, format: "currency", description: "Research model fair value per share.", badge: "Derived" },
    { key: "upside", label: "Scenario Upside", value: dashboard.selectedValuation.upsideDownside, format: "percent", description: `${scenario} fair value versus current price.`, badge: "Derived" },
    { key: "latest-revenue", label: "Latest Revenue", value: dashboard.latestFinancial.revenue, format: "currency", description: `Reported revenue for ${dashboard.latestFinancial.period}.`, badge: "Actual" },
    { key: "pipeline-rnpv", label: "Pipeline rNPV / Share", value: dashboard.pipelineValuations.reduce((sum, asset) => sum + Math.max(0, asset.valuePerShare), 0), format: "currency", description: "Research-only asset-level pipeline rNPV before scenario haircut.", badge: "Assumption" },
    { key: "risk-score", label: "Risk-Adjusted Score", value: dashboard.researchScores.riskAdjusted, format: "number", description: "Composite red-team score; higher is cleaner.", badge: "Derived" },
  ];
}

export function calculateBiopharmaValuation(dataset: BiopharmaResearchDataset, scenario: Scenario = "Base"): ValuationResult {
  const dashboard = buildBiopharmaDashboardData(dataset, scenario);
  const base = dashboard.valuationOutputs.find((item) => item.scenario === "Base") ?? dashboard.selectedValuation;
  const bear = dashboard.valuationOutputs.find((item) => item.scenario === "Bear") ?? dashboard.selectedValuation;
  const bull = dashboard.valuationOutputs.find((item) => item.scenario === "Bull") ?? dashboard.selectedValuation;
  return {
    currentPrice: dataset.currentPrice,
    priceDate: dataset.priceDate,
    validationWarnings: dashboard.validationWarnings,
    fairValues: dashboard.valuationOutputs.map((item) => ({
      scenario: item.scenario,
      fairValue: item.fairValue,
      upsideDownside: item.upsideDownside,
      expectedReturn3Y: item.expectedReturn3Y,
      cumulativeDividends: item.expectedDividends,
      summary: item.summary,
    })),
    methodCards: [
      { key: "core", label: "Core Business", value: base.coreValuePerShare, format: "currency", description: "Core commercial cash-flow or launch NAV per share." },
      { key: "pipeline", label: "Pipeline rNPV", value: base.pipelineValuePerShare, format: "currency", description: "Probability-adjusted research-only pipeline value per share." },
      { key: "platform", label: "Platform / Strategic Option", value: base.platformOptionPerShare, format: "currency", description: "Speculative platform or strategic option value." },
      { key: "cash-debt", label: "Cash / Debt / Burn", value: base.cashOrDebtPerShare, format: "currency", description: "Balance sheet, net debt, or expected burn adjustment." },
    ],
    expectedReturnBridge: [
      { key: "fair-value", label: "Base Fair Value", value: base.fairValue, format: "currency" },
      { key: "current-price", label: "Current Price", value: dataset.currentPrice, format: "currency" },
      { key: "upside", label: "Base Upside / Downside", value: base.upsideDownside, format: "percent" },
    ],
    customSummary: `${dataset.ticker} uses a ${dataset.modelArchetype.replace(/_/g, " ")} valuation stack with explicit pipeline rNPV and scenario haircuts.`,
    sensitivityTables: [
      {
        title: "Scenario NAV Bridge",
        table: [
          ["Scenario", "Core / share", "Pipeline / share", "Option / share", "Cash-debt / share", "Fair value"],
          [bear.scenario, Number(bear.coreValuePerShare.toFixed(2)), Number(bear.pipelineValuePerShare.toFixed(2)), Number(bear.platformOptionPerShare.toFixed(2)), Number(bear.cashOrDebtPerShare.toFixed(2)), Number(bear.fairValue.toFixed(2))],
          [base.scenario, Number(base.coreValuePerShare.toFixed(2)), Number(base.pipelineValuePerShare.toFixed(2)), Number(base.platformOptionPerShare.toFixed(2)), Number(base.cashOrDebtPerShare.toFixed(2)), Number(base.fairValue.toFixed(2))],
          [bull.scenario, Number(bull.coreValuePerShare.toFixed(2)), Number(bull.pipelineValuePerShare.toFixed(2)), Number(bull.platformOptionPerShare.toFixed(2)), Number(bull.cashOrDebtPerShare.toFixed(2)), Number(bull.fairValue.toFixed(2))],
        ],
      },
    ],
    recommendedFairValue: base.fairValue,
    recommendedFairValueMethod: dataset.modelArchetype,
    recommendedFairValueReason: dataset.variantView,
    valuationRangeLow: bear.fairValue,
    valuationRangeBase: base.fairValue,
    valuationRangeHigh: bull.fairValue,
    upsideDownside: base.upsideDownside,
    probabilityWeightedFairValue: (bear.fairValue * 0.25) + (base.fairValue * 0.5) + (bull.fairValue * 0.25),
    dataQualityScore: Math.min(100, dataset.evidence.filter((item) => item.usedInModel).length * 7),
    integrityScore: dashboard.validationWarnings.length === 0 ? 88 : 72,
  };
}
