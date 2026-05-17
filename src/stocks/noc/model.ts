import type { Scenario, ValidationWarning } from "../types";

export type NocSourceStatus =
  | "official_actual"
  | "management_guidance"
  | "forecast_assumption"
  | "research_only"
  | "market_data"
  | "derived"
  | "missing";

export type NocSegmentName =
  | "Aeronautics Systems"
  | "Defense Systems"
  | "Mission Systems"
  | "Space Systems"
  | "Intersegment eliminations";

export type NocProgramStage = "mature" | "ramping" | "restructured" | "future option";
export type NocRiskLevel = "Low" | "Medium" | "High";
export type NocBudgetDriver = "DoD top-line" | "Air Force" | "Space Force" | "Navy" | "Nuclear Triad" | "Continuing Resolution";

export type NocSource = {
  id: string;
  title: string;
  url: string;
  publisher: "Northrop Grumman" | "SEC" | "U.S. Government" | "Market data" | "Analyst";
  sourceStatus: NocSourceStatus;
  sourceType: "annual_report" | "10-k" | "10-q" | "8-k" | "earnings_release" | "presentation" | "press_release" | "government" | "market_data" | "research_note";
  reportingPeriod?: string;
  publishedDate?: string;
  accessedDate: string;
  notes?: string;
};

export type NocFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: "annual" | "quarter";
  sourceStatus: "official_actual";
  sourceId: string;
  sales: number;
  organicSales?: number;
  productSales?: number;
  serviceSales?: number;
  operatingIncome: number;
  operatingMargin: number;
  segmentOperatingIncome: number;
  segmentOperatingMargin: number;
  netEarnings: number;
  dilutedEps: number;
  mtmAdjustedEps?: number;
  dilutedShares: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  capex: number;
  netAwards: number;
  fundedBacklog: number;
  unfundedBacklog: number;
  totalBacklog: number;
  cash?: number;
  longTermDebt?: number;
  currentDebt?: number;
  pensionAssets?: number;
  pensionLiabilities?: number;
  pensionAndOpbAssets?: number;
  pensionAndOpbLiabilities?: number;
  dividendsPaid?: number;
  dividendPerShare?: number;
  buybacks?: number;
  fixedPriceSales?: number;
  costTypeSales?: number;
  notes: string;
};

export type NocSegmentFinancial = {
  periodId: string;
  segment: NocSegmentName;
  sourceStatus: "official_actual";
  sourceId: string;
  sales: number;
  salesPriorYear?: number;
  operatingIncome?: number;
  operatingIncomePriorYear?: number;
  operatingMargin?: number;
  fundedBacklog?: number;
  unfundedBacklog?: number;
  totalBacklog?: number;
  totalBacklogPriorYear?: number;
  costTypeSales?: number;
  fixedPriceSales?: number;
  capex?: number;
  depreciationAmortization?: number;
  strategicImportance: string;
  keyPrograms: string[];
  risks: string[];
  notes?: string;
};

export type NocGuidance = {
  year: number;
  sourceStatus: "management_guidance";
  sourceId: string;
  asOfDate: string;
  salesLow: number;
  salesHigh: number;
  segmentOperatingIncomeLow: number;
  segmentOperatingIncomeHigh: number;
  mtmAdjustedEpsLow: number;
  mtmAdjustedEpsHigh: number;
  freeCashFlowLow: number;
  freeCashFlowHigh: number;
  segmentGuidance: Array<{
    segment: Exclude<NocSegmentName, "Intersegment eliminations"> | "Intersegment Eliminations";
    salesDescription: string;
    marginDescription: string;
    modeledSalesMidpoint: number;
    modeledMarginMidpoint: number;
  }>;
  notes: string;
};

export type NocMarketData = {
  ticker: "NOC";
  sourceStatus: "market_data";
  sourceId: string;
  currentPrice: number;
  priceDate: string;
  source: string;
  sharesForMarketCap: number;
  marketCap: number;
  enterpriseValue: number;
  dividendYield: number;
  fcfYield: number;
  notes: string;
};

export type NocProgram = {
  id: string;
  name: string;
  segment: Exclude<NocSegmentName, "Intersegment eliminations">;
  customer: string;
  budgetDriver: NocBudgetDriver;
  stage: NocProgramStage;
  revenueDriverScore: number;
  marginQualityScore: number;
  cashConversionScore: number;
  executionRiskScore: number;
  strategicRelevance: string;
  officialDescription: string;
  sourceStatus: "research_only";
  sourceId: string;
  assumptionMapping:
    | "b21_scale_multiplier"
    | "sentinel_risk_charge"
    | "space_growth_premium"
    | "mission_moat_premium"
    | "budget_scenario"
    | "risk_discount_only";
};

export type NocBudgetScenario = {
  scenario: Scenario;
  sourceStatus: "forecast_assumption";
  sourceId: string;
  revenueCagr: number;
  segmentOperatingMargin: number;
  targetPe: number;
  targetEvEbit: number;
  targetFcfYield: number;
  wacc: number;
  terminalGrowth: number;
  scenarioProbability: number;
  b21ScaleMultiplier: number;
  sentinelRiskCharge: number;
  spaceGrowthPremium: number;
  missionMoatPremium: number;
  narrative: string;
  mappedDrivers: string[];
};

export type NocRiskItem = {
  id: string;
  name: string;
  sourceStatus: "research_only";
  probability: number;
  impact: number;
  detectability: number;
  affectedDriver: string;
  killCriterion: string;
  mitigation: string;
  notes: string;
};

export type NocEarningsCallTopic =
  | "B-21"
  | "Sentinel"
  | "Space"
  | "Mission Systems"
  | "Margin"
  | "FCF / Cash"
  | "Backlog / Awards"
  | "International / Budget";

