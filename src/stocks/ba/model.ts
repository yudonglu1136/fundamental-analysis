import type { Scenario, ValidationWarning } from "../types";

export type BaSourceStatus =
  | "official_actual"
  | "management_guidance"
  | "forecast_assumption"
  | "research_only"
  | "market_data"
  | "derived"
  | "missing";

export type BaSegmentName =
  | "Electronic Systems"
  | "Platforms & Services"
  | "Air"
  | "Maritime"
  | "Cyber & Intelligence"
  | "HQ"
  | "Intra-group";

export type BaProgramStage = "mature" | "ramping" | "future option";
export type BaRiskLevel = "Low" | "Medium" | "High";

export type BaSource = {
  id: string;
  title: string;
  url: string;
  publisher: "BAE Systems" | "London Stock Exchange" | "Analyst";
  sourceStatus: BaSourceStatus;
  reportingPeriod?: string;
  publishedDate?: string;
  accessedDate: string;
  notes?: string;
};

export type BaFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  sourceStatus: "official_actual";
  sourceId: string;
  sales: number;
  revenue: number;
  underlyingEbit: number;
  underlyingEbitMargin: number;
  operatingProfit: number;
  underlyingEpsPence: number;
  basicEpsPence: number;
  freeCashFlow: number;
  netCashFlowFromOperations: number;
  orderIntake: number;
  orderBacklog: number;
  orderBook: number;
  dividendPerSharePence: number;
  netDebtExLeases: number;
  leaseLiabilitiesNet?: number;
  postEmploymentBenefitSurplus?: number;
  depreciationAmortizationImpairment?: number;
  capex?: number;
  taxExpense?: number;
  profitBeforeTax?: number;
  profitAttributableToEquity?: number;
  weightedAverageBasicShares?: number;
  weightedAverageDilutedShares?: number;
  outstandingSharesForEps?: number;
  returnsToShareholders?: number;
  buybackSpend?: number;
  notes: string;
};

export type BaSegmentFinancial = {
  periodId: string;
  segment: BaSegmentName;
  sourceStatus: "official_actual";
  sourceId: string;
  sales: number;
  salesPriorYear?: number;
  revenue?: number;
  operatingProfit?: number;
  underlyingEbit?: number;
  underlyingEbitPriorYear?: number;
  underlyingEbitMargin?: number;
  operatingBusinessCashFlow?: number;
  orderIntake?: number;
  orderIntakePriorYear?: number;
  orderBacklog?: number;
  orderBacklogPriorYear?: number;
  orderBook?: number;
  employees?: number;
  strategicImportance: string;
  cyclicality: string;
  keyPrograms: string[];
  risks: string[];
  notes?: string;
};

export type BaGuidance = {
  year: number;
  sourceStatus: "management_guidance";
  sourceId: string;
  salesGrowthLow: number;
  salesGrowthHigh: number;
  underlyingEbitGrowthLow: number;
  underlyingEbitGrowthHigh: number;
  underlyingEpsGrowthLow: number;
  underlyingEpsGrowthHigh: number;
  freeCashFlowFloor: number;
  threeYearFcfGuidance: Array<{ period: string; floor: number }>;
  underlyingNetFinanceCosts: number;
  effectiveTaxRate: number;
  nonControllingInterests: number;
  fxSensitivity: {
    moveUsdPerGbp: number;
    salesImpact: number;
    underlyingEbitImpact: number;
    epsImpactPence: number;
  };
  segmentGuidance: Array<{
    segment: Exclude<BaSegmentName, "HQ" | "Intra-group">;
    salesGrowthLow: number;
    salesGrowthHigh: number;
    marginLow: number;
    marginHigh: number;
  }>;
};

export type BaMarketData = {
  ticker: "BA.L";
  sourceStatus: "market_data";
  sourceId: string;
  currentPriceGbp: number;
  currentPriceGbx: number;
  priceDate: string;
  collectionTime?: string;
  source: string;
  sharesForMarketCap: number;
  marketCap: number;
  enterpriseValueExLeases: number;
  dividendYield: number;
  fcfYield: number;
  forwardPe: number;
  notes: string;
};

