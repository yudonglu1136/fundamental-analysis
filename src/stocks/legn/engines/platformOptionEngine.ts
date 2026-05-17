import type { Scenario } from "../../types";
import type { LegnDataset, LegnPlatformOptionOutput } from "../types";
import { explain, scenarioMultiplier } from "./helpers";

export function buildPlatformOptionEngine(data: LegnDataset, scenario: Scenario): LegnPlatformOptionOutput {
  const platformAssets = data.pipelineAssets.filter((asset) => asset.optionalityType === "platform_option");
  const platformReadinessScore = scenario === "Bull" ? 48 : scenario === "Bear" ? 26 : 36;
  const modalityRiskScore = scenario === "Bull" ? 62 : scenario === "Bear" ? 82 : 74;
  const partnershipPotentialScore = scenario === "Bull" ? 58 : scenario === "Bear" ? 32 : 44;
  const strategicValueScore = Math.round(platformReadinessScore * 0.35 + (100 - modalityRiskScore) * 0.25 + partnershipPotentialScore * 0.4);
  const midpointComparable = scenarioMultiplier(scenario, 125, 275, 625);
  const comparableTransactionValueRange: [number, number] = [midpointComparable * 0.45, midpointComparable * 1.55];
  const probabilityWeightedOptionValue = midpointComparable * (strategicValueScore / 100) * 0.35;

  return {
    platformReadinessScore,
    modalityRiskScore,
    partnershipPotentialScore,
    strategicValueScore,
    comparableTransactionValueRange,
    probabilityWeightedOptionValue,
    speculative: true,
    explainability: explain(
      "In vivo, allogeneic and autoimmune programs are scored as speculative platform option value, not as mature rNPV anchors.",
      "platform option = comparable value midpoint x strategic score x probability haircut",
      Array.from(new Set(platformAssets.flatMap((asset) => asset.sourceEvidenceIds))),
      [
        "In vivo first human data is the next readiness test",
        "Allogeneic economics depend on off-the-shelf durability and safety",
        "Autoimmune CAR-T is strategic but early",
      ],
    ),
  };
}
