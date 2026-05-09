import { annualizeQuarterly, clamp, safeDivide } from "../../utils/financialMath";
import type { MetaAssumptions } from "./assumptions";
import type { MetaQuarterRow } from "./data";

export type MetaAdEconomics = {
  annualAdRevenue: number;
  impressionsGrowth: number;
  cpmGrowth: number;
  conversionUpliftRate: number;
  cpmUpliftRate: number;
  engagementUpliftRate: number;
  creativeUpliftRate: number;
  totalUpliftRate: number;
  conversionRevenue: number;
  cpmRevenue: number;
  engagementRevenue: number;
  creativeRevenue: number;
  totalIncrementalRevenue: number;
  aiServingCostAnnual: number;
  aiInferenceCostAnnual: number;
  aiAdOpexAnnual: number;
  incrementalAdMargin: number;
  aiOperatingProfitAnnual: number;
  aiAfterTaxOperatingProfitAnnual: number;
  aiRevenueNetOfCostAnnual: number;
  aiEmbeddedRevenueAnnual: number;
  aiEmbeddedAfterTaxProfitAnnual: number;
  roasImprovement: number;
  conversionRateDelta: number;
  cpmRealization: number;
  qualityScore: number;
};

export function calculateAdEconomics(
  row: MetaQuarterRow,
  prior: MetaQuarterRow,
  assumptions: MetaAssumptions,
): MetaAdEconomics {
  const annualAdRevenue = annualizeQuarterly(row.adRevenue);
  const impressionsGrowth = safeDivide(row.adImpressions, Math.max(prior.adImpressions, 1)) - 1;
  const cpmGrowth = safeDivide(row.cpm, Math.max(prior.cpm, 0.01)) - 1;
  const conversionUpliftRate = clamp(assumptions.aiConversionUplift + row.aiTargetingUplift * 0.35, 0, 0.09);
  const cpmUpliftRate = clamp(assumptions.aiCpmUplift + row.avgPricePerAdGrowth * 0.25, 0, 0.1);
  const engagementUpliftRate = clamp(assumptions.aiEngagementUplift + row.aiRecommendationUplift * 0.35, 0, 0.07);
  const creativeUpliftRate = clamp(
    assumptions.aiCreativeAutomationUplift + assumptions.advantagePlusAdoption * 0.03 + row.aiCreativeAutomationAdoption * 0.02,
    0,
    0.07,
  );
  const totalUpliftRate = clamp(conversionUpliftRate + cpmUpliftRate + engagementUpliftRate + creativeUpliftRate, 0, 0.25);
  const conversionRevenue = annualAdRevenue * conversionUpliftRate;
  const cpmRevenue = annualAdRevenue * cpmUpliftRate;
  const engagementRevenue = annualAdRevenue * engagementUpliftRate;
  const creativeRevenue = annualAdRevenue * creativeUpliftRate;
  const totalIncrementalRevenue = conversionRevenue + cpmRevenue + engagementRevenue + creativeRevenue;
  const aiServingCostAnnual = Math.max(assumptions.aiServingCost, annualizeQuarterly(row.aiServingCost));
  const aiInferenceCostAnnual = Math.max(assumptions.aiInferenceCost, annualizeQuarterly(row.aiInferenceCost));
  const aiAdOpexAnnual = Math.max(assumptions.aiAdOpex, annualizeQuarterly(row.aiAdStackOpex));
  const aiOperatingProfitAnnual = totalIncrementalRevenue * assumptions.incrementalAdMargin - aiServingCostAnnual - aiInferenceCostAnnual - aiAdOpexAnnual;
  const aiAfterTaxOperatingProfitAnnual = aiOperatingProfitAnnual * (1 - assumptions.taxRate);
  const aiEmbeddedRevenueAnnual = annualizeQuarterly(row.aiAdRevenueUplift);
  const aiEmbeddedAfterTaxProfitAnnual = Math.max(
    0,
    (aiEmbeddedRevenueAnnual * assumptions.incrementalAdMargin - annualizeQuarterly(row.aiServingCost) - annualizeQuarterly(row.aiInferenceCost) - annualizeQuarterly(row.aiAdStackOpex))
      * (1 - assumptions.taxRate),
  );
  const roasImprovement = assumptions.aiConversionUplift + assumptions.aiCpmUplift + row.aiTargetingUplift * 0.5;
  const conversionRateDelta = row.conversionRate - prior.conversionRate;
  const cpmRealization = row.avgPricePerAdGrowth + assumptions.aiCpmUplift;
  const qualityScore = clamp(
    50
      + totalUpliftRate * 240
      + roasImprovement * 140
      + conversionRateDelta * 900
      + cpmRealization * 110
      - safeDivide(aiServingCostAnnual + aiInferenceCostAnnual + aiAdOpexAnnual, Math.max(totalIncrementalRevenue, 1)) * 35,
    0,
    100,
  );

  return {
    annualAdRevenue,
    impressionsGrowth,
    cpmGrowth,
    conversionUpliftRate,
    cpmUpliftRate,
    engagementUpliftRate,
    creativeUpliftRate,
    totalUpliftRate,
    conversionRevenue,
    cpmRevenue,
    engagementRevenue,
    creativeRevenue,
    totalIncrementalRevenue,
    aiServingCostAnnual,
    aiInferenceCostAnnual,
    aiAdOpexAnnual,
    incrementalAdMargin: assumptions.incrementalAdMargin,
    aiOperatingProfitAnnual,
    aiAfterTaxOperatingProfitAnnual,
    aiRevenueNetOfCostAnnual: totalIncrementalRevenue - aiServingCostAnnual - aiInferenceCostAnnual - aiAdOpexAnnual,
    aiEmbeddedRevenueAnnual,
    aiEmbeddedAfterTaxProfitAnnual,
    roasImprovement,
    conversionRateDelta,
    cpmRealization,
    qualityScore,
  };
}
