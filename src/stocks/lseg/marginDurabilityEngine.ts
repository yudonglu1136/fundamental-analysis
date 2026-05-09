import type { LsegRawData } from "./data";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function calculateMarginDurabilityEngine(
  data: LsegRawData,
  periodId: string,
  context?: {
    recurringRevenueQualityScore: number;
    pricingPowerScore: number;
    postTradeMoatScore: number;
    graphDensity: number;
    switchingCostScore: number;
  },
) {
  const current =
    data.marginDurabilityMetrics.find((row) => row.periodId === periodId) ??
    data.marginDurabilityMetrics[data.marginDurabilityMetrics.length - 1];
  const temporaryShare = current.temporaryIntegrationSavings /
    Math.max(
      current.temporaryIntegrationSavings +
        current.structuralOperatingLeverage +
        current.recurringMixShift +
        current.pricingPower +
        current.digitalDeliveryLeverage +
        current.platformEconomics +
        current.clearingOperatingLeverage,
      0.0001,
    );
  const recurringTailwind = (context?.recurringRevenueQualityScore ?? 70) / 100;
  const pricingTailwind = (context?.pricingPowerScore ?? 60) / 100;
  const clearingTailwind = (context?.postTradeMoatScore ?? 70) / 100;
  const graphTailwind = context?.graphDensity ?? 0.5;
  const switchingTailwind = (context?.switchingCostScore ?? 60) / 100;
  const structuralMarginExpansionScore = clampScore(
    (
      Math.min(current.structuralOperatingLeverage / 0.015, 1) * 0.22 +
      Math.min(current.recurringMixShift / 0.012, 1) * 0.15 +
      Math.min(current.pricingPower / 0.01, 1) * 0.11 +
      Math.min(current.digitalDeliveryLeverage / 0.008, 1) * 0.1 +
      Math.min(current.platformEconomics / 0.01, 1) * 0.14 +
      Math.min(current.clearingOperatingLeverage / 0.01, 1) * 0.1 +
      current.marginPersistenceProbability * 0.08 +
      recurringTailwind * 0.05 +
      pricingTailwind * 0.03 +
      clearingTailwind * 0.02 +
      graphTailwind * 0.02 +
      switchingTailwind * 0.02
    ) * 100,
  );

  return {
    current: {
      ...current,
      temporaryShare,
      structuralMarginExpansionScore,
    },
    series: data.marginDurabilityMetrics.map((row) => ({
      periodId: row.periodId,
      temporaryShare:
        row.temporaryIntegrationSavings /
        Math.max(
          row.temporaryIntegrationSavings +
            row.structuralOperatingLeverage +
            row.recurringMixShift +
            row.pricingPower +
            row.digitalDeliveryLeverage +
            row.platformEconomics +
            row.clearingOperatingLeverage,
          0.0001,
        ),
      structuralMarginExpansionScore: clampScore(
        (
          Math.min(row.structuralOperatingLeverage / 0.015, 1) * 0.22 +
          Math.min(row.recurringMixShift / 0.012, 1) * 0.15 +
          Math.min(row.pricingPower / 0.01, 1) * 0.11 +
          Math.min(row.digitalDeliveryLeverage / 0.008, 1) * 0.1 +
          Math.min(row.platformEconomics / 0.01, 1) * 0.14 +
          Math.min(row.clearingOperatingLeverage / 0.01, 1) * 0.1 +
          row.marginPersistenceProbability * 0.08 +
          Math.min((data.recurringRevenueMetrics.find((metric) => metric.periodId === row.periodId)?.recurringRevenuePct ?? 0.7) / 0.8, 1) * 0.05 +
          (data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.pricingPowerScore ?? 0.62) * 0.03 +
          (data.postTradeMetrics.find((metric) => metric.periodId === row.periodId)?.pricingPowerScore ?? 0.72) * 0.02 +
          (((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.activeConnections ?? 16) / Math.max((((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.nodes ?? 8) * ((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.nodes ?? 8) - 1)) / 2), 1)) * 0.02) +
          ((data.workflowGraphMetrics.find((metric) => metric.periodId === row.periodId)?.switchingFriction ?? 0.66) * 0.02)
        ) * 100,
      ),
      marginPersistenceProbability: row.marginPersistenceProbability,
    })),
    interpretation:
      structuralMarginExpansionScore >= 74
        ? "Margin expansion looks structural, with recurring mix, digital delivery, and clearing leverage now doing more work than integration savings."
        : "Margins are improving, but structural drivers are not yet strong enough to fully offset cost synergy exhaustion risk.",
  };
}
