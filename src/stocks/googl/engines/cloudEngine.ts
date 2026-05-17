import type { GooglCloudOutput, GooglDataset, GooglValuationAssumptions } from "../model";
import { annualizeIfQuarterly, clamp, getGooglPeriod, getGooglSegment, safeDivide } from "./helpers";

export function calculateGooglCloudEngine(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
): GooglCloudOutput {
  const period = getGooglPeriod(data, periodId);
  const cloud = getGooglSegment(data, periodId, "Google Cloud");
  const revenue = annualizeIfQuarterly(cloud.revenue, period);
  const operatingIncome = annualizeIfQuarterly(cloud.operatingIncome, period);
  const margin = safeDivide(cloud.operatingIncome, cloud.revenue);
  const backlog = data.cloudBacklog.googleCloudBacklog;
  const backlogCoverageYears = safeDivide(backlog, revenue);
  const recognizedWithin24Months = backlog * data.cloudBacklog.expectedRecognitionWithin24Months;
  const backlogConversionRevenue = recognizedWithin24Months / 2;
  const aiWorkloadScore = clamp(50 + assumptions.cloudRevenueCagr * 80 + data.aiOperatingSignals.geminiEnterprisePaidMauQoqGrowth * 45 + data.aiOperatingSignals.cloudCustomersAboveTenTrillionTokens * 0.35, 35, 95);
  const computeConstraintScore = clamp(assumptions.aiComputeConstraint * 100 - assumptions.tpuEfficiencyBenefit * 180, 5, 95);
  const baseMargin = Math.max(margin, 0.01);
  const terminalMargin = clamp(
    baseMargin + assumptions.tpuEfficiencyBenefit * 0.45 - assumptions.aiComputeConstraint * 0.035 - (assumptions.capexIntensity - 0.22) * 0.12,
    0.18,
    0.42,
  );

  return {
    revenue,
    operatingIncome,
    margin,
    backlog,
    backlogCoverageYears,
    recognizedWithin24Months,
    backlogConversionRevenue,
    aiWorkloadScore,
    computeConstraintScore,
    marginBridge: [
      { label: "Reported Cloud margin", value: baseMargin, type: "base" },
      { label: "Scale and backlog conversion", value: assumptions.cloudRevenueCagr * 0.08, type: "positive" },
      { label: "TPU efficiency", value: assumptions.tpuEfficiencyBenefit * 0.45, type: "positive" },
      { label: "Wiz integration headwind", value: -0.018, type: "negative" },
      { label: "Depreciation / energy", value: -(assumptions.capexIntensity - 0.2) * 0.12, type: "negative" },
      { label: "Modeled terminal margin", value: terminalMargin, type: "total" },
    ],
  };
}
