import { lsegTranscriptIntelligenceLab } from "../data/transcripts";
import type { LsegTranscriptQa } from "../types";

const focusDefinitions = [
  { id: "workspace", label: "Workspace / D&A", keywords: ["workspace", "data analytics", "refinitiv", "mcp", "data and analytics", "workflow"] },
  { id: "growth", label: "Growth / guidance", keywords: ["growth", "guidance", "revenue", "organic", "asv"] },
  { id: "margin", label: "Margin / FCF", keywords: ["margin", "ebitda", "free cash flow", "cash conversion", "capex"] },
  { id: "post_trade", label: "Post Trade / LCH", keywords: ["post trade", "lch", "swapclear", "clearing", "forexclear"] },
  { id: "capital_markets", label: "Capital Markets / Tradeweb", keywords: ["tradeweb", "capital markets", "fixed income", "fx", "volumes"] },
  { id: "index", label: "FTSE Russell / Index", keywords: ["ftse", "index", "benchmark", "asset based"] },
  { id: "capital_returns", label: "Buyback / dividend", keywords: ["buyback", "dividend", "leverage", "capital allocation"] },
  { id: "risk", label: "Risk / regulation / AI", keywords: ["risk", "regulation", "regulatory", "ai", "competition", "pricing"] },
];

function inferSentiment(text: string): LsegTranscriptQa["sentiment"] {
  const normalized = text.toLowerCase();
  const positives = ["strong", "growth", "positive", "improve", "confidence", "opportunity", "accelerat"];
  const negatives = ["pressure", "risk", "slow", "weak", "headwind", "declin", "uncertain"];
  const positiveHits = positives.filter((term) => normalized.includes(term)).length;
  const negativeHits = negatives.filter((term) => normalized.includes(term)).length;
  if (positiveHits > negativeHits) return "positive";
  if (negativeHits > positiveHits) return "negative";
  if (positiveHits > 0 && negativeHits > 0) return "mixed";
  return "neutral";
}

