import type { MetaDataset, MetaValuationAssumptions, MetaValuationAttribution } from "../model";
import { metaScenarioPresets } from "../assumptions";
import { calculateMetaForecastEngine } from "./forecastEngine";
import { calculateMetaValuationEngine } from "./valuationEngine";

function blendedValue(data: MetaDataset, assumptions: MetaValuationAssumptions) {
  const forecast = calculateMetaForecastEngine(data, assumptions);
  return calculateMetaValuationEngine(data, "Base", assumptions, forecast).blendedFairValue;
}

function oneFactorDelta(
  data: MetaDataset,
  from: MetaValuationAssumptions,
  to: MetaValuationAssumptions,
  keys: Array<keyof MetaValuationAssumptions>,
) {
  const baseValue = blendedValue(data, from);
  const next = { ...from };
  keys.forEach((key) => {
    (next as Record<string, number>)[key] = to[key];
  });
  return blendedValue(data, next) - baseValue;
}

export function calculateMetaValuationAttribution(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
): MetaValuationAttribution {
  const forecast = calculateMetaForecastEngine(data, assumptions);
  const valuation = calculateMetaValuationEngine(data, "Base", assumptions, forecast);
  const weights = valuation.finalWeights;
  const weightedDcf = valuation.dcf.fairValuePerShare * weights.dcf;
  const weightedFcfYield = valuation.fcfYieldFairValue * weights.fcfYield;
  const weightedPe = valuation.peFairValue * weights.pe;
  const weightedEvEbit = valuation.evEbitFairValue * weights.evEbit;
  const weightedSotp = valuation.sotpFairValue * weights.sotp;
  const bear = metaScenarioPresets.Bear;
  const bull = metaScenarioPresets.Bull;

  return {
    bridge: [
      { label: "DCF contribution", value: weightedDcf, type: "base", note: "FCFF after total capex, Reality Labs losses, and net cash." },
      { label: "FCF yield contribution", value: weightedFcfYield, type: "positive", note: "Normalized cash yield cross-check." },
      { label: "P/E contribution", value: weightedPe, type: "positive", note: "Forward EPS after share-count effects." },
      { label: "EV/EBIT contribution", value: weightedEvEbit, type: "positive", note: "Consolidated EBIT multiple cross-check." },
      { label: "SOTP contribution", value: weightedSotp, type: "positive", note: "FoA EBIT less RL drag plus RL option value." },
      { label: "Blended fair value", value: valuation.blendedFairValue, type: "total", note: "Weighted fair value per share." },
    ],
    bearToBase: [
      { driver: "Ad growth", fairValueDelta: oneFactorDelta(data, bear, assumptions, ["revenueGrowth2026", "revenueCagr2027To2030", "adImpressionCagr", "pricePerAdCagr", "aiRevenueUpliftPct", "regulatoryRevenueHaircut"]), note: "Revenue, pricing, inventory, AI monetization, and regulatory haircut." },
      { driver: "FoA margin", fairValueDelta: oneFactorDelta(data, bear, assumptions, ["foaOperatingMargin"]), note: "Core operating leverage in Family of Apps." },
      { driver: "Capex fade", fairValueDelta: oneFactorDelta(data, bear, assumptions, ["capex2026", "terminalCapexIntensity", "maintenanceCapexIntensity", "aiCapexShare"]), note: "Infrastructure intensity and AI growth capex assumptions." },
      { driver: "Reality Labs", fairValueDelta: oneFactorDelta(data, bear, assumptions, ["realityLabsAnnualLoss", "realityLabsRevenueGrowth", "realityLabsLossCagr", "realityLabsOptionValue"]), note: "Loss drag plus explicit SOTP option value." },
      { driver: "Valuation rates", fairValueDelta: oneFactorDelta(data, bear, assumptions, ["wacc", "terminalGrowth", "targetFcfYield", "targetPe", "targetEvEbit", "foaEbitMultiple"]), note: "Discount rate, terminal growth, and market multiple assumptions." },
    ],
    baseToBull: [
      { driver: "Ad growth", fairValueDelta: oneFactorDelta(data, assumptions, bull, ["revenueGrowth2026", "revenueCagr2027To2030", "adImpressionCagr", "pricePerAdCagr", "aiRevenueUpliftPct", "regulatoryRevenueHaircut"]), note: "Incremental upside from stronger monetization and lower regulatory leakage." },
      { driver: "FoA margin", fairValueDelta: oneFactorDelta(data, assumptions, bull, ["foaOperatingMargin"]), note: "Operating leverage upside." },
      { driver: "Capex fade", fairValueDelta: oneFactorDelta(data, assumptions, bull, ["capex2026", "terminalCapexIntensity", "maintenanceCapexIntensity", "aiCapexShare"]), note: "Better infrastructure utilization." },
      { driver: "Reality Labs", fairValueDelta: oneFactorDelta(data, assumptions, bull, ["realityLabsAnnualLoss", "realityLabsRevenueGrowth", "realityLabsLossCagr", "realityLabsOptionValue"]), note: "Smaller loss path and larger option value." },
      { driver: "Valuation rates", fairValueDelta: oneFactorDelta(data, assumptions, bull, ["wacc", "terminalGrowth", "targetFcfYield", "targetPe", "targetEvEbit", "foaEbitMultiple"]), note: "Multiple expansion and lower discount-rate case." },
    ],
  };
}
