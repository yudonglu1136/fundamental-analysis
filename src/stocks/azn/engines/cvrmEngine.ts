import type { AznDataset, AznPipelineValue } from "../types";

export function buildCvrmEngine(data: AznDataset, pipelineAssets: AznPipelineValue[]) {
  const cvrmArea = data.reportedData.therapyAreas.find((area) => area.therapyArea === "CVRM");
  const cvrmDrugs = data.reportedData.drugRevenue.filter((drug) => drug.therapyArea === "CVRM");
  const farxiga = cvrmDrugs.find((drug) => drug.drugName === "Farxiga");
  const cvrmPipeline = pipelineAssets.filter((asset) => asset.therapyArea === "CVRM");
  const farxigaRevenue = farxiga?.currentRevenue ?? 0;

  return {
    cvrmRevenue: cvrmArea?.revenue ?? 0,
    farxigaRevenueTrajectory: [
      { year: 2025, revenue: 8_400, note: "FY 2025 patent supplement US + ex-US Product Sales anchor" },
      { year: 2026, revenue: farxigaRevenue * 4, note: "Q1 2026 annualized Total Revenue including collaboration revenue" },
      { year: 2027, revenue: farxigaRevenue * 4 * 0.92, note: "Base LOE-adjusted scenario" },
      { year: 2028, revenue: farxigaRevenue * 4 * 0.82, note: "Ongoing generic / VBP absorption" },
      { year: 2029, revenue: farxigaRevenue * 4 * 0.75, note: "Follow-on pipeline starts to matter" },
    ],
    indicationExpansionMap: [
      { indication: "Diabetes", status: "mature", risk: "generic and VBP pressure" },
      { indication: "Heart failure", status: "durable guideline adoption", risk: "class competition" },
      { indication: "Chronic kidney disease", status: "key durability leg", risk: "payer and LOE pressure" },
      { indication: "Obesity / metabolic adjacency", status: "pipeline optionality via CSPC / AZD6234 / elecoglipron", risk: "GLP-1 incumbency" },
    ],
    glp1DisplacementRisk: {
      level: "Medium",
      thesis: "GLP-1s can shift metabolic spend and clinical attention, but Farxiga's HF/CKD outcomes give a differentiated cardiorenal role.",
    },
    loeAdjustedScenario: {
      Bear: farxigaRevenue * 4 * 0.65,
      Base: farxigaRevenue * 4 * 0.82,
      Bull: farxigaRevenue * 4 * 0.95,
    },
    cvrmPipelineValue: cvrmPipeline.reduce((sum, asset) => sum + asset.probabilityAdjustedPipelineValue, 0),
    keyRisks: ["Farxiga near-term LOE", "China VBP and generic entry", "Japan/UK generic pressure", "GLP-1 adjacency"],
  };
}
