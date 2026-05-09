import type { PeriodOption } from "../types";

export type MsftPeriodRow = {
  periodId: string;
  label: string;
  isForecast: boolean;
  totalRevenue: number;
  cloudRevenue: number;
  cloudRevenueGrowth: number;
  azureGrowth: number;
  aiContributionToAzureGrowth: number;
  cloudGrossMargin: number;
  azureGrossMargin: number;
  operatingMargin: number;
  depreciationRevenue: number;
  costRevenueGrowth: number;
  aiAnnualRunRate: number;
  aiAnnualRevenueGrowth: number;
  totalCapex: number;
  aiCapex: number;
  powerCoolingCost: number;
  networkingCost: number;
  aiDepreciation: number;
  aiInvestedCapital: number;
  aiGrossMarginBase: number;
  copilotGrossMarginBase: number;
  copilotSeats: number;
  commercialRpo: number;
  copilotRevenue: number;
  githubCopilotRevenue: number;
  copilotStudioRevenue: number;
  aiAgentRevenue: number;
  openAiServicesRevenue: number;
  azureAiComputeRevenue: number;
  traditionalAzureRevenue: number;
  aiAzureRevenue: number;
  copilotStudioUsage: number;
  agentCreations: number;
  enterpriseWorkflowAdoption: number;
  operatingCashFlow: number;
  fcf: number;
  sbc: number;
  coreRoic: number;
  blendedRoic: number;
  sharesOutstanding: number;
  wacc: number;
};

export type MsftData = {
  periods: PeriodOption[];
  rows: MsftPeriodRow[];
  currentPeriodId: string;
  cloudMarginGuideNextQuarter: number;
  dividendYield: number;
};

