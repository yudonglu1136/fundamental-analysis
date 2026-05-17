import type {
  DataSourceType,
  DataStatus,
  Scenario,
  Signal,
  SummaryMetric,
  ValuationResult,
  ValidationWarning,
} from "../types";
import { computeExpectedShareholderCagr, computeUpsideDownside, daysBetweenIso } from "../../utils/valuation";
import { googlDataset } from "./data/index";
import { defaultGooglValuationAssumptions, googlScenarioPresets } from "./assumptions";
import { calculateGooglAiTpuCapexEngine } from "./engines/aiTpuCapexEngine";
import { calculateGooglCapitalReturnEngine } from "./engines/capitalReturnEngine";
import { calculateGooglCloudEngine } from "./engines/cloudEngine";
import { clamp, getGooglPeriod, getGooglRevenueLine, normalizedWeightMap, safeDivide } from "./engines/helpers";
import { calculateGooglMoatEngine } from "./engines/moatEngine";
import { calculateGooglOtherBetsEngine } from "./engines/otherBetsEngine";
import { calculateGooglRegulatoryRiskEngine } from "./engines/regulatoryRiskEngine";
import { calculateGooglRiskRedTeamEngine } from "./engines/riskRedTeamEngine";
import { calculateGooglSearchAdsEngine } from "./engines/searchAdsEngine";
import { calculateGooglTranscriptIntelligenceEngine } from "./engines/transcriptIntelligenceEngine";
import { buildGooglSensitivityTables, calculateGooglValuationEngine } from "./engines/valuationEngine";
import { calculateGooglYoutubeEngine } from "./engines/youtubeEngine";
import type { GooglDataset, GooglValuationAssumptions } from "./model";

export { googlDataset };
export { defaultGooglValuationAssumptions, googlScenarioPresets };

type GooglRuntimeContext = {
  __googlResolvedPeriod?: string;
  __googlRequestedDataSourceType?: DataSourceType;
};

type GooglDatasetInput = GooglDataset & Partial<GooglRuntimeContext>;

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

function isGooglDataset(value: unknown): value is GooglDatasetInput {
  return Boolean(value && typeof value === "object" && "ticker" in value && "revenueLines" in value && "cloudBacklog" in value);
}

export function resolveGooglDataset(data: unknown): GooglDatasetInput {
  return isGooglDataset(data) ? data : googlDataset;
}

