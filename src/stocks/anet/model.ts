import type { Scenario } from "../types";

export type AnetSourceStatus =
  | "official_actual"
  | "official_seed"
  | "market_data_proxy"
  | "management_guidance"
  | "forecast_assumption"
  | "transcript_commentary"
  | "research_only"
  | "market_data";

export type AnetFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "quarter" | "annual" | "forecast";
  periodStartDate?: string;
  periodEndDate?: string;
  sourceStatus: AnetSourceStatus;
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

export type AnetOperatingMetricSnapshot = {
  periodId?: string;
  asOfDate: string;
  sourceStatus: AnetSourceStatus;
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
  cloudTitanRevenue?: number | null;
  cloudTitanGrowth?: number | null;
  aiNetworkingRevenue?: number | null;
  aiNetworkingGrowth?: number | null;
  campusRevenue?: number | null;
  campusGrowth?: number | null;
  highSpeedPortShipments?: number | null;
  highSpeedPortGrowth?: number | null;
  cloudCustomerConcentration?: number | null;
  backlog?: number | null;
  inventoryDays?: number | null;
  grossMarginCommentary?: string | null;
  cloudTitanCommentary?: string | null;
  aiNetworkingCommentary?: string | null;
  campusCommentary?: string | null;
  supplyChainCommentary?: string | null;
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

export type AnetSegmentFinancial = {
  periodId: string;
  segment: string;
  taxonomy?: string | null;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  growth?: number | null;
  sourceStatus: AnetSourceStatus;
  notes?: string | null;
};

export type AnetMarketData = {
  currentPrice: number;
  priceDate: string;
  sharesForMarketCap: number;
  marketCap?: number;
  source: string;
  sourceStatus: AnetSourceStatus;
};

export type AnetDataset = {
  periods: AnetFinancialPeriod[];
  operatingMetrics: AnetOperatingMetricSnapshot[];
  segmentFinancials: AnetSegmentFinancial[];
  marketData: AnetMarketData;
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

export type AnetScenarioPresetMap = Record<Scenario, ValuationAssumptions>;
