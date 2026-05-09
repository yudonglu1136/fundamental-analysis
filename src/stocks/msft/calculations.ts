import type { DashboardInterpretation, DataStatus, Scenario, Signal, SummaryMetric, ValuationResult } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { clamp, safeDivide } from "../../utils/financialMath";
import { checkExtremeGrowthRates, checkMissingFields, checkValuationReliability } from "../../utils/validation";
import { defaultMsftAssumptions, type MsftAssumptions } from "./assumptions";
import type { MsftData, MsftPeriodRow } from "./data";
import { msftData } from "./data";
import { msftRealData } from "./realData";
import { buildAiRevenueModel } from "./AIRevenueModel";
import { buildAiCostModel } from "./AICostModel";
import { buildAiRoicModel } from "./AIROICModel";
import { buildCloudMarginModel } from "./CloudMarginModel";
import { buildFcfOffsetModel } from "./FCFOffsetModel";
import { detectAiPhase } from "./AIPhaseDetector";
import { buildMsftValuationEngine, type MsftValuationEngineResult } from "./MSFTValuationEngine";

export type MsftEvaluatedRow = MsftPeriodRow & {
  aiGrossMarginEstimate: number;
  copilotGrossMarginEstimate: number;
  aiGrossProfit: number;
  aiOperatingProfit: number;
  aiRoicEstimate: number;
  fcfMarginAdjusted: number;
  aiAdjustedFcf: number;
  aiRevenueToCapex: number;
  paybackPeriod: number;
  marginStabilizationProbability: number;
};

export type MsftDashboardData = {
  dataStatus: DataStatus;
  statusBanner: { title: string; detail: string; signal: Signal };
  summary: SummaryMetric[];
  interpretations: Array<{ title: string; signal: Signal; detail: string }>;
  selectedRow: MsftEvaluatedRow;
  rows: MsftEvaluatedRow[];
  aiRevenueMix: Array<{ name: string; value: number }>;
  marginBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  capexCohorts: Array<{ fiscalYear: string; aiCapex: number; depreciation: number; aiRevenue: number; aiGrossProfit: number; aiOperatingProfit: number; aiRoic: number; paybackPeriod: number }>;
  fcfOffsetRows: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  paybackSignal: Signal;
  paybackDetail: string;
  valuation: ValuationResult;
  scenarioLab: {
    anchors: typeof msftRealData.anchors;
    aiRevenue: ReturnType<typeof buildAiRevenueModel>;
    aiCost: ReturnType<typeof buildAiCostModel>;
    aiRoic: ReturnType<typeof buildAiRoicModel>;
    cloudMargin: ReturnType<typeof buildCloudMarginModel>;
    fcfOffset: ReturnType<typeof buildFcfOffsetModel>;
    phase: ReturnType<typeof detectAiPhase>;
    valuation: MsftValuationEngineResult;
  };
};

function delta<K extends keyof MsftAssumptions>(key: K, assumptions: MsftAssumptions) {
  return assumptions[key] - defaultMsftAssumptions[key];
}

