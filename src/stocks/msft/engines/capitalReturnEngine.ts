import type { MsftDataset, MsftValuationAssumptions } from "../model";
import { safeRatio } from "./helpers";

export function calculateMsftCapitalReturnEngine(data: MsftDataset, assumptions: MsftValuationAssumptions) {
  const fy25 = data.periods.find((period) => period.id === "fy25") ?? data.periods[0];
  const q3 = data.periods.find((period) => period.id === "q3-fy26") ?? data.periods[0];
  const netCashExLeases = (q3.cashAndShortTermInvestments ?? 0) - (q3.debt ?? 0);
  const netCashAfterLeases = assumptions.netCashDebt;
  return {
    fy25DividendPerShare: assumptions.dividendPerShare,
    fy25DividendsPaid: fy25.dividendsPaid ?? 0,
    fy25Buybacks: fy25.buybacks ?? 0,
    fy25FcfPayout: safeRatio((fy25.dividendsPaid ?? 0) + (fy25.buybacks ?? 0), fy25.freeCashFlow),
    q3ShareholderReturn: q3.shareholderReturn ?? 0,
    q3DividendPaid: q3.dividendsPaid ?? 0,
    q3Buybacks: q3.buybacks ?? 0,
    netCashExLeases,
    netCashAfterLeases,
    interpretation:
      "Capital return is still large, but the AI build has clearly changed the free-cash-flow conversation: payout capacity must be judged against capex intensity, not GAAP net income alone.",
  };
}
