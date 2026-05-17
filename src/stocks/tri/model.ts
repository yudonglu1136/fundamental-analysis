import type { Scenario } from "../types";

export type TriSourceType =
  | "official_actual"
  | "management_guidance"
  | "management_commentary"
  | "forecast_assumption"
  | "research_only"
  | "market_data"
  | "derived";

export type TriSource = {
  id: string;
  title: string;
  url: string;
  publisher: "Thomson Reuters" | "StockAnalysis" | "Analyst";
  sourceType: TriSourceType;
  reportingPeriod?: string;
  accessedDate: string;
  notes?: string;
};

export type TriPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: "annual" | "quarterly";
  sourceType: "official_actual";
  sourceId: string;
  revenue: number;
  organicRevenueGrowth: number;
  adjustedEbitda: number;
  adjustedEbitdaMargin: number;
  operatingProfit?: number;
  adjustedEps?: number;
  operatingCashFlow?: number;
  freeCashFlow: number;
  capexPctRevenue?: number;
  recurringRevenuePct?: number;
};

export type TriSegmentName =
  | "Legal Professionals"
  | "Corporates"
  | "Tax, Audit & Accounting Professionals"
  | "Reuters News"
  | "Global Print"
  | "Eliminations/Rounding"
  | "Corporate Costs";

export type TriSegmentActual = {
  periodId: string;
  segment: TriSegmentName;
  sourceType: "official_actual" | "derived";
  sourceId: string;
  revenue: number;
  organicGrowth?: number;
  adjustedEbitda: number;
  adjustedEbitdaMargin: number;
  recurringRevenuePct?: number;
  aiExposure: "high" | "medium" | "low";
};

export type TriGuidance = {
  sourceType: "management_guidance";
  sourceId: string;
  revenueGrowthLow: number;
  revenueGrowthHigh: number;
  organicRevenueGrowthLow: number;
  organicRevenueGrowthHigh: number;
  adjustedEbitdaMarginExpansionBps: number;
  freeCashFlow: number;
  capexPctRevenue: number;
  q2OrganicGrowthLow: number;
  q2OrganicGrowthHigh: number;
  q2AdjustedEbitdaMargin: number;
  big3OrganicGrowth: number;
  big3MarginExpansionBps: number;
};

export type TriAiMilestone = {
  id: string;
  date: string;
  title: string;
  sourceType: "management_commentary";
  sourceId: string;
  productArea: "CoCounsel" | "Westlaw" | "Practical Law" | "Tax & Accounting" | "Reuters" | "Platform";
  metric?: string;
  status: "commercializing" | "scaling" | "launching" | "watch";
  thesisImpact: string;
};

export type TriMarketData = {
  ticker: "TRI";
  sourceType: "market_data";
  sourceId: string;
  currentPrice: number;
  priceDate: string;
  marketCap: number;
  enterpriseValue: number;
  sharesOutstanding: number;
  peRatio: number;
  forwardPe: number;
  dividendPerShare: number;
  dividendYield: number;
};

export type TriScenarioDriver = {
  scenario: Scenario;
  sourceType: "forecast_assumption";
  sourceId: string;
  revenueCagr: number;
  big3OrganicGrowth: number;
  terminalAdjustedEbitdaMargin: number;
  fcfConversionOfEbitda: number;
  targetFcfYield: number;
  targetEvEbitda: number;
  targetPe: number;
  wacc: number;
  terminalGrowth: number;
  aiPremium: number;
  aiPremiumCap: number;
  riskDiscount: number;
  riskDiscountCap: number;
  narrative: string;
};

export type TriDataset = {
  company: "Thomson Reuters Corporation";
  ticker: "TRI";
  currency: "USD";
  reportingCurrency: "USD";
  latestReportingPeriod: string;
  sources: TriSource[];
  periods: TriPeriod[];
  segments: TriSegmentActual[];
  guidance: TriGuidance;
  aiMilestones: TriAiMilestone[];
  marketData: TriMarketData;
  scenarioDrivers: TriScenarioDriver[];
  notes: string[];
};

export type TriValuationAssumptions = {
  currentPrice: number;
  revenueCagr: number;
  big3OrganicGrowth: number;
  terminalAdjustedEbitdaMargin: number;
  fcfConversionOfEbitda: number;
  targetFcfYield: number;
  targetEvEbitda: number;
  targetPe: number;
  wacc: number;
  terminalGrowth: number;
  taxRate: number;
  capexPctRevenue: number;
  workingCapitalPctRevenueGrowth: number;
  aiPremium: number;
  aiPremiumCap: number;
  riskDiscount: number;
  riskDiscountCap: number;
  dilutedShares: number;
  netDebt: number;
  dividendPerShare: number;
  weightDcf: number;
  weightFcfYield: number;
  weightEvEbitda: number;
  weightPe: number;
  weightSotp: number;
};
