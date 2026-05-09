import type { PeriodOption } from "../types";

export type GooglRow = {
  periodId: string;
  label: string;
  isForecast: boolean;
  totalRevenue: number;
  operatingMargin: number;
  searchRevenue: number;
  searchGrowth: number;
  searchQueryGrowth: number;
  revenuePerQueryIndex: number;
  cpcTrend: number;
  aiOverviewsUsage: number;
  aiModeAdoption: number;
  searchMarginBase: number;
  youtubeRevenue: number;
  youtubeGrowth: number;
  cloudRevenue: number;
  cloudGrowth: number;
  cloudOperatingMargin: number;
  cloudBacklog: number;
  backlogConversionRate: number;
  aiContributionToCloudGrowth: number;
  aiInfrastructureMix: number;
  computeCapacityConstraint: number;
  tpuUtilization: number;
  tpuCostPerTokenIndex: number;
  tpuCostAdvantageVsNvidia: number;
  tpuEnergyEfficiency: number;
  tpuDepreciation: number;
  tpuCapex: number;
  aiAnnualRevenue: number;
  aiOperatingMarginBase: number;
  geminiPaidUsers: number;
  geminiEnterpriseGrowth: number;
  aiTokenThroughput: number;
  aiSubscriptionRevenue: number;
  aiAgentRevenue: number;
  otherBetsRevenue: number;
  otherBetsLoss: number;
  operatingCashFlow: number;
  fcf: number;
  totalCapex: number;
  depreciation: number;
  sharesOutstanding: number;
  wacc: number;
};

export type GooglData = {
  periods: PeriodOption[];
  rows: GooglRow[];
  currentPeriodId: string;
  annualCapexGuidanceLow: number;
  annualCapexGuidanceHigh: number;
  currentPrice: number;
  currency: "USD";
};

