import type { DgeGuidanceDatum } from "../types";

export const dgeGuidanceData: DgeGuidanceDatum[] = [
  {
    period: "FY 2026",
    organicNetSalesGrowthLow: -0.03,
    organicNetSalesGrowthHigh: -0.02,
    organicOperatingProfitGrowthLow: 0.0,
    organicOperatingProfitGrowthHigh: 0.03,
    accelerateSavings: 625,
    freeCashFlow: 3_000,
    capexLow: 1_200,
    capexHigh: 1_300,
    taxRateBeforeExceptional: 0.245,
    effectiveInterestRate: 0.045,
    dividendFloor: 0.5,
    payoutPolicyLow: 0.3,
    payoutPolicyHigh: 0.5,
    erpInventoryBuildExcludedFromFcf: 250,
    sourceEvidenceIds: ["fy2025-dividend-accelerate-fcf-guidance", "h1fy2026-dividend-rebased", "q3fy2026-guidance"],
  },
];
