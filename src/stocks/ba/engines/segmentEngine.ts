import type { ValidationWarning } from "../../types";
import type { BaDataset, BaSegmentEngineOutput } from "../model";
import { clamp, safeRatio } from "./helpers";

export function calculateBaSegmentEngine(data: BaDataset, periodId = "fy25"): BaSegmentEngineOutput {
  const period = data.periods.find((item) => item.id === periodId) ?? data.periods[data.periods.length - 1];
  const rows = data.segments
    .filter((row) => row.periodId === period.id)
    .map((row) => {
      const salesGrowth = row.salesPriorYear ? safeRatio(row.sales, row.salesPriorYear) - 1 : null;
      const ebitGrowth = row.underlyingEbitPriorYear && row.underlyingEbit
        ? safeRatio(row.underlyingEbit, row.underlyingEbitPriorYear) - 1
        : null;
      const bookToBill = row.orderIntake != null ? safeRatio(row.orderIntake, row.sales) : null;
      const backlogCoverageYears = row.orderBacklog != null ? safeRatio(row.orderBacklog, row.sales) : null;
      const marginScore = clamp(safeRatio(row.underlyingEbitMargin ?? 0, 0.15) * 35, 0, 35);
      const growthScore = clamp(((salesGrowth ?? 0) + 0.02) * 180, 0, 25);
      const backlogScore = clamp((backlogCoverageYears ?? 0) * 10, 0, 25);
      const cashScore = clamp(safeRatio(row.operatingBusinessCashFlow ?? 0, row.underlyingEbit ?? 1) * 15, 0, 15);
      return {
        ...row,
        salesMix: safeRatio(row.sales, period.sales),
        ebitMix: safeRatio(row.underlyingEbit ?? 0, period.underlyingEbit),
        salesGrowth,
        ebitGrowth,
        qualityScore: Math.round(marginScore + growthScore + backlogScore + cashScore),
        backlogCoverageYears,
        bookToBill,
      };
    });

  const operatingRows = rows.filter((row) => row.segment !== "Intra-group");
  const totals = {
    sales: rows.reduce((sum, row) => sum + row.sales, 0),
    underlyingEbit: operatingRows.reduce((sum, row) => sum + (row.underlyingEbit ?? 0), 0),
    orderIntake: rows.reduce((sum, row) => sum + (row.orderIntake ?? 0), 0),
    orderBacklog: rows.reduce((sum, row) => sum + (row.orderBacklog ?? 0), 0),
  };

  const reconciliationWarnings: ValidationWarning[] = [];
  if (Math.abs(totals.sales - period.sales) > 2) {
    reconciliationWarnings.push({
      id: "ba-segment-sales-reconciliation",
      title: "Segment sales do not reconcile to group sales",
      detail: `Segment sales sum to GBP${totals.sales.toFixed(0)}m versus group sales of GBP${period.sales.toFixed(0)}m.`,
      severity: "high",
    });
  }
  if (Math.abs(totals.underlyingEbit - period.underlyingEbit) > 2) {
    reconciliationWarnings.push({
      id: "ba-segment-ebit-reconciliation",
      title: "Segment EBIT does not reconcile to group underlying EBIT",
      detail: `Segment underlying EBIT sums to GBP${totals.underlyingEbit.toFixed(0)}m versus group underlying EBIT of GBP${period.underlyingEbit.toFixed(0)}m.`,
      severity: "high",
    });
  }
  if (Math.abs(totals.orderIntake - period.orderIntake) > 50) {
    reconciliationWarnings.push({
      id: "ba-segment-order-intake-reconciliation",
      title: "Segment order intake does not reconcile to group order intake",
      detail: `Segment order intake sums to GBP${totals.orderIntake.toFixed(0)}m versus group order intake of GBP${period.orderIntake.toFixed(0)}m.`,
      severity: "medium",
    });
  }
  if (Math.abs(totals.orderBacklog - period.orderBacklog) > 50) {
    reconciliationWarnings.push({
      id: "ba-segment-backlog-reconciliation",
      title: "Segment backlog does not reconcile to group backlog",
      detail: `Segment backlog sums to GBP${totals.orderBacklog.toFixed(0)}m versus group backlog of GBP${period.orderBacklog.toFixed(0)}m.`,
      severity: "medium",
    });
  }

  return { rows, totals, reconciliationWarnings };
}
