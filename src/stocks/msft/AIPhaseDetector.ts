import type { Signal } from "../types";
import type { MsftAssumptions } from "./assumptions";
import type { AiRevenueModelResult } from "./AIRevenueModel";
import type { AiRoicModelResult } from "./AIROICModel";
import type { CloudMarginModelResult } from "./CloudMarginModel";
import type { FcfOffsetModelResult } from "./FCFOffsetModel";

export type AiPhaseResult = {
  phase: "AI investment phase" | "AI margin dilution phase" | "AI payback inflecting" | "AI monetization scaling" | "AI ROIC expansion phase";
  signal: Signal;
  detail: string;
};

export function detectAiPhase(assumptions: MsftAssumptions, revenue: AiRevenueModelResult, roic: AiRoicModelResult, cloud: CloudMarginModelResult, fcf: FcfOffsetModelResult): AiPhaseResult {
  const aiRevenueGrowth = assumptions.aiRevenueCagr;
  const aiCapexGrowth = assumptions.aiCapexGrowth;
  const currentCloud = cloud.current.currentCloudMargin;
  const nextCloud = cloud.years[1]?.currentCloudMargin ?? currentCloud;
  const roicSpread = roic.current.blendedAiRoic - assumptions.wacc;
  const fcfImproving = (fcf.years[1]?.aiAdjustedFcfMargin ?? fcf.current.aiAdjustedFcfMargin) >= fcf.current.aiAdjustedFcfMargin;
  const copilotMaterial = revenue.years[0].m365Copilot >= 5 || assumptions.copilotAdoption >= 0.18;

  if (roicSpread > 0.03 && fcfImproving) {
    return {
      phase: "AI ROIC expansion phase",
      signal: "Positive",
      detail: "AI ROIC is now more than 300bps above WACC and improving FCF conversion suggests the model is turning into a value-creating software and agent platform.",
    };
  }
  if (copilotMaterial && revenue.years[0].copilotStudioAgents >= 1) {
    return {
      phase: "AI monetization scaling",
      signal: "Positive",
      detail: "Copilot and agent monetization are becoming material enough to shift the AI mix toward higher-margin software economics.",
    };
  }
  if (aiRevenueGrowth > aiCapexGrowth && nextCloud >= currentCloud) {
    return {
      phase: "AI payback inflecting",
      signal: "Inflecting",
      detail: "AI revenue growth is outpacing AI CapEx growth and cloud margins are stabilizing, suggesting the payback curve is turning.",
    };
  }
  if (aiCapexGrowth > aiRevenueGrowth && nextCloud < currentCloud) {
    return {
      phase: "AI investment phase",
      signal: "Negative",
      detail: "CapEx is still running ahead of monetization and cloud margins are under pressure.",
    };
  }
  return {
    phase: "AI margin dilution phase",
    signal: "Neutral",
    detail: "AI demand is real, but infrastructure and usage costs are still diluting margins faster than software mix can offset.",
  };
}
