import type { LsegMoatBreakdown } from "../types";

export function calculateLsegPlatformMoatAdjustment(moat: LsegMoatBreakdown, requestedAdjustment: number) {
  const cappedAdjustment = Math.max(0, Math.min(requestedAdjustment, moat.cap, moat.cappedValuationAdjustment));
  return {
    requestedAdjustment,
    cappedAdjustment,
    cap: moat.cap,
    explanation: "Platform moat overlay is capped and lower of scenario request, moat-derived score and hard cap.",
  };
}
