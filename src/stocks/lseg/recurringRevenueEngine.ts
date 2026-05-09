import type { LsegRawData } from "./data";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function calculateRecurringRevenueEngine(
  data: LsegRawData,
  periodId: string,
  context?: {
    workflowLockInScore: number;
    pricingPowerScore: number;
    postTradeMoatScore: number;
    graphDensity: number;
    switchingCostScore: number;
  },
) {
  const current =
    data.recurringRevenueMetrics.find((row) => row.periodId === periodId) ??
    data.recurringRevenueMetrics[data.recurringRevenueMetrics.length - 1];
  const subscriptionRows = data.subscriptionMetrics.filter((row) => row.periodId === periodId);
  const averageSubscriptionQuality =
    subscriptionRows.reduce((sum, row) => sum + row.qualityScore, 0) / Math.max(subscriptionRows.length, 1);
  const workflowTailwind = (context?.workflowLockInScore ?? 65) / 100;
  const pricingTailwind = (context?.pricingPowerScore ?? 60) / 100;
  const infrastructureTailwind = (context?.postTradeMoatScore ?? 70) / 100;
  const graphTailwind = context?.graphDensity ?? 0.5;
  const switchingTailwind = (context?.switchingCostScore ?? 60) / 100;
  const recurringRevenueQualityScore = clampScore(
    (
      current.recurringRevenuePct * 0.22 +
      current.subscriptionRevenuePct * 0.15 +
      current.grossRetention * 0.16 +
      Math.min(current.netRetention, 1.1) / 1.1 * 0.14 +
      current.recurringFcfConversion * 0.14 +
      Math.min(current.pricingRealization / 0.04, 1) * 0.1 +
      Math.min(current.averageContractDuration / 5, 1) * 0.05 +
      workflowTailwind * 0.02 +
      pricingTailwind * 0.01 +
      infrastructureTailwind * 0.01 +
      graphTailwind * 0.02 +
      switchingTailwind * 0.02
    ) * 100,
  );

  return {
    current: {
      ...current,
      recurringRevenueQualityScore,
      averageSubscriptionQuality,
    },
    series: data.recurringRevenueMetrics.map((row) => ({
      periodId: row.periodId,
      recurringRevenuePct: row.recurringRevenuePct,
      subscriptionRevenuePct: row.subscriptionRevenuePct,
      recurringRevenueQualityScore: clampScore(
        (
          row.recurringRevenuePct * 0.22 +
          row.subscriptionRevenuePct * 0.15 +
          row.grossRetention * 0.16 +
          Math.min(row.netRetention, 1.1) / 1.1 * 0.14 +
          row.recurringFcfConversion * 0.14 +
          Math.min(row.pricingRealization / 0.04, 1) * 0.1 +
          Math.min(row.averageContractDuration / 5, 1) * 0.05 +
          (((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.productsPerClient ?? 2.4) / 4) * 0.02) +
          ((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.pricingPowerScore ?? 0.62) * 0.01) +
          ((data.postTradeMetrics.find((metric) => metric.periodId === row.periodId)?.pricingPowerScore ?? 0.72) * 0.01) +
          (((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.activeConnections ?? 16) / Math.max((((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.nodes ?? 8) * ((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.nodes ?? 8) - 1)) / 2), 1)) * 0.02) +
          (((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.switchingFriction ?? 0.66) * 100) / 100 * 0.02)
        ) * 100,
      ),
    })),
    interpretation:
      recurringRevenueQualityScore >= 78
        ? "Recurring revenue quality is improving, with retention, contract duration, and pricing realization all moving in the right direction."
        : "Recurring economics remain healthy, but quality is not yet improving fast enough to re-rate the moat on its own.",
  };
}
