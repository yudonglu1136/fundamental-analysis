import type { Scenario, ValidationWarning } from "../../types";
import { buildSensitivityTable } from "../../../utils/chartHelpers";
import type { NocBacklogEngineOutput, NocDataset, NocDcfOutput, NocValuationAssumptions, NocValuationOutput } from "../model";
import { clamp, safeRatio } from "./helpers";

function latestAnnual(data: NocDataset) {
  const annualPeriods = data.periods.filter((period) => period.periodType === "annual");
  return data.periods.find((period) => period.id === "fy25") ?? annualPeriods[annualPeriods.length - 1] ?? data.periods[0];
}

function adjustedRevenueCagr(assumptions: NocValuationAssumptions) {
  return assumptions.revenueCagr + (assumptions.b21ScaleMultiplier - 1) * 0.006 + assumptions.spaceGrowthPremium;
}

function adjustedMargin(assumptions: NocValuationAssumptions) {
  return clamp(assumptions.segmentOperatingMargin - assumptions.sentinelRiskCharge + assumptions.missionMoatPremium * 0.15, 0.075, 0.14);
}

function buildDcf(data: NocDataset, assumptions: NocValuationAssumptions): NocDcfOutput {
  const latest = latestAnnual(data);
  const revenueCagr = adjustedRevenueCagr(assumptions);
  const margin = adjustedMargin(assumptions);
  const forecast = Array.from({ length: 5 }, (_, index) => {
    const year = latest.fiscalYear + index + 1;
    const sales = latest.sales * (1 + revenueCagr) ** (index + 1);
    const previousSales = index === 0 ? latest.sales : latest.sales * (1 + revenueCagr) ** index;
    const segmentOperatingIncome = sales * margin;
    const nopat = segmentOperatingIncome * (1 - assumptions.taxRate);
    const depreciationAmortization = sales * assumptions.dAndAIntensity;
    const capex = sales * assumptions.capexIntensity;
    const workingCapitalInvestment = Math.max(sales - previousSales, 0) * assumptions.workingCapitalDragPctRevenueGrowth;
    const unleveredFreeCashFlow = nopat + depreciationAmortization - capex - workingCapitalInvestment;
    return {
      year,
      sales,
      segmentOperatingIncome,
      segmentOperatingMargin: margin,
      nopat,
      depreciationAmortization,
      capex,
      workingCapitalInvestment,
      unleveredFreeCashFlow,
    };
  });
  const discountFactors = forecast.map((_, index) => 1 / (1 + assumptions.wacc) ** (index + 1));
  const presentValueCashFlows = forecast.reduce((sum, row, index) => sum + row.unleveredFreeCashFlow * discountFactors[index], 0);
  const terminalValue = forecast[forecast.length - 1].unleveredFreeCashFlow * (1 + assumptions.terminalGrowth) /
    Math.max(assumptions.wacc - assumptions.terminalGrowth, 0.01);
  const presentValueTerminalValue = terminalValue * discountFactors[discountFactors.length - 1];
  const enterpriseValue = presentValueCashFlows + presentValueTerminalValue;
  const equityValue = enterpriseValue - assumptions.netDebt + assumptions.pensionSurplusCredit;
  const fairValuePerShare = equityValue / assumptions.dilutedShares;
  return {
    forecast,
    discountFactors,
    presentValueCashFlows,
    terminalValue,
    presentValueTerminalValue,
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    terminalValueShareOfEv: safeRatio(presentValueTerminalValue, enterpriseValue),
  };
}

function buildSotp(data: NocDataset, assumptions: NocValuationAssumptions) {
  const rows = data.segments.filter((row) => row.periodId === "fy25" && row.segment !== "Intersegment eliminations");
  const multiples: Record<string, number> = {
    "Aeronautics Systems": 15.5 + (assumptions.b21ScaleMultiplier - 1) * 2,
    "Defense Systems": 13.5 - assumptions.sentinelRiskCharge * 80,
    "Mission Systems": 16.5 + assumptions.missionMoatPremium * 80,
    "Space Systems": 15 + assumptions.spaceGrowthPremium * 90,
  };
  const guidance = data.guidance[0];
  const guidanceRows = guidance?.segmentGuidance ?? [];
  const segmentSotpRows = rows.map((row) => {
    const guidanceRow = guidanceRows.find((item) => item.segment === row.segment);
    const sales = guidanceRow?.modeledSalesMidpoint ?? row.sales * (1 + adjustedRevenueCagr(assumptions));
    const margin = guidanceRow?.modeledMarginMidpoint ?? adjustedMargin(assumptions);
    const ebit = sales * margin;
    const multiple = multiples[row.segment] ?? assumptions.targetEvEbit;
    return {
      segment: row.segment,
      sales,
      margin,
      ebit,
      multiple,
      value: ebit * multiple,
    };
  });
  const enterpriseValue = segmentSotpRows.reduce((sum, row) => sum + row.value, 0);
  const fairValue = (enterpriseValue - assumptions.netDebt + assumptions.pensionSurplusCredit) / assumptions.dilutedShares;
  return { fairValue, segmentSotpRows };
}

