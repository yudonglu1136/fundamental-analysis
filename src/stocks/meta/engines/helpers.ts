import type { MetaDataset, MetaFinancialPeriod, MetaSegmentFinancial } from "../model";
import { metaLineage } from "../data/lineage";

export function safeRatio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getPeriodById(data: MetaDataset, periodId: string): MetaFinancialPeriod {
  return data.periods.find((period) => period.id === periodId) ?? data.periods[data.periods.length - 1];
}

export function getSegment(data: MetaDataset, periodId: string, segment: MetaSegmentFinancial["segment"]): MetaSegmentFinancial {
  const row = data.segments.find((item) => item.periodId === periodId && item.segment === segment);
  if (!row) {
    return {
      periodId,
      segment,
      sourceStatus: "official_actual",
      sourceId: "missing",
      lineage: {
        ...metaLineage.researchOnly,
        sourceType: "manual_seed",
        confidence: "low",
        valuationTreatment: "not_used_in_valuation",
        notes: "Fallback row created only to prevent UI crashes when segment data is missing.",
      },
      revenue: 0,
      operatingIncome: 0,
      operatingMargin: 0,
      notes: "Missing segment row fallback.",
    };
  }
  return row;
}

export function normalizeWeights(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (!total) return weights;
  return Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, weight / total]));
}

export function CAGR(beginning: number, ending: number, years: number) {
  if (beginning <= 0 || ending <= 0 || years <= 0) return 0;
  return (ending / beginning) ** (1 / years) - 1;
}
