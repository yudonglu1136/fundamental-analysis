import transcriptMetadata from "../../../../../data/local/lseg/transcripts/curated/transcript_metadata.json";
import transcriptEventSummaries from "../../../../../data/local/lseg/transcripts/extracted/transcript_event_summaries.json";
import type { TranscriptCallEvent, TranscriptConfidence, TranscriptQaBoundaryConfidence } from "./types";

const EVENT_LABELS: Record<string, { label: string; shortLabel: string }> = {
  "lseg_q1_2024_trading_update_2024-04-25": {
    label: "Q1 2024 Trading Update",
    shortLabel: "Q1 2024",
  },
  "lseg_h1_2024_interim_results_2024-08-01": {
    label: "H1 2024 Interim Results",
    shortLabel: "H1 2024",
  },
  "lseg_fy_2024_preliminary_results_2025-02-27": {
    label: "FY 2024 Preliminary Results",
    shortLabel: "FY 2024",
  },
  "lseg_q1_2025_trading_update_2025-05-01": {
    label: "Q1 2025 Trading Update",
    shortLabel: "Q1 2025",
  },
  "lseg_h1_2025_interim_results_2025-07-31": {
    label: "H1 2025 Interim Results",
    shortLabel: "H1 2025",
  },
  "lseg_q3_2025_trading_update_2025-10-23": {
    label: "Q3 2025 Trading Update",
    shortLabel: "Q3 2025",
  },
  "lseg_fy_2025_preliminary_results_2026-02-26": {
    label: "FY 2025 Preliminary Results",
    shortLabel: "FY 2025",
  },
  "lseg_q1_2026_trading_update_2026-04-23": {
    label: "Q1 2026 Trading Update",
    shortLabel: "Q1 2026",
  },
};

type MetadataRecord = {
  transcriptId: string;
  eventDate: string;
  fiscalPeriod: string;
  eventType: string;
  source: string;
  stagedPath: string;
  qualityTag: string;
  confidence: TranscriptConfidence;
  qaBoundaryConfidence: TranscriptQaBoundaryConfidence;
  warnings?: string[];
};

type SummaryRecord = {
  transcriptId: string;
  sourcePath: string;
};

const metadataById = new Map(
  (transcriptMetadata.records as MetadataRecord[]).map((record) => [record.transcriptId, record]),
);
const summaryById = new Map(
  (transcriptEventSummaries.items as SummaryRecord[]).map((record) => [record.transcriptId, record]),
);

export const lsegTranscriptCallEvents = Object.entries(EVENT_LABELS)
  .map<TranscriptCallEvent | null>(([transcriptId, labels]) => {
    const metadata = metadataById.get(transcriptId);
    if (!metadata) return null;
    return {
      transcriptId,
      label: labels.label,
      shortLabel: labels.shortLabel,
      eventDate: metadata.eventDate,
      fiscalPeriod: metadata.fiscalPeriod,
      eventType: metadata.eventType,
      source: metadata.source,
      sourcePath: summaryById.get(transcriptId)?.sourcePath ?? metadata.stagedPath,
      qualityTag: metadata.qualityTag,
      confidence: metadata.confidence,
      qaBoundaryConfidence: metadata.qaBoundaryConfidence,
      warnings: metadata.warnings ?? [],
      displayOnly: true,
      modelReady: false,
      valuationImpactAllowed: false,
    };
  })
  .filter((item): item is TranscriptCallEvent => item !== null)
  .sort((left, right) => left.eventDate.localeCompare(right.eventDate));

export const lsegTranscriptEventIds = lsegTranscriptCallEvents.map((event) => event.transcriptId);

export function getPreviousTranscriptEventId(transcriptId: string) {
  const index = lsegTranscriptCallEvents.findIndex((event) => event.transcriptId === transcriptId);
  if (index <= 0) return undefined;
  return lsegTranscriptCallEvents[index - 1]?.transcriptId;
}
