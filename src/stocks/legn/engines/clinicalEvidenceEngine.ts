import type { LegnClinicalEvidenceOutput, LegnDataset } from "../types";
import { clamp, explain } from "./helpers";

export function buildClinicalEvidenceEngine(data: LegnDataset): LegnClinicalEvidenceOutput {
  const cartitudeTrials = data.clinicalTrials.filter((trial) => trial.trialName.startsWith("CARTITUDE"));
  const efficacySuperiority = 88;
  const osPfsEvidenceStrength = 84;
  const durability = 86;
  const mrdDepth = 82;
  const comparatorRelevance = 78;
  const followUpMaturity = 77;
  const regulatoryQuality = 85;
  const realWorldAdoption = 72;
  const safetyPenalty = 23;
  const clinicalEvidenceScore = clamp(
    efficacySuperiority * 0.16 +
      osPfsEvidenceStrength * 0.16 +
      durability * 0.15 +
      mrdDepth * 0.1 +
      comparatorRelevance * 0.1 +
      followUpMaturity * 0.1 +
      regulatoryQuality * 0.13 +
      realWorldAdoption * 0.1 -
      safetyPenalty * 0.45,
    0,
    100,
  );

  return {
    trials: data.clinicalTrials,
    clinicalEvidenceScore,
    durabilityScore: durability,
    safetyPenalty,
    evidenceMaturityScore: Math.round((osPfsEvidenceStrength + followUpMaturity + regulatoryQuality) / 3),
    readoutCatalystTimeline: [
      {
        date: "2026-H2",
        catalyst: "In vivo CAR-T first human data window",
        impact: "pipelineOption",
        evidenceIds: ["legn-jpm2026-in-vivo-ind"],
      },
      {
        date: "2027-2029",
        catalyst: "CARTITUDE-5 frontline transplant-not-planned readout / filing path",
        impact: "labelExpansion",
        evidenceIds: ["clinicaltrials-cartitude5"],
      },
      {
        date: "2028-2030",
        catalyst: "CARTITUDE-6 ASCT displacement debate",
        impact: "labelExpansion",
        evidenceIds: ["clinicaltrials-cartitude6"],
      },
      {
        date: "2026-2027",
        catalyst: "LB1908 dose expansion and toxicity updates",
        impact: "pipelineOption",
        evidenceIds: ["lb1908-asco-gi2026"],
      },
    ],
    explainability: explain(
      "CARVYKTI scores high on depth, durability and randomized earlier-line evidence, but boxed-warning and logistics risk keep the score below mature biologics.",
      "clinical score = weighted efficacy, OS/PFS, durability, MRD, comparator relevance, follow-up, regulatory quality and adoption, minus safety penalty",
      Array.from(new Set(cartitudeTrials.flatMap((trial) => trial.sourceEvidenceIds))),
      [
        "CARTITUDE-1 provides mature durability",
        "CARTITUDE-4 provides randomized 2L-4L evidence",
        "IEC-EC, CRS, ICANS and secondary malignancy warnings reduce adoption score",
      ],
    ),
  };
}
