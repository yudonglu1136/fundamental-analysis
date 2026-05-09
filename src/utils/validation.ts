import type { ValidationWarning } from "../stocks/types";

export function checkMissingFields(fields: Array<{ key: string; value: unknown }>) {
  return fields.filter((field) => field.value === null || field.value === undefined || field.value === "").map((field) => field.key);
}

export function checkExtremeGrowthRates(items: Array<{ label: string; value: number }>, threshold = 0.5): ValidationWarning[] {
  return items
    .filter((item) => Math.abs(item.value) > threshold)
    .map((item) => ({
      id: `extreme-${item.label}`,
      title: `${item.label} exceeds threshold`,
      detail: `${item.label} is above the configured sanity threshold and should be reviewed.`,
      severity: "medium" as const,
    }));
}

export function checkSegmentSumConsistency(total: number, segments: number[], label: string): ValidationWarning[] {
  const sum = segments.reduce((acc, value) => acc + value, 0);
  if (!sum || Math.abs(sum - total) / Math.abs(sum) <= 0.01) return [];
  return [
    {
      id: `segment-sum-${label}`,
      title: `${label} does not reconcile cleanly`,
      detail: `Segment totals differ materially from consolidated ${label}.`,
      severity: "medium",
    },
  ];
}

export function checkEPSConsistency(currentQuarterlyEps: number, annualEps: number): ValidationWarning[] {
  if (!currentQuarterlyEps || !annualEps) return [];
  return annualEps / (currentQuarterlyEps * 4) > 1.35
    ? [
        {
          id: "eps-consistency",
          title: "Annual EPS looks inconsistent with quarterly run-rate",
          detail: "Forward or annual EPS appears too high relative to the current quarterly run-rate.",
          severity: "high",
        },
      ]
    : [];
}

export function checkValuationReliability(flagged: boolean): ValidationWarning[] {
  return flagged
    ? [
        {
          id: "valuation-reliability",
          title: "Valuation reliability is weak",
          detail: "At least one abnormal EPS or placeholder-data flag is affecting valuation confidence.",
          severity: "high",
        },
      ]
    : [];
}

export function checkImpossibleCagrCombination(upsideDownside: number, expectedShareholderCagr: number): ValidationWarning[] {
  if (upsideDownside < 0 && expectedShareholderCagr > 0.05) {
    return [
      {
        id: "impossible-cagr-combination",
        title: "Scenario return output is internally inconsistent",
        detail: "Negative upside/downside with strongly positive shareholder CAGR usually points to a fair value versus target-price mismatch.",
        severity: "high",
      },
    ];
  }
  return [];
}

export function checkPeSanity(peFairValue: number, lowerBound: number, upperBound: number, label: string): ValidationWarning[] {
  if (peFairValue >= lowerBound && peFairValue <= upperBound) return [];
  return [
    {
      id: `${label.toLowerCase().replace(/\s+/g, "-")}-pe-sanity`,
      title: `${label} P/E cross-check looks implausible`,
      detail: `P/E-derived fair value of ${peFairValue.toFixed(1)} falls outside the expected sanity range of ${lowerBound.toFixed(1)} to ${upperBound.toFixed(1)}.`,
      severity: "medium",
    },
  ];
}
