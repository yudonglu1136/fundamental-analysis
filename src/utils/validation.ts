import type { DataQualityBadgeType, ValidationWarning } from "../stocks/types";

const severityWeight: Record<ValidationWarning["severity"], number> = {
  high: 30,
  medium: 15,
  low: 5,
};

export function buildValidationWarning(
  id: string,
  title: string,
  detail: string,
  severity: ValidationWarning["severity"] = "low",
): ValidationWarning {
  return { id, title, detail, severity };
}

export function mergeValidationWarnings(...groups: Array<ValidationWarning[] | null | undefined>) {
  const byId = new Map<string, ValidationWarning>();
  for (const warning of groups.flatMap((group) => group ?? [])) {
    const existing = byId.get(warning.id);
    if (!existing || severityWeight[warning.severity] > severityWeight[existing.severity]) {
      byId.set(warning.id, warning);
    }
  }
  return [...byId.values()];
}

export function mapSourceStatusToDataQualityTag(sourceStatus: string | null | undefined): DataQualityBadgeType {
  if (sourceStatus === "official_actual" || sourceStatus === "official_seed" || sourceStatus === "market_data") return "Actual";
  if (sourceStatus === "management_guidance" || sourceStatus === "forecast_assumption") return "Assumption";
  if (sourceStatus === "transcript_commentary") return "Derived";
  if (sourceStatus === "market_data_proxy" || sourceStatus === "research_only") return "Placeholder";
  return "Needs Review";
}

export function buildSourceGapWarnings(
  ticker: string,
  fields: Array<{ key: string; label: string; value: unknown; severity?: ValidationWarning["severity"] }>,
) {
  return fields
    .filter((field) => field.value === null || field.value === undefined || field.value === "" || Number.isNaN(field.value))
    .map((field) =>
      buildValidationWarning(
        `${ticker.toLowerCase()}-missing-${field.key}`,
        `${field.label} is missing`,
        `${ticker} is missing ${field.label}; valuation falls back to available assumptions or proxy fields where defined.`,
        field.severity ?? "medium",
      ),
    );
}

export function buildPriceAnchorWarnings({
  ticker,
  currentPrice,
  marketReference,
  priceDate,
  todayIso = new Date().toISOString().slice(0, 10),
  currency = "USD",
  staleDays = 7,
}: {
  ticker: string;
  currentPrice: number;
  marketReference?: number | null;
  priceDate?: string | null;
  todayIso?: string;
  currency?: string;
  staleDays?: number;
}) {
  const warnings: ValidationWarning[] = [];
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    warnings.push(buildValidationWarning(`${ticker.toLowerCase()}-invalid-price`, "Current price anchor is invalid", `${ticker} current price is missing or non-positive.`, "high"));
  }
  if (priceDate) {
    const elapsedDays = Math.round((new Date(todayIso).getTime() - new Date(priceDate).getTime()) / (1000 * 60 * 60 * 24));
    if (Number.isFinite(elapsedDays) && elapsedDays > staleDays) {
      warnings.push(
        buildValidationWarning(
          `${ticker.toLowerCase()}-stale-price`,
          "Current price anchor is stale",
          `${ticker} price anchor is older than ${staleDays} days (${priceDate}) and may distort upside/downside.`,
          "medium",
        ),
      );
    }
  } else {
    warnings.push(buildValidationWarning(`${ticker.toLowerCase()}-missing-price-date`, "Price date is missing", `${ticker} price anchor has no as-of date.`, "medium"));
  }
  if (marketReference && marketReference > 0 && Number.isFinite(currentPrice)) {
    const deviation = Math.abs(currentPrice / marketReference - 1);
    if (deviation > 0.1) {
      warnings.push(
        buildValidationWarning(
          `${ticker.toLowerCase()}-price-deviation`,
          "Current price deviates from market reference",
          `${ticker} current price differs materially from the stored market reference of ${marketReference.toFixed(2)} ${currency}.`,
          "medium",
        ),
      );
    }
  }
  return warnings;
}

export function deriveValuationReliability({
  warnings,
  sourceStatuses = [],
}: {
  warnings: ValidationWarning[];
  sourceStatuses?: Array<string | null | undefined>;
}) {
  const warningPenalty = warnings.reduce((score, warning) => score + severityWeight[warning.severity], 0);
  const sourcePenalty = sourceStatuses.reduce((score, sourceStatus) => {
    const tag = mapSourceStatusToDataQualityTag(sourceStatus);
    if (tag === "Placeholder") return score + 12;
    if (tag === "Needs Review") return score + 20;
    if (tag === "Assumption") return score + 6;
    return score;
  }, 0);
  const score = Math.max(0, Math.min(100, 100 - warningPenalty - sourcePenalty));
  return {
    score,
    reliable: score >= 70 && !warnings.some((warning) => warning.severity === "high"),
    confidence: score >= 85 ? "high" : score >= 70 ? "medium" : "low",
  };
}

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
