import type { MckDataset } from "../types";
import { latestFinancial, segmentsForPeriod } from "./helpers";

export function calculatePrescriptionTechnologyEngine(data: MckDataset) {
  const segment = segmentsForPeriod(data, latestFinancial(data).periodId).find((row) => row.segment === "Prescription Technology Solutions");
  const margin = segment?.margin ?? 0;
  return {
    revenue: segment?.revenue ?? 0,
    margin,
    relativeMultiple: data.assumptions.rxTechnologyMultiple,
    thesis:
      "RxTS is not a rounding error: it connects manufacturers, pharmacies, providers, payers and patients through access, affordability, 3PL, workflow and benefit-insight tools.",
    caveat:
      "It deserves a higher multiple than core distribution only if access-solution growth and margin resilience remain visible after GLP-1 and reimbursement volatility.",
  };
}
