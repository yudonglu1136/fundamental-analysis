import type { DgeDataset } from "../types";
import { dgeBrandData } from "./brandData";
import { dgeCategoryData } from "./categoryData";
import { dgeChannelInventoryData } from "./channelInventoryData";
import { dgeCompetitorData } from "./competitorData";
import { dgeEvidenceData } from "./evidence";
import { dgeGuidanceData } from "./guidanceData";
import { dgeMarketData } from "./marketData";
import { dgeRegionalData } from "./regionalData";
import { dgeReportedPeriods } from "./reportedData";
import { dgeResearchAssumptions } from "./assumptions";

export const dgeDataset: DgeDataset = {
  periods: dgeReportedPeriods,
  currentPeriodId: "q3-fy2026",
  reportedData: {
    regions: dgeRegionalData,
    brands: dgeBrandData,
    categories: dgeCategoryData,
    channelInventory: dgeChannelInventoryData,
  },
  guidanceData: dgeGuidanceData,
  marketData: dgeMarketData,
  competitorData: dgeCompetitorData,
  researchAssumptions: dgeResearchAssumptions,
  evidenceData: dgeEvidenceData,
};

export {
  dgeBrandData,
  dgeCategoryData,
  dgeChannelInventoryData,
  dgeCompetitorData,
  dgeEvidenceData,
  dgeGuidanceData,
  dgeMarketData,
  dgeRegionalData,
  dgeReportedPeriods,
  dgeResearchAssumptions,
};
