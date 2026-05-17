import type { DgeDataset, DgeRegionalQualityOutput } from "../types";
import { average, clamp, scoreFromGrowth } from "./helpers";

export function buildDgeRegionalGrowthQualityEngine(data: DgeDataset): DgeRegionalQualityOutput {
  const currentRows = data.reportedData.regions.filter((row) => row.periodId === "q3-fy2026");
  const inventoryRows = data.reportedData.channelInventory.filter((row) => row.periodId === "q3-fy2026");

  const regionScores = currentRows.map((region) => {
    const inventory = inventoryRows.find((row) => row.region === region.region);
    const shipmentQuality = clamp(
      75 -
        Math.abs((inventory?.shipmentsGrowth ?? region.organicNetSalesGrowth) - (inventory?.depletionsGrowth ?? region.organicNetSalesGrowth)) * 350 -
        (inventory?.pullForward ?? 0) * 500 -
        (inventory?.restocking ?? 0) * 500,
    );
    const inventoryDistortion = clamp((inventory?.pullForward ?? 0) * 700 + (inventory?.restocking ?? 0) * 700 + (inventory?.destocking ?? 0) * 800);
    const consumerDemandQuality = clamp(scoreFromGrowth(inventory?.trueDemand ?? region.organicNetSalesGrowth, 0, 0.12) - inventoryDistortion * 0.18);
    const fxRisk =
      region.region === "Latin America & Caribbean" || region.region === "Africa" ? 65 : region.region === "Asia Pacific" ? 52 : 35;
    const priceMixQuality = region.priceMixGrowth == null ? 45 : scoreFromGrowth(region.priceMixGrowth, 0.01, 0.08);
    const volumeQuality = region.volumeGrowth == null ? 45 : scoreFromGrowth(region.volumeGrowth, 0, 0.1);
    const marginQuality = clamp(priceMixQuality * 0.45 + volumeQuality * 0.35 + (100 - inventoryDistortion) * 0.2);
    const sustainabilityScore = Math.round(
      clamp(consumerDemandQuality * 0.35 + shipmentQuality * 0.25 + marginQuality * 0.25 + (100 - fxRisk) * 0.15),
    );

    return {
      region: region.region,
      organicGrowth: region.organicNetSalesGrowth,
      volumeContribution: region.volumeGrowth,
      priceMixContribution: region.priceMixGrowth,
      shipmentQuality: Math.round(shipmentQuality),
      inventoryDistortion: Math.round(inventoryDistortion),
      consumerDemandQuality: Math.round(consumerDemandQuality),
      fxRisk,
      marginQuality: Math.round(marginQuality),
      sustainabilityScore,
      explanation:
        region.region === "North America"
          ? "Weak sales are split into true demand, depletions and channel destocking; this is the lowest-quality region in the current model."
          : region.region === "Latin America & Caribbean"
            ? "High reported growth is haircut for restocking, low base and World Cup pull-forward."
            : region.region === "Europe"
              ? "Growth is healthy but partly shipment-phased."
              : "Growth quality is scored from reported organic growth, volume/price mix and available inventory distortion evidence.",
      evidenceIds: region.sourceEvidenceIds,
    };
  });

  return {
    regionScores,
    aggregateScore: Math.round(average(regionScores.map((row) => row.sustainabilityScore))),
    warnings: [
      "Regional growth quality is not the same as reported organic growth.",
      "North America and LAC carry the largest inventory-distortion flags.",
      "Global Travel is not used as a group demand proxy.",
    ],
  };
}
