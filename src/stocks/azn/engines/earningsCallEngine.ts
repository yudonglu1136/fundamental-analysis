import type { AznDataset, AznEarningsCallEvent, AznEarningsCallTopic } from "../types";

const TOPIC_ORDER: AznEarningsCallTopic[] = [
  "Revenue Momentum",
  "Guidance",
  "Oncology",
  "Pipeline",
  "Patent / LOE",
  "China",
  "Margins",
  "Capital Allocation",
  "Business Development",
];

function averageTopicScore(events: AznEarningsCallEvent[], topic: AznEarningsCallTopic) {
  return events.reduce((sum, event) => sum + event.topicScores[topic], 0) / Math.max(events.length, 1);
}

function directionFromDelta(delta: number) {
  if (delta >= 15) return "Rising";
  if (delta <= -15) return "Fading";
  return "Stable";
}

function buildAiOverview(events: AznEarningsCallEvent[]) {
  const firstHalf = events.slice(0, 3);
  const middle = events.slice(3, 6);
  const latest = events.slice(6);
  const earlyTop = TOPIC_ORDER
    .map((topic) => ({ topic, score: averageTopicScore(firstHalf, topic) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.topic);
  const latestTop = TOPIC_ORDER
    .map((topic) => ({ topic, score: averageTopicScore(latest, topic) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.topic);

  return {
    headline: "Market focus moved from top-line growth validation to pipeline replacement value and patent-cliff execution.",
    narrative:
      `Early calls were dominated by ${earlyTop.join(", ")} as AZN upgraded guidance and defended Ambition 2030. ` +
      `Through 2025, the debate shifted toward readout quality, launch conversion and whether oncology / rare disease could absorb Farxiga, Lynparza and Soliris pressure. ` +
      `The latest calls are led by ${latestTop.join(", ")}, which means the market is now underwriting replacement value, not just growth optics.`,
    earlyFocus: earlyTop,
    middleFocus: TOPIC_ORDER
      .map((topic) => ({ topic, score: averageTopicScore(middle, topic) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.topic),
    latestFocus: latestTop,
  };
}

export function buildAznEarningsCallIntelligence(data: AznDataset, selectedEventId?: string) {
  const events = [...data.earningsCallData].sort((a, b) => a.sequence - b.sequence);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[events.length - 1];
  const previousEvent = events.find((event) => event.sequence === selectedEvent.sequence - 1);
  const firstTwo = events.slice(0, 2);
  const lastTwo = events.slice(-2);

  const marketFocusTrend = TOPIC_ORDER.map((topic) => {
    const startScore = averageTopicScore(firstTwo, topic);
    const latestScore = averageTopicScore(lastTwo, topic);
    const delta = latestScore - startScore;
    return {
      topic,
      startScore,
      latestScore,
      delta,
      direction: directionFromDelta(delta),
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const topicHeatmap = TOPIC_ORDER.map((topic) => ({
    topic,
    ...Object.fromEntries(events.map((event) => [event.fiscalQuarter, event.topicScores[topic]])),
  }));

  const timeline = events.map((event) => ({
    id: event.id,
    quarter: event.fiscalQuarter,
    eventDate: event.eventDate,
    totalRevenue: event.totalRevenue,
    totalRevenueGrowthCer: event.totalRevenueGrowthCer,
    coreEps: event.coreEps,
    coreEpsGrowthCer: event.coreEpsGrowthCer,
    pipelineReadouts: event.pipelineReadouts,
    approvals: event.approvals,
    patentLoeFocus: event.topicScores["Patent / LOE"],
    pipelineFocus: event.topicScores.Pipeline,
    chinaFocus: event.topicScores.China,
    marginFocus: event.topicScores.Margins,
  }));

  return {
    events,
    selectedEvent,
    previousEvent,
    marketFocusTrend,
    topicHeatmap,
    timeline,
    aiOverview: buildAiOverview(events),
    validation: {
      eventCount: events.length,
      warnings: events.length < 8 ? ["Fewer than eight AZN earnings-call events are loaded."] : [],
      valuationImpactAllowed: events.every((event) => event.valuationImpactAllowed === false),
      transcriptImportedCount: events.filter((event) => event.transcriptImported).length,
    },
  };
}
