import type { NocDataset, NocSegmentEngineOutput } from "../model";
import { clamp, safeRatio } from "./helpers";

export function calculateNocSegmentEngine(data: NocDataset, periodId = "q1-26"): NocSegmentEngineOutput {
  const rowsForPeriod = data.segments.filter((row) => row.periodId === periodId);
  const operatingRows = rowsForPeriod.filter((row) => row.segment !== "Intersegment eliminations");
  const totalSales = rowsForPeriod.reduce((sum, row) => sum + row.sales, 0);
  const totalOperatingIncome = rowsForPeriod.reduce((sum, row) => sum + (row.operatingIncome ?? 0), 0);
  const totalBacklog = operatingRows.reduce((sum, row) => sum + (row.totalBacklog ?? 0), 0);

  const rows = rowsForPeriod.map((row) => {
    const salesGrowth = row.salesPriorYear ? safeRatio(row.sales, row.salesPriorYear) - 1 : null;
    const operatingIncomeGrowth = row.operatingIncomePriorYear && row.operatingIncome != null
      ? safeRatio(row.operatingIncome, row.operatingIncomePriorYear) - 1
      : null;
    const margin = row.operatingMargin ?? safeRatio(row.operatingIncome ?? 0, row.sales);
    const fundedRatio = row.totalBacklog ? safeRatio(row.fundedBacklog ?? 0, row.totalBacklog) : null;
    const backlogCoverageYears = row.totalBacklog ? safeRatio(row.totalBacklog, periodId === "q1-26" ? row.sales * 4 : row.sales) : null;
    const fixedPriceMix = row.fixedPriceSales != null && row.costTypeSales != null
      ? safeRatio(row.fixedPriceSales, row.fixedPriceSales + row.costTypeSales)
      : null;
    const qualityScore = Math.round(
      clamp((margin - 0.06) / 0.09, 0, 1) * 35 +
        clamp((salesGrowth ?? 0.02) / 0.12, 0, 1) * 20 +
        clamp((backlogCoverageYears ?? 0) / 2.5, 0, 1) * 25 +
        clamp(((fundedRatio ?? 0.45) - 0.25) / 0.35, 0, 1) * 10 +
        clamp(1 - ((fixedPriceMix ?? 0.5) - 0.4), 0, 1) * 10,
    );
    return {
      ...row,
      salesMix: row.segment === "Intersegment eliminations" ? 0 : safeRatio(row.sales, operatingRows.reduce((sum, item) => sum + item.sales, 0)),
      operatingIncomeMix: row.segment === "Intersegment eliminations" ? 0 : safeRatio(row.operatingIncome ?? 0, operatingRows.reduce((sum, item) => sum + (item.operatingIncome ?? 0), 0)),
      salesGrowth,
      operatingIncomeGrowth,
      fixedPriceMix,
      qualityScore,
      backlogCoverageYears,
      fundedRatio,
    };
  });

  const reconciliationWarnings = [];
  const period = data.periods.find((item) => item.id === periodId);
  if (period && Math.abs(totalSales - period.sales) > 2) {
    reconciliationWarnings.push({
      id: "noc-segment-sales-reconciliation",
      title: "Segment sales do not reconcile",
      detail: `Segment rows sum to ${totalSales.toFixed(0)} while period sales are ${period.sales.toFixed(0)}.`,
      severity: "high" as const,
    });
  }
  if (period && Math.abs(totalBacklog - period.totalBacklog) > 2) {
    reconciliationWarnings.push({
      id: "noc-backlog-reconciliation",
      title: "Segment backlog does not reconcile",
      detail: `Segment backlog sums to ${totalBacklog.toFixed(0)} while period backlog is ${period.totalBacklog.toFixed(0)}.`,
      severity: "high" as const,
    });
  }

  return {
    rows,
    totals: {
      sales: totalSales,
      operatingIncome: totalOperatingIncome,
      totalBacklog,
    },
    reconciliationWarnings,
  };
}
