import type { MsftDataset } from "../model";
import { safeRatio } from "./helpers";

export function calculateMsftAiFactoryEngine(data: MsftDataset) {
  const latestCloud = data.cloudMetrics.find((metric) => metric.periodId === "q3-fy26") ?? data.cloudMetrics[data.cloudMetrics.length - 1];
  const priorCloud = data.cloudMetrics.find((metric) => metric.periodId === "fy25") ?? data.cloudMetrics[0];
  const latestPeriod = data.periods.find((period) => period.id === "q3-fy26") ?? data.periods[0];
  const fy26e = data.periods.find((period) => period.id === "fy26e") ?? latestPeriod;
  const aiArr = data.aiDisclosures.find((item) => item.id === "ai-arr-q3-fy26")?.metric ?? 0;
  const cy26Capex = data.aiDisclosures.find((item) => item.id === "cy26-capex-guide")?.metric ?? 0;
  const q4CloudGm = data.aiDisclosures.find((item) => item.id === "cloud-gm-q4-guide")?.metric ?? latestCloud.microsoftCloudGrossMargin;

  const cloudMarginCompression = latestCloud.microsoftCloudGrossMargin - priorCloud.microsoftCloudGrossMargin;
  const capexIntensity = safeRatio(fy26e.capex, fy26e.revenue);
  const aiArrToAnnualizedCapex = safeRatio(aiArr * 1_000, (latestPeriod.capex ?? 0) * 4);
  const capacityConstraint = data.aiDisclosures.find((item) => item.id === "capacity-constrained-through-2026");

  return {
    latestCloud,
    priorCloud,
    aiArr,
    aiArrGrowth: 1.23,
    cy26Capex,
    q4CloudGm,
    capexIntensity,
    cloudMarginCompression,
    aiArrToAnnualizedCapex,
    capacityConstraint,
    status:
      latestCloud.azureGrowth && latestCloud.azureGrowth >= 0.38 && latestCloud.microsoftCloudGrossMargin >= 0.66
        ? "Demand-led buildout with visible margin pressure"
        : "AI capacity investment needs closer payback validation",
    diagnostics: [
      {
        label: "Azure growth",
        value: latestCloud.azureGrowth ?? 0,
        interpretation: "Q3 FY2026 Azure growth remained 40%, with management saying demand continues to exceed available capacity.",
      },
      {
        label: "Cloud GM compression",
        value: cloudMarginCompression,
        interpretation: "Microsoft Cloud GM fell from FY2025 69% to Q3 FY2026 66%, with Q4 guided to roughly 64%.",
      },
      {
        label: "AI ARR / annualized Q3 capex",
        value: aiArrToAnnualizedCapex,
        interpretation: "A rough throughput test for whether AI revenue run-rate is catching up with current infrastructure spend.",
      },
      {
        label: "FY2026 capex intensity",
        value: capexIntensity,
        interpretation: "Derived run-rate capex remains unusually high because AI supply is still being built out.",
      },
    ],
  };
}