export type NocEarningsCallRecord = {
  id: string;
  fiscalQuarter: string;
  callDate: string;
  sourceStatus: "research_only";
  sourceId: string;
  sourceUrl: string;
  transcriptAvailability: "third_party_summary" | "official_transcript_missing" | "official_release_only";
  marketFocus: string;
  managementMessage: string;
  investorDebate: string;
  aiSummary: string;
  topicScores: Record<NocEarningsCallTopic, number>;
  watchItems: string[];
};

export type NocEarningsCallTrend = {
  sourceStatus: "research_only";
  methodology: string;
  aiOverallSummary: string;
  trendBullets: string[];
  records: NocEarningsCallRecord[];
};

export type NocDataset = {
  company: "Northrop Grumman Corporation";
  ticker: "NOC";
  currency: "USD";
  reportingCurrency: "USD";
  latestReportingPeriod: string;
  sources: NocSource[];
  periods: NocFinancialPeriod[];
  segments: NocSegmentFinancial[];
  guidance: NocGuidance[];
  marketData: NocMarketData;
  programs: NocProgram[];
  budgetScenarios: NocBudgetScenario[];
  risks: NocRiskItem[];
  earningsCalls: NocEarningsCallTrend;
  sourceMap: Record<string, NocSource>;
};

export type NocValuationAssumptions = {
  currentPrice: number;
  revenueCagr: number;
  segmentOperatingMargin: number;
  taxRate: number;
  dAndAIntensity: number;
  capexIntensity: number;
  workingCapitalDragPctRevenueGrowth: number;
  wacc: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  netDebt: number;
  pensionSurplusCredit: number;
  dilutedShares: number;
  dividendPerShare: number;
  b21ScaleMultiplier: number;
  sentinelRiskCharge: number;
  spaceGrowthPremium: number;
  missionMoatPremium: number;
  backlogDurabilityMaxAdjustment: number;
  weightDcf: number;
  weightFcfYield: number;
  weightEvEbit: number;
  weightPe: number;
  weightSotp: number;
  weightBacklogDurability: number;
};

export type NocForecastYear = {
  year: number;
  sales: number;
  segmentOperatingIncome: number;
  segmentOperatingMargin: number;
  nopat: number;
  depreciationAmortization: number;
  capex: number;
  workingCapitalInvestment: number;
  unleveredFreeCashFlow: number;
};

export type NocDcfOutput = {
  forecast: NocForecastYear[];
  discountFactors: number[];
  presentValueCashFlows: number;
  terminalValue: number;
  presentValueTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  terminalValueShareOfEv: number;
};

export type NocBacklogEngineOutput = {
  totalBacklog: number;
  fundedBacklog: number;
  unfundedBacklog: number;
  fundedRatio: number;
  priorBacklog: number;
  backlogGrowth: number;
  netAwards: number;
  bookToBill: number;
  backlogCoverageYears: number;
  revenueVisibilityScore: number;
  backlogDurabilityScore: number;
  segmentRows: Array<NocSegmentFinancial & {
    fundedRatio: number | null;
    backlogCoverageYears: number | null;
    backlogGrowth: number | null;
  }>;
  majorAwards: Array<{
    program: string;
    segment: Exclude<NocSegmentName, "Intersegment eliminations">;
    value: number | null;
    sourceId: string;
    note: string;
  }>;
  qualityNotes: string[];
};

export type NocSegmentEngineOutput = {
  rows: Array<NocSegmentFinancial & {
    salesMix: number;
    operatingIncomeMix: number;
    salesGrowth: number | null;
    operatingIncomeGrowth: number | null;
    fixedPriceMix: number | null;
    qualityScore: number;
    backlogCoverageYears: number | null;
    fundedRatio: number | null;
  }>;
  totals: {
    sales: number;
    operatingIncome: number;
    totalBacklog: number;
  };
  reconciliationWarnings: ValidationWarning[];
};

export type NocProgramExposureOutput = {
  programs: Array<NocProgram & {
    attractivenessScore: number;
    riskLabel: NocRiskLevel;
    durationLabel: string;
    mappedAssumption: string;
  }>;
  filters: {
    segments: string[];
    stages: string[];
    budgetDrivers: string[];
    riskLevels: string[];
  };
};

export type NocBudgetOutput = {
  selected: NocBudgetScenario;
  scenarios: NocBudgetScenario[];
  policyDrivers: Array<{ driver: NocBudgetDriver; signal: string; scenarioMapping: string; sourceStatus: "research_only" | "forecast_assumption" }>;
};

export type NocRiskOutput = {
  riskScore: number;
  redTeamVerdict: string;
  killCriteria: string[];
  rows: Array<NocRiskItem & { weightedScore: number; severityLabel: NocRiskLevel }>;
  monitoringTriggers: string[];
};

export type NocCapitalReturnsOutput = {
  dividendPerShare: number;
  dividendYield: number;
  fcfPayout: number;
  buybackSpend: number;
  totalShareholderReturns: number;
  cashConversion: number;
  pensionSurplus: number;
  notes: string[];
};

export type NocValuationOutput = {
  dcf: NocDcfOutput;
  fcfYieldFairValue: number;
  peFairValue: number;
  evEbitFairValue: number;
  sotpFairValue: number;
  backlogAdjustedFairValue: number;
  blendedFairValue: number;
  valuationRangeLow: number;
  valuationRangeHigh: number;
  probabilityWeightedFairValue: number;
  finalWeights: Record<string, number>;
  normalizedFcf: number;
  forwardEps: number;
  forwardSegmentOperatingIncome: number;
  sourceIsolationWarnings: ValidationWarning[];
  segmentSotpRows: Array<{ segment: string; sales: number; margin: number; ebit: number; multiple: number; value: number }>;
};