function evaluateCurrentRow(row: MsftPeriodRow, assumptions: MsftAssumptions): MsftEvaluatedRow {
  const aiRunRate = row.aiAnnualRunRate * (1 + delta("aiRevenueGrowth", assumptions) * 0.22 + delta("aiUtilizationRate", assumptions) * 0.45 + delta("aiMonetizationEfficiency", assumptions) * 0.35);
  const aiCapex = row.aiCapex * (1 + delta("aiCapexGrowth", assumptions) * 0.9 + delta("powerCoolingCostPct", assumptions) * 0.55 + delta("networkingCostPct", assumptions) * 0.45 - delta("aiUtilizationRate", assumptions) * 0.25);
  const aiDepreciation = row.aiDepreciation * (1 + delta("aiDepreciationGrowth", assumptions) * 0.8 + delta("aiCapexGrowth", assumptions) * 0.35);
  const cloudGrossMargin = clamp(row.cloudGrossMargin - delta("aiInfrastructureCostLoad", assumptions) - delta("aiProductUsageCost", assumptions) + delta("azureEfficiencyGains", assumptions) + delta("m365EfficiencyGains", assumptions), 0.6, 0.72);
  const azureGrossMargin = clamp(row.azureGrossMargin - delta("aiInfrastructureCostLoad", assumptions) * 0.8 + delta("azureEfficiencyGains", assumptions) * 0.8, 0.62, 0.78);
  const azureGrowth = clamp(row.azureGrowth + delta("aiRevenueGrowth", assumptions) * 0.06 + delta("aiUtilizationRate", assumptions) * 0.18 + delta("aiMixShift", assumptions) * 0.1, 0.15, 0.62);
  const aiContributionToAzureGrowth = clamp(row.aiContributionToAzureGrowth + delta("aiMixShift", assumptions) * 0.22 + delta("aiMonetizationEfficiency", assumptions) * 0.08, 0.04, 0.32);
  const copilotSeats = row.copilotSeats * (1 + delta("copilotSeatGrowth", assumptions) * 0.8 + delta("copilotAdoption", assumptions) * 0.9);
  const copilotRevenue = row.copilotRevenue * (1 + safeDivide(delta("copilotArpu", assumptions), defaultMsftAssumptions.copilotArpu) * 0.75 + delta("copilotSeatGrowth", assumptions) * 0.5);
  const githubCopilotRevenue = row.githubCopilotRevenue * (1 + delta("copilotSeatGrowth", assumptions) * 0.35);
  const copilotStudioRevenue = row.copilotStudioRevenue * (1 + delta("copilotStudioUsageGrowth", assumptions) * 0.65 + delta("agentPlatformGrowth", assumptions) * 0.2);
  const aiAgentRevenue = row.aiAgentRevenue * (1 + delta("agentPlatformGrowth", assumptions) * 0.75 + delta("copilotStudioUsageGrowth", assumptions) * 0.2);
  const aiGrossMarginEstimate = clamp(row.aiGrossMarginBase + delta("aiUtilizationRate", assumptions) * 0.18 + delta("aiMonetizationEfficiency", assumptions) * 0.16 - delta("aiInfrastructureCostLoad", assumptions) * 0.7, 0.2, 0.45);
  const copilotGrossMarginEstimate = clamp(row.copilotGrossMarginBase + safeDivide(delta("copilotArpu", assumptions), defaultMsftAssumptions.copilotArpu) * 0.12 + delta("aiMonetizationEfficiency", assumptions) * 0.14, 0.55, 0.82);
  const powerCoolingCost = row.powerCoolingCost * (1 + delta("powerCoolingCostPct", assumptions) * 1.5);
  const networkingCost = row.networkingCost * (1 + delta("networkingCostPct", assumptions) * 1.5);
  const aiGrossProfit = aiRunRate * aiGrossMarginEstimate;
  const aiOperatingProfit = aiGrossProfit - aiDepreciation - powerCoolingCost - networkingCost;
  const aiInvestedCapital = row.aiInvestedCapital * (1 + delta("aiCapexGrowth", assumptions) * 0.65);
  const aiRoicEstimate = clamp(safeDivide(aiOperatingProfit, aiInvestedCapital), -0.05, 0.2);
  const fcfMarginAdjusted = clamp(row.fcf / row.totalRevenue + delta("fcfMargin", assumptions) * 0.85 - delta("aiCapexGrowth", assumptions) * 0.1 + delta("aiRoic", assumptions) * 0.35, 0.2, 0.42);
  const fcf = row.totalRevenue * fcfMarginAdjusted;
  const aiAdjustedFcf = fcf - aiCapex + aiOperatingProfit;
  const marginStabilizationProbability = clamp(0.42 + aiRoicEstimate * 1.8 + assumptions.azureEfficiencyGains * 3 + assumptions.m365EfficiencyGains * 2.5 - assumptions.aiInfrastructureCostLoad * 4.2, 0.1, 0.9);

  return {
    ...row,
    aiAnnualRunRate: aiRunRate,
    aiCapex,
    aiDepreciation,
    cloudGrossMargin,
    azureGrossMargin,
    azureGrowth,
    aiContributionToAzureGrowth,
    copilotSeats,
    copilotRevenue,
    githubCopilotRevenue,
    copilotStudioRevenue,
    aiAgentRevenue,
    powerCoolingCost,
    networkingCost,
    aiInvestedCapital,
    aiGrossMarginEstimate,
    copilotGrossMarginEstimate,
    aiGrossProfit,
    aiOperatingProfit,
    aiRoicEstimate,
    fcfMarginAdjusted,
    fcf,
    aiAdjustedFcf,
    aiRevenueToCapex: safeDivide(aiRunRate, aiCapex),
    paybackPeriod: aiOperatingProfit > 0 ? aiCapex / aiOperatingProfit : 99,
    marginStabilizationProbability,
  };
}

