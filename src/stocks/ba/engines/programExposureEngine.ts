import type { BaDataset, BaProgramExposureOutput } from "../model";
import { scoreToRiskLabel } from "./helpers";

export function calculateBaProgramExposureEngine(data: BaDataset): BaProgramExposureOutput {
  const programs = data.programs.map((program) => {
    const attractivenessScore = Math.round(
      program.maturityScore * 0.2 +
        program.marginQualityScore * 0.25 +
        program.growthContributionScore * 0.35 +
        (100 - program.riskScore) * 0.2,
    );
    return {
      ...program,
      attractivenessScore,
      executionRiskLabel: scoreToRiskLabel(program.riskScore),
      durationLabel: program.stage === "future option" ? "10+ year option" : program.stage === "ramping" ? "multi-year ramp" : "installed base",
    };
  });

  return {
    programs,
    filters: {
      segments: [...new Set(programs.map((program) => program.segment))],
      geographies: [...new Set(programs.flatMap((program) => program.geography.split(" / ")))],
      stages: [...new Set(programs.map((program) => program.stage))],
      riskLevels: [...new Set(programs.map((program) => program.executionRiskLabel))],
    },
  };
}
