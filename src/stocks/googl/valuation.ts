import type { ValuationResult } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { clamp, safeDivide } from "../../utils/financialMath";
import { checkImpossibleCagrCombination } from "../../utils/validation";
import { buildPriceValidationWarnings, computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import type { GooglAssumptions } from "./assumptions";
import type { GooglEvaluatedRow, GooglModel } from "./calculations";

function perShare(value: number, shares: number) {
  return safeDivide(value, Math.max(shares, 1));
}

function annualize(value: number) {
  return value * 4;
}

export function calculateGooglValuation(model: GooglModel, assumptions: GooglAssumptions): ValuationResult {
  const row = model.selectedRow;
  const shares = Math.max(row.sharesOutstanding, 1);
  const afterTax = 0.78;

  const annualSearchRevenue = annualize(row.searchRevenueEstimate);
  const annualYoutubeRevenue = annualize(row.youtubeRevenue);
  const annualCloudRevenue = annualize(row.cloudRevenueEstimate);
  const annualRevenue = annualize(row.totalRevenue);
  const annualSearchOperatingIncome = annualSearchRevenue * row.searchMarginEstimate;
  const annualYoutubeOperatingIncome = annualYoutubeRevenue * assumptions.youtubeMargin;
  const cloudPreTpuMargin = clamp(row.cloudOperatingMarginEstimate - row.tpuEfficiencySavingsRate * 0.08 - assumptions.tpuMarginAdvantage * 0.45, 0.12, row.cloudOperatingMarginEstimate);
  const annualCloudEbit = annualCloudRevenue * cloudPreTpuMargin;
  const annualFcf = annualRevenue * row.aiAdjustedFcfMargin;
  const forwardPeFairValue = assumptions.forwardEps * assumptions.forwardPe;
  const fcfYieldFairValue = safeDivide(perShare(annualFcf, shares), assumptions.targetFcfYield);

  const searchAdsValue = perShare(annualSearchOperatingIncome * afterTax * assumptions.searchValueMultiple, shares);
  const youtubeValue = perShare(annualYoutubeOperatingIncome * afterTax * assumptions.searchValueMultiple, shares);
  const cloudValue = perShare(annualCloudEbit * assumptions.cloudEvEbit, shares);
  const tpuMarginAdvantage = Math.max(assumptions.tpuMarginAdvantage, row.tpuGrossMarginAdvantageEstimate);
  const tpuUpliftValue =
    perShare((annualCloudRevenue * (row.cloudOperatingMarginEstimate - cloudPreTpuMargin)) * assumptions.cloudEvEbit, shares) +
    perShare(row.aiAnnualRevenueEstimate * tpuMarginAdvantage * afterTax * assumptions.aiValueMultiple * 0.35, shares);
  const otherBetsValue = assumptions.otherBetsValue;
  const netCashValue = assumptions.netCashPerShare;

  const currentFairValue = searchAdsValue + youtubeValue + cloudValue + tpuUpliftValue + otherBetsValue + netCashValue;

  const dcfRevenueGrowth = clamp(
    assumptions.searchGrowth * 0.45 + assumptions.cloudGrowth * 0.3 + assumptions.aiRevenueCagr * 0.25 + row.tpuEfficiencySavingsRate * 0.12 - assumptions.aiCapexGrowth * 0.08,
    0.04,
    0.18,
  );
  const dcfMargin = clamp(row.aiAdjustedFcfMargin, 0.12, 0.32);
  const discountedFcf = Array.from({ length: 5 }, (_, idx) => {
    const year = idx + 1;
    const projectedRevenue = annualRevenue * (1 + dcfRevenueGrowth) ** year;
    const projectedFcf = projectedRevenue * dcfMargin;
    return projectedFcf / (1 + assumptions.wacc) ** year;
  }).reduce((sum, value) => sum + value, 0);
  const terminalRevenue = annualRevenue * (1 + dcfRevenueGrowth) ** 5;
  const terminalFcf = terminalRevenue * dcfMargin;
  const terminalValue =
    assumptions.wacc > assumptions.terminalGrowth
      ? (terminalFcf * (1 + assumptions.terminalGrowth)) / (assumptions.wacc - assumptions.terminalGrowth)
      : terminalFcf * 18;
  const aiAdjustedDcfValue = perShare(discountedFcf + terminalValue / (1 + assumptions.wacc) ** 5, shares);

  const incrementalAiFcf = Math.max(
    0,
    row.aiAnnualRevenueEstimate * assumptions.aiOperatingMargin * afterTax +
      annualRevenue * row.tpuEfficiencySavingsRate * 0.03,
  );
  const aiValueGrowth = clamp(assumptions.aiRevenueCagr - assumptions.aiCapexGrowth * 0.35 + tpuMarginAdvantage * 1.4, 0.04, 0.25);
  const aiValuePv = Array.from({ length: 5 }, (_, idx) => {
    const year = idx + 1;
    const projectedAiFcf = incrementalAiFcf * (1 + aiValueGrowth) ** year;
    return projectedAiFcf / (1 + assumptions.wacc) ** year;
  }).reduce((sum, value) => sum + value, 0);
  const aiValueCreationValue = perShare(aiValuePv - row.aiInvestedCapitalEstimate, shares);

  const futureSearchOperatingIncome = annualSearchOperatingIncome * (1 + assumptions.searchGrowth) ** 3;
  const futureYoutubeOperatingIncome = annualYoutubeOperatingIncome * (1 + Math.max(row.youtubeGrowth, assumptions.searchGrowth * 0.65)) ** 3;
  const futureCloudMargin = clamp(
    row.cloudOperatingMarginEstimate + tpuMarginAdvantage * 0.25 + row.tpuEfficiencySavingsRate * 0.05 - assumptions.aiInfrastructureMix * 0.02,
    0.18,
    0.48,
  );
  const futureCloudBaseMargin = clamp(futureCloudMargin - tpuMarginAdvantage * 0.45 - row.tpuEfficiencySavingsRate * 0.08, 0.15, futureCloudMargin);
  const futureCloudEbit = annualCloudRevenue * (1 + assumptions.cloudGrowth) ** 3 * futureCloudBaseMargin;
  const futureAiRevenue = row.aiAnnualRevenueEstimate * (1 + assumptions.aiRevenueCagr) ** 3;
  const futureTpuUpliftValue =
    perShare((annualCloudRevenue * (1 + assumptions.cloudGrowth) ** 3 * (futureCloudMargin - futureCloudBaseMargin)) * assumptions.cloudEvEbit, shares) +
    perShare(futureAiRevenue * tpuMarginAdvantage * afterTax * assumptions.exitMultiple * 0.35, shares);
  const targetPrice3Y =
    perShare(futureSearchOperatingIncome * afterTax * assumptions.searchValueMultiple, shares) +
    perShare(futureYoutubeOperatingIncome * afterTax * assumptions.searchValueMultiple, shares) +
    perShare(futureCloudEbit * assumptions.cloudEvEbit, shares) +
    futureTpuUpliftValue +
    assumptions.otherBetsValue * 1.08 +
    assumptions.netCashPerShare;

  const cumulativeDividends = assumptions.currentPrice * assumptions.dividendYield * 3;
  const upsideDownside = computeUpsideDownside(currentFairValue, assumptions.currentPrice);
  const expected3YCagr = computeExpectedShareholderCagr(targetPrice3Y, assumptions.currentPrice, cumulativeDividends);

  const warnings: string[] = [];
  const validationWarnings = [
    ...buildPriceValidationWarnings("GOOGL", assumptions.currentPrice, "2026-05-09"),
    ...checkImpossibleCagrCombination(upsideDownside, expected3YCagr),
  ];
  if (assumptions.forwardEps < 5) {
    warnings.push("EPS may be quarterly or not annualized.");
  }
  if (assumptions.currentPrice < 250 || assumptions.currentPrice > 600) {
    warnings.push("Current price may be stale or incorrect.");
  }
  if (
    currentFairValue < assumptions.currentPrice * 0.7 &&
    assumptions.searchGrowth > 0 &&
    row.cloudOperatingMarginEstimate >= row.cloudOperatingMargin &&
    tpuMarginAdvantage > 0 &&
    assumptions.aiRevenueCagr > 0.3
  ) {
    warnings.push("Base valuation appears inconsistent with operating assumptions.");
  }
  if (row.aiRoicEstimate < row.wacc) {
    warnings.push("AI ROIC remains below WACC, so AI value creation is still unproven.");
  }

  const multipleEffect = Math.pow(Math.max(assumptions.exitMultiple, 1) / Math.max(assumptions.forwardPe, 1), 1 / 3) - 1;
  const searchMultipleEffect = searchAdsValue - perShare(annualSearchOperatingIncome * afterTax * 20, shares);
  const cloudMarginEffect = perShare(annualCloudRevenue * (row.cloudOperatingMarginEstimate - row.cloudOperatingMargin) * assumptions.cloudEvEbit, shares);
  const tpuAdvantageEffect = tpuUpliftValue;
  const aiCapexBurdenEffect = -perShare(row.tpuCapex * 4 * Math.max(assumptions.aiCapexGrowth, 0.05), shares);
  const waccEffect = (0.085 - assumptions.wacc) * 900;
  const terminalGrowthEffect = (assumptions.terminalGrowth - 0.03) * 700;

  return {
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
    currentPrice: assumptions.currentPrice,
    validationWarnings,
    methodCards: [
      { key: "current-fair", label: "Current Fair Value", value: currentFairValue, format: "currency", description: "Full Alphabet sum-of-the-parts fair value using Search, YouTube, Google Cloud, TPU uplift, Other Bets, and net cash." },
      { key: "target-3y", label: "3Y Target Price", value: targetPrice3Y, format: "currency", description: "Three-year target price based on forward Search, YouTube, Cloud EBIT, and TPU economics under the selected scenario." },
      { key: "search-ads", label: "Search / Ads", value: searchAdsValue, format: "currency", description: "Search operating income valued on an after-tax earnings multiple." },
      { key: "youtube", label: "YouTube", value: youtubeValue, format: "currency", description: "YouTube valued on revenue, margin, and after-tax multiple assumptions." },
      { key: "cloud", label: "Google Cloud", value: cloudValue, format: "currency", description: "Cloud valued on forward EBIT and a Cloud EV/EBIT multiple." },
      { key: "tpu-uplift", label: "TPU Uplift", value: tpuUpliftValue, format: "currency", description: "TPU ROIC uplift value from AI revenue times the TPU margin advantage and AI multiple." },
      { key: "other-bets-net-cash", label: "Other Bets + Net Cash", value: otherBetsValue + netCashValue, format: "currency", description: "Residual value from Other Bets plus net cash per share." },
      { key: "pe-cross-check", label: "Forward P/E Cross-Check", value: forwardPeFairValue, format: "currency", description: "Cross-check based on annual forward EPS rather than quarterly earnings." },
      { key: "fcf-cross-check", label: "FCF Yield Cross-Check", value: fcfYieldFairValue, format: "currency", description: "Cross-check based on AI-adjusted annual FCF per share and target FCF yield." },
      { key: "ai-dcf", label: "AI-Adjusted DCF", value: aiAdjustedDcfValue, format: "currency", description: "DCF using AI-adjusted FCF as a cross-check. TPU value is not added on top a second time inside the fair value bridge." },
      { key: "ai-value", label: "AI Value Creation", value: aiValueCreationValue, format: "currency", description: "Present value of incremental AI FCF less AI invested capital. Negative values imply AI ROIC below the cost of capital." },
    ],
    expectedReturnBridge: [
      { key: "search-multiple", label: "Search Multiple Effect", value: searchMultipleEffect, format: "currency", description: "Contribution from applying the scenario Search multiple versus a neutral 20x anchor." },
      { key: "cloud-margin", label: "Cloud Margin Effect", value: cloudMarginEffect, format: "currency", description: "Value added when Cloud margin expands above the current operating margin anchor." },
      { key: "tpu-advantage", label: "TPU Advantage Effect", value: tpuAdvantageEffect, format: "currency", description: "Incremental value from TPU cost advantage flowing through AI margins and ROIC." },
      { key: "ai-capex", label: "AI CapEx Burden", value: aiCapexBurdenEffect, format: "currency", description: "Higher AI capital intensity lowers current value, but it is counted once rather than penalized repeatedly." },
      { key: "wacc-terminal", label: "WACC + Terminal Growth", value: waccEffect + terminalGrowthEffect, format: "currency", description: "Discount-rate and terminal-growth effect on DCF valuation." },
    ],
    fairValues: (["Bear", "Base", "Bull"] as const).map((scenario) => ({
      scenario,
      fairValue: currentFairValue,
      targetPrice3Y,
      cumulativeDividends,
      upsideDownside,
      expectedReturn3Y: expected3YCagr,
      summary: `3Y target price ${targetPrice3Y.toFixed(1)} with ${(cumulativeDividends).toFixed(1)} of cumulative dividends.`,
    })),
    customSummary:
      "Current fair value is the full Alphabet SOTP bridge. Expected 3-year CAGR is based on target price plus cumulative dividends, not AI revenue CAGR.",
    sensitivityTables: [
      {
        title: "Forward EPS x Forward P/E",
        table: buildSensitivityTable(
          "Forward EPS",
          "Forward P/E",
          [assumptions.forwardEps - 0.8, assumptions.forwardEps, assumptions.forwardEps + 0.8],
          [assumptions.forwardPe - 2, assumptions.forwardPe, assumptions.forwardPe + 2],
          (eps, pe) => eps * pe,
        ),
      },
      {
        title: "FCF / Share x FCF Yield",
        table: buildSensitivityTable(
          "FCF / Share",
          "FCF Yield",
          [perShare(annualFcf, shares) - 1.5, perShare(annualFcf, shares), perShare(annualFcf, shares) + 1.5],
          [assumptions.targetFcfYield - 0.004, assumptions.targetFcfYield, assumptions.targetFcfYield + 0.004],
          (fcfPerShare, fcfYield) => safeDivide(fcfPerShare, fcfYield),
        ),
      },
      {
        title: "Cloud Growth x Cloud EV/EBIT",
        table: buildSensitivityTable(
          "Cloud Growth",
          "Cloud EV/EBIT",
          [assumptions.cloudGrowth - 0.08, assumptions.cloudGrowth, assumptions.cloudGrowth + 0.08],
          [assumptions.cloudEvEbit - 3, assumptions.cloudEvEbit, assumptions.cloudEvEbit + 3],
          (growth, multiple) => {
            const scenarioCloudEbit = annualCloudRevenue * (1 + growth) * row.cloudOperatingMarginEstimate;
            return perShare(scenarioCloudEbit * multiple, shares);
          },
        ),
      },
      {
        title: "WACC x Terminal Growth DCF",
        table: buildSensitivityTable(
          "WACC",
          "Terminal Growth",
          [assumptions.wacc - 0.01, assumptions.wacc, assumptions.wacc + 0.01],
          [assumptions.terminalGrowth - 0.005, assumptions.terminalGrowth, assumptions.terminalGrowth + 0.005],
          (wacc, terminalGrowth) => {
            const scenarioDiscounted = Array.from({ length: 5 }, (_, idx) => {
              const year = idx + 1;
              const projectedRevenue = annualRevenue * (1 + dcfRevenueGrowth) ** year;
              const projectedFcf = projectedRevenue * dcfMargin;
              return projectedFcf / (1 + wacc) ** year;
            }).reduce((sum, value) => sum + value, 0);
            const scenarioTerminalRevenue = annualRevenue * (1 + dcfRevenueGrowth) ** 5;
            const scenarioTerminalFcf = scenarioTerminalRevenue * dcfMargin;
            const scenarioTerminalValue = wacc > terminalGrowth ? (scenarioTerminalFcf * (1 + terminalGrowth)) / (wacc - terminalGrowth) : scenarioTerminalFcf * 18;
            return perShare(scenarioDiscounted + scenarioTerminalValue / (1 + wacc) ** 5, shares);
          },
        ),
      },
    ],
  };
}
