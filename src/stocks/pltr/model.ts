import type { Scenario, ValidationWarning } from "../types";

export type PltrSourceType =
  | "official_ir"
  | "sec_filing"
  | "company_presentation"
  | "transcript"
  | "yfinance"
  | "derived"
  | "assumption"
  | "manual_todo";

export type PltrSourceConfidence = "high" | "medium" | "low" | "todo";
export type PltrMetricUnit = "USDm" | "USD" | "percent" | "count" | "shares_m" | "multiple" | "score" | "text";

export type PltrMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: PltrMetricUnit;
  period: string;
  sourceUrl: string | null;
  sourceType: PltrSourceType;
  sourceConfidence: PltrSourceConfidence;
  notes: string;
};

export type PltrSegment = "US Government" | "International Government" | "US Commercial" | "International Commercial";
export type PltrCustomerType = "Government" | "Commercial";
export type PltrProduct = "Gotham" | "Foundry" | "AIP" | "Apollo";

export type PltrActualQuarter = {
  periodId: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  periodEnd: string;
  metrics: Record<string, PltrMetric>;
};

export type PltrGuidancePoint = {
  id: string;
  fiscalYear: number;
  period: string;
  metric: string;
  low: number | null;
  high: number | null;
  midpoint: number | null;
  unit: PltrMetricUnit;
  sourceUrl: string;
  sourceType: PltrSourceType;
  sourceConfidence: PltrSourceConfidence;
  notes: string;
};

export type PltrResearchSignal = {
  id: string;
  label: string;
  category: "AIP" | "Ontology" | "Government" | "Commercial" | "Margin" | "SBC" | "Risk" | "Valuation";
  score: number;
  direction: "positive" | "neutral" | "negative" | "mixed";
  evidence: string;
  sourceUrl: string | null;
  sourceType: PltrSourceType;
  valuationImpactAllowed: false;
  notes: string;
};

export type PltrTranscriptTopic =
  | "AIP"
  | "AIP bootcamp"
  | "bootcamp"
  | "Commercial growth"
  | "US Commercial"
  | "Government"
  | "US Government"
  | "International Government"
  | "Defense"
  | "Ontology"
  | "Foundry"
  | "Gotham"
  | "Apollo"
  | "Customer count"
  | "customer growth"
  | "Large deals"
  | "Net dollar retention"
  | "Rule of 40"
  | "Margin"
  | "margin"
  | "SBC"
  | "Dilution"
  | "dilution"
  | "Pricing"
  | "guidance"
  | "AI monetization"
  | "Competitive moat"
  | "Deployment speed"
  | "Sales efficiency"
  | "sales efficiency"
  | "Competition"
  | "Valuation"
  | "valuation";

export type PltrTranscriptEvent = {
  transcriptId: string;
  ticker: "PLTR";
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  callDate: string;
  sourceName: string;
  transcriptUrl: string | null;
  officialIrUrl: string | null;
  earningsReleaseUrl: string | null;
  shareholderLetterUrl: string | null;
  businessUpdatePdfUrl: string | null;
  status: "parsed" | "raw_fetched" | "manifest_only" | "missing_source" | "needs_review";
  notes: string;
};

export type PltrQaPair = {
  id: string;
  transcriptId: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  analystName: string;
  analystFirm: string;
  question: string;
  managementSpeaker: string;
  managementRole: string;
  answer: string;
  topicTags: PltrTranscriptTopic[];
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  evidenceStrength: "high" | "medium" | "low";
  relatedMetricKey?: string;
  sourcePath: string;
  modelReady: false;
  valuationImpactAllowed: false;
};

export type PltrTopicTrendPoint = {
  periodId: string;
  fiscalYear: number;
  fiscalQuarter: number;
  topic: PltrTranscriptTopic;
  mentions: number;
  preparedRemarkMentions?: number;
  qaMentions?: number;
  evidenceStrength: "high" | "medium" | "low";
};

