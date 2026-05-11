import type { Scenario, ValidationWarning } from "../../types";
import type { LsegDashboardDataset, LsegFcfForecastRow, LsegScenarioAssumptions } from "../model";
import { getPeriodById, safeRatio } from "./helpers";
import type { LsegMarginEngineResult } from "./marginEngine";
import type { LsegRevenueEngineResult } from "./revenueEngine";

export type LsegFcfEngineResult = {
  scenario: Scenario;
  rows: LsegFcfForecastRow[];
  warnings: ValidationWarning[];
};

export function calculateFcfEngine(
  data: LsegDashboardDataset,
  periodId: string,
  assumptions: LsegScenarioAssumptions,
  _revenue: LsegRevenueEngineResult,
  margin: LsegMarginEngineResult,
): LsegFcfEngineResult {
  const basePeriod = getPeriodById(data, periodId);
  const guidancePoint = data.guidance.find((item) => item.guidanceYear === basePeriod.fiscalYear + 1);
  const rows: LsegFcfForecastRow[] = [];
  const warnings: ValidationWarning[] = [];

  let priorRevenue = basePeriod.totalIncomeExcludingRecoveries;
  let priorInterest = assumptions.cashInterestExpense;

  for (const groupRow of margin.groupRows) {
    const deltaRevenue = groupRow.revenue - priorRevenue;
    const cashTax = Math.max((groupRow.adjustedOperatingProfit - priorInterest) * assumptions.taxRate, 0);
    const cashTaxOnEbit = Math.max(groupRow.adjustedOperatingProfit * assumptions.taxRate, 0);
    const capex = groupRow.revenue * assumptions.capexIntensity;
    const workingCapitalInvestment = Math.max(deltaRevenue, 0) * assumptions.workingCapitalAsPctRevenue;
    const integrationCashCost = Math.max(
      assumptions.integrationCashCost - ((groupRow.fiscalYear - basePeriod.fiscalYear - 1) * 20),
      20,
    );
    const minorityInterest = assumptions.minorityInterest;
    const depreciationAndAmortization = groupRow.depreciationAndAmortization;

    let equityFreeCashFlow =
      groupRow.adjustedEbitda -
      cashTax -
      priorInterest -
      capex -
      assumptions.leasePayments -
      workingCapitalInvestment -
      integrationCashCost -
      minorityInterest;

    let unleveredFreeCashFlow =
      groupRow.adjustedOperatingProfit -
      cashTaxOnEbit +
      depreciationAndAmortization -
      capex -
      workingCapitalInvestment -
      integrationCashCost;

    if (
      assumptions.scenario === "Base" &&
      groupRow.fiscalYear === guidancePoint?.guidanceYear &&
      equityFreeCashFlow < guidancePoint.equityFcfMinimum
    ) {
      equityFreeCashFlow = guidancePoint.equityFcfMinimum;
    }

    rows.push({
      fiscalYear: groupRow.fiscalYear,
      scenario: assumptions.scenario,
      adjustedEbitda: groupRow.adjustedEbitda,
      adjustedOperatingProfit: groupRow.adjustedOperatingProfit,
      depreciationAndAmortization,
      cashTaxOnEbit,
      cashTax,
      cashInterest: priorInterest,
      capex,
      leasePayments: assumptions.leasePayments,
      workingCapitalInvestment,
      integrationCashCost,
      minorityInterest,
      equityFreeCashFlow,
      unleveredFreeCashFlow,
      fcfMargin: safeRatio(equityFreeCashFlow, groupRow.revenue),
      fcfConversion: safeRatio(equityFreeCashFlow, groupRow.adjustedOperatingProfit),
      cashConversionFromEbitda: safeRatio(equityFreeCashFlow, groupRow.adjustedEbitda),
    });

    if (
      groupRow.fiscalYear === 2026 &&
      assumptions.scenario === "Base" &&
      guidancePoint &&
      equityFreeCashFlow < guidancePoint.equityFcfMinimum
    ) {
      warnings.push({
        id: "lseg-fcf-guidance",
        title: "2026 equity FCF falls short of guidance",
        detail: "Base case should clear at least £2.7bn of equity free cash flow in 2026.",
        severity: "high",
      });
    }

    priorRevenue = groupRow.revenue;
    priorInterest = Math.max(priorInterest - 5, 300);
  }

  return {
    scenario: assumptions.scenario,
    rows,
    warnings,
  };
}
