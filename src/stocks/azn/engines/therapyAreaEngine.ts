import type { ValidationWarning } from "../../types";
import type { AznDataset } from "../types";
import { safeRatio } from "./helpers";

export function buildTherapyAreaDashboard(data: AznDataset, periodId: string) {
  const period = data.periods.find((item) => item.id === periodId) ?? data.periods[data.periods.length - 1];
  const therapyAreas = data.reportedData.therapyAreas.filter((row) => row.periodId === periodId);
  const revenueSum = therapyAreas.reduce((sum, row) => sum + row.revenue, 0);
  const backendSource = "backendSource" in period
    ? (period as typeof period & { backendSource?: { disclosedRevenue?: number } }).backendSource
    : undefined;
  const revenueAnchor = backendSource?.disclosedRevenue ?? period.totalRevenue;
  const warnings: ValidationWarning[] = [];

  if (Math.abs(revenueSum - revenueAnchor) > 25) {
    warnings.push({
      id: "azn-therapy-area-reconcile",
      title: "Therapy area revenue does not reconcile to total revenue",
      detail: `Therapy area revenue sums to $${revenueSum.toFixed(0)}m versus disclosed total revenue of $${revenueAnchor.toFixed(0)}m.`,
      severity: "high",
    });
  }

  return {
    period,
    therapyAreas: therapyAreas
      .map((row) => ({
        ...row,
        percentageOfTotal: safeRatio(row.revenue, revenueAnchor),
        revenuePerPointOfGrowth: row.yoyGrowthCer === 0 ? 0 : row.revenue * row.yoyGrowthCer,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    revenueSum,
    reconciliationDelta: revenueSum - revenueAnchor,
    warnings,
  };
}
