import type { Scenario, ValidationWarning } from "../../types";
import { buildSensitivityTable } from "../../../utils/chartHelpers";
import type {
  MsftDataset,
  MsftDcfOutput,
  MsftValuationAssumptions,
  MsftValuationEngineOutput,
  MsftValuationForecastYear,
} from "../model";
import { msftScenarioPresets } from "../assumptions";
import { clamp, safeRatio } from "./helpers";

function getStartingPoint(data: MsftDataset) {
  return data.periods.find((period) => period.id === "fy26e") ?? data.periods.find((period) => period.id === "fy25") ?? data.periods[0];
}

function segmentBase(data: MsftDataset, segment: string) {
  return data.segments.find((row) => row.periodId === "fy26e" && row.segment === segment)?.revenue ?? 0;
}

function buildForecast(data: MsftDataset, assumptions: MsftValuationAssumptions): MsftValuationForecastYear[] {
  const start = getStartingPoint(data);
  const productivityBase = segmentBase(data, "Productivity and Business Processes");
  const cloudBase = segmentBase(data, "Intelligent Cloud");
  const consumerBase = segmentBase(data, "More Personal Computing");
  const copilotEngineBase = data.aiDisclosures.find((item) => item.id === "copilot-paid-seats-q3-fy26")?.metric ?? 20;
  const eligibleSeats = 160;

  return Array.from({ length: 5 }, (_, index) => {
    const year = start.fiscalYear + index + 1;
    const fade = index / 4;
    const productivityGrowth = assumptions.baseSoftwareGrowth + assumptions.copilotPenetration * 0.018 * (1 - fade * 0.35);
    const cloudGrowth = assumptions.azureGrowth * (1 - fade * 0.48) + 0.08 * fade;
    const consumerGrowth = 0.02 + Math.max(assumptions.baseSoftwareGrowth - 0.08, 0) * 0.15;
    const productivityRevenue = productivityBase * (1 + productivityGrowth) ** (index + 1);
    const intelligentCloudRevenue = cloudBase * (1 + cloudGrowth) ** (index + 1);
    const consumerRevenue = consumerBase * (1 + consumerGrowth) ** (index + 1);
    const targetCopilotSeats = eligibleSeats * assumptions.copilotPenetration;
    const copilotSeats = copilotEngineBase + (targetCopilotSeats - copilotEngineBase) * ((index + 1) / 5);
    const copilotRevenue = Math.max(copilotSeats, 0) * assumptions.copilotArpuAnnual;
    const baseRevenueBeforeOpenAi = productivityRevenue + intelligentCloudRevenue + consumerRevenue;
    const openAiScenarioRevenue = baseRevenueBeforeOpenAi * assumptions.openAiRevenueContribution * (0.65 + index * 0.11);
    const revenue = baseRevenueBeforeOpenAi + openAiScenarioRevenue;
    const marginRamp =
      assumptions.operatingMargin -
      Math.max(assumptions.aiCapexIntensity - assumptions.normalizedCapexIntensity, 0) * 0.20 * (1 - fade) +
      (assumptions.copilotGrossMarginYear5 - 0.60) * 0.035 * fade +
      (assumptions.openAiGrossMargin - 0.30) * assumptions.openAiRevenueContribution;
    const operatingMargin = clamp(marginRamp, 0.34, 0.52);
    const operatingIncome = revenue * operatingMargin;
    const nopat = operatingIncome * (1 - assumptions.taxRate);
    const depreciation = revenue * assumptions.depreciationSalesRatio * (1 + assumptions.aiCapexIntensity * 0.24 * (1 - fade));
    const capexIntensity = assumptions.aiCapexIntensity * (1 - fade) + assumptions.normalizedCapexIntensity * fade;
    const capex = revenue * capexIntensity;
    const previousRevenue =
      index === 0
        ? start.revenue
        : (productivityBase + cloudBase + consumerBase) *
            (1 + assumptions.baseSoftwareGrowth * 0.35 + assumptions.azureGrowth * 0.45 + 0.02 * 0.2) ** index;
    const workingCapitalInvestment = Math.max(revenue - previousRevenue, 0) * assumptions.workingCapitalDragPctRevenueGrowth;
    const unleveredFcf = nopat + depreciation - capex - workingCapitalInvestment;
    return {
      year,
      revenue,
      productivityRevenue,
      intelligentCloudRevenue,
      consumerRevenue,
      copilotRevenue,
      openAiScenarioRevenue,
      operatingIncome,
      nopat,
      depreciation,
      capex,
      workingCapitalInvestment,
      unleveredFcf,
      operatingMargin,
      capexIntensity,
    };
  });
}

