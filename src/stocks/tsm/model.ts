import type { DataSourceType, Scenario } from "../types";

export type TsmSourceStatus =
  | "official_actual"
  | "management_guidance"
  | "forecast_assumption"
  | "market_data_proxy"
  | "research_only"
  | "market_data";

export type TsmFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: "Q1" | "Q2" | "Q3" | "Q4";
  periodType: "quarter" | "annual" | "forecast";
  asOfDate: string;
  sourceStatus: TsmSourceStatus;
  sourceUrl: string;
  revenueUsd: number;
  revenueGrowth?: number | null;
  grossMargin: number;
  operatingMargin: number;
  netIncomeUsd?: number | null;
  netMargin?: number | null;
  dilutedEpsPerAdr?: number | null;
  capexUsd?: number | null;
  freeCashFlowUsd?: number | null;
  dividendPerAdr?: number | null;
  notes?: string | null;
};

export type TsmTechnologyMix = {
  periodId: string;
  node: "3nm" | "5nm" | "7nm" | "Advanced nodes" | "Other";
  revenueMix: number;
  sourceStatus: TsmSourceStatus;
  notes?: string | null;
};

export type TsmPlatformMix = {
  periodId: string;
  platform: "HPC" | "Smartphone" | "IoT" | "Automotive" | "DCE / Other";
  revenueMix: number;
  sourceStatus: TsmSourceStatus;
  notes?: string | null;
};

export type TsmOperatingMetric = {
  periodId: string;
  sourceStatus: TsmSourceStatus;
  advancedNodeMix?: number | null;
  hpcMix?: number | null;
  smartphoneMix?: number | null;
  waferShipments12InchEqM?: number | null;
  customerCount?: number | null;
  productCount?: number | null;
  processTechnologyCount?: number | null;
  annualCapacity12InchEqM?: number | null;
  q2RevenueGuidanceMidUsd?: number | null;
  q2GrossMarginGuidanceMid?: number | null;
  q2OperatingMarginGuidanceMid?: number | null;
  capexGuidanceUsd?: number | null;
  sourceUrl?: string | null;
  commentary?: string | null;
};

export type TsmMarketData = {
  currentPrice: number;
  priceDate: string;
  adrEquivalentShares: number;
  netCashUsd: number;
  source: string;
  sourceStatus: TsmSourceStatus;
};

export type TsmDataset = {
  marketData: TsmMarketData;
  periods: TsmFinancialPeriod[];
  technologyMix: TsmTechnologyMix[];
  platformMix: TsmPlatformMix[];
  operatingMetrics: TsmOperatingMetric[];
  sourceNotes: string[];
  latestReportingPeriod: string;
  selectedPeriodId?: string;
  dataSourceType?: DataSourceType;
};

export type TsmValuationAssumptions = {
  currentPrice: number;
  adrEquivalentShares: number;
  netCashUsd: number;
  revenueGrowth: number;
  hpcGrowth: number;
  advancedNodeMix: number;
  grossMargin: number;
  operatingMargin: number;
  normalizedFcfMargin: number;
  capexIntensity: number;
  targetFcfYield: number;
  targetPe: number;
  evEbitMultiple: number;
  leadingEdgeRevenueMultiple: number;
  matureNodeRevenueMultiple: number;
  discountRate: number;
  terminalGrowth: number;
  customerConcentrationHaircut: number;
  geopoliticsHaircut: number;
  aiCycleHaircut: number;
  localizationCostDrag: number;
};

export type TsmScenarioPresetMap = Record<Scenario, TsmValuationAssumptions>;
