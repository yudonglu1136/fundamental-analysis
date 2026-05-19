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

export type TslaDeepDiveIndicator = {
  id: string;
  label: string;
  category: "Auto" | "Energy" | "Autonomy" | "China" | "Cash Flow" | "Valuation";
  sourceStatus: TslaSourceStatus;
  currentRead: string;
  bullCase: string;
  bearCase: string;
  modelAction: string;
  portfolioSignal: "constructive" | "neutral" | "caution" | "avoid";
};

export type TslaDriverScore = {
  driver: string;
  score: number;
  status: "strong" | "watch" | "weak" | "option";
  evidence: string;
  monitor: string;
  valuationImplication: string;
};

export type TslaQuarterlyThesisPoint = {
  periodId: string;
  label: string;
  asOfDate: string;
  sourceStatus: TslaSourceStatus;
  revenue: number;
  operatingMargin: number;
  fcfMargin: number;
  storageGwh?: number;
  activeFsdSubscriptions?: number;
  autoDemandScore: number;
  energyScaleScore: number;
  autonomyEvidenceScore: number;
  valuationRiskScore: number;
  conclusion: string;
};

export type TslaScenarioBridge = {
  segment: "Core Auto" | "Energy Storage" | "FSD / Robotaxi" | "FCF Guardrail" | "Valuation Risk";
  bear: string;
  base: string;
  bull: string;
  evidenceToUpgrade: string;
};

export type TslaDeepDiveSystem = {
  verdict: string;
  currentRead: string;
  variantView: string;
  valuationDiscipline: string;
  indicators: TslaDeepDiveIndicator[];
  driverScores: TslaDriverScore[];
  quarterlyThesis: TslaQuarterlyThesisPoint[];
  scenarioBridge: TslaScenarioBridge[];
  killCriteria: string[];
  monitoringPlan: string[];
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
  deepDiveSystem: TslaDeepDiveSystem;
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
