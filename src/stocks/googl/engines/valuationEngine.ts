import { buildSensitivityTable } from "../../../utils/chartHelpers";
import type {
  GooglCapitalReturnOutput,
  GooglCloudOutput,
  GooglDataset,
  GooglDcfOutput,
  GooglForecastYear,
  GooglOtherBetsOutput,
  GooglSearchAdsOutput,
  GooglValuationAssumptions,
  GooglValuationEngineOutput,
} from "../model";
import { annualizeIfQuarterly, clamp, getGooglPeriod, getGooglRevenueLine, getGooglSegment, normalizedWeightMap, perShare, safeDivide } from "./helpers";

function buildForecast(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
): GooglForecastYear[] {
  const period = getGooglPeriod(data, periodId);
  const line = getGooglRevenueLine(data, periodId);
  const servicesSegment = getGooglSegment(data, periodId, "Google Services");
  const otherBetsSegment = getGooglSegment(data, periodId, "Other Bets");
  const servicesMargin = safeDivide(servicesSegment.operatingIncome, servicesSegment.revenue);
  const latestTotalRevenue = annualizeIfQuarterly(period.totalRevenue, period);
  const searchBase = annualizeIfQuarterly(line.googleSearchOther, period);
  const youtubeBase = annualizeIfQuarterly(line.youtubeAds, period);
  const subscriptionsBase = annualizeIfQuarterly(line.googleSubscriptionsPlatformsDevices, period);
  const networkBase = annualizeIfQuarterly(line.googleNetwork, period);
  const cloudBase = annualizeIfQuarterly(line.googleCloud, period);
  const otherBetsBase = annualizeIfQuarterly(otherBetsSegment.revenue, period);
  const networkDecline = -0.02;
  let priorRevenue = latestTotalRevenue;

  return Array.from({ length: 7 }, (_, idx) => {
    const year = 2026 + idx;
    const yearIndex = idx + 1;
    const searchRevenue = searchBase * (1 + assumptions.searchRevenueCagr + assumptions.searchMonetizationChange - assumptions.searchAiCannibalization) ** yearIndex;
    const youtubeAdsRevenue = youtubeBase * (1 + assumptions.youtubeRevenueCagr) ** yearIndex;
    const subscriptionsRevenue = subscriptionsBase * (1 + assumptions.subscriptionsRevenueCagr) ** yearIndex;
    const networkRevenue = networkBase * (1 + networkDecline) ** yearIndex;
    const cloudRevenue = cloudBase * (1 + assumptions.cloudRevenueCagr) ** yearIndex;
    const otherBetsRevenue = otherBetsBase * (1 + 0.12) ** yearIndex;
    const hedging = 0;
    const servicesRevenue = searchRevenue + youtubeAdsRevenue + subscriptionsRevenue + networkRevenue;
    const totalRevenue = servicesRevenue + cloudRevenue + otherBetsRevenue + hedging;
    const serviceMargin = clamp(servicesMargin - assumptions.regulatoryDiscount * 0.16 - assumptions.searchAiCannibalization * 0.2 + assumptions.tpuEfficiencyBenefit * 0.08, 0.34, 0.48);
    const cloudMargin = clamp(assumptions.cloudTerminalMargin - (idx < 2 ? 0.035 : 0) + assumptions.tpuEfficiencyBenefit * 0.15 - assumptions.aiComputeConstraint * 0.02, 0.18, 0.42);
    const otherBetsLoss = Math.min(-1_500, -Math.abs(otherBetsRevenue * 0.8));
    const alphabetLevelCost = -totalRevenue * clamp(0.035 + assumptions.capexIntensity * 0.03, 0.035, 0.055);
    const operatingIncome = servicesRevenue * serviceMargin + cloudRevenue * cloudMargin + otherBetsLoss + alphabetLevelCost;
    const nopat = operatingIncome * (1 - assumptions.taxRate);
    const depreciation = totalRevenue * assumptions.dAndAIntensity;
    const capex = totalRevenue * assumptions.capexIntensity;
    const workingCapitalInvestment = Math.max(totalRevenue - priorRevenue, 0) * assumptions.workingCapitalPctRevenueGrowth;
    const unleveredFreeCashFlow = nopat + depreciation - capex - workingCapitalInvestment;
    priorRevenue = totalRevenue;
    return {
      year,
      servicesRevenue,
      searchRevenue,
      youtubeAdsRevenue,
      subscriptionsRevenue,
      cloudRevenue,
      otherBetsRevenue,
      totalRevenue,
      operatingIncome,
      nopat,
      depreciation,
      capex,
      workingCapitalInvestment,
      unleveredFreeCashFlow,
      freeCashFlowMargin: safeDivide(unleveredFreeCashFlow, totalRevenue),
    };
  });
}

