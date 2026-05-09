import type { ComponentType } from "react";

export type Scenario = "Bear" | "Base" | "Bull";
export type DataSourceType = "mock" | "excel" | "csv" | "api" | "manual";
export type Signal = "Positive" | "Neutral" | "Negative" | "Inflecting" | "Compute Constrained" | "Needs Review";
export type PeriodOption = { value: string; label: string };
export type StockTab = { value: string; label: string };
export type MetricFormat = "currency" | "percent" | "number" | "multiple";
export type DataQualityBadgeType = "Actual" | "Assumption" | "Derived" | "Placeholder" | "Needs Review";
export type ValuationSourceType = "actual" | "consensus" | "assumption" | "derived" | "placeholder";
export type ValuationPeriodicity = "quarterly" | "half-year" | "annual" | "LTM" | "forward annual";
export type ValuationUnit = "USD" | "GBP" | "GBX" | "percent" | "multiple" | "number" | "share";

export type SummaryMetric = {
  key: string;
  label: string;
  value: number;
  delta?: number;
  format: MetricFormat;
  description: string;
  badge: DataQualityBadgeType;
};

export type ValidationWarning = {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
};

export type DataStatus = {
  sourceType: DataSourceType;
  lastUpdated: string;
  missingFields: string[];
  validationWarnings: ValidationWarning[];
  valuationReliable: boolean;
};

export type ValuationScenarioPoint = {
  scenario: Scenario;
  fairValue: number;
  upsideDownside: number;
  expectedReturn3Y: number;
  targetPrice3Y?: number;
  cumulativeDividends?: number;
  summary?: string;
};

export type ValuationResult = {
  warning?: string;
  currentPrice: number;
  validationWarnings?: ValidationWarning[];
  fairValues: ValuationScenarioPoint[];
  methodCards: Array<{
    key: string;
    label: string;
    value: number;
    format: MetricFormat;
    description: string;
  }>;
  expectedReturnBridge: Array<{
    key: string;
    label: string;
    value: number;
    format: MetricFormat;
    description?: string;
  }>;
  customSummary?: string;
  sensitivityTables: {
    title: string;
    table: Array<Array<string | number>>;
  }[];
};

export type PriceMetadata = {
  ticker: string;
  currentPrice: number;
  currency: "USD" | "GBP";
  unit: "share";
  asOfDate: string;
  source: ValuationSourceType;
  marketReference: number;
  provenance: string;
};

export interface ValuationAssumption {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: "currency" | "percent" | "multiple" | "number";
  source: ValuationSourceType;
  description: string;
  category: string;
  unit?: ValuationUnit;
  periodicity?: ValuationPeriodicity;
  asOfDate?: string;
  provenance?: string;
}

export interface ValuationScenario {
  name: Scenario;
  assumptions: Record<string, number>;
}

export interface StockValuationConfig {
  ticker: string;
  modelType: string;
  priceMetadata?: PriceMetadata;
  assumptions: ValuationAssumption[];
  scenarios: ValuationScenario[];
  calculateValuation: (assumptions: Record<string, number>, data: unknown) => ValuationResult;
}

export type DashboardInterpretation = {
  title: string;
  signal: Signal;
  detail: string;
  badge: DataQualityBadgeType;
};

export type StockDashboardProps = {
  module: StockModule;
  scenario: Scenario;
  onScenarioChange: (scenario: Scenario) => void;
  period: string;
  onPeriodChange: (period: string) => void;
  dataSourceType: DataSourceType;
  onDataSourceChange: (source: DataSourceType) => void;
};

export interface StockModule {
  ticker: string;
  name: string;
  sector: string;
  currency: string;
  description: string;
  tabs: StockTab[];
  periods: PeriodOption[];
  data: unknown;
  getDefaultPeriod: () => string;
  calculateSummary: (data: unknown, assumptions?: unknown) => SummaryMetric[];
  calculateValuation: (data: unknown, assumptions?: unknown, scenario?: Scenario) => ValuationResult;
  valuationConfig: StockValuationConfig;
  Dashboard: ComponentType<StockDashboardProps>;
}
