export function safeRatio(numerator: number | undefined, denominator: number | undefined, fallback = 0) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !denominator) return fallback;
  return (numerator as number) / denominator;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function sum(values: Array<number | undefined>) {
  return values.reduce<number>((total, value) => total + (Number.isFinite(value) ? (value as number) : 0), 0);
}
