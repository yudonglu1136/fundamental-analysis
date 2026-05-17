import type { BaDataset, BaRiskOutput } from "../model";
import { scoreToRiskLabel } from "./helpers";

export function calculateBaRiskRedTeamEngine(data: BaDataset): BaRiskOutput {
  const rows = data.risks.map((risk) => {
    const weightedScore = Math.round((risk.probability * 0.35 + risk.impact * 0.5 + (1 - risk.detectability) * 0.15) * 100);
    return {
      ...risk,
      weightedScore,
      severityLabel: scoreToRiskLabel(weightedScore),
    };
  }).sort((a, b) => b.weightedScore - a.weightedScore);

  const riskScore = Math.round(rows.reduce((sum, row) => sum + row.weightedScore, 0) / Math.max(rows.length, 1));

  return {
    riskScore,
    redTeamVerdict:
      "The BAE thesis fails less through sudden demand collapse and more through slower order conversion, cost growth on complex programmes, budget delay, or cash conversion falling below the headline backlog narrative.",
    killCriteria: [
      "Book-to-bill falls below 1.0 for two consecutive annual periods without a credible explanation.",
      "Maritime or Platforms & Services margin deterioration persists despite high demand and investment.",
      "Free cash flow remains below management's multi-year floors after customer-advance normalisation.",
      "Major export or submarine awards shift materially right while capex and working-capital intensity remain elevated.",
      "Political budget commitments weaken in the UK or US enough to lower funded backlog conversion.",
    ],
    rows,
    monitoringTriggers: [
      "Order intake vs sales by year and by segment",
      "Backlog coverage and cancellation / delay commentary",
      "Maritime margin and submarine milestone delivery",
      "Customer advances and operating cash conversion",
      "UK / US defence budget authorisations and NATO spending targets",
      "FX sensitivity at GBP/USD and pension surplus movement",
    ],
  };
}