function buildDcf(data: MsftDataset, assumptions: MsftValuationAssumptions): MsftDcfOutput {
  if (assumptions.wacc <= assumptions.terminalGrowth) {
    throw new Error("MSFT DCF requires WACC above terminal growth.");
  }
  const forecast = buildForecast(data, assumptions);
  const discountFactors = forecast.map((_, index) => 1 / (1 + assumptions.wacc) ** (index + 1));
  const presentValueCashFlows = forecast.reduce((total, row, index) => total + row.unleveredFcf * discountFactors[index], 0);
  const terminalValue = (forecast[forecast.length - 1].unleveredFcf * (1 + assumptions.terminalGrowth)) /
    (assumptions.wacc - assumptions.terminalGrowth);
  const presentValueTerminalValue = terminalValue * discountFactors[discountFactors.length - 1];
  const enterpriseValue = presentValueCashFlows + presentValueTerminalValue;
  const equityValue = enterpriseValue + assumptions.netCashDebt;
  const fairValuePerShare = equityValue / assumptions.dilutedShares;
  return {
    forecast,
    presentValueCashFlows,
    terminalValue,
    presentValueTerminalValue,
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    terminalValueShareOfEv: safeRatio(presentValueTerminalValue, enterpriseValue),
  };
}

function buildSingleScenario(data: MsftDataset, assumptions: MsftValuationAssumptions) {
  const dcf = buildDcf(data, assumptions);
  const firstYear = dcf.forecast[0];
  const yearThree = dcf.forecast[2] ?? firstYear;
  const normalizedFcf = Math.max(firstYear.unleveredFcf, yearThree.revenue * 0.23);
  const fcfYieldFairValue = normalizedFcf / assumptions.targetFcfYield / assumptions.dilutedShares;
  const forwardEps = (firstYear.operatingIncome * (1 - assumptions.taxRate) + assumptions.netCashDebt * 0.012) / assumptions.dilutedShares;
  const peFairValue = forwardEps * assumptions.targetPe;
  const evEbitFairValue = (firstYear.operatingIncome * assumptions.targetEvEbit + assumptions.netCashDebt) / assumptions.dilutedShares;
  const sotpEnterpriseValue =
    firstYear.productivityRevenue * assumptions.productivitySalesMultiple +
    firstYear.intelligentCloudRevenue * assumptions.azureSalesMultiple +
    firstYear.consumerRevenue * assumptions.windowsSearchGamingSalesMultiple +
    firstYear.openAiScenarioRevenue * 10;
  const sotpFairValue = (sotpEnterpriseValue + assumptions.netCashDebt) / assumptions.dilutedShares;
  const aiOptionalityFairValue = assumptions.aiOptionalityValue / assumptions.dilutedShares;
  const blendedFairValue =
    dcf.fairValuePerShare * assumptions.weightDcf +
    fcfYieldFairValue * assumptions.weightFcfYield +
    peFairValue * assumptions.weightPe +
    evEbitFairValue * assumptions.weightEvEbit +
    sotpFairValue * assumptions.weightSotp +
    (dcf.fairValuePerShare + aiOptionalityFairValue) * assumptions.weightAiOptionality;

  return {
    dcf,
    fcfYieldFairValue,
    peFairValue,
    evEbitFairValue,
    sotpFairValue,
    aiOptionalityFairValue,
    blendedFairValue,
    normalizedFcf,
    forwardEps,
    forwardEbit: firstYear.operatingIncome,
  };
}

