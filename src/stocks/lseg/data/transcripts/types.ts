export type TranscriptConfidence = "high" | "medium" | "low";
export type TranscriptQaBoundaryConfidence = TranscriptConfidence | "none";
export type TranscriptTrendDirection = "improved" | "stable" | "weaker" | "unclear";
export type TranscriptWatchlistStatus = "fulfilled" | "partially_fulfilled" | "not_fulfilled" | "unclear";

export type TranscriptBadge =
  | "ManualUpload"
  | "Needs Human Review"
  | "Not Model Ready"
  | "Not Used In Valuation";

export type TranscriptCategory =
  | "management"
  | "guidance"
  | "kpi"
  | "segment"
  | "qa"
  | "risk"
  | "capital_allocation"
  | "thesis";

export type TranscriptSegment =
  | "Group-level"
  | "Data & Analytics"
  | "FTSE Russell"
  | "Risk Intelligence"
  | "Capital Markets"
  | "Post Trade"
  | "Other / Corporate";

export type TranscriptModelDriver =
  | "revenue growth"
  | "margin"
  | "FCF"
  | "capex"
  | "buyback"
  | "dividend"
  | "Workspace / Refinitiv"
  | "Post Trade / LCH / SwapClear"
  | "Tradeweb / Capital Markets"
  | "pricing / retention"
  | "risk";

export type TranscriptAnswerQuality = "direct" | "partial" | "evasive" | "unclear";

export type TrendDimensionId =
  | "revenue_growth"
  | "margin_expansion"
  | "fcf_cash_conversion"
  | "data_analytics_workspace_refinitiv"
  | "ftse_russell"
  | "risk_intelligence"
  | "capital_markets_tradeweb"
  | "post_trade_lch_swapclear"
  | "capital_allocation"
  | "competition_pricing"
  | "regulatory_macro_fx";

export type WatchlistCategory =
  | "top_questions"
  | "kpis_to_monitor"
  | "risks_to_revisit"
  | "guidance_points"
  | "likely_qa";

export type TranscriptDisplayGuard = {
  displayOnly: true;
  candidateOnly?: boolean;
  modelReady: false;
  valuationImpactAllowed: false;
};

export type TranscriptCallEvent = TranscriptDisplayGuard & {
  transcriptId: string;
  label: string;
  shortLabel: string;
  eventDate: string;
  fiscalPeriod: string;
  eventType: string;
  source: string;
  sourcePath: string;
  qualityTag: string;
  confidence: TranscriptConfidence;
  qaBoundaryConfidence: TranscriptQaBoundaryConfidence;
  warnings: string[];
};

export type TranscriptQaPair = TranscriptDisplayGuard & {
  candidateOnly: true;
  id: string;
  transcriptId: string;
  eventDate: string;
  fiscalPeriod: string;
  eventType: string;
  section: "qa";
  analystName: string;
  analystFirm: string;
  questionText?: string;
  questionSummary?: string;
  managementResponder: string;
  answerText?: string;
  answerSummary?: string;
  supportingQuoteShort: string;
  topic: string;
  subtopic: string;
  segment: TranscriptSegment;
  modelDriver: TranscriptModelDriver;
  answerQuality: TranscriptAnswerQuality;
  followUpNeeded: boolean;
  confidence: TranscriptConfidence;
  qaBoundaryConfidence: TranscriptQaBoundaryConfidence;
  sourcePath: string;
  sourceQualityTag: "ManualUpload";
  needsHumanReview: true;
  modelReady: false;
  valuationImpactAllowed: false;
  quoteLocation?: string;
  warnings?: string[];
};

export type TranscriptEvidenceItem = TranscriptDisplayGuard & {
  id: string;
  transcriptId: string;
  category: TranscriptCategory;
  title: string;
  quote: string;
  explanation: string;
  speaker?: string;
  speakerRole?: string;
  section?: string;
  confidence: TranscriptConfidence;
  sentiment: "positive" | "negative" | "neutral";
  sourceTag: string;
  sourcePath: string;
  sourceReference: string;
  needsHumanReview: boolean;
  mappingStatus?: string;
  recommendedAction?: string;
  tags: string[];
};

export type TranscriptCallSummary = TranscriptDisplayGuard & {
  event: TranscriptCallEvent;
  conclusion: string;
  topManagementMessages: TranscriptEvidenceItem[];
  explicitGuidanceCandidates: TranscriptEvidenceItem[];
  kpiHighlights: TranscriptEvidenceItem[];
  segmentCommentary: TranscriptEvidenceItem[];
  qaHotTopics: TranscriptEvidenceItem[];
  riskMentions: TranscriptEvidenceItem[];
  capitalAllocationRemarks: TranscriptEvidenceItem[];
  thesisSignals: TranscriptEvidenceItem[];
  sourceReferences: string[];
  badges: TranscriptBadge[];
  summaryWarnings: string[];
};

export type TranscriptTrendComparison = TranscriptDisplayGuard & {
  id: string;
  dimensionId: TrendDimensionId;
  label: string;
  currentTranscriptId: string;
  priorTranscriptId: string;
  direction: TranscriptTrendDirection;
  confidence: TranscriptConfidence;
  currentQuote?: string;
  priorQuote?: string;
  analystNote: string;
  needsHumanReview: boolean;
};

export type TranscriptWatchlistItem = TranscriptDisplayGuard & {
  id: string;
  transcriptId: string;
  category: WatchlistCategory;
  label: string;
  rationale: string;
  evidenceQuote?: string;
  priority: "high" | "medium" | "low";
  tags: string[];
  sourceReferences: string[];
};

export type TranscriptWatchlistReviewItem = TranscriptDisplayGuard & {
  id: string;
  sourceTranscriptId: string;
  reviewedAgainstTranscriptId: string;
  originalItem: TranscriptWatchlistItem;
  status: TranscriptWatchlistStatus;
  evidenceQuote?: string;
  explanation: string;
};

export type TranscriptIntelligenceValidation = {
  warnings: string[];
  checks: string[];
};
