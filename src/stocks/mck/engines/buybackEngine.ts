import type { MckBuybackOutput, MckDataset } from "../types";
import { latestFinancial, safeDivide } from "./helpers";

export function calculateBuybackEngine(data: MckDataset): MckBuybackOutput {
  const latest = latestFinancial(data);
  const assumptions = data.assumptions;
  const buybackCapacity = Math.max(assumptions.annualFcf - assumptions.dividendPayout, 0);
  const annualSharesRetired = safeDivide(Math.min(assumptions.buybackAmount, buybackCapacity), assumptions.averageBuybackPrice);
  const annualShareReduction = safeDivide(annualSharesRetired, assumptions.dilutedShares);
  const endingShares1Y = assumptions.dilutedShares - annualSharesRetired;
  const endingShares3Y = assumptions.dilutedShares * (1 - annualShareReduction) ** 3;
  const endingShares5Y = assumptions.dilutedShares * (1 - annualShareReduction) ** 5;
  const adjustedNetIncome = assumptions.forwardAdjustedEps * assumptions.dilutedShares;
  const epsAfterBuyback = safeDivide(adjustedNetIncome, endingShares1Y);
  const fcfPerShareAfterBuyback = safeDivide(latest.freeCashFlow, endingShares1Y);
  const valueCreationSignal = assumptions.averageBuybackPrice < assumptions.currentPrice * 1.05 ? "Positive" : "Needs Review";
  return {
    beginningShares: assumptions.dilutedShares,
    endingShares1Y,
    endingShares3Y,
    endingShares5Y,
    annualShareReduction,
    epsAccretion1Y: safeDivide(epsAfterBuyback, assumptions.forwardAdjustedEps) - 1,
    fcfPerShareAccretion1Y: safeDivide(fcfPerShareAfterBuyback, safeDivide(latest.freeCashFlow, assumptions.dilutedShares)) - 1,
    buybackYield: safeDivide(assumptions.buybackAmount, assumptions.currentPrice * assumptions.dilutedShares),
    valueCreationSignal,
    averageRepurchasePrice: assumptions.averageBuybackPrice,
    threeYearCumulativeBuyback: assumptions.buybackAmount * 3,
    fiveYearCumulativeBuyback: assumptions.buybackAmount * 5,
    commentary:
      valueCreationSignal === "Positive"
        ? "Buybacks are a material per-share compounding engine at the current assumed execution price."
        : "Buybacks still shrink share count, but value creation falls when repurchases occur above underwriting value.",
  };
}
