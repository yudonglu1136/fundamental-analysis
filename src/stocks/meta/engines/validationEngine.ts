import type { ValidationWarning } from "../../types";
import { metaAssumptionMetadata, metaValuationAssumptionKeys } from "../assumptions";
import type { MetaDataset, MetaForecastYear, MetaValuationAssumptions, MetaValuationOutput } from "../model";
import { safeRatio } from "./helpers";

function warning(id: string, title: string, detail: string, severity: ValidationWarning["severity"]): ValidationWarning {
  return { id, title, detail, severity };
}

export function calculateMetaValidationWarnings(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
  forecast: MetaForecastYear[],
  valuation?: MetaValuationOutput,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const actualPeriods = data.periods;
  const lineageRows = [
    ...data.sources,
    ...data.periods,
    ...data.segments,
    ...data.guidance,
    ...data.adEconomics,
    ...data.aiCapex,
    ...data.productSignals,
    ...data.realityLabs,
    ...data.regulatoryRisks,
    ...data.transcriptInsights,
    ...data.earningsCalls,
    ...data.researchNotes,
    data.marketData,
  ];
  const lineageCoverage = lineageRows.filter((row) => Boolean(row.lineage)).length / Math.max(lineageRows.length, 1);
  if (lineageCoverage < 0.95) {
    warnings.push(warning(
      "meta-lineage-coverage",
      "Critical data lineage coverage is incomplete",
      `Row-level DataLineage coverage is ${(lineageCoverage * 100).toFixed(1)}%.`,
      "medium",
    ));
  }
  const missingAssumptionMetadata = metaValuationAssumptionKeys.filter((key) => !metaAssumptionMetadata[key]?.lineage);
  if (missingAssumptionMetadata.length > 0) {
    warnings.push(warning(
      "meta-assumption-metadata-missing",
      "Assumption metadata is incomplete",
      `${missingAssumptionMetadata.length} valuation assumption(s) lack lineage metadata.`,
      "high",
    ));
  }
  const productSignalsDirectInput = data.productSignals.filter((signal) => signal.lineage.valuationTreatment === "direct_input");
  if (productSignalsDirectInput.length > 0) {
    warnings.push(warning(
      "meta-product-signal-direct-input",
      "Product signals are directly entering valuation",
      "Product-cycle signals must pass through named forecast assumptions before affecting fair value.",
      "high",
    ));
  }

  for (const period of actualPeriods) {
    const segmentRows = data.segments.filter((row) => row.periodId === period.id);
    const segmentRevenue = segmentRows.reduce((sum, row) => sum + row.revenue, 0);
    const segmentOperatingIncome = segmentRows.reduce((sum, row) => sum + row.operatingIncome, 0);
    if (Math.abs(segmentRevenue - period.revenue) > 0.02) {
      warnings.push(warning(
        `meta-segment-revenue-${period.id}`,
        "Segment revenue does not reconcile",
        `${period.label} segment revenue ${segmentRevenue.toFixed(3)} does not tie to consolidated revenue ${period.revenue.toFixed(3)}.`,
        "high",
      ));
    }
    if (Math.abs(segmentOperatingIncome - period.operatingIncome) > 0.02) {
      warnings.push(warning(
        `meta-segment-oi-${period.id}`,
        "Segment operating income does not reconcile",
        `${period.label} segment operating income ${segmentOperatingIncome.toFixed(3)} does not tie to consolidated operating income ${period.operatingIncome.toFixed(3)}.`,
        "high",
      ));
    }
    const simpleFcf = period.operatingCashFlow - period.capitalExpendituresInclFinanceLeases;
    if (Math.abs(simpleFcf - period.freeCashFlow) > 0.05) {
      warnings.push(warning(
        `meta-fcf-reconcile-${period.id}`,
        "FCF bridge does not reconcile",
        `${period.label} operating cash flow less capex is ${simpleFcf.toFixed(3)} versus reported FCF ${period.freeCashFlow.toFixed(3)}.`,
        "high",
      ));
    }
  }

  for (const point of data.adEconomics) {
    const implied = (1 + point.adImpressionsGrowth) * (1 + point.averagePricePerAdGrowth) - 1;
    if (point.adRevenueGrowth != null && Math.abs(point.adRevenueGrowth - implied) > 0.08) {
      warnings.push(warning(
        `meta-ad-bridge-${point.periodId}`,
        "Ad revenue bridge needs review",
        `${point.periodId} ad growth differs from impressions x price by more than 8ppt; FX, mix, or disclosure definitions may explain the gap.`,
        "medium",
      ));
    }
  }

  const weights = assumptions.weightDcf + assumptions.weightFcfYield + assumptions.weightPe + assumptions.weightEvEbit + assumptions.weightSotp;
  if (Math.abs(weights - 1) > 0.0001) {
    warnings.push(warning(
      "meta-weight-sum",
      "Valuation weights do not sum to 100%",
      `Weights sum to ${(weights * 100).toFixed(1)}%.`,
      "high",
    ));
  }

  const capexGuide = data.guidance.find((item) => item.id === "fy2026-capex-guide");
  if (capexGuide?.capexLow != null && capexGuide.capexHigh != null && (assumptions.capex2026 < capexGuide.capexLow || assumptions.capex2026 > capexGuide.capexHigh)) {
    warnings.push(warning(
      "meta-capex-outside-guide",
      "2026 capex is outside management guidance",
      `The selected 2026 capex assumption of USD ${assumptions.capex2026.toFixed(1)}bn sits outside the USD ${capexGuide.capexLow.toFixed(0)}bn to USD ${capexGuide.capexHigh.toFixed(0)}bn range.`,
      "medium",
    ));
  }

  const q2Guide = data.guidance.find((item) => item.id === "q2-2026-revenue-guide");
  const q1Actual = data.periods.find((period) => period.id === "q1_2026");
  const yearOneBridge = forecast[0]?.revenueBridge;
  if (!yearOneBridge || !q1Actual || !q2Guide?.revenueLow || !q2Guide.revenueHigh) {
    warnings.push(warning(
      "meta-revenue-bridge-missing",
      "2026 revenue bridge is missing Q1/Q2/H2 decomposition",
      "Year-one forecast should reconcile Q1 actuals, Q2 guidance, and implied H2 revenue.",
      "high",
    ));
  } else {
    const q2Mid = (q2Guide.revenueLow + q2Guide.revenueHigh) / 2;
    if (Math.abs(yearOneBridge.q1Actual - q1Actual.revenue) > 0.01 || Math.abs(yearOneBridge.q2GuidanceMidpoint - q2Mid) > 0.01) {
      warnings.push(warning(
        "meta-revenue-bridge-anchor-gap",
        "2026 revenue bridge does not tie to official anchors",
        "Q1 actual or Q2 guidance midpoint in the forecast bridge does not tie to official data.",
        "high",
      ));
    }
  }

  if (assumptions.aiRevenueUpliftPct > 0 && valuation && valuation.aiExcessReturnValuePerShare > 0 && valuation.blendedFairValue > 0) {
    warnings.push(warning(
      "meta-ai-uplift-is-diagnostic",
      "AI uplift is not added to the base blend",
      "AI excess-return value is shown as a diagnostic because revenue growth, margin, and capex already embed AI monetization. This avoids double counting.",
      "low",
    ));
  }

  if (valuation && valuation.dcf.terminalValueShareOfEv > 0.78) {
    warnings.push(warning(
      "meta-terminal-value-heavy",
      "DCF terminal value concentration is high",
      `Terminal value is ${(valuation.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of enterprise value.`,
      "medium",
    ));
  }

  const yearFive = forecast[forecast.length - 1];
  if (yearFive && yearFive.aiRoic < assumptions.wacc) {
    warnings.push(warning(
      "meta-ai-roic-below-wacc",
      "AI ROIC is below WACC",
      `Year-five AI ROIC is ${(yearFive.aiRoic * 100).toFixed(1)}% versus WACC of ${(assumptions.wacc * 100).toFixed(1)}%.`,
      "medium",
    ));
  }

  if (assumptions.buybackYield > 0.025 && forecast.some((row) => row.unleveredFreeCashFlow < 0)) {
    warnings.push(warning(
      "meta-buyback-with-negative-fcf",
      "Buyback assumption may be too aggressive",
      "The model reduces share count while forecast FCF is negative in at least one year.",
      "medium",
    ));
  }

  const buybackYearOne = forecast[0];
  if (buybackYearOne && buybackYearOne.buybackShareReduction + 0.002 < assumptions.buybackYield) {
    warnings.push(warning(
      "meta-buyback-spend-caps-share-reduction",
      "Buyback spend does not support the selected buyback yield",
      `2026 buyback spend supports ${(buybackYearOne.buybackShareReduction * 100).toFixed(1)}% share-count reduction versus selected ${(assumptions.buybackYield * 100).toFixed(1)}%.`,
      "medium",
    ));
  }

  const sbcDilutionNet = assumptions.annualDilutionFromSbc - assumptions.buybackYield;
  if (Math.abs(sbcDilutionNet) > 0.04 || !Number.isFinite(sbcDilutionNet)) {
    warnings.push(warning(
      "meta-share-count-sanity",
      "Share-count bridge looks unstable",
      `Net annual share-count change is ${(sbcDilutionNet * 100).toFixed(1)}%.`,
      "high",
    ));
  }

  const q1 = data.periods.find((period) => period.id === "q1_2026");
  const latestFcfMargin = q1 ? safeRatio(q1.freeCashFlow * 4, q1.revenue * 4) : 0;
  if (forecast[0] && forecast[0].capexIntensity > 0.5 && forecast[0].fcfPerShare > latestFcfMargin * assumptions.currentPrice * 0.2) {
    warnings.push(warning(
      "meta-fcf-capex-consistency",
      "FCF should be read against high capex intensity",
      "The 2026 buildout creates high capex intensity; rely on explicit FCFF bridge rather than a headline margin score.",
      "low",
    ));
  }

  if (valuation && valuation.valuationRangeHigh / Math.max(valuation.valuationRangeLow, 1) < 1.12) {
    warnings.push(warning(
      "meta-scenario-spread-too-tight",
      "Valuation method spread may be too tight",
      "Institutional valuation should show enough dispersion across DCF, FCF yield, P/E, EV/EBIT, and SOTP to expose model risk.",
      "low",
    ));
  }

  return warnings;
}