export function attachGooglRuntimeContext(
  data: GooglDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): GooglDatasetInput {
  return {
    ...data,
    __googlResolvedPeriod: context.periodId,
    __googlRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultGooglPeriod() {
  return "q1-26";
}

export function getGooglPeriods() {
  return googlDataset.financials.map((period) => ({ value: period.id, label: period.label }));
}

export function resolveGooglPeriodFromData(data: unknown, fallback = getDefaultGooglPeriod()) {
  const dataset = resolveGooglDataset(data);
  const runtimePeriod = dataset.__googlResolvedPeriod;
  if (runtimePeriod && dataset.financials.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.financials.some((period) => period.id === fallback) ? fallback : getDefaultGooglPeriod();
}

function buildDataWarnings(data: GooglDatasetInput, periodId: string, valuationWarnings: ValidationWarning[]) {
  const warnings: ValidationWarning[] = [...valuationWarnings];
  const requested = data.__googlRequestedDataSourceType;
  if (requested && requested !== "mock" && requested !== "manual") {
    warnings.push({
      id: "googl-unsupported-data-source",
      title: "Requested data source is not implemented for GOOGL",
      detail: `GOOGL uses the curated official-data module baseline plus manual valuation-assumption overrides. Requested source "${requested}" falls back to the module baseline.`,
      severity: "medium",
    });
  }
  if (requested === "manual") {
    warnings.push({
      id: "googl-manual-assumptions-active",
      title: "Manual valuation assumptions are active",
      detail: "Manual mode changes forecast assumptions only. It does not rewrite official actuals, management commentary, market data, or research-only notes.",
      severity: "low",
    });
  }
  if (daysBetweenIso(data.marketData.priceDate, "2026-05-11") > 7) {
    warnings.push({
      id: "googl-stale-market-data",
      title: "Market price snapshot may be stale",
      detail: `GOOGL market data is dated ${data.marketData.priceDate}. Refresh market data before using upside/downside for trading decisions.`,
      severity: "medium",
    });
  }
  const line = getGooglRevenueLine(data, periodId);
  const revenueSum = line.googleServicesTotal + line.googleCloud + line.otherBets + line.hedging;
  if (Math.abs(revenueSum - line.totalRevenue) > 1) {
    warnings.push({
      id: "googl-revenue-reconciliation",
      title: "Revenue lines do not reconcile",
      detail: `Segment revenue lines sum to ${revenueSum}m versus disclosed total revenue ${line.totalRevenue}m.`,
      severity: "high",
    });
  }
  return warnings;
}

export function calculateGooglSummary(data: unknown, periodId = getDefaultGooglPeriod()): SummaryMetric[] {
  const dataset = resolveGooglDataset(data);
  const period = getGooglPeriod(dataset, periodId);
  const line = getGooglRevenueLine(dataset, periodId);
  const capitalReturn = calculateGooglCapitalReturnEngine(dataset, periodId, defaultGooglValuationAssumptions);
  const cloud = calculateGooglCloudEngine(dataset, periodId, defaultGooglValuationAssumptions);
  const search = calculateGooglSearchAdsEngine(dataset, periodId, defaultGooglValuationAssumptions);
  const tpu = calculateGooglAiTpuCapexEngine(dataset, periodId, defaultGooglValuationAssumptions);
  const revenueBase = period.periodType === "quarterly" ? period.totalRevenue : period.totalRevenue / 4;
  return [
    metric("Current Price", dataset.marketData.currentPrice, undefined, "currency", dataset.marketData.notes, "Actual"),
    metric("Total Revenue", period.totalRevenue, undefined, "number", `${period.label} total revenue from Alphabet official reporting.`, "Actual"),
    metric("Operating Margin", safeDivide(period.operatingIncome, period.totalRevenue), undefined, "percent", "Operating income divided by revenue.", "Derived"),
    metric("Search & Other", line.googleSearchOther, undefined, "number", "Google Search & other revenue line.", "Actual"),
    metric("YouTube Ads", line.youtubeAds, undefined, "number", "YouTube advertising revenue.", "Actual"),
    metric("Google Cloud", line.googleCloud, undefined, "number", "Google Cloud revenue.", "Actual"),
    metric("Cloud Margin", cloud.margin, undefined, "percent", "Google Cloud operating income divided by Cloud revenue.", "Derived"),
    metric("Cloud Backlog", dataset.cloudBacklog.googleCloudBacklog, undefined, "number", "Google Cloud remaining performance obligations / backlog.", "Actual"),
    metric("CapEx / Revenue", safeDivide(period.capex, period.totalRevenue), undefined, "percent", "Capital expenditures divided by revenue.", "Derived"),
    metric("TTM FCF Yield", capitalReturn.ttmFcfYield, undefined, "percent", "TTM FCF divided by third-party market cap.", "Derived"),
    metric("TPU Moat Score", tpu.tpuMoatScore, undefined, "number", "Composite score from TPU performance, response cost, and CapEx payback.", "Derived"),
    metric("AI Search Balance", search.aiSearchBalanceScore, undefined, "number", "Whether AI Search monetization offsets cannibalization risk.", "Derived"),
    metric("FCF", period.freeCashFlow, undefined, "number", `Simple FCF equals OCF minus CapEx. Revenue base for quarter is ${revenueBase.toFixed(0)}m.`, "Derived"),
    metric("Remaining Buyback", dataset.commitmentsAndCapitalStructure.remainingShareRepurchaseAuthorization, undefined, "number", "Remaining share repurchase authorization disclosed in Q1 2026 10-Q.", "Actual"),
  ];
}

function getStatusSignal(dashboard: {
  search: ReturnType<typeof calculateGooglSearchAdsEngine>;
  cloud: ReturnType<typeof calculateGooglCloudEngine>;
  tpu: ReturnType<typeof calculateGooglAiTpuCapexEngine>;
  regulatory: ReturnType<typeof calculateGooglRegulatoryRiskEngine>;
}): { signal: Signal; title: string; detail: string } {
  if (dashboard.search.monetizationRisk === "High" || dashboard.regulatory.riskScore > 70) {
    return {
      signal: "Needs Review",
      title: "Search or regulatory risk is driving the model",
      detail: "The selected assumptions make AI Search cannibalization or antitrust remedies a primary valuation variable.",
    };
  }
  if (dashboard.tpu.computeConstraint > 0.65) {
    return {
      signal: "Compute Constrained",
      title: "AI demand is still compute constrained",
      detail: "Search AI, Gemini, Cloud AI and TPU hardware signals are positive, but monetization is bottlenecked by technical infrastructure availability.",
    };
  }
  if (dashboard.cloud.margin >= 0.3 && dashboard.tpu.tpuMoatScore > 70) {
    return {
      signal: "Positive",
      title: "Cloud margin and TPU evidence support the AI thesis",
      detail: "Cloud margins, backlog, TPU performance and response-cost reductions are strong enough to offset part of the CapEx burden.",
    };
  }
  return {
    signal: "Inflecting",
    title: "AI investment phase with improving proof points",
    detail: "The cockpit is watching whether Search monetization, Cloud backlog conversion and TPU utilization translate into durable FCF.",
  };
}

function buildGooglEngines(
  data: GooglDatasetInput,
  periodId: string,
  scenario: Scenario,
  assumptions: GooglValuationAssumptions,
) {
  const search = calculateGooglSearchAdsEngine(data, periodId, assumptions);
  const youtube = calculateGooglYoutubeEngine(data, periodId, assumptions);
  const cloud = calculateGooglCloudEngine(data, periodId, assumptions);
  const tpu = calculateGooglAiTpuCapexEngine(data, periodId, assumptions);
  const regulatory = calculateGooglRegulatoryRiskEngine(data, assumptions);
  const otherBets = calculateGooglOtherBetsEngine(data, periodId, assumptions);
  const capitalReturn = calculateGooglCapitalReturnEngine(data, periodId, assumptions);
  const moat = calculateGooglMoatEngine(search, youtube, cloud, tpu, regulatory, otherBets);
  const risks = calculateGooglRiskRedTeamEngine(data, regulatory, assumptions);
  const valuationEngine = calculateGooglValuationEngine(data, periodId, assumptions, {
    search,
    cloud,
    otherBets,
    capitalReturn,
  });
  const statusBanner = getStatusSignal({ search, cloud, tpu, regulatory });
  return { scenario, assumptions, search, youtube, cloud, tpu, regulatory, otherBets, capitalReturn, moat, risks, valuationEngine, statusBanner };
}

export function calculateGooglValuation(
  data: unknown,
  periodId = getDefaultGooglPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<GooglValuationAssumptions> = {},
): ValuationResult {
  const dataset = resolveGooglDataset(data);
  const scenarioDefaults = googlScenarioPresets[scenario] ?? defaultGooglValuationAssumptions;
  const mergedAssumptions = { ...scenarioDefaults, ...assumptions };
  const engines = buildGooglEngines(dataset, periodId, scenario, mergedAssumptions);
  const valuation = engines.valuationEngine;
  const warnings = buildDataWarnings(dataset, periodId, valuation.methodWarnings);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const caseAssumptions = {
      ...googlScenarioPresets[caseName],
      currentPrice: mergedAssumptions.currentPrice,
      dilutedShares: mergedAssumptions.dilutedShares,
      netCash: mergedAssumptions.netCash,
      dividendPerShareAnnualized: mergedAssumptions.dividendPerShareAnnualized,
    };
    const caseEngines = buildGooglEngines(dataset, periodId, caseName, caseAssumptions);
    const targetPrice3Y = caseEngines.valuationEngine.blendedFairValue * (1 + caseAssumptions.searchRevenueCagr * 0.35 + caseAssumptions.cloudRevenueCagr * 0.15);
    const cumulativeDividends = caseAssumptions.dividendPerShareAnnualized * 3;
    return {
      scenario: caseName,
      fairValue: caseEngines.valuationEngine.blendedFairValue,
      upsideDownside: computeUpsideDownside(caseEngines.valuationEngine.blendedFairValue, caseAssumptions.currentPrice),
      expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y, caseAssumptions.currentPrice, cumulativeDividends),
      targetPrice3Y,
      cumulativeDividends,
      summary: dataset.scenarioDrivers.find((item) => item.scenario === caseName)?.narrative,
    };
  });
  const selectedPoint = fairValues.find((item) => item.scenario === scenario) ?? fairValues[1];
  const weightSum = Object.values({
    dcf: mergedAssumptions.weightDcf,
    fcfYield: mergedAssumptions.weightFcfYield,
    evEbit: mergedAssumptions.weightEvEbit,
    pe: mergedAssumptions.weightPe,
    sotp: mergedAssumptions.weightSotp,
  }).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(weightSum - 1) > 0.0001) {
    warnings.push({
      id: "googl-weight-sum",
      title: "Valuation weights were normalized",
      detail: `Input valuation weights sum to ${(weightSum * 100).toFixed(1)}%; the engine normalized them before blending.`,
      severity: "low",
    });
  }

  const normalizedWeights = normalizedWeightMap({
    dcf: mergedAssumptions.weightDcf,
    fcfYield: mergedAssumptions.weightFcfYield,
    evEbit: mergedAssumptions.weightEvEbit,
    pe: mergedAssumptions.weightPe,
    sotp: mergedAssumptions.weightSotp,
  });

  return {
    currentPrice: mergedAssumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: warnings,
    warning: warnings.find((warning) => warning.severity === "high")?.title,
    fairValues,
    methodCards: [
      {
        key: "dcf",
        label: "FCFF DCF",
        value: valuation.dcf.fairValuePerShare,
        format: "currency",
        description: "DCF with segment revenue, Cloud margin ramp, CapEx intensity, D&A, tax, working capital, WACC, terminal growth, shares and net cash.",
      },
      {
        key: "fcf-yield",
        label: "FCF Yield",
        value: valuation.fcfYieldFairValue,
        format: "currency",
        description: "Normalized TTM / forward FCF capitalized by target FCF yield.",
      },
      {
        key: "ev-ebit",
        label: "EV / EBIT",
        value: valuation.evEbitFairValue,
        format: "currency",
        description: "Forward operating income cross-check after net cash.",
      },
      {
        key: "pe",
        label: "P/E",
        value: valuation.peFairValue,
        format: "currency",
        description: "Normalized net income cross-check.",
      },
      {
        key: "sotp",
        label: "SOTP + TPU / Risk",
        value: valuation.sotpFairValue,
        format: "currency",
        description: "Services, Cloud, subscriptions, capped Other Bets, net cash, capped TPU/CapEx adjustment and regulatory discount.",
      },
      {
        key: "blended",
        label: "Blended Fair Value",
        value: valuation.blendedFairValue,
        format: "currency",
        description: "Weighted triangulation output.",
      },
    ],
    expectedReturnBridge: [
      { key: "current-price", label: "Current Price", value: mergedAssumptions.currentPrice, format: "currency" },
      { key: "fair-value", label: "Selected Fair Value", value: selectedPoint.fairValue, format: "currency" },
      { key: "upside", label: "Upside / Downside", value: selectedPoint.upsideDownside, format: "percent" },
      { key: "target-price", label: "3Y Target Price", value: selectedPoint.targetPrice3Y ?? selectedPoint.fairValue, format: "currency" },
      { key: "dividends", label: "3Y Dividends", value: selectedPoint.cumulativeDividends ?? 0, format: "currency" },
      { key: "expected-return", label: "Expected 3Y CAGR", value: selectedPoint.expectedReturn3Y, format: "percent" },
    ],
    customSummary: `GOOGL ${scenario} fair value is $${selectedPoint.fairValue.toFixed(1)}. Key variables: Search AI balance ${engines.search.aiSearchBalanceScore.toFixed(0)}, Cloud margin ${(engines.cloud.margin * 100).toFixed(1)}%, CapEx intensity ${(mergedAssumptions.capexIntensity * 100).toFixed(1)}%, regulatory discount ${(mergedAssumptions.regulatoryDiscount * 100).toFixed(1)}%.`,
    sensitivityTables: buildGooglSensitivityTables(mergedAssumptions, valuation),
    peFairValue: valuation.peFairValue,
    fcfFairValue: valuation.fcfYieldFairValue,
    dcfValue: valuation.dcf.fairValuePerShare,
    sotpFairValue: valuation.sotpFairValue,
    blendedFairValue: valuation.blendedFairValue,
    recommendedFairValue: valuation.blendedFairValue,
    recommendedFairValueMethod: "FCFF DCF / FCF yield / EV-EBIT / PE / SOTP with capped TPU and regulatory layers",
    recommendedFairValueReason:
      "Alphabet is a multi-engine platform: Search funds the AI build, YouTube and subscriptions deepen engagement, Cloud/TPU convert AI demand, and regulatory remedies can change distribution economics. The model triangulates instead of relying on P/E.",
    valuationRangeLow: valuation.valuationRangeLow,
    valuationRangeBase: valuation.blendedFairValue,
    valuationRangeHigh: valuation.valuationRangeHigh,
    probabilityWeightedFairValue: valuation.probabilityWeightedFairValue,
    targetPrice3Y: selectedPoint.targetPrice3Y,
    expectedReturn3Y: selectedPoint.expectedReturn3Y,
    upsideDownside: selectedPoint.upsideDownside,
    dataQualityScore: warnings.some((warning) => warning.severity === "high") ? 70 : warnings.length ? 84 : 92,
    recommendedValuationConfidence: clamp(engines.moat.moatScore - engines.regulatory.riskScore * 0.15, 45, 92),
  };
}

