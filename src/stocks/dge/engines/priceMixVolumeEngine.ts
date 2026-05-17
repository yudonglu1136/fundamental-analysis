import type { DgeDataset, DgePriceMixVolumeOutput } from "../types";
import { clamp, evidenceList, scoreFromGrowth } from "./helpers";

export function buildDgePriceMixVolumeEngine(data: DgeDataset, periodId = data.currentPeriodId): DgePriceMixVolumeOutput {
  const period = data.periods.find((row) => row.id === periodId) ?? data.periods.find((row) => row.id === data.currentPeriodId) ?? data.periods[0];
  const inventoryRows = data.reportedData.channelInventory.filter((row) => row.periodId === periodId);
  const inventoryDistortion = inventoryRows.reduce((sum, row) => sum + row.pullForward + row.restocking - row.destocking, 0);
  const organic = period.organicNetSalesGrowth;
  const volume = period.volumeGrowth ?? 0;
  const priceMix = period.priceMixGrowth ?? organic - volume;
  const fx = period.fxImpactPct ?? 0;
  const disposals = period.disposalsImpactPct ?? 0;
  const promotion = inventoryRows.reduce((sum, row) => sum + row.promotionalLoading, 0);
  const negativeMixDrivers = [
    ...(priceMix < 0 ? ["Negative price/mix signals promotion, channel mix or downtrading pressure."] : []),
    ...(volume < 0 ? ["Volume is negative, so revenue quality is not volume-led."] : []),
    ...(inventoryDistortion > 0.03 ? ["Inventory restocking/pull-forward inflates shipments relative to clean demand."] : []),
  ];
  const priceMixQuality = Math.round(clamp(scoreFromGrowth(priceMix, 0.01, 0.08) - promotion * 500));
  const volumeQuality = Math.round(clamp(scoreFromGrowth(volume, 0, 0.1) - Math.max(inventoryDistortion, 0) * 250));
  const promotionalIntensity = Math.round(clamp(promotion * 1_000 + data.reportedData.brands.reduce((sum, row) => sum + row.promotionalIntensity, 0) / data.reportedData.brands.length * 0.45));
  const downtradingSignal = Math.round(clamp((priceMix < 0 ? 55 : 25) + data.reportedData.categories.reduce((sum, row) => sum + row.affordabilityPressure, 0) / data.reportedData.categories.length * 0.45));
  const pricingPowerScore = Math.round(clamp(priceMixQuality * 0.55 + (100 - downtradingSignal) * 0.45));

  return {
    organicNetSalesBridge: [
      { label: "Reported organic growth", value: organic, type: "base" },
      { label: "Volume", value: volume, type: volume >= 0 ? "positive" : "negative" },
      { label: "Price / mix", value: priceMix, type: priceMix >= 0 ? "positive" : "negative" },
      { label: "FX", value: fx, type: fx >= 0 ? "positive" : "negative" },
      { label: "Disposals", value: disposals, type: disposals >= 0 ? "positive" : "negative" },
      { label: "Inventory distortion", value: inventoryDistortion, type: inventoryDistortion >= 0 ? "positive" : "negative" },
      { label: "Quality-adjusted growth", value: organic - Math.max(inventoryDistortion, 0), type: "total" },
    ],
    priceMixQuality,
    volumeQuality,
    negativeMixDrivers,
    promotionalIntensity,
    downtradingSignal,
    pricingPowerScore,
    evidenceIds: evidenceList(period.sourceEvidenceIds, ...inventoryRows.map((row) => row.sourceEvidenceIds)),
    warnings: [
      "Organic growth, reported growth, FX and disposal impacts are displayed separately.",
      "Price/mix-led growth with negative volume is penalized.",
      ...(negativeMixDrivers.length > 0 ? negativeMixDrivers[0] : "Volume and price/mix are currently balanced enough to avoid a severe quality penalty."),
    ],
  };
}
