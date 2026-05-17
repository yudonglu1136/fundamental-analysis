import type { Scenario } from "../../types";
import type { AznDataset, AznPipelineValue } from "../types";

export function buildOncologyEngine(data: AznDataset, pipelineAssets: AznPipelineValue[], scenario: Scenario) {
  const oncologyArea = data.reportedData.therapyAreas.find((area) => area.therapyArea === "Oncology");
  const oncologyDrugs = data.reportedData.drugRevenue.filter((drug) => drug.therapyArea === "Oncology");
  const oncologyPipeline = pipelineAssets.filter((asset) => asset.therapyArea === "Oncology");
  const totalOncologyRevenue = oncologyArea?.revenue ?? oncologyDrugs.reduce((sum, drug) => sum + drug.currentRevenue, 0);
  const scenarioMultiplier = scenario === "Bull" ? 1.18 : scenario === "Bear" ? 0.82 : 1;

  const oncologyRevenueBridge = oncologyDrugs.map((drug) => ({
    drugName: drug.drugName,
    revenue: drug.currentRevenue,
    growthContribution: drug.currentRevenue * drug.revenueGrowthCer,
    revenueMix: totalOncologyRevenue > 0 ? drug.currentRevenue / totalOncologyRevenue : 0,
  }));

  const oncologyGrowthDrivers = [
    "Imfinzi growth from GI, GU and lung launches including MATTERHORN, NIAGARA, ADRIATIC and HIMALAYA.",
    "Enhertu standard-of-care status in HER2-positive and HER2-low breast cancer, plus pan-tumour optionality.",
    "Calquence BTKi leadership and finite-duration launch expansion.",
    "Camizestrant, Datroway, saruparib and bispecific/ADC platforms as the post-Tagrisso/Lynparza bridge.",
  ];

  const oncologyRiskMatrix = [
    { risk: "Tagrisso LOE in early-to-mid 2030s", severity: "Medium", mitigation: "Broaden lung franchise and combination strategies." },
    { risk: "Lynparza late-decade PARP cliff", severity: "High", mitigation: "Saruparib and broader oncology pipeline replacement." },
    { risk: "ADC profit-share economics", severity: "Medium", mitigation: "Scale Enhertu/Datroway while monitoring gross margin leakage." },
    { risk: "IO competition and trial misses", severity: "Medium", mitigation: "Diversified IO + ADC + targeted therapy portfolio." },
  ];

  return {
    currentOncologyRevenueBase: totalOncologyRevenue,
    oncologyRevenueBridge,
    oncologyGrowthDrivers,
    oncologyPipelineValue: oncologyPipeline.reduce((sum, asset) => sum + asset.probabilityAdjustedPipelineValue, 0),
    lungCancerFranchise: oncologyDrugs.filter((drug) => /lung|NSCLC|EGFR/i.test(`${drug.indication} ${drug.marketPosition}`)),
    breastCancerFranchise: oncologyDrugs.filter((drug) => /breast|HER2|HR\+/i.test(`${drug.indication} ${drug.marketPosition}`)),
    hematologyFranchise: oncologyDrugs.filter((drug) => /CLL|lymphoma|BTK/i.test(`${drug.indication} ${drug.marketPosition}`)),
    collaborationEconomics: [
      "Enhertu and Datroway economics require Daiichi Sankyo profit-share / royalty awareness.",
      "Lynparza commercial history requires Merck collaboration awareness, though current module treats reported AZN revenue as the official anchor.",
    ],
    oncologyRiskMatrix,
    oncologyScenarioBearBaseBull: {
      Bear: totalOncologyRevenue * 4 * 1.04 * 0.9,
      Base: totalOncologyRevenue * 4 * 1.09,
      Bull: totalOncologyRevenue * 4 * 1.13 * scenarioMultiplier,
    },
  };
}
