import { getPreviousTranscriptEventId, lsegTranscriptCallEvents } from "./callEvents";
import { lsegTranscriptCallSummaryById, lsegTranscriptEvidenceByEvent } from "./callSummaries";
import { buildTranscriptTrendComparison } from "./callTrendComparisons";
import type { TranscriptWatchlistItem, TranscriptWatchlistReviewItem, WatchlistCategory } from "./types";

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function makeWatchlistItem(
  transcriptId: string,
  category: WatchlistCategory,
  label: string,
  rationale: string,
  tags: string[],
  evidenceQuote?: string,
  priority: TranscriptWatchlistItem["priority"] = "medium",
): TranscriptWatchlistItem {
  const summary = lsegTranscriptCallSummaryById.get(transcriptId);
  return {
    id: `${transcriptId}-${category}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    transcriptId,
    category,
    label,
    rationale,
    evidenceQuote,
    priority,
    tags,
    sourceReferences: summary?.sourceReferences ?? [],
    displayOnly: true,
    modelReady: false,
    valuationImpactAllowed: false,
  };
}

function buildNextCallWatchlist(transcriptId: string) {
  const summary = lsegTranscriptCallSummaryById.get(transcriptId);
  if (!summary) return [];

  const items: TranscriptWatchlistItem[] = [];
  const firstGuidance = summary.explicitGuidanceCandidates[0];
  const firstKpi = summary.kpiHighlights[0];
  const firstRisk = summary.riskMentions[0];
  const firstCapitalAllocation = summary.capitalAllocationRemarks[0];
  const firstQa = summary.qaHotTopics[0];

  if (firstGuidance) {
    items.push(
      makeWatchlistItem(
        transcriptId,
        "guidance_points",
        "Verify whether explicit revenue / cash guidance still holds at the next event",
        "Management gave transcript-derived guidance language that should be checked against the next official release and prepared remarks.",
        unique(firstGuidance.tags),
        firstGuidance.quote,
        "high",
      ),
    );
  }

  if (firstKpi) {
    items.push(
      makeWatchlistItem(
        transcriptId,
        "kpis_to_monitor",
        `Monitor ${firstKpi.title} for measurable follow-through`,
        "The current event highlighted this KPI qualitatively; next call should ideally provide more concrete usage, adoption, or growth evidence.",
        unique(firstKpi.tags),
        firstKpi.quote,
        "high",
      ),
    );
  }

  if (firstRisk) {
    items.push(
      makeWatchlistItem(
        transcriptId,
        "risks_to_revisit",
        `Revisit ${firstRisk.title}`,
        "This remains an active transcript-derived risk and should be checked for mitigation, persistence, or worsening at the next event.",
        unique(firstRisk.tags),
        firstRisk.quote,
        "high",
      ),
    );
  }

  if (firstCapitalAllocation) {
    items.push(
      makeWatchlistItem(
        transcriptId,
        "top_questions",
        `Ask for a clearer capital-allocation update on ${firstCapitalAllocation.title.toLowerCase()}`,
        "Capital-allocation language appears in transcript review, but remains display-only and should be corroborated before any model promotion.",
        unique(firstCapitalAllocation.tags),
        firstCapitalAllocation.quote,
      ),
    );
  }

  if (firstQa) {
    items.push(
      makeWatchlistItem(
        transcriptId,
        "likely_qa",
        `Expect analysts to revisit ${firstQa.title.toLowerCase()}`,
        "This topic appeared in Q&A or Q&A-like transcript sections and is likely to resurface if the business driver remains active.",
        unique(firstQa.tags),
        firstQa.quote,
      ),
    );
  }

  const trends = buildTranscriptTrendComparison(transcriptId);
  const unclearTrend = trends.find((row) => row.direction === "unclear");
  if (unclearTrend) {
    items.push(
      makeWatchlistItem(
        transcriptId,
        "top_questions",
        `Clarify the next-step trajectory for ${unclearTrend.label.toLowerCase()}`,
        "Comparison evidence was too mixed to call directionally, so the next event should be used to clarify the driver.",
        [unclearTrend.dimensionId.replace(/_/g, " ")],
        unclearTrend.currentQuote,
      ),
    );
  }

  return items;
}

function reviewPriorWatchlist(currentTranscriptId: string, priorTranscriptId?: string) {
  const priorId = priorTranscriptId ?? getPreviousTranscriptEventId(currentTranscriptId);
  if (!priorId) return [];

  const currentEvidence = lsegTranscriptEvidenceByEvent.get(currentTranscriptId) ?? [];
  const priorItems = buildNextCallWatchlist(priorId);

  return priorItems.map((item) => {
    const matches = currentEvidence.filter((evidence) =>
      item.tags.some((tag) => evidence.tags.join(" ").includes(tag)),
    );
    const bestMatch = matches[0];
    let status: TranscriptWatchlistReviewItem["status"] = "not_fulfilled";
    let explanation = "The selected event did not clearly address this prior watchlist item in the extracted transcript evidence.";

    if (matches.length === 0) {
      status = "not_fulfilled";
    } else if (bestMatch?.confidence === "high" && bestMatch.sentiment !== "negative") {
      status = "fulfilled";
      explanation = "The selected event provided direct transcript evidence on this prior watchlist item.";
    } else if (bestMatch?.confidence === "medium") {
      status = "partially_fulfilled";
      explanation = "The selected event touched the topic, but the evidence remains partial or transcript-only.";
    } else {
      status = "unclear";
      explanation = "There is some overlap, but the transcript evidence is too thin or noisy to call this fulfilled.";
    }

    return {
      id: `${priorId}-${currentTranscriptId}-${item.id}`,
      sourceTranscriptId: priorId,
      reviewedAgainstTranscriptId: currentTranscriptId,
      originalItem: item,
      status,
      evidenceQuote: bestMatch?.quote,
      explanation,
      displayOnly: true,
      modelReady: false,
      valuationImpactAllowed: false,
    } satisfies TranscriptWatchlistReviewItem;
  });
}

export const lsegTranscriptNextCallWatchlists = new Map(
  lsegTranscriptCallEvents.map((event) => [event.transcriptId, buildNextCallWatchlist(event.transcriptId)]),
);

export const lsegTranscriptWatchlistReviews = new Map(
  lsegTranscriptCallEvents.map((event) => [event.transcriptId, reviewPriorWatchlist(event.transcriptId)]),
);

export function getNextCallWatchlist(transcriptId: string) {
  return lsegTranscriptNextCallWatchlists.get(transcriptId) ?? [];
}

export function getWatchlistReview(transcriptId: string, priorTranscriptId?: string) {
  return reviewPriorWatchlist(transcriptId, priorTranscriptId);
}