export type PltrMarketData = {
  ticker: "PLTR";
  currentPrice: number;
  priceDate: string;
  marketCap: number | null;
  enterpriseValue: number | null;
  netCash: number | null;
  dilutedShares: number | null;
  sourceUrl: string | null;
  sourceType: PltrSourceType;
  sourceConfidence: PltrSourceConfidence;
  notes: string;
};

export type PltrDataset = {
  actuals: PltrActualQuarter[];
  guidance: PltrGuidancePoint[];
  researchSignals: PltrResearchSignal[];
  transcriptEvents: PltrTranscriptEvent[];
  qaPairs: PltrQaPair[];
  topicTrends: PltrTopicTrendPoint[];
  marketData: PltrMarketData;
  sources: PltrSourceRecord[];
  dataStatus: {
    lastUpdated: string;
    sourceNote: string;
    warnings: ValidationWarning[];
  };
};

export type PltrSourceRecord = {
  id: string;
  label: string;
  url: string;
  sourceType: PltrSourceType;
  sourceConfidence: PltrSourceConfidence;
  notes: string;
};

export type PltrValuationAssumptions = {
  currentPrice: number;
  baseRevenue: number;
  revenueCagrYears1To5: number;
  terminalRevenueGrowth: number;
  adjustedOperatingMargin: number;
  gaapOperatingMargin: number;
  fcfMargin: number;
  sbcAsPctRevenue: number;
  normalizedSbcAsPctRevenue: number;
  dilutionRate: number;
  taxRate: number;
  wacc: number;
  terminalMultiple: number;
  revenueMultiple: number;
  fcfYield: number;
  netCash: number;
  dilutedShares: number;
  ruleOf40MultipleSlope: number;
};

export type PltrScenarioName = Scenario | "Hyper Bull";

export type PltrScenarioDefinition = {
  name: PltrScenarioName;
  summary: string;
  assumptions: Partial<PltrValuationAssumptions> & {
    commercialRevenueCagr?: number;
    governmentRevenueCagr?: number;
  };
};

export type PltrValuationMethod = {
  key: string;
  label: string;
  fairValue: number;
  description: string;
};

export type PltrExecutionRequirement =
  | "valuation supported by fundamentals"
  | "valuation requires premium execution"
  | "valuation requires near-perfect execution"
  | "valuation requires speculative hyper-growth";

export type PltrImpliedExpectationsScenario = {
  key: string;
  label: string;
  revenueCagr: number;
  terminalRevenue: number;
  fcfMargin: number;
  normalizedSbcAsPctRevenue: number;
  dilutedShareCountCagr: number;
  terminalDilutedShares: number;
  terminalFcf: number;
  terminalFcfPerShare: number;
  exitMultiple: number;
  fairValuePerShare: number;
  expectedCagr3Y: number;
  expectedCagr5Y: number;
  executionRequirement: PltrExecutionRequirement;
  notes: string;
};

export type PltrReverseDcf = {
  currentPrice: number;
  dilutedShares: number;
  netCash: number;
  currentEquityValue: number;
  currentEnterpriseValue: number;
  currentEvToRevenue: number;
  currentEvToFcf: number;
  requiredRevenueCagr: number;
  requiredFcfMargin: number;
  requiredTerminalMultiple: number;
  impliedDilutionDrag: number;
  impliedTerminalRevenue: number;
  impliedTerminalFcf: number;
  impliedTerminalFcfPerShare: number;
  marketImpliedExecutionRequirement: PltrExecutionRequirement;
  expectationScenarios: PltrImpliedExpectationsScenario[];
  notes: string[];
};

export type PltrScenarioOutput = {
  scenario: PltrScenarioName;
  revenuePath: Array<{ year: number; revenue: number; commercialRevenue: number; governmentRevenue: number }>;
  operatingMargin: number;
  fcf: number;
  dilutedShares: number;
  fcfPerShare: number;
  exitMultiple: number;
  fairValuePerShare: number;
  expectedCagr: number;
  summary: string;
};

export type PltrRisk = {
  id: string;
  title: string;
  description: string;
  severity: "High" | "Medium" | "Low";
  probability: "High" | "Medium" | "Low";
  evidenceToMonitor: string[];
  leadingIndicators: string[];
  bullThesisInvalidator: string;
};

