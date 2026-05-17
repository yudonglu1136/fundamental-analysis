import type { AznDataset, AznRegion, AznRiskLevel } from "../types";
import { safeRatio } from "./helpers";

function severityFromRisk(level: AznRiskLevel) {
  if (level === "High") return 3;
  if (level === "Medium") return 2;
  return 1;
}

function yearFromLoeText(text: string | undefined) {
  const match = text?.match(/20\d{2}/);
  return match ? Number(match[0]) : 2035;
}

export function buildPatentCliffMonitor(data: AznDataset, region: AznRegion = "Global") {
  const totalRevenue = data.periods.find((period) => period.id === "fy2025")?.totalRevenue ?? data.periods[0]?.totalRevenue ?? 1;
  const patentRisks = data.patentRiskData
    .map((risk) => {
      const regionText = risk.estimatedLoeYearByRegion[region] ?? risk.estimatedLoeYearByRegion.Global ?? "";
      const firstLoeYear = yearFromLoeText(regionText);
      return {
        ...risk,
        firstLoeYear,
        regionText,
        riskScore: severityFromRisk(risk.genericBiosimilarRisk),
      };
    })
    .sort((a, b) => a.firstLoeYear - b.firstLoeYear || b.revenueAtRisk - a.revenueAtRisk);

  const timeline = Array.from({ length: 11 }, (_, index) => {
    const year = 2025 + index;
    const active = patentRisks.filter((risk) => risk.firstLoeYear <= year && risk.firstLoeYear >= year - 1);
    return {
      year,
      revenueAtRisk: active.reduce((sum, risk) => sum + risk.revenueAtRisk, 0),
      products: active.map((risk) => risk.product),
    };
  });

  const revenueAtRiskTotal = patentRisks.reduce((sum, risk) => sum + risk.revenueAtRisk, 0);
  const highRiskRevenue = patentRisks
    .filter((risk) => risk.genericBiosimilarRisk === "High")
    .reduce((sum, risk) => sum + risk.revenueAtRisk, 0);
  const cliffAdjustedRevenueScenario = {
    baseRevenue: totalRevenue,
    bearCaseRevenueAfterCliff: totalRevenue - highRiskRevenue * 0.45,
    baseCaseRevenueAfterCliff: totalRevenue - highRiskRevenue * 0.25,
    bullCaseRevenueAfterCliff: totalRevenue - highRiskRevenue * 0.1,
    mitigationCredit: highRiskRevenue * 0.15,
  };

  return {
    region,
    patentRisks,
    timeline,
    revenueAtRiskTotal,
    highRiskRevenue,
    revenueAtRiskPctOfRevenue: safeRatio(revenueAtRiskTotal, totalRevenue),
    cliffAdjustedRevenueScenario,
  };
}
