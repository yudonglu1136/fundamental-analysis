import type { MckDataTag } from "../../types";

const placeholderTag: MckDataTag = {
  sourceType: "placeholder",
  source: "Balance sheet placeholder until SEC 10-K parser is run",
  asOfDate: "2026-05-11",
  confidence: "low",
  isPlaceholder: true,
};

export const mckBalanceSheet = {
  periodId: "fy2026",
  cash: 3600,
  totalDebt: 10500,
  netDebt: 6900,
  tag: placeholderTag,
};
