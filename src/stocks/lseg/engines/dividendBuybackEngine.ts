import type { LsegCockpitDataset, LsegDividendBuybackOutput, LsegValuationAssumptions } from "../types";

export function calculateLsegDividendBuybackEngine(
  data: LsegCockpitDataset,
  assumptions: LsegValuationAssumptions,
): LsegDividendBuybackOutput {
  const latest = data.officialActuals.find((period) => period.periodId === "fy2025") ?? data.officialActuals[data.officialActuals.length - 1];
  const dividendPerShareGbp = latest.totalDividendPerSharePence / 100;
  const dividendCashCost = dividendPerShareGbp * assumptions.dilutedShares;
  const modeledShareReduction =
    assumptions.buyback2026 / Math.max(assumptions.averageBuybackPrice2026, 1) +
    assumptions.buyback2027 / Math.max(assumptions.averageBuybackPrice2027, 1);
  const buybackAdjustedShareCount = assumptions.dilutedShares - modeledShareReduction;

  return {
    dividendPerSharePence: latest.totalDividendPerSharePence,
    dividendCashCost,
    payoutRatioVsAdjustedProfit: dividendCashCost / Math.max(latest.adjustedProfitAttributable, 1),
    fcfCoverage: latest.equityFreeCashFlow / Math.max(dividendCashCost, 1),
    buybackAuthorization: data.managementGuidance[0]?.buybackPlan ?? 0,
    modeledShareReduction,
    buybackAdjustedShareCount,
    leverageConstraint:
      latest.leverage < 2.5
        ? `Operating net debt / EBITDA is ${latest.leverage.toFixed(1)}x, inside the 1.5x-2.5x target range.`
        : `Operating leverage is ${latest.leverage.toFixed(1)}x and constrains buyback capacity.`,
    dividendGrowthRunway:
      "Dividend is covered by official equity FCF, but buyback pace should flex with leverage, FX and Post Trade capital requirements.",
  };
}
