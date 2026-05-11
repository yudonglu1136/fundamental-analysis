import qaPairsPayload from "../../../../../data/local/lseg/transcripts/extracted/qa_pairs.json";
import type { TranscriptQaPair } from "./types";

type QaPairsPayload = {
  generatedAt: string;
  sourceFiles: string[];
  warnings: string[];
  countsByTranscriptId: Record<string, number>;
  items: TranscriptQaPair[];
};

const qaPairs = qaPairsPayload as QaPairsPayload;

export const lsegTranscriptQaPairs: TranscriptQaPair[] = qaPairs.items;
export const lsegTranscriptQaPairWarnings = qaPairs.warnings;
export const lsegTranscriptQaPairGeneratedAt = qaPairs.generatedAt;
export const lsegTranscriptQaPairsByTranscriptId = new Map(
  Object.entries(
    lsegTranscriptQaPairs.reduce<Record<string, TranscriptQaPair[]>>((acc, item) => {
      acc[item.transcriptId] ??= [];
      acc[item.transcriptId].push(item);
      return acc;
    }, {}),
  ),
);

export const lsegTranscriptQaPairCountsByTranscriptId = new Map(
  Object.entries(qaPairs.countsByTranscriptId),
);

export function getTranscriptQaPairs(transcriptId: string) {
  return lsegTranscriptQaPairsByTranscriptId.get(transcriptId) ?? [];
}
