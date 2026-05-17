import type { AznDataset, AznReportedPeriod, AznRiskLevel, AznValuationAssumptions } from "../types";

export function safeRatio(numerator: number, denominator: number, fallback = 0) {
  return denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator) ? fallback : numerator / denominator;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getPeriodById(data: AznDataset, periodId: string): AznReportedPeriod {
  return data.periods.find((period) => period.id === periodId) ?? data.periods[data.periods.length - 1];
}

export function riskScore(level: AznRiskLevel) {
  if (level === "High") return 1;
  if (level === "Medium") return 2;
  return 3;
}

export function annualizeQuarterly(value: number, multiplier = 4) {
  return value * multiplier;
}

export function normalizeBlendWeights(assumptions: AznValuationAssumptions) {
  const raw = {
    dcf: assumptions.weightDcf,
    sotp: assumptions.weightSotp,
    pipeline: assumptions.weightPipeline,
    multiples: assumptions.weightMultiples,
  };
  const total = raw.dcf + raw.sotp + raw.pipeline + raw.multiples;
  if (total <= 0) return { dcf: 0.35, sotp: 0.3, pipeline: 0.2, multiples: 0.15 };
  return {
    dcf: raw.dcf / total,
    sotp: raw.sotp / total,
    pipeline: raw.pipeline / total,
    multiples: raw.multiples / total,
  };
}

export function scoreFromPercent(value: number, low: number, high: number) {
  return clamp(Math.round(((value - low) / Math.max(high - low, 0.0001)) * 5), 0, 5);
}
