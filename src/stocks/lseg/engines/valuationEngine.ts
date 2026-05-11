import { computeExpectedShareholderCagr, computeUpsideDownside } from "../../../utils/valuation";
import type { LsegDcfResult, LsegScenarioAssumptions, LsegSotpResult, LsegSotpMultiplePolicy } from "../model";
import { safeRatio } from "./helpers";
import type { LsegBuybackEngineResult } from "./buybackEngine";
import type { LsegFcfEngineResult } from "./fcfEngine";
import type { LsegMarginEngineResult } from "./marginEngine";
import type { LsegRevenueEngineResult } from "./revenueEngine";

export type LsegValuationEngineResult = {
  peFairValue: number;
  fcfFairValue: number;
  dcfValue: number;
  conservativeOperatingSotpFairValue: number;
  baseOperatingSotpFairValue: number;
  premiumOperatingSotpFairValue: number;
  operatingSotpFairValue: number;
  strategicSotpFairValue: number;
  sotpFairValue: number;
  coreValueExSotp: number;
  operatingSotpUpliftVsCore: number;
  blendedFairValue25Sotp: number;
  blendedFairValue: number;
  blendedFairValueHalfSotp: number;
  blendedFairValue75Sotp: number;
  blendedFairValueExSotp: number;
  strategicUpsideFairValue: number;
  strategicOptionalityPerShare: number;
  selectedSotpForBlended: number;
  selectedSotpPolicy: LsegSotpMultiplePolicy;
  reasonForSelectedSotpPolicy: string;
  recommendedFairValue: number;
  recommendedFairValueMethod: "core_ex_sotp" | "sotp_25_uplift" | "sotp_50_uplift" | "sotp_75_uplift" | "full_operating_sotp_blend";
  recommendedFairValueReason: string;
  valuationRangeLow: number;
  valuationRangeBase: number;
  valuationRangeHigh: number;
  primaryUnderwritingValue: number;
  secondaryUpsideValue: number;
  strategicOptionalityValue: number;
  forwardAdjustedEps: number;
  forwardFcfPerShare: number;
  year1Eps: number;
  year2Eps: number;
  year3Eps: number;
  targetPrice3Y: number;
  cumulativeDividends3Y: number;
  expectedCagr3Y: number;
  operatingContributionToEpsCagr: number;
  marginContributionToEpsCagr: number;
  buybackContributionToEpsCagr: number;
  taxInterestFxDrag: number;
  exitPe: number;
  methodDispersion: number;
  upsideDownside: number;
  methodWeights: LsegScenarioAssumptions["valuationWeights"];
};

