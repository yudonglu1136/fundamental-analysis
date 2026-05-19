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

export type TslaHistoricalValuationEvent = {
  id: string;
  label: string;
  eventDate: string;
  fiscalPeriod: string;
  asOfPrice: number;
  fairValue: number;
  targetPrice3Y: number;
  expectedShareholderCagr: number;
  method: string;
  sourceStatus: TslaSourceStatus;
  sourceId: string;
  warnings: string[];
  methodOutputs: Array<{ label: string; value: number; format: "currency" | "percent"; description: string }>;
};

export type TslaEarningsFocusScores = {
  autoMargin: number;
  energyStorage: number;
  autonomyFsd: number;
  chinaCompetition: number;
  capexFcf: number;
  regulatoryRisk: number;
};

export type TslaEarningsCallQuarter = {
  id: string;
  quarter: string;
  callDate: string;
  sourceStatus: TslaSourceStatus;
  managementTone: "bearish" | "cautious" | "balanced" | "constructive" | "bullish";
  reportedFacts: string[];
  analystFocus: string[];
  marketFocusSummary: string;
  modelReadThrough: string;
  focusScores: TslaEarningsFocusScores;
};

export type TslaEnergyStorageDeployment = {
  year: number;
  storageGwh: number;
  yoyGrowth: number | null;
  sourceStatus: TslaSourceStatus;
  sourceId: string;
  commentary: string;
  isForecast?: boolean;
};

export type TslaFsdSubscriptionProxy = {
  year: number;
  fsdSubscriptionRevenue: number;
  totalRevenue: number;
  fsdRevenueShare: number;
  sourceStatus: TslaSourceStatus;
  sourceId: string;
  assumptionLabel: string;
  commentary: string;
  isForecast?: boolean;
};

export type TslaDataset = {
  ticker: "TSLA";
  companyName: string;
  currency: "USD";
  latestReportingPeriod: string;
  marketData: TslaMarketData;
  periods: TslaFinancialPeriod[];
  operatingMetrics: TslaOperatingMetric[];
  historicalValuations: TslaHistoricalValuationEvent[];
  earningsCalls: TslaEarningsCallQuarter[];
  energyStorageDeployments: TslaEnergyStorageDeployment[];
  fsdSubscriptionProxy: TslaFsdSubscriptionProxy[];
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
