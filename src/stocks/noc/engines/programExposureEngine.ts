import type { NocDataset, NocProgramExposureOutput } from "../model";
import { scoreToRiskLabel } from "./helpers";

function durationLabel(stage: string) {
  if (stage === "mature") return "Installed base / recurring franchise";
  if (stage === "ramping") return "Multi-year ramp";
  if (stage === "restructured") return "Long-cycle but under reset";
  return "Option value";
}

export function calculateNocProgramExposureEngine(data: NocDataset): NocProgramExposureOutput {
  const programs = data.programs.map((program) => {
    const attractivenessScore = Math.round(
      program.revenueDriverScore * 0.34 +
        program.marginQualityScore * 0.28 +
        program.cashConversionScore * 0.18 +
        (100 - program.executionRiskScore) * 0.2,
    );
    return {
      ...program,
      attractivenessScore,
      riskLabel: scoreToRiskLabel(program.executionRiskScore),
      durationLabel: durationLabel(program.stage),
      mappedAssumption: program.assumptionMapping.replace(/_/g, " "),
    };
  });

  return {
    programs,
    filters: {
      segments: [...new Set(programs.map((program) => program.segment))],
      stages: [...new Set(programs.map((program) => program.stage))],
      budgetDrivers: [...new Set(programs.map((program) => program.budgetDriver))],
      riskLevels: [...new Set(programs.map((program) => program.riskLabel))],
    },
  };
}
