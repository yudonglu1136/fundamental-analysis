import type { ValuationResult } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { clamp, safeDivide } from "../../utils/financialMath";
import { checkImpossibleCagrCombination, checkPeSanity } from "../../utils/validation";
import { buildPriceValidationWarnings, computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import type { MetaAssumptions } from "./assumptions";
import type { MetaDataset, MetaEvaluatedRow } from "./calculations";

function annualize(value: number) {
  return value * 4;
}

function perShare(value: number, shares: number) {
  return safeDivide(value, Math.max(shares, 1));
}

export function calculateMetaValuation(model: MetaDataset, assumptions: MetaAssumptions): ValuationResult {
  const row: MetaEvaluatedRow = model.selectedRow;
  const shares = Math.max(row.sharesOutstanding, 1);
  const currentPrice = assumptions.currentPrice || model.currentPrice;
  const annualRevenue = annualize(row.totalRevenue);
  const annualFamilyAppsRevenue = annualize(row.familyAppsRevenue);
  const annualAdRevenue = annualize(row.adRevenue);
  const annualFcf = annualize(row.fcf);

  const upliftRate = clamp(
    assumptions.aiConversionUplift + assumptions.aiCpmUplift + assumptions.aiEngagementUplift + assumptions.aiCreativeAutomationUplift,
    0,
    0.25,
  );
  const aiAdRevenueUpliftAnnual = annualAdRevenue * upliftRate;
  const aiAdOperatingProfitAnnual = aiAdRevenueUpliftAnnual * assumptions.incrementalAdMargin - assumptions.aiServingCost - annualize(row.aiAdStackOpex);
  const aiAdAfterTaxOperatingProfitAnnual = aiAdOperatingProfitAnnual * (1 - assumptions.taxRate);
  const aiAdAfterTaxOperatingProfitPerShare = perShare(aiAdAfterTaxOperatingProfitAnnual, shares);
  const aiAdRoic = safeDivide(aiAdAfterTaxOperatingProfitAnnual, assumptions.aiInvestedCapital);
  const aiPaybackYears = safeDivide(assumptions.aiInvestedCapital, Math.max(aiAdAfterTaxOperatingProfitAnnual, 0.1));
  const aiRevenuePerCapex = safeDivide(aiAdRevenueUpliftAnnual, assumptions.aiInvestedCapital);

  const coreAdsEbit = annualFamilyAppsRevenue * assumptions.operatingMargin;
  const coreAdsFairValue = perShare(coreAdsEbit * (1 - assumptions.taxRate) * assumptions.targetPe, shares);
  const fcfYieldFairValue = safeDivide(assumptions.fcfPerShare, assumptions.targetFcfYield);

  const normalizedCoreFcfPerShare = Math.max(0, assumptions.fcfPerShare - aiAdAfterTaxOperatingProfitPerShare);
  const dcfGrowthRate = clamp(
    assumptions.revenueGrowth * 0.45 +
      assumptions.adRevenueGrowth * 0.2 +
      assumptions.adImpressionsGrowth * 0.15 +
      assumptions.cpmGrowth * 0.15 +
      upliftRate * 0.75 +
      Math.max(0, assumptions.whatsappMargin - 0.25) * 0.05 -
      Math.max(0, assumptions.aiCapexGrowth - 0.2) * 0.12,
    0.03,
    0.2,
  );
  let dcfValue = 0;
  let projectedFcfPerShare = normalizedCoreFcfPerShare;
  for (let year = 1; year <= 5; year += 1) {
    projectedFcfPerShare *= 1 + dcfGrowthRate;
    dcfValue += projectedFcfPerShare / (1 + assumptions.wacc) ** year;
  }
  const terminalFcfPerShare = projectedFcfPerShare * (1 + assumptions.terminalGrowth);
  const terminalValue = assumptions.wacc > assumptions.terminalGrowth
    ? terminalFcfPerShare / (assumptions.wacc - assumptions.terminalGrowth)
    : terminalFcfPerShare * 25;
  dcfValue += terminalValue / (1 + assumptions.wacc) ** 5;

  const aiUpliftGrowth = clamp(upliftRate * 0.7 + assumptions.aiCapexGrowth * 0.12, 0.04, 0.22);
  let incrementalAiAfterTaxPv = 0;
  for (let year = 1; year <= 5; year += 1) {
    const projectedProfit = aiAdAfterTaxOperatingProfitAnnual * (1 + aiUpliftGrowth) ** year;
    incrementalAiAfterTaxPv += projectedProfit / (1 + assumptions.wacc) ** year;
  }
  const aiAdRoicUpliftValue = perShare(incrementalAiAfterTaxPv - assumptions.aiInvestedCapital, shares);

  const whatsappValue = assumptions.whatsappRevenue * assumptions.whatsappMargin * assumptions.whatsappMultiple;
  const realityLabsValue = -assumptions.realityLabsLoss * 2 + assumptions.realityLabsOptionalityValue;
  const netCashPerShare = 16;
  const sotpValue = coreAdsFairValue + perShare(whatsappValue + realityLabsValue, shares) + netCashPerShare;

  const futureEps = assumptions.forwardEps * (1 + clamp(assumptions.revenueGrowth + upliftRate * 0.7 - assumptions.realityLabsLoss / 800, 0.05, 0.28)) ** 3;
  const targetPrice3Y = futureEps * assumptions.exitMultiple + assumptions.whatsappOptionalityValue + assumptions.realityLabsOptionalityValue;
  const cumulativeDividends = assumptions.cumulativeDividends || currentPrice * assumptions.dividendYield * 3;
  const expectedShareholderCagr = computeExpectedShareholderCagr(targetPrice3Y, currentPrice, cumulativeDividends);
  const upsideDownside = computeUpsideDownside(
    (coreAdsFairValue * 0.3) + (fcfYieldFairValue * 0.25) + (aiAdRoicUpliftValue * 0.2) + (sotpValue * 0.15) + (dcfValue * 0.1),
    currentPrice,
  );

  const blendedFairValue = (coreAdsFairValue * 0.3) + (fcfYieldFairValue * 0.25) + (aiAdRoicUpliftValue * 0.2) + (sotpValue * 0.15) + (dcfValue * 0.1);
  const aiAdAfterTaxProfitDrag = aiAdAfterTaxOperatingProfitPerShare;

  const validationWarnings = [
    ...buildPriceValidationWarnings("META", currentPrice, model.latestReferenceDate),
    ...checkPeSanity(coreAdsFairValue, 500, 900, "META"),
    ...checkImpossibleCagrCombination(upsideDownside, expectedShareholderCagr),
    ...(assumptions.forwardEps < 10
      ? [{
          id: "meta-quarterly-eps-used",
          title: "EPS may be quarterly or not annualized",
          detail: "Meta valuation expects annual forward EPS. Inputs below 10 usually indicate quarterly EPS leaked into the model.",
          severity: "high" as const,
        }]
      : []),
    ...((assumptions.aiAdRoic > 0.3 && upliftRate < 0.08)
      ? [{
          id: "meta-ai-roic-sanity",
          title: "AI Ad ROIC looks too high for the current uplift assumptions",
          detail: "High AI Ad ROIC without meaningful conversion, CPM, or engagement uplift often signals a modeling error.",
          severity: "medium" as const,
        }]
      : []),
    ...((assumptions.realityLabsLoss <= 0)
      ? [{
          id: "meta-reality-labs-drag",
          title: "Reality Labs drag may be omitted",
          detail: "Reality Labs typically remains a drag in the institutional framework, so a zero or negative loss assumption should be reviewed.",
          severity: "medium" as const,
        }]
      : []),
  ];

  const warning = currentPrice < 300 || currentPrice > 850
    ? "Current price may be stale or incorrect."
    : undefined;

  return {
    warning,
    currentPrice,
    validationWarnings,
    methodCards: [
      { key: "current-fair", label: "Current Fair Value", value: blendedFairValue, format: "currency", description: "Weighted blend of core Ads, FCF, AI Ad ROIC uplift, SOTP, and DCF." },
      { key: "target-3y", label: "3Y Target Price", value: targetPrice3Y, format: "currency", description: "Three-year target price using annual forward EPS and exit multiple, plus optionality." },
      { key: "core-ads", label: "Core Ads P/E", value: coreAdsFairValue, format: "currency", description: "Family of Apps advertising earnings valued on forward EPS and target P/E." },
      { key: "fcf-yield", label: "FCF Yield Fair Value", value: fcfYieldFairValue, format: "currency", description: "Annual FCF per share capitalized at the target FCF yield." },
      { key: "ai-uplift", label: "AI Ad ROIC Uplift", value: aiAdRoicUpliftValue, format: "currency", description: "PV of incremental AI ad profit less AI invested capital. AI CapEx is not subtracted a second time." },
      { key: "sotp", label: "SOTP Value", value: sotpValue, format: "currency", description: "Family of Apps, WhatsApp optionality, Reality Labs drag, and net cash." },
      { key: "dcf", label: "AI-Adjusted DCF", value: dcfValue, format: "currency", description: "Five-year DCF on normalized FCF. AI CapEx is already embedded in FCF, so it is not deducted again." },
      { key: "roic", label: "AI Ad ROIC", value: aiAdRoic, format: "percent", description: "After-tax AI Ad operating profit divided by AI invested capital." },
      { key: "payback", label: "AI Payback Period", value: aiPaybackYears, format: "number", description: "Simple payback estimate from AI Ad after-tax operating profit." },
      { key: "revenue-per-capex", label: "AI Revenue / AI CapEx", value: aiRevenuePerCapex, format: "number", description: "AI monetization throughput relative to the capital base." },
    ],
    expectedReturnBridge: [
      { key: "core-growth", label: "Core Revenue Growth", value: assumptions.revenueGrowth, format: "percent", description: "Family of Apps revenue growth contribution." },
      { key: "ai-uplift", label: "AI Ad Uplift", value: upliftRate, format: "percent", description: "Conversion, CPM, engagement, and creative automation uplift combined." },
      { key: "whatsapp", label: "WhatsApp Optionality", value: safeDivide(assumptions.whatsappOptionalityValue, Math.max(currentPrice, 1)) / 3, format: "percent", description: "Rough 3-year contribution from WhatsApp optionality." },
      { key: "reality-labs", label: "Reality Labs Drag", value: -safeDivide(assumptions.realityLabsLoss, 1000), format: "percent", description: "Reality Labs remains a negative drag on equity value in the base case." },
      { key: "multiple", label: "Multiple Effect", value: Math.pow(Math.max(assumptions.exitMultiple, 1) / Math.max(assumptions.targetPe, 1), 1 / 3) - 1, format: "percent", description: "3-year multiple expansion or compression." },
      { key: "dividend", label: "Dividend Yield", value: assumptions.dividendYield, format: "percent", description: "Cash dividend contribution to shareholder return." },
    ],
    fairValues: (["Bear", "Base", "Bull"] as const).map((scenario) => ({
      scenario,
      fairValue: blendedFairValue,
      targetPrice3Y,
      cumulativeDividends,
      upsideDownside,
      expectedReturn3Y: expectedShareholderCagr,
      summary: scenario === "Base" ? "Base-case blended view." : undefined,
    })),
    customSummary: "Meta is modeled as an AI Ad ROIC engine. AI CapEx is captured in FCF and uplift is captured separately in the AI Ad ROIC method, so it is not double-counted.",
    sensitivityTables: [
      {
        title: "Forward EPS x Target P/E",
        table: buildSensitivityTable(
          "Forward EPS",
          "Target P/E",
          [assumptions.forwardEps - 2, assumptions.forwardEps - 1, assumptions.forwardEps, assumptions.forwardEps + 1, assumptions.forwardEps + 2],
          [assumptions.targetPe - 4, assumptions.targetPe - 2, assumptions.targetPe, assumptions.targetPe + 2, assumptions.targetPe + 4],
          (eps, pe) => eps * pe,
        ),
      },
      {
        title: "FCF / Share x FCF Yield",
        table: buildSensitivityTable(
          "FCF / Share",
          "FCF Yield",
          [assumptions.fcfPerShare - 3, assumptions.fcfPerShare - 1.5, assumptions.fcfPerShare, assumptions.fcfPerShare + 1.5, assumptions.fcfPerShare + 3],
          [assumptions.targetFcfYield - 0.01, assumptions.targetFcfYield - 0.005, assumptions.targetFcfYield, assumptions.targetFcfYield + 0.005, assumptions.targetFcfYield + 0.01],
          (fcfPerShare, yieldRate) => safeDivide(fcfPerShare, yieldRate),
        ),
      },
      {
        title: "AI Uplift x Incremental Margin",
        table: buildSensitivityTable(
          "AI Uplift",
          "Margin",
          [upliftRate - 0.02, upliftRate - 0.01, upliftRate, upliftRate + 0.01, upliftRate + 0.02],
          [assumptions.incrementalAdMargin - 0.08, assumptions.incrementalAdMargin - 0.04, assumptions.incrementalAdMargin, assumptions.incrementalAdMargin + 0.04, assumptions.incrementalAdMargin + 0.08],
          (rate, margin) => perShare((annualAdRevenue * rate * margin - assumptions.aiServingCost - annualize(row.aiAdStackOpex)) * (1 - assumptions.taxRate), shares),
        ),
      },
      {
        title: "WACC x Terminal Growth DCF",
        table: buildSensitivityTable(
          "WACC",
          "Terminal Growth",
          [assumptions.wacc - 0.01, assumptions.wacc - 0.005, assumptions.wacc, assumptions.wacc + 0.005, assumptions.wacc + 0.01],
          [assumptions.terminalGrowth - 0.01, assumptions.terminalGrowth - 0.005, assumptions.terminalGrowth, assumptions.terminalGrowth + 0.005, assumptions.terminalGrowth + 0.01],
          (wacc, terminalGrowth) => {
            let value = 0;
            let projected = normalizedCoreFcfPerShare;
            for (let year = 1; year <= 5; year += 1) {
              projected *= 1 + dcfGrowthRate;
              value += projected / (1 + wacc) ** year;
            }
            const terminal = projected * (1 + terminalGrowth) / Math.max(wacc - terminalGrowth, 0.01);
            return value + terminal / (1 + wacc) ** 5;
          },
        ),
      },
    ],
  };
}