function calculateDcf(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
): GooglDcfOutput {
  const forecast = buildForecast(data, periodId, assumptions);
  const presentValueCashFlows = forecast.reduce(
    (sum, year, idx) => sum + year.unleveredFreeCashFlow / (1 + assumptions.wacc) ** (idx + 1),
    0,
  );
  const terminalFcf = forecast[forecast.length - 1].unleveredFreeCashFlow * (1 + assumptions.terminalGrowth);
  const terminalValue =
    assumptions.wacc > assumptions.terminalGrowth
      ? terminalFcf / (assumptions.wacc - assumptions.terminalGrowth)
      : terminalFcf * 18;
  const presentValueTerminalValue = terminalValue / (1 + assumptions.wacc) ** forecast.length;
  const enterpriseValue = presentValueCashFlows + presentValueTerminalValue;
  const equityValue = enterpriseValue + assumptions.netCash;
  const fairValuePerShare = perShare(equityValue, assumptions.dilutedShares);
  return {
    forecast,
    presentValueCashFlows,
    terminalValue,
    presentValueTerminalValue,
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    terminalValueShareOfEv: safeDivide(presentValueTerminalValue, enterpriseValue),
  };
}

export function calculateGooglValuationEngine(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
  context: {
    search: GooglSearchAdsOutput;
    cloud: GooglCloudOutput;
    otherBets: GooglOtherBetsOutput;
    capitalReturn: GooglCapitalReturnOutput;
  },
): GooglValuationEngineOutput {
  const period = getGooglPeriod(data, periodId);
  const line = getGooglRevenueLine(data, periodId);
  const dcf = calculateDcf(data, periodId, assumptions);
  const annualRevenue = annualizeIfQuarterly(period.totalRevenue, period);
  const normalizedFcf = Math.max(period.ttmFreeCashFlow ?? annualizeIfQuarterly(period.freeCashFlow, period), annualRevenue * assumptions.fcfMargin);
  const fcfYieldFairValue = perShare(normalizedFcf, assumptions.dilutedShares) / assumptions.targetFcfYield;
  const nextYearOperatingIncome = dcf.forecast[0].operatingIncome;
  const evEbitFairValue = perShare(nextYearOperatingIncome * assumptions.targetEvEbit + assumptions.netCash, assumptions.dilutedShares);
  const normalizedNetIncome = Math.max(period.netIncome && period.periodType === "annual" ? period.netIncome : nextYearOperatingIncome * (1 - assumptions.taxRate), nextYearOperatingIncome * (1 - assumptions.taxRate));
  const peFairValue = perShare(normalizedNetIncome, assumptions.dilutedShares) * assumptions.targetPe;
  const servicesSegment = getGooglSegment(data, periodId, "Google Services");
  const servicesMargin = safeDivide(servicesSegment.operatingIncome, servicesSegment.revenue);
  const servicesRevenue = annualizeIfQuarterly(line.googleServicesTotal, period);
  const servicesOperatingValue = servicesRevenue * clamp(servicesMargin - assumptions.regulatoryDiscount * 0.18, 0.32, 0.48) * (1 - assumptions.taxRate) * assumptions.servicesMultiple;
  const cloudValue = context.cloud.revenue * assumptions.cloudTerminalMargin * assumptions.cloudMultiple;
  const networkAndSubscriptionsMoatCredit = annualizeIfQuarterly(line.googleSubscriptionsPlatformsDevices, period) * assumptions.subscriptionsRevenueCagr * 1.8;
  const otherBetsOption = context.otherBets.optionValuePerShare * assumptions.dilutedShares;
  const rawSotpValue = servicesOperatingValue + cloudValue + networkAndSubscriptionsMoatCredit + otherBetsOption + assumptions.netCash;
  const aiTpuCapexAdjustment = clamp(
    perShare(
      context.cloud.revenue * assumptions.tpuEfficiencyBenefit * assumptions.cloudMultiple * 0.35 -
        annualRevenue * Math.max(assumptions.capexIntensity - 0.22, 0) * 1.2 -
        annualRevenue * assumptions.aiComputeConstraint * 0.015,
      assumptions.dilutedShares,
    ),
    -assumptions.currentPrice * 0.08,
    assumptions.currentPrice * 0.08,
  );
  const regulatoryAdjustedSotp = perShare(rawSotpValue, assumptions.dilutedShares) * (1 - assumptions.regulatoryDiscount) + aiTpuCapexAdjustment;
  const weights = normalizedWeightMap({
    dcf: assumptions.weightDcf,
    fcfYield: assumptions.weightFcfYield,
    evEbit: assumptions.weightEvEbit,
    pe: assumptions.weightPe,
    sotp: assumptions.weightSotp,
  });
  const blendedFairValue =
    dcf.fairValuePerShare * weights.dcf +
    fcfYieldFairValue * weights.fcfYield +
    evEbitFairValue * weights.evEbit +
    peFairValue * weights.pe +
    regulatoryAdjustedSotp * weights.sotp;
  const valuationRangeLow = Math.min(dcf.fairValuePerShare, fcfYieldFairValue, evEbitFairValue, peFairValue, regulatoryAdjustedSotp);
  const valuationRangeHigh = Math.max(dcf.fairValuePerShare, fcfYieldFairValue, evEbitFairValue, peFairValue, regulatoryAdjustedSotp);
  const methodWarnings = [];
  if (dcf.terminalValueShareOfEv > 0.75) {
    methodWarnings.push({
      id: "googl-terminal-value-heavy",
      title: "DCF terminal value is high",
      detail: `Terminal value is ${(dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV, so WACC and terminal growth dominate the DCF.`,
      severity: "medium" as const,
    });
  }
  if (assumptions.capexIntensity > assumptions.fcfMargin + 0.08) {
    methodWarnings.push({
      id: "googl-capex-fcf-gap",
      title: "CapEx intensity exceeds modeled FCF margin",
      detail: "AI infrastructure investment is materially above modeled FCF conversion; valuation depends on later utilization and depreciation absorption.",
      severity: "medium" as const,
    });
  }
  if (context.search.monetizationRisk === "High") {
    methodWarnings.push({
      id: "googl-search-ai-monetization-risk",
      title: "Search AI monetization risk is high",
      detail: "AI answer cannibalization exceeds monetization uplift in the selected assumptions.",
      severity: "high" as const,
    });
  }

  return {
    dcf,
    fcfYieldFairValue,
    evEbitFairValue,
    peFairValue,
    sotpFairValue: regulatoryAdjustedSotp,
    aiTpuCapexAdjustment,
    regulatoryAdjustedSotp,
    blendedFairValue,
    valuationRangeLow,
    valuationRangeHigh,
    probabilityWeightedFairValue: blendedFairValue * 0.55 + valuationRangeLow * 0.2 + valuationRangeHigh * 0.25,
    weights,
    finalWeights: weights,
    methodWarnings,
    sotpBreakdown: [
      { label: "Google Services", value: perShare(servicesOperatingValue, assumptions.dilutedShares), sourceType: "derived", note: "Search, YouTube, Network, subscriptions and devices operating-income value." },
      { label: "Google Cloud", value: perShare(cloudValue, assumptions.dilutedShares), sourceType: "derived", note: "Cloud revenue times terminal margin and Cloud multiple." },
      { label: "Subscriptions moat credit", value: perShare(networkAndSubscriptionsMoatCredit, assumptions.dilutedShares), sourceType: "forecast_assumption", note: "Capped cross-check for YouTube/Google One subscription growth." },
      { label: "Other Bets", value: context.otherBets.optionValuePerShare, sourceType: "research_only", note: "Capped option value anchored to Waymo scale, not a full standalone valuation." },
      { label: "Net cash", value: context.capitalReturn.netCashPerShare, sourceType: "official_actual", note: "Cash and marketable securities less long-term debt." },
      { label: "Regulatory / TPU adjustment", value: regulatoryAdjustedSotp - perShare(rawSotpValue, assumptions.dilutedShares), sourceType: "forecast_assumption", note: "Regulatory discount plus capped TPU/CapEx adjustment." },
    ],
  };
}

