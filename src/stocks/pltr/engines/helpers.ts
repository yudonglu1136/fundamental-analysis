import type { PltrActualQuarter, PltrMetric } from "../model";

export function metricValue(period: PltrActualQuarter, key: string, fallback = 0) {
  return period.metrics[key]?.value ?? fallback;
}

export function nullableMetricValue(period: PltrActualQuarter, key: string) {
  return period.metrics[key]?.value ?? null;
}

export function latestPeriod(actuals: PltrActualQuarter[]) {
  return actuals[actuals.length - 1];
}

export function getMetric(period: PltrActualQuarter, key: string): PltrMetric | undefined {
  return period.metrics[key];
}

export function safeDivide(a: number | null | undefined, b: number | null | undefined) {
  if (!a || !b) return 0;
  return a / b;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function cagr(start: number, end: number, years: number) {
  if (start <= 0 || end <= 0 || years <= 0) return 0;
  return Math.pow(end / start, 1 / years) - 1;
}

export function scoreFromPercent(value: number, min: number, max: number) {
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}
