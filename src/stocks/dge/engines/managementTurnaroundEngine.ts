import type { DgeDataset, DgeManagementTurnaroundOutput } from "../types";
import { clamp, evidenceList } from "./helpers";

export function buildDgeManagementTurnaroundEngine(data: DgeDataset): DgeManagementTurnaroundOutput {
  const q3 = data.periods.find((row) => row.id === "q3-fy2026") ?? data.periods[0];
  const usWeakness = data.reportedData.regions.find((row) => row.periodId === "q3-fy2026" && row.region === "North America")?.organicNetSalesGrowth ?? 0;
  const lacGrowth = data.reportedData.regions.find((row) => row.periodId === "q3-fy2026" && row.region === "Latin America & Caribbean")?.organicNetSalesGrowth ?? 0;
  const guidanceKept = data.guidanceData.length > 0;
  const strategyChangeIntensity = 82;
  const earlyWins = [
    "Dividend policy rebased to a more defendable 30-50% payout framework with a 50c floor.",
    "Accelerate savings target increased to about $625m.",
    "EABL disposal can reduce leverage by roughly 0.25x if completed as guided.",
    "Q3 Europe, LAC and Africa turned positive, although quality differs by region.",
  ];
  const redFlags = [
    "US Spirits Q3 decline and share-loss categories are still severe.",
    "LAC growth includes low-base, restocking and World Cup pull-forward risk.",
    "Strategy language is directionally sensible but hard evidence of customer-service and affordability fixes is still early.",
  ];

  return {
    turnaroundCredibilityScore: Math.round(clamp(50 + (guidanceKept ? 12 : -8) + lacGrowth * 45 - Math.abs(Math.min(usWeakness, 0)) * 80)),
    executionRiskScore: Math.round(clamp(70 - (guidanceKept ? 8 : 0) + Math.abs(Math.min(usWeakness, 0)) * 120)),
    strategyChangeIntensity,
    earlyWins,
    redFlags,
    evidenceIds: evidenceList(q3.sourceEvidenceIds, ["h1fy2026-priorities", "h1fy2026-dividend-rebased", "h1fy2026-eabl-disposal", "q3fy2026-guidance"]),
  };
}
