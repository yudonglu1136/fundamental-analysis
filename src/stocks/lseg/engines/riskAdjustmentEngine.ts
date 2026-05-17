import type { LsegRiskRedTeamOutput } from "../types";

export function calculateLsegRiskAdjustment(risk: LsegRiskRedTeamOutput, requestedAdjustment: number) {
  const cappedAdjustment = -Math.min(Math.abs(requestedAdjustment), Math.abs(risk.cappedRiskAdjustment), risk.cap);
  return {
    requestedAdjustment,
    cappedAdjustment,
    cap: risk.cap,
    explanation: "Risk adjustment is capped by the red-team engine and cannot be used as an arbitrary valuation plug.",
  };
}
