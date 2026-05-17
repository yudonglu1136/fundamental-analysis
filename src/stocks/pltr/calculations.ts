import type { DataSourceType, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import { defaultPltrValuationAssumptions, pltrScenarioDefinitions } from "./assumptions";
import { pltrData } from "./realData";
import type { PltrDashboardData, PltrDataset, PltrScenarioName, PltrValuationAssumptions } from "./model";
import { calculateAipMonetizationEngine } from "./engines/aipMonetizationEngine";
import { calculateCustomerCohortEngine } from "./engines/customerCohortEngine";
import { calculateMarginLeverageEngine } from "./engines/marginLeverageEngine";
import { calculateOntologyMoatEngine } from "./engines/ontologyMoatEngine";
import { buildPltrQ1DeepDive } from "./engines/q1DeepDiveEngine";
import { buildPltrRiskRegister } from "./engines/riskEngine";
import { calculatePltrScenarioEngine, buildPltrScenarioAssumptions } from "./engines/scenarioEngine";
import { calculateSbcDilutionEngine } from "./engines/sbcDilutionEngine";
import { calculateTranscriptThemeEngine } from "./engines/transcriptThemeEngine";
import { calculatePltrValuationEngine } from "./engines/valuationEngine";
import { latestPeriod, metricValue } from "./engines/helpers";

type PltrRuntimeContext = {
  __pltrResolvedPeriod?: string;
  __pltrRequestedDataSourceType?: DataSourceType;
};

type PltrDatasetInput = PltrDataset & Partial<PltrRuntimeContext>;

function isPltrDataset(value: unknown): value is PltrDatasetInput {
  return Boolean(value && typeof value === "object" && "actuals" in value && "guidance" in value && "marketData" in value);
}

export function resolvePltrDataset(data: unknown): PltrDatasetInput {
  return isPltrDataset(data) ? data : pltrData;
}

export function attachPltrRuntimeContext(
  data: PltrDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): PltrDatasetInput {
  return {
    ...data,
    __pltrResolvedPeriod: context.periodId,
    __pltrRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultPltrPeriod(data: PltrDataset = pltrData) {
  return data.actuals[data.actuals.length - 1]?.periodId ?? "";
}

export function getPltrPeriods(data: PltrDataset = pltrData) {
  return data.actuals.map((period) => ({ value: period.periodId, label: period.label }));
}

export function resolvePltrPeriodFromData(data: unknown, fallback = getDefaultPltrPeriod()) {
  const dataset = resolvePltrDataset(data);
  const runtimePeriod = dataset.__pltrResolvedPeriod;
  if (runtimePeriod && dataset.actuals.some((period) => period.periodId === runtimePeriod)) return runtimePeriod;
  return dataset.actuals.some((period) => period.periodId === fallback) ? fallback : getDefaultPltrPeriod(dataset);
}

export function resolvePltrEffectiveDataSourceType(data: unknown): DataSourceType {
  const dataset = resolvePltrDataset(data);
  return dataset.__pltrRequestedDataSourceType === "manual" ? "manual" : "mock";
}

function metric(
  key: string,
  label: string,
  value: number,
  delta: number | undefined,
  format: SummaryMetric["format"],
  description: string,
  badge: SummaryMetric["badge"],
): SummaryMetric {
  return { key, label, value, delta, format, description, badge };
}

function activeActual(dataset: PltrDatasetInput, periodId: string) {
  return dataset.actuals.find((period) => period.periodId === periodId) ?? latestPeriod(dataset.actuals);
}

function scenarioDefinition(name: PltrScenarioName) {
  return pltrScenarioDefinitions.find((definition) => definition.name === name) ?? pltrScenarioDefinitions[1];
}

function valuationAssumptionsWithLatest(
  dataset: PltrDatasetInput,
  overrides?: Partial<PltrValuationAssumptions>,
): PltrValuationAssumptions {
  const latest = latestPeriod(dataset.actuals);
  const guidanceRevenue = metricValue(latest, "guidanceRevenue") || defaultPltrValuationAssumptions.baseRevenue;
  const netCash = metricValue(latest, "netCash") || dataset.marketData.netCash || defaultPltrValuationAssumptions.netCash;
  const currentPrice = dataset.marketData.currentPrice || defaultPltrValuationAssumptions.currentPrice;
  return {
    ...defaultPltrValuationAssumptions,
    baseRevenue: guidanceRevenue,
    netCash,
    currentPrice,
    ...(overrides ?? {}),
  };
}

export function calculatePltrSummary(data: unknown): SummaryMetric[] {
  const dataset = resolvePltrDataset(data);
  const latest = latestPeriod(dataset.actuals);
  const priorYear = dataset.actuals.find(
    (period) => period.fiscalYear === latest.fiscalYear - 1 && period.fiscalQuarter === latest.fiscalQuarter,
  );
  return [
    metric(
      "revenue",
      "Revenue",
      metricValue(latest, "revenue"),
      priorYear ? metricValue(latest, "revenue") - metricValue(priorYear, "revenue") : undefined,
      "currency",
      `${latest.label} reported revenue in USD millions.`,
      latest.metrics.revenue.sourceConfidence === "high" ? "Actual" : "Needs Review",
    ),
    metric(
      "us-commercial-growth",
      "US Commercial Growth",
      metricValue(latest, "usCommercialGrowth"),
      undefined,
      "percent",
      "US commercial revenue growth is the clearest reported indicator of AIP commercial conversion.",
      "Actual",
    ),
    metric(
      "rule-of-40",
      "Rule of 40",
      metricValue(latest, "ruleOf40"),
      undefined,
      "percent",
      "Reported Rule of 40 combines YoY revenue growth and adjusted operating margin.",
      "Actual",
    ),
    metric(
      "sbc-as-revenue",
      "SBC / Revenue",
      metricValue(latest, "sbcAsPctRevenue"),
      undefined,
      "percent",
      "Stock-based compensation as a percent of revenue. This is central to the per-share debate.",
      "Derived",
    ),
  ];
}

export function buildPltrDashboardData(
  data: unknown,
  periodId = getDefaultPltrPeriod(),
  scenario: Scenario = "Base",
  overrides?: Partial<PltrValuationAssumptions>,
): PltrDashboardData {
  const dataset = resolvePltrDataset(data);
  const latestActual = activeActual(dataset, periodId);
  const baseAssumptions = valuationAssumptionsWithLatest(dataset, overrides);
  const scenarioAssumptions = buildPltrScenarioAssumptions(baseAssumptions, scenarioDefinition(scenario));
  const valuationEngine = calculatePltrValuationEngine(dataset.actuals, scenarioAssumptions);
  const scenarioOutputs = calculatePltrScenarioEngine(dataset.actuals, baseAssumptions, pltrScenarioDefinitions);
  const aip = calculateAipMonetizationEngine(dataset.actuals, dataset.researchSignals, dataset.topicTrends);
  const ontology = calculateOntologyMoatEngine();
  const cohorts = calculateCustomerCohortEngine(dataset.actuals);
  const ruleOf40 = calculateMarginLeverageEngine(dataset.actuals);
  const sbc = calculateSbcDilutionEngine(dataset.actuals);
  const transcript = calculateTranscriptThemeEngine(dataset.transcriptEvents, dataset.qaPairs, dataset.topicTrends);
  const q1DeepDive = buildPltrQ1DeepDive(dataset, valuationEngine.reverseDcf);
  const risks = buildPltrRiskRegister();

  const scenarioFairValues = scenarioOutputs
    .filter((item) => item.scenario !== "Hyper Bull")
    .map((item) => ({
      scenario: item.scenario,
      fairValue: item.fairValuePerShare,
      upsideDownside: computeUpsideDownside(item.fairValuePerShare, baseAssumptions.currentPrice),
      expectedReturn3Y: computeExpectedShareholderCagr(item.fairValuePerShare, baseAssumptions.currentPrice, 0),
      summary: item.summary,
    }));

  const warnings: ValidationWarning[] = [
    ...dataset.dataStatus.warnings,
    ...valuationEngine.warnings,
    ...aip.warnings,
    ...cohorts.warnings,
    ...transcript.warnings,
  ];

  return {
    latestActual,
    actuals: dataset.actuals,
    guidance: dataset.guidance,
    marketData: dataset.marketData,
    sources: dataset.sources,
    valuation: {
      methods: valuationEngine.methods,
      fairValues: scenarioFairValues,
      reverseDcf: valuationEngine.reverseDcf,
      selectedFairValue: valuationEngine.selectedFairValue,
      warnings,
    },
    scenarios: scenarioOutputs,
    aip,
    ontology,
    cohorts,
    ruleOf40,
    sbc,
    transcript,
    q1DeepDive,
    risks,
  };
}

export function calculatePltrValuation(
  data: unknown,
  assumptions?: Partial<PltrValuationAssumptions>,
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolvePltrDataset(data);
  const baseAssumptions = valuationAssumptionsWithLatest(dataset, assumptions);
  const scenarioAssumptions = buildPltrScenarioAssumptions(baseAssumptions, scenarioDefinition(scenario));
  const engine = calculatePltrValuationEngine(dataset.actuals, scenarioAssumptions);
  const scenarioOutputs = calculatePltrScenarioEngine(dataset.actuals, baseAssumptions, pltrScenarioDefinitions).filter(
    (item) => item.scenario !== "Hyper Bull",
  );
  const fairValues = scenarioOutputs.map((item) => ({
    scenario: item.scenario as Scenario,
    fairValue: item.fairValuePerShare,
    upsideDownside: computeUpsideDownside(item.fairValuePerShare, baseAssumptions.currentPrice),
    expectedReturn3Y: computeExpectedShareholderCagr(item.fairValuePerShare, baseAssumptions.currentPrice, 0),
    targetPrice3Y: item.fairValuePerShare,
    summary: item.summary,
  }));

  return {
    warning: "PLTR valuation is highly sensitive to growth, margin, SBC normalization, dilution, and terminal multiple. AIP and ontology scores are research-only.",
    currentPrice: baseAssumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: [...dataset.dataStatus.warnings, ...engine.warnings],
    fairValues,
    methodCards: engine.methods.map((method) => ({
      key: method.key,
      label: method.label,
      value: method.fairValue,
      format: "currency" as const,
      description: method.description,
    })),
    expectedReturnBridge: [
      {
        key: "revenue-cagr",
        label: "Revenue CAGR",
        value: scenarioAssumptions.revenueCagrYears1To5,
        format: "percent" as const,
        description: "Explicit five-year revenue CAGR assumption.",
      },
      {
        key: "fcf-margin",
        label: "FCF Margin",
        value: scenarioAssumptions.fcfMargin,
        format: "percent" as const,
        description: "Company-level FCF margin before per-share dilution check.",
      },
      {
        key: "dilution-rate",
        label: "Dilution Rate",
        value: scenarioAssumptions.dilutionRate,
        format: "percent" as const,
        description: "Annual diluted share-count growth assumption.",
      },
      {
        key: "terminal-multiple",
        label: "Terminal Multiple",
        value: scenarioAssumptions.terminalMultiple,
        format: "multiple" as const,
        description: "Exit FCF multiple used in long-term FCF per-share scenario value.",
      },
    ],
    customSummary: `Reverse DCF requires ${(engine.reverseDcf.requiredRevenueCagr * 100).toFixed(1)}% five-year revenue CAGR, ${(engine.reverseDcf.requiredFcfMargin * 100).toFixed(1)}% FCF margin, or ${engine.reverseDcf.requiredTerminalMultiple.toFixed(1)}x terminal FCF multiple to justify the current price under the selected assumptions.`,
    sensitivityTables: [
      {
        title: "DCF value by revenue CAGR and FCF margin",
        table: buildSensitivityTable(
          "Revenue CAGR",
          "FCF margin",
          [0.18, 0.24, 0.3, 0.36, 0.42],
          [0.28, 0.36, 0.44, 0.52, 0.6],
          (growth, margin) =>
            calculatePltrValuationEngine(dataset.actuals, {
              ...scenarioAssumptions,
              revenueCagrYears1To5: growth,
              fcfMargin: margin,
            }).selectedFairValue,
        ),
      },
    ],
    dcfValue: engine.methods.find((method) => method.key === "dcf")?.fairValue,
    fcfFairValue: engine.methods.find((method) => method.key === "ev-fcf")?.fairValue,
    recommendedFairValue: engine.selectedFairValue,
    recommendedFairValueMethod: "Equal-weight PLTR valuation triangulation",
    recommendedFairValueReason:
      "PLTR is valued through revenue multiple, EV/FCF, DCF, Rule-of-40 implied multiple, and long-term FCF per-share methods because the debate is multi-variable and valuation-led.",
    valuationRangeLow: fairValues.find((item) => item.scenario === "Bear")?.fairValue,
    valuationRangeBase: fairValues.find((item) => item.scenario === "Base")?.fairValue,
    valuationRangeHigh: fairValues.find((item) => item.scenario === "Bull")?.fairValue,
    blendedFairValue: engine.selectedFairValue,
    upsideDownside: computeUpsideDownside(engine.selectedFairValue, baseAssumptions.currentPrice),
  };
}
