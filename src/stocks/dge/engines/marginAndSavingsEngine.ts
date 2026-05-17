import type { DgeDataset, DgeMarginSavingsOutput } from "../types";
import { clamp, evidenceList, scoreFromGrowth } from "./helpers";

export function buildDgeMarginAndSavingsEngine(data: DgeDataset): DgeMarginSavingsOutput {
  const fy2025 = data.periods.find((row) => row.id === "fy2025") ?? data.periods[0];
  const h1 = data.periods.find((row) => row.id === "h1-fy2026") ?? fy2025;
  const guidance = data.guidanceData[0];
  const grossSavings = guidance?.accelerateSavings ?? 625;
  const marginBase = h1.operatingMarginBeforeExceptional ?? fy2025.operatingMarginBeforeExceptional ?? 0.28;
  const organicProfitGrowth = h1.organicOperatingProfitGrowth ?? 0;
  const savingsCoverage = grossSavings / Math.max(fy2025.reportedNetSales, 1);
  const tariffDrag = 0.004;
  const mixDrag = Math.max(0, -((h1.priceMixGrowth ?? 0))) * 0.45;
  const apEfficiencyRisk = 52;
  const savingsQualityScore = Math.round(clamp(58 + savingsCoverage * 1_000 - apEfficiencyRisk * 0.18));
  const underlyingMarginScore = Math.round(clamp(scoreFromGrowth(organicProfitGrowth, 0, 0.08) * 0.28 + scoreFromGrowth(marginBase - 0.28, 0, 0.08) * 0.35 + savingsQualityScore * 0.22 + (100 - apEfficiencyRisk) * 0.15));

  return {
    underlyingMarginScore,
    savingsQualityScore,
    tariffDrag,
    mixDrag,
    apEfficiencyRisk,
    sustainableMarginScenario: {
      Bear: Math.max(0.22, marginBase - 0.035 - tariffDrag - mixDrag),
      Base: Math.max(0.24, marginBase - 0.008 - tariffDrag * 0.5),
      Bull: Math.min(0.32, marginBase + 0.012 + savingsCoverage * 0.3),
    },
    evidenceIds: evidenceList(fy2025.sourceEvidenceIds, h1.sourceEvidenceIds, guidance?.sourceEvidenceIds ?? [], ["q3fy2026-guidance"]),
    warnings: [
      "Accelerate savings are not treated as high-quality margin expansion unless volume, mix and A&P efficiency also improve.",
      "Tariff drag is modeled as a research-only risk input pending quantified company disclosure.",
      "Margin stability from lower marketing or phasing would be lower quality than gross-margin or volume-led improvement.",
    ],
  };
}
