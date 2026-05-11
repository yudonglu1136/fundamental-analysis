import type { Scenario, ValidationWarning } from "../../types";
import type { LsegDashboardDataset, LsegGroupForecastRow, LsegMarginForecastRow, LsegScenarioAssumptions, LsegSegmentName } from "../model";
import { getPeriodById, getSegmentPoint, marginDeltaFromAssumption, safeRatio } from "./helpers";
import type { LsegRevenueEngineResult } from "./revenueEngine";

export type LsegMarginEngineResult = {
  scenario: Scenario;
  segmentRows: LsegMarginForecastRow[];
  groupRows: LsegGroupForecastRow[];
  warnings: ValidationWarning[];
  marginBridge: Array<{
    fiscalYear: number;
    operatingLeverageBps: number;
    synergyBenefitBps: number;
    productivityBenefitBps: number;
    reinvestmentBps: number;
    costInflationBps: number;
    netMarginExpansionBps: number;
  }>;
};

export function calculateMarginEngine(
  data: LsegDashboardDataset,
  periodId: string,
  assumptions: LsegScenarioAssumptions,
  revenue: LsegRevenueEngineResult,
): LsegMarginEngineResult {
  const basePeriod = getPeriodById(data, periodId);
  const guidancePeriod = data.guidance.find((item) => item.guidanceYear === basePeriod.fiscalYear + 1);
  const segmentRows: LsegMarginForecastRow[] = [];
  const groupRows: LsegGroupForecastRow[] = [];
  const warnings: ValidationWarning[] = [];
  const marginBridge: LsegMarginEngineResult["marginBridge"] = [];
  const segments = [...new Set(revenue.rows.map((row) => row.segment))] as LsegSegmentName[];
  const priorMarginBySegment = Object.fromEntries(
    segments.map((segment) => {
      const point = getSegmentPoint(data, periodId, segment, assumptions.segmentTaxonomy);
      return [segment, point.adjustedEbitdaMargin];
    }),
  ) as Record<LsegSegmentName, number>;

  let priorGroupMargin = basePeriod.adjustedEbitdaMargin;
  const baseDnaRatio = safeRatio(basePeriod.adjustedEbitda - basePeriod.adjustedOperatingProfit, basePeriod.totalIncomeExcludingRecoveries);

  for (const groupRevenuePoint of revenue.groupRevenueByYear) {
    const yearRows = revenue.rows.filter((row) => row.fiscalYear === groupRevenuePoint.fiscalYear);
    let totalEbitda = 0;
    let weightedLeverage = 0;
    let weightedSynergy = 0;
    let weightedProductivity = 0;
    let weightedReinvestment = 0;
    let weightedInflation = 0;

    for (const segment of segments) {
      const revenueRow = yearRows.find((row) => row.segment === segment);
      if (!revenueRow) continue;
      const assumption = assumptions.segmentMargin[segment];
      if (!assumption) continue;

      const delta = marginDeltaFromAssumption(
        assumption,
        groupRevenuePoint.fiscalYear - basePeriod.fiscalYear,
      );
      const baseMargin = priorMarginBySegment[segment];
      const endingMargin = baseMargin + (delta.netBps / 10000);
      const adjustedEbitda = revenueRow.endingRevenue * endingMargin;
      const revenueWeight = safeRatio(revenueRow.endingRevenue, groupRevenuePoint.revenue);

      segmentRows.push({
        fiscalYear: groupRevenuePoint.fiscalYear,
        scenario: assumptions.scenario,
        segment,
        baseMargin,
        operatingLeverageBps: delta.operatingLeverageBps,
        synergyBenefitBps: delta.synergyBenefitBps,
        productivityBenefitBps: delta.productivityBenefitBps,
        reinvestmentBps: delta.reinvestmentBps,
        costInflationBps: delta.costInflationBps,
        endingMargin,
        adjustedEbitda,
      });

      totalEbitda += adjustedEbitda;
      weightedLeverage += delta.operatingLeverageBps * revenueWeight;
      weightedSynergy += delta.synergyBenefitBps * revenueWeight;
      weightedProductivity += delta.productivityBenefitBps * revenueWeight;
      weightedReinvestment += delta.reinvestmentBps * revenueWeight;
      weightedInflation += delta.costInflationBps * revenueWeight;
      priorMarginBySegment[segment] = endingMargin;
    }

    let adjustedEbitdaMargin = safeRatio(totalEbitda, groupRevenuePoint.revenue);

    if (
      assumptions.scenario === "Base" &&
      groupRevenuePoint.fiscalYear === guidancePeriod?.guidanceYear &&
      totalEbitda > 0
    ) {
      const targetMarginExpansion =
        ((guidancePeriod.ebitdaMarginExpansionLowBps + guidancePeriod.ebitdaMarginExpansionHighBps) / 2) / 10000;
      const targetMargin = basePeriod.adjustedEbitdaMargin + targetMarginExpansion;
      const targetEbitda = groupRevenuePoint.revenue * targetMargin;
      const scaleFactor = targetEbitda / totalEbitda;
      segmentRows
        .filter((row) => row.fiscalYear === groupRevenuePoint.fiscalYear)
        .forEach((row) => {
          row.adjustedEbitda *= scaleFactor;
          row.endingMargin = safeRatio(row.adjustedEbitda, revenue.rows.find((revenueRow) => revenueRow.fiscalYear === row.fiscalYear && revenueRow.segment === row.segment)?.endingRevenue ?? 1);
          priorMarginBySegment[row.segment] = row.endingMargin;
        });
      totalEbitda = targetEbitda;
      adjustedEbitdaMargin = targetMargin;
    }

    const depreciationAndAmortizationRatio = Math.max(baseDnaRatio - ((groupRevenuePoint.fiscalYear - basePeriod.fiscalYear) * 0.001), 0.105);
    const depreciationAndAmortization = groupRevenuePoint.revenue * depreciationAndAmortizationRatio;
    const adjustedOperatingProfit = totalEbitda - depreciationAndAmortization;
    const marginExpansionBps = (adjustedEbitdaMargin - priorGroupMargin) * 10000;

    groupRows.push({
      fiscalYear: groupRevenuePoint.fiscalYear,
      scenario: assumptions.scenario,
      revenue: groupRevenuePoint.revenue,
      adjustedEbitda: totalEbitda,
      adjustedEbitdaMargin,
      adjustedOperatingProfit,
      depreciationAndAmortization,
      revenueGrowth: groupRevenuePoint.growth,
      marginExpansionBps,
    });

    marginBridge.push({
      fiscalYear: groupRevenuePoint.fiscalYear,
      operatingLeverageBps: weightedLeverage,
      synergyBenefitBps: weightedSynergy,
      productivityBenefitBps: weightedProductivity,
      reinvestmentBps: weightedReinvestment,
      costInflationBps: weightedInflation,
      netMarginExpansionBps: marginExpansionBps,
    });

    if (
      groupRevenuePoint.fiscalYear === 2026 &&
      assumptions.scenario === "Base" &&
      guidancePeriod &&
      (marginExpansionBps < guidancePeriod.ebitdaMarginExpansionLowBps || marginExpansionBps > guidancePeriod.ebitdaMarginExpansionHighBps)
    ) {
      warnings.push({
        id: "lseg-margin-guidance",
        title: "2026 EBITDA margin expansion misses management guideposts",
        detail: "Base-case 2026 group EBITDA margin expansion should sit around 80 to 100 bps.",
        severity: "high",
      });
    }

    priorGroupMargin = adjustedEbitdaMargin;
  }

  return {
    scenario: assumptions.scenario,
    segmentRows,
    groupRows,
    warnings,
    marginBridge,
  };
}
