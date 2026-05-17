import type { DataSourceType, DataStatus, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { computeExpectedShareholderCagr, computeUpsideDownside, daysBetweenIso } from "../../utils/valuation";
import { msftDataset, msftPeriods } from "./data";
import { defaultMsftValuationAssumptions, msftScenarioPresets } from "./assumptions";
import type { MsftDataset, MsftValuationAssumptions } from "./model";
import { calculateMsftAiFactoryEngine } from "./engines/aiFactoryEngine";
import { calculateMsftBusinessMixEngine } from "./engines/businessMixEngine";
import { calculateMsftCapexFcfEngine } from "./engines/capexFcfEngine";
import { calculateMsftCapitalReturnEngine } from "./engines/capitalReturnEngine";
import { calculateMsftCopilotEngine } from "./engines/copilotEngine";
import { calculateMsftEarningsCallEngine } from "./engines/earningsCallEngine";
import { calculateMsftMarginBridgeEngine } from "./engines/marginBridgeEngine";
import { calculateMsftOpenAiExposureEngine } from "./engines/openAiExposureEngine";
import { calculateMsftRiskRedTeamEngine } from "./engines/riskRedTeamEngine";
import { calculateMsftSegmentEngine } from "./engines/segmentEngine";
import { buildMsftSensitivityTables, calculateMsftValuationEngine } from "./engines/valuationEngine";

export { msftDataset, msftPeriods };
export { defaultMsftValuationAssumptions, msftScenarioPresets };

type MsftRuntimeContext = {
  __msftResolvedPeriod?: string;
  __msftRequestedDataSourceType?: DataSourceType;
};

type MsftDatasetInput = MsftDataset & Partial<MsftRuntimeContext>;

function metric(
  label: string,
  value: number,
  delta: number | undefined,
  format: SummaryMetric["format"],
  description: string,
  badge: SummaryMetric["badge"],
): SummaryMetric {
  return { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, value, delta, format, description, badge };
}

function isMsftDataset(value: unknown): value is MsftDatasetInput {
  return Boolean(value && typeof value === "object" && "ticker" in value && "segments" in value && "cloudMetrics" in value);
}

export function resolveMsftDataset(data: unknown): MsftDatasetInput {
  return isMsftDataset(data) ? data : msftDataset;
}

export function attachMsftRuntimeContext(
  data: MsftDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): MsftDatasetInput {
  return {
    ...data,
    __msftResolvedPeriod: context.periodId,
    __msftRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultMsftPeriod() {
  return "q3-fy26";
}

export function getMsftPeriods() {
  return msftPeriods;
}

export function resolveMsftPeriodFromData(data: unknown, fallback = getDefaultMsftPeriod()) {
  const dataset = resolveMsftDataset(data);
  const runtimePeriod = dataset.__msftResolvedPeriod;
  if (runtimePeriod && dataset.periods.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.periods.some((period) => period.id === fallback) ? fallback : getDefaultMsftPeriod();
}

function getPeriod(data: MsftDatasetInput, periodId = getDefaultMsftPeriod()) {
  return data.periods.find((period) => period.id === periodId) ?? data.periods.find((period) => period.id === getDefaultMsftPeriod()) ?? data.periods[0];
}

function buildSourceWarnings(data: MsftDatasetInput): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const requested = data.__msftRequestedDataSourceType;
  if (requested && requested !== "mock" && requested !== "manual") {
    warnings.push({
      id: "msft-unsupported-data-source",
      title: "Requested data source is not implemented for MSFT",
      detail: `MSFT currently uses curated official Microsoft data plus manual valuation assumptions. Requested source "${requested}" falls back to the module baseline.`,
      severity: "medium",
    });
  }
  if (requested === "manual") {
    warnings.push({
      id: "msft-manual-assumptions-active",
      title: "Manual valuation assumptions are active",
      detail: "Manual mode changes scenario assumptions only; official actuals and management commentary remain unchanged.",
      severity: "low",
    });
  }
  if (daysBetweenIso(data.marketData.priceDate, "2026-05-11") > 7) {
    warnings.push({
      id: "msft-stale-price",
      title: "Market price anchor may be stale",
      detail: `MSFT price anchor is dated ${data.marketData.priceDate}. Refresh market data before underwriting upside/downside.`,
      severity: "medium",
    });
  }
  return warnings;
}

function buildModelWarnings(
  data: MsftDatasetInput,
  periodId: string,
  assumptions: MsftValuationAssumptions,
  valuation: ReturnType<typeof calculateMsftValuationEngine>,
) {
  const segment = calculateMsftSegmentEngine(data, periodId);
  const capex = calculateMsftCapexFcfEngine(data, assumptions);
  const openAi = calculateMsftOpenAiExposureEngine(data, assumptions);
  const warnings: ValidationWarning[] = [
    ...buildSourceWarnings(data),
    ...segment.warnings,
    ...capex.warnings,
    ...openAi.warnings,
    ...valuation.warnings,
  ];
  const scenarioWeightSum = data.scenarios.reduce((total, scenario) => total + scenario.probability, 0);
  if (Math.abs(scenarioWeightSum - 1) > 0.0001) {
    warnings.push({
      id: "msft-scenario-probability-sum",
      title: "Scenario probabilities do not sum to 100%",
      detail: `Scenario probabilities sum to ${(scenarioWeightSum * 100).toFixed(1)}%.`,
      severity: "high",
    });
  }
  if (data.aiDisclosures.some((item) => item.id === "openai-revenue-share-economics" && item.sourceStatus !== "scenario_assumption")) {
    warnings.push({
      id: "msft-openai-source-tier",
      title: "OpenAI economics source tier is invalid",
      detail: "Revenue share percentage, compute economics, and OpenAI revenue contribution must remain scenario assumptions.",
      severity: "high",
    });
  }
  return warnings;
}

export function calculateMsftSummary(data: unknown, periodId = getDefaultMsftPeriod()): SummaryMetric[] {
  const dataset = resolveMsftDataset(data);
  const period = getPeriod(dataset, periodId);
  const fy25 = dataset.periods.find((item) => item.id === "fy25");
  const cloud = dataset.cloudMetrics.find((item) => item.periodId === "q3-fy26") ?? dataset.cloudMetrics[dataset.cloudMetrics.length - 1];
  const aiArr = dataset.aiDisclosures.find((item) => item.id === "ai-arr-q3-fy26")?.metric ?? 0;
  return [
    metric("Current Price", dataset.marketData.currentPrice, undefined, "currency", dataset.marketData.notes, "Actual"),
    metric("Revenue", period.revenue, fy25 && period.periodType === "quarter" ? period.revenue - fy25.revenue / 4 : undefined, "number", `${period.label} official revenue.`, "Actual"),
    metric("Operating Margin", period.operatingMargin, fy25 ? period.operatingMargin - fy25.operatingMargin : undefined, "percent", "Operating income divided by revenue.", "Actual"),
    metric("Microsoft Cloud GM", cloud.microsoftCloudGrossMargin, undefined, "percent", "Microsoft Cloud gross margin percentage.", "Actual"),
    metric("Azure Growth", cloud.azureGrowth ?? 0, undefined, "percent", "Azure and other cloud services growth.", "Actual"),
    metric("AI ARR", aiArr, undefined, "number", "Management-commentary AI annual revenue run rate in USDbn.", "Actual"),
    metric("FCF", period.freeCashFlow ?? 0, undefined, "number", "Operating cash flow less additions to property and equipment.", "Derived"),
    metric("Capex Intensity", (period.capex ?? 0) / period.revenue, undefined, "percent", "Capex divided by revenue; key AI payback stress.", "Derived"),
  ];
}

export function calculateMsftValuation(
  data: unknown,
  assumptions: Partial<MsftValuationAssumptions> = {},
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolveMsftDataset(data);
  const scenarioDefaults = msftScenarioPresets[scenario] ?? defaultMsftValuationAssumptions;
  const mergedAssumptions = { ...scenarioDefaults, ...assumptions };
  const valuation = calculateMsftValuationEngine(dataset, scenario, mergedAssumptions);
  const warnings = buildModelWarnings(dataset, resolveMsftPeriodFromData(dataset), mergedAssumptions, valuation);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const scenarioAssumptions = {
      ...msftScenarioPresets[caseName],
      currentPrice: mergedAssumptions.currentPrice,
      netCashDebt: mergedAssumptions.netCashDebt,
      dilutedShares: mergedAssumptions.dilutedShares,
    };
    const scenarioValuation = calculateMsftValuationEngine(dataset, caseName, scenarioAssumptions);
    const targetPrice3Y = scenarioValuation.blendedFairValue * (1 + scenarioAssumptions.baseSoftwareGrowth * 0.35 + scenarioAssumptions.azureGrowth * 0.25);
    const cumulativeDividends = scenarioAssumptions.dividendPerShare * 3;
    return {
      scenario: caseName,
      fairValue: scenarioValuation.blendedFairValue,
      upsideDownside: computeUpsideDownside(scenarioValuation.blendedFairValue, scenarioAssumptions.currentPrice),
      expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y, scenarioAssumptions.currentPrice, cumulativeDividends),
      targetPrice3Y,
      cumulativeDividends,
      summary: dataset.scenarios.find((item) => item.scenario === caseName)?.narrative,
    };
  });
  const selectedPoint = fairValues.find((item) => item.scenario === scenario) ?? fairValues[1];
  const methodValues = [
    valuation.dcf.fairValuePerShare,
    valuation.fcfYieldFairValue,
    valuation.peFairValue,
    valuation.evEbitFairValue,
    valuation.sotpFairValue,
  ];
  const methodAverage = methodValues.reduce((total, value) => total + value, 0) / methodValues.length;
  const methodDispersion = (Math.max(...methodValues) - Math.min(...methodValues)) / Math.max(methodAverage, 1);
  return {
    currentPrice: mergedAssumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: warnings,
    warning: warnings.find((warning) => warning.severity === "high")?.title,
    fairValues,
    methodCards: [
      {
        key: "dcf",
        label: "DCF Fair Value",
        value: valuation.dcf.fairValuePerShare,
        format: "currency",
        description: "FCFF DCF with explicit Azure growth, Copilot revenue, OpenAI scenario revenue, AI capex intensity, depreciation, WACC, and terminal growth.",
      },
      {
        key: "fcf-yield",
        label: "FCF Yield Value",
        value: valuation.fcfYieldFairValue,
        format: "currency",
        description: "Normalized FCF cross-check that dampens near-term AI capex distortion.",
      },
      {
        key: "pe",
        label: "P/E Value",
        value: valuation.peFairValue,
        format: "currency",
        description: "Forward EPS cross-check after operating margin, tax, net cash yield, and target P/E.",
      },
      {
        key: "ev-ebit",
        label: "EV / EBIT Value",
        value: valuation.evEbitFairValue,
        format: "currency",
        description: "Forward EBIT multiple cross-check adjusted for net cash/debt and operating leases.",
      },
      {
        key: "sotp",
        label: "SOTP Fair Value",
        value: valuation.sotpFairValue,
        format: "currency",
        description: "SOTP split across Productivity/M365, Intelligent Cloud/Azure, and consumer franchises.",
      },
      {
        key: "ai-optionality",
        label: "AI Optionality / Share",
        value: valuation.aiOptionalityFairValue,
        format: "currency",
        description: "Explicit scenario-only OpenAI/IP/agent optionality value per share.",
      },
    ],
    expectedReturnBridge: [
      {
        key: "fair-value",
        label: `${scenario} fair value`,
        value: selectedPoint.fairValue,
        format: "currency",
        description: "Selected scenario blended fair value.",
      },
      {
        key: "upside",
        label: "Upside / downside",
        value: selectedPoint.upsideDownside,
        format: "percent",
        description: "Fair value versus current market-data anchor.",
      },
      {
        key: "expected-return",
        label: "3Y shareholder CAGR",
        value: selectedPoint.expectedReturn3Y,
        format: "percent",
        description: "Three-year target price plus dividends.",
      },
      {
        key: "terminal-share",
        label: "DCF terminal value share",
        value: valuation.dcf.terminalValueShareOfEv,
        format: "percent",
        description: "Terminal value as a percentage of DCF enterprise value.",
      },
    ],
    sensitivityTables: buildMsftSensitivityTables(dataset, mergedAssumptions),
    dcfValue: valuation.dcf.fairValuePerShare,
    fcfFairValue: valuation.fcfYieldFairValue,
    peFairValue: valuation.peFairValue,
    operatingSotpFairValue: valuation.sotpFairValue,
    strategicOptionalityPerShare: valuation.aiOptionalityFairValue,
    blendedFairValue: valuation.blendedFairValue,
    probabilityWeightedFairValue: valuation.probabilityWeightedFairValue,
    recommendedFairValue: valuation.blendedFairValue,
    recommendedFairValueMethod: "DCF / FCF yield / P/E / EV-EBIT / SOTP / AI optionality blend",
    recommendedFairValueReason: "Explicitly separates official actuals from OpenAI/Copilot scenario assumptions and tests AI capex against FCF conversion.",
    valuationRangeLow: valuation.valuationRangeLow,
    valuationRangeBase: valuation.probabilityWeightedFairValue,
    valuationRangeHigh: valuation.valuationRangeHigh,
    expectedReturn3Y: selectedPoint.expectedReturn3Y,
    upsideDownside: selectedPoint.upsideDownside,
    methodDispersion,
  };
}

