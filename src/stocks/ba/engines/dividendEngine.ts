import type { BaDataset, BaDividendOutput } from "../model";
import { clamp, safeRatio } from "./helpers";

export function calculateBaDividendEngine(data: BaDataset, periodId = "fy25"): BaDividendOutput {
  const period = data.periods.find((item) => item.id === periodId) ?? data.periods[data.periods.length - 1];
  const prior = data.periods.find((item) => item.fiscalYear === period.fiscalYear - 1);
  const dividendPerSharePence = period.dividendPerSharePence;
  const dividendGrowth = prior ? safeRatio(period.dividendPerSharePence, prior.dividendPerSharePence) - 1 : 0;
  const dividendYield = dividendPerSharePence / data.marketData.currentPriceGbx;
  const earningsPayout = safeRatio(dividendPerSharePence, period.underlyingEpsPence);
  const fcfPayout = safeRatio((period.dividendPerSharePence / 100) * (period.outstandingSharesForEps ?? 0), period.freeCashFlow);
  const buybackSpend = period.buybackSpend ?? Math.max((period.returnsToShareholders ?? 0) - (period.dividendPerSharePence / 100) * (period.outstandingSharesForEps ?? 0), 0);
  const totalShareholderReturns = period.returnsToShareholders ?? buybackSpend + (period.dividendPerSharePence / 100) * (period.outstandingSharesForEps ?? 0);
  const sustainabilityScore = Math.round(
    clamp((0.65 - earningsPayout) / 0.35, 0, 1) * 35 +
      clamp((0.8 - fcfPayout) / 0.55, 0, 1) * 30 +
      clamp(period.freeCashFlow / Math.max(totalShareholderReturns, 1), 0, 1.6) * 20 +
      clamp(1.5 - safeRatio(period.netDebtExLeases, period.underlyingEbit), 0, 1) * 15,
  );

  return {
    dividendPerSharePence,
    dividendGrowth,
    dividendYield,
    earningsPayout,
    fcfPayout,
    buybackSpend,
    totalShareholderReturns,
    sustainabilityScore,
    notes: [
      `FY2025 dividend was ${dividendPerSharePence.toFixed(1)}p, up ${(dividendGrowth * 100).toFixed(1)}% year over year.`,
      `BAE returned GBP${totalShareholderReturns.toFixed(0)}m to shareholders in FY2025, including GBP${buybackSpend.toFixed(0)}m of buybacks.`,
      "Dividend sustainability is modeled from payout, FCF coverage, and balance-sheet capacity; it is not treated as guaranteed.",
    ],
  };
}
