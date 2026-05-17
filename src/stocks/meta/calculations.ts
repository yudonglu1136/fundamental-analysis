import type { DataSourceType, DataStatus, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { computeExpectedShareholderCagr, computeUpsideDownside, daysBetweenIso } from "../../utils/valuation";
import { metaDataset } from "./data";
import { defaultMetaValuationAssumptions, metaScenarioPresets } from "./assumptions";
import { calculateMetaAdEconomicsEngine } from "./engines/adEconomicsEngine";
import { calculateMetaAiCapexEngine } from "./engines/aiCapexEngine";
import { calculateMetaEarningsCallTrend } from "./engines/earningsCallEngine";
import { calculateMetaForecastEngine } from "./engines/forecastEngine";
import { getPeriodById, getSegment } from "./engines/helpers";
import { calculateMetaMarketImpliedValuation } from "./engines/marketImpliedEngine";
import { calculateMetaRiskRedTeamEngine } from "./engines/riskRedTeamEngine";
import { calculateMetaThesisBreakpoints } from "./engines/thesisBreakEngine";
import { calculateMetaValidationWarnings } from "./engines/validationEngine";
import { calculateMetaValuationAttribution } from "./engines/valuationAttributionEngine";
import { buildMetaSensitivityTables, calculateMetaValuationEngine } from "./engines/valuationEngine";
import { calculateMetaValuationIntegrity } from "./engines/valuationIntegrityEngine";
import type { MetaDataset, MetaValuationAssumptions } from "./model";

export { metaDataset };
export { defaultMetaValuationAssumptions, metaScenarioPresets };

type MetaRuntimeContext = {
  __metaResolvedPeriod?: string;
  __metaRequestedDataSourceType?: DataSourceType;
};

type MetaDatasetInput = MetaDataset & Partial<MetaRuntimeContext>;

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

function isMetaDataset(value: unknown): value is MetaDatasetInput {
  return Boolean(value && typeof value === "object" && "ticker" in value && "periods" in value && "segments" in value && "adEconomics" in value);
}

export function resolveMetaDataset(data: unknown): MetaDatasetInput {
  return isMetaDataset(data) ? data : metaDataset;
}

export function attachMetaRuntimeContext(
  data: MetaDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): MetaDatasetInput {
  return {
    ...data,
    __metaResolvedPeriod: context.periodId,
    __metaRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultMetaPeriod() {
  return metaDataset.latestReportingPeriod;
}

export function getMetaPeriods() {
  return metaDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function resolveMetaPeriodFromData(data: unknown, fallback = getDefaultMetaPeriod()) {
  const dataset = resolveMetaDataset(data);
  const runtimePeriod = dataset.__metaResolvedPeriod;
  if (runtimePeriod && dataset.periods.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.periods.some((period) => period.id === fallback) ? fallback : getDefaultMetaPeriod();
}

function uniqueWarnings(warnings: ValidationWarning[]) {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    if (seen.has(warning.id)) return false;
    seen.add(warning.id);
    return true;
  });
}

function buildDataSourceWarnings(data: MetaDatasetInput): ValidationWarning[] {
  const requested = data.__metaRequestedDataSourceType;
  const warnings: ValidationWarning[] = [];
  if (requested && requested !== "mock" && requested !== "manual") {
    warnings.push({
      id: "meta-unsupported-data-source",
      title: "Requested data source is not implemented for META",
      detail: `META currently uses the curated official-data module baseline plus manual valuation-assumption overrides. Requested source "${requested}" falls back to the module baseline.`,
      severity: "medium",
    });
  }
  if (requested === "manual") {
    warnings.push({
      id: "meta-manual-assumptions-active",
      title: "Manual valuation assumptions are active",
      detail: "Manual mode changes forecast assumptions only. It does not rewrite official actuals, management guidance, or research-only notes.",
      severity: "low",
    });
  }
  return warnings;
}

function buildScenarioValuationPoint(
  data: MetaDataset,
  scenario: Scenario,
  currentPrice: number,
) {
  const assumptions = { ...metaScenarioPresets[scenario], currentPrice };
  const forecast = calculateMetaForecastEngine(data, assumptions);
  const valuation = calculateMetaValuationEngine(data, scenario, assumptions, forecast);
  const yearThree = forecast[2] ?? forecast[forecast.length - 1];
  const targetPrice3Y = (yearThree?.eps ?? valuation.forwardEps) * assumptions.exitPe + (assumptions.realityLabsOptionValue / Math.max(yearThree?.dilutedShares ?? assumptions.dilutedShares, 1));
  const cumulativeDividends = assumptions.dividendPerShare * 3;
  return {
    scenario,
    fairValue: valuation.blendedFairValue,
    upsideDownside: computeUpsideDownside(valuation.blendedFairValue, currentPrice),
    expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y, currentPrice, cumulativeDividends),
    targetPrice3Y,
    cumulativeDividends,
    summary: data.researchNotes.find((note) => note.topic.toLowerCase().includes("capex"))?.conclusion,
  };
}

export function calculateMetaSummary(
  data: unknown,
  assumptions: Partial<MetaValuationAssumptions> = {},
  periodId = getDefaultMetaPeriod(),
): SummaryMetric[] {
  const dataset = resolveMetaDataset(data);
  const selected = getPeriodById(dataset, periodId);
  const prior = dataset.periods.find((period) => period.id === "fy2025") ?? selected;
  const actualFoa = getSegment(dataset, selected.id, "Family of Apps");
  const forecast = calculateMetaForecastEngine(dataset, { ...defaultMetaValuationAssumptions, ...assumptions });
  const valuation = calculateMetaValuation(dataset, selected.id, "Base", assumptions);
  const yearFive = forecast[forecast.length - 1];
  const basePoint = valuation.fairValues.find((row) => row.scenario === "Base");

  return [
    metric("Current Price", dataset.marketData.currentPrice, undefined, "currency", dataset.marketData.notes, "Actual"),
    metric("Revenue", selected.revenue, selected.revenue - prior.revenue, "currency", "Official consolidated revenue in USD billions.", "Actual"),
    metric("Ad Revenue", dataset.adEconomics.find((item) => item.periodId === selected.id)?.advertisingRevenue ?? 0, undefined, "currency", "Official Family of Apps advertising revenue in USD billions.", "Actual"),
    metric("FoA Op Margin", actualFoa.operatingMargin, undefined, "percent", "Family of Apps operating margin, before Reality Labs losses.", "Actual"),
    metric("Reality Labs Loss", Math.abs(getSegment(dataset, selected.id, "Reality Labs").operatingIncome), undefined, "currency", "Official Reality Labs operating loss in USD billions.", "Actual"),
    metric("CapEx / Revenue", selected.capitalExpendituresInclFinanceLeases / selected.revenue, undefined, "percent", "Capex including principal payments on finance leases divided by revenue.", "Derived"),
    metric("AI Payback", yearFive?.aiPaybackYears ?? 0, undefined, "number", "Year-five cumulative AI growth capex divided by AI incremental after-tax profit.", "Derived"),
    metric("Base Fair Value", basePoint?.fairValue ?? 0, basePoint ? basePoint.fairValue - dataset.marketData.currentPrice : undefined, "currency", "Blended DCF / FCF yield / P-E / EV-EBIT / SOTP fair value.", "Derived"),
  ];
}

export function calculateMetaValuation(
  data: unknown,
  periodId = getDefaultMetaPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<MetaValuationAssumptions> = {},
): ValuationResult {
  const dataset = resolveMetaDataset(data);
  const scenarioDefaults = metaScenarioPresets[scenario] ?? defaultMetaValuationAssumptions;
  const mergedAssumptions = { ...scenarioDefaults, ...assumptions };
  const forecast = calculateMetaForecastEngine(dataset, mergedAssumptions);
  const valuation = calculateMetaValuationEngine(dataset, scenario, mergedAssumptions, forecast);
  const marketImplied = calculateMetaMarketImpliedValuation(dataset, mergedAssumptions);
  const thesisBreakpoints = calculateMetaThesisBreakpoints(dataset, mergedAssumptions);
  const integrity = calculateMetaValuationIntegrity(dataset, forecast, valuation, marketImplied, thesisBreakpoints);
  const warnings = uniqueWarnings([
    ...buildDataSourceWarnings(dataset),
    ...valuation.sourceIsolationWarnings,
    ...integrity.severeWarnings,
    ...calculateMetaValidationWarnings(dataset, mergedAssumptions, forecast, valuation),
  ]);
  if (daysBetweenIso(dataset.marketData.priceDate, new Date().toISOString().slice(0, 10)) > 7) {
    warnings.push({
      id: "meta-stale-market-price",
      title: "Market price snapshot may be stale",
      detail: `META market price snapshot is dated ${dataset.marketData.priceDate}. Refresh market data before relying on upside/downside.`,
      severity: "medium",
    });
  }

  const currentPrice = mergedAssumptions.currentPrice;
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => buildScenarioValuationPoint(dataset, caseName, currentPrice));
  const selectedPoint = fairValues.find((item) => item.scenario === scenario) ?? fairValues[1];
  const probabilityWeightedFairValue = fairValues.reduce((sum, point) => {
    const probability = dataset.researchNotes.length
      ? (caseNameProbability(point.scenario) ?? 0)
      : 0;
    return sum + point.fairValue * probability;
  }, 0);

  return {
    currentPrice,
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
        description: "Unlevered FCFF DCF. Total capex is charged in cash flow and net cash is added after enterprise value.",
      },
      {
        key: "fcf-yield",
        label: "FCF Yield Value",
        value: valuation.fcfYieldFairValue,
        format: "currency",
        description: "Normalized FCF/share capitalized by target FCF yield.",
      },
      {
        key: "pe",
        label: "P/E Value",
        value: valuation.peFairValue,
        format: "currency",
        description: "Forward EPS after Reality Labs losses and share-count effects, multiplied by target P/E.",
      },
      {
        key: "ev-ebit",
        label: "EV / EBIT Value",
        value: valuation.evEbitFairValue,
        format: "currency",
        description: "Consolidated operating income cross-check, adding net cash after enterprise value.",
      },
      {
        key: "sotp",
        label: "SOTP Value",
        value: valuation.sotpFairValue,
        format: "currency",
        description: "Family of Apps EBIT value less funded Reality Labs drag plus explicit Reality Labs option value and net cash.",
      },
      {
        key: "ai-payback",
        label: "AI Payback",
        value: valuation.aiPaybackYears,
        format: "number",
        description: "Cumulative AI growth capex divided by AI incremental after-tax ad profit. Diagnostic only, not a separate fair-value add.",
      },
      {
        key: "ai-roic",
        label: "AI ROIC",
        value: valuation.aiRoic,
        format: "percent",
        description: "AI incremental after-tax profit divided by cumulative AI growth capex.",
      },
    ],
    expectedReturnBridge: [
      { key: "current-price", label: "Current Price", value: currentPrice, format: "currency" },
      { key: "selected-fair-value", label: "Selected Fair Value", value: selectedPoint.fairValue, format: "currency" },
      { key: "upside", label: "Upside / Downside", value: selectedPoint.upsideDownside, format: "percent" },
      { key: "target-price", label: "3Y Target Price", value: selectedPoint.targetPrice3Y ?? selectedPoint.fairValue, format: "currency" },
      { key: "dividends", label: "3Y Dividends", value: selectedPoint.cumulativeDividends ?? 0, format: "currency" },
      { key: "expected-return", label: "Expected 3Y CAGR", value: selectedPoint.expectedReturn3Y, format: "percent" },
    ],
    customSummary:
      `META ${scenario} fair value is $${selectedPoint.fairValue.toFixed(1)}. AI monetization is embedded through ad growth, FoA margin, and capex fade; Reality Labs is an explicit SOTP option and consolidated cash-flow drag.`,
    sensitivityTables: buildMetaSensitivityTables(dataset, mergedAssumptions),
    peFairValue: valuation.peFairValue,
    fcfFairValue: valuation.fcfYieldFairValue,
    dcfValue: valuation.dcf.fairValuePerShare,
    sotpFairValue: valuation.sotpFairValue,
    blendedFairValue: valuation.blendedFairValue,
    recommendedFairValue: valuation.blendedFairValue,
    recommendedFairValueMethod: "DCF / FCF yield / P-E / EV-EBIT / SOTP with explicit AI capex payback diagnostics",
    recommendedFairValueReason:
      "DCF and FCF yield anchor cash generation after the AI infrastructure buildout; P/E and EV/EBIT triangulate market convention; SOTP keeps Reality Labs optionality explicit without double-counting AI uplift.",
    valuationRangeLow: valuation.valuationRangeLow,
    valuationRangeBase: valuation.blendedFairValue,
    valuationRangeHigh: valuation.valuationRangeHigh,
    probabilityWeightedFairValue,
    targetPrice3Y: selectedPoint.targetPrice3Y,
    expectedReturn3Y: selectedPoint.expectedReturn3Y,
    upsideDownside: selectedPoint.upsideDownside,
    dataQualityScore: Math.min(integrity.overallIntegrityScore, warnings.some((warning) => warning.severity === "high") ? 72 : 94),
    recommendedValuationConfidence: warnings.some((warning) => warning.severity === "high") ? 68 : Math.min(90, integrity.overallIntegrityScore),
  };
}