function buildSingleScenarioValuation(
  data: NocDataset,
  assumptions: NocValuationAssumptions,
  backlog: NocBacklogEngineOutput,
) {
  const latest = latestAnnual(data);
  const guidance = data.guidance[0];
  const dcf = buildDcf(data, assumptions);
  const firstForecastYear = dcf.forecast[0];
  const normalizedFcf = Math.max(
    safeRatio((guidance?.freeCashFlowLow ?? 0) + (guidance?.freeCashFlowHigh ?? 0), 2),
    (latest.freeCashFlow + firstForecastYear.unleveredFreeCashFlow) / 2,
  );
  const fcfYieldFairValue = normalizedFcf / assumptions.targetFcfYield / assumptions.dilutedShares;
  const forwardSegmentOperatingIncome = firstForecastYear.segmentOperatingIncome;
  const afterTaxInterestAndCorporate = Math.max(forwardSegmentOperatingIncome - (guidance?.segmentOperatingIncomeLow ?? forwardSegmentOperatingIncome * 0.94), 320);
  const forwardNetIncome = (forwardSegmentOperatingIncome - afterTaxInterestAndCorporate) * (1 - assumptions.taxRate);
  const forwardEps = Math.max(guidance ? (guidance.mtmAdjustedEpsLow + guidance.mtmAdjustedEpsHigh) / 2 : 0, safeRatio(forwardNetIncome, assumptions.dilutedShares));
  const peFairValue = forwardEps * assumptions.targetPe;
  const evEbitFairValue = (forwardSegmentOperatingIncome * assumptions.targetEvEbit - assumptions.netDebt + assumptions.pensionSurplusCredit) / assumptions.dilutedShares;
  const sotp = buildSotp(data, assumptions);
  const backlogAdjustment = clamp(
    ((backlog.backlogDurabilityScore - 55) / 55) * assumptions.backlogDurabilityMaxAdjustment,
    -assumptions.backlogDurabilityMaxAdjustment,
    assumptions.backlogDurabilityMaxAdjustment,
  );
  const coreWeight = assumptions.weightDcf + assumptions.weightFcfYield + assumptions.weightEvEbit + assumptions.weightPe + assumptions.weightSotp;
  const coreFairValue = (
    dcf.fairValuePerShare * assumptions.weightDcf +
    fcfYieldFairValue * assumptions.weightFcfYield +
    evEbitFairValue * assumptions.weightEvEbit +
    peFairValue * assumptions.weightPe +
    sotp.fairValue * assumptions.weightSotp
  ) / Math.max(coreWeight, 0.01);
  const backlogAdjustedFairValue = coreFairValue * (1 + backlogAdjustment);
  const blendedFairValue =
    dcf.fairValuePerShare * assumptions.weightDcf +
    fcfYieldFairValue * assumptions.weightFcfYield +
    evEbitFairValue * assumptions.weightEvEbit +
    peFairValue * assumptions.weightPe +
    sotp.fairValue * assumptions.weightSotp +
    backlogAdjustedFairValue * assumptions.weightBacklogDurability;

  return {
    dcf,
    fcfYieldFairValue,
    peFairValue,
    evEbitFairValue,
    sotpFairValue: sotp.fairValue,
    backlogAdjustedFairValue,
    blendedFairValue,
    normalizedFcf,
    forwardEps,
    forwardSegmentOperatingIncome,
    segmentSotpRows: sotp.segmentSotpRows,
  };
}

