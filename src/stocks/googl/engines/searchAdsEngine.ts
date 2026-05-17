import type { GooglDataset, GooglSearchAdsOutput, GooglValuationAssumptions } from "../model";
import { annualizeIfQuarterly, clamp, getGooglPeriod, getGooglRevenueLine, safeDivide } from "./helpers";

export function calculateGooglSearchAdsEngine(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
): GooglSearchAdsOutput {
  const period = getGooglPeriod(data, periodId);
  const line = getGooglRevenueLine(data, periodId);
  const metrics = data.monetizationMetrics;
  const annualSearchRevenue = annualizeIfQuarterly(line.googleSearchOther, period);
  const annualYoutubeAdsRevenue = annualizeIfQuarterly(line.youtubeAds, period);
  const annualNetworkRevenue = annualizeIfQuarterly(line.googleNetwork, period);
  const annualAdvertisingRevenue = annualizeIfQuarterly(line.googleAdvertising, period);
  const q1TacRatio = period.id === "q1-26" ? safeDivide(15_228, line.googleAdvertising) : 0.205;
  const aiNetMonetization = assumptions.searchMonetizationChange - assumptions.searchAiCannibalization;
  const searchMoatScore = clamp(
    72 + metrics.googleSearchPaidClicksGrowth * 90 + metrics.googleSearchCostPerClickGrowth * 80 + aiNetMonetization * 220 - assumptions.regulatoryDiscount * 90,
    25,
    95,
  );
  const aiSearchBalanceScore = clamp(55 + assumptions.searchMonetizationChange * 900 - assumptions.searchAiCannibalization * 700 + assumptions.tpuEfficiencyBenefit * 120, 10, 95);
  const monetizationRisk = aiSearchBalanceScore < 45 || assumptions.searchAiCannibalization > 0.025 ? "High" : aiSearchBalanceScore < 60 ? "Medium" : "Low";

  return {
    searchRevenue: annualSearchRevenue,
    youtubeAdsRevenue: annualYoutubeAdsRevenue,
    networkRevenue: annualNetworkRevenue,
    advertisingRevenue: annualAdvertisingRevenue,
    searchGrowth: assumptions.searchRevenueCagr,
    youtubeGrowth: assumptions.youtubeRevenueCagr,
    paidClicksGrowth: metrics.googleSearchPaidClicksGrowth,
    cpcGrowth: metrics.googleSearchCostPerClickGrowth,
    tacRatio: q1TacRatio,
    searchMoatScore,
    aiSearchBalanceScore,
    monetizationRisk,
    bridge: [
      { label: "Search revenue base", value: annualSearchRevenue, type: "base" },
      { label: "AI query expansion", value: annualSearchRevenue * assumptions.searchRevenueCagr * 0.55, type: "positive" },
      { label: "Ads relevance / intent", value: annualSearchRevenue * Math.max(assumptions.searchMonetizationChange, 0), type: "positive" },
      { label: "AI answer cannibalization", value: -annualSearchRevenue * assumptions.searchAiCannibalization, type: "negative" },
      { label: "Regulatory / TAC drag", value: -annualSearchRevenue * assumptions.regulatoryDiscount * 0.16, type: "negative" },
      {
        label: "Scenario Search revenue",
        value:
          annualSearchRevenue *
          (1 + assumptions.searchRevenueCagr + assumptions.searchMonetizationChange - assumptions.searchAiCannibalization - assumptions.regulatoryDiscount * 0.16),
        type: "total",
      },
    ],
  };
}