export type BaProgram = {
  id: string;
  name: string;
  segment: Exclude<BaSegmentName, "HQ" | "Intra-group">;
  geography: string;
  customer: string;
  stage: BaProgramStage;
  maturityScore: number;
  marginQualityScore: number;
  growthContributionScore: number;
  riskScore: number;
  backlogSupport: "direct" | "indirect" | "option";
  strategicRelevance: string;
  officialDescription: string;
  sourceStatus: "research_only";
  sourceId: string;
  valuationMapping: "scenario_revenue_growth" | "margin_durability" | "risk_discount_only" | "none";
};

export type BaDefenseCycleScenario = {
  scenario: Scenario;
  sourceStatus: "forecast_assumption";
  revenueCagr: number;
  operatingMargin: number;
  targetPe: number;
  targetEvEbit: number;
  targetFcfYield: number;
  wacc: number;
  terminalGrowth: number;
  scenarioProbability: number;
  narrative: string;
  mappedDrivers: string[];
};

export type BaRiskItem = {
  id: string;
  name: string;
  sourceStatus: "research_only";
  probability: number;
  impact: number;
  detectability: number;
  affectedDriver: string;
  mitigation: string;
  notes: string;
};

export type BaReportingEventType = "full_year_results" | "half_year_results" | "agm_market_update" | "market_update";
export type BaTranscriptStatus = "official_video_available" | "official_release_only" | "missing";
export type BaMarketFocusTheme =
  | "Backlog & order intake"
  | "Guidance"
  | "Cash conversion"
  | "Margins"
  | "Programme execution"
  | "Defence budgets"
  | "Space / electronics"
  | "Capital returns"
  | "FX / financing";

export type BaReportingEvent = {
  quarter: string;
  periodLabel: string;
  eventDate: string;
  eventType: BaReportingEventType;
  title: string;
  sourceId: string;
  sourceStatus: "official_actual" | "management_guidance";
  transcriptStatus: BaTranscriptStatus;
  videoAvailable: boolean;
  sales?: number;
  revenue?: number;
  underlyingEbit?: number;
  underlyingEpsPence?: number;
  freeCashFlow?: number;
  orderIntake?: number;
  orderBacklog?: number;
  orderBook?: number;
  guidanceSummary: string;
  keyMetrics: Array<{ label: string; value: string; sourceStatus: "official_actual" | "management_guidance" }>;
  managementMessage: string;
  marketFocus: Array<{
    theme: BaMarketFocusTheme;
    intensity: number;
    direction: "rising" | "stable" | "falling" | "new";
    evidence: string;
  }>;
  debateQuestions: string[];
  watchItems: string[];
  aiSummary: {
    sourceStatus: "research_only";
    summary: string;
    valuationMapping: "scenario_assumption_context_only";
  };
};

export type BaReportingEventsOutput = {
  events: BaReportingEvent[];
  latest: BaReportingEvent;
  themeTrendRows: Array<Record<string, string | number>>;
  overview: {
    sourceStatus: "research_only";
    title: string;
    summary: string;
    focusShift: string[];
    marketAttentionNow: string[];
  };
  warnings: ValidationWarning[];
};

export type BaDataset = {
  company: "BAE Systems plc";
  ticker: "BA.L";
  currency: "GBP";
  reportingCurrency: "GBP";
  latestReportingPeriod: string;
  sources: BaSource[];
  periods: BaFinancialPeriod[];
  segments: BaSegmentFinancial[];
  guidance: BaGuidance[];
  marketData: BaMarketData;
  programs: BaProgram[];
  defenseCycleScenarios: BaDefenseCycleScenario[];
  risks: BaRiskItem[];
  reportingEvents: BaReportingEvent[];
  sourceMap: Record<string, BaSource>;
};

