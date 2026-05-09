import { annualizeQuarterly, clamp, safeDivide } from "../../utils/financialMath";
import type { MetaAssumptions } from "./assumptions";
import type { MetaQuarterRow } from "./data";

export type MetaWhatsappEconomics = {
  annualRevenue: number;
  annualBusinessMessagingRevenue: number;
  annualOperatingProfit: number;
  optionalityValue: number;
  revenueShareOfMeta: number;
  optionalityScore: number;
};

export function calculateWhatsappEconomics(
  row: MetaQuarterRow,
  assumptions: MetaAssumptions,
) {
  const annualRevenue = Math.max(assumptions.whatsappRevenue, annualizeQuarterly(row.whatsappRevenue));
  const annualBusinessMessagingRevenue = annualizeQuarterly(row.businessMessagingRevenue);
  const annualOperatingProfit = annualRevenue * assumptions.whatsappMargin;
  const optionalityValue = annualOperatingProfit * assumptions.whatsappMultiple + assumptions.whatsappOptionalityValue;
  const revenueShareOfMeta = safeDivide(annualRevenue, Math.max(annualizeQuarterly(row.totalRevenue), 1));
  const optionalityScore = clamp(
    45 + revenueShareOfMeta * 180 + assumptions.whatsappMargin * 60 + Math.max(0, annualBusinessMessagingRevenue - annualRevenue) * 1.8,
    0,
    100,
  );

  return {
    annualRevenue,
    annualBusinessMessagingRevenue,
    annualOperatingProfit,
    optionalityValue,
    revenueShareOfMeta,
    optionalityScore,
  };
}
