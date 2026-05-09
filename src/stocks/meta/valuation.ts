import type { Scenario, ValidationWarning, ValuationResult } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { clamp, safeDivide } from "../../utils/financialMath";
import { checkImpossibleCagrCombination, checkPeSanity } from "../../utils/validation";
import { buildPriceValidationWarnings, computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import type { MetaAssumptions } from "./assumptions";
import { matchMetaScenario, metaScenarioDefaults } from "./assumptions";
import { calculateAdEconomics } from "./adEconomicsEngine";
import { calculateAiAdRoic } from "./aiAdRoicEngine";
import { calculateCapexEconomics } from "./capexEngine";
import type { MetaQuarterRow } from "./data";
import { calculateEngagementEconomics } from "./engagementEngine";
import { calculateRealityLabsEconomics } from "./realityLabsEngine";
import { calculateWhatsappEconomics } from "./whatsappEngine";

export type MetaValuationInput = {
  selectedRow: MetaQuarterRow;
  priorRow?: MetaQuarterRow;
  latestReferenceDate: string;
  currentPrice: number;
};

export type MetaValuationEconomics = {
  coreAdsForwardEps: number;
  coreAdsFairValue: number;
  fcfYieldFairValue: number;
  aiAdRoicUpliftValue: number;
  sotpValue: number;
  dcfValue: number;
  blendedFairValue: number;
  targetPrice3Y: number;
  cumulativeDividends: number;
  expectedShareholderCagr: number;
  upsideDownside: number;
  aiAdRoic: number;
  aiPaybackYears: number;
  aiRevenuePerCapital: number;
  warnings: ValidationWarning[];
  summary: string;
};

type MetaScenarioValuationPoint = ReturnType<typeof buildScenarioPoint>;

function annualize(value: number) {
  return value * 4;
}

function perShare(value: number, shares: number) {
  return safeDivide(value, Math.max(shares, 1));
}

function buildScenarioPoint(scenario: Scenario, fairValue: number, targetPrice3Y: number, cumulativeDividends: number, currentPrice: number, summary: string) {
  return {
    scenario,
    fairValue,
    targetPrice3Y,
    cumulativeDividends,
    upsideDownside: computeUpsideDownside(fairValue, currentPrice),
    expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y, currentPrice, cumulativeDividends),
    summary,
  };
}