function caseNameProbability(scenario: Scenario) {
  if (scenario === "Bear") return 0.25;
  if (scenario === "Base") return 0.5;
  return 0.25;
}

export function buildMetaDashboardData(
  data: unknown = metaDataset,
  periodId = getDefaultMetaPeriod(),
  scenario: Scenario = "Base",
  assumptions: Partial<MetaValuationAssumptions> = {},
) {
  const dataset = resolveMetaDataset(data);
  const mergedAssumptions = { ...metaScenarioPresets[scenario], ...assumptions };
  const period = getPeriodById(dataset, periodId);
  const forecast = calculateMetaForecastEngine(dataset, mergedAssumptions);
  const valuationEngine = calculateMetaValuationEngine(dataset, scenario, mergedAssumptions, forecast);
  const marketImplied = calculateMetaMarketImpliedValuation(dataset, mergedAssumptions);
  const thesisBreakpoints = calculateMetaThesisBreakpoints(dataset, mergedAssumptions);
  const valuationAttribution = calculateMetaValuationAttribution(dataset, mergedAssumptions);
  const earningsCalls = calculateMetaEarningsCallTrend(dataset);
  const risks = calculateMetaRiskRedTeamEngine(dataset);
  const integrity = calculateMetaValuationIntegrity(dataset, forecast, valuationEngine, marketImplied, thesisBreakpoints);
  const valuation = calculateMetaValuation(dataset, period.id, scenario, mergedAssumptions);
  const validationWarnings = uniqueWarnings([
    ...buildDataSourceWarnings(dataset),
    ...integrity.severeWarnings,
    ...(valuation.validationWarnings ?? []),
  ]);
  const adEconomics = calculateMetaAdEconomicsEngine(dataset, mergedAssumptions);
  const aiCapex = calculateMetaAiCapexEngine(dataset, mergedAssumptions, forecast);
  const dataStatus: DataStatus = {
    sourceType: dataset.__metaRequestedDataSourceType === "manual" ? "manual" : "mock",
    lastUpdated: dataset.sourceMap["meta-q1-2026-pr"]?.publishedDate ?? dataset.marketData.priceDate,
    missingFields: [
      "official AI-only capex split",
      "official WhatsApp revenue disclosure",
      "official Reels revenue / monetization gap",
      "live institutional market data feed",
      "peer multiple database",
    ],
    validationWarnings,
    valuationReliable: !validationWarnings.some((warning) => warning.severity === "high"),
  };

  const sourceStatusCounts = dataset.sources.reduce<Record<string, number>>((acc, source) => {
    acc[source.sourceStatus] = (acc[source.sourceStatus] ?? 0) + 1;
    return acc;
  }, {});

  return {
    dataset,
    period,
    summary: calculateMetaSummary(dataset, mergedAssumptions, period.id),
    forecast,
    valuation,
    valuationEngine,
    dataStatus,
    adEconomics,
    aiCapex,
    risks,
    marketImplied,
    earningsCalls,
    thesisBreakpoints,
    valuationAttribution,
    integrity,
    sourceStatusCounts,
    segmentRows: dataset.segments.filter((row) => row.periodId === period.id),
    productSignals: dataset.productSignals,
    transcriptInsights: dataset.transcriptInsights,
    realityLabs: dataset.realityLabs,
    assumptions: mergedAssumptions,
    validationWarnings,
    executiveReadThrough: [
      {
        title: "Ad economics",
        signal: adEconomics.monetizationSignal,
        detail: `Latest official ad bridge: impressions +${((adEconomics.latestActual.adImpressionsGrowth ?? 0) * 100).toFixed(0)}%, price/ad +${((adEconomics.latestActual.averagePricePerAdGrowth ?? 0) * 100).toFixed(0)}%.`,
        badge: "Actual" as const,
      },
      {
        title: "AI capex payback",
        signal: aiCapex.yearFiveAiRoic > mergedAssumptions.wacc ? "Positive" as const : "Compute Constrained" as const,
        detail: `Year-five AI ROIC ${(aiCapex.yearFiveAiRoic * 100).toFixed(1)}% versus WACC ${(mergedAssumptions.wacc * 100).toFixed(1)}%; payback ${aiCapex.yearFivePayback.toFixed(1)} years.`,
        badge: "Derived" as const,
      },
      {
        title: "Reality Labs",
        signal: mergedAssumptions.realityLabsOptionValue > 0 ? "Inflecting" as const : "Neutral" as const,
        detail: `Reality Labs remains a USD ${mergedAssumptions.realityLabsAnnualLoss.toFixed(1)}bn annual loss in the selected case, with option value only in SOTP.`,
        badge: "Assumption" as const,
      },
      {
        title: "Risk red team",
        signal: risks.riskScore > 60 ? "Negative" as const : "Needs Review" as const,
        detail: `${risks.redTeamVerdict} Risk haircut ${(risks.valuationHaircutPct * 100).toFixed(1)}%.`,
        badge: "Derived" as const,
      },
      {
        title: "Market implied",
        signal: marketImplied.verdict === "Market prices heroic execution" ? "Needs Review" as const : "Neutral" as const,
        detail: `${marketImplied.verdict}; implied 2027-30 revenue CAGR ${marketImplied.impliedRevenueCagr2027To2030 == null ? "n/a" : `${(marketImplied.impliedRevenueCagr2027To2030 * 100).toFixed(1)}%`}.`,
        badge: "Derived" as const,
      },
    ],
  };
}
