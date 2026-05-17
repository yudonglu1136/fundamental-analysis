import type { MetaAiCapexOutput, MetaDataset, MetaForecastYear, MetaValuationAssumptions } from "../model";
import { safeRatio } from "./helpers";

export function calculateMetaAiCapexEngine(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
  forecast: MetaForecastYear[],
): MetaAiCapexOutput {
  const capexGuide = data.guidance.find((item) => item.id === "fy2026-capex-guide");
  const capexGuidanceMidpoint = ((capexGuide?.capexLow ?? assumptions.capex2026) + (capexGuide?.capexHigh ?? assumptions.capex2026)) / 2;
  const fy2025 = data.periods.find((period) => period.id === "fy2025") ?? data.periods[0];
  const yearOne = forecast[0];
  const yearFive = forecast[forecast.length - 1];
  const latestCapexPoint = data.aiCapex.find((item) => item.periodId === data.latestReportingPeriod);

  const notes = [
    "AI capex is not an official standalone disclosure, so the AI share of growth capex stays an assumption.",
    "The DCF charges total capex; AI ROIC is a payback diagnostic and is not separately added to base fair value.",
  ];
  if (yearFive?.aiRoic < assumptions.wacc) {
    notes.push("Year-five AI ROIC is below WACC, so the scenario is vulnerable to capex-return disappointment.");
  }

  return {
    capexGuidanceMidpoint,
    capexStepUpVs2025: capexGuidanceMidpoint - fy2025.capitalExpendituresInclFinanceLeases,
    capexAsPctRevenue2026: safeRatio(yearOne?.capitalExpenditures ?? assumptions.capex2026, Math.max(yearOne?.revenue ?? 1, 1)),
    cumulativeAiGrowthCapex: yearFive?.cumulativeAiGrowthCapex ?? 0,
    yearFiveAiRoic: yearFive?.aiRoic ?? 0,
    yearFiveAiRoicSpread: (yearFive?.aiRoic ?? 0) - assumptions.wacc,
    yearFivePayback: yearFive?.aiPaybackYears ?? 0,
    infrastructureCommitments: (latestCapexPoint?.contractualCommitments ?? 0) + (latestCapexPoint?.additionalCommitmentsAfterQuarter ?? 0),
    capexToRevenueBridge: forecast.map((row) => ({
      year: row.year,
      capex: row.capitalExpenditures,
      capexIntensity: row.capexIntensity,
      aiGrowthCapex: row.aiGrowthCapex,
      aiRoic: row.aiRoic,
      paybackYears: row.aiPaybackYears,
    })),
    notes,
  };
}
