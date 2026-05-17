import { mckCapitalAllocation } from "./capitalAllocation";

export const mckShareRepurchase = mckCapitalAllocation.map((row) => ({
  periodId: row.periodId,
  repurchases: row.repurchases,
  remainingAuthorization: row.remainingAuthorization,
  tag: row.tag,
}));
