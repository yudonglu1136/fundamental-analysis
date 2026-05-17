import type { Scenario } from "../types";

export type MaSourceStatus =
  | "official_actual"
  | "official_seed"
  | "market_data_proxy"
  | "management_guidance"
  | "forecast_assumption"
  | "transcript_commentary"
  | "research_only"
  | "market_data";

export type MaFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "quarter" | "annual" | "forecast";
  periodStartDate?: string;
  periodEndDate?: string;
  sourceStatus: MaSourceStatus;
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

export type MaOperatingMetricSnapshot = {
  periodId?: string;
  asOfDate: string;
  sourceStatus: MaSourceStatus;
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

export type MaSegmentFinancial = {
  periodId: string;
  segment: string;
  taxonomy?: string | null;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  growth?: number | null;
  sourceStatus: MaSourceStatus;
  notes?: string | null;
};

export type MaMarketData = {
  currentPrice: number;
  priceDate: string;
  sharesForMarketCap: number;
  marketCap?: number;
  source: string;
  sourceStatus: MaSourceStatus;
};

export type MaDataset = {
  periods: MaFinancialPeriod[];
  operatingMetrics: MaOperatingMetricSnapshot[];
  segmentFinancials: MaSegmentFinancial[];
  marketData: MaMarketData;
  latestReportingPeriod: string;
};

export type MaValuationAssumptions = {
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

export type MaScenarioPresetMap = Record<Scenario, MaValuationAssumptions>;
