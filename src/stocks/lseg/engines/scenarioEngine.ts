import type { Scenario } from "../../types";
import { lsegScenarioDefinitions } from "../config/scenarios";
import type { LsegScenarioAssumptions } from "../model";
import type { LsegValuationAssumptions } from "../config/assumptions";

export function buildScenarioAssumptions(
  scenario: Scenario,
  overrides?: Partial<LsegValuationAssumptions>,
): LsegScenarioAssumptions {
  const base = lsegScenarioDefinitions[scenario];
  if (!overrides) return structuredClone(base);

  const next = structuredClone(base);
  next.currentPrice = overrides.currentPrice ?? next.currentPrice;
  next.taxRate = overrides.taxRate ?? next.taxRate;
  next.capexIntensity = overrides.capexIntensity ?? next.capexIntensity;
  next.cashInterestExpense = overrides.cashInterestExpense ?? next.cashInterestExpense;
  next.workingCapitalAsPctRevenue = overrides.workingCapitalAsPctRevenue ?? next.workingCapitalAsPctRevenue;
  next.integrationCashCost = overrides.integrationCashCost ?? next.integrationCashCost;
  next.riskFreeRate = overrides.riskFreeRate ?? next.riskFreeRate;
  next.beta = overrides.beta ?? next.beta;
  next.equityRiskPremium = overrides.equityRiskPremium ?? next.equityRiskPremium;
  next.preTaxCostOfDebt = overrides.preTaxCostOfDebt ?? next.preTaxCostOfDebt;
  next.targetPe = overrides.targetPe ?? next.targetPe;
  next.targetFcfYield = overrides.targetFcfYield ?? next.targetFcfYield;
  next.terminalGrowth = overrides.terminalGrowth ?? next.terminalGrowth;
  next.exitPe = overrides.exitPe ?? next.exitPe;
  next.dividendYield = overrides.dividendYield ?? next.dividendYield;
  next.valuationWeights = {
    dcf: overrides.weightDcf ?? next.valuationWeights.dcf,
    fcfYield: overrides.weightFcfYield ?? next.valuationWeights.fcfYield,
    sotp: overrides.weightSotp ?? next.valuationWeights.sotp,
    pe: overrides.weightPe ?? next.valuationWeights.pe,
  };
  next.buybackByYear[2026] = overrides.buyback2026 ?? next.buybackByYear[2026];
  next.buybackByYear[2027] = overrides.buyback2027 ?? next.buybackByYear[2027];
  next.averageBuybackPriceByYear[2026] =
    overrides.averageBuybackPrice2026 ?? next.averageBuybackPriceByYear[2026];
  next.averageBuybackPriceByYear[2027] =
    overrides.averageBuybackPrice2027 ?? next.averageBuybackPriceByYear[2027];

  return next;
}
