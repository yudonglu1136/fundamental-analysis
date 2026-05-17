import { mckCapitalAllocation } from "./capitalAllocation";

export const mckCashFlow = mckCapitalAllocation.map((row) => ({
  periodId: row.periodId,
  operatingCashFlow: row.operatingCashFlow,
  capex: row.capex,
  freeCashFlow: row.freeCashFlow,
  tag: row.tag,
}));
