import type { PeriodOption } from "../types";

export type MetaQuarterRow = {
  periodId: string;
  label: string;
  isForecast: boolean;
  totalRevenue: number;
  familyAppsRevenue: number;
  adRevenue: number;
  adImpressions: number;
  cpm: number;
  revenuePerUser: number;
  roas: number;
  conversionRate: number;
  avgPricePerAdGrowth: number;
  adRevenueGrowth: number;
  familyAppsOperatingMargin: number;
  dau: number;
  mau: number;
  adLoad: number;
  timeSpent: number;
  reelsWatchTime: number;
  reelsMonetizationGap: number;
  advantagePlusAdoption: number;
  aiRecommendationUplift: number;
  aiTargetingUplift: number;
  aiCreativeAutomationAdoption: number;
  aiAdRevenueUplift: number;
  aiServingCost: number;
  aiInferenceCost: number;
  aiAdStackOpex: number;
  aiInvestedCapital: number;
  totalCapex: number;
  aiCapex: number;
  gpuCapex: number;
  dataCenterCapex: number;
  depreciation: number;
  operatingCashFlow: number;
  fcf: number;
  fcfMargin: number;
  realityLabsRevenue: number;
  realityLabsOperatingLoss: number;
  businessMessagingRevenue: number;
  whatsappRevenue: number;
  sharesOutstanding: number;
  wacc: number;
};

export type MetaData = {
  periods: PeriodOption[];
  rows: MetaQuarterRow[];
  currentPeriodId: string;
  currentPrice: number;
  currency: "USD";
  dividendYield: number;
  aiAdOpexRate: number;
  latestReferenceDate: string;
};

