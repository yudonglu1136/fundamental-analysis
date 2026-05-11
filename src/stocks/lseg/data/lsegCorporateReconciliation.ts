import type { LsegCorporateReconciliationInput } from "../model";

export const lsegCorporateReconciliation: LsegCorporateReconciliationInput = {
  id: "reported-2025-operating-sotp-bridge",
  reportedGroupAdjustedEbitda: 4527,
  sumOfReportedSegmentAdjustedEbitda: 4527,
  otherOrCorporateAdjustedEbitda: 13,
  eliminations: 0,
  difference: 0,
  tolerance: 35,
  treatment: "included_in_segment_ebitda",
  corporateCostMultiple: 8,
  source: "FY2025A reported segment bridge using the reported 2025 taxonomy. Sum of reported segments, including Other / Corporate / eliminations, reconciles to reported group adjusted EBITDA.",
  sourceDate: "2026-03-06",
  confidenceLevel: "high",
  notes: "Operating SOTP therefore treats corporate cost as included inside the reported segment bridge unless a forward reconciliation fails outside tolerance.",
};
