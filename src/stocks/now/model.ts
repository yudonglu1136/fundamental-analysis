import type { Scenario } from "../types";

export type NowSourceStatus =
  | "official_actual"
  | "official_seed"
  | "market_data_proxy"
  | "management_guidance"
  | "forecast_assumption"
  | "transcript_commentary"
  | "research_only"
  | "market_data";

export type NowFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "quarter" | "annual" | "forecast";
  periodStartDate?: string;
  periodEndDate?: string;
  sourceStatus: NowSourceStatus;
  sourceId: string;
  asOfDate?: string;
  revenue: number;
  operatingIncome: number;
  operatingMargin?: number | null;
  netIncome?: number | null;
  dilutedEps?: number | null;
  dilutedShares?: number | null;
  operatingCashFlow?: number | null;
  capex?: number | null;
  freeCashFlow?: number | null;
  dividendsPaid?: number | null;
  buybacks?: number | null;
  dividendPerShare?: number | null;
  notes?: string | null;
};

export type NowOperatingMetricSnapshot = {
  periodId?: string;
  asOfDate: string;
  sourceStatus: NowSourceStatus;
  grossDollarVolume?: number | null;
  purchaseVolume?: number | null;
  crossBorderVolumeGrowth?: number | null;
  switchedTransactions?: number | null;
  switchedTransactionsGrowth?: number | null;
  subscriptionRevenue?: number | null;
  subscriptionRevenueGrowth?: number | null;
  currentRpo?: number | null;
  currentRpoGrowth?: number | null;
  remainingPerformanceObligations?: number | null;
  netRetentionRate?: number | null;
  largeCustomerCount?: number | null;
  agenticAiArr?: number | null;
  agenticAiCustomers?: number | null;
  proPlusAdoptionRate?: number | null;
  processedTransactions?: number | null;
  cardsAccounts?: number | null;
  rebatesIncentives?: number | null;
  takeRate?: number | null;
  takeRateCommentary?: string | null;
  crossBorderCommentary?: string | null;
  travelCommentary?: string | null;
  valueAddedServicesCommentary?: string | null;
  operatingLeverageCommentary?: string | null;
  fxImpactCommentary?: string | null;
  regulatoryCommentary?: string | null;
  competitionCommentary?: string | null;
  capitalReturnCommentary?: string | null;
  normalizedFcfCommentary?: string | null;
};

export type NowSegmentFinancial = {
  periodId: string;
  segment: string;
  taxonomy?: string | null;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  growth?: number | null;
  sourceStatus: NowSourceStatus;
  notes?: string | null;
};

export type NowMarketData = {
  currentPrice: number;
  priceDate: string;
  sharesForMarketCap: number;
  marketCap?: number;
  source: string;
  sourceStatus: NowSourceStatus;
};

export type NowDataset = {
  periods: NowFinancialPeriod[];
  operatingMetrics: NowOperatingMetricSnapshot[];
  segmentFinancials: NowSegmentFinancial[];
  marketData: NowMarketData;
  latestReportingPeriod: string;
};

export type ValuationAssumptions = {
  currentPrice: number;
  dilutedShares: number;
  revenueGrowth: number;
  subscriptionGrowth: number;
  currentRpoGrowth: number;
  agenticAiGrowth: number;
  proPlusAdoptionRate: number;
  netRetentionRate: number;
  operatingMargin: number;
  normalizedFcfMargin: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvRevenue: number;
  discountRate: number;
  terminalGrowth: number;
  aiExecutionHaircut: number;
  platformCompetitionHaircut: number;
  sbcDilutionHaircut: number;
  buybackYield: number;
  dividendYield: number;
};

export type NowScenarioPresetMap = Record<Scenario, ValuationAssumptions>;
