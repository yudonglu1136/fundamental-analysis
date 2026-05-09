import type { MsftAssumptions } from "./assumptions";
import type { MsftRealData } from "./realData";
import type { AiRevenueModelResult } from "./AIRevenueModel";
import type { AiCostModelResult } from "./AICostModel";

export type AiRoicYear = {
  year: string;
  infrastructureCapital: number;
  gpuClusters: number;
  aiNetworking: number;
  aiDataCenters: number;
  totalAiInvestedCapital: number;
  afterTaxOperatingProfit: number;
  infrastructureAiRoic: number;
  blendedAiRoic: number;
  softwareAiRoic: number;
};

export type AiRoicModelResult = {
  years: AiRoicYear[];
  current: AiRoicYear;
};

export function buildAiRoicModel(assumptions: MsftAssumptions, realData: MsftRealData, revenue: AiRevenueModelResult, cost: AiCostModelResult): AiRoicModelResult {
  const years = revenue.years.map((year, index) => {
    const capexBase = realData.actual.quarterlyCapex * 4 * 0.72 * (1 + assumptions.aiCapexGrowth) ** index;
    const infrastructureCapital = capexBase;
    const gpuClusters = capexBase * 0.42;
    const aiNetworking = capexBase * 0.18;
    const aiDataCenters = capexBase * 0.4;
    const totalAiInvestedCapital = capexBase;
    const afterTaxOperatingProfit = cost.years[index].aiOperatingProfit * (1 - assumptions.taxRate);
    const infrastructureAiRoic = afterTaxOperatingProfit / Math.max(gpuClusters + aiNetworking + aiDataCenters, 1);
    const softwareRevenue = year.m365Copilot + year.githubCopilot + year.copilotStudioAgents;
    const softwareCapital = totalAiInvestedCapital * 0.18;
    const softwareAiRoic = (softwareRevenue * 0.38 * (1 - assumptions.taxRate)) / Math.max(softwareCapital, 1);
    const blendedAiRoic = afterTaxOperatingProfit / Math.max(totalAiInvestedCapital, 1);
    return {
      year: year.year,
      infrastructureCapital,
      gpuClusters,
      aiNetworking,
      aiDataCenters,
      totalAiInvestedCapital,
      afterTaxOperatingProfit,
      infrastructureAiRoic,
      blendedAiRoic,
      softwareAiRoic,
    };
  });
  return { years, current: years[0] };
}
