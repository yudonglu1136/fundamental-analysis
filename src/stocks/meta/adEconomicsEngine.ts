import { annualizeQuarterly, clamp, safeDivide } from "../../utils/financialMath";
import type { MetaAssumptions } from "./assumptions";
import type { MetaQuarterRow } from "./data";

export type MetaAdEconomics = {
  annualAdRevenue: number;
  reportedAdRevenueAnnual: number;
  impliedAdRevenueAnnual: number;
  effectiveCpm: number;
  adRevenueReconciliationGap: number;
  adRevenueReconciled: boolean;
  bridgePrecision: "precise" | "reconciled";
  impressionsGrowth: number;
  cpmGrowth: number;
  observedRoasImprovement: number;
  advertiserBudgetRate: number;
  engagementInventoryRate: number;
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
  row: MetaQuarterRow & { reportedAdRevenue?: number; reportedCpm?: number },
  prior: MetaQuarterRow & { reportedAdRevenue?: number; reportedCpm?: number },
  assumptions: MetaAssumptions,
): MetaAdEconomics {
  const rawReportedAdRevenue = row.reportedAdRevenue ?? row.adRevenue;
  const rawReportedCpm = row.reportedCpm ?? row.cpm;
  const reportedAdRevenueAnnual = annualizeQuarterly(rawReportedAdRevenue);
  const impliedAdRevenueAnnual = row.adImpressions * rawReportedCpm / 1000 * 4;
  const adRevenueReconciliationGap = safeDivide(Math.abs(reportedAdRevenueAnnual - impliedAdRevenueAnnual), Math.max(reportedAdRevenueAnnual, 1));
  const annualAdRevenue = row.isForecast ? impliedAdRevenueAnnual : reportedAdRevenueAnnual;
  const effectiveCpm = row.isForecast ? row.cpm : safeDivide(row.adRevenue, Math.max(row.adImpressions, 1)) * 1000;
  const adRevenueReconciled = adRevenueReconciliationGap <= 0.02;
  const impressionsGrowth = safeDivide(row.adImpressions, Math.max(prior.adImpressions, 1)) - 1;
  const priorEffectiveCpm = prior.isForecast ? prior.cpm : safeDivide(prior.adRevenue, Math.max(prior.adImpressions, 1)) * 1000;
  const cpmGrowth = safeDivide(effectiveCpm, Math.max(priorEffectiveCpm, 0.01)) - 1;
  const observedRoasImprovement = safeDivide(row.roas, Math.max(prior.roas, 0.1)) - 1;
  const conversionRateDelta = safeDivide(row.conversionRate, Math.max(prior.conversionRate, 0.001)) - 1;
  const advertiserBudgetRate = clamp(
    observedRoasImprovement * 0.35 + conversionRateDelta * 0.3 + assumptions.aiConversionUplift * 0.75 + row.aiTargetingUplift * 0.35,
    0,
    0.12,
  );
  const engagementInventoryRate = clamp(
    (safeDivide(row.timeSpent, Math.max(prior.timeSpent, 1)) - 1) * 0.45 + assumptions.aiEngagementUplift * 0.7 + Math.max(0, row.adLoad - prior.adLoad) * 0.9 + row.aiRecommendationUplift * 0.3,
    0,
    0.09,
  );
  const conversionUpliftRate = advertiserBudgetRate;
  const cpmUpliftRate = clamp(assumptions.aiCpmUplift + observedRoasImprovement * 0.45 + row.avgPricePerAdGrowth * 0.3, 0, 0.11);
  const engagementUpliftRate = engagementInventoryRate;
  const creativeUpliftRate = clamp(
    assumptions.aiCreativeAutomationUplift + assumptions.advantagePlusAdoption * 0.05 + row.aiCreativeAutomationAdoption * 0.04,
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
  const incrementalAdMargin = clamp(
    assumptions.incrementalAdMargin + cpmUpliftRate * 0.35 + observedRoasImprovement * 0.2 - safeDivide(aiInferenceCostAnnual, Math.max(totalIncrementalRevenue, 1)) * 0.08,
    0.38,
    0.72,
  );
  const aiOperatingProfitAnnual = totalIncrementalRevenue * incrementalAdMargin - aiServingCostAnnual - aiInferenceCostAnnual - aiAdOpexAnnual;
  const aiAfterTaxOperatingProfitAnnual = aiOperatingProfitAnnual * (1 - assumptions.taxRate);
  const aiEmbeddedRevenueAnnual = annualizeQuarterly(row.aiAdRevenueUplift);
  const aiEmbeddedAfterTaxProfitAnnual = Math.max(
    0,
    (aiEmbeddedRevenueAnnual * incrementalAdMargin - annualizeQuarterly(row.aiServingCost) - annualizeQuarterly(row.aiInferenceCost) - annualizeQuarterly(row.aiAdStackOpex))
      * (1 - assumptions.taxRate),
  );
  const roasImprovement = observedRoasImprovement + assumptions.aiConversionUplift * 0.4 + assumptions.aiCpmUplift * 0.25;
  const cpmRealization = cpmGrowth + assumptions.aiCpmUplift;
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
    reportedAdRevenueAnnual,
    impliedAdRevenueAnnual,
    effectiveCpm,
    adRevenueReconciliationGap,
    adRevenueReconciled,
    bridgePrecision: adRevenueReconciled ? "precise" : "reconciled",
    impressionsGrowth,
    cpmGrowth,
    observedRoasImprovement,
    advertiserBudgetRate,
    engagementInventoryRate,
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
    incrementalAdMargin,
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
