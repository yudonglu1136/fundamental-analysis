import type { IsrgDataLayer, IsrgTranscriptTopic } from "./model";

const topicOrder: IsrgTranscriptTopic[] = [
  "Procedure growth",
  "da Vinci 5",
  "System placements",
  "Lease mix",
  "OUS growth",
  "China",
  "Ion",
  "SP",
  "Margins",
  "Tariffs",
  "Competition",
  "GLP-1",
  "Bariatric",
  "Capital allocation",
  "Guidance",
];

export function calculateTranscriptEngine(data: IsrgDataLayer) {
  const { events, qaPairs, topicTrends } = data.transcriptInsights;
  const quarterFocus = [...(data.transcriptInsights.quarterFocus ?? [])].sort((a, b) => a.callDate.localeCompare(b.callDate));
  const latestQuarterFocus = quarterFocus[quarterFocus.length - 1];
  const topicHeatmap = topicOrder.map((topic) => {
    const transcriptMentions = topicTrends.filter((row) => row.topic === topic).reduce((sum, row) => sum + row.mentions, 0);
    const focusMentions = quarterFocus.reduce((sum, quarter) => sum + (quarter.focusScores[topic] ?? 0), 0);
    return {
      topic,
      mentions: transcriptMentions || focusMentions,
      qaMentions: topicTrends.filter((row) => row.topic === topic).reduce((sum, row) => sum + row.qaMentions, 0),
      focusScore: focusMentions,
    };
  });
  const focusTrendRows = quarterFocus.map((quarter) => ({
    period: quarter.label,
    "Procedure growth": quarter.focusScores["Procedure growth"] ?? 0,
    "da Vinci 5": quarter.focusScores["da Vinci 5"] ?? 0,
    "Lease mix": quarter.focusScores["Lease mix"] ?? 0,
    "Margins / tariffs": (quarter.focusScores.Margins ?? 0) + (quarter.focusScores.Tariffs ?? 0),
    "Ion / SP": (quarter.focusScores.Ion ?? 0) + (quarter.focusScores.SP ?? 0),
    "OUS / China": (quarter.focusScores["OUS growth"] ?? 0) + (quarter.focusScores.China ?? 0),
    Competition: quarter.focusScores.Competition ?? 0,
  }));
  const analystConcerns = qaPairs.map((pair) => ({
    id: pair.id,
    analyst: `${pair.analystName} / ${pair.analystFirm}`,
    concern: pair.question,
    topics: pair.topicTags,
    sentiment: pair.sentiment,
    evidenceStrength: pair.evidenceStrength,
  }));

  return {
    events,
    qaPairs,
    topicTrends,
    topicHeatmap,
    analystConcerns,
    quarterFocus,
    focusTrendRows,
    eightQuarterOverview:
      "AI research-only synthesis: the market debate moved from procedure durability and system placement recovery in mid-2024, to da Vinci 5 launch and replacement-cycle quality, then to 2025 guidance, GLP-1/bariatric exposure, OUS/China and Ion optionality, and most recently to tariff-driven margin durability, usage-based leasing, and whether current valuation already prices sustained mid-teens procedure growth.",
    marketFocusEvolution: [
      "Q2-Q3 2024: procedure durability, hospital capex recovery, and early da Vinci 5 launch quality.",
      "Q4 2024-Q1 2025: 2025 guidance, GLP-1/bariatric risk, da Vinci 5 placement mix, and leasing as an adoption valve.",
      "Q2-Q3 2025: OUS/China, Ion second-platform proof points, competition, and margin durability.",
      "Q4 2025-Q1 2026: 2026 procedure guidance, replacement vs TAM expansion, tariffs, lease quality, and valuation sensitivity.",
    ],
    managementTone:
      "Tone summary is AI research-only until raw transcripts are parsed: management narrative appears focused on procedure adoption, platform expansion, da Vinci 5 rollout discipline, and managing tariff/margin pressure.",
    latestCallSummary:
      latestQuarterFocus?.aiSummary ??
      "Latest call transcript is manifest-only in the starter module. Official financial and operating metrics come from earnings releases; transcript-derived insights remain candidate-only.",
    guidanceTracker: data.officialGuidance.map((item) => ({
      metric: item.metric,
      period: item.period,
      low: item.low,
      high: item.high,
      midpoint: item.midpoint,
      source: item.source.sourceUrl,
    })),
    extractionRules: [
      "Transcript rows are modelReady = false and valuationImpactAllowed = false by default.",
      "Only explicit numeric disclosures with source validation may be promoted to actualData, officialGuidance, or forecastAnchors.",
      "Bull/bear quotes should retain transcriptId, sourcePath, and human-review status.",
    ],
    warnings: data.dataStatus.warnings.filter((warning) => warning.id.includes("transcript")),
  };
}
