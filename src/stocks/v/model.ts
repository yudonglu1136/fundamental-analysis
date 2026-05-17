import type { Scenario } from "../types";

export type VSourceStatus =
  | "official_actual"
  | "official_seed"
  | "market_data_proxy"
  | "management_guidance"
  | "forecast_assumption"
  | "transcript_commentary"
  | "research_only"
  | "market_data";

export type VFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "quarter" | "annual" | "forecast";
  periodStartDate?: string;
  periodEndDate?: string;
  sourceStatus: VSourceStatus;
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

export type VOperatingMetricSnapshot = {
  periodId?: string;
  asOfDate: string;
  sourceStatus: VSourceStatus;
  grossDollarVolume?: number | null;
  purchaseVolume?: number | null;
  crossBorderVolumeGrowth?: number | null;
  switchedTransactions?: number | null;
  switchedTransactionsGrowth?: number | null;
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

export type VSegmentFinancial = {
  periodId: string;
  segment: string;
  taxonomy?: string | null;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  growth?: number | null;
  sourceStatus: VSourceStatus;
  notes?: string | null;
};

export type VMarketData = {
  currentPrice: number;
  priceDate: string;
  sharesForMarketCap: number;
  marketCap?: number;
  source: string;
  sourceStatus: VSourceStatus;
};

export type VDataset = {
  periods: VFinancialPeriod[];
  operatingMetrics: VOperatingMetricSnapshot[];
  segmentFinancials: VSegmentFinancial[];
  marketData: VMarketData;
  latestReportingPeriod: string;
};

export type ValuationAssumptions = {
  currentPrice: number;
  dilutedShares: number;
  revenueGrowth: number;
  crossBorderGrowth: number;
  switchedTransactionGrowth: number;
  valueAddedServicesGrowth: number;
  operatingMargin: number;
  normalizedFcfMargin: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  discountRate: number;
  terminalGrowth: number;
  regulatoryHaircut: number;
  alternativeRailsHaircut: number;
  buybackYield: number;
  dividendYield: number;
};

export type VScenarioPresetMap = Record<Scenario, ValuationAssumptions>;