function projectForecastRow(previous: MsftEvaluatedRow, base: MsftPeriodRow, assumptions: MsftAssumptions, yearOffset: number): MsftEvaluatedRow {
  const revenueGrowth = clamp(base.cloudRevenueGrowth + assumptions.aiMixShift * 0.08 + assumptions.aiRevenueCagr * 0.05 - yearOffset * 0.01, 0.1, 0.24);
  const cloudRevenue = previous.cloudRevenue * (1 + revenueGrowth);
  const totalRevenue = previous.totalRevenue * (1 + clamp(0.08 + assumptions.aiRevenueCagr * 0.1 + assumptions.copilotAdoption * 0.08 - yearOffset * 0.005, 0.06, 0.16));
  const azureGrowth = clamp(previous.azureGrowth - 0.02 + assumptions.aiRevenueGrowth * 0.06 + assumptions.aiUtilizationRate * 0.04, 0.18, 0.58);
  const aiContributionToAzureGrowth = clamp(previous.aiContributionToAzureGrowth + assumptions.aiMixShift * 0.03 + assumptions.agentPlatformGrowth * 0.015 - yearOffset * 0.004, 0.08, 0.3);
  const aiAnnualRevenueGrowth = clamp(previous.aiAnnualRevenueGrowth * (0.72 + assumptions.aiMonetizationEfficiency * 0.18), 0.25, 1.2);
  const aiAnnualRunRate = previous.aiAnnualRunRate * (1 + assumptions.aiRevenueGrowth * 0.22 + assumptions.copilotSeatGrowth * 0.08 + assumptions.agentPlatformGrowth * 0.05 - yearOffset * 0.03);
  const aiCapex = previous.aiCapex * (1 + assumptions.aiCapexGrowth * 0.42 + assumptions.powerCoolingCostPct * 0.08 - assumptions.aiUtilizationRate * 0.05 - yearOffset * 0.02);
  const aiDepreciation = previous.aiDepreciation * (1 + assumptions.aiDepreciationGrowth * 0.5 + assumptions.aiCapexGrowth * 0.15 - yearOffset * 0.01);
  const cloudGrossMargin = clamp(previous.cloudGrossMargin - assumptions.aiInfrastructureCostLoad * 0.06 - assumptions.aiProductUsageCost * 0.04 + assumptions.azureEfficiencyGains * 0.18 + assumptions.m365EfficiencyGains * 0.15 + yearOffset * 0.004, 0.62, 0.72);
  const azureGrossMargin = clamp(previous.azureGrossMargin - assumptions.aiInfrastructureCostLoad * 0.04 + assumptions.azureEfficiencyGains * 0.2 + yearOffset * 0.003, 0.63, 0.77);
  const aiGrossMarginEstimate = clamp(previous.aiGrossMarginEstimate + assumptions.aiUtilizationRate * 0.03 + assumptions.aiMonetizationEfficiency * 0.02 - assumptions.aiInfrastructureCostLoad * 0.04, 0.22, 0.48);
  const copilotGrossMarginEstimate = clamp(previous.copilotGrossMarginEstimate + assumptions.aiMonetizationEfficiency * 0.025 + assumptions.copilotAdoption * 0.04 - yearOffset * 0.002, 0.6, 0.84);
  const copilotSeats = previous.copilotSeats * (1 + assumptions.copilotSeatGrowth * 0.45 + assumptions.copilotAdoption * 0.18 - yearOffset * 0.03);
  const copilotRevenue = previous.copilotRevenue * (1 + assumptions.copilotSeatGrowth * 0.38 + safeDivide(assumptions.copilotArpu, defaultMsftAssumptions.copilotArpu) * 0.08);
  const githubCopilotRevenue = previous.githubCopilotRevenue * (1 + assumptions.copilotSeatGrowth * 0.22);
  const copilotStudioRevenue = previous.copilotStudioRevenue * (1 + assumptions.copilotStudioUsageGrowth * 0.35 + assumptions.agentPlatformGrowth * 0.12);
  const aiAgentRevenue = previous.aiAgentRevenue * (1 + assumptions.agentPlatformGrowth * 0.4);
  const powerCoolingCost = aiCapex * assumptions.powerCoolingCostPct * 0.11;
  const networkingCost = aiCapex * assumptions.networkingCostPct * 0.1;
  const aiGrossProfit = aiAnnualRunRate * aiGrossMarginEstimate;
  const aiOperatingProfit = aiGrossProfit - aiDepreciation - powerCoolingCost - networkingCost;
  const aiInvestedCapital = previous.aiInvestedCapital + aiCapex * 0.75;
  const aiRoicEstimate = clamp(safeDivide(aiOperatingProfit, aiInvestedCapital), -0.03, 0.24);
  const fcfMarginAdjusted = clamp(previous.fcfMarginAdjusted + assumptions.aiRoic * 0.05 - assumptions.aiCapexGrowth * 0.02 + yearOffset * 0.004, 0.22, 0.4);
  const fcf = totalRevenue * fcfMarginAdjusted;
  const operatingCashFlow = totalRevenue * clamp(fcfMarginAdjusted + 0.16, 0.34, 0.56);
  const marginStabilizationProbability = clamp(previous.marginStabilizationProbability + 0.08 + assumptions.azureEfficiencyGains * 1.5 - assumptions.aiInfrastructureCostLoad * 0.8, 0.2, 0.95);

  return {
    ...base,
    totalRevenue,
    cloudRevenue,
    cloudRevenueGrowth: revenueGrowth,
    azureGrowth,
    aiContributionToAzureGrowth,
    cloudGrossMargin,
    azureGrossMargin,
    aiAnnualRevenueGrowth,
    aiAnnualRunRate,
    aiCapex,
    aiDepreciation,
    aiInvestedCapital,
    aiGrossMarginBase: aiGrossMarginEstimate,
    copilotGrossMarginBase: copilotGrossMarginEstimate,
    copilotSeats,
    copilotRevenue,
    githubCopilotRevenue,
    copilotStudioRevenue,
    aiAgentRevenue,
    powerCoolingCost,
    networkingCost,
    operatingCashFlow,
    fcf,
    blendedRoic: clamp(previous.blendedRoic + aiRoicEstimate * 0.05, 0.22, 0.32),
    aiGrossMarginEstimate,
    copilotGrossMarginEstimate,
    aiGrossProfit,
    aiOperatingProfit,
    aiRoicEstimate,
    fcfMarginAdjusted,
    aiAdjustedFcf: fcf - aiCapex + aiOperatingProfit,
    aiRevenueToCapex: safeDivide(aiAnnualRunRate, aiCapex),
    paybackPeriod: aiOperatingProfit > 0 ? aiCapex / aiOperatingProfit : 99,
    marginStabilizationProbability,
  };
}

