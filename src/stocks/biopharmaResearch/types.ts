import type { DataQualityBadgeType, MetricFormat, Scenario, Signal, ValidationWarning } from "../types";
import type { EarningsCallDataset } from "../earningsCall/types";

export type BiopharmaEvidenceSourceType =
  | "official_press_release"
  | "SEC_10K"
  | "SEC_10Q"
  | "SEC_20F"
  | "FDA_label"
  | "clinicaltrials"
  | "conference_abstract"
  | "publication"
  | "transcript"
  | "market_data"
  | "analyst_consensus"
  | "research_assumption";

export type BiopharmaEvidenceRecord = {
  id: string;
  sourceTitle: string;
  sourceType: BiopharmaEvidenceSourceType;
  date: string;
  url: string;
  quote?: string;
  extractedMetric: string;
  confidence: "high" | "medium" | "low";
  usedInModel: boolean;
  notes: string;
};

export type BiopharmaFinancialActual = {
  period: string;
  revenue: number;
  primaryGrowthMetricLabel: string;
  primaryGrowthMetric: number;
  operatingIncome?: number;
  nonGaapEps?: number;
  productGrossMargin?: number;
  rAndD?: number;
  sgAndA?: number;
  cashAndInvestments?: number;
  debt?: number;
  netDebt?: number;
  operatingCashFlow?: number;
  freeCashFlow?: number;
  sourceEvidenceIds: string[];
};

export type BiopharmaGuidanceItem = {
  metric: string;
  low?: number;
  high?: number;
  midpoint?: number;
  unit: "USDm" | "USD/share" | "percent" | "text";
  period: string;
  status: "issued" | "raised" | "reaffirmed" | "withdrawn" | "research_assumption";
  commentary: string;
  sourceEvidenceIds: string[];
};

export type BiopharmaProductLine = {
  name: string;
  category: string;
  revenue2025?: number;
  latestQuarterRevenue?: number;
  growth: string;
  role: "core_cash_flow" | "growth_driver" | "declining_legacy" | "launch_asset" | "option_asset";
  moat: string;
  pressure: string;
  sourceEvidenceIds: string[];
};

export type BiopharmaPipelineAsset = {
  assetName: string;
  modality: string;
  targetOrMechanism: string;
  indication: string;
  stage: "approved" | "filed" | "phase_3" | "phase_2" | "phase_1" | "preclinical" | "platform";
  partner?: string;
  expectedCatalyst: string;
  strategicRole: "core" | "near_adjacent" | "long_dated_option" | "platform_option" | "defensive_lifecycle";
  estimatedLaunchYear: number;
  estimatedPeakSales: number;
  probabilityOfSuccess: number;
  discountRate: number;
  developmentCostRemaining: number;
  economicsShare: number;
  evidenceScore: number;
  riskScore: number;
  assumptionType: "official" | "research_only";
  sourceEvidenceIds: string[];
};

export type BiopharmaStrategyPriority = {
  title: string;
  summary: string;
  timeHorizon: "near_term" | "medium_term" | "long_term";
  evidenceIds: string[];
};

export type BiopharmaAnalystDebate = {
  debate: string;
  bullCase: string;
  bearCase: string;
  whatToWatch: string;
  evidenceIds: string[];
};

export type BiopharmaCatalyst = {
  date: string;
  catalyst: string;
  impact: "high" | "medium" | "low";
  thesisRelevance: string;
  evidenceIds: string[];
};

export type BiopharmaRisk = {
  risk: string;
  probability: number;
  severity: number;
  detectability: number;
  timeToMatter: string;
  mitigation: string;
  killCriteria: string;
  evidenceIds: string[];
};

export type BiopharmaValuationScenario = {
  scenario: Scenario;
  coreMetricLabel: string;
  coreMetricValue?: number;
  coreMultiple?: number;
  coreValue?: number;
  pipelineHaircut: number;
  platformOptionValue: number;
  cashOrDebtAdjustment: number;
  expectedDividends?: number;
  summary: string;
};

export type BiopharmaAnalystSnapshot = {
  rating: string;
  priceTarget?: number;
  source: string;
  sourceDate: string;
  summary: string;
  evidenceIds: string[];
};

export type BiopharmaResearchDataset = {
  ticker: string;
  name: string;
  sector: string;
  currency: "USD";
  currentPrice: number;
  priceDate: string;
  sharesOutstanding: number;
  marketCap: number;
  enterpriseValue?: number;
  reportingCurrency: "USD";
  modelArchetype: "mature_pharma_transition" | "cash_flow_plus_pipeline" | "commercial_stage_biotech_nav";
  thesis: string;
  companyStrategy: string;
  variantView: string;
  evidence: BiopharmaEvidenceRecord[];
  financials: BiopharmaFinancialActual[];
  products: BiopharmaProductLine[];
  guidance: BiopharmaGuidanceItem[];
  pipeline: BiopharmaPipelineAsset[];
  strategyPriorities: BiopharmaStrategyPriority[];
  analystDebates: BiopharmaAnalystDebate[];
  analystSnapshot: BiopharmaAnalystSnapshot;
  catalysts: BiopharmaCatalyst[];
  risks: BiopharmaRisk[];
  valuationScenarios: BiopharmaValuationScenario[];
  crossChecks: Array<{
    label: string;
    value: number;
    format: MetricFormat;
    interpretation: string;
  }>;
  keyAssumptions: Array<{
    label: string;
    value: number | string;
    source: "official" | "market_data" | "research_only";
    evidenceIds: string[];
  }>;
  earnings: EarningsCallDataset;
};

export type BiopharmaPipelineValuation = BiopharmaPipelineAsset & {
  yearsToLaunch: number;
  unadjustedValue: number;
  probabilityAdjustedValue: number;
  discountedValue: number;
  rnpv: number;
  valuePerShare: number;
};

export type BiopharmaValuationOutput = {
  scenario: Scenario;
  coreValue: number;
  coreValuePerShare: number;
  pipelineValue: number;
  pipelineValuePerShare: number;
  platformOptionValue: number;
  platformOptionPerShare: number;
  cashOrDebtAdjustment: number;
  cashOrDebtPerShare: number;
  fairValue: number;
  upsideDownside: number;
  expectedReturn3Y: number;
  expectedDividends: number;
  summary: string;
};

export type BiopharmaDashboardData = {
  dataset: BiopharmaResearchDataset;
  latestFinancial: BiopharmaFinancialActual;
  pipelineValuations: BiopharmaPipelineValuation[];
  valuationOutputs: BiopharmaValuationOutput[];
  selectedValuation: BiopharmaValuationOutput;
  researchScores: {
    fundamentals: number;
    pipeline: number;
    strategy: number;
    riskAdjusted: number;
  };
  topDrivers: Array<{ label: string; detail: string; signal: Signal; badge: DataQualityBadgeType }>;
  validationWarnings: ValidationWarning[];
};