function calculateScenarioEconomics(
  model: MetaValuationInput,
  assumptions: MetaAssumptions,
  scenario: Scenario | "Custom",
): MetaValuationEconomics {
  const row = model.selectedRow;
  const prior = model.priorRow ?? row;
  const shares = Math.max(row.sharesOutstanding, 1);
  const currentPrice = assumptions.currentPrice || model.currentPrice;

  const adEconomics = calculateAdEconomics(row, prior, assumptions);
  const engagementEconomics = calculateEngagementEconomics(row, prior, assumptions);
  const capexEconomics = calculateCapexEconomics(
    row,
    assumptions,
    Math.max(0, adEconomics.aiAfterTaxOperatingProfitAnnual - adEconomics.aiEmbeddedAfterTaxProfitAnnual),
  );
  const aiAdRoic = calculateAiAdRoic(row, assumptions, adEconomics, engagementEconomics, capexEconomics);
  const whatsapp = calculateWhatsappEconomics(row, assumptions);
  const realityLabs = calculateRealityLabsEconomics(row, assumptions);

  const coreAdsForwardEps = Math.max(
    0,
    assumptions.forwardEps + realityLabs.dragPerShareAfterTax - perShare(whatsapp.annualOperatingProfit * 0.25, shares),
  );
  const coreAdsFairValue = coreAdsForwardEps * assumptions.targetPe;
  const fcfYieldFairValue = safeDivide(assumptions.fcfPerShare, assumptions.targetFcfYield);

  const deltaAiAfterTaxProfit = Math.max(0, adEconomics.aiAfterTaxOperatingProfitAnnual - adEconomics.aiEmbeddedAfterTaxProfitAnnual);
  const deltaAiCapital = Math.max(0, assumptions.aiInvestedCapital - row.aiInvestedCapital);
  const aiUpliftGrowth = clamp(
    assumptions.aiConversionUplift + assumptions.aiCpmUplift * 0.9 + assumptions.aiEngagementUplift * 0.7 + assumptions.advantagePlusAdoption * 0.08,
    0.03,
    0.18,
  );
  let incrementalAiAfterTaxPv = 0;
  for (let year = 1; year <= 5; year += 1) {
    const projectedProfit = deltaAiAfterTaxProfit * (1 + aiUpliftGrowth) ** year;
    incrementalAiAfterTaxPv += projectedProfit / (1 + assumptions.wacc) ** year;
  }
  const aiAdRoicUpliftValue = perShare(incrementalAiAfterTaxPv - deltaAiCapital, shares);

  const netCashPerShare = 18;
  const adsSegmentValue = perShare(
    annualize(row.familyAppsRevenue) * assumptions.operatingMargin * (1 - assumptions.taxRate) * (assumptions.targetPe * 0.92),
    shares,
  );
  const engagementValue = perShare(
    annualize(row.adRevenue) * clamp(engagementEconomics.monetizationGapChange + assumptions.aiEngagementUplift, 0.01, 0.12) * 7,
    shares,
  );
  const whatsappPerShare = perShare(whatsapp.optionalityValue, shares);
  const realityLabsPerShare = perShare(realityLabs.optionalityValue, shares);
  const sotpValue = adsSegmentValue + engagementValue + whatsappPerShare + realityLabsPerShare + netCashPerShare;

  const dcfGrowthRate = clamp(
    assumptions.revenueGrowth * 0.45
      + adEconomics.totalUpliftRate * 0.5
      + engagementEconomics.monetizationGapChange * 0.35
      - Math.max(0, assumptions.aiCapexGrowth - assumptions.revenueGrowth) * 0.35,
    0.04,
    0.18,
  );
  let dcfValue = 0;
  let projectedFcfPerShare = assumptions.fcfPerShare;
  for (let year = 1; year <= 5; year += 1) {
    projectedFcfPerShare *= 1 + dcfGrowthRate;
    dcfValue += projectedFcfPerShare / (1 + assumptions.wacc) ** year;
  }
  const terminalFcfPerShare = projectedFcfPerShare * (1 + assumptions.terminalGrowth);
  const terminalValue = assumptions.wacc > assumptions.terminalGrowth
    ? terminalFcfPerShare / (assumptions.wacc - assumptions.terminalGrowth)
    : terminalFcfPerShare * 24;
  dcfValue += terminalValue / (1 + assumptions.wacc) ** 5;

  const futureEpsGrowth = clamp(
    assumptions.revenueGrowth * 0.45
      + adEconomics.totalUpliftRate * 0.4
      + engagementEconomics.recommendationEconomics * 0.25
      - Math.max(0, assumptions.aiCapexGrowth - assumptions.revenueGrowth) * 0.2,
    0.05,
    0.24,
  );
  const futureEps = assumptions.forwardEps * (1 + futureEpsGrowth) ** 3;
  const targetPrice3Y = futureEps * assumptions.exitMultiple + whatsappPerShare + Math.max(0, realityLabsPerShare);
  const cumulativeDividends = assumptions.cumulativeDividends || currentPrice * assumptions.dividendYield * 3;
  const blendedFairValue = (coreAdsFairValue * 0.3) + (fcfYieldFairValue * 0.25) + (aiAdRoicUpliftValue * 0.2) + (sotpValue * 0.15) + (dcfValue * 0.1);
  const upsideDownside = computeUpsideDownside(blendedFairValue, currentPrice);
  const expectedShareholderCagr = computeExpectedShareholderCagr(targetPrice3Y, currentPrice, cumulativeDividends);

  const warnings: ValidationWarning[] = [
    ...buildPriceValidationWarnings("META", currentPrice, model.latestReferenceDate),
    ...checkPeSanity(coreAdsFairValue, 450, 1000, "META"),
    ...checkImpossibleCagrCombination(upsideDownside, expectedShareholderCagr),
    ...(assumptions.forwardEps < 10
      ? [{
          id: `meta-quarterly-eps-${scenario}`,
          title: "EPS may be quarterly or not annualized",
          detail: "Meta valuation expects annual forward EPS. Inputs below 10 usually indicate quarterly EPS leaked into the model.",
          severity: "high" as const,
        }]
      : []),
    ...((aiAdRoic.aiAdRoic > 0.28 && adEconomics.totalUpliftRate < 0.07)
      ? [{
          id: `meta-ai-roic-sanity-${scenario}`,
          title: "AI Ad ROIC unsupported by uplift assumptions",
          detail: "AI Ad ROIC is too high relative to CPM, conversion, and engagement uplift. Review AI revenue or cost inputs.",
          severity: "high" as const,
        }]
      : []),
    ...((assumptions.fcfMargin > 0.3 && assumptions.aiCapexGrowth > assumptions.revenueGrowth + 0.08)
      ? [{
          id: `meta-fcf-capex-mismatch-${scenario}`,
          title: "FCF margin looks inconsistent with AI CapEx intensity",
          detail: "High AI CapEx growth should not coexist with structurally improving FCF margin unless AI monetization is clearly offsetting the burden.",
          severity: "medium" as const,
        }]
      : []),
    ...((assumptions.realityLabsLoss <= 0)
      ? [{
          id: `meta-reality-labs-drag-${scenario}`,
          title: "Reality Labs drag may be omitted",
          detail: "Reality Labs should remain visible in the institutional model unless you intentionally assume break-even.",
          severity: "medium" as const,
        }]
      : []),
  ];

  return {
    coreAdsForwardEps,
    coreAdsFairValue,
    fcfYieldFairValue,
    aiAdRoicUpliftValue,
    sotpValue,
    dcfValue,
    blendedFairValue,
    targetPrice3Y,
    cumulativeDividends,
    expectedShareholderCagr,
    upsideDownside,
    aiAdRoic: aiAdRoic.aiAdRoic,
    aiPaybackYears: aiAdRoic.paybackYears,
    aiRevenuePerCapital: safeDivide(adEconomics.totalIncrementalRevenue, Math.max(aiAdRoic.investedCapital, 1)),
    warnings,
    summary:
      scenario === "Custom"
        ? "Custom economics case using your current AI ad, CPM, conversion, and CapEx assumptions."
        : `${scenario} case recalculates AI ad profit, capital burden, and valuation independently from the scenario assumption set.`,
  };
}