export function buildMsftDashboardData(
  data: unknown,
  periodId = getDefaultMsftPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<MsftValuationAssumptions> = {},
) {
  const dataset = resolveMsftDataset(data);
  const resolvedPeriod = dataset.periods.some((period) => period.id === periodId) ? periodId : getDefaultMsftPeriod();
  const mergedAssumptions = { ...msftScenarioPresets[scenario], ...assumptions };
  const valuationEngine = calculateMsftValuationEngine(dataset, scenario, mergedAssumptions);
  const warnings = buildModelWarnings(dataset, resolvedPeriod, mergedAssumptions, valuationEngine);
  const dataStatus: DataStatus = {
    sourceType: dataset.__msftRequestedDataSourceType ?? "manual",
    lastUpdated: "2026-05-11",
    missingFields: [
      "OpenAI revenue contribution and revenue-share percentage are not disclosed.",
      "OpenAI compute resale margin is not disclosed.",
      "M365 Copilot revenue, ARPU, churn, usage overage, and gross margin are not disclosed.",
      "Azure AI revenue split and exact AI contribution points are not disclosed in the FY2026 Q3 pages used here.",
    ],
    validationWarnings: warnings,
    valuationReliable: warnings.every((warning) => warning.severity !== "high"),
  };
  const valuation = calculateMsftValuation(dataset, mergedAssumptions, scenario);
  const segment = calculateMsftSegmentEngine(dataset, resolvedPeriod);
  const aiFactory = calculateMsftAiFactoryEngine(dataset);
  const openAi = calculateMsftOpenAiExposureEngine(dataset, mergedAssumptions);
  const copilot = calculateMsftCopilotEngine(dataset, mergedAssumptions);
  const marginBridge = calculateMsftMarginBridgeEngine(dataset, mergedAssumptions);
  const capexFcf = calculateMsftCapexFcfEngine(dataset, mergedAssumptions);
  const businessMix = calculateMsftBusinessMixEngine(dataset);
  const risks = calculateMsftRiskRedTeamEngine(dataset);
  const capitalReturn = calculateMsftCapitalReturnEngine(dataset, mergedAssumptions);
  const earningsCalls = calculateMsftEarningsCallEngine(dataset);

  return {
    dataset,
    period: getPeriod(dataset, resolvedPeriod),
    dataStatus,
    summary: calculateMsftSummary(dataset, resolvedPeriod),
    valuation,
    valuationEngine,
    segment,
    aiFactory,
    openAi,
    copilot,
    marginBridge,
    capexFcf,
    businessMix,
    risks,
    capitalReturn,
    earningsCalls,
    assumptions: mergedAssumptions,
  };
}
