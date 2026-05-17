import type { MetaDataset, MetaRiskOutput } from "../model";

function severityLabel(score: number): "Low" | "Medium" | "High" {
  if (score >= 0.5) return "High";
  if (score >= 0.28) return "Medium";
  return "Low";
}

function linkedAssumption(id: string): MetaRiskOutput["rows"][number]["linkedAssumption"] {
  if (id.includes("capex")) return "capex2026";
  if (id.includes("eu") || id.includes("privacy")) return "regulatoryRevenueHaircut";
  if (id.includes("competition")) return "adImpressionCagr";
  if (id.includes("reality-labs")) return "realityLabsAnnualLoss";
  if (id.includes("open-source")) return "aiRevenueUpliftPct";
  return "wacc";
}

export function calculateMetaRiskRedTeamEngine(data: MetaDataset): MetaRiskOutput {
  const rows = data.regulatoryRisks
    .map((risk) => {
      const weightedScore = risk.probability * risk.impact * (1 - risk.detectability * 0.35);
      const valuationHaircutPct = Math.min(0.18, weightedScore * 0.22);
      return {
        ...risk,
        weightedScore,
        severityLabel: severityLabel(weightedScore),
        valuationHaircutPct,
        linkedAssumption: linkedAssumption(risk.id),
      };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);

  const riskScore = Math.min(100, rows.reduce((sum, row) => sum + row.weightedScore * 28, 0));
  const valuationHaircutPct = Math.min(0.25, rows.reduce((sum, row) => sum + row.valuationHaircutPct * row.probability, 0));
  const killCriteria = [
    "FY2026 capex guide rises again without sustained average-price-per-ad or FoA margin improvement.",
    "EU regulation forces product changes that create a visible Europe revenue reset.",
    "Reality Labs annual losses remain near USD 20bn while SOTP option value has no evidence of commercial traction.",
    "Ad impression growth stays strong but price-per-ad growth turns negative, implying engagement is not monetizing.",
    "Buybacks fail to offset SBC dilution while FCF/share is pressured by infrastructure spend.",
  ];

  return {
    riskScore,
    redTeamVerdict:
    riskScore > 60
        ? "The bear case is live: AI capex and regulatory risk can overwhelm core ad momentum if pricing or FoA margin weakens."
        : "The core ad engine can absorb a large AI buildout, but the model remains exposed to capex payback, regulation, and Reality Labs losses.",
    killCriteria,
    rows,
    valuationHaircutPct,
    monitoringTriggers: rows.map((row) => row.monitoringTrigger),
  };
}
