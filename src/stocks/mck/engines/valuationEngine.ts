import type { ValidationWarning } from "../../types";
import type { MckDataset, MckValuationOutput } from "../types";
import { presentValue, safeDivide, segmentsForPeriod, latestFinancial } from "./helpers";

function dcfValue(data: MckDataset) {
  const assumptions = data.assumptions;
  const cashFlows = Array.from({ length: 5 }, (_, index) => {
    const year = index + 1;
    return assumptions.ownerEarningsBase * (1 + assumptions.normalizedFcfGrowth) ** year;
  });
  const discountedCashFlows = cashFlows.reduce((sum, cashFlow, index) => sum + presentValue(cashFlow, assumptions.wacc, index + 1), 0);
  const terminalFcf = cashFlows[cashFlows.length - 1] * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcf / Math.max(assumptions.wacc - assumptions.terminalGrowth, 0.01);
  const discountedTerminal = presentValue(terminalValue, assumptions.wacc, 5);
  const enterpriseValue = discountedCashFlows + discountedTerminal;
  const normalizedWorkingCapitalAdjustment = data.assumptions.normalizedFcf - latestFinancial(data).freeCashFlow;
  const equityValue = enterpriseValue - assumptions.netDebt + normalizedWorkingCapitalAdjustment;
  return {
    enterpriseValue,
    equityValue,
    perShare: safeDivide(equityValue, assumptions.dilutedShares),
    terminalValueShare: safeDivide(discountedTerminal, enterpriseValue),
    normalizedWorkingCapitalAdjustment,
  };
}

function sotpValue(data: MckDataset) {
  const assumptions = data.assumptions;
  const latestSegments = segmentsForPeriod(data, latestFinancial(data).periodId);
  const multipleBySegment = {
    "North American Pharmaceutical": assumptions.coreDistributionMultiple,
    "Oncology & Multispecialty": assumptions.oncologyMultiple,
    "Prescription Technology Solutions": assumptions.rxTechnologyMultiple,
    "Medical-Surgical Solutions": assumptions.medSurgMultiple,
    "International / Other": 5,
    "Corporate / Other": -1,
  };
  const rows = latestSegments
    .filter((segment) => segment.adjustedOperatingProfit !== 0)
    .map((segment) => ({
      segment: segment.segment,
      metric: segment.adjustedOperatingProfit,
      multiple: multipleBySegment[segment.segment],
      value: segment.adjustedOperatingProfit * multipleBySegment[segment.segment],
      sourceType: segment.tag.sourceType,
    }));
  const enterpriseValue = rows.reduce((sum, row) => sum + row.value, 0) + assumptions.corporateCostValue;
  return {
    rows,
    enterpriseValue,
    equityValue: enterpriseValue - assumptions.netDebt,
    perShare: safeDivide(enterpriseValue - assumptions.netDebt, assumptions.dilutedShares),
  };
}

export function calculateMckValuationEngine(data: MckDataset): MckValuationOutput {
  const assumptions = data.assumptions;
  const warnings: ValidationWarning[] = [];
  const peFairValue = assumptions.forwardAdjustedEps * assumptions.targetPe;
  const fcfYieldFairValue = safeDivide(assumptions.fcfPerShare, assumptions.targetFcfYield);
  const dcf = dcfValue(data);
  const sotp = sotpValue(data);
  const totalWeight = assumptions.weightPe + assumptions.weightFcfYield + assumptions.weightDcf + assumptions.weightSotp;
  const blendedFairValue = safeDivide(
    peFairValue * assumptions.weightPe +
      fcfYieldFairValue * assumptions.weightFcfYield +
      dcf.perShare * assumptions.weightDcf +
      sotp.perShare * assumptions.weightSotp,
    totalWeight,
  );

  if (dcf.terminalValueShare > 0.75) {
    warnings.push({
      id: "mck-dcf-terminal-heavy",
      title: "DCF terminal value dominates",
      detail: `Terminal value is ${(dcf.terminalValueShare * 100).toFixed(0)}% of enterprise value. Treat the DCF as a cross-check, not a precision anchor.`,
      severity: "medium",
    });
  }
  if (data.managementQuotes.length > 0) {
    warnings.push({
      id: "mck-transcripts-research-only",
      title: "Transcript-derived fields are research-only",
      detail: "Management quotes and Q&A tags are displayed in intelligence panels and do not feed valuation formulas.",
      severity: "low",
    });
  }
  if (data.reportedFinancials.some((row) => row.dilutedSharesTag.isPlaceholder || row.netDebtTag.isPlaceholder)) {
    warnings.push({
      id: "mck-placeholder-per-share-inputs",
      title: "Some per-share valuation inputs are placeholders",
      detail: "Diluted shares and net debt should be refreshed from the 10-K / 10-Q parser before investment use.",
      severity: "high",
    });
  }

  return {
    peFairValue,
    fcfYieldFairValue,
    dcfFairValue: dcf.perShare,
    sotpFairValue: sotp.perShare,
    blendedFairValue,
    valuationRangeLow: Math.min(peFairValue, fcfYieldFairValue, dcf.perShare, sotp.perShare),
    valuationRangeHigh: Math.max(peFairValue, fcfYieldFairValue, dcf.perShare, sotp.perShare),
    marginOfSafety: safeDivide(blendedFairValue, assumptions.currentPrice) - 1,
    ownerEarningsDcf: {
      enterpriseValue: dcf.enterpriseValue,
      equityValue: dcf.equityValue,
      terminalValueShare: dcf.terminalValueShare,
      normalizedWorkingCapitalAdjustment: dcf.normalizedWorkingCapitalAdjustment,
    },
    sotp: sotp.rows,
    warnings,
  };
}
