import type { Scenario } from "../../types";
import type { LsegBuybackForecastRow, LsegDashboardDataset, LsegScenarioAssumptions } from "../model";
import { getPeriodById, safeRatio } from "./helpers";
import type { LsegMarginEngineResult } from "./marginEngine";

export type LsegBuybackEngineResult = {
  scenario: Scenario;
  rows: LsegBuybackForecastRow[];
  epsCagr3Y: number;
  buybackContributionToEpsCagr: number;
  operatingContributionToEpsCagr: number;
};

export function calculateBuybackEngine(
  data: LsegDashboardDataset,
  periodId: string,
  assumptions: LsegScenarioAssumptions,
  margin: LsegMarginEngineResult,
): LsegBuybackEngineResult {
  const basePeriod = getPeriodById(data, periodId);
  const rows: LsegBuybackForecastRow[] = [];
  let beginningDilutedShares = basePeriod.weightedAverageShares;
  let priorEps = basePeriod.adjustedEps;

  for (const groupRow of margin.groupRows) {
    const buybackAmount = assumptions.buybackByYear[groupRow.fiscalYear] ?? 0;
    const averageBuybackPrice = assumptions.averageBuybackPriceByYear[groupRow.fiscalYear] ?? assumptions.currentPrice;
    const sharesRepurchased = safeRatio(buybackAmount, averageBuybackPrice);
    const stockCompensationDilution = assumptions.stockCompensationDilution;
    const endingDilutedShares = beginningDilutedShares - sharesRepurchased + stockCompensationDilution;
    const averageDilutedShares = (beginningDilutedShares + endingDilutedShares) / 2;
    const preTaxIncome = groupRow.adjustedOperatingProfit - assumptions.cashInterestExpense;
    const adjustedNetIncome = Math.max(preTaxIncome * (1 - assumptions.taxRate) - assumptions.minorityInterest, 0);
    const adjustedEps = safeRatio(adjustedNetIncome, averageDilutedShares);
    const epsWithoutBuyback = safeRatio(adjustedNetIncome, beginningDilutedShares + (stockCompensationDilution / 2));

    rows.push({
      fiscalYear: groupRow.fiscalYear,
      scenario: assumptions.scenario,
      beginningDilutedShares,
      buybackAmount,
      averageBuybackPrice,
      sharesRepurchased,
      stockCompensationDilution,
      endingDilutedShares,
      averageDilutedShares,
      adjustedNetIncome,
      adjustedEps,
      epsWithoutBuyback,
      buybackEpsAccretion: adjustedEps - epsWithoutBuyback,
    });

    beginningDilutedShares = endingDilutedShares;
    priorEps = adjustedEps;
  }

  const year3 = rows[Math.min(2, rows.length - 1)];
  const epsCagr3Y = year3 ? ((year3.adjustedEps / Math.max(basePeriod.adjustedEps, 0.01)) ** (1 / 3)) - 1 : 0;
  const buybackContributionToEpsCagr = year3 ? safeRatio(year3.buybackEpsAccretion, Math.max(year3.adjustedEps - basePeriod.adjustedEps, 0.01)) * epsCagr3Y : 0;
  const operatingContributionToEpsCagr = Math.max(epsCagr3Y - buybackContributionToEpsCagr, 0);

  return {
    scenario: assumptions.scenario,
    rows,
    epsCagr3Y,
    buybackContributionToEpsCagr,
    operatingContributionToEpsCagr,
  };
}
