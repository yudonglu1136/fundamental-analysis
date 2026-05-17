import { googlTranscriptEvents, type GooglTranscriptFocusId } from "../data/transcriptData";

const focusDefinitions: Array<{ id: GooglTranscriptFocusId; label: string; keywords: string[] }> = [
  { id: "ai_search", label: "AI Search monetization", keywords: ["search", "ai overviews", "ai mode", "query", "queries", "monetization", "ads"] },
  { id: "cloud_ai", label: "Cloud / enterprise AI", keywords: ["cloud", "backlog", "gemini enterprise", "enterprise ai", "customer", "workload"] },
  { id: "tpu_capex", label: "TPU / CapEx / compute", keywords: ["tpu", "capex", "compute", "infrastructure", "depreciation", "data center", "power"] },
  { id: "youtube_subscriptions", label: "YouTube / subscriptions", keywords: ["youtube", "subscriptions", "premium", "shorts", "living room", "creator"] },
  { id: "regulatory", label: "Regulatory / remedies", keywords: ["regulatory", "ec fine", "fine", "remedy", "remedies", "antitrust", "default"] },
  { id: "waymo_other_bets", label: "Waymo / Other Bets", keywords: ["waymo", "other bets", "rides", "verily", "gfiber", "option value"] },
  { id: "fcf_capital_return", label: "FCF / capital return", keywords: ["fcf", "free cash flow", "buyback", "dividend", "shareholder", "capital return"] },
  { id: "ads_tac", label: "Ads / TAC / retail", keywords: ["ads", "advertising", "tac", "retail", "cpc", "paid clicks", "direct response"] },
];

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function countFocusHits(text: string, keywords: string[]) {
  const haystack = normalize(text);
  return keywords.reduce((count, keyword) => count + (haystack.includes(normalize(keyword)) ? 1 : 0), 0);
}

function average(items: number[]) {
  return items.reduce((sum, item) => sum + item, 0) / Math.max(items.length, 1);
}

function sortByDateDescending<T extends { eventDate: string }>(items: T[]) {
  return items.slice().sort((left, right) => Date.parse(right.eventDate) - Date.parse(left.eventDate));
}

export function calculateGooglTranscriptIntelligenceEngine() {
  const quarters = sortByDateDescending(googlTranscriptEvents).slice(0, 8).map((event) => {
    const evidenceText = [
      event.aiSummary,
      event.managementMessages.join(" "),
      event.watchlist.join(" "),
      ...event.qaPairs.map((pair) => `${pair.topic} ${pair.question} ${pair.answer} ${pair.metricMentioned ?? ""}`),
    ].join(" ");

    const focusScores = focusDefinitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      score:
        countFocusHits(evidenceText, definition.keywords) +
        event.qaPairs.filter((pair) => countFocusHits(`${pair.topic} ${pair.metricMentioned ?? ""}`, definition.keywords) > 0).length,
    }));

    const sentimentBalance = event.qaPairs.reduce((sum, pair) => {
      if (pair.sentiment === "positive") return sum + 1;
      if (pair.sentiment === "negative") return sum - 1;
      return sum;
    }, 0);

    return {
      ...event,
      qaCount: event.qaPairs.length,
      topFocus: focusScores.slice().sort((left, right) => right.score - left.score).slice(0, 3),
      focusScores,
      sentimentBalance,
      analystQuestions: event.qaPairs,
      sourceGuard: `${event.sourceType}: ${event.sourceStatus}`,
      valuationImpactAllowed: false as const,
    };
  });

  const focusTrend = focusDefinitions.map((definition) => {
    const series = quarters.slice().reverse().map((quarter) => ({
      transcriptId: quarter.transcriptId,
      label: quarter.shortLabel,
      eventDate: quarter.eventDate,
      score: quarter.focusScores.find((score) => score.id === definition.id)?.score ?? 0,
    }));
    const midpoint = Math.floor(series.length / 2);
    const firstAverage = average(series.slice(0, midpoint).map((item) => item.score));
    const secondAverage = average(series.slice(midpoint).map((item) => item.score));
    const direction = secondAverage > firstAverage + 0.75 ? "rising" : secondAverage < firstAverage - 0.75 ? "fading" : "stable";

    return {
      id: definition.id,
      label: definition.label,
      series,
      firstAverage,
      secondAverage,
      direction,
    };
  });

  const risingFocus = focusTrend.filter((item) => item.direction === "rising").map((item) => item.label);
  const fadingFocus = focusTrend.filter((item) => item.direction === "fading").map((item) => item.label);
  const latestQuarter = quarters[0];
  const qaPairs = quarters.flatMap((quarter) => quarter.analystQuestions);

  const aiTrendSummary = [
    "Across the past eight quarters, GOOGL earnings-call focus has moved from Search and Cloud product innovation toward whether AI is generating measurable revenue, whether Cloud backlog can convert, and whether TPU/data-center CapEx pressures FCF.",
    risingFocus.length > 0 ? `Rising themes: ${risingFocus.join(", ")}.` : "No single rising theme is dominant; the debate remains distributed.",
    fadingFocus.length > 0 ? `Fading themes: ${fadingFocus.join(", ")}.` : "No theme is clearly fading.",
    latestQuarter ? `The latest quarter, ${latestQuarter.shortLabel}, is led by ${latestQuarter.topFocus.map((item) => item.label).join(", ")} with ${latestQuarter.qaCount} Q&A themes.` : "",
    "This layer is transcript/commentary/secondary-transcript analysis. It is not official actual data and does not feed valuation unless it is explicitly promoted into a forecast assumption.",
  ].filter(Boolean).join(" ");

  return {
    events: quarters,
    quarters,
    qaPairs,
    focusTrend,
    topicCounts: qaPairs.reduce<Record<string, number>>((acc, pair) => {
      acc[pair.topic] = (acc[pair.topic] ?? 0) + 1;
      return acc;
    }, {}),
    aiTrendSummary,
    validation: {
      checks: [
        `${quarters.length} earnings-call periods loaded.`,
        `${qaPairs.length} analyst-focus Q&A/theme pairs loaded.`,
        "Transcript layer is valuation-blocked by default.",
      ],
      warnings: quarters.length < 8 ? ["Fewer than eight Alphabet earnings-call periods are loaded."] : [],
    },
  };
}
