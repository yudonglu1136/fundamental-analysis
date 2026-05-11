export type LsegTranscriptCandidateReviewStatus = "draft_needs_human_review";

export interface LsegTranscriptCandidateBase {
  id: string;
  candidateOnly: true;
  needsHumanReview: true;
  reviewStatus: LsegTranscriptCandidateReviewStatus;
  sourceQualityTag: "ManualUpload";
  sourceType: "transcript_manual_upload";
  verificationRequired: true;
  verificationReason?: string;
  transcriptId: string;
  eventDate: string | null;
  fiscalPeriod: string | null;
  eventType: string | null;
  speaker: string | null;
  section: string | null;
  supportingQuoteShort: string;
  sourcePath: string;
  confidence: string | null;
  suggestedTargetFile: string;
  recommendedAction: string;
  mappingStatus: string;
  reviewerRationale: string;
  modelReady: false;
  valuationImpactAllowed: false;
}

export interface LsegGuidanceCandidate extends LsegTranscriptCandidateBase {
  guidanceCategory: string;
  guidanceType: string;
  directCompanyGuidance: true;
}

export interface LsegForecastAnchorCandidate extends LsegTranscriptCandidateBase {
  guidanceCategory: string;
  guidanceType: string;
  requiresAnalystConversion: true;
  directModelInput: false;
}

export interface LsegMonitoringKpiCandidate extends LsegTranscriptCandidateBase {
  sourceDomain: string;
  segment: string | null;
  kpiName?: string;
  monitoringTopic?: string;
  latestManagementQuote?: string;
  trendAcrossEvents?: unknown;
  monitoringFrequency?: string;
  suggestedDashboardLocation?: string;
  dataAvailability?: string;
}

export interface LsegRiskRegisterCandidate extends LsegTranscriptCandidateBase {
  riskName: string;
  segment: string | null;
  severity: string;
  monitoringTrigger: string;
  suggestedTarget: string;
  repeatSignalCount?: number;
}

export interface LsegCapitalAllocationCandidate extends LsegTranscriptCandidateBase {
  capitalAllocationTopic: string;
  classification: string;
  segment: string | null;
}

export interface LsegThesisSignalCandidate extends LsegTranscriptCandidateBase {
  signal: string;
  signalPolarity: string;
  affectedModelDriver: string;
  changeVsPriorEvent: string;
}
