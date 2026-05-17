import type { Scenario, ValidationWarning } from "../../types";
import { buildSensitivityTable } from "../../../utils/chartHelpers";
import type { MetaDataset, MetaDcfOutput, MetaForecastYear, MetaValuationAssumptions, MetaValuationOutput } from "../model";
import { metaScenarioDefinitions } from "../data/forecastAssumptions";
import { calculateMetaForecastEngine } from "./forecastEngine";
import { normalizeWeights, safeRatio } from "./helpers";

function calculateDcf(forecast: MetaForecastYear[], assumptions: MetaValuationAssumptions): MetaDcfOutput {
  const presentValues = forecast.map((row, index) => row.unleveredFreeCashFlow / (1 + assumptions.wacc) ** (index + 1));
  const presentValueCashFlows = presentValues.reduce((sum, value) => sum + value, 0);
  const finalFcf = forecast[forecast.length - 1]?.unleveredFreeCashFlow ?? 0;
  const terminalValue = finalFcf * (1 + assumptions.terminalGrowth) / Math.max(assumptions.wacc - assumptions.terminalGrowth, 0.001);
  const presentValueTerminalValue = terminalValue / (1 + assumptions.wacc) ** forecast.length;
  const enterpriseValue = presentValueCashFlows + presentValueTerminalValue;
  const equityValue = enterpriseValue + assumptions.netCash;
  return {
    forecast,
    presentValueCashFlows,
    terminalValue,
    presentValueTerminalValue,
    enterpriseValue,
    equityValue,
    fairValuePerShare: safeRatio(equityValue, assumptions.dilutedShares),
    terminalValueShareOfEv: safeRatio(presentValueTerminalValue, Math.max(enterpriseValue, 1)),
  };
}

export function calculateMetaValuationEngine(
  data: MetaDataset,
  scenario: Scenario,
  assumptions: MetaValuationAssumptions,
  precomputedForecast?: MetaForecastYear[],
): MetaValuationOutput {
  const forecast = precomputedForecast ?? calculateMetaForecastEngine(data, assumptions);
  const dcf = calculateDcf(forecast, assumptions);
  const normalizedYear = forecast[2] ?? forecast[forecast.length - 1];
  const forwardYear = forecast[1] ?? forecast[0];
  const terminalYear = forecast[forecast.length - 1] ?? forecast[0];
  const fcfYieldFairValue = safeRatio(normalizedYear.fcfPerShare, assumptions.targetFcfYield);
  const peFairValue = forwardYear.eps * assumptions.targetPe;
  const evEbitFairValue = safeRatio((forwardYear.operatingIncome * assumptions.targetEvEbit) + assumptions.netCash, forwardYear.dilutedShares);
  const sotpEnterpriseValue =
    (forwardYear.familyOfAppsOperatingIncome * assumptions.foaEbitMultiple)
    - (Math.abs(forwardYear.realityLabsOperatingIncome) * 2)
    + assumptions.realityLabsOptionValue;
  const sotpFairValue = safeRatio(sotpEnterpriseValue + assumptions.netCash, forwardYear.dilutedShares);

  const rawWeights = {
    dcf: assumptions.weightDcf,
    fcfYield: assumptions.weightFcfYield,
    pe: assumptions.weightPe,
    evEbit: assumptions.weightEvEbit,
    sotp: assumptions.weightSotp,
  };
  const finalWeights = normalizeWeights(rawWeights);
  const blendedFairValue =
    (dcf.fairValuePerShare * finalWeights.dcf)
    + (fcfYieldFairValue * finalWeights.fcfYield)
    + (peFairValue * finalWeights.pe)
    + (evEbitFairValue * finalWeights.evEbit)
    + (sotpFairValue * finalWeights.sotp);

  const aiRequiredReturn = terminalYear.cumulativeAiGrowthCapex * assumptions.wacc;
  const aiExcessReturn = Math.max(0, terminalYear.aiIncrementalAfterTaxProfit - aiRequiredReturn);
  const aiExcessReturnValuePerShare = safeRatio(aiExcessReturn * 10, terminalYear.dilutedShares);
  const probability = metaScenarioDefinitions.find((item) => item.scenario === scenario)?.probabilityWeight ?? 0;
  const sourceIsolationWarnings: ValidationWarning[] = [];
  if (aiExcessReturnValuePerShare > 0) {
    sourceIsolationWarnings.push({
      id: `meta-ai-excess-return-diagnostic-${scenario}`,
      title: "AI excess-return value is diagnostic only",
      detail: "AI uplift is not added to base fair value because revenue, margin, and capex already embed the AI monetization path.",
      severity: "low",
    });
  }

  return {
    dcf,
    fcfYieldFairValue,
    peFairValue,
    evEbitFairValue,
    sotpFairValue,
    blendedFairValue,
    probabilityWeightedFairValue: blendedFairValue * probability,
    valuationRangeLow: Math.min(dcf.fairValuePerShare, fcfYieldFairValue, peFairValue, evEbitFairValue, sotpFairValue),
    valuationRangeHigh: Math.max(dcf.fairValuePerShare, fcfYieldFairValue, peFairValue, evEbitFairValue, sotpFairValue),
    normalizedFcf: normalizedYear.unleveredFreeCashFlow,
    forwardEps: forwardYear.eps,
    forwardEbit: forwardYear.operatingIncome,
    aiExcessReturnValuePerShare,
    aiPaybackYears: terminalYear.aiPaybackYears,
    aiRoic: terminalYear.aiRoic,
    finalWeights,
    sourceIsolationWarnings,
  };
}