export type PltrSubmoduleInsight = {
  id: string;
  module: string;
  tab: string;
  stance: "Constructive" | "Mixed" | "Caution" | "Adversarial";
  evidenceStrength: "High" | "Medium" | "Low" | "Source Gap";
  keyQuestion: string;
  keyInsight: string;
  dataReadThrough: string;
  modelImplication: string;
  falsifier: string;
  sourceQuality: string;
};

export type PltrEvidenceLayer =
  | "official_reported"
  | "derived_metric"
  | "transcript_evidence"
  | "research_interpretation"
  | "valuation_implication";

export type PltrQ1DeepDiveMetric = {
  id: string;
  label: string;
  value: number | null;
  unit: PltrMetricUnit;
  displayValue: string;
  layer: PltrEvidenceLayer;
  sourceUrl: string | null;
  sourceType: PltrSourceType;
  sourceConfidence: PltrSourceConfidence;
  footnote: string;
  notes: string;
  q4Value?: number | null;
  q4DisplayValue?: string;
  changeVsQ4?: number | null;
  changeVsQ4Display?: string;
};

export type PltrQ1DeepDiveTextItem = {
  id: string;
  title: string;
  body: string;
  layer: PltrEvidenceLayer;
  sourceUrl: string | null;
  sourceType: PltrSourceType;
  sourceConfidence: PltrSourceConfidence;
  footnote: string;
  relatedQaPairId?: string;
  topicTags?: PltrTranscriptTopic[];
};

export type PltrQ1DeepDiveData = {
  periodId: "q1-2026";
  periodLabel: string;
  benchmarkPeriodId: "q4-2025";
  benchmarkLabel: string;
  sourcePriority: string[];
  officialReported: PltrQ1DeepDiveMetric[];
  derivedMetrics: PltrQ1DeepDiveMetric[];
  guidanceUpgrade: PltrQ1DeepDiveTextItem[];
  managementCommentary: PltrQ1DeepDiveTextItem[];
  analystConcerns: PltrQ1DeepDiveTextItem[];
  whatChangedVsQ4: PltrQ1DeepDiveMetric[];
  researchInterpretation: PltrQ1DeepDiveTextItem[];
  valuationImplication: PltrQ1DeepDiveTextItem[];
  redTeamInvalidators: PltrQ1DeepDiveTextItem[];
};

export type PltrDashboardData = {
  latestActual: PltrActualQuarter;
  actuals: PltrActualQuarter[];
  guidance: PltrGuidancePoint[];
  marketData: PltrMarketData;
  sources: PltrSourceRecord[];
  valuation: {
    methods: PltrValuationMethod[];
    fairValues: Array<{ scenario: PltrScenarioName; fairValue: number; upsideDownside: number; expectedReturn3Y: number; summary: string }>;
    reverseDcf: PltrReverseDcf;
    selectedFairValue: number;
    warnings: ValidationWarning[];
  };
  scenarios: PltrScenarioOutput[];
  aip: {
    score: number;
    observedEvidence: string[];
    inferredTrend: string[];
    modelAssumptions: string[];
    valuationImpact: string[];
    warnings: ValidationWarning[];
  };
  ontology: {
    score: number;
    factors: Array<{ label: string; score: number; evidence: string; confirm: string; disconfirm: string }>;
  };
  cohorts: {
    rows: Array<Record<string, number | string | null>>;
    warnings: ValidationWarning[];
  };
  ruleOf40: Array<Record<string, number | string | null>>;
  sbc: {
    rows: Array<Record<string, number | string | null>>;
    warning: string;
  };
  transcript: {
    events: PltrTranscriptEvent[];
    qaPairs: PltrQaPair[];
    topicTrends: PltrTopicTrendPoint[];
    warnings: ValidationWarning[];
  };
  q1DeepDive: PltrQ1DeepDiveData;
  risks: PltrRisk[];
  submoduleInsights: PltrSubmoduleInsight[];
};
