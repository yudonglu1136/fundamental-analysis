import type { ValidationWarning } from "../../types";
import { calculatePltrValuationEngine } from "../engines/valuationEngine";
import type { PltrDataset, PltrValuationAssumptions } from "../model";

function warning(id: string, title: string, detail: string, severity: ValidationWarning["severity"]): ValidationWarning {
  return { id, title, detail, severity };
}

function closeTo(actual: number, expected: number, tolerance = 0.015) {
  return Math.abs(actual - expected) <= tolerance;
}

export function validatePltrModel(dataset: PltrDataset, assumptions: PltrValuationAssumptions): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const period of dataset.actuals) {
    const revenue = period.metrics.revenue.value;
    const commercial = period.metrics.commercialRevenue.value;
    const government = period.metrics.governmentRevenue.value;
    if (revenue && commercial && government && Math.abs(commercial + government - revenue) / revenue > 0.03) {
      warnings.push(warning(`pltr-segment-reconciliation-${period.periodId}`, "Segment revenue does not reconcile", `${period.label} commercial plus government revenue differs from total revenue by more than 3%.`, "medium"));
    }

    const adjustedOperatingIncome = period.metrics.adjustedOperatingIncome.value;
    const adjustedOperatingMargin = period.metrics.adjustedOperatingMargin.value;
    if (revenue && adjustedOperatingIncome && adjustedOperatingMargin && !closeTo(adjustedOperatingIncome / revenue, adjustedOperatingMargin, 0.025)) {
      warnings.push(warning(`pltr-adjusted-margin-${period.periodId}`, "Adjusted margin mismatch", `${period.label} adjusted operating margin does not match adjusted operating income / revenue.`, "medium"));
    }

    const gaapOperatingIncome = period.metrics.gaapOperatingIncome.value;
    const gaapOperatingMargin = period.metrics.gaapOperatingMargin.value;
    if (revenue && gaapOperatingIncome && gaapOperatingMargin && !closeTo(gaapOperatingIncome / revenue, gaapOperatingMargin, 0.025)) {
      warnings.push(warning(`pltr-gaap-margin-${period.periodId}`, "GAAP margin mismatch", `${period.label} GAAP operating margin does not match GAAP operating income / revenue.`, "medium"));
    }

    const adjustedFcf = period.metrics.adjustedFreeCashFlow.value;
    const fcfMargin = period.metrics.fcfMargin.value;
    if (revenue && adjustedFcf && fcfMargin && !closeTo(adjustedFcf / revenue, fcfMargin, 0.035)) {
      warnings.push(warning(`pltr-fcf-margin-${period.periodId}`, "FCF margin mismatch", `${period.label} FCF margin does not match adjusted FCF / revenue.`, "medium"));
    }

    const sbc = period.metrics.sbcExpense.value;
    const sbcPctRevenue = period.metrics.sbcAsPctRevenue.value;
    if (revenue && sbc && sbcPctRevenue && !closeTo(sbc / revenue, sbcPctRevenue, 0.01)) {
      warnings.push(warning(`pltr-sbc-margin-${period.periodId}`, "SBC percentage mismatch", `${period.label} SBC / revenue does not match SBC expense / revenue.`, "medium"));
    }
  }

  const valuation = calculatePltrValuationEngine(dataset.actuals, assumptions);
  if (!Number.isFinite(valuation.selectedFairValue) || valuation.selectedFairValue <= 0) {
    warnings.push(warning("pltr-valuation-fair-value-invalid", "Invalid fair value", "Selected fair value is not finite and positive.", "high"));
  }
  if (assumptions.netCash < 0) {
    warnings.push(warning("pltr-negative-net-cash", "Negative net cash", "Net cash is negative. Confirm debt and cash treatment.", "medium"));
  }
  if (assumptions.dilutedShares <= 0) {
    warnings.push(warning("pltr-invalid-share-count", "Invalid share count", "Diluted share count must be positive.", "high"));
  }
  if (assumptions.wacc <= assumptions.terminalRevenueGrowth) {
    warnings.push(warning("pltr-dcf-wacc-terminal-growth", "WACC must exceed terminal growth", "DCF terminal growth is greater than or equal to WACC.", "high"));
  }

  const researchOnlyFields = ["aip", "ontology", "topicTrends", "qaPairs", "researchSignals"];
  const valuationSource = calculatePltrValuationEngine.toString();
  for (const field of researchOnlyFields) {
    if (valuationSource.includes(field)) {
      warnings.push(warning(`pltr-research-only-leak-${field}`, "Research-only signal enters valuation", `${field} appears in valuation engine source.`, "high"));
    }
  }

  return warnings;
}
