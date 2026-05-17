import type { MetaAiCapexPoint } from "../model";
import { fieldLineage, metaLineage } from "./lineage";

export const metaAiCapexData: MetaAiCapexPoint[] = [
  {
    periodId: "fy2025",
    sourceStatus: "official_actual",
    sourceId: "meta-fy2025-pr",
    lineage: metaLineage.fy2025Actual,
    fieldLineage: fieldLineage([
      "capexInclFinanceLeases",
      "capexIntensity",
      "cashFlowFromOperations",
      "freeCashFlow",
    ], metaLineage.fy2025Actual),
    capexInclFinanceLeases: 72.215,
    capexIntensity: 72.215 / 200.966,
    cashFlowFromOperations: 115.8,
    freeCashFlow: 43.585,
    notes: "Official 2025 capex including principal payments on finance leases. Meta does not disclose a precise AI-only capex split.",
  },
  {
    periodId: "q1_2026",
    sourceStatus: "official_actual",
    sourceId: "meta-q1-2026-pr",
    lineage: metaLineage.q1_2026Actual,
    fieldLineage: {
      ...fieldLineage([
        "capexInclFinanceLeases",
        "capexIntensity",
        "cashFlowFromOperations",
        "freeCashFlow",
      ], metaLineage.q1_2026Actual),
      contractualCommitments: metaLineage.q1_2026Form10Q,
      additionalCommitmentsAfterQuarter: metaLineage.q1_2026Form10Q,
    },
    capexInclFinanceLeases: 19.84,
    capexIntensity: 19.84 / 56.311,
    cashFlowFromOperations: 32.226,
    freeCashFlow: 12.386,
    contractualCommitments: 237.67,
    additionalCommitmentsAfterQuarter: 24,
    notes: "Q1 2026 capex and remaining purchase obligations. AI capex share remains a model assumption, not an official actual.",
  },
  {
    periodId: "fy2026e",
    sourceStatus: "management_guidance",
    sourceId: "fy2026-capex-guide",
    lineage: metaLineage.q1_2026Guidance,
    fieldLineage: {
      capexInclFinanceLeases: metaLineage.q1_2026Guidance,
      capexIntensity: {
        ...metaLineage.forecastAssumption,
        sourceType: "derived",
        valuationTreatment: "direct_input",
        notes: "Capex midpoint divided by base-case FY2026 revenue forecast.",
      },
    },
    capexInclFinanceLeases: 135,
    capexIntensity: 135 / 243.2,
    notes: "Midpoint of FY2026 capex guidance. Capex intensity is shown against the module's base FY2026 revenue forecast.",
  },
];
