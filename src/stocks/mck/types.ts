import type { DataQualityBadgeType, Scenario, Signal, ValidationWarning } from "../types";

export type MckSourceType =
  | "actual"
  | "guidance"
  | "assumption"
  | "derived"
  | "market"
  | "transcript"
  | "research"
  | "placeholder";

export type MckConfidence = "high" | "medium" | "low";

export type MckSegmentName =
  | "North American Pharmaceutical"
  | "Oncology & Multispecialty"
  | "Prescription Technology Solutions"
  | "Medical-Surgical Solutions"
  | "International / Other"
  | "Corporate / Other";

export type MckDataTag = {
  sourceType: MckSourceType;
  source: string;
  sourceUrl?: string;
  asOfDate: string;
  confidence: MckConfidence;
  isPlaceholder?: boolean;
  notes?: string;
};

export type MckReportedFinancial = {
  periodId: string;
  label: string;
  fiscalYear: number;
  revenue: number;
  revenueGrowth: number;
  gaapDilutedEps: number;
  adjustedDilutedEps: number;
  adjustedEpsGrowth: number;
  operatingCashFlow: number;
  capex: number;
  freeCashFlow: number;
  shareRepurchases: number;
  dividendsPaid: number;
  dilutedShares: number;
  dilutedSharesTag: MckDataTag;
  netDebt: number;
  netDebtTag: MckDataTag;
  adjustedTaxRate: number;
  tag: MckDataTag;
};

export type MckSegmentFinancial = {
  periodId: string;
  segment: MckSegmentName;
  revenue: number;
  revenueGrowth: number;
  operatingProfit: number;
  adjustedOperatingProfit: number;
  adjustedOperatingProfitGrowth: number;
  margin: number;
  marginBps: number;
  moatScore: number;
  riskLevel: "Low" | "Medium" | "High";
  multipleAssumption: number;
  tag: MckDataTag;
};

export type MckGuidance = {
  fiscalYear: number;
  metric: string;
  low: number;
  high: number;
  midpoint: number;
  sourceType: "guidance";
  source: string;
  sourceUrl: string;
  asOfDate: string;
  notes: string;
};

export type MckMarketSnapshot = {
  ticker: "MCK";
  currentPrice: number;
  marketCap: number;
  enterpriseValue: number;
  sharesOut: number;
  forwardPe: number;
  fcfYield: number;
  dividendYield: number;
  buybackYield: number;
  netDebtToEbitda: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  priceDate: string;
  tag: MckDataTag;
};

export type MckPeerTicker = "MCK" | "COR" | "CAH" | "HSIC" | "CVS" | "WBA";

export type MckPeerMetric = {
  ticker: MckPeerTicker;
  name: string;
  category: "core_peer" | "adjacent_reference";
  revenueGrowth: number;
  operatingMargin: number;
  adjustedEpsGrowth: number;
  fcfConversion: number;
  fcfYield: number;
  forwardPe: number;
  buybackYield: number;
  roic: number;
  leverage: number;
  specialtyExposure: number;
  moatScore: number;
  tag: MckDataTag;
};

export type MckRiskItem = {
  id: string;
  name: string;
  probability: number;
  severity: number;
  evidence: string;
  earlyWarningIndicator: string;
  monitoringMetric: string;
  mitigation: string;
  score: number;
  signal: Signal;
  tag: MckDataTag;
};

export type MckTranscriptTopic =
  | "specialty"
  | "oncology"
  | "biopharma services"
  | "GLP-1"
  | "biosimilars"
  | "margin"
  | "working capital"
  | "capital allocation"
  | "buyback"
  | "reimbursement"
  | "customer contracts"
  | "regulatory";

export type MckTranscriptEvent = {
  id: string;
  fiscalPeriod: string;
  eventDate: string;
  title: string;
  source: string;
  sourceUrl?: string;
  rawLocalPath?: string;
  managementTone: "positive" | "neutral" | "negative" | "mixed";
  summary: string;
  topics: MckTranscriptTopic[];
  metrics?: {
    revenue?: number;
    revenueGrowth?: number;
    adjustedEps?: number;
    adjustedEpsGrowth?: number;
    freeCashFlow?: number;
  };
  marketFocus: string;
  thesisRead: string;
  quarterHighlights: string[];
  sourceCoverage: "official_release_only" | "transcript_ingested" | "transcript_pending";
  guidanceChange?: string;
  analystConcerns: string[];
  tag: MckDataTag;
};