export function calculateValuationEngine(
  assumptions: LsegScenarioAssumptions,
  revenue: LsegRevenueEngineResult,
  margin: LsegMarginEngineResult,
  buyback: LsegBuybackEngineResult,
  fcf: LsegFcfEngineResult,
  dcf: LsegDcfResult,
  conservativeOperatingSotp: LsegSotpResult,
  baseOperatingSotp: LsegSotpResult,
  premiumOperatingSotp: LsegSotpResult,
  operatingSotp: LsegSotpResult,
  strategicSotp: LsegSotpResult,
): LsegValuationEngineResult {
  const year1Buyback = buyback.rows[0];
  const year2Buyback = buyback.rows[Math.min(1, buyback.rows.length - 1)];
  const year3Buyback = buyback.rows[Math.min(2, buyback.rows.length - 1)];
  const year1Fcf = fcf.rows[0];
  const forwardAdjustedEps = year1Buyback?.adjustedEps ?? 0;
  const forwardFcfPerShare = safeRatio(year1Fcf?.equityFreeCashFlow ?? 0, year1Buyback?.averageDilutedShares ?? 1);
  const peFairValue = forwardAdjustedEps * assumptions.targetPe;
  const fcfFairValue = forwardFcfPerShare / Math.max(assumptions.targetFcfYield, 0.001);
  const conservativeOperatingSotpFairValue = conservativeOperatingSotp.valuePerShare;
  const baseOperatingSotpFairValue = baseOperatingSotp.valuePerShare;
  const premiumOperatingSotpFairValue = premiumOperatingSotp.valuePerShare;
  const operatingSotpFairValue = operatingSotp.valuePerShare;
  const strategicSotpFairValue = strategicSotp.valuePerShare;
  const strategicOptionalityPerShare = strategicSotp.valuePerShare - operatingSotp.valuePerShare;
  const selectedSotpPolicy = operatingSotp.multiplePolicy ?? "base_operating";
  const selectedSotpForBlended = operatingSotpFairValue;
  const coreValueExSotp = (dcf.valuePerShare * 0.35) + (fcfFairValue * 0.4) + (peFairValue * 0.25);
  const operatingSotpUpliftVsCore = operatingSotpFairValue - coreValueExSotp;

  const buildBlendedValue = (sotpContributionValue: number) =>
    (dcf.valuePerShare * assumptions.valuationWeights.dcf) +
    (fcfFairValue * assumptions.valuationWeights.fcfYield) +
    (sotpContributionValue * assumptions.valuationWeights.sotp) +
    (peFairValue * assumptions.valuationWeights.pe);

  const quarterCreditedSotp = coreValueExSotp + (operatingSotpUpliftVsCore * 0.25);
  const halfCreditedSotp = coreValueExSotp + (operatingSotpUpliftVsCore * 0.5);
  const threeQuarterCreditedSotp = coreValueExSotp + (operatingSotpUpliftVsCore * 0.75);
  const blendedFairValue = buildBlendedValue(operatingSotpFairValue);
  const blendedFairValue25Sotp = buildBlendedValue(quarterCreditedSotp);
  const blendedFairValueHalfSotp = buildBlendedValue(halfCreditedSotp);
  const blendedFairValue75Sotp = buildBlendedValue(threeQuarterCreditedSotp);
  const blendedFairValueExSotp = coreValueExSotp;
  const hasSevereSotpWarnings = (operatingSotp.audit.severeWarnings?.length ?? 0) > 0 || (baseOperatingSotp.audit.severeWarnings?.length ?? 0) > 0;
  const sotpConfidenceScore = operatingSotp.audit.confidenceScore;

  const reasonForSelectedSotpPolicy =
    selectedSotpPolicy === "conservative_operating"
      ? "SOTP confidence remains below 70 or severe audit issues are active, so the model uses conservative operating multiples for underwriting."
      : selectedSotpPolicy === "premium_operating"
        ? "Bull-case underwriting allows premium operating multiples because SOTP confidence is high and no severe operating audit issues are active."
        : "Base operating multiples are used because SOTP confidence is adequate and no forced downgrade is active.";

  let recommendedFairValueMethod: LsegValuationEngineResult["recommendedFairValueMethod"] = "full_operating_sotp_blend";
  let recommendedFairValue = blendedFairValue;
  let recommendedFairValueReason = "Full operating SOTP blended value is used because confidence is high enough to treat the operating SOTP as a primary underwriting input.";

  if (sotpConfidenceScore < 55) {
    recommendedFairValueMethod = "core_ex_sotp";
    recommendedFairValue = blendedFairValueExSotp;
    recommendedFairValueReason = "Recommended valuation defaults to the ex-SOTP core because ownership / peer / corporate-cost confidence is still too low for operating SOTP to be a primary underwriting anchor.";
  } else if (sotpConfidenceScore < 70 || hasSevereSotpWarnings) {
    recommendedFairValueMethod = "sotp_50_uplift";
    recommendedFairValue = blendedFairValueHalfSotp;
    recommendedFairValueReason = "Recommended valuation uses a 50% SOTP haircut because operating SOTP remains useful directionally but still needs a meaningful credibility discount.";
  } else if (sotpConfidenceScore < 75) {
    recommendedFairValueMethod = "sotp_75_uplift";
    recommendedFairValue = blendedFairValue75Sotp;
    recommendedFairValueReason = "Recommended valuation uses a partial SOTP uplift because data confidence is improving but still not strong enough for a full operating SOTP anchor.";
  }

  const valuationRangeLow = Math.min(blendedFairValueExSotp, blendedFairValue25Sotp, dcf.valuePerShare);
  const valuationRangeBase = recommendedFairValue;
  const valuationRangeHigh = Math.max(blendedFairValue, strategicSotpFairValue);
  const targetPrice3Y = (year3Buyback?.adjustedEps ?? forwardAdjustedEps) * assumptions.exitPe;
  const cumulativeDividends3Y = assumptions.currentPrice * assumptions.dividendYield * 3;
  const expectedCagr3Y = computeExpectedShareholderCagr(targetPrice3Y, assumptions.currentPrice, cumulativeDividends3Y);
  const revenueYear3 = revenue.groupRevenueByYear[Math.min(2, revenue.groupRevenueByYear.length - 1)]?.revenue ?? revenue.groupRevenueByYear[0]?.revenue ?? 0;
  const revenueYear0 = revenue.groupRevenueByYear[0]?.revenue
    ? revenue.groupRevenueByYear[0].revenue / Math.max(1 + (revenue.groupRevenueByYear[0]?.growth ?? 0), 0.0001)
    : 0;
  const revenueCagr3Y = revenueYear0 > 0 && revenueYear3 > 0 ? ((revenueYear3 / revenueYear0) ** (1 / 3)) - 1 : 0;
  const marginYear0 = (margin.groupRows[0]?.adjustedEbitdaMargin ?? 0) - ((margin.groupRows[0]?.marginExpansionBps ?? 0) / 10000);
  const marginYear3 = margin.groupRows[Math.min(2, margin.groupRows.length - 1)]?.adjustedEbitdaMargin ?? margin.groupRows[0]?.adjustedEbitdaMargin ?? marginYear0;
  const marginContributionToEpsCagr = marginYear0 > 0 && marginYear3 > marginYear0
    ? Math.max(((marginYear3 / marginYear0) ** (1 / 3)) - 1, 0)
    : 0;
  const operatingContributionToEpsCagr = Math.max(buyback.operatingContributionToEpsCagr - marginContributionToEpsCagr, 0);
  const buybackContributionToEpsCagr = buyback.buybackContributionToEpsCagr;
  const taxInterestFxDrag = buyback.epsCagr3Y - revenueCagr3Y - marginContributionToEpsCagr - buybackContributionToEpsCagr;
  const methodDispersion = Math.max(peFairValue, fcfFairValue, dcf.valuePerShare, operatingSotpFairValue) -
    Math.min(peFairValue, fcfFairValue, dcf.valuePerShare, operatingSotpFairValue);

  return {
    peFairValue,
    fcfFairValue,
    dcfValue: dcf.valuePerShare,
    conservativeOperatingSotpFairValue,
    baseOperatingSotpFairValue,
    premiumOperatingSotpFairValue,
    operatingSotpFairValue,
    strategicSotpFairValue,
    sotpFairValue: operatingSotpFairValue,
    coreValueExSotp,
    operatingSotpUpliftVsCore,
    blendedFairValue25Sotp,
    blendedFairValue,
    blendedFairValueHalfSotp,
    blendedFairValue75Sotp,
    blendedFairValueExSotp,
    strategicUpsideFairValue: blendedFairValue + strategicOptionalityPerShare,
    strategicOptionalityPerShare,
    selectedSotpForBlended,
    selectedSotpPolicy,
    reasonForSelectedSotpPolicy,
    recommendedFairValue,
    recommendedFairValueMethod,
    recommendedFairValueReason,
    valuationRangeLow,
    valuationRangeBase,
    valuationRangeHigh,
    primaryUnderwritingValue: recommendedFairValue,
    secondaryUpsideValue: blendedFairValue,
    strategicOptionalityValue: strategicOptionalityPerShare,
    forwardAdjustedEps,
    forwardFcfPerShare,
    year1Eps: year1Buyback?.adjustedEps ?? 0,
    year2Eps: year2Buyback?.adjustedEps ?? 0,
    year3Eps: year3Buyback?.adjustedEps ?? 0,
    targetPrice3Y,
    cumulativeDividends3Y,
    expectedCagr3Y,
    operatingContributionToEpsCagr,
    marginContributionToEpsCagr,
    buybackContributionToEpsCagr,
    taxInterestFxDrag,
    exitPe: assumptions.exitPe,
    methodDispersion,
    upsideDownside: computeUpsideDownside(blendedFairValue, assumptions.currentPrice),
    methodWeights: assumptions.valuationWeights,
  };
}
