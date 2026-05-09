import type { Scenario, SummaryMetric, ValuationResult } from "../types";

export function calculateExampleSummary(_data?: unknown): SummaryMetric[] {
  return [
    {
      key: "example",
      label: "Example Metric",
      value: 0.1,
      format: "percent",
      description: "Replace with stock-specific summary logic.",
      badge: "Actual",
    },
  ];
}

export function calculateExampleValuation(_data: unknown, _assumptions: unknown, _scenario?: Scenario): ValuationResult {
  return {
    currentPrice: 100,
    methodCards: [
      {
        key: "example-fv",
        label: "Example Fair Value",
        value: 105,
        format: "currency",
        description: "Replace this with the stock-specific primary valuation output.",
      },
    ],
    expectedReturnBridge: [
      {
        key: "example-growth",
        label: "Growth Contribution",
        value: 0.06,
        format: "percent",
        description: "Replace with the stock-specific return bridge.",
      },
    ],
    fairValues: [
      { scenario: "Bear", fairValue: 90, upsideDownside: -0.1, expectedReturn3Y: 0.03 },
      { scenario: "Base", fairValue: 105, upsideDownside: 0.05, expectedReturn3Y: 0.08 },
      { scenario: "Bull", fairValue: 120, upsideDownside: 0.2, expectedReturn3Y: 0.13 },
    ],
    sensitivityTables: [],
  };
}
