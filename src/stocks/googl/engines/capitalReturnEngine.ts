import type { GooglCapitalReturnOutput, GooglDataset, GooglValuationAssumptions } from "../model";
import { getGooglPeriod, perShare, safeDivide } from "./helpers";

export function calculateGooglCapitalReturnEngine(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
): GooglCapitalReturnOutput {
  const period = getGooglPeriod(data, periodId);
  const cashAndSecurities = period.cashAndMarketableSecurities ?? data.financials.find((item) => item.id === "fy25")?.cashAndMarketableSecurities ?? 0;
  const debt = period.longTermDebt ?? data.financials.find((item) => item.id === "fy25")?.longTermDebt ?? 0;
  const netCash = cashAndSecurities - debt;
  const ttmFcf = period.ttmFreeCashFlow ?? period.freeCashFlow;
  const dividendPerShareAnnualized = data.marketData.dividendPerShareAnnualized;
  const dividendYield = safeDivide(dividendPerShareAnnualized, assumptions.currentPrice);
  const remainingBuybackAuthorization = data.commitmentsAndCapitalStructure.remainingShareRepurchaseAuthorization;
  const capitalReturnScore = Math.min(95, 50 + safeDivide(ttmFcf, data.marketData.marketCap) * 900 + safeDivide(remainingBuybackAuthorization, data.marketData.marketCap) * 450 + Math.max(netCash, 0) / 4_000);

  return {
    netCash,
    netCashPerShare: perShare(netCash, assumptions.dilutedShares),
    dividendPerShareAnnualized,
    dividendYield,
    remainingBuybackAuthorization,
    remainingBuybackAuthorizationPerShare: perShare(remainingBuybackAuthorization, assumptions.dilutedShares),
    ttmFcf,
    ttmFcfYield: safeDivide(ttmFcf, data.marketData.marketCap),
    capitalReturnScore,
  };
}
