import type { LsegGuidancePoint } from "../model";
import { indexProvenanceById, stripProvenance, type LsegRowWithProvenance } from "./provenance";

const guidanceRows: LsegRowWithProvenance<LsegGuidancePoint>[] = [
  {
    row: {
      guidanceYear: 2026,
      revenueGrowthLow: 0.065,
      revenueGrowthHigh: 0.075,
      ebitdaMarginExpansionLowBps: 80,
      ebitdaMarginExpansionHighBps: 100,
      equityFcfMinimum: 2700,
      capexIntensityTarget: 0.095,
      taxRateLow: 0.24,
      taxRateHigh: 0.25,
      buybackAuthorization: 3000,
      sourceType: "guidance",
    },
    provenance: {
      id: "guidance-2026",
      qualityTag: "Guidance",
      sourceType: "company_disclosure",
      source: "Management FY2026 guidance range / target set used to anchor the LSEG model.",
      asOfDate: "2026-03-06",
      period: "FY 2026 guidance",
      confidenceLevel: "high",
      notes: "Stores only ranges and targets. Full modeled FY2026 point estimates belong in forecastAnchors.ts, not here.",
    },
  },
];

export const lsegGuidanceEnvelopes = guidanceRows;
export const lsegGuidance = stripProvenance(guidanceRows);
export const lsegGuidanceProvenance = indexProvenanceById(guidanceRows, (row) => `${row.guidanceYear}`);
