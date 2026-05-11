import type {
  LsegDashboardDataset,
  LsegDcfResult,
  LsegMarketImpliedValuation,
  LsegScenarioAssumptions,
  LsegWaccBuild,
} from "../model";
import { getPeriodById, safeRatio } from "./helpers";
import type { LsegBuybackEngineResult } from "./buybackEngine";
import type { LsegFcfEngineResult } from "./fcfEngine";
import type { LsegMarginEngineResult } from "./marginEngine";

function solveByBisection(
  low: number,
  high: number,
  evaluator: (value: number) => number,
  target = 0,
  iterations = 80,
  increasing = true,
) {
  let lo = low;
  let hi = high;
  let mid = (lo + hi) / 2;
  for (let i = 0; i < iterations; i += 1) {
    mid = (lo + hi) / 2;
    const result = evaluator(mid) - target;
    if (Math.abs(result) < 1e-6) break;
    const shrinkHigh = increasing ? result > 0 : result < 0;
    if (shrinkHigh) hi = mid;
    else lo = mid;
  }
  return mid;
}

export function calculateMarketImpliedValuationEngine(
  data: LsegDashboardDataset,
  periodId: string,
  assumptions: LsegScenarioAssumptions,
  wacc: LsegWaccBuild,
  margin: LsegMarginEngineResult,
  fcf: LsegFcfEngineResult,
  buyback: LsegBuybackEngineResult,
  _dcf: LsegDcfResult,
): LsegMarketImpliedValuation {
  const market = data.marketData;
  const basePeriod = getPeriodById(data, periodId);
  const year1Eps = buyback.rows[0]?.adjustedEps ?? 0;
  const year1FcfShare = safeRatio(fcf.rows[0]?.equityFreeCashFlow ?? 0, buyback.rows[0]?.averageDilutedShares ?? 1);
  const year1Ebitda = margin.groupRows[0]?.adjustedEbitda ?? 0;
  const currentPrice = market.manualOverride ?? market.currentPrice;
  const impliedPe = safeRatio(currentPrice, year1Eps);
  const impliedFcfYield = safeRatio(year1FcfShare, currentPrice);
  const impliedEquityValue = currentPrice * market.dilutedShares;
  const impliedEnterpriseValue = impliedEquityValue + market.netDebt + basePeriod.minorityInterest;
  const impliedEvebitda = safeRatio(impliedEnterpriseValue, year1Ebitda);
  const warnings: string[] = [];

  const explicitFcfs = fcf.rows.map((row) => row.unleveredFreeCashFlow);
  const shares = market.dilutedShares;
  const targetEquityValue = currentPrice * shares;
  const targetEnterpriseValue = targetEquityValue + market.netDebt + basePeriod.minorityInterest;

  const impliedTerminalGrowth = solveByBisection(-0.02, 0.04, (terminalGrowth) => {
    const pvForecast = explicitFcfs.reduce((sum, cashFlow, index) => sum + (cashFlow / ((1 + wacc.wacc) ** (index + 1))), 0);
    const finalFcf = explicitFcfs[explicitFcfs.length - 1] ?? 0;
    const terminalValue = (finalFcf * (1 + terminalGrowth)) / Math.max(wacc.wacc - terminalGrowth, 0.0001);
    const pvTerminal = terminalValue / ((1 + wacc.wacc) ** explicitFcfs.length);
    return pvForecast + pvTerminal;
  }, targetEnterpriseValue, 80, true);

  const impliedWacc = solveByBisection(0.06, 0.11, (candidateWacc) => {
    const pvForecast = explicitFcfs.reduce((sum, cashFlow, index) => sum + (cashFlow / ((1 + candidateWacc) ** (index + 1))), 0);
    const finalFcf = explicitFcfs[explicitFcfs.length - 1] ?? 0;
    const terminalValue = (finalFcf * (1 + assumptions.terminalGrowth)) / Math.max(candidateWacc - assumptions.terminalGrowth, 0.0001);
    const pvTerminal = terminalValue / ((1 + candidateWacc) ** explicitFcfs.length);
    return pvForecast + pvTerminal;
  }, targetEnterpriseValue, 80, false);

  if (impliedTerminalGrowth >= wacc.wacc || impliedTerminalGrowth < -0.02 || impliedTerminalGrowth > 0.04) {
    warnings.push("Implied terminal growth could not be solved cleanly within the guardrail range of -2% to 4%.");
  }

  const impliedFcfShareCagr = solveByBisection(-0.02, 0.18, (growth) => {
    const fcfShareYear3 = year1FcfShare * ((1 + growth) ** 3);
    const terminalValue = fcfShareYear3 / Math.max(assumptions.targetFcfYield, 0.001);
    const cumulativeDividends = currentPrice * assumptions.dividendYield * 3;
    return terminalValue + cumulativeDividends;
  }, currentPrice, 80, true);

  const impliedExitPeFor3YTarget = solveByBisection(10, 35, (exitPe) => {
    const targetPrice = (buyback.rows[2]?.adjustedEps ?? year1Eps) * exitPe;
    const totalReturn = targetPrice + (currentPrice * assumptions.dividendYield * 3);
    return totalReturn;
  }, currentPrice * ((1 + 0.1) ** 3), 80, true);

  const commentary =
    `At the current price of £${currentPrice.toFixed(2)}, the market implies roughly ${impliedPe.toFixed(1)}x forward EPS, ${(impliedFcfYield * 100).toFixed(2)}% equity FCF yield, and ${impliedEvebitda.toFixed(1)}x EV/EBITDA. ` +
    `Relative to our model, the key debate is whether current valuation already discounts durable mid/high-single-digit FCF/share growth or still requires a stronger terminal narrative and exit multiple.`;

  return {
    currentPrice,
    priceDate: market.priceDate,
    impliedPe,
    impliedFcfYield,
    impliedEquityValue,
    impliedEnterpriseValue,
    impliedEvebitda,
    impliedTerminalGrowth,
    impliedWacc,
    impliedFcfShareCagr,
    impliedExitPeFor3YTarget,
    warnings,
    commentary,
  };
}
