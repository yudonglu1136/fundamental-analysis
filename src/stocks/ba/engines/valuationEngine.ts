import type { Scenario, ValidationWarning } from "../../types";
import type { BaBacklogEngineOutput, BaDataset, BaDcfOutput, BaValuationAssumptions, BaValuationOutput } from "../model";
import { buildSensitivityTable } from "../../../utils/chartHelpers";
import { clamp, safeRatio } from "./helpers";

function buildDcf(data: BaDataset, assumptions: BaValuationAssumptions): BaDcfOutput {
  const latest = data.periods.find((period) => period.id === "fy25") ?? data.periods[data.periods.length - 1];
  const forecast = Array.from({ length: 5 }, (_, index) => {
    const year = latest.fiscalYear + index + 1;
    const priorSales = index === 0 ? latest.sales : 0;
    const sales = latest.sales * (1 + assumptions.revenueCagr) ** (index + 1);
    const previousSales = index === 0 ? priorSales : latest.sales * (1 + assumptions.revenueCagr) ** index;
    const underlyingEbit = sales * assumptions.operatingMargin;
    const nopat = underlyingEbit * (1 - assumptions.taxRate);
    const depreciationAmortization = sales * assumptions.dAndAIntensity;
    const capex = sales * assumptions.capexIntensity;
    const workingCapitalInvestment = Math.max(sales - previousSales, 0) * assumptions.workingCapitalDragPctRevenueGrowth;
    const unleveredFreeCashFlow = nopat + depreciationAmortization - capex - workingCapitalInvestment;
    return {
      year,
      sales,
      underlyingEbit,
      ebitMargin: assumptions.operatingMargin,
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
  const equityValue = enterpriseValue - assumptions.netDebtExLeases - assumptions.leaseLiabilitiesNet + assumptions.pensionSurplusCredit;
  const fairValuePerShare = equityValue / assumptions.dilutedShares;
  const terminalValueShareOfEv = safeRatio(presentValueTerminalValue, enterpriseValue);
  return {
    forecast,
    discountFactors,
    presentValueCashFlows,
    terminalValue,
    presentValueTerminalValue,
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    terminalValueShareOfEv,
  };
}

function buildSingleScenarioValuation(
  data: BaDataset,
  assumptions: BaValuationAssumptions,
  backlog: BaBacklogEngineOutput,
) {
  const latest = data.periods.find((period) => period.id === "fy25") ?? data.periods[data.periods.length - 1];
  const guidance = data.guidance[0];
  const dcf = buildDcf(data, assumptions);
  const firstForecastYear = dcf.forecast[0];
  const afterTaxFinanceCost = (guidance?.underlyingNetFinanceCosts ?? 370) * (1 - assumptions.taxRate);
  const equityFcfYear1 = firstForecastYear.unleveredFreeCashFlow - afterTaxFinanceCost;
  const normalizedFcf = Math.max(
    guidance?.freeCashFlowFloor ?? 0,
    (latest.freeCashFlow + (guidance?.freeCashFlowFloor ?? latest.freeCashFlow) + equityFcfYear1) / 3,
  );
  const fcfYieldFairValue = normalizedFcf / assumptions.targetFcfYield / assumptions.dilutedShares;
  const forwardPbt = firstForecastYear.underlyingEbit - (guidance?.underlyingNetFinanceCosts ?? 370);
  const forwardProfitToEquity = forwardPbt * (1 - assumptions.taxRate) - (guidance?.nonControllingInterests ?? 80);
  const forwardEpsPence = safeRatio(forwardProfitToEquity, assumptions.dilutedShares) * 100;
  const peFairValue = (forwardEpsPence / 100) * assumptions.targetPe;
  const evEbitFairValue = (
    firstForecastYear.underlyingEbit * assumptions.targetEvEbit -
    assumptions.netDebtExLeases -
    assumptions.leaseLiabilitiesNet +
    assumptions.pensionSurplusCredit
  ) / assumptions.dilutedShares;
  const backlogAdjustment = clamp(
    ((backlog.backlogDurabilityScore - 50) / 50) * assumptions.backlogDurabilityMaxAdjustment,
    -assumptions.backlogDurabilityMaxAdjustment,
    assumptions.backlogDurabilityMaxAdjustment,
  );
  const coreWeight = assumptions.weightDcf + assumptions.weightFcfYield + assumptions.weightEvEbit + assumptions.weightPe;
  const coreFairValue = (
    dcf.fairValuePerShare * assumptions.weightDcf +
    fcfYieldFairValue * assumptions.weightFcfYield +
    evEbitFairValue * assumptions.weightEvEbit +
    peFairValue * assumptions.weightPe
  ) / Math.max(coreWeight, 0.01);
  const backlogAdjustedFairValue = coreFairValue * (1 + backlogAdjustment);
  const blendedFairValue =
    dcf.fairValuePerShare * assumptions.weightDcf +
    fcfYieldFairValue * assumptions.weightFcfYield +
    evEbitFairValue * assumptions.weightEvEbit +
    peFairValue * assumptions.weightPe +
    backlogAdjustedFairValue * assumptions.weightBacklogDurability;

  return {
    dcf,
    fcfYieldFairValue,
    peFairValue,
    evEbitFairValue,
    backlogAdjustedFairValue,
    blendedFairValue,
    normalizedFcf,
    forwardEpsPence,
    forwardUnderlyingEbit: firstForecastYear.underlyingEbit,
  };
}

export function calculateBaValuationEngine(
  data: BaDataset,
  scenario: Scenario,
  assumptions: BaValuationAssumptions,
  backlog: BaBacklogEngineOutput,
): BaValuationOutput {
  const selected = buildSingleScenarioValuation(data, assumptions, backlog);
  const weights = {
    dcf: assumptions.weightDcf,
    fcfYield: assumptions.weightFcfYield,
    evEbit: assumptions.weightEvEbit,
    pe: assumptions.weightPe,
    backlogDurability: assumptions.weightBacklogDurability,
  };
  const scenarioValues = data.defenseCycleScenarios.map((scenarioDefinition) => {
    const scenarioAssumptions = {
      ...assumptions,
      revenueCagr: scenarioDefinition.revenueCagr,
      operatingMargin: scenarioDefinition.operatingMargin,
      targetPe: scenarioDefinition.targetPe,
      targetEvEbit: scenarioDefinition.targetEvEbit,
      targetFcfYield: scenarioDefinition.targetFcfYield,
      wacc: scenarioDefinition.wacc,
      terminalGrowth: scenarioDefinition.terminalGrowth,
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
      id: "ba-program-source-isolation",
      title: "Program qualitative notes crossed source boundary",
      detail: "Program exposure records should remain research-only and should not become direct valuation actuals.",
      severity: "high",
    });
  }
  if (data.risks.some((risk) => risk.sourceStatus !== "research_only")) {
    sourceIsolationWarnings.push({
      id: "ba-risk-source-isolation",
      title: "Risk red-team notes crossed source boundary",
      detail: "Risk red-team records should remain research-only and should not become direct valuation actuals.",
      severity: "high",
    });
  }
  if (Math.abs(Object.values(weights).reduce((sum, weight) => sum + weight, 0) - 1) > 0.0001) {
    sourceIsolationWarnings.push({
      id: "ba-weight-sum",
      title: "Valuation weights do not sum to 100%",
      detail: `Valuation weights sum to ${Object.values(weights).reduce((sum, weight) => sum + weight, 0).toFixed(3)}.`,
      severity: "high",
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

export function buildBaSensitivityTables(data: BaDataset, assumptions: BaValuationAssumptions, backlog: BaBacklogEngineOutput) {
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
      title: "Scenario sensitivity: revenue CAGR vs EBIT margin",
      table: buildSensitivityTable(
        "Revenue CAGR",
        "EBIT margin",
        [assumptions.revenueCagr - 0.02, assumptions.revenueCagr, assumptions.revenueCagr + 0.02],
        [assumptions.operatingMargin - 0.01, assumptions.operatingMargin, assumptions.operatingMargin + 0.01],
        (revenueCagr, operatingMargin) =>
          buildSingleScenarioValuation(data, { ...assumptions, revenueCagr, operatingMargin }, backlog).blendedFairValue,
      ),
    },
  ];
}