function hasQuantGuidance(text: string) {
  return /\b\d+(?:\.\d+)?\s*(?:%|bps|basis points|million|billion|bn|m|x)\b/i.test(text);
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function countFocusHits(text: string, keywords: string[]) {
  const haystack = normalize(text);
  return keywords.reduce((count, keyword) => count + (haystack.includes(normalize(keyword)) ? 1 : 0), 0);
}

function sortByDateDescending<T extends { eventDate: string }>(items: T[]) {
  return items.slice().sort((left, right) => Date.parse(right.eventDate) - Date.parse(left.eventDate));
}

export function calculateLsegTranscriptIntelligenceEngine() {
  const qaPairs: LsegTranscriptQa[] = lsegTranscriptIntelligenceLab.qaPairs.map((pair) => {
    const answer = pair.answerText ?? pair.answerSummary ?? "";
    const question = pair.questionText ?? pair.questionSummary ?? "";
    return {
      id: pair.id,
      transcriptId: pair.transcriptId,
      eventDate: pair.eventDate,
      speaker: pair.analystName,
      speakerRole: "analyst",
      topic: pair.topic,
      sentiment: inferSentiment(`${question} ${answer}`),
      metricMentioned: pair.modelDriver,
      question,
      answer,
      managementGaveQuantGuidance: hasQuantGuidance(answer),
      followUpRisk: pair.followUpNeeded ? `Follow up on ${pair.modelDriver}.` : "No immediate follow-up flagged by extraction layer.",
      sourcePath: pair.sourcePath,
      sourceType: "transcript_commentary",
      valuationImpactAllowed: false,
      needsHumanReview: pair.needsHumanReview,
    };
  });

  const topicCounts = qaPairs.reduce<Record<string, number>>((acc, pair) => {
    acc[pair.topic] = (acc[pair.topic] ?? 0) + 1;
    return acc;
  }, {});

  const quarters = sortByDateDescending(lsegTranscriptIntelligenceLab.events).slice(0, 8).map((event) => {
    const summary = lsegTranscriptIntelligenceLab.summaryById.get(event.transcriptId);
    const eventQa = qaPairs.filter((pair) => pair.transcriptId === event.transcriptId);
    const evidenceText = [
      summary?.conclusion ?? "",
      ...(summary?.topManagementMessages ?? []).map((item) => `${item.title} ${item.explanation} ${item.quote}`),
      ...(summary?.qaHotTopics ?? []).map((item) => `${item.title} ${item.explanation} ${item.quote}`),
      ...eventQa.map((pair) => `${pair.topic} ${pair.metricMentioned ?? ""} ${pair.question} ${pair.answer}`),
    ].join(" ");
    const focusScores = focusDefinitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      score: countFocusHits(evidenceText, definition.keywords) + eventQa.filter((pair) => countFocusHits(`${pair.topic} ${pair.metricMentioned ?? ""}`, definition.keywords) > 0).length,
    }));
    const topFocus = focusScores.slice().sort((left, right) => right.score - left.score).slice(0, 3);
    const sentimentBalance = eventQa.reduce((sum, pair) => {
      if (pair.sentiment === "positive") return sum + 1;
      if (pair.sentiment === "negative") return sum - 1;
      return sum;
    }, 0);

    return {
      transcriptId: event.transcriptId,
      label: event.shortLabel,
      eventDate: event.eventDate,
      fiscalPeriod: event.fiscalPeriod,
      eventType: event.eventType,
      hasQA: eventQa.length > 0,
      qaCount: eventQa.length,
      conclusion: summary?.conclusion ?? "Transcript summary is not available for this event.",
      topFocus,
      focusScores,
      sentimentBalance,
      managementMessages: (summary?.topManagementMessages ?? []).slice(0, 4).map((item) => item.title),
      analystQuestions: eventQa.slice(0, 6),
      watchlist: lsegTranscriptIntelligenceLab.getNextCallWatchlist(event.transcriptId).slice(0, 5),
    };
  });

  const focusTrend = focusDefinitions.map((definition) => {
    const series = quarters.slice().reverse().map((quarter) => ({
      transcriptId: quarter.transcriptId,
      label: quarter.label,
      eventDate: quarter.eventDate,
      score: quarter.focusScores.find((score) => score.id === definition.id)?.score ?? 0,
    }));
    const firstHalf = series.slice(0, Math.max(1, Math.floor(series.length / 2)));
    const secondHalf = series.slice(Math.floor(series.length / 2));
    const firstAverage = firstHalf.reduce((sum, item) => sum + item.score, 0) / Math.max(firstHalf.length, 1);
    const secondAverage = secondHalf.reduce((sum, item) => sum + item.score, 0) / Math.max(secondHalf.length, 1);
    const direction = secondAverage > firstAverage + 0.75 ? "rising" : secondAverage < firstAverage - 0.75 ? "fading" : "stable";
    return {
      id: definition.id,
      label: definition.label,
      direction,
      firstAverage,
      secondAverage,
      series,
    };
  });

  const risingFocus = focusTrend.filter((item) => item.direction === "rising").map((item) => item.label);
  const fadingFocus = focusTrend.filter((item) => item.direction === "fading").map((item) => item.label);
  const latestQuarter = quarters[0];
  const aiTrendSummary = [
    "Across the past eight quarters, market focus moved from growth, ASV, and Refinitiv/Workspace execution toward FCF, CapEx, buybacks, Post Trade/LCH durability, and the sustainability of AI-driven data distribution.",
    risingFocus.length > 0 ? `Rising themes: ${risingFocus.join(", ")}.` : "No single rising theme is dominant; market focus remains distributed.",
    fadingFocus.length > 0 ? `Fading themes: ${fadingFocus.join(", ")}.` : "No theme is clearly fading.",
    latestQuarter ? `The latest quarter, ${latestQuarter.label}, is led by ${latestQuarter.topFocus.map((item) => item.label).join(", ")} with ${latestQuarter.qaCount} Q&A items.` : "",
    "This summary comes from the transcript/commentary layer. It does not feed valuation unless it is reviewed and explicitly converted into a forecast assumption.",
  ].filter(Boolean).join(" ");

  return {
    events: lsegTranscriptIntelligenceLab.events,
    summaries: lsegTranscriptIntelligenceLab.summaries,
    qaPairs,
    topicCounts,
    quarters,
    focusTrend,
    aiTrendSummary,
    validation: lsegTranscriptIntelligenceLab.validation,
    unresolvedRisks: qaPairs.filter((pair) => pair.followUpRisk && pair.followUpRisk !== "No immediate follow-up flagged by extraction layer.").slice(0, 12),
  };
}
