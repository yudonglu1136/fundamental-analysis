import type { DataQualityBadgeType, MetricFormat, PeriodOption, Scenario, SummaryMetric } from "../types";

export type DeepResearchSourceStatus =
  | "official_actual"
  | "market_data"
  | "market_data_proxy"
  | "forecast_assumption"
  | "derived"
  | "research_only"
  | "placeholder";

export type DeepResearchMetricPoint = {
  period: string;
  label?: string;
  [key: string]: string | number | undefined;
};

export type DeepResearchKpiSeries = {
  key: string;
  title: string;
  subtitle: string;
  leftAxisLabel?: string;
  rightAxisLabel?: string;
  sourceStatus: DeepResearchSourceStatus;
  points: DeepResearchMetricPoint[];
  measures: Array<{
    key: string;
    label: string;
    format: MetricFormat;
    chartType: "bar" | "line";
    color: string;
    axis?: "left" | "right";
  }>;
};

export type DeepResearchQuestion = {
  key: string;
  question: string;
  currentView: string;
  metric: string;
  evidenceNeeded: string;
  valuationTie: string;
  bearCase: string;
};

export type DeepResearchSection = {
  key: string;
  tab: string;
  title: string;
  thesis: string;
  evidence: string[];
  watchItems: string[];
  sourceStatus: DeepResearchSourceStatus;
};

export type DeepResearchQuarterlyQuestion = {
  quarter: string;
  eventDate: string;
  headline: string;
  keyQuestions: string[];
  managementTone: string;
  modelReadThrough: string;
  riskSignal: "Positive" | "Neutral" | "Negative" | "Inflecting" | "Needs Review";
  sourceStatus: DeepResearchSourceStatus;
};

export type DeepResearchHistoricalValuation = {
  id: string;
  eventDate: string;
  fiscalPeriod: string;
  asOfPrice: number;
  fairValue: number;
  targetPrice3Y: number;
  expectedShareholderCagr: number;
  method: string;
  sourceStatus: DeepResearchSourceStatus;
  warnings: string[];
  methodOutputs: Array<{
    label: string;
    value: number;
    format: MetricFormat;
    description: string;
  }>;
};

export type DeepResearchValuationAssumptions = {
  currentPrice: number;
  revenueBase: number;
  revenueCagr3Y: number;
  terminalGrowth: number;
  normalizedFcfMargin: number;
  exitFcfMultiple: number;
  evRevenueMultiple: number;
  discountRate: number;
  netCashDebt: number;
  dilutedShares: number;
  qualityAdjustment: number;
  riskHaircut: number;
  dividendYield: number;
  buybackYield: number;
};

export type DeepResearchValuationSetup = {
  defaultAssumptions: DeepResearchValuationAssumptions;
  scenarios: Record<Scenario, DeepResearchValuationAssumptions>;
  modelDescription: string;
  noFutureLeakageNote: string;
};

export type DeepResearchRiskItem = {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  killSignal: string;
};

export type DeepResearchDataset = {
  ticker: string;
  companyName: string;
  sector: string;
  archetype: string;
  currency: "USD";
  description: string;
  updatedAt: string;
  marketData: {
    currentPrice: number;
    priceDate: string;
    source: string;
    sourceStatus: DeepResearchSourceStatus;
  };
  tabs: Array<{ value: string; label: string }>;
  periods: PeriodOption[];
  summaryMetrics: SummaryMetric[];
  researchQuestions: DeepResearchQuestion[];
  kpiSeries: DeepResearchKpiSeries[];
  deepDiveSections: DeepResearchSection[];
  quarterlyQuestions: DeepResearchQuarterlyQuestion[];
  historicalValuations: DeepResearchHistoricalValuation[];
  valuation: DeepResearchValuationSetup;
  risks: DeepResearchRiskItem[];
  monitoring: string[];
  sourceGaps: string[];
  backendStatus: {
    supported: boolean;
    detail: string;
    nextSteps: string[];
  };
  qualityBadges: Array<{
    label: string;
    value: string;
    badge: DataQualityBadgeType;
  }>;
};
