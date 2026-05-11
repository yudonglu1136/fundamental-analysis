import managementCommentary from "../../../../../data/local/lseg/transcripts/extracted/management_commentary.json";
import kpiMentions from "../../../../../data/local/lseg/transcripts/extracted/kpi_mentions.json";
import riskMentions from "../../../../../data/local/lseg/transcripts/extracted/risk_mentions.json";
import capitalAllocationMentions from "../../../../../data/local/lseg/transcripts/extracted/capital_allocation_mentions.json";
import segmentMentions from "../../../../../data/local/lseg/transcripts/extracted/segment_mentions.json";
import qaTopics from "../../../../../data/local/lseg/transcripts/extracted/qa_topics.json";
import transcriptEventSummaries from "../../../../../data/local/lseg/transcripts/extracted/transcript_event_summaries.json";
import draftGuidanceMapping from "../../../../../data/local/lseg/transcripts/mapping/draft_guidance_mapping.json";
import draftKpiMonitoringMapping from "../../../../../data/local/lseg/transcripts/mapping/draft_kpi_monitoring_mapping.json";
import draftRiskRegisterMapping from "../../../../../data/local/lseg/transcripts/mapping/draft_risk_register_mapping.json";
import draftCapitalAllocationMapping from "../../../../../data/local/lseg/transcripts/mapping/draft_capital_allocation_mapping.json";
import draftThesisSignalMapping from "../../../../../data/local/lseg/transcripts/mapping/draft_thesis_signal_mapping.json";
import { lsegTranscriptCallEvents } from "./callEvents";
import type {
  TranscriptBadge,
  TranscriptCallSummary,
  TranscriptConfidence,
  TranscriptEvidenceItem,
} from "./types";

type ExtractedMention = {
  transcriptId: string;
  eventDate: string;
  fiscalPeriod: string;
  eventType: string;
  section?: string;
  speaker?: string;
  speakerRole?: string;
  topic?: string;
  subtopic?: string;
  extractedClaim?: string;
  supportingQuoteShort?: string;
  confidence?: TranscriptConfidence;
  dataQualityTag?: string;
  sourceType?: string;
  needsHumanReview?: boolean;
  suggestedModelMapping?: string;
  sourcePath?: string;
  warnings?: string[];
  quoteLocation?: string;
};

type MappingItem = {
  transcriptId: string;
  supportingQuoteShort?: string;
  confidence?: TranscriptConfidence;
  dataQualityTag?: string;
  sourceType?: string;
  reviewStatus?: string;
  needsHumanReview?: boolean;
  recommendedAction?: string;
  suggestedTargetFile?: string;
  reviewNotes?: string;
  sourcePath?: string;
  speaker?: string;
  speakerRole?: string;
  section?: string;
  transcriptWarnings?: string[];
  [key: string]: unknown;
};

type EventSummaryRecord = {
  transcriptId: string;
  topThemes: string[];
  warnings?: string[];
  guidanceMentionCount: number;
  kpiMentionCount: number;
  riskMentionCount: number;
  capitalAllocationMentionCount: number;
  qaTopicCount: number;
  thesisSignalCount: number;
};

const BADGES: TranscriptBadge[] = [
  "ManualUpload",
  "Needs Human Review",
  "Not Model Ready",
  "Not Used In Valuation",
];

const eventSummaryById = new Map(
  (transcriptEventSummaries.items as EventSummaryRecord[]).map((item) => [item.transcriptId, item]),
);

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildTags(parts: Array<string | undefined>) {
  const combined = parts.filter(Boolean).join(" ");
  const base = normalize(combined);
  const tags = new Set<string>();
  if (!base) return [];
  tags.add(base);

  const keywordGroups = [
    "revenue growth",
    "organic growth",
    "asv",
    "margin",
    "ebitda",
    "free cash flow",
    "cash conversion",
    "workspace",
    "refinitiv",
    "data analytics",
    "data platform",
    "mcp",
    "microsoft",
    "ftse russell",
    "risk intelligence",
    "capital markets",
    "tradeweb",
    "post trade",
    "lch",
    "swapclear",
    "buyback",
    "dividend",
    "leverage",
    "capital allocation",
    "pricing",
    "competition",
    "regulation",
    "regulatory",
    "macro",
    "fx",
    "foreign exchange",
    "financing",
    "retention",
    "renewal",
  ];

  for (const keyword of keywordGroups) {
    if (base.includes(keyword)) tags.add(keyword);
  }

  return [...tags];
}

