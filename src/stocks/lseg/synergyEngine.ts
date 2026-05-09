import type { LsegRawData } from "./data";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function calculateSynergyEngine(
  data: LsegRawData,
  periodId: string,
  context: { workflowLockInScore: number; postTradeMoatScore: number; structuralMarginExpansionScore: number; totalIncome: number },
) {
  const current = data.synergyDetails.find((row) => row.periodId === periodId) ?? data.synergyDetails[data.synergyDetails.length - 1];
  const totalCostSavings = current.temporaryCostSavings + current.recurringCostSavings;
  const recurringCostMix = current.recurringCostSavings / Math.max(totalCostSavings, 1);
  const costSynergyExhaustionRisk = clampScore((1 - recurringCostMix) * 55 + (100 - context.structuralMarginExpansionScore) * 0.45);
  const revenueSynergyFlywheelScore = clampScore(
    (
      Math.min(current.multiProductPenetration / 0.5, 1) * 0.24 +
      Math.min(current.walletShareGrowth / 0.04, 1) * 0.18 +
      Math.min((current.workspaceCrossSell + current.ftseRiskDataBundling + current.analyticsExecutionAttachment) / 120, 1) * 0.26 +
      Math.min(current.customerExpansionRevenue / 70, 1) * 0.16 +
      (context.workflowLockInScore / 100) * 0.16
    ) * 100,
  );
  const platformNetworkSynergyScore = clampScore(((context.workflowLockInScore / 100) * 0.6 + (context.postTradeMoatScore / 100) * 0.4) * 100);
  const infrastructureSynergyScore = clampScore(((context.postTradeMoatScore / 100) * 0.65 + recurringCostMix * 0.35) * 100);

  return {
    current: {
      ...current,
      recurringCostMix,
      temporaryCostSavings: current.temporaryCostSavings,
      recurringCostSavings: current.recurringCostSavings,
      costSynergyExhaustionRisk,
      revenueSynergyFlywheelScore,
      platformNetworkSynergyScore,
      infrastructureSynergyScore,
      costSynergyMarginContribution: totalCostSavings / Math.max(context.totalIncome, 1),
    },
    interpretation:
      revenueSynergyFlywheelScore >= 72
        ? "Synergy is increasingly becoming a workflow and bundle flywheel, not just a cost-out story."
        : "Synergy realization still leans too heavily on maturing cost actions rather than on richer workflow monetization.",
  };
}
