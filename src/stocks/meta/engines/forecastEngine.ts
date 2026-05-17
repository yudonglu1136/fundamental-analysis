import type { MetaDataset, MetaForecastYear, MetaValuationAssumptions } from "../model";
import { clamp, getSegment, safeRatio } from "./helpers";

export function calculateMetaForecastEngine(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
): MetaForecastYear[] {
  const fy2025 = data.periods.find((period) => period.id === "fy2025") ?? data.periods[0];
  const foa2025 = getSegment(data, "fy2025", "Family of Apps");
  const rl2025 = getSegment(data, "fy2025", "Reality Labs");
  const forecast: MetaForecastYear[] = [];

  let priorRevenue = fy2025.revenue;
  let priorAdvertisingRevenue = data.adEconomics.find((item) => item.periodId === "fy2025")?.advertisingRevenue ?? foa2025.revenue;
  let priorShares = assumptions.dilutedShares;
  let cumulativeAiGrowthCapex = 0;
  const q1Actual = data.periods.find((period) => period.id === "q1_2026");
  const q2Guide = data.guidance.find((item) => item.id === "q2-2026-revenue-guide");
  const q2GuidanceMidpoint = ((q2Guide?.revenueLow ?? 0) + (q2Guide?.revenueHigh ?? 0)) / 2;

  for (let index = 0; index < 5; index += 1) {
    const year = 2026 + index;
    const revenueGrowth = index === 0
      ? assumptions.revenueGrowth2026
      : Math.max(assumptions.revenueCagr2027To2030 - index * 0.006, 0.025);
    const topDownRevenue = priorRevenue * (1 + revenueGrowth);
    const q1Revenue = q1Actual?.revenue ?? 0;
    const h2Implied = index === 0 ? Math.max(topDownRevenue - q1Revenue - q2GuidanceMidpoint, 0) : 0;
    const revenue = index === 0 && q1Revenue > 0 && q2GuidanceMidpoint > 0
      ? q1Revenue + q2GuidanceMidpoint + h2Implied
      : topDownRevenue;
    const revenueBridge = index === 0
      ? {
        q1Actual: q1Revenue,
        q2GuidanceMidpoint,
        h2Implied,
        h2ImpliedQuarterlyAverage: h2Implied / 2,
        q2GuidanceRangeLow: q2Guide?.revenueLow,
        q2GuidanceRangeHigh: q2Guide?.revenueHigh,
        yearOneRevenueGrowth: safeRatio(revenue, fy2025.revenue) - 1,
        h2SequentialStepUpVsQ2: safeRatio(h2Implied / 2, Math.max(q2GuidanceMidpoint, 0.01)) - 1,
      }
      : undefined;
    const realityLabsRevenue = rl2025.revenue * (1 + assumptions.realityLabsRevenueGrowth) ** (index + 1);
    const familyOfAppsRevenue = Math.max(revenue - realityLabsRevenue, 0);
    const adImpressionGrowth = Math.max(assumptions.adImpressionCagr - index * 0.012, 0.025);
    const pricePerAdGrowth = Math.max(assumptions.pricePerAdCagr - index * 0.004, -0.015);
    const impressionContribution = priorAdvertisingRevenue * adImpressionGrowth;
    const priceContribution = priorAdvertisingRevenue * pricePerAdGrowth;
    const crossEffect = priorAdvertisingRevenue * adImpressionGrowth * pricePerAdGrowth;
    const aiMonetizationContribution = priorAdvertisingRevenue * assumptions.aiRevenueUpliftPct * Math.max(0.75 - index * 0.1, 0.25);
    const regulatoryHaircut = -priorAdvertisingRevenue * assumptions.regulatoryRevenueHaircut * Math.max(1 - index * 0.08, 0.65);
    const driverAdvertisingRevenue = priorAdvertisingRevenue
      + impressionContribution
      + priceContribution
      + crossEffect
      + aiMonetizationContribution
      + regulatoryHaircut;
    const advertisingRevenue = Math.min(familyOfAppsRevenue * 0.995, Math.max(driverAdvertisingRevenue, priorAdvertisingRevenue * 0.9));
    const mixFxResidual = advertisingRevenue - driverAdvertisingRevenue;
    const familyOfAppsOtherRevenue = Math.max(familyOfAppsRevenue - advertisingRevenue, 0);

    const familyOfAppsOperatingIncome = familyOfAppsRevenue * assumptions.foaOperatingMargin;
    const realityLabsOperatingIncome = -Math.max(0, assumptions.realityLabsAnnualLoss * (1 + assumptions.realityLabsLossCagr) ** index);
    const operatingIncome = familyOfAppsOperatingIncome + realityLabsOperatingIncome;
    const operatingMargin = safeRatio(operatingIncome, revenue);
    const nopat = operatingIncome * (1 - assumptions.taxRate);
    const depreciationAndAmortization = revenue * assumptions.depreciationSalesIntensity;

    const targetCapexIntensity = assumptions.terminalCapexIntensity;
    const startingCapexIntensity = safeRatio(assumptions.capex2026, Math.max(revenue, 1));
    const fadeRatio = index / 4;
    const capexIntensity = index === 0
      ? startingCapexIntensity
      : startingCapexIntensity + (targetCapexIntensity - startingCapexIntensity) * fadeRatio;
    const capitalExpenditures = index === 0 ? assumptions.capex2026 : revenue * capexIntensity;
    const workingCapitalInvestment = Math.max(0, revenue - priorRevenue) * assumptions.workingCapitalDragPctRevenueGrowth;
    const unleveredFreeCashFlow = nopat + depreciationAndAmortization - capitalExpenditures - workingCapitalInvestment;

    const netIncome = (operatingIncome + assumptions.netInterestIncome) * (1 - assumptions.taxRate);
    const shareBasedCompensation = revenue * assumptions.sbcExpensePctRevenue;
    const buybackSpend = assumptions.buybackSpend2026 * (1 + Math.max(revenueGrowth, 0)) ** index;
    const buybackShareReduction = Math.min(
      assumptions.buybackYield,
      safeRatio(buybackSpend, Math.max(assumptions.currentPrice * priorShares, 0.01)),
    );
    const grossSbcDilution = assumptions.annualDilutionFromSbc;
    const dilutedShares = priorShares * (1 + grossSbcDilution - buybackShareReduction);
    const eps = safeRatio(netIncome, dilutedShares);
    const fcfPerShare = safeRatio(unleveredFreeCashFlow, dilutedShares);

    const aiIncrementalRevenue = Math.max(aiMonetizationContribution, advertisingRevenue * assumptions.aiRevenueUpliftPct * 0.3);
    const aiIncrementalAfterTaxProfit = aiIncrementalRevenue * assumptions.aiIncrementalMargin * (1 - assumptions.taxRate);
    const maintenanceCapex = revenue * assumptions.maintenanceCapexIntensity;
    const aiGrowthCapex = Math.max(0, capitalExpenditures - maintenanceCapex) * assumptions.aiCapexShare;
    cumulativeAiGrowthCapex += aiGrowthCapex;
    const aiPaybackYears = safeRatio(cumulativeAiGrowthCapex, Math.max(aiIncrementalAfterTaxProfit, 0.01));
    const aiRoic = safeRatio(aiIncrementalAfterTaxProfit, Math.max(cumulativeAiGrowthCapex, 0.01));

    forecast.push({
      year,
      revenueBridge,
      adDriverAttribution: {
        year,
        baseAdvertisingRevenue: priorAdvertisingRevenue,
        impressionContribution,
        priceContribution,
        aiMonetizationContribution,
        regulatoryHaircut,
        mixFxResidual,
        forecastAdvertisingRevenue: advertisingRevenue,
      },
      revenue,
      familyOfAppsRevenue,
      advertisingRevenue,
      familyOfAppsOtherRevenue,
      realityLabsRevenue,
      familyOfAppsOperatingIncome,
      realityLabsOperatingIncome,
      operatingIncome,
      operatingMargin,
      nopat,
      depreciationAndAmortization,
      capitalExpenditures,
      capexIntensity: clamp(capexIntensity, 0, 1),
      workingCapitalInvestment,
      unleveredFreeCashFlow,
      netIncome,
      shareBasedCompensation,
      buybackSpend,
      grossSbcDilution,
      buybackShareReduction,
      dilutedShares,
      eps,
      fcfPerShare,
      aiIncrementalRevenue,
      aiIncrementalAfterTaxProfit,
      aiGrowthCapex,
      cumulativeAiGrowthCapex,
      aiPaybackYears,
      aiRoic,
    });

    priorRevenue = revenue;
    priorAdvertisingRevenue = advertisingRevenue;
    priorShares = dilutedShares;
  }

  return forecast;
}