export function evaluateMsftRows(data: MsftData, assumptions: MsftAssumptions) {
  const currentIndex = data.rows.findIndex((row) => row.periodId === data.currentPeriodId);
  return data.rows.reduce<MsftEvaluatedRow[]>((acc, row, index) => {
    if (index < currentIndex) {
      acc.push({
        ...row,
        aiGrossMarginEstimate: row.aiGrossMarginBase,
        copilotGrossMarginEstimate: row.copilotGrossMarginBase,
        aiGrossProfit: row.aiAnnualRunRate * row.aiGrossMarginBase,
        aiOperatingProfit: row.aiAnnualRunRate * row.aiGrossMarginBase - row.aiDepreciation - row.powerCoolingCost - row.networkingCost,
        aiRoicEstimate: safeDivide(row.aiAnnualRunRate * row.aiGrossMarginBase - row.aiDepreciation - row.powerCoolingCost - row.networkingCost, row.aiInvestedCapital),
        fcfMarginAdjusted: safeDivide(row.fcf, row.totalRevenue),
        aiAdjustedFcf: row.fcf - row.aiCapex + (row.aiAnnualRunRate * row.aiGrossMarginBase - row.aiDepreciation - row.powerCoolingCost - row.networkingCost),
        aiRevenueToCapex: safeDivide(row.aiAnnualRunRate, row.aiCapex),
        paybackPeriod: safeDivide(row.aiCapex, Math.max(row.aiAnnualRunRate * row.aiGrossMarginBase - row.aiDepreciation - row.powerCoolingCost - row.networkingCost, 0.1)),
        marginStabilizationProbability: 0.35,
      });
      return acc;
    }
    if (index === currentIndex) {
      acc.push(evaluateCurrentRow(row, assumptions));
      return acc;
    }
    const previous = acc[acc.length - 1];
    acc.push(projectForecastRow(previous, row, assumptions, index - currentIndex));
    return acc;
  }, []);
}

