import { annualizeQuarterly, clamp, safeDivide } from "../../utils/financialMath";
import type { MetaAssumptions } from "./assumptions";
import type { MetaQuarterRow } from "./data";

export type MetaRealityLabsEconomics = {
  annualRevenue: number;
  annualOperatingLoss: number;
  dragPerShareAfterTax: number;
  lossMargin: number;
  optionalityValue: number;
  dragScore: number;
};

export function calculateRealityLabsEconomics(
  row: MetaQuarterRow,
  assumptions: MetaAssumptions,
) {
  const annualRevenue = annualizeQuarterly(row.realityLabsRevenue);
  const annualOperatingLoss = Math.max(assumptions.realityLabsLoss, annualizeQuarterly(row.realityLabsOperatingLoss));
  const dragPerShareAfterTax = safeDivide(annualOperatingLoss * (1 - assumptions.taxRate), Math.max(row.sharesOutstanding, 1));
  const lossMargin = safeDivide(annualOperatingLoss, Math.max(annualizeQuarterly(row.totalRevenue), 1));
  const optionalityValue = assumptions.realityLabsOptionalityValue - annualOperatingLoss * 1.5;
  const dragScore = clamp(65 - lossMargin * 260 - dragPerShareAfterTax * 2.2 + assumptions.realityLabsOptionalityValue * 2, 0, 100);

  return {
    annualRevenue,
    annualOperatingLoss,
    dragPerShareAfterTax,
    lossMargin,
    optionalityValue,
    dragScore,
  };
}