export const msftData: MsftData = {
  periods: [
    { value: "FY23", label: "FY23" },
    { value: "FY24", label: "FY24" },
    { value: "FY25", label: "FY25 LTM" },
    { value: "FY26E", label: "FY26E" },
    { value: "FY27E", label: "FY27E" },
  ],
  currentPeriodId: "FY25",
  cloudMarginGuideNextQuarter: 0.64,
  dividendYield: 0.008,
  rows: [
    { periodId: "FY23", label: "FY23", isForecast: false, totalRevenue: 212, cloudRevenue: 44, cloudRevenueGrowth: 0.19, azureGrowth: 0.27, aiContributionToAzureGrowth: 0.06, cloudGrossMargin: 0.69, azureGrossMargin: 0.72, operatingMargin: 0.43, depreciationRevenue: 0.1, costRevenueGrowth: 0.19, aiAnnualRunRate: 4.2, aiAnnualRevenueGrowth: 0.88, totalCapex: 29, aiCapex: 12, powerCoolingCost: 1.1, networkingCost: 0.8, aiDepreciation: 3.2, aiInvestedCapital: 26, aiGrossMarginBase: 0.33, copilotGrossMarginBase: 0.61, copilotSeats: 1.5, commercialRpo: 440, copilotRevenue: 0.2, githubCopilotRevenue: 0.15, copilotStudioRevenue: 0.04, aiAgentRevenue: 0.01, openAiServicesRevenue: 0.45, azureAiComputeRevenue: 1.3, traditionalAzureRevenue: 23, aiAzureRevenue: 1.8, copilotStudioUsage: 0.12, agentCreations: 0.03, enterpriseWorkflowAdoption: 0.04, operatingCashFlow: 88, fcf: 63, sbc: 9.6, coreRoic: 0.31, blendedRoic: 0.27, sharesOutstanding: 7.48, wacc: 0.085 },
    { periodId: "FY24", label: "FY24", isForecast: false, totalRevenue: 236, cloudRevenue: 49.5, cloudRevenueGrowth: 0.18, azureGrowth: 0.31, aiContributionToAzureGrowth: 0.1, cloudGrossMargin: 0.68, azureGrossMargin: 0.7, operatingMargin: 0.44, depreciationRevenue: 0.115, costRevenueGrowth: 0.21, aiAnnualRunRate: 7.8, aiAnnualRevenueGrowth: 0.86, totalCapex: 44, aiCapex: 21, powerCoolingCost: 1.8, networkingCost: 1.2, aiDepreciation: 5.1, aiInvestedCapital: 46, aiGrossMarginBase: 0.31, copilotGrossMarginBase: 0.64, copilotSeats: 8, commercialRpo: 510, copilotRevenue: 0.9, githubCopilotRevenue: 0.38, copilotStudioRevenue: 0.12, aiAgentRevenue: 0.06, openAiServicesRevenue: 1.1, azureAiComputeRevenue: 3, traditionalAzureRevenue: 27.8, aiAzureRevenue: 4.1, copilotStudioUsage: 0.42, agentCreations: 0.16, enterpriseWorkflowAdoption: 0.11, operatingCashFlow: 103, fcf: 68, sbc: 10.2, coreRoic: 0.3, blendedRoic: 0.26, sharesOutstanding: 7.43, wacc: 0.085 },
    { periodId: "FY25", label: "FY25 LTM", isForecast: false, totalRevenue: 262, cloudRevenue: 54.5, cloudRevenueGrowth: 0.17, azureGrowth: 0.4, aiContributionToAzureGrowth: 0.16, cloudGrossMargin: 0.66, azureGrossMargin: 0.67, operatingMargin: 0.438, depreciationRevenue: 0.132, costRevenueGrowth: 0.27, aiAnnualRunRate: 17.4, aiAnnualRevenueGrowth: 1.23, totalCapex: 61, aiCapex: 38, powerCoolingCost: 3.1, networkingCost: 2.1, aiDepreciation: 8.9, aiInvestedCapital: 78, aiGrossMarginBase: 0.29, copilotGrossMarginBase: 0.68, copilotSeats: 20, commercialRpo: 627, copilotRevenue: 2.7, githubCopilotRevenue: 0.72, copilotStudioRevenue: 0.28, aiAgentRevenue: 0.18, openAiServicesRevenue: 2.6, azureAiComputeRevenue: 7.5, traditionalAzureRevenue: 31.5, aiAzureRevenue: 10.1, copilotStudioUsage: 1.1, agentCreations: 0.55, enterpriseWorkflowAdoption: 0.24, operatingCashFlow: 121, fcf: 71, sbc: 10.8, coreRoic: 0.29, blendedRoic: 0.24, sharesOutstanding: 7.39, wacc: 0.085 },
    { periodId: "FY26E", label: "FY26E", isForecast: true, totalRevenue: 286, cloudRevenue: 61.2, cloudRevenueGrowth: 0.16, azureGrowth: 0.36, aiContributionToAzureGrowth: 0.18, cloudGrossMargin: 0.655, azureGrossMargin: 0.668, operatingMargin: 0.442, depreciationRevenue: 0.138, costRevenueGrowth: 0.18, aiAnnualRunRate: 25.8, aiAnnualRevenueGrowth: 0.74, totalCapex: 66, aiCapex: 42, powerCoolingCost: 3.4, networkingCost: 2.3, aiDepreciation: 11.9, aiInvestedCapital: 109, aiGrossMarginBase: 0.31, copilotGrossMarginBase: 0.72, copilotSeats: 33, commercialRpo: 690, copilotRevenue: 5, githubCopilotRevenue: 1.15, copilotStudioRevenue: 0.65, aiAgentRevenue: 0.55, openAiServicesRevenue: 3.8, azureAiComputeRevenue: 11.2, traditionalAzureRevenue: 35.1, aiAzureRevenue: 15, copilotStudioUsage: 2.4, agentCreations: 1.6, enterpriseWorkflowAdoption: 0.36, operatingCashFlow: 135, fcf: 79, sbc: 11.2, coreRoic: 0.295, blendedRoic: 0.247, sharesOutstanding: 7.35, wacc: 0.085 },
    { periodId: "FY27E", label: "FY27E", isForecast: true, totalRevenue: 314, cloudRevenue: 68.8, cloudRevenueGrowth: 0.15, azureGrowth: 0.33, aiContributionToAzureGrowth: 0.19, cloudGrossMargin: 0.662, azureGrossMargin: 0.675, operatingMargin: 0.45, depreciationRevenue: 0.136, costRevenueGrowth: 0.13, aiAnnualRunRate: 34.7, aiAnnualRevenueGrowth: 0.49, totalCapex: 68, aiCapex: 43, powerCoolingCost: 3.5, networkingCost: 2.4, aiDepreciation: 13.6, aiInvestedCapital: 134, aiGrossMarginBase: 0.34, copilotGrossMarginBase: 0.75, copilotSeats: 48, commercialRpo: 760, copilotRevenue: 7.8, githubCopilotRevenue: 1.6, copilotStudioRevenue: 1.2, aiAgentRevenue: 1.1, openAiServicesRevenue: 4.9, azureAiComputeRevenue: 15.1, traditionalAzureRevenue: 38.5, aiAzureRevenue: 20, copilotStudioUsage: 4.1, agentCreations: 3.4, enterpriseWorkflowAdoption: 0.49, operatingCashFlow: 151, fcf: 91, sbc: 11.6, coreRoic: 0.3, blendedRoic: 0.255, sharesOutstanding: 7.31, wacc: 0.085 },
  ],
};
