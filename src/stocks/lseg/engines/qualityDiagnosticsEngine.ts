import type { Scenario, Signal } from "../../types";
import type { LsegDashboardDataset, LsegQualityDiagnostics, LsegSotpResult } from "../model";
import { clamp, getPeriodById, safeRatio } from "./helpers";
import type { LsegFcfEngineResult } from "./fcfEngine";
import type { LsegRevenueEngineResult } from "./revenueEngine";

function signalFromScore(score: number): Signal {
  if (score >= 75) return "Positive";
  if (score >= 58) return "Neutral";
  return "Negative";
}

export function calculateQualityDiagnosticsEngine(
  data: LsegDashboardDataset,
  periodId: string,
  scenario: Scenario,
  revenue: LsegRevenueEngineResult,
  fcf: LsegFcfEngineResult,
  sotp: LsegSotpResult,
): LsegQualityDiagnostics {
  const period = getPeriodById(data, periodId);
  const kpi = data.kpis.find((item) => item.periodId === periodId) ?? data.kpis[data.kpis.length - 1];
  const firstRevenueYear = revenue.groupRevenueByYear[0];
  const firstFcfYear = fcf.rows[0];
  const tradewebAverageGrowth = safeRatio(
    data.tradewebMonthly.reduce((sum, row) => sum + row.tradewebAdvYoY, 0),
    Math.max(data.tradewebMonthly.length, 1),
  );
  const asvScore = clamp((kpi.asvGrowth - 0.04) / 0.03, 0, 1) * 100;
  const retentionScore = clamp((kpi.grossRetention - 0.9) / 0.04, 0, 1) * 100;
  const vitalityScore = clamp((kpi.newProductVitalityIndex - 0.15) / 0.12, 0, 1) * 100;
  const recurringMixScore = clamp((kpi.recurringRevenueMix - 0.7) / 0.12, 0, 1) * 100;
  const capitalEfficiencyScore = clamp((0.11 - period.capexIntensity) / 0.03, 0, 1) * 100;
  const fcfConversionScore = clamp((firstFcfYear?.cashConversionFromEbitda ?? 0.45) / 0.65, 0, 1) * 100;
  const tradewebVolatilityPenalty = tradewebAverageGrowth > 0.1 ? 6 : 0;
  const revenueDurabilityScore = (asvScore * 0.3) + (retentionScore * 0.32) + (recurringMixScore * 0.2) + (vitalityScore * 0.18);
  const overallQualityScore =
    (revenueDurabilityScore * 0.42) +
    (capitalEfficiencyScore * 0.16) +
    (fcfConversionScore * 0.18) +
    (clamp((firstRevenueYear?.growth ?? 0.05) / 0.08, 0, 1) * 100 * 0.14) +
    (clamp(safeRatio(sotp.impliedGroupEvToEbitda, 22), 0, 1) * 100 * 0.1) -
    tradewebVolatilityPenalty;

  const pricingPowerScore = (clamp((kpi.pricingRealization - 0.015) / 0.02, 0, 1) * 60) + (retentionScore * 0.4);
  const workflowScore = (retentionScore * 0.45) + (vitalityScore * 0.25) + (recurringMixScore * 0.3);
  const postTradeProxyGrowth =
    revenue.rows.find((row) => row.segment === "Post Trade" && row.fiscalYear === firstRevenueYear?.fiscalYear)?.totalGrowth ??
    (
      ((firstRevenueYear?.marketsBridge?.structuralGrowth ?? 0.02) * 0.55) +
      ((firstRevenueYear?.marketsBridge?.fixedFeeContribution ?? 0.003) * 0.45) +
      (kpi.grossRetention > 0.92 ? 0.012 : 0.006)
    );
  const postTradeScore = clamp(((postTradeProxyGrowth - 0.02) / 0.06), 0, 1) * 100;

  const riskFlags: string[] = [];
  if ((firstRevenueYear?.mixBySegment.Markets ?? 0) > 0.2 && tradewebAverageGrowth > 0.1) {
    riskFlags.push("Markets / Tradeweb growth looks strong but should not be treated as fully recurring.");
  }
  if ((firstRevenueYear?.marketsBridge?.cyclicalUplift ?? 0) > 0.015) {
    riskFlags.push("Markets growth includes cyclical volume uplift and should fade in outer years rather than flow into terminal value.");
  }
  if ((data.tradewebMonthly.some((row) => row.feePerMillion < 2.6))) {
    riskFlags.push("Tradeweb fee per million looks soft in parts of the monthly data set, so volume growth should not be mistaken for pure pricing power.");
  }
  if ((firstFcfYear?.cashConversionFromEbitda ?? 0) < 0.55) {
    riskFlags.push("FCF conversion is not yet strong enough to support an aggressive premium narrative.");
  }
  if (kpi.grossRetention < 0.92) {
    riskFlags.push("Retention softens the recurring revenue durability story.");
  }

  const scenarioProbabilityAdjustment = {
    Bear: overallQualityScore >= 75 ? -0.05 : overallQualityScore < 58 ? 0.05 : 0,
    Base: overallQualityScore >= 75 ? 0 : 0,
    Bull: overallQualityScore >= 75 ? 0.05 : overallQualityScore < 58 ? -0.05 : 0,
  } as Record<Scenario, number>;

  return {
    overallQualityScore: Math.round(overallQualityScore),
    revenueDurabilityScore: Math.round(revenueDurabilityScore),
    pricingPowerSignal: signalFromScore(pricingPowerScore),
    workflowLockInSignal: signalFromScore(workflowScore),
    postTradeMoatSignal: signalFromScore(postTradeScore),
    capitalEfficiencySignal: signalFromScore((capitalEfficiencyScore * 0.55) + (fcfConversionScore * 0.45)),
    scenarioProbabilityAdjustment,
    recommendedMultipleRangeCommentary:
      overallQualityScore >= 75
        ? "High retention, positive ASV growth, and healthy FCF conversion support staying toward the upper end of peer multiple ranges, but the quality signal does not directly add value."
        : "Quality diagnostics support staying within peer ranges, but do not justify a hidden premium on their own.",
    riskFlags,
    interpretation:
      overallQualityScore >= 75
        ? "Recurring mix, retention, and product vitality support high confidence in the base-to-bull operating path."
        : "Business quality is still good, but markets cyclicality and capital intensity argue for keeping valuation inputs grounded in cash flow rather than score expansion.",
    sourceMetrics: {
      asvGrowth: kpi.asvGrowth,
      grossRetention: kpi.grossRetention,
      netRetention: kpi.netRetention,
      newProductVitalityIndex: kpi.newProductVitalityIndex,
      recurringRevenueMix: kpi.recurringRevenueMix,
      capitalIntensity: period.capexIntensity,
      fcfConversion: firstFcfYear?.cashConversionFromEbitda ?? 0,
    },
  };
}