export function calculateMsftValuationEngine(
  data: MsftDataset,
  scenario: Scenario,
  assumptions: MsftValuationAssumptions,
): MsftValuationEngineOutput {
  const selected = buildSingleScenario(data, assumptions);
  const finalWeights = {
    dcf: assumptions.weightDcf,
    fcfYield: assumptions.weightFcfYield,
    pe: assumptions.weightPe,
    evEbit: assumptions.weightEvEbit,
    sotp: assumptions.weightSotp,
    aiOptionality: assumptions.weightAiOptionality,
  };
  const scenarioValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const scenarioAssumptions = {
      ...msftScenarioPresets[caseName],
      currentPrice: assumptions.currentPrice,
      netCashDebt: assumptions.netCashDebt,
      dilutedShares: assumptions.dilutedShares,
    };
    return {
      scenario: caseName,
      probability: data.scenarios.find((item) => item.scenario === caseName)?.probability ?? (caseName === "Base" ? 0.5 : 0.25),
      value: buildSingleScenario(data, scenarioAssumptions).blendedFairValue,
    };
  });
  const probabilityTotal = scenarioValues.reduce((total, item) => total + item.probability, 0);
  const probabilityWeightedFairValue =
    scenarioValues.reduce((total, item) => total + item.value * item.probability, 0) / Math.max(probabilityTotal, 0.01);
  const warnings: ValidationWarning[] = [];
  const weightSum = Object.values(finalWeights).reduce((total, value) => total + value, 0);
  if (Math.abs(weightSum - 1) > 0.0001) {
    warnings.push({
      id: "msft-valuation-weight-sum",
      title: "Valuation weights do not sum to 100%",
      detail: `Weights sum to ${(weightSum * 100).toFixed(1)}%.`,
      severity: "high",
    });
  }
  if (selected.dcf.terminalValueShareOfEv > 0.76) {
    warnings.push({
      id: "msft-terminal-value-heavy",
      title: "DCF terminal value is high",
      detail: `Terminal value is ${(selected.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of enterprise value. WACC and terminal growth dominate the DCF.`,
      severity: "medium",
    });
  }
  if (assumptions.aiCapexIntensity > 0.28) {
    warnings.push({
      id: "msft-ai-capex-high",
      title: "AI capex intensity remains high",
      detail: `Near-term AI capex intensity is ${(assumptions.aiCapexIntensity * 100).toFixed(1)}%; FCF conversion remains sensitive to capacity timing.`,
      severity: "medium",
    });
  }
  if (assumptions.openAiRevenueContribution > 0 && assumptions.openAiGrossMargin < 0.25) {
    warnings.push({
      id: "msft-openai-margin-drag",
      title: "OpenAI scenario is margin dilutive",
      detail: "OpenAI contribution is positive but assumed gross margin is low, so the scenario can dilute core platform economics.",
      severity: "medium",
    });
  }

  return {
    ...selected,
    probabilityWeightedFairValue,
    valuationRangeLow: Math.min(...scenarioValues.map((item) => item.value)),
    valuationRangeHigh: Math.max(...scenarioValues.map((item) => item.value)),
    finalWeights,
    scenarioValues,
    warnings,
  };
}

export function buildMsftSensitivityTables(data: MsftDataset, assumptions: MsftValuationAssumptions) {
  return [
    {
      title: "DCF sensitivity: WACC vs terminal growth",
      table: buildSensitivityTable(
        "WACC",
        "Terminal growth",
        [assumptions.wacc - 0.01, assumptions.wacc, assumptions.wacc + 0.01],
        [assumptions.terminalGrowth - 0.005, assumptions.terminalGrowth, assumptions.terminalGrowth + 0.005],
        (wacc, terminalGrowth) =>
          buildSingleScenario(data, {
            ...assumptions,
            wacc,
            terminalGrowth: Math.min(terminalGrowth, wacc - 0.005),
          }).dcf.fairValuePerShare,
      ),
    },
    {
      title: "AI sensitivity: Azure growth vs Copilot penetration",
      table: buildSensitivityTable(
        "Azure growth",
        "Copilot penetration",
        [assumptions.azureGrowth - 0.05, assumptions.azureGrowth, assumptions.azureGrowth + 0.05],
        [assumptions.copilotPenetration - 0.10, assumptions.copilotPenetration, assumptions.copilotPenetration + 0.10],
        (azureGrowth, copilotPenetration) =>
          buildSingleScenario(data, {
            ...assumptions,
            azureGrowth: clamp(azureGrowth, 0.1, 0.5),
            copilotPenetration: clamp(copilotPenetration, 0.05, 0.7),
          }).blendedFairValue,
      ),
    },
    {
      title: "FCF sensitivity: AI capex intensity vs operating margin",
      table: buildSensitivityTable(
        "AI capex intensity",
        "Operating margin",
        [assumptions.aiCapexIntensity - 0.04, assumptions.aiCapexIntensity, assumptions.aiCapexIntensity + 0.04],
        [assumptions.operatingMargin - 0.02, assumptions.operatingMargin, assumptions.operatingMargin + 0.02],
        (aiCapexIntensity, operatingMargin) =>
          buildSingleScenario(data, {
            ...assumptions,
            aiCapexIntensity: clamp(aiCapexIntensity, 0.1, 0.38),
            operatingMargin: clamp(operatingMargin, 0.34, 0.54),
          }).blendedFairValue,
      ),
    },
  ];
}