export const googlData: GooglData = {
  currentPrice: 400.8,
  currency: "USD",
  periods: [
    { value: "Q2 2025", label: "Q2 2025" },
    { value: "Q3 2025", label: "Q3 2025" },
    { value: "Q4 2025", label: "Q4 2025" },
    { value: "Q1 2026", label: "Q1 2026" },
    { value: "Q2 2026E", label: "Q2 2026E" },
    { value: "Q3 2026E", label: "Q3 2026E" },
  ],
  currentPeriodId: "Q1 2026",
  annualCapexGuidanceLow: 175,
  annualCapexGuidanceHigh: 185,
  rows: [
    { periodId: "Q2 2025", label: "Q2 2025", isForecast: false, totalRevenue: 92.1, operatingMargin: 0.34, searchRevenue: 50.8, searchGrowth: 0.14, searchQueryGrowth: 0.16, revenuePerQueryIndex: 0.98, cpcTrend: -0.01, aiOverviewsUsage: 0.28, aiModeAdoption: 0.03, searchMarginBase: 0.4, youtubeRevenue: 12.1, youtubeGrowth: 0.1, cloudRevenue: 13.6, cloudGrowth: 0.31, cloudOperatingMargin: 0.18, cloudBacklog: 165, backlogConversionRate: 0.42, aiContributionToCloudGrowth: 0.14, aiInfrastructureMix: 0.63, computeCapacityConstraint: 0.72, tpuUtilization: 0.5, tpuCostPerTokenIndex: 1, tpuCostAdvantageVsNvidia: 0.08, tpuEnergyEfficiency: 0.07, tpuDepreciation: 4.2, tpuCapex: 16.5, aiAnnualRevenue: 8.5, aiOperatingMarginBase: 0.11, geminiPaidUsers: 5.5, geminiEnterpriseGrowth: 0.22, aiTokenThroughput: 5.2, aiSubscriptionRevenue: 0.9, aiAgentRevenue: 0.15, otherBetsRevenue: 0.42, otherBetsLoss: 1.4, operatingCashFlow: 36.4, fcf: 18.2, totalCapex: 18.2, depreciation: 5.6, sharesOutstanding: 12.2, wacc: 0.085 },
    { periodId: "Q3 2025", label: "Q3 2025", isForecast: false, totalRevenue: 98.4, operatingMargin: 0.347, searchRevenue: 55.4, searchGrowth: 0.15, searchQueryGrowth: 0.18, revenuePerQueryIndex: 0.99, cpcTrend: -0.005, aiOverviewsUsage: 0.39, aiModeAdoption: 0.06, searchMarginBase: 0.405, youtubeRevenue: 12.9, youtubeGrowth: 0.11, cloudRevenue: 15.1, cloudGrowth: 0.36, cloudOperatingMargin: 0.235, cloudBacklog: 190, backlogConversionRate: 0.46, aiContributionToCloudGrowth: 0.18, aiInfrastructureMix: 0.61, computeCapacityConstraint: 0.7, tpuUtilization: 0.57, tpuCostPerTokenIndex: 0.92, tpuCostAdvantageVsNvidia: 0.11, tpuEnergyEfficiency: 0.1, tpuDepreciation: 4.9, tpuCapex: 19.6, aiAnnualRevenue: 11.3, aiOperatingMarginBase: 0.13, geminiPaidUsers: 7.2, geminiEnterpriseGrowth: 0.28, aiTokenThroughput: 7.1, aiSubscriptionRevenue: 1.2, aiAgentRevenue: 0.22, otherBetsRevenue: 0.44, otherBetsLoss: 1.5, operatingCashFlow: 39.2, fcf: 19.4, totalCapex: 19.8, depreciation: 6.2, sharesOutstanding: 12.15, wacc: 0.085 },
    { periodId: "Q4 2025", label: "Q4 2025", isForecast: false, totalRevenue: 113.8, operatingMargin: 0.316, searchRevenue: 63.1, searchGrowth: 0.17, searchQueryGrowth: 0.2, revenuePerQueryIndex: 1, cpcTrend: 0, aiOverviewsUsage: 0.51, aiModeAdoption: 0.09, searchMarginBase: 0.412, youtubeRevenue: 13.6, youtubeGrowth: 0.09, cloudRevenue: 17.7, cloudGrowth: 0.48, cloudOperatingMargin: 0.301, cloudBacklog: 240, backlogConversionRate: 0.5, aiContributionToCloudGrowth: 0.23, aiInfrastructureMix: 0.58, computeCapacityConstraint: 0.68, tpuUtilization: 0.64, tpuCostPerTokenIndex: 0.84, tpuCostAdvantageVsNvidia: 0.14, tpuEnergyEfficiency: 0.13, tpuDepreciation: 5.8, tpuCapex: 22.5, aiAnnualRevenue: 15.2, aiOperatingMarginBase: 0.16, geminiPaidUsers: 8, geminiEnterpriseGrowth: 0.32, aiTokenThroughput: 10, aiSubscriptionRevenue: 1.7, aiAgentRevenue: 0.36, otherBetsRevenue: 0.37, otherBetsLoss: 3.6, operatingCashFlow: 52.4, fcf: 24.6, totalCapex: 27.9, depreciation: 6.9, sharesOutstanding: 12.05, wacc: 0.085 },
    { periodId: "Q1 2026", label: "Q1 2026", isForecast: false, totalRevenue: 109.9, operatingMargin: 0.361, searchRevenue: 69.3, searchGrowth: 0.19, searchQueryGrowth: 0.22, revenuePerQueryIndex: 1.01, cpcTrend: 0.002, aiOverviewsUsage: 0.59, aiModeAdoption: 0.13, searchMarginBase: 0.417, youtubeRevenue: 14.2, youtubeGrowth: 0.12, cloudRevenue: 20, cloudGrowth: 0.63, cloudOperatingMargin: 0.329, cloudBacklog: 462, backlogConversionRate: 0.54, aiContributionToCloudGrowth: 0.28, aiInfrastructureMix: 0.55, computeCapacityConstraint: 0.65, tpuUtilization: 0.7, tpuCostPerTokenIndex: 0.72, tpuCostAdvantageVsNvidia: 0.18, tpuEnergyEfficiency: 0.16, tpuDepreciation: 6.7, tpuCapex: 46.5, aiAnnualRevenue: 24.5, aiOperatingMarginBase: 0.2, geminiPaidUsers: 12, geminiEnterpriseGrowth: 0.4, aiTokenThroughput: 16, aiSubscriptionRevenue: 2.8, aiAgentRevenue: 0.55, otherBetsRevenue: 0.45, otherBetsLoss: 1.7, operatingCashFlow: 49.8, fcf: 23.6, totalCapex: 45.9, depreciation: 7.8, sharesOutstanding: 12, wacc: 0.085 },
    { periodId: "Q2 2026E", label: "Q2 2026E", isForecast: true, totalRevenue: 117.4, operatingMargin: 0.365, searchRevenue: 72.8, searchGrowth: 0.17, searchQueryGrowth: 0.23, revenuePerQueryIndex: 1.01, cpcTrend: 0.003, aiOverviewsUsage: 0.64, aiModeAdoption: 0.17, searchMarginBase: 0.418, youtubeRevenue: 15.1, youtubeGrowth: 0.12, cloudRevenue: 22.4, cloudGrowth: 0.54, cloudOperatingMargin: 0.337, cloudBacklog: 490, backlogConversionRate: 0.56, aiContributionToCloudGrowth: 0.3, aiInfrastructureMix: 0.54, computeCapacityConstraint: 0.58, tpuUtilization: 0.75, tpuCostPerTokenIndex: 0.66, tpuCostAdvantageVsNvidia: 0.21, tpuEnergyEfficiency: 0.18, tpuDepreciation: 7.3, tpuCapex: 47.2, aiAnnualRevenue: 30.2, aiOperatingMarginBase: 0.22, geminiPaidUsers: 14.5, geminiEnterpriseGrowth: 0.34, aiTokenThroughput: 18.5, aiSubscriptionRevenue: 3.5, aiAgentRevenue: 0.76, otherBetsRevenue: 0.49, otherBetsLoss: 1.6, operatingCashFlow: 54.1, fcf: 26.3, totalCapex: 46.8, depreciation: 8.5, sharesOutstanding: 11.95, wacc: 0.085 },
    { periodId: "Q3 2026E", label: "Q3 2026E", isForecast: true, totalRevenue: 123.9, operatingMargin: 0.372, searchRevenue: 76.1, searchGrowth: 0.16, searchQueryGrowth: 0.24, revenuePerQueryIndex: 1.015, cpcTrend: 0.005, aiOverviewsUsage: 0.69, aiModeAdoption: 0.21, searchMarginBase: 0.421, youtubeRevenue: 15.8, youtubeGrowth: 0.13, cloudRevenue: 24.7, cloudGrowth: 0.46, cloudOperatingMargin: 0.347, cloudBacklog: 520, backlogConversionRate: 0.58, aiContributionToCloudGrowth: 0.31, aiInfrastructureMix: 0.52, computeCapacityConstraint: 0.51, tpuUtilization: 0.8, tpuCostPerTokenIndex: 0.61, tpuCostAdvantageVsNvidia: 0.24, tpuEnergyEfficiency: 0.2, tpuDepreciation: 8, tpuCapex: 46.2, aiAnnualRevenue: 36.5, aiOperatingMarginBase: 0.24, geminiPaidUsers: 17.4, geminiEnterpriseGrowth: 0.28, aiTokenThroughput: 21.5, aiSubscriptionRevenue: 4.3, aiAgentRevenue: 1.05, otherBetsRevenue: 0.54, otherBetsLoss: 1.5, operatingCashFlow: 57.8, fcf: 28.6, totalCapex: 46.5, depreciation: 9.2, sharesOutstanding: 11.9, wacc: 0.085 },
  ],
};
