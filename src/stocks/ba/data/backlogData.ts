import { baFinancialPeriods, baSegmentFinancials } from "./segmentData";

export const baBacklogActuals = {
  sourceStatus: "official_actual" as const,
  sourceId: "ba-fy-2025-results",
  periods: baFinancialPeriods.map((period) => ({
    periodId: period.id,
    orderIntake: period.orderIntake,
    orderBacklog: period.orderBacklog,
    orderBook: period.orderBook,
    sales: period.sales,
  })),
  segments: baSegmentFinancials
    .filter((segment) => segment.periodId === "fy25")
    .map((segment) => ({
      segment: segment.segment,
      sales: segment.sales,
      orderIntake: segment.orderIntake,
      orderBacklog: segment.orderBacklog,
      orderBook: segment.orderBook,
      sourceStatus: segment.sourceStatus,
      sourceId: segment.sourceId,
    })),
};
