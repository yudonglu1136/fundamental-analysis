import type { ValidationWarning } from "../../types";
import type { MsftDataset, MsftValuationAssumptions } from "../model";
import { safeRatio } from "./helpers";

export function calculateMsftCapexFcfEngine(data: MsftDataset, assumptions: MsftValuationAssumptions) {
  const fy25 = data.periods.find((period) => period.id === "fy25") ?? data.periods[0];
  const q3 = data.periods.find((period) => period.id === "q3-fy26") ?? data.periods[0];
  const fy26e = data.periods.find((period) => period.id === "fy26e") ?? q3;
  const cy26Capex = data.aiDisclosures.find((item) => item.id === "cy26-capex-guide")?.metric ?? 190;

  const rows = [fy25, q3, fy26e].map((period) => ({
    period: period.label,
    revenue: period.revenue,
    operatingCashFlow: period.operatingCashFlow ?? 0,
    capex: period.capex ?? 0,
    freeCashFlow: period.freeCashFlow ?? 0,
    fcfMargin: safeRatio(period.freeCashFlow, period.revenue),
    capexIntensity: safeRatio(period.capex, period.revenue),
    depreciationSalesRatio: safeRatio(period.depreciationAmortizationAndOther, period.revenue),
  }));

  const warnings: ValidationWarning[] = [];
  rows.forEach((row) => {
    if (row.capexIntensity > 0.28) {
      warnings.push({
        id: `msft-capex-intensity-${row.period.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: "Capex intensity is elevated",
        detail: `${row.period} capex intensity is ${(row.capexIntensity * 100).toFixed(1)}%, reflecting AI capacity buildout and finance-lease timing.`,
        severity: "medium",
      });
    }
  });

  const paybackYears =
    assumptions.operatingMargin > 0
      ? assumptions.aiCapexIntensity / Math.max((assumptions.openAiRevenueContribution * assumptions.openAiGrossMargin + assumptions.copilotPenetration * 0.04), 0.01)
      : 99;

  return {
    rows,
    cy26Capex,
    shortLivedAssetMix: 2 / 3,
    q4CapexGuide: 40_000,
    paybackYears,
    warnings,
    interpretation:
      "Microsoft has both a demand signal and a cash-flow problem to solve: capex is high because capacity is constrained, but that also means FCF conversion can lag revenue and operating income until utilization and pricing catch up.",
  };
}
