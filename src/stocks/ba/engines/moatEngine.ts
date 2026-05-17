import type { BaBacklogEngineOutput, BaMoatOutput, BaSegmentEngineOutput } from "../model";
import { clamp, safeRatio } from "./helpers";

export function calculateBaMoatEngine(segment: BaSegmentEngineOutput, backlog: BaBacklogEngineOutput): BaMoatOutput {
  const longCycleMix = segment.rows
    .filter((row) => row.segment === "Air" || row.segment === "Maritime" || row.segment === "Electronic Systems")
    .reduce((sum, row) => sum + row.salesMix, 0);
  const backlogVisibility = clamp(backlog.backlogCoverageYears / 3, 0, 1) * 100;
  const marginDurability = clamp(safeRatio(segment.totals.underlyingEbit, segment.totals.sales) / 0.12, 0, 1) * 100;
  const procurementStickinessScore = Math.round(70 + longCycleMix * 25);
  const durabilityScore = Math.round(backlogVisibility * 0.45 + procurementStickinessScore * 0.35 + marginDurability * 0.2);
  const executionRisk = Math.round(100 - Math.min(segment.rows.find((row) => row.segment === "Maritime")?.qualityScore ?? 55, 80));
  const politicalBudgetRisk = 58;
  const programReplacementRisk = 24;
  const moatScore = Math.round(durabilityScore * 0.5 + procurementStickinessScore * 0.25 + (100 - programReplacementRisk) * 0.15 + (100 - politicalBudgetRisk) * 0.1);

  return {
    moatScore,
    durabilityScore,
    procurementStickinessScore,
    programReplacementRisk,
    politicalBudgetRisk,
    executionRisk,
    drivers: [
      {
        label: "Government relationship and sovereign industrial base",
        score: 88,
        sourceStatus: "research_only",
        explanation: "BAE sits inside UK, US, Saudi, Australian, and allied procurement systems; this is a relationship moat, not a consumer network effect.",
      },
      {
        label: "Long-cycle classified and mission-critical programmes",
        score: 84,
        sourceStatus: "research_only",
        explanation: "Combat air, submarines, missile defence, electronic warfare, and cyber programmes carry long qualification and switching cycles.",
      },
      {
        label: "Backlog visibility",
        score: Math.round(backlogVisibility),
        sourceStatus: "research_only",
        explanation: "Record backlog and book-to-bill above 1 support revenue durability, but backlog still has conversion and margin risk.",
      },
      {
        label: "Technical complexity and installed base",
        score: 80,
        sourceStatus: "research_only",
        explanation: "Sustainment and upgrade paths can extend programme economics after original build awards.",
      },
      {
        label: "Political budget risk",
        score: 100 - politicalBudgetRisk,
        sourceStatus: "research_only",
        explanation: "Defence spend is attractive when budgets rise, but it remains politically mediated and can be delayed.",
      },
    ],
  };
}