export function buildGooglDashboardData(
  data: unknown,
  periodId = getDefaultGooglPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<GooglValuationAssumptions> = {},
) {
  const dataset = resolveGooglDataset(data);
  const period = getGooglPeriod(dataset, periodId);
  const revenueLine = getGooglRevenueLine(dataset, periodId);
  const mergedAssumptions = { ...(googlScenarioPresets[scenario] ?? defaultGooglValuationAssumptions), ...assumptions };
  const engines = buildGooglEngines(dataset, periodId, scenario, mergedAssumptions);
  const valuation = calculateGooglValuation(dataset, periodId, scenario, mergedAssumptions);
  const transcriptIntelligence = calculateGooglTranscriptIntelligenceEngine();
  const dataStatus: DataStatus = {
    sourceType: dataset.__googlRequestedDataSourceType === "manual" ? "manual" : "mock",
    lastUpdated: dataset.marketData.priceDate,
    missingFields: [
      "official live share price feed",
      "standalone YouTube operating income",
      "disclosed TPU capex split versus total technical infrastructure capex",
      "AI Overviews / AI Mode monetization KPI history",
      "explicit Search TAC by channel and default-placement economics",
    ],
    validationWarnings: valuation.validationWarnings ?? [],
    valuationReliable: !(valuation.validationWarnings ?? []).some((warning) => warning.severity === "high"),
  };

  return {
    dataset,
    period,
    revenueLine,
    summary: calculateGooglSummary(dataset, period.id),
    valuation,
    transcriptIntelligence,
    dataStatus,
    ...engines,
  };
}