function getStatusBanner(selected: MsftEvaluatedRow, previous: MsftEvaluatedRow | undefined, assumptions: MsftAssumptions, dividendYield: number) {
  const aiRevenueOutgrowingCapex = selected.aiAnnualRevenueGrowth > assumptions.aiCapexGrowth;
  const depreciationContained = selected.aiGrossProfit > selected.aiDepreciation * 1.2;
  const marginNarrowing = previous ? previous.cloudGrossMargin - selected.cloudGrossMargin < 0.015 : false;
  const fcfStable = selected.fcfMarginAdjusted >= 0.29;
  const copilotMaterial = selected.copilotRevenue >= 2.5 && selected.copilotSeats >= 20;
  const roicSpread = assumptions.aiRoic - selected.wacc;

  if (aiRevenueOutgrowingCapex && depreciationContained && roicSpread > 0.01) {
    return {
      title: "AI ROIC expansion phase",
      detail: "AI revenue is scaling faster than depreciation, Copilot monetization is becoming material, and incremental AI returns are moving above the cost of capital.",
      signal: "Positive" as const,
    };
  }
  if (aiRevenueOutgrowingCapex && marginNarrowing && fcfStable) {
    return {
      title: "AI payback inflecting",
      detail: "CapEx is still heavy, but AI revenue growth is outpacing infrastructure growth, cloud margin pressure is narrowing, and free cash flow is stabilizing.",
      signal: "Inflecting" as const,
    };
  }
  if (copilotMaterial || dividendYield + selected.aiRevenueToCapex > 1) {
    return {
      title: "AI monetization scaling",
      detail: "Microsoft is progressing beyond infrastructure supply and is building a broader AI software and agent revenue stack.",
      signal: "Positive" as const,
    };
  }
  if (selected.cloudGrossMargin < 0.65 && selected.aiRevenueToCapex < 0.45) {
    return {
      title: "AI investment phase",
      detail: "Infrastructure spending remains ahead of monetization, margins are still under pressure, and the FCF offset from AI operating profit is not yet complete.",
      signal: "Negative" as const,
    };
  }
  return {
    title: "AI investment phase",
    detail: "The platform is still digesting elevated CapEx, but Azure AI demand, Copilot adoption, and enterprise backlog suggest the path to payback remains intact.",
    signal: "Neutral" as const,
  };
}

function buildAiRevenueMix(selected: MsftEvaluatedRow, assumptions: MsftAssumptions) {
  const softwareTilt = clamp(assumptions.aiMixShift, 0.12, 0.6);
  const copilot = selected.aiAnnualRunRate * (0.19 + softwareTilt * 0.1);
  const github = selected.aiAnnualRunRate * 0.08;
  const studio = selected.aiAnnualRunRate * (0.045 + assumptions.copilotAdoption * 0.08);
  const agents = selected.aiAnnualRunRate * (0.03 + assumptions.agentPlatformGrowth * 0.03);
  const openAi = selected.aiAnnualRunRate * 0.15;
  const azureCompute = Math.max(selected.aiAnnualRunRate - copilot - github - studio - agents - openAi, selected.aiAnnualRunRate * 0.28);
  return [
    { name: "Azure AI compute", value: azureCompute },
    { name: "OpenAI services", value: openAi },
    { name: "Copilot", value: copilot },
    { name: "GitHub Copilot", value: github },
    { name: "Copilot Studio", value: studio },
    { name: "AI agent usage", value: agents },
  ];
}

function buildMarginBridge(selected: MsftEvaluatedRow, previous: MsftEvaluatedRow | undefined, assumptions: MsftAssumptions) {
  const priorMargin = previous?.cloudGrossMargin ?? selected.cloudGrossMargin + 0.02;
  return [
    { label: "Prior cloud margin", value: priorMargin, type: "base" as const },
    { label: "AI infrastructure cost", value: -assumptions.aiInfrastructureCostLoad, type: "negative" as const },
    { label: "AI product usage cost", value: -assumptions.aiProductUsageCost, type: "negative" as const },
    { label: "Azure efficiency gains", value: assumptions.azureEfficiencyGains, type: "positive" as const },
    { label: "M365 efficiency gains", value: assumptions.m365EfficiencyGains, type: "positive" as const },
    { label: "Current cloud margin", value: selected.cloudGrossMargin, type: "total" as const },
  ];
}