export type MckManagementQuote = {
  id: string;
  eventId: string;
  speaker: string;
  topic: MckTranscriptTopic;
  quote: string;
  interpretation: string;
  tag: MckDataTag;
};

export type MckQaPair = {
  id: string;
  eventId: string;
  analyst: string;
  topic: MckTranscriptTopic;
  question: string;
  answer: string;
  pressurePoint: string;
  tag: MckDataTag;
};

export type MckResearchAssumptions = {
  currentPrice: number;
  forwardAdjustedEps: number;
  targetPe: number;
  fcfPerShare: number;
  targetFcfYield: number;
  normalizedFcf: number;
  normalizedFcfGrowth: number;
  ownerEarningsBase: number;
  wacc: number;
  terminalGrowth: number;
  taxRate: number;
  netDebt: number;
  dilutedShares: number;
  averageBuybackPrice: number;
  annualFcf: number;
  dividendPayout: number;
  buybackAmount: number;
  epsCagr3Y: number;
  epsCagr5Y: number;
  exitPe: number;
  marginBpsChange: number;
  fcfConversion: number;
  downsideShock: number;
  coreDistributionMultiple: number;
  oncologyMultiple: number;
  rxTechnologyMultiple: number;
  medSurgMultiple: number;
  corporateCostValue: number;
  weightPe: number;
  weightFcfYield: number;
  weightDcf: number;
  weightSotp: number;
};

export type MckScenarioDefinition = {
  name: Scenario;
  assumptions: Partial<MckResearchAssumptions>;
  summary: string;
};

export type MckDataset = {
  company: {
    ticker: "MCK";
    name: string;
    fiscalYearEnd: string;
    currency: "USD";
    unit: "USD millions unless otherwise noted";
  };
  reportedFinancials: MckReportedFinancial[];
  segmentFinancials: MckSegmentFinancial[];
  guidance: MckGuidance[];
  market: MckMarketSnapshot;
  peers: MckPeerMetric[];
  risks: MckRiskItem[];
  transcriptEvents: MckTranscriptEvent[];
  managementQuotes: MckManagementQuote[];
  qaPairs: MckQaPair[];
  assumptions: MckResearchAssumptions;
  scenarios: MckScenarioDefinition[];
  validationWarnings: ValidationWarning[];
};

export type MckSegmentEconomicsOutput = {
  segments: Array<MckSegmentFinancial & {
    revenueMix: number;
    profitMix: number;
    marginPremiumVsGroupBps: number;
    dataBadge: DataQualityBadgeType;
    investmentRead: string;
  }>;
  groupRevenue: number;
  groupAdjustedOperatingProfit: number;
  groupMargin: number;
  groupMarginBps: number;
};

export type MckDistributionEconomicsOutput = {
  segment: MckSegmentFinancial;
  revenueHugeMarginThin: string;
  marginSensitivity: Array<{ bpsChange: number; pretaxProfitImpact: number; afterTaxImpact: number; epsImpact: number; fcfImpact: number }>;
  scaleAdvantageScore: number;
  operatingLeverageSignal: Signal;
  marginCompressionFlag: boolean;
  workingCapitalIntensity: number;
  glp1Impact: {
    revenueTailwind: string;
    marginCaveat: string;
    inventoryRisk: string;
    netAssessment: Signal;
  };
};

export type MckWorkingCapitalOutput = {
  reportedFcf: number;
  normalizedFcf: number;
  operatingCashFlow: number;
  capex: number;
  fcfConversion: number;
  normalizedFcfConversion: number;
  workingCapitalSwing: number;
  inventoryDays: number;
  receivableDays: number;
  payableDays: number;
  warning: string;
};

