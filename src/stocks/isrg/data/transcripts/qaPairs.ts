import type { IsrgQaPair, IsrgTopicTrendPoint } from "./types";

export const isrgQaPairs: IsrgQaPair[] = [
  {
    id: "isrg-q1-2026-placeholder-dv5-rollout",
    transcriptId: "isrg-q1-2026-earnings-2026-04-21",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    analystName: "unknown",
    analystFirm: "unknown",
    question:
      "How should investors separate da Vinci 5 replacement-cycle demand from true procedure and TAM expansion?",
    managementSpeaker: "management",
    managementRole: "needs transcript review",
    answer:
      "Placeholder research question generated from the ISRG module monitoring framework. Replace with a parsed management answer after transcript ingestion and human review.",
    topicTags: ["da Vinci 5", "System placements", "Guidance"],
    sentiment: "mixed",
    evidenceStrength: "low",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    modelReady: false,
    valuationImpactAllowed: false,
    candidateOnly: true,
  },
  {
    id: "isrg-q1-2026-placeholder-tariffs",
    transcriptId: "isrg-q1-2026-earnings-2026-04-21",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    analystName: "unknown",
    analystFirm: "unknown",
    question:
      "How durable is the FY 2026 gross margin outlook if tariffs, manufacturing localization, and supply chain pressure persist?",
    managementSpeaker: "management",
    managementRole: "needs transcript review",
    answer:
      "Placeholder research question generated from official guidance language. Do not treat it as a management quote or valuation input.",
    topicTags: ["Margins", "Tariffs", "Guidance"],
    sentiment: "negative",
    evidenceStrength: "low",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    modelReady: false,
    valuationImpactAllowed: false,
    candidateOnly: true,
  },
];

export const isrgTopicTrends: IsrgTopicTrendPoint[] = [
  {
    periodId: "q1-2026",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    topic: "Procedure growth",
    mentions: 2,
    preparedRemarkMentions: 1,
    qaMentions: 1,
    evidenceStrength: "low",
  },
  {
    periodId: "q1-2026",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    topic: "da Vinci 5",
    mentions: 2,
    preparedRemarkMentions: 1,
    qaMentions: 1,
    evidenceStrength: "low",
  },
  {
    periodId: "q1-2026",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    topic: "Tariffs",
    mentions: 1,
    preparedRemarkMentions: 1,
    qaMentions: 0,
    evidenceStrength: "low",
  },
  {
    periodId: "q1-2026",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    topic: "Ion",
    mentions: 1,
    preparedRemarkMentions: 1,
    qaMentions: 0,
    evidenceStrength: "low",
  },
];
