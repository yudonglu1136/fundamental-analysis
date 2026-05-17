import type { AznDataset, AznValuationAssumptions } from "../types";
import { safeRatio } from "./helpers";

export function buildFinancialQualityEngine(data: AznDataset, assumptions: AznValuationAssumptions) {
  const fy = data.periods.find((period) => period.id === "fy2025") ?? data.periods[0];
  const q1 = data.periods.find((period) => period.id === "q1-2026") ?? fy;
  const fcfFy = fy.netOperatingCashFlow - fy.capex;
  const fcfQ1 = q1.netOperatingCashFlow - q1.capex;
  const annualizedQ1Fcf = fcfQ1 * 4;
  const dividendCashCost = (fy.dividendPerShare ?? data.marketData.dividendPerShareUsd) * data.marketData.sharesOutstandingM;
  const coreNetIncomeProxy = fy.coreEps * data.marketData.sharesOutstandingM;
  const ebitdaProxy = fy.reportedOperatingProfit + 5_733;

  return {
    trend: [
      { period: fy.label, revenue: fy.totalRevenue, coreOperatingMargin: fy.coreOperatingMargin, coreEps: fy.coreEps, fcf: fcfFy },
      { period: q1.label, revenue: q1.totalRevenue, coreOperatingMargin: q1.coreOperatingMargin, coreEps: q1.coreEps, fcf: fcfQ1 },
    ],
    revenueGrowth: q1.revenueGrowthCer,
    grossMargin: q1.grossMargin,
    coreOperatingMargin: q1.coreOperatingMargin,
    rdAsPctSales: safeRatio(q1.coreRdExpense, q1.totalRevenue),
    sgaAsPctSales: safeRatio(q1.coreSgaExpense, q1.totalRevenue),
    fcfConversion: safeRatio(fcfFy, fy.coreOperatingProfit),
    q1AnnualizedFcfConversion: safeRatio(annualizedQ1Fcf, q1.coreOperatingProfit * 4),
    netDebtToEbitda: safeRatio(q1.netDebt, ebitdaProxy),
    dividendCoverageByFcf: safeRatio(fcfFy, dividendCashCost),
    dividendCoverageByCoreEps: safeRatio(fy.coreEps, fy.dividendPerShare ?? data.marketData.dividendPerShareUsd),
    roic: 0.16,
    wacc: assumptions.wacc,
    roicWaccSpread: 0.16 - assumptions.wacc,
    epsGrowth: q1.coreEps / Math.max(2.45, 0.01) - 1,
    coreVsReportedBridge: [
      { label: "Reported EPS", value: q1.reportedEps },
      { label: "Restructuring", value: 0.03 },
      { label: "Intangible amortization / impairments", value: 0.52 },
      { label: "Other", value: 0.04 },
      { label: "Core EPS", value: q1.coreEps },
    ],
    marginBridge: [
      { label: "Reported operating margin", value: q1.reportedOperatingMargin },
      { label: "Core adjustments", value: q1.coreOperatingMargin - q1.reportedOperatingMargin },
      { label: "Core operating margin", value: q1.coreOperatingMargin },
    ],
    rdProductivity: {
      phase3PositiveReadoutsTtm: 16,
      majorApprovalsTtm: 43,
      q1Readouts: 4,
      q1Approvals: 14,
      signal: "Strong pipeline output, but launch spend and partner-profit-share drag must be watched.",
    },
    adjustmentQuality: "Core adjustments are large, especially intangible amortisation, so the module keeps reported and core EPS visibly separate.",
    warnings: [
      "Do not value AZN by mixing reported EPS with a core EPS multiple.",
      "Partnered ADC/biologic assets can reduce gross margin through profit-share payments recorded in cost of sales.",
    ],
    coreNetIncomeProxy,
  };
}
