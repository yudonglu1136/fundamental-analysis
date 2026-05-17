import { isrgQaPairs, isrgQuarterFocusSnapshots, isrgTopicTrends, isrgTranscriptEvents } from "./transcripts";

export const transcriptData = {
  events: isrgTranscriptEvents,
  qaPairs: isrgQaPairs,
  topicTrends: isrgTopicTrends,
  quarterFocus: isrgQuarterFocusSnapshots,
  sourceBoundary:
    "Transcript insights and AI focus summaries default to research-only; numeric claims require official-source validation before entering actuals, guidance, or valuation inputs.",
};