export function buildMetaSensitivityTables(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
): Array<{ title: string; table: Array<Array<string | number>> }> {
  const forecast = calculateMetaForecastEngine(data, assumptions);
  const forwardYear = forecast[1] ?? forecast[0];
  const normalizedYear = forecast[2] ?? forecast[forecast.length - 1];

  return [
    {
      title: "WACC x Terminal Growth DCF",
      table: buildSensitivityTable(
        "WACC",
        "Terminal Growth",
        [assumptions.wacc - 0.01, assumptions.wacc - 0.005, assumptions.wacc, assumptions.wacc + 0.005, assumptions.wacc + 0.01],
        [assumptions.terminalGrowth - 0.0075, assumptions.terminalGrowth - 0.0025, assumptions.terminalGrowth, assumptions.terminalGrowth + 0.0025, assumptions.terminalGrowth + 0.0075],
        (wacc, terminalGrowth) => {
          const nextAssumptions = { ...assumptions, wacc, terminalGrowth };
          return calculateMetaValuationEngine(data, "Base", nextAssumptions).dcf.fairValuePerShare;
        },
      ),
    },
    {
      title: "FCF / Share x FCF Yield",
      table: buildSensitivityTable(
        "FCF / Share",
        "FCF Yield",
        [normalizedYear.fcfPerShare * 0.85, normalizedYear.fcfPerShare * 0.93, normalizedYear.fcfPerShare, normalizedYear.fcfPerShare * 1.07, normalizedYear.fcfPerShare * 1.15],
        [assumptions.targetFcfYield - 0.01, assumptions.targetFcfYield - 0.005, assumptions.targetFcfYield, assumptions.targetFcfYield + 0.005, assumptions.targetFcfYield + 0.01],
        (fcfPerShare, fcfYield) => safeRatio(fcfPerShare, Math.max(fcfYield, 0.001)),
      ),
    },
    {
      title: "Forward EPS x P/E",
      table: buildSensitivityTable(
        "Forward EPS",
        "P/E",
        [forwardYear.eps * 0.85, forwardYear.eps * 0.93, forwardYear.eps, forwardYear.eps * 1.07, forwardYear.eps * 1.15],
        [assumptions.targetPe - 4, assumptions.targetPe - 2, assumptions.targetPe, assumptions.targetPe + 2, assumptions.targetPe + 4],
        (eps, pe) => eps * pe,
      ),
    },
    {
      title: "AI ROIC x Payback",
      table: buildSensitivityTable(
        "AI Uplift",
        "AI CapEx Share",
        [Math.max(assumptions.aiRevenueUpliftPct - 0.03, 0), Math.max(assumptions.aiRevenueUpliftPct - 0.015, 0), assumptions.aiRevenueUpliftPct, assumptions.aiRevenueUpliftPct + 0.015, assumptions.aiRevenueUpliftPct + 0.03],
        [Math.max(assumptions.aiCapexShare - 0.15, 0.2), Math.max(assumptions.aiCapexShare - 0.075, 0.2), assumptions.aiCapexShare, Math.min(assumptions.aiCapexShare + 0.075, 0.9), Math.min(assumptions.aiCapexShare + 0.15, 0.9)],
        (aiRevenueUpliftPct, aiCapexShare) => {
          const next = calculateMetaForecastEngine(data, { ...assumptions, aiRevenueUpliftPct, aiCapexShare });
          return next[next.length - 1]?.aiRoic ?? 0;
        },
      ),
    },
  ];
}
