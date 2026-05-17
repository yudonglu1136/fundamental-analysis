import type { GooglAiTpuCapexOutput, GooglDataset, GooglValuationAssumptions } from "../model";
import { clamp, getGooglPeriod, safeDivide } from "./helpers";

export function calculateGooglAiTpuCapexEngine(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
): GooglAiTpuCapexOutput {
  const period = getGooglPeriod(data, periodId);
  const revenueBase = period.ttmOperatingCashFlow ? data.financials.find((item) => item.id === "fy25")?.totalRevenue ?? period.totalRevenue * 4 : period.totalRevenue;
  const capex = period.ttmCapex ?? period.capex;
  const capexIntensity = safeDivide(capex, revenueBase);
  const fy2026CapexMidpoint = (data.guidance.fy2026CapexLow + data.guidance.fy2026CapexHigh) / 2;
  const fy2026CapexIntensityOfTtmRevenue = safeDivide(fy2026CapexMidpoint, period.periodType === "quarterly" ? period.totalRevenue * 4 : period.totalRevenue);
  const depreciationBurden = safeDivide(period.depreciation ?? 0, period.totalRevenue);
  const tpuMoatScore = clamp(
    45 +
      data.aiOperatingSignals.tpu8iPerformancePerDollarImprovement * 25 +
      data.aiOperatingSignals.aiResponseCostReduction * 35 +
      assumptions.tpuEfficiencyBenefit * 260 -
      assumptions.aiComputeConstraint * 20,
    20,
    95,
  );
  const aiCapexPaybackScore = clamp(60 + assumptions.cloudRevenueCagr * 55 + assumptions.searchRevenueCagr * 30 + assumptions.tpuEfficiencyBenefit * 180 - fy2026CapexIntensityOfTtmRevenue * 95, 15, 95);
  const computeConstraint = clamp(assumptions.aiComputeConstraint, 0, 1);

  return {
    capex,
    capexIntensity,
    fy2026CapexMidpoint,
    fy2026CapexIntensityOfTtmRevenue,
    depreciationBurden,
    tpuMoatScore,
    aiCapexPaybackScore,
    computeConstraint,
    bridge: [
      { label: "TTM free cash flow", value: period.ttmFreeCashFlow ?? period.freeCashFlow, type: "base" },
      { label: "FY2026 capex step-up", value: -Math.max(fy2026CapexMidpoint - (period.ttmCapex ?? period.capex), 0), type: "negative" },
      { label: "TPU cost response", value: period.totalRevenue * 4 * assumptions.tpuEfficiencyBenefit * 0.35, type: "positive" },
      { label: "Cloud backlog conversion", value: data.cloudBacklog.googleCloudBacklog * data.cloudBacklog.expectedRecognitionWithin24Months * assumptions.cloudTerminalMargin * 0.08, type: "positive" },
      { label: "Compute constraint drag", value: -period.totalRevenue * 4 * assumptions.aiComputeConstraint * 0.02, type: "negative" },
      {
        label: "Stress adjusted FCF",
        value:
          (period.ttmFreeCashFlow ?? period.freeCashFlow) -
          Math.max(fy2026CapexMidpoint - (period.ttmCapex ?? period.capex), 0) +
          period.totalRevenue * 4 * assumptions.tpuEfficiencyBenefit * 0.35 +
          data.cloudBacklog.googleCloudBacklog * data.cloudBacklog.expectedRecognitionWithin24Months * assumptions.cloudTerminalMargin * 0.08 -
          period.totalRevenue * 4 * assumptions.aiComputeConstraint * 0.02,
        type: "total",
      },
    ],
  };
}
