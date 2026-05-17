import type { MetaGuidance, MetaSource } from "../model";
import { fieldLineage, metaLineage } from "./lineage";

export const metaManagementSources: MetaSource[] = [
  {
    id: "meta-q1-2026-call-transcript",
    title: "Meta Q1 2026 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2026/q1/META-Q1-2026-Earnings-Call-Transcript.pdf",
    publisher: "Meta Investor Relations",
    sourceStatus: "management_guidance",
    reportingPeriod: "Q1 2026",
    publishedDate: "2026-04-30",
    accessedDate: "2026-05-11",
    lineage: metaLineage.q1_2026Transcript,
    notes: "Official IR transcript for management outlook and AI/product commentary.",
  },
];

export const metaManagementGuidance: MetaGuidance[] = [
  {
    id: "q2-2026-revenue-guide",
    sourceStatus: "management_guidance",
    sourceId: "meta-q1-2026-pr",
    lineage: metaLineage.q1_2026Guidance,
    fieldLineage: fieldLineage(["revenueLow", "revenueHigh"], metaLineage.q1_2026Guidance),
    guidancePeriod: "Q2 2026",
    revenueLow: 58,
    revenueHigh: 61,
    notes: "Q2 2026 revenue outlook in USD billions.",
  },
  {
    id: "fy2026-expense-guide",
    sourceStatus: "management_guidance",
    sourceId: "meta-q1-2026-pr",
    lineage: metaLineage.q1_2026Guidance,
    fieldLineage: fieldLineage([
      "totalExpenseLow",
      "totalExpenseHigh",
      "operatingIncomeAbovePriorYear",
      "realityLabsLossCommentary",
      "regulatoryCommentary",
    ], metaLineage.q1_2026Guidance),
    guidancePeriod: "FY 2026",
    totalExpenseLow: 162,
    totalExpenseHigh: 169,
    operatingIncomeAbovePriorYear: true,
    realityLabsLossCommentary: "Reality Labs 2026 operating losses are expected to be in the same general range as 2025.",
    regulatoryCommentary: "Management flagged a potential significant impact to Europe revenue from EU regulatory developments.",
    notes: "Total expenses and operating-income commentary from Q1 2026 release.",
  },
  {
    id: "fy2026-capex-guide",
    sourceStatus: "management_guidance",
    sourceId: "meta-q1-2026-pr",
    lineage: metaLineage.q1_2026Guidance,
    fieldLineage: fieldLineage(["capexLow", "capexHigh"], metaLineage.q1_2026Guidance),
    guidancePeriod: "FY 2026",
    capexLow: 125,
    capexHigh: 145,
    notes: "Capital expenditures including principal payments on finance leases, in USD billions.",
  },
  {
    id: "fy2026-tax-guide",
    sourceStatus: "management_guidance",
    sourceId: "meta-q1-2026-pr",
    lineage: metaLineage.q1_2026Guidance,
    fieldLineage: fieldLineage(["taxRateLow", "taxRateHigh"], metaLineage.q1_2026Guidance),
    guidancePeriod: "Remainder of FY 2026",
    taxRateLow: 0.13,
    taxRateHigh: 0.16,
    notes: "Expected tax rate for the remainder of 2026.",
  },
];
