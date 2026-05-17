import type { MckDataset, MckDistributionEconomicsOutput } from "../types";
import { latestFinancial, safeDivide, segmentsForPeriod } from "./helpers";

export function calculateDistributionEconomicsEngine(data: MckDataset): MckDistributionEconomicsOutput {
  const latest = latestFinancial(data);
  const segment = segmentsForPeriod(data, latest.periodId).find((row) => row.segment === "North American Pharmaceutical");
  if (!segment) throw new Error("Missing North American Pharmaceutical segment");
  const assumptions = data.assumptions;
  const marginSensitivity = [-20, -10, 10, 20, 50].map((bpsChange) => {
    const pretaxProfitImpact = segment.revenue * (bpsChange / 10000);
    const afterTaxImpact = pretaxProfitImpact * (1 - assumptions.taxRate);
    return {
      bpsChange,
      pretaxProfitImpact,
      afterTaxImpact,
      epsImpact: safeDivide(afterTaxImpact, assumptions.dilutedShares),
      fcfImpact: afterTaxImpact * assumptions.fcfConversion,
    };
  });
  const operatingLeverageSignal = segment.adjustedOperatingProfitGrowth > segment.revenueGrowth ? "Positive" : "Neutral";
  const marginCompressionFlag = segment.marginBps < 100 || segment.adjustedOperatingProfitGrowth < segment.revenueGrowth - 0.03;

  return {
    segment,
    revenueHugeMarginThin:
      `FY2026 North American Pharmaceutical revenue is $${(segment.revenue / 1000).toFixed(1)}B, but adjusted operating margin is only ${segment.marginBps.toFixed(0)} bps. That is not automatically low quality; it is the business model.`,
    marginSensitivity,
    scaleAdvantageScore: 88,
    operatingLeverageSignal,
    marginCompressionFlag,
    workingCapitalIntensity: safeDivide(latest.operatingCashFlow - latest.freeCashFlow, segment.revenue),
    glp1Impact: {
      revenueTailwind: "GLP-1 can add prescription and specialty volume.",
      marginCaveat: "Revenue dollars can be lower-margin than specialty services, so revenue acceleration is not enough.",
      inventoryRisk: "High-value drug inventory can increase working-capital volatility if timing moves against payables.",
      netAssessment: "Neutral",
    },
  };
}
