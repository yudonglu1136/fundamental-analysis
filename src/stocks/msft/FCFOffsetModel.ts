import type { MsftAssumptions } from "./assumptions";
import type { MsftRealData } from "./realData";
import type { AiCostModelResult } from "./AICostModel";
import type { AiRoicModelResult } from "./AIROICModel";
import type { CloudMarginModelResult } from "./CloudMarginModel";

export type FcfOffsetYear = {
  year: string;
  coreFcf: number;
  incrementalAiCapex: number;
  incrementalAiOperatingProfit: number;
  aiAdjustedFcf: number;
  fcfMargin: number;
  aiAdjustedFcfMargin: number;
  capexIntensity: number;
  aiDepreciationBurden: number;
};

export type FcfOffsetModelResult = {
  years: FcfOffsetYear[];
  current: FcfOffsetYear;
  bridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
};

export function buildFcfOffsetModel(assumptions: MsftAssumptions, realData: MsftRealData, cost: AiCostModelResult, roic: AiRoicModelResult, cloud: CloudMarginModelResult): FcfOffsetModelResult {
  const years = roic.years.map((year, index) => {
    const revenue = realData.actual.quarterlyRevenue * 4 * (1 + 0.09 + assumptions.aiRevenueCagr * 0.08) ** index;
    const coreFcf = revenue * assumptions.fcfMargin;
    const incrementalAiCapex = realData.actual.quarterlyCapex * 4 * 0.72 * (1 + assumptions.aiCapexGrowth) ** index;
    const incrementalAiOperatingProfit = cost.years[index].aiOperatingProfit;
    const incrementalAiInvestmentDrag =
      cost.years[index].gpuDepreciation +
      cost.years[index].dataCenterDepreciation +
      cost.years[index].powerCooling +
      cost.years[index].networking -
      Math.max(incrementalAiOperatingProfit, 0);
    const aiAdjustedFcf = coreFcf - Math.max(incrementalAiInvestmentDrag, 0);
    const fcfMargin = coreFcf / revenue;
    const aiAdjustedFcfMargin = aiAdjustedFcf / revenue;
    const capexIntensity = incrementalAiCapex / revenue;
    const aiDepreciationBurden = (cost.years[index].gpuDepreciation + cost.years[index].dataCenterDepreciation) / revenue;
    return {
      year: year.year,
      coreFcf,
      incrementalAiCapex,
      incrementalAiOperatingProfit,
      aiAdjustedFcf,
      fcfMargin,
      aiAdjustedFcfMargin,
      capexIntensity,
      aiDepreciationBurden,
    };
  });
  return {
    years,
    current: years[0],
    bridge: [
      { label: "Core FCF", value: years[0].coreFcf, type: "base" },
      { label: "AI investment drag", value: -(years[0].coreFcf - years[0].aiAdjustedFcf), type: "negative" },
      { label: "Incremental AI operating profit", value: years[0].incrementalAiOperatingProfit, type: years[0].incrementalAiOperatingProfit >= 0 ? "positive" : "negative" },
      { label: "AI-adjusted FCF", value: years[0].aiAdjustedFcf, type: "total" },
    ],
  };
}