export const metaData: MetaData = {
  periods: [
    { value: "Q2 2025", label: "Q2 2025" },
    { value: "Q3 2025", label: "Q3 2025" },
    { value: "Q4 2025", label: "Q4 2025" },
    { value: "Q1 2026", label: "Q1 2026" },
    { value: "Q2 2026E", label: "Q2 2026E" },
    { value: "Q3 2026E", label: "Q3 2026E" },
  ],
  currentPeriodId: "Q1 2026",
  currentPrice: 560,
  currency: "USD",
  dividendYield: 0.003,
  aiAdOpexRate: 0.032,
  latestReferenceDate: "2026-05-09",
  rows: [
    {
      periodId: "Q2 2025",
      label: "Q2 2025",
      isForecast: false,
      totalRevenue: 40.5,
      familyAppsRevenue: 39.1,
      adRevenue: 37.4,
      adImpressions: 3300,
      cpm: 11.33,
      revenuePerUser: 11.6,
      roas: 4.6,
      conversionRate: 0.061,
      avgPricePerAdGrowth: 0.041,
      adRevenueGrowth: 0.1,
      familyAppsOperatingMargin: 0.39,
      dau: 3.36,
      mau: 4.1,
      adLoad: 0.21,
      timeSpent: 63,
      reelsWatchTime: 18.4,
      reelsMonetizationGap: 0.18,
      advantagePlusAdoption: 0.12,
      aiRecommendationUplift: 0.028,
      aiTargetingUplift: 0.024,
      aiCreativeAutomationAdoption: 0.16,
      aiAdRevenueUplift: 1.15,
      aiServingCost: 1.2,
      aiInferenceCost: 0.72,
      aiAdStackOpex: 0.78,
      aiInvestedCapital: 104,
      totalCapex: 14.1,
      aiCapex: 8.1,
      gpuCapex: 4.7,
      dataCenterCapex: 3.4,
      depreciation: 4.1,
      operatingCashFlow: 14.4,
      fcf: 10.7,
      fcfMargin: 0.264,
      realityLabsRevenue: 0.38,
      realityLabsOperatingLoss: 4.1,
      businessMessagingRevenue: 1.45,
      whatsappRevenue: 0.92,
      sharesOutstanding: 2.62,
      wacc: 0.085,
    },
    {
      periodId: "Q3 2025",
      label: "Q3 2025",
      isForecast: false,
      totalRevenue: 41.8,
      familyAppsRevenue: 40.3,
      adRevenue: 38.7,
      adImpressions: 3425,
      cpm: 11.3,
      revenuePerUser: 11.9,
      roas: 4.8,
      conversionRate: 0.063,
      avgPricePerAdGrowth: 0.046,
      adRevenueGrowth: 0.12,
      familyAppsOperatingMargin: 0.401,
      dau: 3.38,
      mau: 4.13,
      adLoad: 0.215,
      timeSpent: 64.4,
      reelsWatchTime: 19.7,
      reelsMonetizationGap: 0.165,
      advantagePlusAdoption: 0.16,
      aiRecommendationUplift: 0.031,
      aiTargetingUplift: 0.028,
      aiCreativeAutomationAdoption: 0.2,
      aiAdRevenueUplift: 1.34,
      aiServingCost: 1.35,
      aiInferenceCost: 0.79,
      aiAdStackOpex: 0.84,
      aiInvestedCapital: 112,
      totalCapex: 15.0,
      aiCapex: 8.7,
      gpuCapex: 5.0,
      dataCenterCapex: 4.0,
      depreciation: 4.4,
      operatingCashFlow: 15.8,
      fcf: 11.2,
      fcfMargin: 0.268,
      realityLabsRevenue: 0.4,
      realityLabsOperatingLoss: 4.2,
      businessMessagingRevenue: 1.52,
      whatsappRevenue: 0.96,
      sharesOutstanding: 2.61,
      wacc: 0.085,
    },
    {
      periodId: "Q4 2025",
      label: "Q4 2025",
      isForecast: false,
      totalRevenue: 42.8,
      familyAppsRevenue: 41.2,
      adRevenue: 39.9,
      adImpressions: 3520,
      cpm: 11.34,
      revenuePerUser: 12.2,
      roas: 4.9,
      conversionRate: 0.065,
      avgPricePerAdGrowth: 0.05,
      adRevenueGrowth: 0.13,
      familyAppsOperatingMargin: 0.412,
      dau: 3.4,
      mau: 4.15,
      adLoad: 0.22,
      timeSpent: 65.6,
      reelsWatchTime: 20.9,
      reelsMonetizationGap: 0.15,
      advantagePlusAdoption: 0.19,
      aiRecommendationUplift: 0.034,
      aiTargetingUplift: 0.031,
      aiCreativeAutomationAdoption: 0.23,
      aiAdRevenueUplift: 1.55,
      aiServingCost: 1.5,
      aiInferenceCost: 0.88,
      aiAdStackOpex: 0.9,
      aiInvestedCapital: 118,
      totalCapex: 15.9,
      aiCapex: 9.2,
      gpuCapex: 5.3,
      dataCenterCapex: 4.3,
      depreciation: 4.8,
      operatingCashFlow: 16.6,
      fcf: 11.7,
      fcfMargin: 0.273,
      realityLabsRevenue: 0.42,
      realityLabsOperatingLoss: 4.3,
      businessMessagingRevenue: 1.61,
      whatsappRevenue: 1.01,
      sharesOutstanding: 2.59,
      wacc: 0.085,
    },
    {
      periodId: "Q1 2026",
      label: "Q1 2026",
      isForecast: false,
      totalRevenue: 42.3,
      familyAppsRevenue: 40.6,
      adRevenue: 40.2,
      adImpressions: 3600,
      cpm: 11.17,
      revenuePerUser: 12.5,
      roas: 5.1,
      conversionRate: 0.068,
      avgPricePerAdGrowth: 0.07,
      adRevenueGrowth: 0.18,
      familyAppsOperatingMargin: 0.42,
      dau: 3.43,
      mau: 4.18,
      adLoad: 0.223,
      timeSpent: 66.8,
      reelsWatchTime: 22.1,
      reelsMonetizationGap: 0.14,
      advantagePlusAdoption: 0.24,
      aiRecommendationUplift: 0.038,
      aiTargetingUplift: 0.034,
      aiCreativeAutomationAdoption: 0.28,
      aiAdRevenueUplift: 1.82,
      aiServingCost: 1.7,
      aiInferenceCost: 0.96,
      aiAdStackOpex: 1.0,
      aiInvestedCapital: 120,
      totalCapex: 16.8,
      aiCapex: 9.8,
      gpuCapex: 5.6,
      dataCenterCapex: 4.5,
      depreciation: 5.2,
      operatingCashFlow: 17.4,
      fcf: 11.9,
      fcfMargin: 0.281,
      realityLabsRevenue: 0.44,
      realityLabsOperatingLoss: 4.5,
      businessMessagingRevenue: 1.72,
      whatsappRevenue: 1.08,
      sharesOutstanding: 2.58,
      wacc: 0.085,
    },
    {
      periodId: "Q2 2026E",
      label: "Q2 2026E",
      isForecast: true,
      totalRevenue: 48.8,
      familyAppsRevenue: 47.0,
      adRevenue: 46.8,
      adImpressions: 3740,
      cpm: 12.5,
      revenuePerUser: 12.9,
      roas: 5.2,
      conversionRate: 0.071,
      avgPricePerAdGrowth: 0.081,
      adRevenueGrowth: 0.2,
      familyAppsOperatingMargin: 0.425,
      dau: 3.46,
      mau: 4.21,
      adLoad: 0.227,
      timeSpent: 68.2,
      reelsWatchTime: 23.5,
      reelsMonetizationGap: 0.12,
      advantagePlusAdoption: 0.29,
      aiRecommendationUplift: 0.042,
      aiTargetingUplift: 0.037,
      aiCreativeAutomationAdoption: 0.32,
      aiAdRevenueUplift: 2.04,
      aiServingCost: 1.84,
      aiInferenceCost: 1.03,
      aiAdStackOpex: 1.06,
      aiInvestedCapital: 124,
      totalCapex: 17.3,
      aiCapex: 10.2,
      gpuCapex: 5.8,
      dataCenterCapex: 4.7,
      depreciation: 5.6,
      operatingCashFlow: 18.3,
      fcf: 12.2,
      fcfMargin: 0.279,
      realityLabsRevenue: 0.46,
      realityLabsOperatingLoss: 4.6,
      businessMessagingRevenue: 1.86,
      whatsappRevenue: 1.16,
      sharesOutstanding: 2.57,
      wacc: 0.085,
    },
    {
      periodId: "Q3 2026E",
      label: "Q3 2026E",
      isForecast: true,
      totalRevenue: 51.9,
      familyAppsRevenue: 50.0,
      adRevenue: 49.8,
      adImpressions: 3890,
      cpm: 12.8,
      revenuePerUser: 13.2,
      roas: 5.4,
      conversionRate: 0.074,
      avgPricePerAdGrowth: 0.091,
      adRevenueGrowth: 0.22,
      familyAppsOperatingMargin: 0.43,
      dau: 3.49,
      mau: 4.24,
      adLoad: 0.231,
      timeSpent: 69.6,
      reelsWatchTime: 24.7,
      reelsMonetizationGap: 0.11,
      advantagePlusAdoption: 0.34,
      aiRecommendationUplift: 0.046,
      aiTargetingUplift: 0.04,
      aiCreativeAutomationAdoption: 0.36,
      aiAdRevenueUplift: 2.28,
      aiServingCost: 1.95,
      aiInferenceCost: 1.1,
      aiAdStackOpex: 1.12,
      aiInvestedCapital: 128,
      totalCapex: 17.7,
      aiCapex: 10.6,
      gpuCapex: 6,
      dataCenterCapex: 4.9,
      depreciation: 5.9,
      operatingCashFlow: 19.1,
      fcf: 12.6,
      fcfMargin: 0.279,
      realityLabsRevenue: 0.49,
      realityLabsOperatingLoss: 4.7,
      businessMessagingRevenue: 2.02,
      whatsappRevenue: 1.23,
      sharesOutstanding: 2.56,
      wacc: 0.085,
    },
  ],
};
