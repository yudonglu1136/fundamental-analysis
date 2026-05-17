import type { LsegMoatBreakdown, LsegValuationAssumptions } from "../types";

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

export function calculateLsegMoatEngine(assumptions: LsegValuationAssumptions): LsegMoatBreakdown {
  const breakdown = {
    dataSwitchingCost: 84,
    workflowEmbedding: 73,
    benchmarkIndexNetworkEffect: 90,
    clearingNetworkEffect: 88,
    regulatoryLicenseMoat: 86,
    brandTrust: 82,
    aiDisruptionResilience: 64,
    pricingPowerDurability: 76,
  };
  const overallScore = average(Object.values(breakdown));
  const rawAdjustment = ((overallScore - 60) / 40) * assumptions.platformMoatCap;
  const cappedValuationAdjustment = Math.max(0, Math.min(rawAdjustment, assumptions.platformMoatCap));

  return {
    ...breakdown,
    overallScore,
    cappedValuationAdjustment,
    cap: assumptions.platformMoatCap,
    commentary:
      "Moat is not a generic score. Data switching cost, workflow embedding, index benchmark network effect and clearing network effect support a premium, while AI disruption resilience is deliberately scored lower and caps the adjustment.",
  };
}
