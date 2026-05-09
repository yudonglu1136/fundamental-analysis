import type { MsftAssumptions } from "./assumptions";
import type { MsftRealData } from "./realData";
import type { AiRevenueModelResult } from "./AIRevenueModel";

export type AiCostYear = {
  year: string;
  gpuDepreciation: number;
  dataCenterDepreciation: number;
  powerCooling: number;
  networking: number;
  inferenceCost: number;
  openAiModelCost: number;
  aiSupportAndRd: number;
  totalAiCost: number;
  aiGrossProfit: number;
  aiOperatingProfit: number;
};

export type AiCostModelResult = {
  years: AiCostYear[];
  current: AiCostYear;
};

export function buildAiCostModel(assumptions: MsftAssumptions, realData: MsftRealData, revenue: AiRevenueModelResult): AiCostModelResult {
  const baseInfrastructure = realData.actual.quarterlyCapex * 4 * 0.7;
  const years = revenue.years.map((year, index) => {
    const capexBase = baseInfrastructure * (1 + assumptions.aiCapexGrowth) ** index;
    const gpuDepreciation = capexBase * assumptions.depreciationSchedule * 0.34;
    const dataCenterDepreciation = capexBase * assumptions.depreciationSchedule * 0.26;
    const powerCooling = capexBase * assumptions.powerCoolingCostPct * (1 - assumptions.powerEfficiency);
    const networking = capexBase * assumptions.networkingCostPct;
    const inferenceCost = year.totalAiRevenue * (0.22 - assumptions.inferenceCostEfficiency * 0.1) * (1 - assumptions.aiUtilizationRate * 0.12);
    const openAiModelCost = year.azureOpenAi * 0.24 * (1 - assumptions.inferenceCostEfficiency * 0.25);
    const aiSupportAndRd = year.totalAiRevenue * 0.14;
    const totalAiCost = gpuDepreciation + dataCenterDepreciation + powerCooling + networking + inferenceCost + openAiModelCost + aiSupportAndRd;
    const aiGrossProfit = year.totalAiRevenue - (inferenceCost + openAiModelCost + powerCooling + networking);
    const aiOperatingProfit = year.totalAiRevenue - totalAiCost;
    return {
      year: year.year,
      gpuDepreciation,
      dataCenterDepreciation,
      powerCooling,
      networking,
      inferenceCost,
      openAiModelCost,
      aiSupportAndRd,
      totalAiCost,
      aiGrossProfit,
      aiOperatingProfit,
    };
  });
  return {
    years,
    current: years[0],
  };
}
