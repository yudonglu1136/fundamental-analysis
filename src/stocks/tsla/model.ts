import type { Scenario } from "../types";

export type TslaSourceStatus =
  | "official_actual"
  | "market_data"
  | "forecast_assumption"
  | "derived"
  | "research_only"
  | "placeholder";

export type TslaFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "annual" | "quarter" | "forecast";
  asOfDate: string;
  sourceStatus: TslaSourceStatus;
  sourceId: string;
  revenue: number;
  grossProfit: number;
  grossMargin: number;
  operatingIncome: number;
  operatingMargin: number;
  netIncome: number;
  dilutedEps: number;
  dilutedShares: number;
  operatingCashFlow: number;
  capex: number;
  freeCashFlow: number;
  notes?: string;
};

export type TslaOperatingMetric = {
  periodId: string;
  asOfDate: string;
  sourceStatus: TslaSourceStatus;
  autoDemandSignal: number;
  energyStorageSignal: number;
  autonomyProgressSignal: number;
  grossMarginDurabilitySignal: number;
  evCompetitionCommentary: string;
  energyCommentary: string;
  autonomyCommentary: string;
  chinaRiskCommentary: string;
};

export type TslaMarketData = {
  currentPrice: number;
  priceDate: string;
  sharesForMarketCap: number;
  source: string;
  sourceStatus: TslaSourceStatus;
};

export type TslaDataset = {
  ticker: "TSLA";
  companyName: string;
  currency: "USD";
  latestReportingPeriod: string;
  marketData: TslaMarketData;
  periods: TslaFinancialPeriod[];
  operatingMetrics: TslaOperatingMetric[];
  researchQuestions: Array<{ key: string; question: string; currentView: string; evidenceNeeded: string }>;
  sourceGaps: string[];
};

export type TslaValuationAssumptions = {
  currentPrice: number;
  dilutedShares: number;
  normalizedRevenue: number;
  revenueGrowth: number;
  autoRevenueMix: number;
  energyRevenueMix: number;
  autoOperatingMargin: number;
  energyRevenueGrowth: number;
  normalizedFcfMargin: number;
  targetAutoPe: number;
  energySalesMultiple: number;
  targetFcfYield: number;
  discountRate: number;
  terminalGrowth: number;
  netCashUsd: number;
  autonomyOptionValuePerShare: number;
  autonomyProbability: number;
  evCompetitionHaircut: number;
  executionHaircut: number;
  regulatoryHaircut: number;
  dividendYield: number;
  buybackYield: number;
};

export type TslaScenarioPresetMap = Record<Scenario, TslaValuationAssumptions>;
