import type { ValidationWarning } from "../../types";
import type { PltrQaPair, PltrTopicTrendPoint, PltrTranscriptEvent } from "../model";

export function calculateTranscriptThemeEngine(
  events: PltrTranscriptEvent[],
  qaPairs: PltrQaPair[],
  topicTrends: PltrTopicTrendPoint[],
) {
  const warnings: ValidationWarning[] = [];
  if (qaPairs.length === 0) {
    warnings.push({
      id: "pltr-no-qa-pairs",
      title: "No parsed transcript Q&A pairs",
      detail: "Transcript lab is wired, but local raw transcripts have not yet been parsed into Q&A pairs.",
      severity: "medium",
    });
  }
  if (events.some((event) => event.status === "manifest_only")) {
    warnings.push({
      id: "pltr-manifest-only-transcripts",
      title: "Transcript manifest is not complete",
      detail: "At least one transcript event has no transcript URL or raw transcript file yet.",
      severity: "medium",
    });
  }
  return {
    events,
    qaPairs,
    topicTrends,
    warnings,
  };
}
