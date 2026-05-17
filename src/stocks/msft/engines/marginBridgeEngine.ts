import type { MsftDataset, MsftValuationAssumptions } from "../model";
import { clamp } from "./helpers";

export function calculateMsftMarginBridgeEngine(data: MsftDataset, assumptions: MsftValuationAssumptions) {
  const fy25Cloud = data.cloudMetrics.find((item) => item.periodId === "fy25") ?? data.cloudMetrics[0];
  const q3Cloud = data.cloudMetrics.find((item) => item.periodId === "q3-fy26") ?? data.cloudMetrics[data.cloudMetrics.length - 1];
  const q4Guide = data.aiDisclosures.find((item) => item.id === "cloud-gm-q4-guide")?.metric ?? 0.64;

  const startingCloudMargin = fy25Cloud.microsoftCloudGrossMargin;
  const aiInfrastructureDrag = -0.041 - (assumptions.aiCapexIntensity - 0.25) * 0.18;
  const aiProductUsageDrag = -0.010 - (1 - assumptions.copilotGrossMarginYear5) * 0.012;
  const azureEfficiencyOffset = 0.015 + Math.max(assumptions.azureGrowth - 0.30, -0.08) * 0.06;
  const m365EfficiencyOffset = 0.006 + Math.max(assumptions.copilotPenetration - 0.25, 0) * 0.015;
  const scenarioCloudMargin = clamp(
    startingCloudMargin + aiInfrastructureDrag + aiProductUsageDrag + azureEfficiencyOffset + m365EfficiencyOffset,
    0.58,
    0.74,
  );

  const operatingMarginBridge = [
    { label: "FY2025 operating margin", value: 0.456, type: "base" as const },
    { label: "AI infra and depreciation", value: -Math.max(assumptions.aiCapexIntensity - 0.16, 0) * 0.35, type: "negative" as const },
    { label: "Copilot / M365 ARPU", value: assumptions.copilotPenetration * 0.035, type: "positive" as const },
    { label: "Azure efficiency", value: Math.max(assumptions.azureGrowth - 0.24, 0) * 0.09, type: "positive" as const },
    { label: "OpenAI / GitHub usage cost", value: -(1 - assumptions.openAiGrossMargin) * assumptions.openAiRevenueContribution * 0.35, type: "negative" as const },
    { label: "Scenario operating margin", value: assumptions.operatingMargin, type: "total" as const },
  ];

  return {
    startingCloudMargin,
    q3CloudMargin: q3Cloud.microsoftCloudGrossMargin,
    q4CloudMarginGuidance: q4Guide,
    scenarioCloudMargin,
    bridge: [
      { label: "FY2025 Microsoft Cloud GM", value: startingCloudMargin, type: "base" as const },
      { label: "AI infrastructure / GPU depreciation", value: aiInfrastructureDrag, type: "negative" as const },
      { label: "AI product usage / inference", value: aiProductUsageDrag, type: "negative" as const },
      { label: "Azure efficiency", value: azureEfficiencyOffset, type: "positive" as const },
      { label: "M365 efficiency / Copilot pricing", value: m365EfficiencyOffset, type: "positive" as const },
      { label: "Scenario cloud GM", value: scenarioCloudMargin, type: "total" as const },
    ],
    operatingMarginBridge,
    warning:
      q4Guide < q3Cloud.microsoftCloudGrossMargin
        ? "Q4 Microsoft Cloud GM guide steps down to roughly 64%, so near-term margin lift should not be underwritten too early."
        : "Cloud GM guide is stable.",
  };
}
