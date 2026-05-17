import type { MsftDataset } from "../model";

export function calculateMsftRiskRedTeamEngine(data: MsftDataset) {
  const ranked = data.risks
    .map((risk) => ({
      ...risk,
      riskScore: Math.round(100 * (risk.probability * 0.35 + risk.severity * 0.45 + (1 - risk.detectability) * 0.20)),
    }))
    .sort((a, b) => b.riskScore - a.riskScore);

  return {
    rows: ranked,
    redTeamVerdict:
      "The AI thesis fails if Microsoft cannot convert capacity-constrained demand into software-like margin. The key falsifiers are cloud GM staying below the guided trough, capex intensity remaining structurally high, and Copilot/OpenAI economics staying opaque or low margin.",
    killCriteria: ranked.map((risk) => risk.killCriterion),
    monitoringTriggers: ranked.map((risk) => risk.monitoringTrigger),
  };
}
