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

export type MuCycleDecisionIndicator = {
  id: string;
  label: string;
  category: "Demand" | "Pricing" | "Supply" | "Cash Flow" | "Valuation" | "Risk";
  unit: "score" | "percent" | "multiple" | "text";
  sourceStatus: MuSourceStatus;
  currentValue: number | string;
  threshold: string;
  trend: "improving" | "stable" | "deteriorating" | "watch";
  interpretation: string;
  portfolioSignal: "constructive" | "neutral" | "caution" | "avoid";
};

export type MuCyclePhaseScore = {
  phase: string;
  order: number;
  score: number;
  status: "completed" | "active" | "watch" | "risk";
  evidence: string;
  watchItem: string;
  investmentImplication: string;
};

export type MuCycleSignalPoint = {
  periodId: string;
  label: string;
  asOfDate: string;
  sourceStatus: MuSourceStatus;
  dramPricingIndex: number;
  nandPricingIndex: number;
  hbmTightnessIndex: number;
  inventoryStressIndex: number;
  capexSupplyRiskIndex: number;
  grossMargin: number;
  fcfMargin: number;
  cycleHeatScore: number;
  phase: string;
};

export type MuCycleDecisionSystem = {
  currentCyclePhase: string;
  verdict: string;
  conclusion: string;
  modelUse: string;
  valuationReadThrough: string;
  indicators: MuCycleDecisionIndicator[];
  phaseScores: MuCyclePhaseScore[];
  quarterlySignals: MuCycleSignalPoint[];
  killCriteria: string[];
  monitoringPlan: string[];
};

export type MuHbmAiForecastYear = {
  year: number;
  sourceStatus: MuSourceStatus;
  aiServerUnitIndex: number;
  hbmContentPerAcceleratorIndex: number;
  hbmBitDemandIndex: number;
  muHbmRevenue: number;
  muHbmRevenueMix: number;
  customerDemandCoverage: number;
  hbmGrossMarginPremium: number;
  capexIntensity: number;
  fcfConversion: number;
  commentary: string;
};

export type MuHbmAiScenario = {
  scenario: "Bear" | "Base" | "Bull";
  aiServerUnitCagr: number;
  hbmContentCagr: number;
  fy2028HbmRevenue: number;
  fy2028HbmMix: number;
  normalizedGrossMargin: number;
  normalizedFcfMargin: number;
  capexIntensity: number;
  supplyCatchUpYear: number;
  investmentRead: string;
};

export type MuHbmAiDebate = {
  id: string;
  topic: string;
  marketBelief: string;
  buySideQuestion: string;
  modelVariable: string;
  proofPoint: string;
  downsideTell: string;
  currentRead: "constructive" | "mixed" | "caution";
};

export type MuHbmSupplyBottleneck = {
  bottleneck: string;
  whyItMatters: string;
  indicator: string;
  currentRead: string;
};

export type MuHbmAiDemandSystem = {
  asOfDate: string;
  sourceStatus: MuSourceStatus;
  conclusion: string;
  analystRead: string;
  hedgeFundStyleRead: string;
  modelUse: string;
  forecastRows: MuHbmAiForecastYear[];
  scenarios: MuHbmAiScenario[];
  debates: MuHbmAiDebate[];
  bottlenecks: MuHbmSupplyBottleneck[];
  monitoringSignals: string[];
  killCriteria: string[];
  sourceNotes: string[];
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
  cycleDecisionSystem: MuCycleDecisionSystem;
  hbmAiDemandSystem: MuHbmAiDemandSystem;
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
