import type { AznDataset } from "../types";
import { aznEarningsCallData } from "./earningsCallData";
import { aznEvidenceData } from "./evidence";
import { aznMarketData } from "./marketData";
import { aznPatentRiskData } from "./patentData";
import { aznPeerMultiples } from "./peers";
import { aznPipelineData, aznResearchEstimates } from "./pipelineData";
import {
  aznDrugRevenue,
  aznGeographyRevenue,
  aznGuidanceData,
  aznReportedPeriods,
  aznTherapyAreaRevenue,
} from "./reportedData";

export const aznDataset: AznDataset = {
  periods: aznReportedPeriods,
  currentPeriodId: "q1-2026",
  reportedData: {
    therapyAreas: aznTherapyAreaRevenue,
    drugRevenue: aznDrugRevenue,
    geographies: aznGeographyRevenue,
  },
  guidanceData: aznGuidanceData,
  earningsCallData: aznEarningsCallData,
  marketData: aznMarketData,
  pipelineData: aznPipelineData,
  patentRiskData: aznPatentRiskData,
  peers: aznPeerMultiples,
  researchEstimates: aznResearchEstimates,
  evidenceData: aznEvidenceData,
};

export {
  aznEvidenceData,
  aznEarningsCallData,
  aznMarketData,
  aznPatentRiskData,
  aznPeerMultiples,
  aznPipelineData,
  aznResearchEstimates,
  aznDrugRevenue,
  aznGeographyRevenue,
  aznGuidanceData,
  aznReportedPeriods,
  aznTherapyAreaRevenue,
};
