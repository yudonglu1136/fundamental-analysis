import type { MckTranscriptTopic } from "../../types";

export const mckTranscriptThemeDefinitions: Array<{ topic: MckTranscriptTopic; valuationBoundary: string }> = [
  { topic: "specialty", valuationBoundary: "Research-only until mapped to official segment growth or margin." },
  { topic: "oncology", valuationBoundary: "Research-only; can inform thesis but not automatic SOTP multiple changes." },
  { topic: "biopharma services", valuationBoundary: "Research-only; can support thesis, not automatic RxTS or SOTP multiple changes." },
  { topic: "GLP-1", valuationBoundary: "Research-only; requires explicit margin/working-capital mapping before valuation use." },
  { topic: "biosimilars", valuationBoundary: "Research-only; monitor gross-profit dollars and mix." },
  { topic: "margin", valuationBoundary: "Can become model-ready only if reconciled to official margin bridge." },
  { topic: "working capital", valuationBoundary: "Can become model-ready only if reconciled to cash-flow statement." },
  { topic: "capital allocation", valuationBoundary: "Can become model-ready after official repurchase authorization and cash-flow confirmation." },
  { topic: "buyback", valuationBoundary: "Can become model-ready after average price/share-count confirmation." },
  { topic: "reimbursement", valuationBoundary: "Risk register only unless quantified in guidance." },
  { topic: "customer contracts", valuationBoundary: "Risk register only unless official concentration data is updated." },
  { topic: "regulatory", valuationBoundary: "Risk register only unless financial impact is disclosed." },
];
