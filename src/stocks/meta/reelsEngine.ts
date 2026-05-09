import { annualizeQuarterly, clamp } from "../../utils/financialMath";
import type { MetaQuarterRow } from "./data";

export type MetaReelsEconomics = {
  monetizationGap: number;
  monetizationGapChange: number;
  annualizedReelsWatchTime: number;
  incrementalRevenuePotential: number;
  monetizationScore: number;
};

export function calculateReelsEconomics(row: MetaQuarterRow, prior: MetaQuarterRow) {
  const monetizationGapChange = prior.reelsMonetizationGap - row.reelsMonetizationGap;
  const annualizedReelsWatchTime = annualizeQuarterly(row.reelsWatchTime);
  const incrementalRevenuePotential = annualizeQuarterly(row.adRevenue) * Math.max(row.reelsMonetizationGap, 0) * 0.45;
  const monetizationScore = clamp(
    50 + monetizationGapChange * 280 + (row.reelsWatchTime - prior.reelsWatchTime) * 2.4 - row.reelsMonetizationGap * 65,
    0,
    100,
  );

  return {
    monetizationGap: row.reelsMonetizationGap,
    monetizationGapChange,
    annualizedReelsWatchTime,
    incrementalRevenuePotential,
    monetizationScore,
  };
}
