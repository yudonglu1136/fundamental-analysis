import type { DataSourceType, Signal, ValidationWarning } from "../types";

export type EarningsFocusTopic =
  | "core_revenue"
  | "growth_portfolio"
  | "loe_or_erosion"
  | "pipeline"
  | "capital_allocation"
  | "margin"
  | "cell_therapy"
  | "launch_execution"
  | "regulatory"
  | "cash_runway";

export type EarningsEvidence = {
  id: string;
  title: string;
  sourceType: "official_press_release" | "transcript" | "market_data" | "research_synthesis";
  date: string;
  url: string;
  extractedMetric: string;
  confidence: "high" | "medium" | "low";
};

export type EarningsCallQuarter = {
  id: string;
  label: string;
  callDate: string;
  totalRevenue: number;
  revenueUnit: "USDm";
  primaryMetricLabel: string;
  primaryMetric: number;
  cashOrLiquidity: number;
  managementTone: "defensive" | "execution" | "transition" | "pipeline" | "inflection";
  marketFocus: Array<{
    topic: EarningsFocusTopic;
    intensity: number;
    summary: string;
  }>;
  analystQuestions: string[];
  aiSummary: string;
  sourceEvidenceIds: string[];
};

export type EarningsCallDataset = {
  ticker: string;
  name: string;
  sector: string;
  currency: "USD";
  currentPrice: number;
  priceDate: string;
  primaryMetricName: string;
  currentPeriodId: string;
  quarters: EarningsCallQuarter[];
  evidence: EarningsEvidence[];
  moduleSummary: string;
  valuationNote: string;
};

export type EarningsCallTrendOutput = {
  selectedQuarter: EarningsCallQuarter;
  quarters: EarningsCallQuarter[];
  topicTrendRows: Array<{
    topic: EarningsFocusTopic;
    label: string;
    direction: "rising" | "falling" | "stable" | "volatile";
    latestIntensity: number;
    eightQuarterAverage: number;
    signal: Signal;
    aiSynthesis: string;
  }>;
  overview: {
    aiTrendSummary: string;
    debateNow: string;
    risingDebates: string[];
    fadingDebates: string[];
  };
  validationWarnings: ValidationWarning[];
};

export type EarningsCallDashboardData = {
  dataset: EarningsCallDataset;
  trend: EarningsCallTrendOutput;
  dataStatus: {
    sourceType: DataSourceType;
    lastUpdated: string;
    missingFields: string[];
    validationWarnings: ValidationWarning[];
    valuationReliable: boolean;
  };
};