export function calculateNocValuationEngine(
  data: NocDataset,
  scenario: Scenario,
  assumptions: NocValuationAssumptions,
  backlog: NocBacklogEngineOutput,
): NocValuationOutput {
  const selected = buildSingleScenarioValuation(data, assumptions, backlog);
  const weights = {
    dcf: assumptions.weightDcf,
    fcfYield: assumptions.weightFcfYield,
    evEbit: assumptions.weightEvEbit,
    pe: assumptions.weightPe,
    sotp: assumptions.weightSotp,
    backlogDurability: assumptions.weightBacklogDurability,
  };
  const scenarioValues = data.budgetScenarios.map((scenarioDefinition) => {
    const scenarioAssumptions = {
      ...assumptions,
      revenueCagr: scenarioDefinition.revenueCagr,
      segmentOperatingMargin: scenarioDefinition.segmentOperatingMargin,
      targetPe: scenarioDefinition.targetPe,
      targetEvEbit: scenarioDefinition.targetEvEbit,
      targetFcfYield: scenarioDefinition.targetFcfYield,
      wacc: scenarioDefinition.wacc,
      terminalGrowth: scenarioDefinition.terminalGrowth,
      b21ScaleMultiplier: scenarioDefinition.b21ScaleMultiplier,
      sentinelRiskCharge: scenarioDefinition.sentinelRiskCharge,
      spaceGrowthPremium: scenarioDefinition.spaceGrowthPremium,
      missionMoatPremium: scenarioDefinition.missionMoatPremium,
    };
    return {
      scenario: scenarioDefinition.scenario,
      probability: scenarioDefinition.scenarioProbability,
      value: buildSingleScenarioValuation(data, scenarioAssumptions, backlog).blendedFairValue,
    };
  });
  const probabilityTotal = scenarioValues.reduce((sum, row) => sum + row.probability, 0);
  const probabilityWeightedFairValue = scenarioValues.reduce((sum, row) => sum + row.value * row.probability, 0) /
    Math.max(probabilityTotal, 0.01);

  const sourceIsolationWarnings: ValidationWarning[] = [];
  if (data.programs.some((program) => program.sourceStatus !== "research_only")) {
    sourceIsolationWarnings.push({
      id: "noc-program-source-isolation",
      title: "Program notes crossed source boundary",
      detail: "B-21, Sentinel, Space and Mission Systems program records must stay research-only and flow into valuation only through explicit assumptions.",
      severity: "high",
    });
  }
  if (data.risks.some((risk) => risk.sourceStatus !== "research_only")) {
    sourceIsolationWarnings.push({
      id: "noc-risk-source-isolation",
      title: "Risk red-team notes crossed source boundary",
      detail: "Risk notes must remain research-only and should not become official actuals.",
      severity: "high",
    });
  }
  if (Math.abs(Object.values(weights).reduce((sum, weight) => sum + weight, 0) - 1) > 0.0001) {
    sourceIsolationWarnings.push({
      id: "noc-weight-sum",
      title: "Valuation weights do not sum to 100%",
      detail: `Valuation weights sum to ${Object.values(weights).reduce((sum, weight) => sum + weight, 0).toFixed(3)}.`,
      severity: "high",
    });
  }
  if (scenario === "Bull" && assumptions.sentinelRiskCharge > 0.004) {
    sourceIsolationWarnings.push({
      id: "noc-bull-sentinel-risk",
      title: "Bull case still has high Sentinel risk charge",
      detail: "Bull scenario should only be used if Sentinel cost discipline improves; otherwise treat bull valuation as internally inconsistent.",
      severity: "medium",
    });
  }

  const scenarioLow = scenarioValues.find((row) => row.scenario === "Bear")?.value ?? selected.blendedFairValue * 0.85;
  const scenarioHigh = scenarioValues.find((row) => row.scenario === "Bull")?.value ?? selected.blendedFairValue * 1.15;
  return {
    ...selected,
    valuationRangeLow: Math.min(scenarioLow, selected.blendedFairValue),
    valuationRangeHigh: Math.max(scenarioHigh, selected.blendedFairValue),
    probabilityWeightedFairValue,
    finalWeights: weights,
    sourceIsolationWarnings,
  };
}

export function buildNocSensitivityTables(data: NocDataset, assumptions: NocValuationAssumptions, backlog: NocBacklogEngineOutput) {
  return [
    {
      title: "DCF sensitivity: WACC vs terminal growth",
      table: buildSensitivityTable(
        "WACC",
        "Terminal growth",
        [assumptions.wacc - 0.01, assumptions.wacc, assumptions.wacc + 0.01],
        [assumptions.terminalGrowth - 0.005, assumptions.terminalGrowth, assumptions.terminalGrowth + 0.005],
        (wacc, terminalGrowth) =>
          buildSingleScenarioValuation(data, { ...assumptions, wacc, terminalGrowth }, backlog).dcf.fairValuePerShare,
      ),
    },
    {
      title: "Program sensitivity: B-21 scale vs Sentinel risk charge",
      table: buildSensitivityTable(
        "B-21 scale",
        "Sentinel risk",
        [assumptions.b21ScaleMultiplier - 0.1, assumptions.b21ScaleMultiplier, assumptions.b21ScaleMultiplier + 0.1],
        [Math.max(0, assumptions.sentinelRiskCharge - 0.004), assumptions.sentinelRiskCharge, assumptions.sentinelRiskCharge + 0.004],
        (b21ScaleMultiplier, sentinelRiskCharge) =>
          buildSingleScenarioValuation(data, { ...assumptions, b21ScaleMultiplier, sentinelRiskCharge }, backlog).blendedFairValue,
      ),
    },
    {
      title: "Scenario sensitivity: revenue CAGR vs segment margin",
      table: buildSensitivityTable(
        "Revenue CAGR",
        "Segment margin",
        [assumptions.revenueCagr - 0.015, assumptions.revenueCagr, assumptions.revenueCagr + 0.015],
        [assumptions.segmentOperatingMargin - 0.006, assumptions.segmentOperatingMargin, assumptions.segmentOperatingMargin + 0.006],
        (revenueCagr, segmentOperatingMargin) =>
          buildSingleScenarioValuation(data, { ...assumptions, revenueCagr, segmentOperatingMargin }, backlog).blendedFairValue,
      ),
    },
  ];
}
