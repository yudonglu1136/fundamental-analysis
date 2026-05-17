import type { AznDataset, AznPipelineValue, AznValuationOutput } from "../types";
import { safeRatio } from "./helpers";

export function buildRiskRadar(data: AznDataset, pipelineAssets: AznPipelineValue[], valuation: AznValuationOutput) {
  const patentRevenueAtRisk = data.patentRiskData.reduce((sum, risk) => sum + risk.revenueAtRisk, 0);
  const fyRevenue = data.periods.find((period) => period.id === "fy2025")?.totalRevenue ?? 1;
  const highRiskPipelineValue = pipelineAssets
    .filter((asset) => asset.riskLevel === "High")
    .reduce((sum, asset) => sum + asset.probabilityAdjustedPipelineValue, 0);
  const china = data.reportedData.geographies.find((region) => region.region === "China");

  const risks = [
    {
      category: "Patent",
      score: Math.round(safeRatio(patentRevenueAtRisk, fyRevenue) * 100),
      level: "High",
      detail: "Farxiga, Lynparza, Soliris, Brilinta and Symbicort create near-to-mid-term LOE pressure.",
    },
    {
      category: "Clinical",
      score: Math.round(safeRatio(highRiskPipelineValue, Math.max(valuation.pipelineFairValueUsd * data.marketData.sharesOutstandingM, 1)) * 100),
      level: "Medium",
      detail: "Several high-value oncology and metabolic assets are Phase II/III and probability-adjusted, not bankable reported revenue.",
    },
    {
      category: "Pricing",
      score: 72,
      level: "High",
      detail: "US government pricing, China VBP / NRDL and global cost containment can dilute gross margin and growth.",
    },
    {
      category: "China",
      score: Math.round((china?.percentageOfTotal ?? 0) * 400),
      level: "Medium",
      detail: "China is 13% of Q1 2026 revenue with only 2% CER growth; mature-product VBP is a live risk.",
    },
    {
      category: "FX",
      score: 48,
      level: "Medium",
      detail: "Reported USD, London GBX and GBP/USD conversion create translation risk for fair value and dividends.",
    },
    {
      category: "M&A / Licensing",
      score: 55,
      level: "Medium",
      detail: "CSPC, Pinetree, Daiichi Sankyo and other partnered economics can add optionality but complicate margin ownership.",
    },
    {
      category: "Competition",
      score: 66,
      level: "High",
      detail: "GLP-1s, oncology IO/ADC competition, complement entrants and respiratory biologics can pressure market share.",
    },
  ];

  return {
    risks,
    aggregateRiskScore: Math.round(risks.reduce((sum, risk) => sum + risk.score, 0) / risks.length),
    monitoringTriggers: [
      "Farxiga regional generic erosion versus cardiorenal volume retention.",
      "Tagrisso / Lynparza LOE legal and validity proceedings.",
      "Camizestrant, tozorakimab, baxdrostat and efzimfotase alfa regulatory paths.",
      "China CER growth and VBP/NRDL outcomes.",
      "Core gross margin drag from profit-share assets.",
    ],
  };
}
