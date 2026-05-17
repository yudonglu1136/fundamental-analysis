import type { Scenario } from "../types";

export type AaplSourceStatus =
  | "official_actual"
  | "management_guidance"
  | "forecast_assumption"
  | "transcript_commentary"
  | "research_only"
  | "market_data";

export type AaplFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "quarter" | "annual" | "forecast";
  periodStartDate?: string;
  periodEndDate?: string;
  sourceStatus: AaplSourceStatus;
  sourceId: string;
  asOfDate?: string;
  revenue: number;
  costOfRevenue?: number | null;
  grossProfit?: number | null;
  grossMargin?: number | null;
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
  cashAndMarketableSecurities?: number | null;
  debt?: number | null;
  netCashDebt?: number | null;
  notes?: string;
};

export type AaplProductFinancial = {
  periodId: string;
  label?: string;
  productCategory: string;
  revenue?: number | null;
  costOfRevenue?: number | null;
  grossProfit?: number | null;
  grossMargin?: number | null;
  growth?: number | null;
  asOfDate?: string;
  sourceStatus: AaplSourceStatus;
  notes?: string;
};

export type AaplGeographicFinancial = {
  periodId: string;
  geography: string;
  revenue?: number | null;
  growth?: number | null;
  asOfDate?: string;
  sourceStatus: AaplSourceStatus;
  notes?: string;
};

export type AaplOperatingMetricSnapshot = {
  periodId?: string;
  asOfDate: string;
  sourceStatus: AaplSourceStatus;
  installedBaseCommentary?: string | null;
  activeDevicesCommentary?: string | null;
  paidSubscriptionsCommentary?: string | null;
  appStoreRegulationCommentary?: string | null;
  chinaCommentary?: string | null;
  fxImpactCommentary?: string | null;
  iphoneCycleCommentary?: string | null;
  aiAppleIntelligenceCommentary?: string | null;
  visionProCommentary?: string | null;
  supplyChainCommentary?: string | null;
  capitalReturnCommentary?: string | null;
  normalizedFcfCommentary?: string | null;
  notes?: string | null;
};

export type AaplMarketData = {
  currentPrice: number;
  priceDate: string;
  sharesForMarketCap: number;
  marketCap?: number;
  source: string;
  sourceStatus: AaplSourceStatus;
};

export type AaplDataset = {
  periods: AaplFinancialPeriod[];
  productFinancials: AaplProductFinancial[];
  geographicFinancials: AaplGeographicFinancial[];
  operatingMetrics: AaplOperatingMetricSnapshot[];
  marketData: AaplMarketData;
  latestReportingPeriod: string;
};

export type AaplValuationAssumptions = {
  currentPrice: number;
  dilutedShares: number;
  netCashDebt: number;
  iPhoneGrowth: number;
  servicesGrowth: number;
  otherProductsGrowth: number;
  productsGrossMargin: number;
  servicesGrossMargin: number;
  operatingMargin: number;
  normalizedFcfMargin: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  productsSalesMultiple: number;
  servicesSalesMultiple: number;
  aiOptionalityPerShare: number;
  servicesRegulatoryHaircut: number;
  chinaRiskHaircut: number;
  buybackYield: number;
  dividendYield: number;
};

export type AaplScenarioPresetMap = Record<Scenario, AaplValuationAssumptions>;
