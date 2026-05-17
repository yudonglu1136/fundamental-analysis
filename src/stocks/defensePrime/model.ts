import type { Scenario, ValidationWarning } from "../types";

export type DefenseSourceStatus =
  | "official_actual"
  | "management_guidance"
  | "forecast_assumption"
  | "research_only"
  | "market_data"
  | "derived"
  | "missing";

export type DefenseSource = {
  id: string;
  title: string;
  url: string;
  sourceStatus: DefenseSourceStatus;
  publisher: string;
  publishedDate?: string;
  accessedDate: string;
  notes?: string;
};

export type DefensePeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: "FY" | "Q";
  sourceStatus: "official_actual";
  sourceId: string;
  sales: number;
  operatingProfit?: number;
  adjustedOperatingProfit?: number;
  adjustedEps?: number;
  gaapEps?: number;
  freeCashFlow: number;
  operatingCashFlow: number;
  capex: number;
  backlog: number;
  orderIntake?: number;
  orderIntakeSourceStatus?: DefenseSourceStatus;
  backlogDefense?: number;
  backlogCommercial?: number;
  netIncome?: number;
  dilutedShares?: number;
  dividendPerShare?: number;
  notes?: string;
};

export type DefenseSegment = {
  id: string;
  name: string;
  sourceStatus: "official_actual" | "missing";
  sourceId: string;
  sales: number;
  operatingProfit: number;
  margin: number;
  backlog?: number;
  growth?: number;
  strategicRole: string;
  keyPrograms: string[];
  risks: string[];
};

export type DefenseGuidance = {
  year: number;
  sourceStatus: "management_guidance";
  sourceId: string;
  salesLow: number;
  salesHigh: number;
  epsLow: number;
  epsHigh: number;
  fcfLow: number;
  fcfHigh: number;
  operatingProfitLow?: number;
  operatingProfitHigh?: number;
  notes: string;
};

export type DefenseMarketData = {
  sourceStatus: "market_data";
  sourceId: string;
  price: number;
  priceDate: string;
  shares: number;
  marketCap: number;
  enterpriseValue?: number;
  dividendYield?: number;
  notes: string;
};

export type DefenseProgram = {
  name: string;
  segment: string;
  customer: string;
  stage: "mature" | "ramping" | "future option";
  geography: string;
  maturityScore: number;
  marginQualityScore: number;
  growthScore: number;
  riskScore: number;
  sourceStatus: "research_only";
  sourceId: string;
  strategicRelevance: string;
  valuationMapping: "scenario_context_only" | "risk_discount_only" | "none";
};

export type DefenseRisk = {
  id: string;
  name: string;
  probability: number;
  impact: number;
  affectedDriver: string;
  mitigation: string;
  sourceStatus: "research_only";
};

export type DefenseReportingEvent = {
  quarter: string;
  eventDate: string;
  title: string;
  sourceId: string;
  sourceStatus: "official_actual" | "management_guidance" | "research_only" | "missing";
  transcriptStatus: "official_call_available" | "official_release_only" | "missing";
  keyMetrics: Array<{ label: string; value: string; sourceStatus: DefenseSourceStatus }>;
  marketFocus: Array<{ theme: string; intensity: number; direction: "rising" | "stable" | "falling" | "new"; evidence: string }>;
  debateQuestions: string[];
  watchItems: string[];
  aiSummary: { sourceStatus: "research_only"; summary: string };
};

export type DefenseScenarioAssumption = {
  scenario: Scenario;
  revenueCagr: number;
  operatingMargin: number;
  wacc: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  probability: number;
  narrative: string;
};

export type DefenseCapitalReturns = {
  dividendPerShare: number;
  dividendsPaid?: number;
  buybacks?: number;
  fcfPayout?: number;
  payoutRatio?: number;
  policy: string;
  sourceStatus: "official_actual" | "derived" | "research_only";
  sourceId: string;
  sustainabilityView: string;
};

export type DefenseValuationAssumptions = {
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
  netDebt: number;
  dilutedShares: number;
  dividendPerShare: number;
  backlogDurabilityMaxAdjustment: number;
  weightDcf: number;
  weightFcfYield: number;
  weightEvEbit: number;
  weightPe: number;
  weightBacklogDurability: number;
};

export type DefenseDataset = {
  ticker: string;
  name: string;
  company: string;
  currency: "USD";
  sector: string;
  description: string;
  latestReportingPeriod: string;
  investmentThesis: string;
  keyDebate: string;
  marketMayMiss: string;
  reportingTrendSummary: string;
  dataGaps: string[];
  capitalReturns: DefenseCapitalReturns;
  sources: DefenseSource[];
  sourceMap: Record<string, DefenseSource>;
  periods: DefensePeriod[];
  segments: DefenseSegment[];
  guidance: DefenseGuidance;
  marketData: DefenseMarketData;
  programs: DefenseProgram[];
  risks: DefenseRisk[];
  reportingEvents: DefenseReportingEvent[];
  scenarios: DefenseScenarioAssumption[];
  assumptions: DefenseValuationAssumptions;
};

export type DefenseDashboardData = ReturnType<typeof import("./calculations").buildDefenseDashboardData>;
export type DefenseValidation = { warnings: ValidationWarning[] };
