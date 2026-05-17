import type { MetaRealityLabsPoint } from "../model";
import { fieldLineage, metaLineage } from "./lineage";

export const metaRealityLabsData: MetaRealityLabsPoint[] = [
  {
    periodId: "fy2025",
    sourceStatus: "official_actual",
    sourceId: "meta-fy2025-pr",
    lineage: metaLineage.fy2025Actual,
    fieldLineage: fieldLineage(["revenue", "operatingLoss", "optionValueTreatment"], metaLineage.fy2025Actual),
    revenue: 2.207,
    operatingLoss: 19.193,
    optionValueTreatment: "explicit_sotp_option_only",
    notes: "Reality Labs loses money at scale; the valuation treats it as an explicit SOTP option plus drag, not as hidden FoA economics.",
  },
  {
    periodId: "q1_2026",
    sourceStatus: "official_actual",
    sourceId: "meta-q1-2026-pr",
    lineage: metaLineage.q1_2026Actual,
    fieldLineage: fieldLineage(["revenue", "operatingLoss", "optionValueTreatment"], metaLineage.q1_2026Actual),
    revenue: 0.402,
    operatingLoss: 4.028,
    optionValueTreatment: "explicit_sotp_option_only",
    notes: "Q1 2026 Reality Labs operating loss.",
  },
  {
    periodId: "fy2026e",
    sourceStatus: "management_guidance",
    sourceId: "fy2026-expense-guide",
    lineage: metaLineage.q1_2026Guidance,
    fieldLineage: {
      revenue: metaLineage.forecastAssumption,
      operatingLoss: metaLineage.q1_2026Guidance,
      optionValueTreatment: metaLineage.researchOnly,
    },
    revenue: 0,
    operatingLoss: 19.193,
    optionValueTreatment: "explicit_sotp_option_only",
    notes: "Management expects FY2026 Reality Labs losses to be in the same general range as FY2025.",
  },
];
