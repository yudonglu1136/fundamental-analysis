import type { DataSourceType, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import {
  defaultIsrgValuationAssumptions,
  isrgScenarioDefinitions,
  isrgScenarioPresets,
} from "./assumptions";
import { isrgData } from "./data";
import type { IsrgDataLayer, IsrgValuationAssumptions } from "./model";
import { calculateCompetitionRiskEngine } from "./competitionRiskEngine";
import { calculateDaVinci5Engine } from "./daVinci5Engine";
import { calculateHospitalCapexEngine } from "./hospitalCapexEngine";
import { calculateInstalledBaseEngine } from "./installedBaseEngine";
import { calculateInternationalExpansionEngine } from "./internationalExpansionEngine";
import { calculateIonEngine } from "./ionEngine";
import { calculateMarginRiskEngine } from "./marginRiskEngine";
import { calculateMoatEngine } from "./moatEngine";
import { calculateProcedureEngine } from "./procedureEngine";
import { calculateRecurringRevenueEngine } from "./recurringRevenueEngine";
import { calculateRegulatorySafetyEngine } from "./regulatorySafetyEngine";
import { calculateRiskRedTeamEngine } from "./riskRedTeamEngine";
import { calculateIsrgScenarioEngine, buildIsrgScenarioAssumptions } from "./scenarioEngine";
import { calculateSpEngine } from "./spEngine";
import { calculateTranscriptEngine } from "./transcriptEngine";
import { calculateIsrgValuationEngine } from "./valuationEngine";
import { latestActual, latestFullYear, metricValue, safeDivide } from "./utils";

type IsrgRuntimeContext = {
  __isrgResolvedPeriod?: string;
  __isrgRequestedDataSourceType?: DataSourceType;
};

type IsrgDatasetInput = IsrgDataLayer & Partial<IsrgRuntimeContext>;

function isIsrgDataset(value: unknown): value is IsrgDatasetInput {
  return Boolean(value && typeof value === "object" && "actualData" in value && "officialGuidance" in value && "marketData" in value);
}

export function resolveIsrgDataset(data: unknown): IsrgDatasetInput {
  return isIsrgDataset(data) ? data : isrgData;
}

export function attachIsrgRuntimeContext(
  data: IsrgDataLayer,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): IsrgDatasetInput {
  return {
    ...data,
    __isrgResolvedPeriod: context.periodId,
    __isrgRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultIsrgPeriod(data: IsrgDataLayer = isrgData) {
  return data.actualData[data.actualData.length - 1]?.periodId ?? "";
}

export function getIsrgPeriods(data: IsrgDataLayer = isrgData) {
  return data.actualData.map((period) => ({ value: period.periodId, label: period.label }));
}

export function resolveIsrgPeriodFromData(data: unknown, fallback = getDefaultIsrgPeriod()) {
  const dataset = resolveIsrgDataset(data);
  const runtimePeriod = dataset.__isrgResolvedPeriod;
  if (runtimePeriod && dataset.actualData.some((period) => period.periodId === runtimePeriod)) return runtimePeriod;
  return dataset.actualData.some((period) => period.periodId === fallback) ? fallback : getDefaultIsrgPeriod(dataset);
}

export function resolveIsrgEffectiveDataSourceType(data: unknown): DataSourceType {
  const dataset = resolveIsrgDataset(data);
  return dataset.__isrgRequestedDataSourceType === "manual" ? "manual" : "mock";
}

export { defaultIsrgValuationAssumptions, isrgScenarioPresets };
export type IsrgDefaultAssumptions = typeof defaultIsrgValuationAssumptions;

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

function selectedAssumptions(
  scenario: Scenario,
  overrides?: Partial<IsrgValuationAssumptions>,
): IsrgValuationAssumptions {
  return {
    ...isrgScenarioPresets[scenario],
    ...(overrides ?? {}),
  };
}

export function calculateIsrgSummary(data: unknown): SummaryMetric[] {
  const dataset = resolveIsrgDataset(data);
  const latest = latestActual(dataset);
  const fy = latestFullYear(dataset);
  const procedureGrowth =
    metricValue(latest.procedures.worldwideDaVinciProcedureGrowth) || metricValue(fy.procedures.worldwideDaVinciProcedureGrowth);
  const recurringMix = safeDivide(
    metricValue(latest.revenue.instrumentsAccessories) + metricValue(latest.revenue.services),
    metricValue(latest.revenue.total),
  );
  const dv5Share = safeDivide(metricValue(latest.placements.daVinci5Placements), metricValue(latest.placements.daVinciPlacements));
  const leaseMix = safeDivide(metricValue(latest.placements.operatingLeasePlacements), metricValue(latest.placements.daVinciPlacements));
  return [
    metric(
      "procedure-growth",
      "Procedure Growth",
      procedureGrowth,
      undefined,
      "percent",
      "Latest official worldwide da Vinci procedure growth; procedure growth is ISRG's primary demand signal.",
      "Actual",
    ),
    metric(
      "recurring-revenue-mix",
      "Recurring Mix",
      recurringMix,
      undefined,
      "percent",
      "I&A plus service revenue as a percent of total revenue.",
      "Derived",
    ),
    metric(
      "dv5-placement-share",
      "da Vinci 5 Share",
      dv5Share,
      undefined,
      "percent",
      "da Vinci 5 placements as a percent of total da Vinci placements.",
      "Actual",
    ),
    metric(
      "lease-mix",
      "Operating Lease Mix",
      leaseMix,
      undefined,
      "percent",
      "Operating lease placements as a percent of da Vinci placements; higher mix can shift system revenue timing.",
      "Actual",
    ),
  ];
}

function aggregateWarnings(...groups: ValidationWarning[][]) {
  const seen = new Set<string>();
  return groups.flat().filter((warning) => {
    if (seen.has(warning.id)) return false;
    seen.add(warning.id);
    return true;
  });
}

export function buildIsrgDashboardData(
  data: unknown,
  _periodId = getDefaultIsrgPeriod(),
  scenario: Scenario = "Base",
  overrides?: Partial<IsrgValuationAssumptions>,
) {
  const dataset = resolveIsrgDataset(data);
  const assumptions = selectedAssumptions(scenario, overrides);
  const procedureEngine = calculateProcedureEngine(dataset);
  const installedBaseEngine = calculateInstalledBaseEngine(dataset);
  const recurringRevenueEngine = calculateRecurringRevenueEngine(dataset);
  const daVinci5Engine = calculateDaVinci5Engine(dataset);
  const ionEngine = calculateIonEngine(dataset, assumptions);
  const spEngine = calculateSpEngine(dataset, assumptions);
  const internationalEngine = calculateInternationalExpansionEngine(dataset);
  const hospitalCapexEngine = calculateHospitalCapexEngine(dataset);
  const regulatorySafetyEngine = calculateRegulatorySafetyEngine(dataset);
  const competitionRiskEngine = calculateCompetitionRiskEngine(dataset);
  const marginRiskEngine = calculateMarginRiskEngine(dataset, assumptions);
  const moatEngine = calculateMoatEngine(dataset);
  const riskRedTeam = calculateRiskRedTeamEngine(dataset, assumptions);
  const transcript = calculateTranscriptEngine(dataset);
  const valuation = calculateIsrgValuationEngine(dataset, assumptions);
  const scenarios = calculateIsrgScenarioEngine(dataset, { ...defaultIsrgValuationAssumptions, ...(overrides ?? {}) });
  const valuationWarnings = aggregateWarnings(
    dataset.dataStatus.warnings,
    procedureEngine.warnings,
    installedBaseEngine.warnings,
    recurringRevenueEngine.warnings,
    valuation.warnings,
  );

  return {
    latestActual: latestActual(dataset),
    latestFullYear: latestFullYear(dataset),
    actualData: dataset.actualData,
    officialGuidance: dataset.officialGuidance,
    marketData: dataset.marketData,
    sources: dataset.sources,
    dataStatus: dataset.dataStatus,
    procedureEngine,
    installedBaseEngine,
    recurringRevenueEngine,
    daVinci5Engine,
    ionEngine,
    spEngine,
    internationalEngine,
    hospitalCapexEngine,
    regulatorySafetyEngine,
    competitionRiskEngine,
    marginRiskEngine,
    moatEngine,
    riskRedTeam,
    transcript,
    valuation,
    scenarios,
    valuationWarnings,
  };
}

export function calculateIsrgValuation(
  data: unknown,
  assumptions?: Partial<IsrgValuationAssumptions>,
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolveIsrgDataset(data);
  const baseAssumptions = {
    ...defaultIsrgValuationAssumptions,
    ...(assumptions ?? {}),
  };
  const scenarioDefinition = isrgScenarioDefinitions.find((definition) => definition.name === scenario) ?? isrgScenarioDefinitions[1];
  const selected = buildIsrgScenarioAssumptions(baseAssumptions, scenarioDefinition);
  const engine = calculateIsrgValuationEngine(dataset, selected);
  const scenarioOutputs = calculateIsrgScenarioEngine(dataset, baseAssumptions);
  const fairValues = scenarioOutputs.map((item) => ({
    scenario: item.scenario,
    fairValue: item.fairValue,
    upsideDownside: computeUpsideDownside(item.fairValue, baseAssumptions.currentPrice),
    expectedReturn3Y: computeExpectedShareholderCagr(item.fairValue, baseAssumptions.currentPrice, 0),
    targetPrice3Y: item.fairValue,
    summary: item.summary,
  }));

  return {
    warning:
      "ISRG valuation is driven by procedure growth, installed-base utilization, recurring I&A revenue, da Vinci 5 replacement/adoption, margin durability, and probability-weighted Ion/SP optionality. Transcript/product narratives are research-only unless mapped to assumptions.",
    currentPrice: baseAssumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: aggregateWarnings(dataset.dataStatus.warnings, engine.warnings),
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
        key: "procedure-cagr",
        label: "Procedure CAGR",
        value: selected.procedureCagr,
        format: "percent" as const,
        description: "Core da Vinci procedure growth assumption.",
      },
      {
        key: "installed-base-cagr",
        label: "Installed Base CAGR",
        value: selected.installedBaseCagr,
        format: "percent" as const,
        description: "Installed-base growth assumption.",
      },
      {
        key: "utilization-growth",
        label: "Utilization Growth",
        value: selected.utilizationGrowth,
        format: "percent" as const,
        description: "Procedures per system growth assumption.",
      },
      {
        key: "fcf-margin",
        label: "FCF Margin",
        value: selected.fcfMargin,
        format: "percent" as const,
        description: "Free cash flow margin before explicit risk drags.",
      },
      {
        key: "optionality-per-share",
        label: "Ion/SP Optionality",
        value: engine.segmentValuation.optionality.valuePerShare,
        format: "currency" as const,
        description: "Haircut, probability-weighted Ion/SP optionality value per share.",
      },
    ],
    customSummary: `Reverse DCF requires ${(engine.reverseDcf.requiredProcedureCagr * 100).toFixed(1)}% procedure CAGR, ${(engine.reverseDcf.requiredUtilizationGrowth * 100).toFixed(1)}% utilization growth, or ${(engine.reverseDcf.requiredOperatingMargin * 100).toFixed(1)}% FCF margin to justify the current price in the procedure DCF leg.`,
    sensitivityTables: [
      {
        title: "Fair value by procedure CAGR and FCF margin",
        table: buildSensitivityTable(
          "Procedure CAGR",
          "FCF margin",
          [0.08, 0.105, 0.13, 0.155, 0.18],
          [0.22, 0.25, 0.28, 0.31, 0.34],
          (procedureCagr, fcfMargin) =>
            calculateIsrgValuationEngine(dataset, { ...selected, procedureCagr, fcfMargin }).selectedFairValue,
        ),
      },
      {
        title: "Fair value by utilization growth and da Vinci 5 uplift",
        table: buildSensitivityTable(
          "Utilization growth",
          "DV5 uplift",
          [-0.005, 0.01, 0.025, 0.04, 0.055],
          [0, 0.025, 0.05, 0.075, 0.1],
          (utilizationGrowth, daVinci5ReplacementCycleUplift) =>
            calculateIsrgValuationEngine(dataset, { ...selected, utilizationGrowth, daVinci5ReplacementCycleUplift }).selectedFairValue,
        ),
      },
      {
        title: "Fair value by Ion probability and tariff drag",
        table: buildSensitivityTable(
          "Ion probability",
          "Tariff drag",
          [0.1, 0.25, 0.4, 0.55, 0.7],
          [0, 0.005, 0.01, 0.02, 0.03],
          (ionProbability, tariffGrossMarginDrag) =>
            calculateIsrgValuationEngine(dataset, { ...selected, ionProbability, tariffGrossMarginDrag }).selectedFairValue,
        ),
      },
    ],
    recommendedFairValue: engine.recommendedFairValue,
    recommendedFairValueMethod: "Procedure DCF / Segment / Multiple triangulation",
    recommendedFairValueReason:
      "Primary value is the procedure-based DCF blended with segment quality valuation; P/E and FCF yield are sanity checks, not the core model.",
    valuationRangeLow: Math.min(...fairValues.map((item) => item.fairValue)),
    valuationRangeBase: fairValues.find((item) => item.scenario === "Base")?.fairValue ?? engine.selectedFairValue,
    valuationRangeHigh: Math.max(...fairValues.map((item) => item.fairValue)),
    blendedFairValue: engine.selectedFairValue,
    probabilityWeightedFairValue:
      fairValues.find((item) => item.scenario === "Bear")!.fairValue * 0.25 +
      fairValues.find((item) => item.scenario === "Base")!.fairValue * 0.5 +
      fairValues.find((item) => item.scenario === "Bull")!.fairValue * 0.25,
    expectedReturn3Y: fairValues.find((item) => item.scenario === scenario)?.expectedReturn3Y,
    upsideDownside: computeUpsideDownside(engine.selectedFairValue, baseAssumptions.currentPrice),
    dataQualityScore: dataset.dataStatus.warnings.some((warning) => warning.severity === "high") ? 70 : 82,
    recommendedValuationConfidence: dataset.dataStatus.warnings.length > 0 ? 72 : 84,
  };
}