export function buildGooglSensitivityTables(
  assumptions: GooglValuationAssumptions,
  valuation: GooglValuationEngineOutput,
) {
  return [
    {
      title: "Search CAGR x AI Cannibalization",
      table: buildSensitivityTable(
        "Search CAGR",
        "AI cannibalization",
        [assumptions.searchRevenueCagr - 0.02, assumptions.searchRevenueCagr, assumptions.searchRevenueCagr + 0.02],
        [Math.max(0, assumptions.searchAiCannibalization - 0.01), assumptions.searchAiCannibalization, assumptions.searchAiCannibalization + 0.01],
        (growth, cannibalization) => valuation.blendedFairValue * (1 + (growth - assumptions.searchRevenueCagr) * 1.8 - (cannibalization - assumptions.searchAiCannibalization) * 2.2),
      ),
    },
    {
      title: "Cloud Margin x Cloud Multiple",
      table: buildSensitivityTable(
        "Cloud margin",
        "Cloud multiple",
        [assumptions.cloudTerminalMargin - 0.04, assumptions.cloudTerminalMargin, assumptions.cloudTerminalMargin + 0.04],
        [assumptions.cloudMultiple - 4, assumptions.cloudMultiple, assumptions.cloudMultiple + 4],
        (margin, multiple) => valuation.sotpFairValue + (margin - assumptions.cloudTerminalMargin) * 220 + (multiple - assumptions.cloudMultiple) * 3.5,
      ),
    },
    {
      title: "WACC x Terminal Growth",
      table: buildSensitivityTable(
        "WACC",
        "Terminal growth",
        [assumptions.wacc - 0.01, assumptions.wacc, assumptions.wacc + 0.01],
        [assumptions.terminalGrowth - 0.005, assumptions.terminalGrowth, assumptions.terminalGrowth + 0.005],
        (wacc, terminalGrowth) => valuation.dcf.fairValuePerShare * (1 - (wacc - assumptions.wacc) * 8 + (terminalGrowth - assumptions.terminalGrowth) * 9),
      ),
    },
    {
      title: "CapEx Intensity x TPU Benefit",
      table: buildSensitivityTable(
        "CapEx intensity",
        "TPU benefit",
        [assumptions.capexIntensity - 0.03, assumptions.capexIntensity, assumptions.capexIntensity + 0.03],
        [Math.max(0, assumptions.tpuEfficiencyBenefit - 0.015), assumptions.tpuEfficiencyBenefit, assumptions.tpuEfficiencyBenefit + 0.015],
        (capexIntensity, tpuBenefit) => valuation.blendedFairValue * (1 - (capexIntensity - assumptions.capexIntensity) * 1.4 + (tpuBenefit - assumptions.tpuEfficiencyBenefit) * 2.4),
      ),
    },
  ];
}
