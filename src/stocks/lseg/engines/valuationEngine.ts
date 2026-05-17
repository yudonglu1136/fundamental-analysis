import type { Scenario, ValidationWarning } from "../../types";
import type { LsegCockpitDataset, LsegPostTradeValuationBridge, LsegValuationAssumptions, LsegValuationBridge, LsegValuationOutput } from "../types";
import { calculateLsegDividendBuybackEngine } from "./dividendBuybackEngine";
import { calculateLsegFcffEngine } from "./fcffEngine";
import { calculateLsegFcfYieldEngine } from "./fcfYieldEngine";
import { calculateLsegMoatEngine } from "./moatEngine";
import { calculateLsegMultipleEngine } from "./multipleEngine";
import { calculateLsegPlatformMoatAdjustment } from "./platformMoatEngine";
import { calculateLsegRiskAdjustment } from "./riskAdjustmentEngine";
import { calculateLsegRiskRedTeamEngine } from "./riskRedTeamEngine";
import { calculateLsegSotpEngine } from "./sotpEngine";
import { calculateLsegPostTradeSwapClearEconomicsEngine } from "./postTradeSwapClearEconomicsEngine";
import { resolveLsegValuationSemantics } from "./valuationSemantics";

function weightSum(assumptions: LsegValuationAssumptions) {
  return assumptions.weightFcffDcf +
    assumptions.weightFcfYield +
    assumptions.weightSotp +
    assumptions.weightEvEbitda +
    assumptions.weightPe +
    assumptions.weightPlatformMoat;
}

function normalizeWeights(assumptions: LsegValuationAssumptions) {
  const total = weightSum(assumptions);
  return {
    fcffDcf: assumptions.weightFcffDcf / total,
    fcfYield: assumptions.weightFcfYield / total,
    sotp: assumptions.weightSotp / total,
    evEbitda: assumptions.weightEvEbitda / total,
    pe: assumptions.weightPe / total,
    platformMoat: assumptions.weightPlatformMoat / total,
  };
}

function withoutPostTradeForwardEconomics(assumptions: LsegValuationAssumptions): LsegValuationAssumptions {
  return {
    ...assumptions,
    postTradeSwapClearEconomics: {
      ...assumptions.postTradeSwapClearEconomics,
      enabled: false,
    },
  };
}

function calculateMethodSet(
  data: LsegCockpitDataset,
  scenario: LsegCockpitDataset["scenarios"][Scenario],
  assumptions: LsegValuationAssumptions,
  weights: ReturnType<typeof normalizeWeights>,
) {
  const fcffDcf = calculateLsegFcffEngine(data, scenario, assumptions);
  const fcfYield = calculateLsegFcfYieldEngine(data, scenario, assumptions, fcffDcf);
  const sotp = calculateLsegSotpEngine(data, scenario, assumptions);
  const multiples = calculateLsegMultipleEngine(data, scenario, assumptions, fcffDcf);
  const moat = calculateLsegMoatEngine(assumptions);
  const risk = calculateLsegRiskRedTeamEngine(assumptions);
  const platformMoat = calculateLsegPlatformMoatAdjustment(moat, scenario.platformMoatAdjustment);
  const riskAdjustment = calculateLsegRiskAdjustment(risk, scenario.riskAdjustment);

  const coreBeforeMoat =
    fcffDcf.fairValuePerShare * weights.fcffDcf +
    fcfYield.impliedPrice * weights.fcfYield +
    sotp.fairValuePerShare * weights.sotp +
    multiples.evEbitdaFairValue * weights.evEbitda +
    multiples.peFairValue * weights.pe;
  const platformMoatFairValue = coreBeforeMoat * (1 + platformMoat.cappedAdjustment + riskAdjustment.cappedAdjustment);
  const fairValue =
    fcffDcf.fairValuePerShare * weights.fcffDcf +
    fcfYield.impliedPrice * weights.fcfYield +
    sotp.fairValuePerShare * weights.sotp +
    multiples.evEbitdaFairValue * weights.evEbitda +
    multiples.peFairValue * weights.pe +
    platformMoatFairValue * weights.platformMoat;

  const methodBridge: LsegValuationBridge[] = [
    {
      method: "FCFF DCF",
      fairValue: fcffDcf.fairValuePerShare,
      weight: weights.fcffDcf,
      contribution: fcffDcf.fairValuePerShare * weights.fcffDcf,
      sourceType: "forecast_assumption",
      explanation: "Segment revenue build-up to EBITDA, EBIT, NOPAT, capex, working capital, integration cost and FCFF.",
      ...fcffDcf.valuationBase,
    },
    {
      method: "FCF Yield",
      fairValue: fcfYield.impliedPrice,
      weight: weights.fcfYield,
      contribution: fcfYield.impliedPrice * weights.fcfYield,
      sourceType: "forecast_assumption",
      explanation: "Normalized FCF using official FCF, management floor and modeled FCFF; target yield is scenario assumption.",
      ...fcfYield.valuationBase,
    },
    {
      method: "SOTP",
      fairValue: sotp.fairValuePerShare,
      weight: weights.sotp,
      contribution: sotp.fairValuePerShare * weights.sotp,
      sourceType: "forecast_assumption",
      explanation: "Segment-specific EV/EBITDA multiples for D&A, FTSE, Risk Intelligence, Capital Markets, Post Trade and Corporate.",
      ...sotp.valuationBase,
    },
    {
      method: "EV/EBITDA",
      fairValue: multiples.evEbitdaFairValue,
      weight: weights.evEbitda,
      contribution: multiples.evEbitdaFairValue * weights.evEbitda,
      sourceType: "research_only",
      explanation: "Peer-informed cross-check; peer placeholders are research-only and dated.",
      ...multiples.valuationBases.evEbitda,
    },
    {
      method: "P/E",
      fairValue: multiples.peFairValue,
      weight: weights.pe,
      contribution: multiples.peFairValue * weights.pe,
      sourceType: "forecast_assumption",
      explanation: "Forward adjusted EPS cross-check.",
      ...multiples.valuationBases.pe,
    },
    {
      method: "Platform moat / risk overlay",
      fairValue: platformMoatFairValue,
      weight: weights.platformMoat,
      contribution: platformMoatFairValue * weights.platformMoat,
      sourceType: "forecast_assumption",
      explanation: "Capped moat premium less capped red-team risk adjustment; not allowed to double count terminal growth.",
      ...fcffDcf.valuationBase,
      valuationBase: "Capped platform moat / red-team overlay applied to the selected core valuation base.",
    },
  ];

  return {
    fcffDcf,
    fcfYield,
    sotp,
    multiples,
    moat,
    risk,
    platformMoat,
    riskAdjustment,
    coreBeforeMoat,
    platformMoatFairValue,
    fairValue,
    methodBridge,
  };
}

