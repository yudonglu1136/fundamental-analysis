import type { NocCapitalReturnsOutput, NocDataset } from "../model";
import { safeRatio } from "./helpers";

export function calculateNocCapitalReturnsEngine(data: NocDataset, periodId = "fy25"): NocCapitalReturnsOutput {
  const period = data.periods.find((item) => item.id === periodId) ?? data.periods.find((item) => item.id === "fy25") ?? data.periods[0];
  const dividendPerShare = period.dividendPerShare ?? 0;
  const dividendYield = safeRatio(dividendPerShare, data.marketData.currentPrice);
  const fcfPayout = safeRatio(period.dividendsPaid ?? dividendPerShare * period.dilutedShares, period.freeCashFlow);
  const pensionSurplus = (period.pensionAndOpbAssets ?? period.pensionAssets ?? 0) - (period.pensionAndOpbLiabilities ?? period.pensionLiabilities ?? 0);
  return {
    dividendPerShare,
    dividendYield,
    fcfPayout,
    buybackSpend: period.buybacks ?? 0,
    totalShareholderReturns: (period.buybacks ?? 0) + (period.dividendsPaid ?? 0),
    cashConversion: safeRatio(period.freeCashFlow, period.netEarnings),
    pensionSurplus,
    notes: [
      "FY2025 FCF exceeded dividends and buybacks, but Q1 cash use shows the usual working-capital seasonality.",
      "Pension is a valuation bridge item and a risk item: funded status can help equity value, while FAS/CAS and MTM can move EPS optics.",
      "Buyback capacity is modeled as a capital-deployment output, not as an automatic EPS accretion assumption.",
    ],
  };
}
