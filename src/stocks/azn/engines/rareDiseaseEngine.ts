import type { AznDataset, AznPipelineValue } from "../types";
import { safeRatio } from "./helpers";

export function buildRareDiseaseEngine(data: AznDataset, pipelineAssets: AznPipelineValue[]) {
  const rareArea = data.reportedData.therapyAreas.find((area) => area.therapyArea === "Rare Disease");
  const rareDrugs = data.reportedData.drugRevenue.filter((drug) => drug.therapyArea === "Rare Disease");
  const ultomiris = rareDrugs.find((drug) => drug.drugName === "Ultomiris");
  const soliris = rareDrugs.find((drug) => drug.drugName === "Soliris");
  const rarePipeline = pipelineAssets.filter((asset) => asset.therapyArea === "Rare Disease");
  const transitionTotal = (ultomiris?.currentRevenue ?? 0) + (soliris?.currentRevenue ?? 0);

  return {
    rareDiseaseRevenue: rareArea?.revenue ?? rareDrugs.reduce((sum, drug) => sum + drug.currentRevenue, 0),
    solirisToUltomirisTransition: [
      { product: "Soliris", revenue: soliris?.currentRevenue ?? 0, mix: safeRatio(soliris?.currentRevenue ?? 0, transitionTotal), growth: soliris?.revenueGrowthCer ?? 0 },
      { product: "Ultomiris", revenue: ultomiris?.currentRevenue ?? 0, mix: safeRatio(ultomiris?.currentRevenue ?? 0, transitionTotal), growth: ultomiris?.revenueGrowthCer ?? 0 },
    ],
    complementFranchiseRevenue: transitionTotal,
    complementBiologyFranchise: "C5 inhibition remains the backbone, with Ultomiris convenience and add-on/follow-on assets mitigating Soliris biosimilar exposure.",
    pricingPower: "High but politically visible: orphan pricing durability is strong, while reimbursement scrutiny is a live risk.",
    orphanDrugDurabilityScore: Math.round((safeRatio(ultomiris?.currentRevenue ?? 0, transitionTotal) * 45) + 42),
    competitionRisk: "Medium: biosimilars pressure Soliris while Ultomiris retains a longer patent runway.",
    reimbursementRisk: "Medium: rare-disease pricing power must be watched against payer budget pressure.",
    marginContribution: rareArea?.operatingMarginProxy ?? 0.4,
    lifecycleExpansion: ["Ultomiris IgAN", "gMG / NMOSD expansion", "Voydeya add-on", "efzimfotase alfa in HPP"],
    rareDiseasePipelineValue: rarePipeline.reduce((sum, asset) => sum + asset.probabilityAdjustedPipelineValue, 0),
    riskMatrix: [
      { risk: "Soliris biosimilar pressure", level: "High", mitigation: "Convert patients to Ultomiris." },
      { risk: "Ultomiris competitive complement entrants", level: "Medium", mitigation: "Broaden indications and dosing convenience." },
      { risk: "Orphan pricing / reimbursement scrutiny", level: "Medium", mitigation: "Evidence package and patient-outcome framing." },
    ],
  };
}
