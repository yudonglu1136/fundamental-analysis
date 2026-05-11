import type { LsegDashboardDataset, LsegDcfResult, LsegWaccBuild } from "../model";
import { getPeriodById, safeRatio } from "./helpers";
import type { LsegFcfEngineResult } from "./fcfEngine";

export function calculateDcfEngine(
  data: LsegDashboardDataset,
  periodId: string,
  terminalGrowth: number,
  fcf: LsegFcfEngineResult,
  wacc: LsegWaccBuild,
): LsegDcfResult {
  const basePeriod = getPeriodById(data, periodId);
  let pvForecastCashFlow = 0;
  const yearlyPresentValues: LsegDcfResult["yearlyPresentValues"] = [];

  fcf.rows.forEach((row, index) => {
    const presentValue = row.unleveredFreeCashFlow / ((1 + wacc.wacc) ** (index + 1));
    pvForecastCashFlow += presentValue;
    yearlyPresentValues.push({ fiscalYear: row.fiscalYear, presentValue });
  });

  const finalYearFcf = fcf.rows[fcf.rows.length - 1]?.unleveredFreeCashFlow ?? 0;
  const terminalValue = (finalYearFcf * (1 + terminalGrowth)) / Math.max(wacc.wacc - terminalGrowth, 0.0001);
  const pvTerminalValue = terminalValue / ((1 + wacc.wacc) ** fcf.rows.length);
  const enterpriseValue = pvForecastCashFlow + pvTerminalValue;
  const equityValue = enterpriseValue - basePeriod.netDebt - basePeriod.minorityInterest;
  const valuePerShare = safeRatio(equityValue, basePeriod.weightedAverageShares);

  return {
    scenario: wacc.scenario,
    cashFlowTaxonomy: {
      dcfMethod: "wacc_unlevered",
      dcfCashFlowType: "unlevered",
      fcfYieldCashFlowType: "equity",
      netDebtTreatment: "subtract_after_ev",
      interestTreatment: "excluded_from_unlevered_dcf",
    },
    pvForecastCashFlow,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    valuePerShare,
    terminalValuePctOfEv: safeRatio(pvTerminalValue, enterpriseValue),
    yearlyPresentValues,
  };
}
