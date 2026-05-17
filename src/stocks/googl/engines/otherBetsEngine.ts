import type { GooglDataset, GooglOtherBetsOutput, GooglValuationAssumptions } from "../model";
import { annualizeIfQuarterly, clamp, getGooglPeriod, getGooglSegment, perShare } from "./helpers";

export function calculateGooglOtherBetsEngine(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
): GooglOtherBetsOutput {
  const period = getGooglPeriod(data, periodId);
  const otherBets = getGooglSegment(data, periodId, "Other Bets");
  const revenue = annualizeIfQuarterly(otherBets.revenue, period);
  const operatingLoss = annualizeIfQuarterly(Math.min(otherBets.operatingIncome, 0), period);
  const waymoRideScale = data.aiOperatingSignals.waymoWeeklyFullyAutonomousRides;
  const optionValueCap = assumptions.currentPrice * 0.035;
  const optionValuePerShare = Math.min(assumptions.otherBetsOptionValue, optionValueCap);
  const burnRiskScore = clamp(Math.abs(perShare(operatingLoss, assumptions.dilutedShares)) / Math.max(optionValuePerShare, 1) * 18, 5, 95);

  return {
    revenue,
    operatingLoss,
    waymoRideScale,
    optionValuePerShare,
    cappedOptionValue: optionValueCap,
    burnRiskScore,
    notes: [
      "Other Bets is capped as option value because Alphabet does not disclose enough unit economics to justify a large standalone valuation.",
      "Waymo ride scale is a monitoring indicator, not a direct revenue multiple in this model.",
      "Verily/GFiber deconsolidation commentary is treated as portfolio cleanup, not recurring operating profit.",
    ],
  };
}
