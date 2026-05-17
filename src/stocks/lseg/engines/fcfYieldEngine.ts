import type { LsegCockpitDataset, LsegFcfYieldOutput, LsegFcffDcfOutput, LsegScenarioAssumption, LsegValuationAssumptions } from "../types";
import { getLatestAuditedLsegActual, resolveLsegValuationSemantics } from "./valuationSemantics";

export function calculateLsegFcfYieldEngine(
  data: LsegCockpitDataset,
  scenario: LsegScenarioAssumption,
  assumptions: LsegValuationAssumptions,
  dcf: LsegFcffDcfOutput,
): LsegFcfYieldOutput {
  const semantics = resolveLsegValuationSemantics(data);
  const latest = getLatestAuditedLsegActual(data);
  const guidance = data.managementGuidance[0];
  const yearOne = dcf.forecast[0];
  const maintenanceCapex = yearOne.capex * assumptions.maintenanceCapexPctCapex;
  const growthCapex = yearOne.capex - maintenanceCapex;
  const yearOneBaseFcff = yearOne.fcff - yearOne.postTradeIncrementalFcff;
  const normalFcfBeforePostTradeUplift = Math.max(
    guidance.equityFreeCashFlowFloor,
    (latest.equityFreeCashFlow + guidance.equityFreeCashFlowFloor + yearOneBaseFcff) / 3,
  );
  const postTradeIncrementalFcf = yearOne.postTradeIncrementalFcff;
  const normalizedFcf = normalFcfBeforePostTradeUplift + postTradeIncrementalFcf;
  const buybackAdjustedShares =
    assumptions.dilutedShares -
    assumptions.buyback2026 / Math.max(assumptions.averageBuybackPrice2026, 1) -
    assumptions.buyback2027 / Math.max(assumptions.averageBuybackPrice2027, 1);
  const impliedEquityValue = normalizedFcf / Math.max(scenario.targetFcfYield, 0.001);
  const dividendCashCost = (assumptions.dividendPerSharePence / 100) * assumptions.dilutedShares;

  return {
    valuationBase: semantics.methodBases.fcfYield,
    currentFcfYield: latest.equityFreeCashFlow / Math.max(data.marketData.marketCapGbp, 1),
    normalizedFcf,
    normalizedFcfYield: normalizedFcf / Math.max(data.marketData.marketCapGbp, 1),
    targetYield: scenario.targetFcfYield,
    impliedEquityValue,
    impliedPrice: impliedEquityValue / Math.max(buybackAdjustedShares, 1),
    maintenanceCapex,
    growthCapex,
    dividendCoverage: normalizedFcf / Math.max(dividendCashCost, 1),
    buybackAdjustedShares,
    normalFcfBeforePostTradeUplift,
    postTradeIncrementalFcf,
    postTradeUpliftedFcf: normalizedFcf,
  };
}
