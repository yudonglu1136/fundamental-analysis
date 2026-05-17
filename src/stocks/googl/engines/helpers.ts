import { clamp, safeDivide } from "../../../utils/financialMath";
import type {
  GooglDataset,
  GooglFinancialPeriod,
  GooglRevenueLine,
  GooglSegmentFinancial,
  GooglSegmentName,
} from "../model";

export { clamp, safeDivide };

export function getGooglPeriod(data: GooglDataset, periodId: string): GooglFinancialPeriod {
  return data.financials.find((period) => period.id === periodId) ?? data.financials.find((period) => period.id === "q1-26") ?? data.financials[data.financials.length - 1];
}

export function getGooglRevenueLine(data: GooglDataset, periodId: string): GooglRevenueLine {
  return data.revenueLines.find((period) => period.periodId === periodId) ?? data.revenueLines.find((period) => period.periodId === "q1-26") ?? data.revenueLines[data.revenueLines.length - 1];
}

export function getGooglSegment(data: GooglDataset, periodId: string, segment: GooglSegmentName): GooglSegmentFinancial {
  const row = data.segments.find((item) => item.periodId === periodId && item.segment === segment);
  if (row) return row;
  const fallback = data.segments.find((item) => item.periodId === "q1-26" && item.segment === segment);
  if (fallback) return fallback;
  return { periodId, segment, sourceType: "official_actual", sourceId: "missing", revenue: 0, operatingIncome: 0 };
}

export function annualizeIfQuarterly(value: number, period: GooglFinancialPeriod) {
  return period.periodType === "quarterly" ? value * 4 : value;
}

export function perShare(value: number, shares: number) {
  return safeDivide(value, Math.max(shares, 1));
}

export function growthRate(current: number, prior: number) {
  return safeDivide(current, prior) - 1;
}

export function riskLabel(score: number): "Low" | "Medium" | "High" {
  if (score >= 0.55) return "High";
  if (score >= 0.3) return "Medium";
  return "Low";
}

export function normalizedWeightMap<T extends Record<string, number>>(weights: T): T {
  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  if (!sum) return weights;
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / sum])) as T;
}
