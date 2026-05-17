import type { DataSourceType } from "../types";

export type NvdaSourceStatus = "official_actual" | "market_data" | "forecast_assumption" | "research_only" | "transcript_commentary" | "management_guidance";

export type NvdaPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter: string;
  periodType: "quarter" | "annual" | "forecast";
  sourceStatus: NvdaSourceStatus;
  revenue: number;
  grossProfit: number;
  grossMargin: number;
  operatingIncome: number;
  operatingMargin: number;
  netIncome?: number | null;
  dilutedEps?: number | null;
  dilutedShares: number;
  operatingCashFlow?: number | null;
  capex?: number | null;
  freeCashFlow?: number | null;
  inventory?: number | null;
  accountsReceivable?: number | null;
  deferredRevenue?: number | null;
  cashAndMarketableSecurities?: number | null;
  debt?: number | null;
};

export type NvdaSegment = {
  periodId: string;
  segment: "Data Center" | "Gaming" | "Professional Visualization" | "Automotive" | "OEM / Other" | string;
  sourceStatus: NvdaSourceStatus;
  revenue: number;
  growth?: number | null;
  grossMargin?: number | null;
  notes?: string | null;
};

export type NvdaOperatingMetric = {
  periodId: string;
  sourceStatus: NvdaSourceStatus;
  dataCenterRevenue?: number | null;
  gamingRevenue?: number | null;
  networkingRevenue?: number | null;
  computeRevenue?: number | null;
  dataCenterGrowth?: number | null;
  gamingGrowth?: number | null;
  grossMargin?: number | null;
  operatingMargin?: number | null;
  inventory?: number | null;
  fcfConversion?: number | null;
  productCyclePhase?: string | null;
  acceleratorMoatScore?: number | null;
  chinaRiskScore?: number | null;
  supplyConstraintScore?: number | null;
};

export type NvdaDataset = {
  marketData: {
    currentPrice: number;
    priceDate: string;
    sharesOutstanding: number;
    currency: "USD";
    source: string;
    sourceStatus: NvdaSourceStatus;
  };
  periods: NvdaPeriod[];
  segments: NvdaSegment[];
  operatingMetrics: NvdaOperatingMetric[];
  sourceNotes: string[];
  selectedPeriodId?: string;
  dataSourceType?: DataSourceType;
};
