import type { MckDataset, MckWorkingCapitalOutput } from "../types";
import { latestFinancial, safeDivide } from "./helpers";

export function calculateWorkingCapitalEngine(data: MckDataset): MckWorkingCapitalOutput {
  const latest = latestFinancial(data);
  const normalizedFcf = data.assumptions.normalizedFcf;
  const adjustedNetIncomeProxy = latest.adjustedDilutedEps * data.assumptions.dilutedShares;
  const workingCapitalSwing = latest.freeCashFlow - normalizedFcf;
  return {
    reportedFcf: latest.freeCashFlow,
    normalizedFcf,
    operatingCashFlow: latest.operatingCashFlow,
    capex: latest.capex,
    fcfConversion: safeDivide(latest.freeCashFlow, adjustedNetIncomeProxy),
    normalizedFcfConversion: safeDivide(normalizedFcf, adjustedNetIncomeProxy),
    workingCapitalSwing,
    inventoryDays: 31,
    receivableDays: 27,
    payableDays: 47,
    warning:
      "Reported quarterly or annual FCF can be distorted by inventory, receivable and payable timing; do not mechanically annualize a single quarter.",
  };
}
