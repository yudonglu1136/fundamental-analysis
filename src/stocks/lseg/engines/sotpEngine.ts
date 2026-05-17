import type { LsegCockpitDataset, LsegSotpComponent, LsegSotpOutput, LsegScenarioAssumption, LsegValuationAssumptions } from "../types";
import { calculateLsegPostTradeSwapClearEconomicsEngine } from "./postTradeSwapClearEconomicsEngine";
import { resolveLsegValuationSemantics } from "./valuationSemantics";

const rationaleBySegment: Record<string, string> = {
  "Data & Analytics": "Financial data / workflow subscription platform multiple, discounted for Workspace gap versus Bloomberg.",
  "FTSE Russell / Index": "High-ROIC index IP multiple, discounted for passive fee pressure and MSCI/S&P/Nasdaq competition.",
  "Risk Intelligence": "Regulatory workflow multiple with growth premium but smaller scale.",
  "Capital Markets": "Lower-growth exchange / electronic trading multiple; Tradeweb optionality is not capitalized as a full data-platform asset.",
  "Post Trade / LCH": "Market-infrastructure / clearing multiple, capped for regulatory capital, margin model and rate-cycle risk.",
  "Corporate / Other": "Cost/reconciliation center; negative multiple prevents accidental growth valuation.",
};

export function calculateLsegSotpEngine(
  data: LsegCockpitDataset,
  scenario: LsegScenarioAssumption,
  assumptions: LsegValuationAssumptions,
): LsegSotpOutput {
  const semantics = resolveLsegValuationSemantics(data);
  const postTradeEconomics = calculateLsegPostTradeSwapClearEconomicsEngine(data, scenario, assumptions);
  let postTradeSegmentUplift = 0;
  const components: LsegSotpComponent[] = data.segmentActuals.map((segment) => {
    const baseMultiple = scenario.evEbitdaMultiples[segment.segment] ?? 0;
    const postTradeMultiplePremium = segment.segment === "Post Trade / LCH" ? postTradeEconomics.segmentMultiplePremium : 0;
    const multiple = baseMultiple + postTradeMultiplePremium;
    const postTradeIncrementalEbitda = segment.segment === "Post Trade / LCH" ? postTradeEconomics.yearOneIncrementalEbitda : 0;
    const adjustedEbitda = segment.adjustedEbitda + postTradeIncrementalEbitda;
    const riskPremiumDiscount =
      segment.segment === "FTSE Russell / Index" ? -0.06 :
      segment.segment === "Post Trade / LCH" ? -0.05 :
      segment.segment === "Data & Analytics" ? -0.03 :
      segment.segment === "Capital Markets" ? -0.08 :
      0;
    const baseEnterpriseValue = segment.adjustedEbitda * baseMultiple * (1 + riskPremiumDiscount);
    const impliedEnterpriseValue = adjustedEbitda * multiple * (1 + riskPremiumDiscount);
    if (segment.segment === "Post Trade / LCH") {
      postTradeSegmentUplift += impliedEnterpriseValue - baseEnterpriseValue;
    }
    return {
      segment: segment.segment,
      revenue: segment.revenue,
      adjustedEbitda,
      adjustedEbit: segment.adjustedOperatingProfit,
      margin: segment.margin,
      growth: segment.organicGrowth,
      multiple,
      baseMultiple,
      postTradeMultiplePremium,
      postTradeIncrementalEbitda,
      multipleRationale: rationaleBySegment[segment.segment],
      riskPremiumDiscount,
      impliedEnterpriseValue,
      contributionToFairValue: impliedEnterpriseValue / Math.max(assumptions.dilutedShares, 1),
      sourceType: segment.sourceType,
      sourceId: segment.sourceId,
      valuationBase: semantics.methodBases.sotp.valuationBase,
      sourceConfidence: semantics.methodBases.sotp.sourceConfidence,
    };
  });

  const segmentEnterpriseValue = components.reduce((sum, component) => sum + component.impliedEnterpriseValue, 0);
  const corporateCostValue = 0;
  const equityValue =
    segmentEnterpriseValue -
    corporateCostValue -
    assumptions.netDebt -
    assumptions.leaseLiabilities +
    assumptions.pensionSurplusDeficit +
    assumptions.associatesAndInvestments;

  return {
    valuationBase: semantics.methodBases.sotp,
    components,
    segmentEnterpriseValue,
    postTradeSegmentUplift,
    corporateCostValue,
    netDebt: assumptions.netDebt,
    leaseLiabilities: assumptions.leaseLiabilities,
    pensionSurplusDeficit: assumptions.pensionSurplusDeficit,
    associatesAndInvestments: assumptions.associatesAndInvestments,
    equityValue,
    fairValuePerShare: equityValue / Math.max(assumptions.dilutedShares, 1),
  };
}
