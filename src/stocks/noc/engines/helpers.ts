export function safeRatio(numerator: number | null | undefined, denominator: number | null | undefined, fallback = 0) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !denominator) return fallback;
  return (numerator as number) / (denominator as number);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function scoreToRiskLabel(score: number): "Low" | "Medium" | "High" {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}
