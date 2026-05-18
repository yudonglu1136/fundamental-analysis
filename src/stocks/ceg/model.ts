import type { Scenario } from "../types";

export type CegSourceStatus =
  | "official_actual"
  | "official_seed"
  | "market_data"
  | "market_data_proxy"
  | "management_guidance"
  | "forecast_assumption"
  | "research_only"
  | "placeholder";

export type CegFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "quarter" | "annual" | "forecast";
  asOfDate: string;
  sourceStatus: CegSourceStatus;
  sourceId: string;
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
  notes?: string | null;
};

export type CegOperatingMetric = {
  periodId: string;
  asOfDate: string;
  sourceStatus: CegSourceStatus;
  nuclearGenerationTwh?: number | null;
  nuclearCapacityFactor?: number | null;
  zeroCarbonMix?: number | null;
  grossMarginPerMwh?: number | null;
  realizedPowerPrice?: number | null;
  commercialLoadGrowth?: number | null;
  dataCenterPpaCommentary?: string | null;
  nuclearPtcCommentary?: string | null;
  hedgingCommentary?: string | null;
  regulatoryCommentary?: string | null;
};

export type CegMarketData = {
  currentPrice: number;
  priceDate: string;
  sharesForMarketCap: number;
  source: string;
  sourceStatus: CegSourceStatus;
};

export type CegDataset = {
  ticker: "CEG";
  companyName: string;
  currency: "USD";
  latestReportingPeriod: string;
  marketData: CegMarketData;
  periods: CegFinancialPeriod[];
  operatingMetrics: CegOperatingMetric[];
  researchQuestions: Array<{ key: string; question: string; currentView: string; evidenceNeeded: string }>;
  sourceGaps: string[];
};

export type CegValuationAssumptions = {
  currentPrice: number;
  dilutedShares: number;
  normalizedRevenue: number;
  revenueGrowth: number;
  operatingMargin: number;
  normalizedFcfMargin: number;
  targetFcfYield: number;
  targetPe: number;
  evEbitdaMultiple: number;
  discountRate: number;
  terminalGrowth: number;
  nuclearScarcityPremium: number;
  powerPriceUpside: number;
  dataCenterDemandUplift: number;
  regulatoryHaircut: number;
  commodityHedgeHaircut: number;
  balanceSheetHaircut: number;
  dividendYield: number;
  buybackYield: number;
};

export type CegScenarioPresetMap = Record<Scenario, CegValuationAssumptions>;
