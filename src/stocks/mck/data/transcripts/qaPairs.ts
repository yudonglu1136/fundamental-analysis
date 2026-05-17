import type { MckQaPair } from "../../types";

const placeholderTag = {
  sourceType: "placeholder" as const,
  source: "Local transcript Q&A ingestion placeholder",
  asOfDate: "2026-05-11",
  confidence: "low" as const,
  isPlaceholder: true,
  notes: "Drop transcript text into data/local/mck/transcripts/raw and run scripts/mck_build_qa_pairs.mjs.",
};

export const mckQaPairs: MckQaPair[] = [
  {
    id: "qa-placeholder-glp1",
    eventId: "fy2026-q4",
    analyst: "Placeholder",
    topic: "GLP-1",
    question: "How should investors separate GLP-1 revenue volume from profit-dollar contribution?",
    answer: "Awaiting local transcript ingestion.",
    pressurePoint: "GLP-1 can increase volume and working capital needs while diluting margin rate.",
    tag: placeholderTag,
  },
  {
    id: "qa-placeholder-oncology-organic",
    eventId: "fy2026-q4",
    analyst: "Placeholder",
    topic: "oncology",
    question: "What portion of Oncology & Multispecialty growth is organic versus acquired?",
    answer: "Awaiting local transcript ingestion.",
    pressurePoint: "SOTP premium depends on durable organic growth and provider stickiness.",
    tag: placeholderTag,
  },
];
