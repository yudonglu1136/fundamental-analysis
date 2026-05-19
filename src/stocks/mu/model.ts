import type { Scenario } from "../types";

export type MuSourceStatus =
  | "official_actual"
  | "market_data"
  | "forecast_assumption"
  | "derived"
  | "research_only"
  | "placeholder";

export type MuFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "annual" | "quarter" | "forecast";
  asOfDate: string;
  sourceStatus: MuSourceStatus;
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

export type MuOperatingMetric = {
  periodId: string;
  asOfDate: string;
  sourceStatus: MuSourceStatus;
  hbmDemandSignal: number;
  dramCycleSignal: number;
  nandCycleSignal: number;
  capexIntensity: number;
  aiServerExposureCommentary: string;
  pricingCommentary: string;
  supplyDisciplineCommentary: string;
  chinaRiskCommentary: string;
};

export type MuMarketData = {
  currentPrice: number;
  priceDate: string;
  sharesForMarketCap: number;
  source: string;
  sourceStatus: MuSourceStatus;
};

export type MuHistoricalValuationEvent = {
  id: string;
  label: string;
  eventDate: string;
  fiscalPeriod: string;
  asOfPrice: number;
  fairValue: number;
  targetPrice3Y: number;
  expectedShareholderCagr: number;
  method: string;
  sourceStatus: MuSourceStatus;
  sourceId: string;
  warnings: string[];
  methodOutputs: Array<{ label: string; value: number; format: "currency" | "percent"; description: string }>;
};

export type MuEarningsFocusScores = {
  hbmDemand: number;
  dramPricing: number;
  nandPricing: number;
  capexFcf: number;
  chinaRisk: number;
  supplyDiscipline: number;
};

export type MuEarningsCallQuarter = {
  id: string;
  quarter: string;
  callDate: string;
  sourceStatus: MuSourceStatus;
  managementTone: "bearish" | "cautious" | "balanced" | "constructive" | "bullish";
  reportedFacts: string[];
  analystFocus: string[];
  marketFocusSummary: string;
  modelReadThrough: string;
  focusScores: MuEarningsFocusScores;
};

export type MuMemoryCycleForecastYear = {
  year: number;
  sourceStatus: MuSourceStatus;
  cyclePhase: string;
  dramBitGrowth: number;
  nandBitGrowth: number;
  hbmRevenueMix: number;
  revenue: number;
  grossMargin: number;
  operatingMargin: number;
  fcfMargin: number;
  capexIntensity: number;
  demandIndex: number;
  supplyRiskIndex: number;
  commentary: string;
};

export type MuDataset = {
  ticker: "MU";
  companyName: string;
  currency: "USD";
  latestReportingPeriod: string;
  marketData: MuMarketData;
  periods: MuFinancialPeriod[];
  operatingMetrics: MuOperatingMetric[];
  historicalValuations: MuHistoricalValuationEvent[];
  earningsCalls: MuEarningsCallQuarter[];
  memoryCycleForecast: MuMemoryCycleForecastYear[];
  researchQuestions: Array<{ key: string; question: string; currentView: string; evidenceNeeded: string }>;
  sourceGaps: string[];
};

export type MuValuationAssumptions = {
  currentPrice: number;
  dilutedShares: number;
  normalizedRevenue: number;
  revenueGrowth: number;
  grossMargin: number;
  operatingMargin: number;
  normalizedFcfMargin: number;
  targetSalesMultiple: number;
  targetEbitMultiple: number;
  targetPe: number;
  targetFcfYield: number;
  discountRate: number;
  terminalGrowth: number;
  netCashUsd: number;
  hbmMixUplift: number;
  memoryCycleHaircut: number;
  chinaRestrictionHaircut: number;
  capexIntensityHaircut: number;
  dividendYield: number;
  buybackYield: number;
};

export type MuScenarioPresetMap = Record<Scenario, MuValuationAssumptions>;
