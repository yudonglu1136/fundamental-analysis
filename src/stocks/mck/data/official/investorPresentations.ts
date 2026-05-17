import type { MckDataTag } from "../../types";

export const mckInvestorPresentations: Array<{ id: string; title: string; url: string; tag: MckDataTag }> = [
  {
    id: "fy2026-q4-presentation",
    title: "FY2026 Q4 earnings call presentation",
    url: "https://investor.mckesson.com/",
    tag: {
      sourceType: "placeholder",
      source: "Investor relations presentation index placeholder",
      asOfDate: "2026-05-11",
      confidence: "low",
      isPlaceholder: true,
      notes: "Fetch script attempts to discover presentation links from investor.mckesson.com.",
    },
  },
];
