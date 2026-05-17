import type { MckDataTag } from "../../types";
import { mckOfficialFy2026Url } from "./annualReports";

const q4Tag: MckDataTag = {
  sourceType: "actual",
  source: "McKesson FY2026 Q4/full-year earnings release",
  sourceUrl: mckOfficialFy2026Url,
  asOfDate: "2026-05-07",
  confidence: "high",
};

export const mckQuarterlyReports = [
  {
    periodId: "fy2026-q4",
    revenue: 96300,
    revenueGrowth: 0.06,
    adjustedDilutedEps: 11.69,
    operatingCashFlow: 3400,
    capex: 185,
    freeCashFlow: 3200,
    tag: q4Tag,
  },
];