function buildPostTradeBridge(
  data: LsegCockpitDataset,
  scenario: LsegCockpitDataset["scenarios"][Scenario],
  assumptions: LsegValuationAssumptions,
  adjusted: ReturnType<typeof calculateMethodSet>,
  snapshot: ReturnType<typeof calculateMethodSet>,
): LsegPostTradeValuationBridge {
  const economics = calculateLsegPostTradeSwapClearEconomicsEngine(data, scenario, assumptions, {
    forecastEndYear: adjusted.fcffDcf.forecast[adjusted.fcffDcf.forecast.length - 1]?.year,
    wacc: scenario.wacc,
    terminalGrowth: scenario.terminalGrowth,
  });
  const methodDeltas = adjusted.methodBridge.map((method) => {
    const snapshotMethod = snapshot.methodBridge.find((row) => row.method === method.method);
    const methodFairValueDelta = method.fairValue - (snapshotMethod?.fairValue ?? method.fairValue);
    return {
      method: method.method,
      methodFairValueDelta,
      weightedContributionDelta: methodFairValueDelta * method.weight,
    };
  });
  const terminalDurationPerShare = adjusted.fcffDcf.postTradeDurationValue / Math.max(assumptions.dilutedShares, 1);
  const dcfWeight = adjusted.methodBridge.find((row) => row.method === "FCFF DCF")?.weight ?? assumptions.weightFcffDcf;
  const terminalDurationWeightedDelta = terminalDurationPerShare * dcfWeight;
  const dcfFcfDeltaBeforeTerminalSplit = methodDeltas
    .filter((row) => row.method === "FCFF DCF" || row.method === "FCF Yield" || row.method === "P/E")
    .reduce((sum, row) => sum + row.weightedContributionDelta, 0);
  const dcfFcfDelta = dcfFcfDeltaBeforeTerminalSplit - terminalDurationWeightedDelta;
  const segmentMultipleDelta = methodDeltas
    .filter((row) => row.method === "SOTP" || row.method === "EV/EBITDA")
    .reduce((sum, row) => sum + row.weightedContributionDelta, 0);
  const overlayDelta = methodDeltas
    .filter((row) => row.method === "Platform moat / risk overlay")
    .reduce((sum, row) => sum + row.weightedContributionDelta, 0);
  const netDebtDrag = economics.netDebtImpactAlreadyCaptured ? 0 : -economics.netDebtDragPerShare;

  return {
    active: economics.active,
    scenario: scenario.scenario,
    snapshotFairValue: snapshot.fairValue,
    adjustedFairValue: adjusted.fairValue,
    totalUplift: adjusted.fairValue - snapshot.fairValue,
    totalUpliftPct: adjusted.fairValue / Math.max(snapshot.fairValue, 1) - 1,
    methodDeltas,
    economics,
    rows: [
      {
        label: "Current snapshot fair value",
        valuePerShare: snapshot.fairValue,
        detail: "Existing model value from the reported margin, FCF and net debt snapshot, with no explicit 2026+ SwapClear economics layer.",
      },
      {
        label: "Add: 2026+ FCF and AEPS uplift",
        valuePerShare: dcfFcfDelta,
        detail: `Year-one incremental Post Trade EBITDA is GBP ${economics.yearOneIncrementalEbitda.toFixed(1)}m and incremental FCFF is GBP ${economics.yearOneIncrementalFcff.toFixed(1)}m.`,
      },
      {
        label: "Add: segment multiple uplift",
        valuePerShare: segmentMultipleDelta,
        detail: `Post Trade segment multiple premium is ${economics.segmentMultiplePremium.toFixed(1)}x in the ${scenario.scenario} case.`,
      },
      {
        label: "Add: terminal / duration uplift",
        valuePerShare: terminalDurationWeightedDelta,
        detail: `DCF explicitly values recurring 2026-2045 economics and applies ${(economics.terminalResidualCapturePct * 100).toFixed(0)}% residual capture after 2045.`,
      },
      {
        label: "Add: moat / risk overlay effect",
        valuePerShare: overlayDelta,
        detail: "Overlay changes only because the weighted core method value changed; moat and red-team caps are unchanged.",
      },
      {
        label: "Less: incremental net debt / leverage drag",
        valuePerShare: netDebtDrag,
        detail: economics.netDebtImpactAlreadyCaptured
          ? "No additional deduction: transaction debt impact is already captured in the current net debt snapshot."
          : `Incremental transaction debt impact is GBP ${economics.transactionDebtImpact.toFixed(0)}m.`,
      },
      {
        label: "Final adjusted fair value",
        valuePerShare: adjusted.fairValue,
        detail: "Weighted valuation after DCF, FCF yield, SOTP, EV/EBITDA and P/E consume the forward economics layer.",
      },
    ],
  };
}

