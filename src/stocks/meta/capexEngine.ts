import { annualizeQuarterly, clamp, safeDivide } from "../../utils/financialMath";
import type { MetaAssumptions } from "./assumptions";
import type { MetaQuarterRow } from "./data";

export type MetaCapexEconomics = {
  annualRevenue: number;
  annualFcf: number;
  annualCapex: number;
  annualAiCapex: number;
  annualGpuCapex: number;
  annualDataCenterCapex: number;
  capexIntensity: number;
  aiCapexIntensity: number;
  aiCapexMix: number;
  fcfMargin: number;
  aiInfrastructureBurden: number;
  aiAdjustedFcf: number;
  aiAdjustedFcfMargin: number;
  burdenScore: number;
};

export function calculateCapexEconomics(
  row: MetaQuarterRow,
  assumptions: MetaAssumptions,
  aiAfterTaxOperatingProfitAnnual: number,
) {
  const annualRevenue = annualizeQuarterly(row.totalRevenue);
  const annualFcf = annualizeQuarterly(row.fcf);
  const annualCapex = annualizeQuarterly(row.totalCapex);
  const annualAiCapex = annualizeQuarterly(row.aiCapex);
  const annualGpuCapex = annualizeQuarterly(row.gpuCapex);
  const annualDataCenterCapex = annualizeQuarterly(row.dataCenterCapex);
  const capexIntensity = safeDivide(annualCapex, Math.max(annualRevenue, 1));
  const aiCapexIntensity = safeDivide(annualAiCapex, Math.max(annualRevenue, 1));
  const aiCapexMix = safeDivide(annualAiCapex, Math.max(annualCapex, 1));
  const aiInfrastructureBurden = annualAiCapex * assumptions.aiCapexGrowth + annualGpuCapex * 0.18 + annualDataCenterCapex * 0.12;
  const aiAdjustedFcf = annualFcf + aiAfterTaxOperatingProfitAnnual - aiInfrastructureBurden;
  const aiAdjustedFcfMargin = safeDivide(aiAdjustedFcf, Math.max(annualRevenue, 1));
  const burdenScore = clamp(
    60
      + (aiAdjustedFcfMargin - assumptions.fcfMargin) * 220
      - aiCapexIntensity * 85
      - Math.max(0, assumptions.aiCapexGrowth - assumptions.revenueGrowth) * 70,
    0,
    100,
  );

  return {
    annualRevenue,
    annualFcf,
    annualCapex,
    annualAiCapex,
    annualGpuCapex,
    annualDataCenterCapex,
    capexIntensity,
    aiCapexIntensity,
    aiCapexMix,
    fcfMargin: row.fcfMargin,
    aiInfrastructureBurden,
    aiAdjustedFcf,
    aiAdjustedFcfMargin,
    burdenScore,
  };
}
