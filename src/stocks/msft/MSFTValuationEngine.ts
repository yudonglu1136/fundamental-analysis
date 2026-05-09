import type { ValuationResult } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { safeDivide } from "../../utils/financialMath";
import { checkImpossibleCagrCombination, checkPeSanity } from "../../utils/validation";
import { buildPriceValidationWarnings, computeExpectedShareholderCagr, computeUpsideDownside, getCanonicalCurrentPrice } from "../../utils/valuation";
import type { MsftAssumptions } from "./assumptions";
import type { MsftRealData } from "./realData";
import type { AiRevenueModelResult } from "./AIRevenueModel";
import type { AiCostModelResult } from "./AICostModel";
import type { AiRoicModelResult } from "./AIROICModel";
import type { CloudMarginModelResult } from "./CloudMarginModel";
import type { FcfOffsetModelResult } from "./FCFOffsetModel";
import type { AiPhaseResult } from "./AIPhaseDetector";

export type MsftValuationEngineResult = ValuationResult & {
  targetPrice3Y: number;
  aiAdjustedFairValue: number;
  aiValueContribution: number;
  expectedShareholderCagr: number;
  whyChanged: Array<{ label: string; impact: number; detail: string }>;
};

export function buildMsftValuationEngine(
  assumptions: MsftAssumptions,
  realData: MsftRealData,
  revenue: AiRevenueModelResult,
  cost: AiCostModelResult,
  roic: AiRoicModelResult,
  cloud: CloudMarginModelResult,
  fcf: FcfOffsetModelResult,
  phase: AiPhaseResult,
): MsftValuationEngineResult {
  const currentPrice = assumptions.currentPrice || getCanonicalCurrentPrice("MSFT", 430);
  const forwardPeValue = assumptions.forwardEps * assumptions.targetPe;
  const fcfPerShare = safeDivide(fcf.current.coreFcf, 7.35);
  const fcfYieldFairValue = safeDivide(fcfPerShare, assumptions.targetFcfYield);
  const dcfGrowth = Math.max(0.05, assumptions.aiRevenueCagr * 0.22 + cloud.current.currentCloudMargin * 0.18 + roic.current.blendedAiRoic * 0.4 - assumptions.aiCapexGrowth * 0.08);
  const discountedFcf = Array.from({ length: 5 }, (_, idx) => {
    const year = idx + 1;
    const projected = fcf.current.aiAdjustedFcf * (1 + dcfGrowth) ** year;
    return projected / (1 + assumptions.wacc) ** year;
  }).reduce((sum, value) => sum + value, 0);
  const terminalFcf = fcf.current.aiAdjustedFcf * (1 + dcfGrowth) ** 5;
  const terminalValue = assumptions.wacc > assumptions.terminalGrowth ? (terminalFcf * (1 + assumptions.terminalGrowth)) / (assumptions.wacc - assumptions.terminalGrowth) : terminalFcf * 20;
  const aiAdjustedDcf = safeDivide(discountedFcf + terminalValue / (1 + assumptions.wacc) ** 5, 7.35);
  const aiValueCreation = Array.from({ length: 5 }, (_, idx) => {
    const year = idx + 1;
    const incrementalAiFcf = Math.max(cost.years[idx]?.aiOperatingProfit ?? cost.current.aiOperatingProfit, 0) * (1 - assumptions.taxRate);
    return incrementalAiFcf / (1 + assumptions.wacc) ** year;
  }).reduce((sum, value) => sum + value, 0) - roic.current.totalAiInvestedCapital;
  const aiValueCreationPerShare = safeDivide(aiValueCreation, 7.35);
  const blendedFairValue = forwardPeValue * 0.35 + fcfYieldFairValue * 0.25 + aiAdjustedDcf * 0.4;
  const fy29Eps = assumptions.fy27EpsConsensus * (1 + Math.max(assumptions.aiRevenueCagr * 0.25 + roic.current.softwareAiRoic * 0.1 - assumptions.aiCapexGrowth * 0.05, 0.04)) ** 2;
  const targetPrice3Y = fy29Eps * assumptions.exitMultiple;
  const dividends = currentPrice * realData.dividendYield * 3;
  const expectedShareholderCagr = computeExpectedShareholderCagr(targetPrice3Y, currentPrice, dividends);

  const roicImpact = (roic.current.blendedAiRoic - assumptions.wacc) * 350;
  const cloudImpact = (cloud.current.currentCloudMargin - realData.actual.microsoftCloudGrossMargin) * 2800;
  const capexImpact = -(assumptions.aiCapexGrowth - 0.18) * 310;
  const whyChanged = [
    { label: "AI ROIC", impact: roicImpact, detail: `Higher blended AI ROIC of ${(roic.current.blendedAiRoic * 100).toFixed(1)}% changed fair value.` },
    { label: "Cloud margin", impact: cloudImpact, detail: `Cloud margin scenario of ${(cloud.current.currentCloudMargin * 100).toFixed(1)}% versus ${(realData.actual.microsoftCloudGrossMargin * 100).toFixed(1)}% anchor altered valuation.` },
    { label: "AI CapEx burden", impact: capexImpact, detail: `AI CapEx growth of ${(assumptions.aiCapexGrowth * 100).toFixed(1)}% affects cash conversion and DCF weight.` },
  ];

  const validationWarnings = [
    ...buildPriceValidationWarnings("MSFT", currentPrice, "2026-05-09"),
    ...checkPeSanity(forwardPeValue, 430, 470, "MSFT"),
    ...checkImpossibleCagrCombination(computeUpsideDownside(blendedFairValue, currentPrice), expectedShareholderCagr),
  ];

  return {
    warning: roic.current.blendedAiRoic < assumptions.wacc ? "Valuation may be unreliable because AI ROIC remains below WACC in this scenario." : undefined,
    currentPrice,
    validationWarnings,
    methodCards: [
      { key: "pe", label: "Forward P/E", value: forwardPeValue, format: "currency", description: "Forward EPS times target P/E." },
      { key: "fcf", label: "FCF Yield", value: fcfYieldFairValue, format: "currency", description: "FCF per share divided by target FCF yield." },
      { key: "dcf", label: "AI-Adjusted DCF", value: aiAdjustedDcf, format: "currency", description: "Five-year DCF with AI-adjusted FCF and terminal growth, without adding AI value creation on top a second time." },
      { key: "ai-value", label: "AI Value Creation", value: aiValueCreationPerShare, format: "currency", description: "Diagnostic value-creation read only. Not added on top of the DCF in blended fair value." },
    ],
    expectedReturnBridge: [
      { key: "ai-revenue", label: "AI Revenue Growth", value: assumptions.aiRevenueCagr, format: "percent", description: "Growth driver feeding AI monetization and software mix." },
      { key: "cloud-margin", label: "Cloud Margin", value: cloud.current.currentCloudMargin - realData.actual.microsoftCloudGrossMargin, format: "percent", description: "Incremental cloud margin change vs actual anchor." },
      { key: "ai-roic", label: "AI ROIC Spread", value: roic.current.blendedAiRoic - assumptions.wacc, format: "percent", description: "Blended AI ROIC relative to WACC." },
      { key: "fcf", label: "FCF Margin", value: fcf.current.aiAdjustedFcfMargin, format: "percent", description: "Scenario FCF margin after AI offsets." },
      { key: "phase", label: "AI Phase", value: phase.signal === "Positive" ? 0.03 : phase.signal === "Inflecting" ? 0.015 : -0.01, format: "percent", description: phase.phase },
    ],
    fairValues: [
      { scenario: "Bear", fairValue: blendedFairValue * 0.92, targetPrice3Y: targetPrice3Y * 0.92, cumulativeDividends: dividends, upsideDownside: computeUpsideDownside(blendedFairValue * 0.92, currentPrice), expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y * 0.92, currentPrice, dividends), summary: "Higher CapEx and lower AI ROIC keep Microsoft in investment mode." },
      { scenario: "Base", fairValue: blendedFairValue, targetPrice3Y, cumulativeDividends: dividends, upsideDownside: computeUpsideDownside(blendedFairValue, currentPrice), expectedReturn3Y: expectedShareholderCagr, summary: "AI economics gradually improve as Copilot and Cloud software mix scales." },
      { scenario: "Bull", fairValue: blendedFairValue * 1.1, targetPrice3Y: targetPrice3Y * 1.1, cumulativeDividends: dividends, upsideDownside: computeUpsideDownside(blendedFairValue * 1.1, currentPrice), expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y * 1.1, currentPrice, dividends), summary: "AI monetization and software ROIC meaningfully overpower the infrastructure burden." },
    ],
    customSummary: `3-year target price uses FY29 earnings power and exit multiple. Current phase: ${phase.phase}.`,
    sensitivityTables: [
      { title: "Forward EPS x Target P/E", table: buildSensitivityTable("EPS", "P/E", [assumptions.forwardEps - 0.5, assumptions.forwardEps, assumptions.forwardEps + 0.7], [assumptions.targetPe - 2, assumptions.targetPe, assumptions.targetPe + 2], (eps, pe) => eps * pe) },
      { title: "FCF per Share x FCF Yield", table: buildSensitivityTable("FCF / Share", "FCF Yield", [fcfPerShare - 1.5, fcfPerShare, fcfPerShare + 1.5], [assumptions.targetFcfYield - 0.005, assumptions.targetFcfYield, assumptions.targetFcfYield + 0.005], (fcfValue, yieldValue) => fcfValue / yieldValue) },
      { title: "AI Revenue CAGR x Exit Multiple", table: buildSensitivityTable("AI Revenue CAGR", "Exit Multiple", [assumptions.aiRevenueCagr - 0.08, assumptions.aiRevenueCagr, assumptions.aiRevenueCagr + 0.08], [assumptions.exitMultiple - 2, assumptions.exitMultiple, assumptions.exitMultiple + 2], (growth, multiple) => assumptions.fy27EpsConsensus * (1 + growth * 0.25 + roic.current.softwareAiRoic * 0.1) ** 2 * multiple) },
    ],
    targetPrice3Y,
    aiAdjustedFairValue: aiAdjustedDcf,
    aiValueContribution: aiValueCreationPerShare,
    expectedShareholderCagr,
    whyChanged,
  };
}
