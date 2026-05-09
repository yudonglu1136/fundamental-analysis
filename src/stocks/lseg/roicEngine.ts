import type { LsegRawData } from "./data";

function safeDivide(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function calculateRoicEngine(
  data: LsegRawData,
  periodId: string,
  context: {
    recurringRevenueQualityScore: number;
    workflowLockInScore: number;
    pricingPowerScore: number;
    postTradeMoatScore: number;
    structuralMarginExpansionScore: number;
    platformRoicAnchor: number;
  },
) {
  const current = data.roicMetrics.find((row) => row.periodId === periodId) ?? data.roicMetrics[data.roicMetrics.length - 1];
  const costSynergyAfterTaxProfit = current.costSynergyAfterTaxProfit * (1 + (context.structuralMarginExpansionScore - 68) / 500);
  const revenueSynergyAfterTaxProfit =
    current.revenueSynergyAfterTaxProfit *
    (1 + (context.recurringRevenueQualityScore - 80) / 220 + (context.pricingPowerScore - 66) / 260);
  const clearingAfterTaxProfit =
    current.clearingAfterTaxProfit *
    (1 + (context.postTradeMoatScore - 75) / 180);
  const workflowAfterTaxProfit =
    current.workflowAfterTaxProfit *
    (1 + (context.workflowLockInScore - 71) / 200 + (context.pricingPowerScore - 66) / 350);
  const costSynergyRoic = safeDivide(costSynergyAfterTaxProfit, current.costSynergyInvestedCapital);
  const revenueSynergyRoic = safeDivide(revenueSynergyAfterTaxProfit, current.revenueSynergyInvestedCapital);
  const clearingRoic = safeDivide(clearingAfterTaxProfit, current.clearingInvestedCapital);
  const workflowRoic = safeDivide(workflowAfterTaxProfit, current.workflowInvestedCapital);
  const modeledPlatformRoic = safeDivide(
    costSynergyAfterTaxProfit + revenueSynergyAfterTaxProfit + clearingAfterTaxProfit + workflowAfterTaxProfit,
    current.costSynergyInvestedCapital +
      current.revenueSynergyInvestedCapital +
      current.clearingInvestedCapital +
      current.workflowInvestedCapital,
  );
  const blendedPlatformRoic = (modeledPlatformRoic * 0.75) + (context.platformRoicAnchor * 0.25);
  const moatCompoundingScore = clampScore(
    (
      Math.min(blendedPlatformRoic / 0.22, 1) * 0.3 +
      (context.workflowLockInScore / 100) * 0.22 +
      (context.recurringRevenueQualityScore / 100) * 0.22 +
      (context.pricingPowerScore / 100) * 0.12 +
      (context.postTradeMoatScore / 100) * 0.08 +
      Math.min(revenueSynergyRoic / 0.2, 1) * 0.04 +
      (context.structuralMarginExpansionScore / 100) * 0.02
    ) * 100,
  );

  return {
    current: {
      ...current,
      costSynergyRoic,
      revenueSynergyRoic,
      clearingRoic,
      workflowRoic,
      blendedPlatformRoic,
      moatCompoundingScore,
    },
    series: data.roicMetrics.map((row) => ({
      periodId: row.periodId,
      blendedPlatformRoic: safeDivide(
        row.costSynergyAfterTaxProfit +
          row.revenueSynergyAfterTaxProfit +
          row.clearingAfterTaxProfit +
          row.workflowAfterTaxProfit,
        row.costSynergyInvestedCapital +
          row.revenueSynergyInvestedCapital +
          row.clearingInvestedCapital +
          row.workflowInvestedCapital,
      ),
    })),
    interpretation:
      moatCompoundingScore >= 74
        ? "Incremental ROIC is increasingly being earned by workflow, data, and clearing assets rather than by short-lived cost takeout."
        : "ROIC is still respectable, but not yet strong enough to call the platform a clear moat compounder.",
  };
}
