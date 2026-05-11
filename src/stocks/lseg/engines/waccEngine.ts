import type { LsegDashboardDataset, LsegScenarioAssumptions, LsegWaccBuild } from "../model";
import { getPeriodById, safeRatio } from "./helpers";

export function calculateWaccEngine(
  data: LsegDashboardDataset,
  periodId: string,
  assumptions: LsegScenarioAssumptions,
): LsegWaccBuild {
  const period = getPeriodById(data, periodId);
  const marketValueEquity = assumptions.currentPrice * period.weightedAverageShares;
  const netDebt = period.netDebt;
  const enterpriseValue = marketValueEquity + netDebt;
  const costOfEquity = assumptions.riskFreeRate + (assumptions.beta * assumptions.equityRiskPremium);
  const afterTaxCostOfDebt = assumptions.preTaxCostOfDebt * (1 - assumptions.taxRate);
  const equityWeight = safeRatio(marketValueEquity, enterpriseValue);
  const debtWeight = safeRatio(netDebt, enterpriseValue);
  const wacc = (equityWeight * costOfEquity) + (debtWeight * afterTaxCostOfDebt);

  return {
    scenario: assumptions.scenario,
    riskFreeRate: assumptions.riskFreeRate,
    beta: assumptions.beta,
    equityRiskPremium: assumptions.equityRiskPremium,
    costOfEquity,
    preTaxCostOfDebt: assumptions.preTaxCostOfDebt,
    taxRate: assumptions.taxRate,
    afterTaxCostOfDebt,
    marketValueEquity,
    netDebt,
    equityWeight,
    debtWeight,
    wacc,
    sensitivity: [
      { label: "-50 bps", wacc: wacc - 0.005 },
      { label: "Base", wacc },
      { label: "+50 bps", wacc: wacc + 0.005 },
    ],
  };
}
