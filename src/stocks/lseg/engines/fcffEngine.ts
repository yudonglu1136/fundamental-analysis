import type {
  LsegCockpitDataset,
  LsegFcffDcfOutput,
  LsegForecastYear,
  LsegScenarioAssumption,
  LsegSegment,
  LsegValuationAssumptions,
} from "../types";
import { calculateLsegPostTradeSwapClearEconomicsEngine } from "./postTradeSwapClearEconomicsEngine";
import { getLatestAuditedLsegActual, resolveLsegValuationSemantics } from "./valuationSemantics";

function getLatestActual(data: LsegCockpitDataset) {
  return getLatestAuditedLsegActual(data);
}

export function calculateLsegFcffEngine(
  data: LsegCockpitDataset,
  scenario: LsegScenarioAssumption,
  assumptions: LsegValuationAssumptions,
): LsegFcffDcfOutput {
  const latest = getLatestActual(data);
  const semantics = resolveLsegValuationSemantics(data);
  const forecastStartYear = semantics.forecastStartYear;
  const suppressSameYearGrowth = semantics.dcfYearOneGrowthSuppressed;
  const forecastEndYear = forecastStartYear + 4;
  const postTradeEconomics = calculateLsegPostTradeSwapClearEconomicsEngine(data, scenario, assumptions, {
    forecastEndYear,
    wacc: scenario.wacc,
    terminalGrowth: scenario.terminalGrowth,
  });
  let priorRevenueBySegment = Object.fromEntries(data.segmentActuals.map((row) => [row.segment, row.revenue])) as Record<LsegSegment, number>;
  let priorTotalRevenue = data.segmentActuals.reduce((sum, row) => sum + row.revenue, 0);

  const forecast: LsegForecastYear[] = Array.from({ length: 5 }, (_, index) => {
    const year = forecastStartYear + index;
    const isSuppressedYearOne = suppressSameYearGrowth && index === 0;
    const revenueBySegment = Object.fromEntries(
      data.segmentActuals.map((row) => {
        const growth = scenario.revenueGrowthBySegment[row.segment] ?? 0;
        const fade = 1 - index * 0.08;
        const growthApplied = isSuppressedYearOne ? 0 : growth * Math.max(fade, 0.65);
        return [row.segment, priorRevenueBySegment[row.segment] * (1 + growthApplied)];
      }),
    ) as Record<LsegSegment, number>;
    const ebitdaBySegment = Object.fromEntries(
      data.segmentActuals.map((row) => {
        if (isSuppressedYearOne) {
          return [row.segment, row.adjustedEbitda];
        }
        const targetMargin = scenario.ebitdaMarginBySegment[row.segment] ?? row.margin;
        const margin = row.margin + (targetMargin - row.margin) * Math.min((index + 1) / 3, 1);
        return [row.segment, revenueBySegment[row.segment] * margin];
      }),
    ) as Record<LsegSegment, number>;
    const postTradeUplift = postTradeEconomics.annualUplifts.find((row) => row.year === year);
    const postTradeIncrementalEbitda = postTradeUplift?.incrementalEbitda ?? 0;
    if (postTradeIncrementalEbitda > 0) {
      ebitdaBySegment["Post Trade / LCH"] = (ebitdaBySegment["Post Trade / LCH"] ?? 0) + postTradeIncrementalEbitda;
    }

    const totalRevenue = Object.values(revenueBySegment).reduce((sum, value) => sum + value, 0);
    const adjustedEbitda = Object.values(ebitdaBySegment).reduce((sum, value) => sum + value, 0);
    const adjustedEbitdaMargin = adjustedEbitda / Math.max(totalRevenue, 1);
    const depreciationAmortisation = totalRevenue * assumptions.dAndAIntensity;
    const adjustedEbit = adjustedEbitda - depreciationAmortisation;
    const tax = adjustedEbit * assumptions.taxRate;
    const nopat = adjustedEbit - tax;
    const capex = totalRevenue * Math.max(assumptions.capexIntensity - index * 0.003, 0.08);
    const maintenanceCapex = capex * assumptions.maintenanceCapexPctCapex;
    const workingCapitalInvestment = Math.max(totalRevenue - priorTotalRevenue, 0) * assumptions.workingCapitalDragPctRevenueGrowth;
    const integrationCashCost = Math.max(assumptions.integrationCashCost * (1 - index * 0.22), 0);
    const postTradeIncrementalNopat = postTradeUplift?.incrementalNopat ?? 0;
    const postTradeIncrementalFcff = postTradeUplift?.incrementalFcff ?? 0;
    const postTradeFcffConversionAdjustment = postTradeIncrementalFcff - postTradeIncrementalNopat;
    const fcff = nopat + depreciationAmortisation - capex - workingCapitalInvestment - integrationCashCost + postTradeFcffConversionAdjustment;
    const fcffConversion = fcff / Math.max(adjustedEbitda, 1);

    priorRevenueBySegment = revenueBySegment;
    priorTotalRevenue = totalRevenue;

    return {
      year,
      valuationBase: index === 0 ? semantics.methodBases.dcf.valuationBase : `FY${year}E forecast growth from prior year`,
      sameYearGrowthSuppressed: isSuppressedYearOne,
      baseRevenueBeforeGrowth: priorTotalRevenue,
      growthApplied: totalRevenue / Math.max(priorTotalRevenue, 1) - 1,
      revenueBySegment,
      ebitdaBySegment,
      totalRevenue,
      adjustedEbitda,
      adjustedEbitdaMargin,
      depreciationAmortisation,
      adjustedEbit,
      tax,
      nopat,
      capex,
      maintenanceCapex,
      workingCapitalInvestment,
      integrationCashCost,
      fcff,
      fcffConversion,
      postTradeIncrementalEbitda,
      postTradeIncrementalFcff,
    };
  });

  const yearOneBeforeFixRevenue = data.segmentActuals.reduce((sum, row) => {
    const growth = scenario.revenueGrowthBySegment[row.segment] ?? 0;
    return sum + row.revenue * (1 + growth);
  }, 0);

  const discountFactors = forecast.map((_, index) => 1 / (1 + scenario.wacc) ** (index + 1));
  const presentValueFcff = forecast.reduce((sum, row, index) => sum + row.fcff * discountFactors[index], 0);
  const finalForecastYear = forecast[forecast.length - 1];
  const terminalBaseFcff = Math.max(finalForecastYear.fcff - finalForecastYear.postTradeIncrementalFcff, 0) * (1 + scenario.terminalGrowth);
  const baseTerminalValue = terminalBaseFcff / Math.max(scenario.wacc - scenario.terminalGrowth, 0.01);
  const postTradeTerminalValueAdjustment = postTradeEconomics.durationValue;
  const presentValueTerminalValue = baseTerminalValue * discountFactors[discountFactors.length - 1] + postTradeTerminalValueAdjustment;
  const terminalValue = baseTerminalValue + postTradeTerminalValueAdjustment / Math.max(discountFactors[discountFactors.length - 1], 0.001);
  const enterpriseValue = presentValueFcff + presentValueTerminalValue;
  const equityValue =
    enterpriseValue -
    assumptions.netDebt -
    assumptions.leaseLiabilities +
    assumptions.pensionSurplusDeficit +
    assumptions.associatesAndInvestments;

  return {
    scenario: scenario.scenario,
    valuationBase: semantics.methodBases.dcf,
    yearOneBaseAudit: {
      latestAuditedActualRevenue: semantics.auditedActualBase.revenue,
      eventRunRateRevenue: semantics.eventVisibleRunRate?.revenue ?? semantics.auditedActualBase.revenue,
      yearOneRevenueBeforeFix: suppressSameYearGrowth ? yearOneBeforeFixRevenue : forecast[0].totalRevenue,
      yearOneRevenueAfterFix: forecast[0].totalRevenue,
      impliedGrowthVsAuditedBeforeFix: yearOneBeforeFixRevenue / Math.max(semantics.auditedActualBase.revenue, 1) - 1,
      impliedGrowthVsAuditedAfterFix: forecast[0].totalRevenue / Math.max(semantics.auditedActualBase.revenue, 1) - 1,
      sameYearGrowthSuppressed: suppressSameYearGrowth,
      forecastStartYear: semantics.forecastStartYear,
      firstGrowthYear: semantics.firstGrowthYear,
    },
    forecast,
    revenueBridge: forecast.map((row, index) => ({
      year: row.year,
      totalRevenue: row.totalRevenue,
      growth: index === 0 ? row.totalRevenue / latest.totalIncomeExRecoveries - 1 : row.totalRevenue / forecast[index - 1].totalRevenue - 1,
    })),
    marginBridge: forecast.map((row) => ({
      year: row.year,
      adjustedEbitdaMargin: row.adjustedEbitdaMargin,
      adjustedEbitMargin: row.adjustedEbit / Math.max(row.totalRevenue, 1),
    })),
    discountFactors,
    presentValueFcff,
    terminalValue,
    presentValueTerminalValue,
    postTradeDurationValue: postTradeEconomics.durationValue,
    postTradeTerminalValueAdjustment,
    enterpriseValue,
    netDebt: assumptions.netDebt,
    leaseLiabilities: assumptions.leaseLiabilities,
    pensionSurplusDeficit: assumptions.pensionSurplusDeficit,
    associatesAndInvestments: assumptions.associatesAndInvestments,
    equityValue,
    dilutedShares: assumptions.dilutedShares,
    fairValuePerShare: equityValue / Math.max(assumptions.dilutedShares, 1),
    terminalValuePctOfEnterpriseValue: presentValueTerminalValue / Math.max(enterpriseValue, 1),
    averageFcffConversion: forecast.reduce((sum, row) => sum + row.fcffConversion, 0) / forecast.length,
  };
}