function warningsForValuation(output: Omit<LsegValuationOutput, "warnings">, assumptions: LsegValuationAssumptions): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const totalWeight = weightSum(assumptions);
  if (Math.abs(totalWeight - 1) > 0.0001) {
    warnings.push({
      id: "lseg-weight-sum",
      title: "Valuation weights do not sum to 100%",
      detail: `Weights sum to ${(totalWeight * 100).toFixed(1)}%. Runtime valuation normalizes them, but validation should fail until assumptions are fixed.`,
      severity: "high",
    });
  }
  if (output.fcffDcf.terminalValuePctOfEnterpriseValue > 0.75) {
    warnings.push({
      id: "lseg-terminal-value-high",
      title: "DCF terminal value concentration is high",
      detail: `Terminal value is ${(output.fcffDcf.terminalValuePctOfEnterpriseValue * 100).toFixed(1)}% of EV.`,
      severity: "medium",
    });
  }
  if (output.fcffDcf.averageFcffConversion < 0.45 || output.fcffDcf.averageFcffConversion > 0.75) {
    warnings.push({
      id: "lseg-fcff-conversion",
      title: "FCFF conversion outside normal range",
      detail: `Average FCFF conversion is ${(output.fcffDcf.averageFcffConversion * 100).toFixed(1)}% of adjusted EBITDA.`,
      severity: "medium",
    });
  }
  if (Math.abs(output.moat.cappedValuationAdjustment) > assumptions.platformMoatCap + 0.0001) {
    warnings.push({
      id: "lseg-platform-moat-cap",
      title: "Platform moat cap breached",
      detail: "Platform moat adjustment exceeds the configured cap.",
      severity: "high",
    });
  }
  if (Math.abs(output.risk.cappedRiskAdjustment) > assumptions.riskAdjustmentCap + 0.0001) {
    warnings.push({
      id: "lseg-risk-adjustment-cap",
      title: "Risk adjustment cap breached",
      detail: "Risk adjustment exceeds the configured cap.",
      severity: "high",
    });
  }
  if (output.postTradeBridge.economics.active && output.postTradeBridge.economics.yearOneIncrementalFcff <= 0) {
    warnings.push({
      id: "lseg-post-trade-uplift-missing",
      title: "Post Trade forward economics are active but no 2026+ FCF uplift is applied",
      detail: "The SwapClear layer is known as of the snapshot, but the first forecast year does not include incremental FCFF.",
      severity: "high",
    });
  }
  if (output.postTradeBridge.economics.alreadyIncludedInActuals && output.fcffDcf.forecast.some((row) => row.year <= 2025 && row.postTradeIncrementalFcff > 0)) {
    warnings.push({
      id: "lseg-post-trade-2025-double-count",
      title: "Potential 2025 SwapClear double count",
      detail: "FY2025 actuals already include the 2025 transaction effect, so the forward layer must not add another 2025 uplift.",
      severity: "high",
    });
  }
  if (!output.postTradeBridge.economics.netDebtImpactAlreadyCaptured && output.postTradeBridge.economics.netDebtDragPerShare <= 0) {
    warnings.push({
      id: "lseg-post-trade-net-debt-missing",
      title: "Post Trade transaction debt drag is not captured",
      detail: "The model is configured as if net debt has not captured the transaction, but no per-share leverage drag is applied.",
      severity: "high",
    });
  }
  return warnings;
}