export type BaValuationAssumptions = {
  currentPrice: number;
  revenueCagr: number;
  operatingMargin: number;
  taxRate: number;
  dAndAIntensity: number;
  capexIntensity: number;
  workingCapitalDragPctRevenueGrowth: number;
  wacc: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  netDebtExLeases: number;
  leaseLiabilitiesNet: number;
  pensionSurplusCredit: number;
  dilutedShares: number;
  dividendPerShare: number;
  backlogDurabilityMaxAdjustment: number;
  weightDcf: number;
  weightFcfYield: number;
  weightEvEbit: number;
  weightPe: number;
  weightBacklogDurability: number;
};

export type BaForecastYear = {
  year: number;
  sales: number;
  underlyingEbit: number;
  ebitMargin: number;
  nopat: number;
  depreciationAmortization: number;
  capex: number;
  workingCapitalInvestment: number;
  unleveredFreeCashFlow: number;
};

export type BaDcfOutput = {
  forecast: BaForecastYear[];
  discountFactors: number[];
  presentValueCashFlows: number;
  terminalValue: number;
  presentValueTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  terminalValueShareOfEv: number;
};

export type BaBacklogEngineOutput = {
  totalBacklog: number;
  priorBacklog: number;
  backlogGrowth: number;
  orderIntake: number;
  priorOrderIntake: number;
  bookToBill: number;
  backlogCoverageYears: number;
  revenueVisibilityScore: number;
  backlogDurabilityScore: number;
  segmentRows: Array<BaSegmentFinancial & {
    bookToBill: number | null;
    backlogCoverageYears: number | null;
    backlogGrowth: number | null;
  }>;
  majorContractWins: Array<{
    program: string;
    segment: BaSegmentName;
    value: number | null;
    currency: "GBP" | "USD";
    sourceId: string;
    note: string;
  }>;
  qualityNotes: string[];
};

export type BaSegmentEngineOutput = {
  rows: Array<BaSegmentFinancial & {
    salesMix: number;
    ebitMix: number;
    salesGrowth: number | null;
    ebitGrowth: number | null;
    qualityScore: number;
    backlogCoverageYears: number | null;
    bookToBill: number | null;
  }>;
  totals: {
    sales: number;
    underlyingEbit: number;
    orderIntake: number;
    orderBacklog: number;
  };
  reconciliationWarnings: ValidationWarning[];
};

export type BaProgramExposureOutput = {
  programs: Array<BaProgram & {
    attractivenessScore: number;
    executionRiskLabel: BaRiskLevel;
    durationLabel: string;
  }>;
  filters: {
    segments: string[];
    geographies: string[];
    stages: string[];
    riskLevels: string[];
  };
};

export type BaMoatOutput = {
  moatScore: number;
  durabilityScore: number;
  procurementStickinessScore: number;
  programReplacementRisk: number;
  politicalBudgetRisk: number;
  executionRisk: number;
  drivers: Array<{ label: string; score: number; sourceStatus: "research_only"; explanation: string }>;
};

export type BaRiskOutput = {
  riskScore: number;
  redTeamVerdict: string;
  killCriteria: string[];
  rows: Array<BaRiskItem & { weightedScore: number; severityLabel: BaRiskLevel }>;
  monitoringTriggers: string[];
};

export type BaDividendOutput = {
  dividendPerSharePence: number;
  dividendGrowth: number;
  dividendYield: number;
  earningsPayout: number;
  fcfPayout: number;
  buybackSpend: number;
  totalShareholderReturns: number;
  sustainabilityScore: number;
  notes: string[];
};

export type BaValuationOutput = {
  dcf: BaDcfOutput;
  fcfYieldFairValue: number;
  peFairValue: number;
  evEbitFairValue: number;
  backlogAdjustedFairValue: number;
  blendedFairValue: number;
  valuationRangeLow: number;
  valuationRangeHigh: number;
  probabilityWeightedFairValue: number;
  finalWeights: Record<string, number>;
  normalizedFcf: number;
  forwardEpsPence: number;
  forwardUnderlyingEbit: number;
  sourceIsolationWarnings: ValidationWarning[];
};