function buildCapexCohorts(rows: MsftEvaluatedRow[]) {
  return rows.map((row) => ({
    fiscalYear: row.periodId,
    aiCapex: row.aiCapex,
    depreciation: row.aiDepreciation,
    aiRevenue: row.aiAnnualRunRate,
    aiGrossProfit: row.aiGrossProfit,
    aiOperatingProfit: row.aiOperatingProfit,
    aiRoic: row.aiRoicEstimate,
    paybackPeriod: row.paybackPeriod,
  }));
}

function buildFcfOffsetRows(selected: MsftEvaluatedRow) {
  const coreFcf = selected.fcf + selected.aiCapex - selected.aiOperatingProfit;
  return [
    { label: "Core FCF", value: coreFcf, type: "base" as const },
    { label: "Incremental AI CapEx", value: -selected.aiCapex, type: "negative" as const },
    { label: "Incremental AI op profit", value: selected.aiOperatingProfit, type: selected.aiOperatingProfit >= 0 ? "positive" as const : "negative" as const },
    { label: "AI-adjusted FCF", value: selected.aiAdjustedFcf, type: "total" as const },
  ];
}

function getPaybackSignal(selected: MsftEvaluatedRow, previous: MsftEvaluatedRow | undefined, assumptions: MsftAssumptions) {
  const aiRevenueOutpacesCapex = selected.aiAnnualRevenueGrowth > assumptions.aiCapexGrowth;
  const grossProfitOutpacesDepreciation = selected.aiGrossProfit > selected.aiDepreciation * 1.15;
  const marginDeclineNarrows = previous ? previous.cloudGrossMargin - selected.cloudGrossMargin < 0.015 : false;
  const previousFcfMargin = previous ? previous.fcfMarginAdjusted : 0.29;
  const fcfStable = selected.fcfMarginAdjusted >= previousFcfMargin;
  if (aiRevenueOutpacesCapex && grossProfitOutpacesDepreciation && marginDeclineNarrows && fcfStable) {
    return {
      signal: "Inflecting" as const,
      detail: "AI payback looks to be inflecting: revenue is scaling ahead of CapEx, gross profit is outrunning depreciation, and cash conversion is stabilizing.",
    };
  }
  if (selected.aiOperatingProfit > 0 && selected.paybackPeriod < 5) {
    return {
      signal: "Positive" as const,
      detail: "AI infrastructure is still investment-heavy, but the implied payback window is now inside a reasonable platform build-out range.",
    };
  }
  return {
    signal: "Negative" as const,
    detail: "AI remains FCF dilutive for now: CapEx intensity is elevated, depreciation is still catching up, and payback is not yet fully visible.",
  };
}

export function calculateMsftValuation(data: MsftData, assumptions?: Partial<MsftAssumptions>): ValuationResult {
  const merged = { ...defaultMsftAssumptions, ...(assumptions ?? {}) };
  const revenueModel = buildAiRevenueModel(merged, msftRealData);
  const costModel = buildAiCostModel(merged, msftRealData, revenueModel);
  const roicModel = buildAiRoicModel(merged, msftRealData, revenueModel, costModel);
  const cloudModel = buildCloudMarginModel(merged, msftRealData, revenueModel, costModel, roicModel);
  const fcfModel = buildFcfOffsetModel(merged, msftRealData, costModel, roicModel, cloudModel);
  const phase = detectAiPhase(merged, revenueModel, roicModel, cloudModel, fcfModel);
  return buildMsftValuationEngine(merged, msftRealData, revenueModel, costModel, roicModel, cloudModel, fcfModel, phase);
}

