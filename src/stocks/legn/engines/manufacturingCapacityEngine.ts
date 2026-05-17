import type { Scenario } from "../../types";
import type { LegnDataset, LegnManufacturingCapacityOutput } from "../types";
import { clamp, explain } from "./helpers";

export function buildManufacturingCapacityEngine(data: LegnDataset, scenario: Scenario): LegnManufacturingCapacityOutput {
  const assumptions = data.assumptions.manufacturingScenarios[scenario];
  const commercialAssumptions = data.assumptions.commercialScenarios[scenario];
  const years = Array.from({ length: 10 }, (_, index) => 2026 + index);
  const capacityRamp = years.map((year, index) => {
    const rampProgress = clamp(index / 7, 0, 1);
    const annualDoseCapacity = assumptions.annualDoseCapacity + (assumptions.targetAnnualDoseCapacity - assumptions.annualDoseCapacity) * rampProgress;
    const treatmentSiteCount = assumptions.treatmentSiteCount + (commercialAssumptions.activeTreatmentCenters.Global - assumptions.treatmentSiteCount) * rampProgress;
    const patientsPerSite = assumptions.averagePatientsPerSiteYear * (1 + index * 0.035) * (1 + assumptions.atcVsCommunityMix.communityAndRegional * 0.2);
    const demandDoses = treatmentSiteCount * patientsPerSite * commercialAssumptions.utilization.Global;
    const feasibleDoses = Math.min(demandDoses, annualDoseCapacity) * assumptions.manufacturingSuccessRate;
    const bottleneckScore = clamp((demandDoses - annualDoseCapacity) / Math.max(demandDoses, 1), 0, 1);
    const avgPriceM = commercialAssumptions.netPrice.Global;
    const demandConstrainedRevenue = demandDoses * avgPriceM;
    const capacityConstrainedRevenue = feasibleDoses * avgPriceM;
    const marginImpact = -assumptions.cogsAsPctNts + assumptions.scaleCogsImprovement * rampProgress - bottleneckScore * 0.06;
    return {
      year,
      annualDoseCapacity,
      treatmentSiteCount,
      demandDoses,
      feasibleDoses,
      bottleneckScore,
      demandConstrainedRevenue,
      capacityConstrainedRevenue,
      marginImpact,
    };
  });

  const current = capacityRamp[0];

  return {
    scenario,
    annualRows: capacityRamp,
    currentSuccessRate: assumptions.manufacturingSuccessRate,
    currentOutOfSpecRate: assumptions.outOfSpecRate,
    bottleneckScore: current.bottleneckScore,
    explainability: explain(
      "Manufacturing limits are modeled as dose capacity times manufacturing success, then compared with demand implied by active sites and patients per site.",
      "feasible doses = min(demand doses, dose capacity) x manufacturing success; revenue = feasible doses x blended net price",
      assumptions.sourceEvidenceIds,
      [
        `${assumptions.annualDoseCapacity.toFixed(0)} starting annual dose capacity`,
        `${(assumptions.manufacturingSuccessRate * 100).toFixed(1)}% manufacturing success`,
        `${assumptions.releaseTimeDays.toFixed(0)} day release-time assumption`,
      ],
    ),
  };
}
