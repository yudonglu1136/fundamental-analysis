import type { MetaAdEconomicsOutput, MetaDataset, MetaValuationAssumptions } from "../model";
import { safeRatio } from "./helpers";

export function calculateMetaAdEconomicsEngine(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
): MetaAdEconomicsOutput {
  const latestActual = data.adEconomics.find((item) => item.periodId === data.latestReportingPeriod) ?? data.adEconomics[data.adEconomics.length - 1];
  const priorActual = data.adEconomics.find((item) => item.periodId === "fy2025") ?? data.adEconomics[0];
  const impliedAdRevenueGrowth = (1 + latestActual.adImpressionsGrowth) * (1 + latestActual.averagePricePerAdGrowth) - 1;
  const reconciliationGap = Math.abs((latestActual.adRevenueGrowth ?? impliedAdRevenueGrowth) - impliedAdRevenueGrowth);
  const forecastBridgeGrowth = (1 + assumptions.adImpressionCagr) * (1 + assumptions.pricePerAdCagr) - 1;
  const impliedForecastAdRevenue = priorActual.advertisingRevenue * (1 + forecastBridgeGrowth);
  const driverForecast = data.adEconomics.map((point) => ({
    year: point.periodId === "fy2025" ? 2025 : 2026,
    baseAdvertisingRevenue: point.periodId === "fy2025" ? point.advertisingRevenue / (1 + (point.adRevenueGrowth ?? 0.01)) : priorActual.advertisingRevenue,
    impressionContribution: point.advertisingRevenue * point.adImpressionsGrowth,
    priceContribution: point.advertisingRevenue * point.averagePricePerAdGrowth,
    aiMonetizationContribution: point.periodId === data.latestReportingPeriod ? point.advertisingRevenue * assumptions.aiRevenueUpliftPct * 0.35 : 0,
    regulatoryHaircut: point.periodId === data.latestReportingPeriod ? -point.advertisingRevenue * assumptions.regulatoryRevenueHaircut : 0,
    mixFxResidual: (point.adRevenueGrowth ?? impliedAdRevenueGrowth) - impliedAdRevenueGrowth,
    forecastAdvertisingRevenue: point.advertisingRevenue,
  }));

  const notes = [
    "Advertising revenue is explained through impression growth and average price per ad, not through a generic feature score.",
    "AI product commentary maps to price-per-ad, conversion, margin, and capex-payback assumptions before entering valuation.",
    "Regulatory pressure is modeled as a revenue-driver haircut, not as a separate narrative score.",
  ];

  if (reconciliationGap > 0.05) {
    notes.push("Reported ad revenue growth does not fully reconcile to impression x price growth; FX, mix, or rounding should be reviewed.");
  }

  return {
    latestActual,
    revenueBridge: [
      { label: "FY2025 ad revenue", value: priorActual.advertisingRevenue, type: "base" },
      { label: "Impression growth", value: priorActual.advertisingRevenue * assumptions.adImpressionCagr, type: "positive" },
      { label: "Price / ad growth", value: priorActual.advertisingRevenue * assumptions.pricePerAdCagr, type: assumptions.pricePerAdCagr >= 0 ? "positive" : "negative" },
      { label: "AI monetization", value: priorActual.advertisingRevenue * assumptions.aiRevenueUpliftPct * 0.75, type: "positive" },
      { label: "Regulatory haircut", value: -priorActual.advertisingRevenue * assumptions.regulatoryRevenueHaircut, type: "negative" },
      {
        label: "Cross effect / mix",
        value: impliedForecastAdRevenue
          - priorActual.advertisingRevenue
          - (priorActual.advertisingRevenue * assumptions.adImpressionCagr)
          - (priorActual.advertisingRevenue * assumptions.pricePerAdCagr)
          - (priorActual.advertisingRevenue * assumptions.aiRevenueUpliftPct * 0.75)
          + (priorActual.advertisingRevenue * assumptions.regulatoryRevenueHaircut),
        type: "positive",
      },
      { label: "Bridge output", value: impliedForecastAdRevenue, type: "total" },
    ],
    attributionBridge: driverForecast,
    productDriverMap: data.productSignals.map((signal) => ({
      signal: signal.metric,
      product: signal.product,
      valuationDriver:
        signal.valuationMapping === "ad_inventory" ? "adImpressionCagr"
          : signal.valuationMapping === "pricing_power" ? "pricePerAdCagr"
            : signal.valuationMapping === "ai_monetization" ? "aiRevenueUpliftPct"
              : signal.valuationMapping === "rl_option" ? "realityLabsOptionValue"
                : "risk monitor",
      treatment: signal.lineage.valuationTreatment,
      confidence: signal.lineage.confidence,
    })),
    sensitivities: [
      { driver: "Price per ad", shock: "-100 bps CAGR", fairValueRisk: "Hits revenue, FoA margin, P/E and EV/EBIT simultaneously.", modelKey: "pricePerAdCagr" },
      { driver: "Ad impressions", shock: "-200 bps CAGR", fairValueRisk: "Tests whether engagement growth converts into monetizable inventory.", modelKey: "adImpressionCagr" },
      { driver: "Regulatory haircut", shock: "+200 bps revenue haircut", fairValueRisk: "Captures EU/privacy disruption through the ad revenue bridge.", modelKey: "regulatoryRevenueHaircut" },
      { driver: "AI monetization", shock: "-300 bps uplift", fairValueRisk: "Tests whether AI products fund infrastructure spend.", modelKey: "aiRevenueUpliftPct" },
    ],
    impliedAdRevenueGrowth,
    reconciliationGap,
    monetizationSignal: safeRatio(latestActual.averagePricePerAdGrowth, Math.max(latestActual.adImpressionsGrowth, 0.01)) > 0.45 ? "Positive" : "Neutral",
    notes,
  };
}