export type MckMarginBridgeOutput = {
  priorMarginBps: number;
  currentMarginBps: number;
  bridge: Array<{ driver: string; bps: number; sourceType: MckSourceType; note: string }>;
  marginChangeBps: number;
};

export type MckBuybackOutput = {
  beginningShares: number;
  endingShares1Y: number;
  endingShares3Y: number;
  endingShares5Y: number;
  annualShareReduction: number;
  epsAccretion1Y: number;
  fcfPerShareAccretion1Y: number;
  buybackYield: number;
  valueCreationSignal: Signal;
  averageRepurchasePrice: number;
  threeYearCumulativeBuyback: number;
  fiveYearCumulativeBuyback: number;
  commentary: string;
};

export type MckValuationOutput = {
  peFairValue: number;
  fcfYieldFairValue: number;
  dcfFairValue: number;
  sotpFairValue: number;
  blendedFairValue: number;
  valuationRangeLow: number;
  valuationRangeHigh: number;
  marginOfSafety: number;
  ownerEarningsDcf: {
    enterpriseValue: number;
    equityValue: number;
    terminalValueShare: number;
    normalizedWorkingCapitalAdjustment: number;
  };
  sotp: Array<{ segment: MckSegmentName; metric: number; multiple: number; value: number; sourceType: MckSourceType }>;
  warnings: ValidationWarning[];
};

export type MckScenarioOutput = {
  scenario: Scenario;
  fairValue: number;
  targetPrice3Y: number;
  targetPrice5Y: number;
  irr3Y: number;
  irr5Y: number;
  upsideDownside: number;
  summary: string;
};

export type MckDashboardDataset = {
  summary: import("../types").SummaryMetric[];
  segmentEconomics: MckSegmentEconomicsOutput;
  distributionEconomics: MckDistributionEconomicsOutput;
  workingCapital: MckWorkingCapitalOutput;
  marginBridge: MckMarginBridgeOutput;
  buyback: MckBuybackOutput;
  capitalAllocation: {
    freeCashFlow: number;
    dividend: number;
    buyback: number;
    maCapacity: number;
    netDebt: number;
    remainingAuthorization: number;
    buybackYield: number;
    payoutOfFcf: number;
  };
  valuation: MckValuationOutput;
  scenarios: MckScenarioOutput[];
  risks: MckRiskItem[];
  peers: MckPeerMetric[];
  thesis: Array<{ title: string; evidence: string; metric: string; riskFlag: string; signal: Signal; badge: DataQualityBadgeType }>;
  oncology: {
    segment?: MckSegmentFinancial;
    contribution: string;
    ecosystem: Array<{ from: string; to: string; label: string }>;
    tailwinds: Array<{ theme: string; assessment: string; signal: Signal }>;
    managementCommentary: MckManagementQuote[];
  };
  prescriptionTechnology: {
    revenue: number;
    margin: number;
    relativeMultiple: number;
    thesis: string;
    caveat: string;
  };
  biopharmaServices: {
    qualityScore: number;
    thesis: string;
    marginPotential: string;
    evidence: string[];
  };
  earningsCall: {
    events: MckTranscriptEvent[];
    selectedEventId: string;
    quotes: MckManagementQuote[];
    qaPairs: MckQaPair[];
    themes: Array<{ topic: MckTranscriptTopic; count: number; tone: Signal }>;
    trendOverview: {
      aiSummary: string;
      topicTrends: Array<{
        topic: MckTranscriptTopic;
        earlyMentions: number;
        recentMentions: number;
        direction: "Rising" | "Stable" | "Fading" | "New";
        interpretation: string;
      }>;
      quarterlyFocus: Array<{
        eventId: string;
        fiscalPeriod: string;
        eventDate: string;
        primaryFocus: string;
        concern: string;
        thesisRead: string;
      }>;
    };
  };
  memo: {
    whatHappened: string;
    whatMatters: string;
    whatMarketMayBeMissing: string;
    whatCanGoWrong: string;
    attractivePrice: string;
    monitorNextQuarter: string[];
  };
  warnings: ValidationWarning[];
};