export function buildMsftDashboardData(data: MsftData, assumptions: MsftAssumptions, periodId: string, scenario: Scenario): MsftDashboardData {
  const rows = evaluateMsftRows(data, assumptions);
  const selected = rows.find((row) => row.periodId === periodId) ?? rows.find((row) => row.periodId === data.currentPeriodId) ?? rows[0];
  const selectedIndex = rows.findIndex((row) => row.periodId === selected.periodId);
  const previous = selectedIndex > 0 ? rows[selectedIndex - 1] : undefined;
  const statusBanner = getStatusBanner(selected, previous, assumptions, data.dividendYield);
  const payback = getPaybackSignal(selected, previous, assumptions);
  const aiRevenueMix = buildAiRevenueMix(selected, assumptions);
  const marginBridge = buildMarginBridge(selected, previous, assumptions);
  const fcfOffsetRows = buildFcfOffsetRows(selected);
  const capexCohorts = buildCapexCohorts(rows);
  const scenarioRevenue = buildAiRevenueModel(assumptions, msftRealData);
  const scenarioCost = buildAiCostModel(assumptions, msftRealData, scenarioRevenue);
  const scenarioRoic = buildAiRoicModel(assumptions, msftRealData, scenarioRevenue, scenarioCost);
  const scenarioCloud = buildCloudMarginModel(assumptions, msftRealData, scenarioRevenue, scenarioCost, scenarioRoic);
  const scenarioFcf = buildFcfOffsetModel(assumptions, msftRealData, scenarioCost, scenarioRoic, scenarioCloud);
  const phase = detectAiPhase(assumptions, scenarioRevenue, scenarioRoic, scenarioCloud, scenarioFcf);
  const scenarioValuation = buildMsftValuationEngine(assumptions, msftRealData, scenarioRevenue, scenarioCost, scenarioRoic, scenarioCloud, scenarioFcf, phase);

  const missingFields = checkMissingFields([
    { key: "currentPrice", value: assumptions.currentPrice },
    { key: "forwardEps", value: assumptions.forwardEps },
    { key: "aiRoic", value: assumptions.aiRoic },
  ]);
  const validationWarnings = [
    ...checkExtremeGrowthRates(
      [
        { label: "AI revenue growth", value: assumptions.aiRevenueGrowth },
        { label: "AI CapEx growth", value: assumptions.aiCapexGrowth },
        { label: "Copilot seat growth", value: assumptions.copilotSeatGrowth },
      ],
      1,
    ),
    ...checkValuationReliability(assumptions.aiRoic < assumptions.wacc || missingFields.length > 0),
  ];

  const dataStatus: DataStatus = {
    sourceType: "mock",
    lastUpdated: "2026-05-09",
    missingFields,
    validationWarnings,
    valuationReliable: !validationWarnings.some((warning) => warning.id === "valuation-reliability"),
  };

  const summary: SummaryMetric[] = [
    { key: "cloud-revenue", label: "Microsoft Cloud Revenue ($B)", value: selected.cloudRevenue, delta: previous ? selected.cloudRevenue - previous.cloudRevenue : undefined, format: "number", description: "Measures Microsoft’s cloud scale and the revenue base funding AI investment.", badge: "Actual" },
    { key: "azure-growth", label: "Azure Growth", value: selected.azureGrowth, delta: previous ? selected.azureGrowth - previous.azureGrowth : undefined, format: "percent", description: "Tracks the pace of Azure demand including AI workload acceleration.", badge: "Actual" },
    { key: "ai-contrib", label: "AI Contribution to Azure Growth", value: selected.aiContributionToAzureGrowth, delta: previous ? selected.aiContributionToAzureGrowth - previous.aiContributionToAzureGrowth : undefined, format: "percent", description: "Shows how much of Azure growth is coming from AI rather than traditional workloads.", badge: "Derived" },
    { key: "cloud-margin", label: "Cloud Gross Margin", value: selected.cloudGrossMargin, delta: previous ? selected.cloudGrossMargin - previous.cloudGrossMargin : undefined, format: "percent", description: "The clearest snapshot of whether AI is diluting or stabilizing cloud economics.", badge: "Actual" },
    { key: "ai-run-rate", label: "AI Revenue Run-Rate ($B)", value: selected.aiAnnualRunRate, delta: previous ? selected.aiAnnualRunRate - previous.aiAnnualRunRate : undefined, format: "number", description: "Annualized AI revenue across Azure AI, OpenAI services, Copilot, GitHub Copilot, and agent workloads.", badge: "Derived" },
    { key: "ai-capex", label: "AI CapEx ($B)", value: selected.aiCapex, delta: previous ? selected.aiCapex - previous.aiCapex : undefined, format: "number", description: "Capital intensity of the AI infrastructure build-out.", badge: "Actual" },
    { key: "capex-revenue", label: "CapEx / Revenue", value: safeDivide(selected.totalCapex, selected.totalRevenue), delta: previous ? safeDivide(selected.totalCapex, selected.totalRevenue) - safeDivide(previous.totalCapex, previous.totalRevenue) : undefined, format: "percent", description: "High CapEx intensity is acceptable only if monetization and ROIC inflect in time.", badge: "Derived" },
    { key: "fcf-margin", label: "FCF Margin", value: selected.fcfMarginAdjusted, delta: previous ? selected.fcfMarginAdjusted - previous.fcfMarginAdjusted : undefined, format: "percent", description: "Shows whether AI investment is being absorbed without structurally impairing cash conversion.", badge: "Derived" },
    { key: "copilot-seats", label: "Copilot Paid Seats (M)", value: selected.copilotSeats, delta: previous ? selected.copilotSeats - previous.copilotSeats : undefined, format: "number", description: "Paid Copilot seats show whether Microsoft is monetizing AI as software, not just cloud capacity.", badge: "Actual" },
    { key: "rpo", label: "Commercial RPO ($B)", value: selected.commercialRpo, delta: previous ? selected.commercialRpo - previous.commercialRpo : undefined, format: "number", description: "Large backlog supports visibility into future Microsoft Cloud and Copilot monetization.", badge: "Actual" },
    { key: "ai-roic", label: "AI ROIC Estimate", value: selected.aiRoicEstimate, delta: previous ? selected.aiRoicEstimate - previous.aiRoicEstimate : undefined, format: "percent", description: "Incremental return on AI invested capital relative to Microsoft’s cost of capital.", badge: "Derived" },
    { key: "payback", label: "AI Payback (Years)", value: selected.paybackPeriod, delta: previous ? selected.paybackPeriod - previous.paybackPeriod : undefined, format: "number", description: "Estimated payback period for AI infrastructure based on AI operating profit generation.", badge: "Derived" },
  ];

  const interpretations: Array<{ title: string; signal: Signal; detail: string }> = [
    {
      title: "Azure AI growth quality",
      signal: selected.azureGrowth >= 0.35 && selected.aiContributionToAzureGrowth >= 0.15 ? "Positive" : selected.azureGrowth >= 0.3 ? "Inflecting" : "Negative",
      detail: selected.azureGrowth >= 0.35 ? "Azure growth remains strong and a larger portion is coming from AI workloads rather than legacy migration demand." : "Azure growth is holding up, but the mix between AI and traditional demand still needs monitoring.",
    },
    {
      title: "Cloud margin health",
      signal: selected.cloudGrossMargin >= 0.66 ? "Neutral" : selected.cloudGrossMargin >= 0.645 ? "Inflecting" : "Negative",
      detail: selected.cloudGrossMargin >= 0.66 ? "AI remains dilutive, but the cloud margin base is still resilient enough to absorb the build-out." : "AI margin drag is still evident, and the key test is whether margin erosion narrows as utilization improves.",
    },
    {
      title: "AI CapEx payback",
      signal: payback.signal,
      detail: payback.detail,
    },
    {
      title: "Copilot monetization",
      signal: selected.copilotRevenue >= 2.5 && selected.copilotSeats >= 20 ? "Positive" : selected.copilotSeats >= 15 ? "Inflecting" : "Neutral",
      detail: selected.copilotRevenue >= 2.5 ? "Copilot is becoming material enough to matter for both M365 growth and AI software mix quality." : "Copilot adoption is improving, but the platform still needs broader paid seat penetration and higher workflow intensity.",
    },
    {
      title: "AI ROIC inflection",
      signal: selected.aiRoicEstimate > assumptions.wacc ? "Positive" : selected.aiRoicEstimate > assumptions.wacc - 0.01 ? "Inflecting" : "Negative",
      detail: selected.aiRoicEstimate > assumptions.wacc ? "Incremental AI returns appear to be above the cost of capital, which is the key threshold for value creation." : "The market is still underwriting an ROIC inflection that has not fully shown up in reported economics yet.",
    },
  ];

  return {
    dataStatus,
    statusBanner,
    summary,
    interpretations,
    selectedRow: selected,
    rows,
    aiRevenueMix,
    marginBridge,
    capexCohorts,
    fcfOffsetRows,
    paybackSignal: payback.signal,
    paybackDetail: payback.detail,
    valuation: scenarioValuation,
    scenarioLab: {
      anchors: msftRealData.anchors,
      aiRevenue: scenarioRevenue,
      aiCost: scenarioCost,
      aiRoic: scenarioRoic,
      cloudMargin: scenarioCloud,
      fcfOffset: scenarioFcf,
      phase,
      valuation: scenarioValuation,
    },
  };
}

export function calculateMsftSummary(data: MsftData = msftData) {
  return buildMsftDashboardData(data, defaultMsftAssumptions, data.currentPeriodId, "Base").summary;
}
