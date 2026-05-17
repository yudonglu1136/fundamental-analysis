import type { LegnDataset } from "../types";
import { legnCommercialScenarios, legnManufacturingScenarios, legnResearchAssumptions } from "./assumptions";
import { legnCarvyktiQuarters } from "./carvyktiData";
import { legnClinicalTrials } from "./clinicalData";
import { legnCollaborationEconomicsBridge, legnCollaborationTerms } from "./collaborationData";
import { legnEvidence } from "./evidence";
import { legnMarketData } from "./marketData";
import { legnPipelineAssets } from "./pipelineData";
import { legnPublications } from "./publicationData";
import { legnReportedPeriods } from "./reportedData";
import { legnEarningsCalls } from "./transcriptData";

export const legnDataset: LegnDataset = {
  currentPeriodId: "fy2025",
  reportedPeriods: legnReportedPeriods,
  carvyktiQuarters: legnCarvyktiQuarters,
  collaborationTerms: legnCollaborationTerms,
  collaborationEconomicsBridge: legnCollaborationEconomicsBridge,
  clinicalTrials: legnClinicalTrials,
  pipelineAssets: legnPipelineAssets,
  publications: legnPublications,
  earningsCalls: legnEarningsCalls,
  marketData: legnMarketData,
  assumptions: {
    commercialScenarios: legnCommercialScenarios,
    manufacturingScenarios: legnManufacturingScenarios,
    researchAssumptions: legnResearchAssumptions,
  },
  evidence: legnEvidence,
};

export {
  legnCommercialScenarios,
  legnManufacturingScenarios,
  legnResearchAssumptions,
  legnCarvyktiQuarters,
  legnClinicalTrials,
  legnCollaborationEconomicsBridge,
  legnCollaborationTerms,
  legnEvidence,
  legnMarketData,
  legnPipelineAssets,
  legnPublications,
  legnReportedPeriods,
  legnEarningsCalls,
};