export function calculateLsegValuationEngine(
  data: LsegCockpitDataset,
  scenarioName: Scenario,
  assumptions: LsegValuationAssumptions,
): LsegValuationOutput {
  const scenario = data.scenarios[scenarioName];
  const weights = normalizeWeights(assumptions);
  const adjusted = calculateMethodSet(data, scenario, assumptions, weights);
  const snapshot = calculateMethodSet(data, scenario, withoutPostTradeForwardEconomics(assumptions), weights);
  const dividendBuyback = calculateLsegDividendBuybackEngine(data, assumptions);
  const postTradeBridge = buildPostTradeBridge(data, scenario, assumptions, adjusted, snapshot);
  const valuationSemantics = resolveLsegValuationSemantics(data);
  const carriedForwardLeaseLiabilities = valuationSemantics.balanceSheetCarryForward?.leaseLiabilities ?? 0;
  const weightForEnterpriseToEquityBridge =
    weights.fcffDcf +
    weights.sotp +
    weights.evEbitda +
    weights.platformMoat;
  const modelQaDiagnostics = {
    dcfYearOneBaseAudit: adjusted.fcffDcf.yearOneBaseAudit,
    valuationSemantics,
    balanceSheetBridgeAudit: {
      netDebt: assumptions.netDebt,
      leaseLiabilities: assumptions.leaseLiabilities,
      carriedForwardLeaseLiabilities,
      grossPerShareImpact: carriedForwardLeaseLiabilities / Math.max(assumptions.dilutedShares, 1),
      weightedValuationImpact: carriedForwardLeaseLiabilities / Math.max(assumptions.dilutedShares, 1) * weightForEnterpriseToEquityBridge,
      sourcePeriodId: valuationSemantics.balanceSheetCarryForward?.sourcePeriodId,
    },
    postTradeDriverAudit: {
      snapshotFairValue: postTradeBridge.snapshotFairValue,
      finalFairValue: postTradeBridge.adjustedFairValue,
      uplift: postTradeBridge.totalUplift,
      upliftPct: postTradeBridge.totalUpliftPct,
    },
  };

  const scenarioValues = (Object.keys(data.scenarios) as Scenario[]).map((name) => {
    const localScenario = data.scenarios[name];
    const localAdjusted = calculateMethodSet(data, localScenario, assumptions, weights);
    return {
      scenario: name,
      fairValue: localAdjusted.fairValue,
      upsideDownside: localAdjusted.fairValue / Math.max(assumptions.currentPrice, 1) - 1,
      probability: localScenario.probability,
    };
  });

  const partialOutput = {
    scenario: scenarioName,
    currentPrice: assumptions.currentPrice,
    priceDate: assumptions.priceDate,
    peFairValue: adjusted.multiples.peFairValue,
    fcfFairValue: adjusted.fcfYield.impliedPrice,
    dcfValue: adjusted.fcffDcf.fairValuePerShare,
    recommendedFairValueMethod: "full_operating_sotp_blend" as const,
    fcffDcf: adjusted.fcffDcf,
    fcfYield: adjusted.fcfYield,
    sotp: adjusted.sotp,
    multiples: adjusted.multiples,
    moat: adjusted.moat,
    risk: adjusted.risk,
    dividendBuyback,
    methodBridge: adjusted.methodBridge,
    postTradeBridge,
    modelQaDiagnostics,
    fairValue: adjusted.fairValue,
    valuationRangeLow: Math.min(...scenarioValues.map((row) => row.fairValue)),
    valuationRangeHigh: Math.max(...scenarioValues.map((row) => row.fairValue)),
    upsideDownside: adjusted.fairValue / Math.max(assumptions.currentPrice, 1) - 1,
    scenarioValues,
  };

  return {
    ...partialOutput,
    warnings: warningsForValuation(partialOutput, assumptions),
  };
}

export type LsegValuationEngineResult = ReturnType<typeof calculateLsegValuationEngine>;
