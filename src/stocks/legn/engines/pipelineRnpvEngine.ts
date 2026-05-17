import type { LegnDataset, LegnPipelineRnpvOutput } from "../types";
import { discountFactor, evidenceMap, explain } from "./helpers";

function durationFactorForPhase(phase: string) {
  if (phase === "Phase 1") return 5.2;
  if (phase === "IIT / early POC") return 4.2;
  if (phase === "Preclinical" || phase === "Discovery") return 3.4;
  return 5.8;
}

function marginForAsset(assetName: string) {
  if (assetName.includes("LB2102")) return 0.12;
  if (assetName.includes("platform") || assetName.includes("In vivo")) return 0.22;
  if (assetName.includes("LUCAR")) return 0.24;
  return 0.27;
}

export function buildPipelineRnpvEngine(data: LegnDataset): LegnPipelineRnpvOutput {
  const evidenceById = evidenceMap(data.evidence);
  const assets = data.pipelineAssets
    .filter((asset) => !asset.assetName.startsWith("CARTITUDE"))
    .map((asset) => {
      const duration = durationFactorForPhase(asset.phase);
      const margin = marginForAsset(asset.assetName);
      const unadjustedNpv =
        (asset.estimatedPeakSales * margin * duration) / discountFactor(asset.estimatedLaunchYear, 2026, asset.discountRate) -
        asset.developmentCostRemaining;
      const probabilityAdjustedRnpv = Math.max(0, unadjustedNpv * asset.probabilityOfSuccess);
      return {
        ...asset,
        unadjustedPeakSales: asset.estimatedPeakSales,
        unadjustedNpv,
        probabilityAdjustedRnpv,
        valuePerAds: probabilityAdjustedRnpv / data.marketData.adsOutstandingM,
        sourceTrace: asset.sourceEvidenceIds.map((id) => evidenceById.get(id)?.sourceTitle ?? id),
      };
    });
  const totalRnpvUsdM = assets.reduce((sum, asset) => sum + asset.probabilityAdjustedRnpv, 0);

  return {
    assets,
    totalRnpvUsdM,
    valuePerAds: totalRnpvUsdM / data.marketData.adsOutstandingM,
    explainability: explain(
      "Pipeline value is asset-indication rNPV with stage-specific discount rates; peak sales, POS and launch years are research-only.",
      "rNPV = max(0, (peak sales x margin x duration / discount factor - remaining development cost) x POS)",
      Array.from(new Set(assets.flatMap((asset) => asset.sourceEvidenceIds))),
      [
        "Phase 1 solid tumor CAR-T uses 25-35% discount rates",
        "Preclinical and platform assets use 30-45% discount or option framing",
        "CARTITUDE label-expansion programs are excluded here and valued in label-expansion NAV",
      ],
    ),
  };
}
