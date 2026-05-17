import type { MckDataTag } from "../../types";
import { mckOfficialFy2026Url } from "./annualReports";

export type MckCapitalAllocationPoint = {
  periodId: string;
  operatingCashFlow: number;
  capex: number;
  freeCashFlow: number;
  dividends: number;
  repurchases: number;
  remainingAuthorization: number;
  tag: MckDataTag;
};

export const mckCapitalAllocation: MckCapitalAllocationPoint[] = [
  {
    periodId: "fy2026",
    operatingCashFlow: 6200,
    capex: 745,
    freeCashFlow: 5400,
    dividends: 381,
    repurchases: 4800,
    remainingAuthorization: 7700,
    tag: {
      sourceType: "actual",
      source: "McKesson FY2026 Q4/full-year earnings release",
      sourceUrl: mckOfficialFy2026Url,
      asOfDate: "2026-05-07",
      confidence: "high",
      notes: "Remaining authorization reported as of April 2026 after board increase.",
    },
  },
];