function inferSentiment(text: string, fallback: "positive" | "negative" | "neutral" = "neutral") {
  const normalized = normalize(text);
  const positiveTerms = [
    "strong",
    "good visibility",
    "raised",
    "upper half",
    "excellent progress",
    "growth",
    "improvement",
    "stable market",
    "trusted",
    "pipeline",
  ];
  const negativeTerms = [
    "headwind",
    "weakness",
    "uncertain",
    "slowed",
    "loss",
    "affected",
    "impact",
    "drag",
    "lapping",
    "cyclicality",
  ];
  const positiveHits = positiveTerms.filter((term) => normalized.includes(term)).length;
  const negativeHits = negativeTerms.filter((term) => normalized.includes(term)).length;
  if (positiveHits > negativeHits) return "positive";
  if (negativeHits > positiveHits) return "negative";
  return fallback;
}

function confidenceRank(confidence: TranscriptConfidence) {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function scoreEvidence(item: TranscriptEvidenceItem) {
  const sourceBoost = item.candidateOnly ? 3 : 1;
  return confidenceRank(item.confidence) * 10 + sourceBoost;
}

function dedupeEvidence(items: TranscriptEvidenceItem[], limit: number) {
  const seen = new Set<string>();
  return items
    .slice()
    .sort((left, right) => scoreEvidence(right) - scoreEvidence(left))
    .filter((item) => {
      const key = normalize(item.quote || item.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function buildExtractedEvidence(
  items: ExtractedMention[],
  transcriptId: string,
  category: TranscriptEvidenceItem["category"],
  titleResolver: (item: ExtractedMention) => string,
  explanationResolver: (item: ExtractedMention) => string,
  sentimentFallback: "positive" | "negative" | "neutral",
) {
  return items
    .filter((item) => item.transcriptId === transcriptId)
    .map((item, index) => {
      const quote = toText(item.supportingQuoteShort) || toText(item.extractedClaim);
      const title = titleResolver(item);
      return {
        id: `${transcriptId}-${category}-${index}-${normalize(title).slice(0, 24)}`,
        transcriptId,
        category,
        title,
        quote,
        explanation: explanationResolver(item),
        speaker: item.speaker,
        speakerRole: item.speakerRole,
        section: item.section,
        confidence: item.confidence ?? "medium",
        sentiment: inferSentiment(`${title} ${quote}`, sentimentFallback),
        sourceTag: item.dataQualityTag ?? "Derived",
        sourcePath: item.sourcePath ?? "",
        sourceReference: `${item.sourceType ?? "transcript_manual_upload"}${item.quoteLocation ? ` · ${item.quoteLocation}` : ""}`,
        needsHumanReview: item.needsHumanReview ?? true,
        recommendedAction: item.suggestedModelMapping,
        tags: buildTags([title, item.topic, item.subtopic, item.extractedClaim, quote]),
        displayOnly: true,
        modelReady: false,
        valuationImpactAllowed: false,
      } satisfies TranscriptEvidenceItem;
    });
}

function buildMappedEvidence(
  items: MappingItem[],
  transcriptId: string,
  category: TranscriptEvidenceItem["category"],
  titleResolver: (item: MappingItem) => string,
  explanationResolver: (item: MappingItem) => string,
  sentimentFallback: "positive" | "negative" | "neutral",
) {
  return items
    .filter((item) => item.transcriptId === transcriptId)
    .map((item, index) => {
      const title = titleResolver(item);
      const quote = toText(item.supportingQuoteShort);
      return {
        id: `${transcriptId}-${category}-mapped-${index}-${normalize(title).slice(0, 24)}`,
        transcriptId,
        category,
        title,
        quote,
        explanation: explanationResolver(item),
        speaker: toText(item.speaker),
        speakerRole: toText(item.speakerRole),
        section: toText(item.section),
        confidence: item.confidence ?? "medium",
        sentiment: inferSentiment(`${title} ${quote} ${toText(item.reviewNotes)}`, sentimentFallback),
        sourceTag: toText(item.dataQualityTag) || "Derived",
        sourcePath: toText(item.sourcePath),
        sourceReference: `${toText(item.sourceType) || "transcript_manual_upload"} · ${toText(item.mappingStatus) || "draft_candidate"}`,
        needsHumanReview: item.needsHumanReview ?? true,
        mappingStatus: toText(item.mappingStatus),
        recommendedAction: toText(item.recommendedAction),
        tags: buildTags([title, toText(item.reviewNotes), quote]),
        displayOnly: true,
        candidateOnly: true,
        modelReady: false,
        valuationImpactAllowed: false,
      } satisfies TranscriptEvidenceItem;
    });
}

const managementItems = managementCommentary.items as ExtractedMention[];
const rawKpiItems = kpiMentions.items as ExtractedMention[];
const rawRiskItems = riskMentions.items as ExtractedMention[];
const rawCapitalAllocationItems = capitalAllocationMentions.items as ExtractedMention[];
const rawSegmentItems = segmentMentions.items as ExtractedMention[];
const rawQaItems = qaTopics.items as ExtractedMention[];
const acceptedGuidanceItems = draftGuidanceMapping.acceptedDraftMappings as MappingItem[];
const nonAcceptedGuidanceItems = draftGuidanceMapping.rejectedOrDeferred as MappingItem[];
const mappedKpiItems = draftKpiMonitoringMapping.items as MappingItem[];
const mappedRiskItems = draftRiskRegisterMapping.items as MappingItem[];
const mappedCapitalAllocationItems = draftCapitalAllocationMapping.items as MappingItem[];
const mappedThesisItems = draftThesisSignalMapping.items as MappingItem[];

const transcriptEvidenceById = new Map<string, TranscriptEvidenceItem[]>();
export const transcriptCallSummaries: TranscriptCallSummary[] = [];

for (const event of lsegTranscriptCallEvents) {
  const transcriptId = event.transcriptId;
  const summary = eventSummaryById.get(transcriptId);

  const management = dedupeEvidence(
    buildExtractedEvidence(
      managementItems,
      transcriptId,
      "management",
      (item) => toText(item.subtopic) || toText(item.topic) || "Management message",
      (item) => toText(item.extractedClaim) || "Management commentary extracted from the transcript.",
      "neutral",
    ),
    4,
  );

  const guidance = dedupeEvidence(
    [
      ...buildMappedEvidence(
        acceptedGuidanceItems,
        transcriptId,
        "guidance",
        (item) => toText(item.guidanceCategory) || "Guidance candidate",
        (item) => toText(item.reviewNotes) || toText(item.reviewerRationale) || "Transcript-derived guidance candidate.",
        "neutral",
      ),
      ...buildMappedEvidence(
        nonAcceptedGuidanceItems,
        transcriptId,
        "guidance",
        (item) => toText(item.guidanceCategory) || "Guidance candidate",
        (item) => toText(item.reviewNotes) || toText(item.reviewerRationale) || "Transcript-derived guidance candidate pending review.",
        "neutral",
      ),
    ],
    5,
  );

  const kpis = dedupeEvidence(
    mappedKpiItems.length > 0
      ? buildMappedEvidence(
          mappedKpiItems,
          transcriptId,
          "kpi",
          (item) => toText(item.kpiName) || "KPI highlight",
          (item) => toText(item.reviewNotes) || toText(item.reviewerRationale) || "Transcript-derived KPI candidate.",
          "positive",
        )
      : buildExtractedEvidence(
          rawKpiItems,
          transcriptId,
          "kpi",
          (item) => toText(item.subtopic) || "KPI highlight",
          (item) => toText(item.extractedClaim) || "KPI-related management remark extracted from the transcript.",
          "positive",
        ),
    5,
  );

  const segments = dedupeEvidence(
    buildExtractedEvidence(
      rawSegmentItems,
      transcriptId,
      "segment",
      (item) => toText(item.subtopic) || "Segment commentary",
      (item) => toText(item.extractedClaim) || "Segment commentary extracted from the transcript.",
      "neutral",
    ),
    5,
  );

  const qa = dedupeEvidence(
    rawQaItems.length > 0
      ? buildExtractedEvidence(
          rawQaItems,
          transcriptId,
          "qa",
          (item) => toText(item.subtopic) || toText(item.topic) || "Q&A topic",
          (item) => toText(item.extractedClaim) || "Q&A topic extracted from the transcript.",
          "neutral",
        )
      : buildExtractedEvidence(
          managementItems.filter((item) => item.section === "qa"),
          transcriptId,
          "qa",
          (item) => toText(item.subtopic) || toText(item.topic) || "Q&A topic",
          (item) => toText(item.extractedClaim) || "Q&A-style management commentary extracted from the transcript.",
          "neutral",
        ),
    4,
  );

  const risks = dedupeEvidence(
    mappedRiskItems.length > 0
      ? buildMappedEvidence(
          mappedRiskItems,
          transcriptId,
          "risk",
          (item) => toText(item.riskName) || "Risk mention",
          (item) => toText(item.monitoringTrigger) || toText(item.reviewNotes) || "Risk mention extracted from transcripts.",
          "negative",
        )
      : buildExtractedEvidence(
          rawRiskItems,
          transcriptId,
          "risk",
          (item) => toText(item.subtopic) || "Risk mention",
          (item) => toText(item.extractedClaim) || "Risk commentary extracted from the transcript.",
          "negative",
        ),
    4,
  );

  const capitalAllocation = dedupeEvidence(
    mappedCapitalAllocationItems.length > 0
      ? buildMappedEvidence(
          mappedCapitalAllocationItems,
          transcriptId,
          "capital_allocation",
          (item) => toText(item.capitalAllocationTopic) || "Capital allocation remark",
          (item) => toText(item.reviewNotes) || toText(item.reviewerRationale) || "Capital allocation commentary extracted from the transcript.",
          "neutral",
        )
      : buildExtractedEvidence(
          rawCapitalAllocationItems,
          transcriptId,
          "capital_allocation",
          (item) => toText(item.subtopic) || "Capital allocation remark",
          (item) => toText(item.extractedClaim) || "Capital allocation commentary extracted from the transcript.",
          "neutral",
        ),
    4,
  );

  const thesis = dedupeEvidence(
    buildMappedEvidence(
      mappedThesisItems,
      transcriptId,
      "thesis",
      (item) => toText(item.signal) || "Thesis signal",
      (item) => toText(item.reviewNotes) || toText(item.reviewerRationale) || "Transcript-derived thesis signal.",
      "neutral",
    ),
    5,
  );

  const allEvidence = [...management, ...guidance, ...kpis, ...segments, ...qa, ...risks, ...capitalAllocation, ...thesis];
  transcriptEvidenceById.set(transcriptId, allEvidence);

  const leadSignal = thesis[0]?.title ?? kpis[0]?.title ?? management[0]?.title ?? "Transcript themes remain under review";
  const themeText = summary?.topThemes?.slice(0, 2).join(" and ");
  const conclusion = `${leadSignal}. ${themeText ? `Management emphasis centered on ${themeText}.` : "The transcript still requires human verification before any promotion into official model data."}`;

  const sourceReferences = unique([event.sourcePath, ...allEvidence.map((item) => item.sourcePath).filter(Boolean)]);
  const summaryWarnings = unique([...(event.warnings ?? []), ...(summary?.warnings ?? [])]);

  const callSummary: TranscriptCallSummary = {
    event,
    conclusion,
    topManagementMessages: management,
    explicitGuidanceCandidates: guidance,
    kpiHighlights: kpis,
    segmentCommentary: segments,
    qaHotTopics: qa,
    riskMentions: risks,
    capitalAllocationRemarks: capitalAllocation,
    thesisSignals: thesis,
    sourceReferences,
    badges: BADGES,
    summaryWarnings,
    displayOnly: true,
    modelReady: false,
    valuationImpactAllowed: false,
  };

  transcriptCallSummaries.push(callSummary);
}

export const lsegTranscriptCallSummaryById = new Map(
  transcriptCallSummaries.map((summary) => [summary.event.transcriptId, summary]),
);

export const lsegTranscriptEvidenceByEvent = transcriptEvidenceById;
