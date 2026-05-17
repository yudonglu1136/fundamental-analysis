import type { ValidationWarning } from "../../types";
import type { MckDataset } from "../types";
import { checkMckDataQuality } from "./dataQualityChecks";
import { latestFinancial, safeDivide, segmentsForPeriod, sumSegments } from "../engines/helpers";
import { calculateBuybackEngine } from "../engines/buybackEngine";
import { calculateMckValuationEngine } from "../engines/valuationEngine";
import { calculateWorkingCapitalEngine } from "../engines/workingCapitalEngine";

export function validateMckDataset(data: MckDataset): ValidationWarning[] {
  const warnings: ValidationWarning[] = [...checkMckDataQuality(data)];
  const latest = latestFinancial(data);
  const latestSegments = segmentsForPeriod(data, latest.periodId);
  const totalProfit = sumSegments(latestSegments, "adjustedOperatingProfit");
  if (totalProfit <= 0) {
    warnings.push({
      id: "mck-segment-profit-missing",
      title: "Segment operating profit is missing",
      detail: "Latest segment adjusted operating profit sum is not positive.",
      severity: "high",
    });
  }
  const epsNetIncomeProxy = data.assumptions.forwardAdjustedEps * data.assumptions.dilutedShares;
  if (epsNetIncomeProxy <= 0) {
    warnings.push({
      id: "mck-eps-bridge-invalid",
      title: "EPS bridge cannot reconcile",
      detail: "Forward adjusted EPS times diluted shares must be positive.",
      severity: "high",
    });
  }
  const workingCapital = calculateWorkingCapitalEngine(data);
  if (workingCapital.fcfConversion < 0.6 || workingCapital.fcfConversion > 1.5) {
    warnings.push({
      id: "mck-fcf-conversion-outlier",
      title: "FCF conversion is outside normal range",
      detail: `Reported FCF conversion is ${(workingCapital.fcfConversion * 100).toFixed(0)}%; working-capital timing may be distorting owner earnings.`,
      severity: "medium",
    });
  }
  const buyback = calculateBuybackEngine(data);
  if (buyback.endingShares1Y >= buyback.beginningShares && data.assumptions.buybackAmount > 0) {
    warnings.push({
      id: "mck-buyback-no-share-reduction",
      title: "Buyback does not reduce share count",
      detail: "Positive buyback amount should reduce share count when average buyback price is positive.",
      severity: "high",
    });
  }
  const valuation = calculateMckValuationEngine(data);
  const sotpRevenueSegments = new Set(valuation.sotp.map((row) => row.segment));
  if (sotpRevenueSegments.size !== valuation.sotp.length) {
    warnings.push({
      id: "mck-sotp-duplicate-segments",
      title: "SOTP double-count risk",
      detail: "The SOTP includes at least one segment more than once.",
      severity: "high",
    });
  }
  if (valuation.ownerEarningsDcf.terminalValueShare > 0.8) {
    warnings.push({
      id: "mck-terminal-value-too-high",
      title: "DCF terminal value too dominant",
      detail: "Terminal value is more than 80% of DCF enterprise value.",
      severity: "medium",
    });
  }
  if (data.managementQuotes.some((quote) => quote.tag.sourceType === "transcript") && valuation.sotp.some((row) => row.sourceType === "transcript")) {
    warnings.push({
      id: "mck-transcripts-directly-in-valuation",
      title: "Transcript data leaked into valuation",
      detail: "Transcript-derived fields must remain research-only until manually promoted.",
      severity: "high",
    });
  }
  const segmentMargin = safeDivide(totalProfit, sumSegments(latestSegments, "revenue"));
  if (segmentMargin < 0.005 || segmentMargin > 0.03) {
    warnings.push({
      id: "mck-margin-range-review",
      title: "Distribution margin range needs review",
      detail: `Group adjusted segment margin is ${(segmentMargin * 100).toFixed(2)}%, outside the expected low-margin distribution range.`,
      severity: "medium",
    });
  }
  return warnings;
}
