import transcriptMetadata from "../../../../../data/local/lseg/transcripts/curated/transcript_metadata.json";
import { lsegTranscriptCallEvents } from "./callEvents";
import { lsegTranscriptCallSummaryById, transcriptCallSummaries } from "./callSummaries";
import { buildTranscriptTrendComparison, lsegDefaultTranscriptTrendComparisons, lsegTranscriptTrendDimensions } from "./callTrendComparisons";
import {
  getTranscriptQaPairs,
  lsegTranscriptQaPairCountsByTranscriptId,
  lsegTranscriptQaPairs,
  lsegTranscriptQaPairWarnings,
} from "./qaPairs";
import { getNextCallWatchlist, getWatchlistReview, lsegTranscriptNextCallWatchlists, lsegTranscriptWatchlistReviews } from "./callWatchlists";
import type { TranscriptIntelligenceValidation } from "./types";

export * from "./types";
export * from "./callEvents";
export * from "./callSummaries";
export * from "./callTrendComparisons";
export * from "./qaPairs";
export * from "./callWatchlists";

export function validateLsegTranscriptIntelligenceLab(): TranscriptIntelligenceValidation {
  const warnings: string[] = [];
  const checks: string[] = [];
  const metadataRecords = (transcriptMetadata.records ?? []) as Array<{
    transcriptId: string;
    hasQA?: boolean;
    qaBoundaryConfidence?: string;
  }>;
  const knownTranscriptIds = new Set(lsegTranscriptCallEvents.map((event) => event.transcriptId));

  if (!lsegTranscriptCallEvents.every((event) => event.transcriptId && event.eventDate)) {
    warnings.push("All transcript events should expose transcriptId and eventDate.");
  } else {
    checks.push("All call events expose transcriptId and eventDate.");
  }

  if (!transcriptCallSummaries.every((summary) => summary.sourceReferences.length > 0)) {
    warnings.push("All transcript summaries should include source references.");
  } else {
    checks.push("All summaries include source references.");
  }

  const qaEvents = metadataRecords.filter((record) => record.hasQA);
  if (!qaEvents.every((record) => (lsegTranscriptQaPairCountsByTranscriptId.get(record.transcriptId) ?? 0) > 0)) {
    warnings.push("Events marked with hasQA should expose at least one Q&A pair.");
  } else {
    checks.push("Events marked with hasQA expose Q&A pairs.");
  }

  if (
    !lsegTranscriptQaPairs.every(
      (pair) =>
        knownTranscriptIds.has(pair.transcriptId) &&
        Boolean(pair.eventDate) &&
        Boolean(pair.sourcePath) &&
        Boolean(pair.questionText || pair.questionSummary) &&
        Boolean(pair.answerText || pair.answerSummary) &&
        Boolean(pair.supportingQuoteShort) &&
        Boolean(pair.confidence) &&
        Boolean(pair.sourceQualityTag),
    )
  ) {
    warnings.push("All Q&A pairs should expose transcriptId, eventDate, sourcePath, question, answer, and confidence.");
  } else {
    checks.push("Q&A pairs expose transcriptId, question, answer, sourcePath, and confidence.");
  }

  if (
    !lsegTranscriptQaPairs.every(
      (pair) =>
        pair.candidateOnly === true &&
        pair.needsHumanReview === true &&
        pair.modelReady === false &&
        pair.valuationImpactAllowed === false,
    )
  ) {
    warnings.push("Q&A pairs must remain candidate-only, human-reviewed, and blocked from valuation.");
  } else {
    checks.push("Q&A pairs remain candidate-only and valuation-blocked.");
  }

  if (!lsegTranscriptQaPairs.every((pair) => pair.analystName.trim().length > 0 && pair.analystFirm.trim().length > 0)) {
    warnings.push("Q&A pairs must not have blank analyst names or firms; use unknown when needed.");
  } else {
    checks.push("Q&A pairs use explicit analyst / firm values, including unknown where needed.");
  }

  const lowConfidenceQaEvents = qaEvents.filter((record) => record.qaBoundaryConfidence === "low");
  if (
    lowConfidenceQaEvents.length > 0 &&
    !lowConfidenceQaEvents.every((record) =>
      getTranscriptQaPairs(record.transcriptId).every((pair) => pair.qaBoundaryConfidence === "low"),
    )
  ) {
    warnings.push("Low Q&A boundary confidence should be surfaced on Q&A pairs for affected events.");
  } else {
    checks.push("Low Q&A boundary confidence is surfaced on affected Q&A pairs.");
  }

  if (lsegTranscriptQaPairWarnings.length > 0) {
    warnings.push(...lsegTranscriptQaPairWarnings);
  } else {
    checks.push("Q&A pair generation did not report extraction-layer warnings.");
  }

  if (
    !lsegDefaultTranscriptTrendComparisons.every(
      (comparison) => comparison.currentTranscriptId && comparison.priorTranscriptId,
    )
  ) {
    warnings.push("Trend comparisons should include current and prior transcript references.");
  } else {
    checks.push("All default trend comparisons include current and prior event references.");
  }

  const allWatchlistItems = [
    ...Array.from(lsegTranscriptNextCallWatchlists.values()).flat(),
    ...Array.from(lsegTranscriptWatchlistReviews.values()).flat(),
  ];
  if (!allWatchlistItems.every((item) => item.displayOnly && item.modelReady === false && item.valuationImpactAllowed === false)) {
    warnings.push("All watchlist items and reviews must remain display-only with no valuation impact.");
  } else {
    checks.push("Watchlist items and reviews remain display-only and valuation-blocked.");
  }

  if (
    ![
      ...lsegTranscriptCallEvents,
      ...transcriptCallSummaries,
      ...lsegDefaultTranscriptTrendComparisons,
      ...allWatchlistItems,
    ].every((item) => item.modelReady === false && item.valuationImpactAllowed === false && (item.displayOnly || "candidateOnly" in item))
  ) {
    warnings.push("All transcript-intelligence objects should declare display-only / candidate-only guards.");
  } else {
    checks.push("Transcript-intelligence objects declare display-only / candidate-only guards.");
  }

  return { warnings, checks };
}

export const lsegTranscriptIntelligenceLab = {
  events: lsegTranscriptCallEvents,
  summaries: transcriptCallSummaries,
  summaryById: lsegTranscriptCallSummaryById,
  qaPairs: lsegTranscriptQaPairs,
  qaPairCountsByTranscriptId: lsegTranscriptQaPairCountsByTranscriptId,
  getQaPairs: getTranscriptQaPairs,
  trendDimensions: lsegTranscriptTrendDimensions,
  buildTrendComparison: buildTranscriptTrendComparison,
  getNextCallWatchlist,
  getWatchlistReview,
  validation: validateLsegTranscriptIntelligenceLab(),
};
