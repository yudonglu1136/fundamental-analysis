import type { Scenario } from "../../types";
import type { LegnDataset, LegnLabelExpansionOutput } from "../types";
import { discountFactor, explain, scenarioMultiplier } from "./helpers";

const adoptionShape = [0.05, 0.14, 0.28, 0.44, 0.58, 0.68, 0.74, 0.78];

export function buildLabelExpansionEngine(data: LegnDataset, scenario: Scenario): LegnLabelExpansionOutput {
  const commercialAssumptions = data.assumptions.commercialScenarios[scenario];
  const frontlineIncludedInBase = commercialAssumptions.includeFrontlineInBase;
  const assets = data.pipelineAssets.filter((asset) => asset.assetName.startsWith("CARTITUDE"));
  const multiplier = scenarioMultiplier(scenario, 0.72, 1, 1.35);
  const expansions = assets.map((asset) => {
    const eligiblePatientPool =
      asset.assetName.includes("CARTITUDE-5") ? 15_500 : asset.assetName.includes("CARTITUDE-6") ? 11_000 : 5_500;
    const cannibalization = asset.assetName.includes("CARTITUDE-10") ? 0.55 : 0.25;
    const safetyRegulatoryRiskAdjustment = asset.assetName.includes("CARTITUDE-6") ? 0.78 : asset.assetName.includes("CARTITUDE-10") ? 0.68 : 0.82;
    const peakNtsImpact = asset.estimatedPeakSales * multiplier;
    const riskAdjustedPeakNtsImpact = frontlineIncludedInBase
      ? 0
      : peakNtsImpact * asset.probabilityOfSuccess * (1 - cannibalization) * safetyRegulatoryRiskAdjustment;
    const margin = 0.27;
    const afterTax = 0.82;
    const navUsdM = frontlineIncludedInBase
      ? 0
      : (riskAdjustedPeakNtsImpact * data.collaborationEconomicsBridge.ntsToCollaborationRevenueRatio * margin * afterTax * 5.5) /
        discountFactor(asset.estimatedLaunchYear, 2026, asset.discountRate);
    return {
      trialName: asset.assetName,
      nct: asset.sourceEvidenceIds.includes("clinicaltrials-cartitude5")
        ? "NCT04923893"
        : asset.sourceEvidenceIds.includes("clinicaltrials-cartitude6")
          ? "NCT05257083"
          : "NCT07149857",
      currentApprovedLabel: "2L+ lenalidomide-refractory multiple myeloma after at least one prior line",
      potentialLabel: asset.indication,
      probability: asset.probabilityOfSuccess,
      timing: asset.estimatedLaunchYear,
      eligiblePatientPool,
      adoptionCurve: adoptionShape,
      cannibalization,
      peakNtsImpact,
      riskAdjustedPeakNtsImpact,
      navUsdM,
      safetyRegulatoryRiskAdjustment,
      sourceEvidenceIds: asset.sourceEvidenceIds,
    };
  });

  const totalNavUsdM = expansions.reduce((sum, item) => sum + item.navUsdM, 0);

  return {
    scenario,
    expansions,
    totalNavUsdM,
    doubleCountGuardrail: {
      frontlineIncludedInBase,
      warning: frontlineIncludedInBase
        ? "Frontline NTS is already included in the core CARVYKTI base, so label-expansion NAV is forced to zero."
        : null,
    },
    explainability: explain(
      "Frontline and regimen-optimization value is modeled separately from approved-label CARVYKTI to prevent double counting.",
      "label NAV = peak NTS impact x POS x (1 - cannibalization) x safety/regulatory adjustment x Legend economics x margin x after-tax annuity / discount factor",
      Array.from(new Set(expansions.flatMap((item) => item.sourceEvidenceIds))),
      [
        frontlineIncludedInBase ? "frontline included in base; NAV zeroed" : "frontline excluded from base forecast",
        `${expansions.length} tracked CARTITUDE expansion programs`,
      ],
    ),
  };
}
