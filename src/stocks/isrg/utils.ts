import type { IsrgActualPeriod, IsrgDataLayer, IsrgMetric } from "./model";

export function metricValue(metric: IsrgMetric | null | undefined, fallback = 0) {
  return Number.isFinite(metric?.value ?? NaN) ? Number(metric?.value) : fallback;
}

export function metricMaybe(metric: IsrgMetric | null | undefined) {
  return Number.isFinite(metric?.value ?? NaN) ? Number(metric?.value) : null;
}

export function latestActual(data: IsrgDataLayer) {
  return data.actualData[data.actualData.length - 1];
}

export function latestFullYear(data: IsrgDataLayer) {
  return [...data.actualData].reverse().find((period) => period.periodType === "FY") ?? latestActual(data);
}

export function priorFullYear(data: IsrgDataLayer, period: IsrgActualPeriod) {
  return [...data.actualData]
    .reverse()
    .find((item) => item.periodType === "FY" && item.fiscalYear === period.fiscalYear - 1);
}

export function priorYearQuarter(data: IsrgDataLayer, period: IsrgActualPeriod) {
  if (period.fiscalQuarter == null) return priorFullYear(data, period);
  return data.actualData.find((item) => item.periodType === "Q" && item.fiscalQuarter === period.fiscalQuarter && item.fiscalYear === period.fiscalYear - 1);
}

export function yoy(current: number | null, prior: number | null) {
  if (current == null || prior == null || prior === 0) return null;
  return current / prior - 1;
}

export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined, fallback = 0) {
  if (!Number.isFinite(numerator ?? NaN) || !Number.isFinite(denominator ?? NaN) || !denominator) return fallback;
  return Number(numerator) / Number(denominator);
}

export function formatDriverPct(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "N/A";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