export function calculateMetaValuation(
  model: MetaValuationInput,
  assumptions: MetaAssumptions,
  activeScenario: Scenario = "Base",
): ValuationResult {
  const currentPrice = assumptions.currentPrice || model.currentPrice;
  const selected = calculateScenarioEconomics(model, assumptions, "Custom");
  const scenarioResults = (["Bear", "Base", "Bull"] as const).map((scenario) => ({
    scenario,
    result: calculateScenarioEconomics(model, metaScenarioDefaults[scenario], scenario),
  }));
  const activeScenarioResult =
    scenarioResults.find((item) => item.scenario === activeScenario)?.result ?? selected;
  const matchedScenario = matchMetaScenario(assumptions);
  const primaryResult = matchedScenario === activeScenario ? activeScenarioResult : selected;

  const scenarioWarnings = scenarioResults.flatMap((item) => item.result.warnings);
  if (Math.abs(scenarioResults[0].result.blendedFairValue - scenarioResults[1].result.blendedFairValue) < 15
    && Math.abs(scenarioResults[1].result.blendedFairValue - scenarioResults[2].result.blendedFairValue) < 15) {
    scenarioWarnings.push({
      id: "meta-scenarios-too-similar",
      title: "Scenario outputs are too similar",
      detail: "Bear, Base, and Bull fair values are tightly clustered, which usually means the scenario assumptions are not economically differentiated enough.",
      severity: "medium",
    });
  }

  const fairValues: MetaScenarioValuationPoint[] = scenarioResults.map(({ scenario, result }) =>
    buildScenarioPoint(scenario, result.blendedFairValue, result.targetPrice3Y, result.cumulativeDividends, currentPrice, result.summary),
  );

  return {
    currentPrice,
    warning: currentPrice < 300 || currentPrice > 850 ? "Current price may be stale or incorrect." : undefined,
    validationWarnings: [...primaryResult.warnings, ...scenarioWarnings],
    methodCards: [
      { key: "current-fair", label: "Current Fair Value", value: primaryResult.blendedFairValue, format: "currency", description: "Weighted blend of core Ads, FCF yield, AI Ad uplift value, SOTP, and DCF." },
      { key: "target-3y", label: "3Y Target Price", value: primaryResult.targetPrice3Y, format: "currency", description: "Three-year target price driven by forward EPS growth, exit multiple, and optionality." },
      { key: "core-ads", label: "Core Ads P/E", value: primaryResult.coreAdsFairValue, format: "currency", description: "Core Ads earnings valued independently of AI uplift optionality." },
      { key: "fcf-yield", label: "FCF Yield Fair Value", value: primaryResult.fcfYieldFairValue, format: "currency", description: "Annual FCF per share capitalized at the target FCF yield." },
      { key: "ai-uplift", label: "AI Ad Uplift Value", value: primaryResult.aiAdRoicUpliftValue, format: "currency", description: "PV of AI profit above the embedded run-rate less incremental AI capital." },
      { key: "sotp", label: "SOTP Value", value: primaryResult.sotpValue, format: "currency", description: "Ads, engagement/reels monetization, WhatsApp optionality, Reality Labs drag, and net cash." },
      { key: "dcf", label: "AI-Adjusted DCF", value: primaryResult.dcfValue, format: "currency", description: "Five-year DCF on scenario FCF per share. AI CapEx is embedded in FCF, not deducted a second time." },
      { key: "roic", label: "AI Ad ROIC", value: primaryResult.aiAdRoic, format: "percent", description: "After-tax AI ad profit divided by AI invested capital." },
      { key: "payback", label: "AI Payback Period", value: primaryResult.aiPaybackYears, format: "number", description: "Years required to recover AI capital from AI ad after-tax operating profit." },
      { key: "revenue-per-capex", label: "AI Revenue / AI Capital", value: primaryResult.aiRevenuePerCapital, format: "number", description: "Incremental AI ad revenue throughput relative to AI invested capital." },
    ],
    expectedReturnBridge: [
      { key: "core-growth", label: "Core Revenue Growth", value: assumptions.revenueGrowth, format: "percent", description: "Family of Apps revenue growth contribution." },
      { key: "cpm", label: "CPM Uplift", value: assumptions.aiCpmUplift, format: "percent", description: "Improvement in pricing power from AI targeting and better auction quality." },
      { key: "conversion", label: "Conversion Uplift", value: assumptions.aiConversionUplift, format: "percent", description: "Improvement in conversion from better relevance and targeting." },
      { key: "engagement", label: "Engagement Uplift", value: assumptions.aiEngagementUplift, format: "percent", description: "Recommendation-driven time-spent and monetization improvement." },
      { key: "multiple", label: "Multiple Effect", value: Math.pow(Math.max(assumptions.exitMultiple, 1) / Math.max(assumptions.targetPe, 1), 1 / 3) - 1, format: "percent", description: "Three-year multiple expansion or compression." },
      { key: "dividend", label: "Dividend Yield", value: assumptions.dividendYield, format: "percent", description: "Cash dividend contribution to shareholder return." },
    ],
    fairValues,
    customSummary: matchedScenario === activeScenario ? activeScenarioResult.summary : selected.summary,
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
          [
            assumptions.aiConversionUplift + assumptions.aiCpmUplift - 0.02,
            assumptions.aiConversionUplift + assumptions.aiCpmUplift - 0.01,
            assumptions.aiConversionUplift + assumptions.aiCpmUplift,
            assumptions.aiConversionUplift + assumptions.aiCpmUplift + 0.01,
            assumptions.aiConversionUplift + assumptions.aiCpmUplift + 0.02,
          ],
          [assumptions.incrementalAdMargin - 0.08, assumptions.incrementalAdMargin - 0.04, assumptions.incrementalAdMargin, assumptions.incrementalAdMargin + 0.04, assumptions.incrementalAdMargin + 0.08],
          (rate, margin) => perShare((annualize(model.selectedRow.adRevenue) * rate * margin - assumptions.aiServingCost - assumptions.aiInferenceCost - assumptions.aiAdOpex) * (1 - assumptions.taxRate), model.selectedRow.sharesOutstanding),
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
            let projected = assumptions.fcfPerShare;
            const growthRate = clamp(assumptions.revenueGrowth * 0.45 + assumptions.aiCpmUplift * 0.4 + assumptions.aiConversionUplift * 0.4, 0.04, 0.18);
            for (let year = 1; year <= 5; year += 1) {
              projected *= 1 + growthRate;
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
