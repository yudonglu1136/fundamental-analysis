import type { Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { exampleData, type ExampleHistoricalValuationEvent } from "./data.example";

function finiteOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function placeholderWarnings(): ValidationWarning[] {
  return [
    {
      id: "template-placeholder-data",
      title: "Template placeholder data",
      detail: "Replace template rows with sourced actuals, assumptions, and historical valuation events before shipping a real ticker.",
      severity: "high",
    },
    {
      id: "template-history-required",
      title: "Historical valuation coverage required",
      detail: "A production module needs backend-persisted historical valuation runs or clearly labeled local fallback rows.",
      severity: "medium",
    },
  ];
}

export function calculateExampleSummary(data: typeof exampleData = exampleData): SummaryMetric[] {
  const latest = data.financialPeriods[data.financialPeriods.length - 1];
  return [
    {
      key: "revenue",
      label: "Latest Revenue",
      value: finiteOrZero(latest?.revenue),
      format: "currency",
      description: "Replace with latest sourced revenue.",
      badge: latest?.sourceStatus === "official_actual" ? "Actual" : "Placeholder",
    },
    {
      key: "fcf",
      label: "Free Cash Flow",
      value: finiteOrZero(latest?.freeCashFlow),
      format: "currency",
      description: "Replace with operating cash flow minus capex or company-defined FCF.",
      badge: latest?.sourceStatus === "official_actual" ? "Derived" : "Placeholder",
    },
  ];
}

export function calculateExampleValuation(
  data: typeof exampleData = exampleData,
  assumptions: Record<string, number> = {},
  scenario: Scenario = "Base",
): ValuationResult {
  const currentPrice = assumptions.currentPrice ?? data.marketData.currentPrice;
  const normalizedFcf = assumptions.normalizedFcf ?? 100;
  const targetFcfYield = Math.max(assumptions.targetFcfYield ?? 0.05, 0.01);
  const shares = Math.max(assumptions.dilutedShares ?? 100, 1);
  const baseFairValue = normalizedFcf / targetFcfYield / shares;
  const scenarioAdjustment = scenario === "Bear" ? 0.8 : scenario === "Bull" ? 1.2 : 1;
  const selectedFairValue = baseFairValue * scenarioAdjustment;

  return {
    currentPrice,
    priceDate: data.marketData.priceDate,
    warning: "Template valuation output. Replace assumptions and methods for the real company.",
    validationWarnings: placeholderWarnings(),
    fairValues: [
      { scenario: "Bear", fairValue: baseFairValue * 0.8, upsideDownside: currentPrice > 0 ? (baseFairValue * 0.8) / currentPrice - 1 : 0, expectedReturn3Y: 0.03 },
      { scenario: "Base", fairValue: baseFairValue, upsideDownside: currentPrice > 0 ? baseFairValue / currentPrice - 1 : 0, expectedReturn3Y: 0.08 },
      { scenario: "Bull", fairValue: baseFairValue * 1.2, upsideDownside: currentPrice > 0 ? (baseFairValue * 1.2) / currentPrice - 1 : 0, expectedReturn3Y: 0.13 },
    ],
    methodCards: [
      {
        key: "fcf-yield",
        label: "FCF Yield",
        value: baseFairValue,
        format: "currency",
        description: "Example full-company valuation method. Replace with ticker-specific methods and avoid price anchoring.",
        valuationBase: "Normalized FCF",
        sourceConfidence: "low",
      },
    ],
    expectedReturnBridge: [
      {
        key: "selected-fair-value",
        label: "Selected Fair Value",
        value: selectedFairValue,
        format: "currency",
        description: "Scenario-selected fair value from the example method.",
      },
    ],
    customSummary: "Replace this with a company-specific valuation explanation and model audit notes.",
    sensitivityTables: [
      {
        title: "Example FCF yield sensitivity",
        table: [
          ["FCF / Yield", "4%", "5%", "6%"],
          ["Low FCF", 80 / 0.04 / shares, 80 / 0.05 / shares, 80 / 0.06 / shares],
          ["Base FCF", 100 / 0.04 / shares, 100 / 0.05 / shares, 100 / 0.06 / shares],
          ["High FCF", 120 / 0.04 / shares, 120 / 0.05 / shares, 120 / 0.06 / shares],
        ],
      },
    ],
    recommendedFairValue: selectedFairValue,
    recommendedFairValueMethod: "Template FCF yield placeholder",
    recommendedFairValueReason: "Replace with a real method bridge and no-future-leakage audit.",
    targetPrice3Y: selectedFairValue * 1.15,
    expectedReturn3Y: currentPrice > 0 ? (selectedFairValue * 1.15 / currentPrice) ** (1 / 3) - 1 : 0,
    upsideDownside: currentPrice > 0 ? selectedFairValue / currentPrice - 1 : 0,
    dataQualityScore: 0,
    recommendedValuationConfidence: 0,
  };
}

export function buildExampleDashboardData(data: typeof exampleData = exampleData, scenario: Scenario = "Base") {
  const valuation = calculateExampleValuation(data, undefined, scenario);
  return {
    summary: calculateExampleSummary(data),
    valuation,
    historicalValuationRows: data.historicalValuations.map((row: ExampleHistoricalValuationEvent) => ({
      ...row,
      gapPct: row.asOfPrice && row.fairValue ? row.fairValue / row.asOfPrice - 1 : null,
    })),
    researchQuestions: data.researchQuestions,
    sourceGaps: data.sourceGaps,
  };
}
