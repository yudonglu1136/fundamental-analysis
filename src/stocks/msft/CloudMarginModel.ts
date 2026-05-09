import type { MsftAssumptions } from "./assumptions";
import type { MsftRealData } from "./realData";
import type { AiRevenueModelResult } from "./AIRevenueModel";
import type { AiCostModelResult } from "./AICostModel";
import type { AiRoicModelResult } from "./AIROICModel";

export type CloudMarginYear = {
  year: string;
  priorCloudMargin: number;
  aiInfrastructureDilution: number;
  aiProductUsageDilution: number;
  azureEfficiencyGains: number;
  m365EfficiencyGains: number;
  copilotSoftwareMixUplift: number;
  currentCloudMargin: number;
};

export type CloudMarginModelResult = {
  years: CloudMarginYear[];
  current: CloudMarginYear;
  bridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
};

export function buildCloudMarginModel(assumptions: MsftAssumptions, realData: MsftRealData, revenue: AiRevenueModelResult, cost: AiCostModelResult, roic: AiRoicModelResult): CloudMarginModelResult {
  const years = revenue.years.reduce<CloudMarginYear[]>((accumulator, year, index) => {
    const priorCloudMargin = index === 0
      ? realData.actual.microsoftCloudGrossMargin
      : accumulator[index - 1]?.currentCloudMargin ?? realData.actual.microsoftCloudGrossMargin;
    const aiInfrastructureDilution = Math.max(
      assumptions.aiInfrastructureCostLoad,
      (cost.years[index].gpuDepreciation + cost.years[index].dataCenterDepreciation) / (realData.actual.microsoftCloudRevenue * 4),
    );
    const aiProductUsageDilution = Math.max(
      assumptions.aiProductUsageCost,
      (cost.years[index].inferenceCost + cost.years[index].openAiModelCost) / (realData.actual.microsoftCloudRevenue * 4),
    );
    const azureEfficiencyGains = assumptions.azureEfficiencyGains + assumptions.aiUtilizationRate * 0.006;
    const m365EfficiencyGains = assumptions.m365EfficiencyGains;
    const copilotSoftwareMixUplift = assumptions.copilotAdoption * 0.018 + roic.years[index].softwareAiRoic * 0.015;
    const currentCloudMargin = Math.max(
      0.58,
      Math.min(
        0.72,
        priorCloudMargin - aiInfrastructureDilution - aiProductUsageDilution + azureEfficiencyGains + m365EfficiencyGains + copilotSoftwareMixUplift,
      ),
    );
    accumulator.push({
      year: year.year,
      priorCloudMargin,
      aiInfrastructureDilution,
      aiProductUsageDilution,
      azureEfficiencyGains,
      m365EfficiencyGains,
      copilotSoftwareMixUplift,
      currentCloudMargin,
    });
    return accumulator;
  }, []);

  if (years.length === 0) {
    console.warn("buildCloudMarginModel produced no years; using fallback margin row.");
    const fallback: CloudMarginYear = {
      year: "Current",
      priorCloudMargin: realData.actual.microsoftCloudGrossMargin,
      aiInfrastructureDilution: 0,
      aiProductUsageDilution: 0,
      azureEfficiencyGains: 0,
      m365EfficiencyGains: 0,
      copilotSoftwareMixUplift: 0,
      currentCloudMargin: realData.actual.microsoftCloudGrossMargin,
    };
    return {
      years: [fallback],
      current: fallback,
      bridge: [
        { label: "Prior cloud margin", value: fallback.priorCloudMargin, type: "base" },
        { label: "Current cloud margin", value: fallback.currentCloudMargin, type: "total" },
      ],
    };
  }

  return {
    years,
    current: years[0],
    bridge: [
      { label: "Prior cloud margin", value: realData.actual.microsoftCloudGrossMargin, type: "base" },
      { label: "AI infrastructure dilution", value: -years[0].aiInfrastructureDilution, type: "negative" },
      { label: "AI product usage dilution", value: -years[0].aiProductUsageDilution, type: "negative" },
      { label: "Azure efficiency gains", value: years[0].azureEfficiencyGains, type: "positive" },
      { label: "M365 efficiency gains", value: years[0].m365EfficiencyGains, type: "positive" },
      { label: "Copilot software mix uplift", value: years[0].copilotSoftwareMixUplift, type: "positive" },
      { label: "Current cloud margin", value: years[0].currentCloudMargin, type: "total" },
    ],
  };
}
