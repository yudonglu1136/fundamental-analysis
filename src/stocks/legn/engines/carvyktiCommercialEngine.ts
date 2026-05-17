import type { Scenario } from "../../types";
import type { LegnAnnualCommercialForecast, LegnCommercialEngineOutput, LegnDataset } from "../types";
import { buildManufacturingCapacityEngine } from "./manufacturingCapacityEngine";
import { clamp, explain } from "./helpers";

function rampFromCurrent(current: number, peak: number, year: number, peakYear: number, scenario: Scenario) {
  const yearsToPeak = Math.max(peakYear - 2025, 1);
  const progress = clamp((year - 2025) / yearsToPeak, 0, 1);
  const curveShape = scenario === "Bear" ? 0.82 : scenario === "Bull" ? 1.18 : 1;
  const shapedProgress = 1 - (1 - progress) ** (1.35 * curveShape);
  return current + (peak - current) * shapedProgress;
}

function buildPatientFunnel(data: LegnDataset, scenario: Scenario) {
  const assumptions = data.assumptions.commercialScenarios[scenario];
  const diagnosed = assumptions.eligiblePopulation.Global * assumptions.diagnosisRate.Global;
  const eligible = diagnosed * (assumptions.lineEligibility["2L-4L"] + assumptions.lineEligibility["5L+"]);
  const referred = eligible * assumptions.referralRate.Global;
  const adopted = referred * ((assumptions.carTAdoption["2L-4L"] + assumptions.carTAdoption["5L+"]) / 2);
  const carvykti = adopted * ((assumptions.carvyktiShare["2L-4L"] + assumptions.carvyktiShare["5L+"]) / 2);
  const completed = carvykti * assumptions.manufacturingSuccess * assumptions.treatmentCompletion;
  return [
    { label: "Eligible myeloma population", value: assumptions.eligiblePopulation.Global, conversion: 1, evidenceIds: assumptions.sourceEvidenceIds },
    { label: "Diagnosed / reached by system", value: diagnosed, conversion: assumptions.diagnosisRate.Global, evidenceIds: assumptions.sourceEvidenceIds },
    { label: "Line eligible today", value: eligible, conversion: eligible / diagnosed, evidenceIds: assumptions.sourceEvidenceIds },
    { label: "Referred to CAR-T center", value: referred, conversion: assumptions.referralRate.Global, evidenceIds: assumptions.sourceEvidenceIds },
    { label: "CAR-T adopted", value: adopted, conversion: adopted / referred, evidenceIds: assumptions.sourceEvidenceIds },
    { label: "CARVYKTI selected", value: carvykti, conversion: carvykti / adopted, evidenceIds: assumptions.sourceEvidenceIds },
    { label: "Manufactured and treated", value: completed, conversion: assumptions.manufacturingSuccess * assumptions.treatmentCompletion, evidenceIds: assumptions.sourceEvidenceIds },
  ];
}

export function buildCarvyktiCommercialEngine(data: LegnDataset, scenario: Scenario): LegnCommercialEngineOutput {
  const assumptions = data.assumptions.commercialScenarios[scenario];
  const capacity = buildManufacturingCapacityEngine(data, scenario);
  const latestAnnualized = (data.carvyktiQuarters.find((row) => row.id === "q1-2026")?.globalNetTradeSales ?? 555) * 4;
  const years = Array.from({ length: 10 }, (_, index) => 2026 + index);

  const annualForecast: LegnAnnualCommercialForecast[] = years.map((year, index) => {
    const nominalNts = rampFromCurrent(latestAnnualized, assumptions.approvedPeakNts, year, assumptions.approvedPeakYear, scenario);
    const fade = year > assumptions.approvedPeakYear ? 1 - Math.min((year - assumptions.approvedPeakYear) * 0.035, 0.18) : 1;
    const demandConstrainedNts = nominalNts * fade;
    const capacityRow = capacity.annualRows[index];
    const capacityConstrainedNts = Math.min(demandConstrainedNts, capacityRow.capacityConstrainedRevenue);
    const globalNts = capacityConstrainedNts;
    const usMix = clamp(0.72 - index * 0.02 + (scenario === "Bull" ? -0.03 : scenario === "Bear" ? 0.03 : 0), 0.52, 0.75);
    const usNts = globalNts * usMix;
    const ousNts = globalNts - usNts;
    const twoToFourLineMix = clamp(0.65 + index * 0.012, 0.6, 0.76);
    const nts2L4L = globalNts * twoToFourLineMix;
    const nts5LPlus = globalNts * (1 - twoToFourLineMix);
    const estimatedPatientsTreated = globalNts / assumptions.netPrice.Global;
    const marketShareAtPeak = (assumptions.carvyktiShare["2L-4L"] + assumptions.carvyktiShare["5L+"]) / 2;
    return {
      year,
      usNts,
      ousNts,
      globalNts,
      nts2L4L,
      nts5LPlus,
      ntsFrontline: 0,
      demandConstrainedNts,
      capacityConstrainedNts,
      activeTreatmentCenters: capacityRow.treatmentSiteCount,
      estimatedPatientsTreated,
      capacityUtilization: clamp(estimatedPatientsTreated / Math.max(capacityRow.annualDoseCapacity, 1), 0, 1.25),
      carvyktiShare: marketShareAtPeak,
    };
  });

  const peak = annualForecast.reduce((max, row) => (row.globalNts > max.globalNts ? row : max), annualForecast[0]);
  const firstYear = annualForecast[0];
  const lastYear = annualForecast[annualForecast.length - 1];

  return {
    scenario,
    quarterlyNts: data.carvyktiQuarters,
    annualForecast,
    patientFunnel: buildPatientFunnel(data, scenario),
    siteFunnel: [
      { label: "Global treatment sites", value: assumptions.activeTreatmentCenters.Global, evidenceIds: assumptions.sourceEvidenceIds },
      { label: "Patients per site per year", value: assumptions.patientsPerCenter.Global, evidenceIds: assumptions.sourceEvidenceIds },
      { label: "Utilization", value: assumptions.utilization.Global, evidenceIds: assumptions.sourceEvidenceIds },
      { label: "Community expansion multiplier", value: assumptions.communityExpansionMultiplier, evidenceIds: assumptions.sourceEvidenceIds },
    ],
    peakNts: peak.globalNts,
    timeToPeak: peak.year,
    growthFade: 1 - lastYear.globalNts / Math.max(peak.globalNts, 1),
    marketShareAtPeak: peak.carvyktiShare,
    explainability: explain(
      "CARVYKTI is forecast from gross net trade sales, not Legend reported revenue, and then constrained by manufacturing throughput.",
      "annual NTS = launch ramp to approved-label peak x post-peak fade; modeled NTS = min(demand-constrained NTS, capacity-constrained NTS)",
      Array.from(new Set([...assumptions.sourceEvidenceIds, ...capacity.explainability.evidenceIds])),
      [
        `${assumptions.approvedPeakNts.toFixed(0)} USDm approved-label peak NTS`,
        `Base excludes frontline: ${assumptions.includeFrontlineInBase ? "no" : "yes"}`,
        `${(firstYear.capacityUtilization * 100).toFixed(0)}% first-year capacity utilization`,
      ],
    ),
  };
}
