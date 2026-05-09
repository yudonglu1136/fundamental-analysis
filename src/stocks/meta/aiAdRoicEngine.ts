import { clamp, safeDivide } from "../../utils/financialMath";
import type { MetaAssumptions } from "./assumptions";
import type { MetaAdEconomics } from "./adEconomicsEngine";
import type { MetaCapexEconomics } from "./capexEngine";
import type { MetaQuarterRow } from "./data";
import type { MetaEngagementEconomics } from "./engagementEngine";

export type MetaAiAdRoic = {
  investedCapital: number;
  incrementalAfterTaxOperatingProfit: number;
  incrementalInfrastructureCost: number;
  aiAdRoic: number;
  roicSpread: number;
  paybackYears: number;
  profitToInfrastructureRatio: number;
  score: number;
};

export function calculateAiAdRoic(
  row: MetaQuarterRow,
  assumptions: MetaAssumptions,
  adEconomics: MetaAdEconomics,
  engagementEconomics: MetaEngagementEconomics,
  capexEconomics: MetaCapexEconomics,
) {
  const investedCapital = Math.max(assumptions.aiInvestedCapital, row.aiInvestedCapital);
  const incrementalAfterTaxOperatingProfit = adEconomics.aiAfterTaxOperatingProfitAnnual;
  const incrementalInfrastructureCost = capexEconomics.aiInfrastructureBurden;
  const aiAdRoic = safeDivide(incrementalAfterTaxOperatingProfit, Math.max(investedCapital, 1));
  const roicSpread = aiAdRoic - assumptions.wacc;
  const paybackYears = safeDivide(investedCapital, Math.max(incrementalAfterTaxOperatingProfit, 0.1));
  const profitToInfrastructureRatio = safeDivide(incrementalAfterTaxOperatingProfit, Math.max(incrementalInfrastructureCost, 0.1));
  const score = clamp(
    45
      + roicSpread * 340
      + profitToInfrastructureRatio * 10
      + engagementEconomics.engagementScore * 0.18
      - Math.max(0, paybackYears - 5) * 6,
    0,
    100,
  );

  return {
    investedCapital,
    incrementalAfterTaxOperatingProfit,
    incrementalInfrastructureCost,
    aiAdRoic,
    roicSpread,
    paybackYears,
    profitToInfrastructureRatio,
    score,
  };
}
