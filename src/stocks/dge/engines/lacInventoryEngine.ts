import type { DgeDataset, DgeLacInventoryOutput } from "../types";
import { clamp, evidenceList, scoreFromGrowth } from "./helpers";

function assumption(data: DgeDataset, id: string, fallback: number) {
  return data.researchAssumptions.find((item) => item.id === id)?.value ?? fallback;
}

export function buildDgeLacInventoryEngine(data: DgeDataset): DgeLacInventoryOutput {
  const q3Lac = data.reportedData.regions.find((row) => row.periodId === "q3-fy2026" && row.region === "Latin America & Caribbean");
  const q1Lac = data.reportedData.regions.find((row) => row.periodId === "q1-fy2026" && row.region === "Latin America & Caribbean");
  const inventory = data.reportedData.channelInventory.find((row) => row.periodId === "q3-fy2026" && row.region === "Latin America & Caribbean");
  const reportedOrganicGrowth = q3Lac?.organicNetSalesGrowth ?? 0;
  const lowBaseEffect = assumption(data, "assumption-lac-low-base-effect", 0.035);
  const restockingEffect = assumption(data, "assumption-lac-restocking-effect", 0.04);
  const worldCupPullForward = assumption(data, "assumption-world-cup-pull-forward", 0.025);
  const fxHyperinflationDistortion = 0.0;
  const trueConsumerRecovery = assumption(data, "assumption-true-lac-recovery", 0.055);
  const normalizedLacGrowth = reportedOrganicGrowth - lowBaseEffect - restockingEffect - worldCupPullForward - fxHyperinflationDistortion + trueConsumerRecovery;
  const reportedGrowthAdjustedForInventory = reportedOrganicGrowth - lowBaseEffect - restockingEffect - worldCupPullForward;
  const destockingCompletionProbability = clamp(62 + (q1Lac?.organicNetSalesGrowth ?? 0) * 110 + reportedGrowthAdjustedForInventory * 90 - (inventory?.restocking ?? 0) * 220);
  const restockingRisk = clamp((inventory?.restocking ?? 0) * 1_100 + lowBaseEffect * 400);
  const pullForwardRisk = clamp((inventory?.worldCupSeasonalLoading ?? 0) * 1_300 + (inventory?.pullForward ?? 0) * 500);
  const realDemandRecoveryScore = clamp(scoreFromGrowth(normalizedLacGrowth, 0.02, 0.1) - pullForwardRisk * 0.12);
  const brazilRecoveryScore = 72;
  const mexicoStabilizationScore = 38;
  const priceMixQualityScore = clamp(scoreFromGrowth(q3Lac?.priceMixGrowth ?? 0, 0.01, 0.08) - restockingRisk * 0.08);
  const lacInventoryHealthScore = Math.round(
    clamp(destockingCompletionProbability * 0.25 + realDemandRecoveryScore * 0.25 + brazilRecoveryScore * 0.15 + mexicoStabilizationScore * 0.15 + priceMixQualityScore * 0.2),
  );

  return {
    lacInventoryHealthScore,
    destockingCompletionProbability: Math.round(destockingCompletionProbability),
    restockingRisk: Math.round(restockingRisk),
    pullForwardRisk: Math.round(pullForwardRisk),
    realDemandRecoveryScore: Math.round(realDemandRecoveryScore),
    brazilRecoveryScore,
    mexicoStabilizationScore,
    priceMixQualityScore: Math.round(priceMixQualityScore),
    normalizedLacGrowth,
    reportedGrowthAdjustedForInventory,
    bridge: [
      { label: "Reported organic growth", value: reportedOrganicGrowth, researchOnly: false },
      { label: "Low-base effect", value: -lowBaseEffect, researchOnly: true },
      { label: "Restocking effect", value: -restockingEffect, researchOnly: true },
      { label: "World Cup pull-forward", value: -worldCupPullForward, researchOnly: true },
      { label: "FX / hyperinflation distortion", value: -fxHyperinflationDistortion, researchOnly: true },
      { label: "True consumer recovery", value: trueConsumerRecovery, researchOnly: true },
      { label: "Normalized LAC growth", value: normalizedLacGrowth, researchOnly: true },
    ],
    evidenceIds: evidenceList(
      q3Lac?.sourceEvidenceIds ?? [],
      q1Lac?.sourceEvidenceIds ?? [],
      inventory?.sourceEvidenceIds ?? [],
      data.researchAssumptions.filter((item) => item.category.includes("LAC") || item.category.includes("Channel")).flatMap((item) => item.sourceEvidenceIds),
    ),
    warnings: [
      "LAC reported organic growth is adjusted for low-base effect, restocking and World Cup advance sales before being treated as normalized demand.",
      "Brazil recovery is positive, but Mexico high-single-digit decline prevents a clean all-clear.",
      ...(pullForwardRisk > 45 ? ["Q3 includes pull-forward risk; Q4/FY27 depletion evidence is needed."] : []),
    ],
  };
}
