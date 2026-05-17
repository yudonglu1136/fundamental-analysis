import type { ValidationWarning } from "../../types";
import type { MsftDataset, MsftSegmentEngineRow, MsftReportingSegment } from "../model";
import { safeRatio, sum } from "./helpers";

const expectedSegments: MsftReportingSegment[] = [
  "Productivity and Business Processes",
  "Intelligent Cloud",
  "More Personal Computing",
];

export function calculateMsftSegmentEngine(data: MsftDataset, periodId: string) {
  const period = data.periods.find((item) => item.id === periodId) ?? data.periods.find((item) => item.id === "q3-fy26") ?? data.periods[0];
  const segments = data.segments.filter((segment) => segment.periodId === period.id);
  const totalRevenue = sum(segments.map((segment) => segment.revenue));
  const totalOperatingIncome = sum(segments.map((segment) => segment.operatingIncome));
  const rows: MsftSegmentEngineRow[] = segments.map((segment) => {
    const calculatedOperatingMargin = segment.operatingMargin ?? safeRatio(segment.operatingIncome, segment.revenue);
    const grossMargin = segment.grossMargin ?? safeRatio(segment.revenue - (segment.costOfRevenue ?? 0), segment.revenue);
    const qualityScore = Math.round(
      calculatedOperatingMargin * 55 +
        grossMargin * 20 +
        (segment.growth ?? 0) * 55 +
        (segment.segment === "Intelligent Cloud" ? 14 : 0) +
        (segment.segment === "Productivity and Business Processes" ? 12 : 0),
    );
    return {
      ...segment,
      revenueShare: safeRatio(segment.revenue, totalRevenue),
      operatingIncomeShare: safeRatio(segment.operatingIncome, totalOperatingIncome),
      calculatedOperatingMargin,
      qualityScore: Math.max(0, Math.min(100, qualityScore)),
    };
  });

  const warnings: ValidationWarning[] = [];
  const missingSegments = expectedSegments.filter((segment) => !segments.some((row) => row.segment === segment));
  if (missingSegments.length) {
    warnings.push({
      id: "msft-segment-missing",
      title: "Segment set is incomplete",
      detail: `Missing segment rows: ${missingSegments.join(", ")}.`,
      severity: "high",
    });
  }
  if (Math.abs(totalRevenue - period.revenue) > 2) {
    warnings.push({
      id: "msft-segment-revenue-reconcile",
      title: "Segment revenue does not reconcile",
      detail: `Segment revenue totals $${totalRevenue.toFixed(0)}m vs period revenue $${period.revenue.toFixed(0)}m.`,
      severity: "high",
    });
  }
  if (Math.abs(totalOperatingIncome - period.operatingIncome) > 2) {
    warnings.push({
      id: "msft-segment-op-income-reconcile",
      title: "Segment operating income does not reconcile",
      detail: `Segment operating income totals $${totalOperatingIncome.toFixed(0)}m vs period operating income $${period.operatingIncome.toFixed(0)}m.`,
      severity: "high",
    });
  }

  return {
    period,
    rows,
    totals: {
      revenue: totalRevenue,
      operatingIncome: totalOperatingIncome,
      operatingMargin: safeRatio(totalOperatingIncome, totalRevenue),
    },
    warnings,
  };
}
