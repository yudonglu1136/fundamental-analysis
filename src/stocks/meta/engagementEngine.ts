import { clamp, safeDivide } from "../../utils/financialMath";
import type { MetaAssumptions } from "./assumptions";
import type { MetaQuarterRow } from "./data";

export type MetaEngagementEconomics = {
  timeSpentGrowth: number;
  reelsWatchGrowth: number;
  monetizationGapChange: number;
  recommendationEconomics: number;
  targetingEconomics: number;
  advantagePlusAdoption: number;
  engagementScore: number;
  dependencySignal: "Positive" | "Neutral" | "Compute Constrained";
};

export function calculateEngagementEconomics(
  row: MetaQuarterRow,
  prior: MetaQuarterRow,
  assumptions: MetaAssumptions,
): MetaEngagementEconomics {
  const timeSpentGrowth = safeDivide(row.timeSpent, Math.max(prior.timeSpent, 1)) - 1;
  const reelsWatchGrowth = safeDivide(row.reelsWatchTime, Math.max(prior.reelsWatchTime, 0.1)) - 1;
  const monetizationGapChange = prior.reelsMonetizationGap - row.reelsMonetizationGap;
  const recommendationEconomics = row.aiRecommendationUplift + assumptions.aiEngagementUplift + timeSpentGrowth * 0.4;
  const targetingEconomics = row.aiTargetingUplift + assumptions.aiConversionUplift + assumptions.aiCpmUplift * 0.4;
  const advantagePlusAdoption = Math.max(row.advantagePlusAdoption, assumptions.advantagePlusAdoption);
  const engagementScore = clamp(
    45
      + timeSpentGrowth * 260
      + reelsWatchGrowth * 180
      + monetizationGapChange * 220
      + recommendationEconomics * 240
      + targetingEconomics * 180
      + advantagePlusAdoption * 20,
    0,
    100,
  );

  return {
    timeSpentGrowth,
    reelsWatchGrowth,
    monetizationGapChange,
    recommendationEconomics,
    targetingEconomics,
    advantagePlusAdoption,
    engagementScore,
    dependencySignal: engagementScore >= 70 ? "Positive" : engagementScore >= 55 ? "Neutral" : "Compute Constrained",
  };
}
