import type { MckDataset } from "../types";
import { latestFinancial, safeDivide } from "./helpers";

export function calculateCapitalAllocationEngine(data: MckDataset) {
  const latest = latestFinancial(data);
  return {
    freeCashFlow: latest.freeCashFlow,
    dividend: latest.dividendsPaid,
    buyback: latest.shareRepurchases,
    maCapacity: Math.max(latest.freeCashFlow - latest.dividendsPaid - latest.shareRepurchases, 0),
    netDebt: data.assumptions.netDebt,
    remainingAuthorization: 7700,
    buybackYield: safeDivide(latest.shareRepurchases, data.assumptions.currentPrice * data.assumptions.dilutedShares),
    payoutOfFcf: safeDivide(latest.dividendsPaid + latest.shareRepurchases, latest.freeCashFlow),
  };
}
