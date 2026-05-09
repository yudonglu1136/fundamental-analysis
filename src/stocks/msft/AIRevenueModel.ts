import type { MsftAssumptions } from "./assumptions";
import type { MsftRealData } from "./realData";

export type AiRevenueYear = {
  year: string;
  traditionalAzure: number;
  azureAiCompute: number;
  azureOpenAi: number;
  m365Copilot: number;
  githubCopilot: number;
  copilotStudioAgents: number;
  totalAiRevenue: number;
};

export type AiRevenueModelResult = {
  currentAnnualizedRevenue: number;
  growthRate: number;
  years: AiRevenueYear[];
  mix: Array<{ name: string; value: number }>;
};

export function buildAiRevenueModel(assumptions: MsftAssumptions, realData: MsftRealData): AiRevenueModelResult {
  const baseAzureAi = 12.4;
  const baseOpenAi = 4.4;
  const baseCopilot = 3.5;
  const baseGithub = 0.9;
  const baseAgents = 0.6;
  const monetizationLift = 1 + (assumptions.aiMonetizationEfficiency - 0.58) * 0.8 + (assumptions.copilotAdoption - 0.18) * 0.9 - assumptions.aiPriceCompression * 0.5;
  const utilizationLift = 1 + (assumptions.aiUtilizationRate - 0.62) * 0.7;
  const priceCompressionDrag = 1 - assumptions.aiPriceCompression * 0.45;
  const annualGrowth = assumptions.aiRevenueCagr;

  const currentTraditionalAzure = Math.max(realData.actual.microsoftCloudRevenue * 4 - (baseAzureAi + baseOpenAi + baseCopilot + baseGithub + baseAgents), 0);
  const currentAzureAi = baseAzureAi * monetizationLift * utilizationLift;
  const currentOpenAi = baseOpenAi * monetizationLift;
  const currentCopilot = baseCopilot * (1 + assumptions.copilotAdoption * 1.2) * priceCompressionDrag;
  const currentGithub = baseGithub * (1 + assumptions.copilotSeatGrowth * 0.4);
  const currentAgents = baseAgents * (1 + assumptions.copilotStudioUsageGrowth * 0.5 + assumptions.agentPlatformGrowth * 0.35);

  const years: AiRevenueYear[] = Array.from({ length: 4 }, (_, index) => {
    const year = `FY${26 + index}`;
    const growth = (1 + annualGrowth) ** index;
    const traditionalAzure = currentTraditionalAzure * (1 + Math.max(realData.actual.azureGrowth - assumptions.aiRevenueCagr * 0.2, 0.08)) ** index;
    const azureAiCompute = currentAzureAi * growth;
    const azureOpenAi = currentOpenAi * (1 + annualGrowth * 0.9) ** index;
    const m365Copilot = currentCopilot * (1 + annualGrowth * 0.8 + assumptions.copilotAdoption * 0.4) ** index;
    const githubCopilot = currentGithub * (1 + annualGrowth * 0.55) ** index;
    const copilotStudioAgents = currentAgents * (1 + annualGrowth * 0.95 + assumptions.agentPlatformGrowth * 0.18) ** index;
    return {
      year,
      traditionalAzure,
      azureAiCompute,
      azureOpenAi,
      m365Copilot,
      githubCopilot,
      copilotStudioAgents,
      totalAiRevenue: azureAiCompute + azureOpenAi + m365Copilot + githubCopilot + copilotStudioAgents,
    };
  });

  const current = years[0];
  return {
    currentAnnualizedRevenue: current.totalAiRevenue,
    growthRate: annualGrowth,
    years,
    mix: [
      { name: "Azure AI compute", value: current.azureAiCompute },
      { name: "Azure OpenAI", value: current.azureOpenAi },
      { name: "M365 Copilot", value: current.m365Copilot },
      { name: "GitHub Copilot", value: current.githubCopilot },
      { name: "Copilot Studio / Agents", value: current.copilotStudioAgents },
    ],
  };
}
