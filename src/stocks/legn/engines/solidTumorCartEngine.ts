import type { Scenario } from "../../types";
import type { LegnDataset, LegnSolidTumorCartOutput } from "../types";
import { explain, scenarioMultiplier } from "./helpers";

export function buildSolidTumorCartEngine(data: LegnDataset, scenario: Scenario): LegnSolidTumorCartOutput {
  const solidAssets = data.pipelineAssets.filter(
    (asset) => asset.assetName.includes("LB1908") || asset.assetName.includes("LB2102") || asset.assetName.includes("GCC"),
  );
  const scenarioUpside = scenarioMultiplier(scenario, 0.65, 1, 1.45);
  const assets = solidAssets.map((asset) => {
    const isLb1908 = asset.assetName.includes("LB1908");
    const isLb2102 = asset.assetName.includes("LB2102");
    const scientificRiskScore = isLb1908 ? 76 : isLb2102 ? 82 : 90;
    const targetValidationScore = isLb1908 ? 55 : isLb2102 ? 48 : 25;
    const earlySignalScore = isLb1908 ? 44 : isLb2102 ? 38 : 12;
    const toxicityMitigationScore = isLb1908 ? 36 : isLb2102 ? 42 : 25;
    const competitiveIntensityScore = isLb1908 ? 72 : isLb2102 ? 68 : 64;
    const low = Math.max(0, asset.estimatedPeakSales * asset.probabilityOfSuccess * 0.05 * scenarioUpside - asset.developmentCostRemaining * 0.08);
    const high = Math.max(low, asset.estimatedPeakSales * asset.probabilityOfSuccess * 0.18 * scenarioUpside);
    return {
      assetName: asset.assetName,
      scientificRiskScore,
      targetValidationScore,
      earlySignalScore,
      toxicityMitigationScore,
      competitiveIntensityScore,
      optionValueRange: [low, high] as [number, number],
      notInCoreBaseCase: true as const,
      sourceEvidenceIds: asset.sourceEvidenceIds,
    };
  });

  const totalProbabilityWeightedOptionValue = assets.reduce((sum, asset) => sum + (asset.optionValueRange[0] + asset.optionValueRange[1]) / 2, 0);

  return {
    assets,
    totalProbabilityWeightedOptionValue,
    explainability: explain(
      "Solid tumor CAR-T is valued only as high-discount option value because antigen heterogeneity, trafficking, TME and on-target/off-tumor toxicity are not solved yet.",
      "option value range = peak sales x early POS x high-discount option factor, with explicit scientific and toxicity score haircuts",
      Array.from(new Set(assets.flatMap((asset) => asset.sourceEvidenceIds))),
      [
        "LB1908 has early CLDN18.2 signal but gastric mucosal injury risk",
        "LB2102 has DLL3 signal but Novartis license economics uncertainty",
        "No solid tumor CAR-T asset is included in core CARVYKTI commercial base",
      ],
    ),
  };
}
