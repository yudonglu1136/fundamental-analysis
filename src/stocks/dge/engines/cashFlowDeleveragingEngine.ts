import type { DgeCashFlowOutput, DgeDataset } from "../types";
import { clamp, evidenceList, safeRatio } from "./helpers";

export function buildDgeCashFlowDeleveragingEngine(data: DgeDataset): DgeCashFlowOutput {
  const fy2025 = data.periods.find((row) => row.id === "fy2025") ?? data.periods[0];
  const h1 = data.periods.find((row) => row.id === "h1-fy2026") ?? fy2025;
  const guidance = data.guidanceData[0];
  const normalizedFcf = data.researchAssumptions.find((item) => item.id === "assumption-normalized-fcf")?.value ?? 2_850;
  const dividendCash = (guidance?.dividendFloor ?? data.marketData.dividendPerShareUsd) * data.marketData.sharesOutstandingM;
  const fcfAfterDividend = normalizedFcf - dividendCash;
  const disposalProceeds = 2_300;
  const debtReductionCapacity = Math.max(fcfAfterDividend, 0) + disposalProceeds;
  const payoutRatio = safeRatio(dividendCash, normalizedFcf);
  const fcfQualityScore = Math.round(
    clamp(55 + safeRatio(normalizedFcf, guidance?.freeCashFlow ?? normalizedFcf) * 20 - (guidance?.erpInventoryBuildExcludedFromFcf ?? 0) / 20),
  );
  const dividendSafetyScore = Math.round(clamp(82 - payoutRatio * 80 + (guidance?.dividendFloor ? 15 : 0)));
  const currentLeverage = h1.leverageRatio ?? fy2025.leverageRatio ?? 3.5;
  const baseNetDebt = h1.netDebt ?? data.marketData.netDebtUsdM;
  const ebitda = h1.adjustedEbitda ?? fy2025.adjustedEbitda ?? 6_200;

  const buildPath = (startingLeverage: number, annualDebtPaydown: number) =>
    [2026, 2027, 2028].map((year, index) => ({
      year,
      netDebtToEbitda: Math.max(1.9, startingLeverage - annualDebtPaydown * index),
    }));

  return {
    fcfQualityScore,
    deleveragingPath: [
      { period: "H1 FY2026", netDebtToEbitda: currentLeverage, netDebt: baseNetDebt },
      { period: "Post EABL disposal", netDebtToEbitda: Math.max(2.2, currentLeverage - 0.25), netDebt: baseNetDebt - disposalProceeds },
      { period: "FY2027 base", netDebtToEbitda: Math.max(2.0, (baseNetDebt - debtReductionCapacity) / ebitda), netDebt: baseNetDebt - debtReductionCapacity },
    ],
    dividendSafetyScore,
    payoutRatio,
    fcfAfterDividend,
    debtReductionCapacity,
    leveragePath: {
      Bear: buildPath(currentLeverage, 0.18),
      Base: buildPath(currentLeverage - 0.25, 0.32),
      Bull: buildPath(currentLeverage - 0.35, 0.45),
    },
    evidenceIds: evidenceList(fy2025.sourceEvidenceIds, h1.sourceEvidenceIds, guidance?.sourceEvidenceIds ?? [], ["h1fy2026-eabl-disposal"]),
    warnings: [
      "FCF $3bn credibility depends on OCF, capex, working capital, exceptionals and inventory build, not just operating profit.",
      "Dividend model rejects old dividend growth anchors and old dividend history; it uses the rebased floor and payout policy.",
      "Asset disposals improve leverage, but do not solve brand demand if North America remains weak.",
    ],
  };
}
