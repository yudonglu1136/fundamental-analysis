import type { MckManagementQuote } from "../../types";
import { mckOfficialFy2026Url } from "../official/annualReports";

const tag = {
  sourceType: "transcript" as const,
  source: "McKesson FY2026 Q4/full-year earnings release management commentary",
  sourceUrl: mckOfficialFy2026Url,
  asOfDate: "2026-05-07",
  confidence: "medium" as const,
  notes: "Research-only quote extraction seed. The build script replaces this after local transcript ingestion.",
};

export const mckManagementQuotes: MckManagementQuote[] = [
  {
    id: "fy2026-q4-tyler-oncology-biopharma",
    eventId: "fy2026-q4",
    speaker: "Brian Tyler",
    topic: "oncology",
    quote:
      "We remain committed to executing with discipline across the portfolio, investing in high-growth and high-margin areas in Oncology and Biopharma Services.",
    interpretation:
      "Management is explicitly steering the portfolio toward higher-margin specialty infrastructure rather than only scaling low-margin drug distribution.",
    tag,
  },
  {
    id: "fy2026-q4-tyler-operating-leverage",
    eventId: "fy2026-q4",
    speaker: "Brian Tyler",
    topic: "margin",
    quote:
      "Fiscal 2026 performance, headlined by 12% revenue growth and 18% adjusted EPS growth, exceeded our long-range growth targets.",
    interpretation:
      "Adjusted EPS growth above revenue growth supports the operating leverage and buyback compounder thesis, but the bridge still needs segment/mix validation.",
    tag,
  },
];
