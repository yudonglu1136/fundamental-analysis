import type { MckDataset, MckReportedFinancial, MckSegmentFinancial } from "../types";

export function safeDivide(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function latestFinancial(data: MckDataset): MckReportedFinancial {
  return data.reportedFinancials[data.reportedFinancials.length - 1];
}

export function priorFinancial(data: MckDataset): MckReportedFinancial {
  return data.reportedFinancials[Math.max(data.reportedFinancials.length - 2, 0)];
}

export function segmentsForPeriod(data: MckDataset, periodId = latestFinancial(data).periodId): MckSegmentFinancial[] {
  return data.segmentFinancials.filter((segment) => segment.periodId === periodId);
}

export function sumSegments(segments: MckSegmentFinancial[], field: "revenue" | "adjustedOperatingProfit" | "operatingProfit") {
  return segments.reduce((sum, segment) => sum + segment[field], 0);
}

export function cagr(beginning: number, ending: number, years: number) {
  if (beginning <= 0 || ending <= 0 || years <= 0) return 0;
  return (ending / beginning) ** (1 / years) - 1;
}

export function presentValue(value: number, rate: number, year: number) {
  return value / (1 + rate) ** year;
}

export function dataBadge(sourceType: string) {
  if (sourceType === "actual" || sourceType === "market") return "Actual" as const;
  if (sourceType === "guidance" || sourceType === "assumption") return "Assumption" as const;
  if (sourceType === "derived" || sourceType === "research") return "Derived" as const;
  if (sourceType === "placeholder") return "Placeholder" as const;
  return "Needs Review" as const;
}
