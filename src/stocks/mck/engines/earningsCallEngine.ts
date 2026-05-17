import type { MckDataset, MckTranscriptTopic } from "../types";

const allTopics: MckTranscriptTopic[] = [
  "specialty",
  "oncology",
  "biopharma services",
  "GLP-1",
  "biosimilars",
  "margin",
  "working capital",
  "capital allocation",
  "buyback",
  "reimbursement",
  "customer contracts",
  "regulatory",
];

function countTopic(events: MckDataset["transcriptEvents"], topic: MckTranscriptTopic) {
  return events.filter((event) => event.topics.includes(topic)).length;
}

function directionFor(earlyMentions: number, recentMentions: number) {
  if (earlyMentions === 0 && recentMentions > 0) return "New" as const;
  if (recentMentions > earlyMentions + 1) return "Rising" as const;
  if (recentMentions < earlyMentions - 1) return "Fading" as const;
  return "Stable" as const;
}

function interpretationFor(topic: MckTranscriptTopic, direction: "Rising" | "Stable" | "Fading" | "New") {
  const base: Record<MckTranscriptTopic, string> = {
    specialty: "Specialty remains a core read-through for distribution mix quality and provider stickiness.",
    oncology: "Oncology moved from strategic adjacency to the central growth narrative as USON, Core Ventures and PRISM became more prominent.",
    "biopharma services": "Biopharma services increasingly frame MCK as healthcare service infrastructure rather than only a distributor.",
    "GLP-1": "GLP-1 started as a visible volume/mix question and is now more of a margin and working-capital monitoring item.",
    biosimilars: "Biosimilars remain a watch item rather than a dominant quarterly debate in the release-derived dataset.",
    margin: "Margin bps remain the critical translation layer from huge revenue dollars to profit and EPS.",
    "working capital": "Working-capital volatility is a recurring cash-flow quality issue, especially around customer onboarding and acquisition timing.",
    "capital allocation": "Capital allocation became more central as FCF, ASR and repurchase authorization grew in importance.",
    buyback: "Buybacks are increasingly important to per-share value, but value creation depends on execution price.",
    reimbursement: "Reimbursement pressure is a latent risk that shows up through RxTS and provider economics rather than one isolated quarter.",
    "customer contracts": "Customer-contract mix matters because large retail national accounts can drive revenue without equivalent margin quality.",
    regulatory: "Regulatory and portfolio actions matter mainly through divestitures, separation, DSCSA/compliance and transaction approvals.",
  };
  return `${direction}: ${base[topic]}`;
}

export function calculateEarningsCallEngine(data: MckDataset) {
  const events = [...data.transcriptEvents].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  const recentEvents = events.slice(0, 4);
  const earlyEvents = events.slice(4, 8);
  const themes = allTopics.map((topic) => {
    const quoteCount = data.managementQuotes.filter((quote) => quote.topic === topic).length;
    const qaCount = data.qaPairs.filter((pair) => pair.topic === topic).length;
    const eventCount = countTopic(events, topic);
    const count = quoteCount + qaCount + eventCount;
    return {
      topic,
      count,
      tone: count === 0 ? ("Neutral" as const) : topic === "oncology" || topic === "specialty" || topic === "capital allocation" ? ("Positive" as const) : ("Needs Review" as const),
    };
  });
  const topicTrends = allTopics.map((topic) => {
    const earlyMentions = countTopic(earlyEvents, topic);
    const recentMentions = countTopic(recentEvents, topic);
    const direction = directionFor(earlyMentions, recentMentions);
    return {
      topic,
      earlyMentions,
      recentMentions,
      direction,
      interpretation: interpretationFor(topic, direction),
    };
  });
  const quarterlyFocus = events.map((event) => ({
    eventId: event.id,
    fiscalPeriod: event.fiscalPeriod,
    eventDate: event.eventDate,
    primaryFocus: event.marketFocus,
    concern: event.analystConcerns[0] ?? "Transcript Q&A pending.",
    thesisRead: event.thesisRead,
  }));
  const aiSummary =
    "AI synthesis of the release-derived eight-quarter history: the market focus evolved from GLP-1 volume, RxTS access-program pressure, negative FCF timing and buyback authorization in FY2025 Q1 toward oncology platform expansion through FCS/Core Ventures and PRISM, then toward portfolio simplification, new segment transparency, biopharma services, FY2027 guidance and capital return in FY2026. The durable debate is no longer just whether MCK can grow revenue; it is whether oncology/multispecialty and biopharma services can raise profit quality while working-capital swings and buyback execution remain disciplined.";
  return {
    events,
    selectedEventId: events[0]?.id ?? "",
    quotes: data.managementQuotes,
    qaPairs: data.qaPairs,
    themes,
    trendOverview: {
      aiSummary,
      topicTrends,
      quarterlyFocus,
    },
  };
}
