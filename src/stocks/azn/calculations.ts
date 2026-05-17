import type {
  DataSourceType,
  DataStatus,
  Scenario,
  SummaryMetric,
  ValuationResult,
  ValidationWarning,
} from "../types";
import { computeUpsideDownside } from "../../utils/valuation";
import {
  aznScenarioPresets,
  defaultAznValuationAssumptions,
} from "./assumptions";
import { aznDataset } from "./data";
import type { AznDataset, AznValuationAssumptions } from "./types";
import { buildChinaExposureEngine } from "./engines/chinaExposureEngine";
import { buildCvrmEngine } from "./engines/cvrmEngine";
import { buildDrugDurabilityMatrix } from "./engines/drugDurabilityEngine";
import { buildAznEarningsCallIntelligence } from "./engines/earningsCallEngine";
import { buildEvidenceAudit } from "./engines/evidenceEngine";
import { buildFinancialQualityEngine } from "./engines/financialQualityEngine";
import { buildOncologyEngine } from "./engines/oncologyEngine";
import { buildPatentCliffMonitor } from "./engines/patentCliffEngine";
import { buildPipelineIntelligenceLab } from "./engines/pipelineEngine";
import { buildRareDiseaseEngine } from "./engines/rareDiseaseEngine";
import { buildRiskRadar } from "./engines/riskEngine";
import { buildTherapyAreaDashboard } from "./engines/therapyAreaEngine";
import { buildAznValuationEngine } from "./engines/valuationEngine";
import { safeRatio } from "./engines/helpers";

export { defaultAznValuationAssumptions, aznScenarioPresets };
export type { AznValuationAssumptions };

type AznRuntimeContext = {
  __aznResolvedPeriod?: string;
  __aznRequestedDataSourceType?: DataSourceType;
};

type AznDatasetInput = AznDataset & Partial<AznRuntimeContext>;

function metric(
  label: string,
  value: number,
  delta: number | undefined,
  format: SummaryMetric["format"],
  description: string,
  badge: SummaryMetric["badge"],
): SummaryMetric {
  return { key: label.toLowerCase().replace(/\s+/g, "-"), label, value, delta, format, description, badge };
}

function isAznDataset(value: unknown): value is AznDatasetInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      "periods" in value &&
      "reportedData" in value &&
      "pipelineData" in value &&
      "marketData" in value,
  );
}

function uniqueWarnings(warnings: ValidationWarning[]) {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    if (seen.has(warning.id)) return false;
    seen.add(warning.id);
    return true;
  });
}

export function resolveAznDataset(data: unknown): AznDatasetInput {
  return isAznDataset(data) ? data : aznDataset;
}

export function attachAznRuntimeContext(
  data: AznDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): AznDatasetInput {
  return {
    ...data,
    __aznResolvedPeriod: context.periodId,
    __aznRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultAznPeriod() {
  return aznDataset.currentPeriodId;
}

export function getAznPeriods() {
  return aznDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function resolveAznPeriodFromData(data: unknown, fallback = getDefaultAznPeriod()) {
  const dataset = resolveAznDataset(data);
  const runtimePeriod = dataset.__aznResolvedPeriod;
  if (runtimePeriod && dataset.periods.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.periods.some((period) => period.id === fallback) ? fallback : dataset.currentPeriodId;
}

export function resolveAznEffectiveDataSourceType(data: unknown): DataSourceType {
  const requested = resolveAznDataset(data).__aznRequestedDataSourceType;
  return requested === "manual" ? "manual" : "mock";
}

function mergeAssumptions(
  scenario: Scenario,
  overrides?: Partial<AznValuationAssumptions>,
): AznValuationAssumptions {
  return {
    ...aznScenarioPresets[scenario],
    ...(overrides ?? {}),
  };
}

export function validateAznData(data: AznDataset, periodId: string, warnings: ValidationWarning[] = []): ValidationWarning[] {
  const period = data.periods.find((row) => row.id === periodId) ?? data.periods[data.periods.length - 1];
  const therapyRows = data.reportedData.therapyAreas.filter((row) => row.periodId === periodId);
  const therapySum = therapyRows.reduce((sum, row) => sum + row.revenue, 0);
  const backendSource = "backendSource" in period
    ? (period as typeof period & { backendSource?: { disclosedRevenue?: number } }).backendSource
    : undefined;
  const revenueReconciliationAnchor = backendSource?.disclosedRevenue ?? period.totalRevenue;
  const validationWarnings: ValidationWarning[] = [...warnings];

  if (Math.abs(therapySum - revenueReconciliationAnchor) > 25) {
    validationWarnings.push({
      id: "azn-revenue-reconcile",
      title: "Therapy area revenue does not reconcile",
      detail: `Therapy area revenue sums to $${therapySum.toFixed(0)}m versus disclosed total revenue of $${revenueReconciliationAnchor.toFixed(0)}m.`,
      severity: "high",
    });
  }

  data.reportedData.drugRevenue.forEach((drug) => {
    const area = therapyRows.find((row) => row.therapyArea === drug.therapyArea);
    if (area && drug.currentRevenue > area.revenue) {
      validationWarnings.push({
        id: `azn-drug-over-segment-${drug.drugName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: "Drug revenue exceeds therapy area revenue",
        detail: `${drug.drugName} revenue exceeds ${drug.therapyArea} revenue.`,
        severity: "high",
      });
    }
  });

  if (data.marketData.londonPriceGbp !== data.marketData.londonPriceGbx / 100) {
    validationWarnings.push({
      id: "azn-gbx-gbp-conversion",
      title: "GBX to GBP conversion is wrong",
      detail: "London AZN is quoted in GBX; the module must divide by 100 before valuation.",
      severity: "high",
    });
  }

  if (data.pipelineData.some((asset) => !asset.researchOnlyEstimate)) {
    validationWarnings.push({
      id: "azn-pipeline-research-only-flag",
      title: "Pipeline rNPV estimate is not research-only",
      detail: "All pipeline peak-sales and probability assumptions must be marked as research-only scenario estimates.",
      severity: "high",
    });
  }

  data.patentRiskData.forEach((risk) => {
    const drug = data.reportedData.drugRevenue.find((row) => risk.product.includes(row.drugName) || row.drugName === risk.product);
    if (drug && risk.revenueAtRisk > drug.currentRevenue * 4 * 1.1) {
      validationWarnings.push({
        id: `azn-loe-risk-above-drug-${risk.product.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: "Patent cliff revenue at risk exceeds drug revenue",
        detail: `${risk.product} revenue at risk is higher than the annualized current revenue anchor.`,
        severity: "medium",
      });
    }
  });

  return uniqueWarnings(validationWarnings);
}

function buildThesisBoard(data: AznDataset, valuation: ReturnType<typeof buildAznValuationEngine>) {
  return {
    bullCase:
      "Oncology remains a durable compounding engine, Rare Disease keeps premium economics, and high-value readouts from camizestrant, tozorakimab, baxdrostat and complement assets bridge the Farxiga/Lynparza cliffs.",
    baseCase:
      `At £${valuation.blendedFairValueGbp.toFixed(1)} base fair value, the model underwrites AZN as a quality-growth pharma compounder but haircut Farxiga, Lynparza and legacy respiratory erosion.`,
    bearCase:
      "LOE erosion arrives faster than the pipeline can commercialise, China/VBP pressure stays elevated, ADC profit-share drags margins, and the market refuses to pay for unproven late-stage optionality.",
    keyDebate:
      "The central debate is whether pipeline rNPV and oncology durability are large enough to offset Farxiga and Lynparza patent risk without relying on heroic terminal multiples.",
    variantPerception:
      "The market may over-focus on headline P/E and under-separate protected oncology/rare-disease cash flows from mature CVRM and respiratory cliffs.",
    whatMarketMayBeMissing:
      `${data.pipelineData.length} tracked assets create a broad set of non-binary catalysts; not every readout must work if oncology, complement and CVRM replacement value diversifies the bridge.`,
  };
}

export function buildAznDashboardData(data: AznDataset, periodId: string, scenario: Scenario, overrides?: Partial<AznValuationAssumptions>) {
  const dataset = resolveAznDataset(data);
  const selectedPeriod = dataset.periods.find((period) => period.id === periodId) ?? dataset.periods[dataset.periods.length - 1];
  const assumptions = mergeAssumptions(scenario, overrides);
  const therapyAreaDashboard = buildTherapyAreaDashboard(dataset, selectedPeriod.id);
  const drugDurability = buildDrugDurabilityMatrix(dataset, selectedPeriod.id);
  const earningsCall = buildAznEarningsCallIntelligence(dataset);
  const patentCliff = buildPatentCliffMonitor(dataset);
  const pipeline = buildPipelineIntelligenceLab(dataset, assumptions);
  const oncology = buildOncologyEngine(dataset, pipeline.valuedAssets, scenario);
  const rareDisease = buildRareDiseaseEngine(dataset, pipeline.valuedAssets);
  const cvrm = buildCvrmEngine(dataset, pipeline.valuedAssets);
  const china = buildChinaExposureEngine(dataset);
  const financialQuality = buildFinancialQualityEngine(dataset, assumptions);
  const valuation = buildAznValuationEngine(dataset, assumptions, pipeline.valuedAssets);
  const risks = buildRiskRadar(dataset, pipeline.valuedAssets, valuation);
  const evidenceAudit = buildEvidenceAudit(dataset);
  const warnings = validateAznData(dataset, selectedPeriod.id, [
    ...therapyAreaDashboard.warnings,
    ...valuation.warnings,
  ]);

  const dataStatus: DataStatus = {
    sourceType: resolveAznEffectiveDataSourceType(dataset),
    lastUpdated: dataset.marketData.priceDate,
    missingFields: evidenceAudit.missingEvidenceIds,
    validationWarnings: warnings,
    valuationReliable: !warnings.some((warning) => warning.severity === "high"),
  };

  return {
    dataset,
    selectedPeriod,
    therapyAreaDashboard,
    drugDurability,
    earningsCall,
    patentCliff,
    pipeline,
    oncology,
    rareDisease,
    cvrm,
    china,
    financialQuality,
    valuation,
    risks,
    evidenceAudit,
    dataStatus,
    thesisBoard: buildThesisBoard(dataset, valuation),
    readThrough: [
      {
        title: "Oncology engine",
        signal: oncology.oncologyPipelineValue > 2_000 ? "Positive" : "Neutral",
        detail: `Oncology is ${(selectedPeriod.totalRevenue > 0 ? (oncology.currentOncologyRevenueBase / selectedPeriod.totalRevenue) * 100 : 0).toFixed(0)}% of Q1 revenue and has $${oncology.oncologyPipelineValue.toFixed(0)}m of probability-adjusted pipeline value in the model.`,
      },
      {
        title: "Patent cliff",
        signal: patentCliff.highRiskRevenue / Math.max(dataset.periods[0].totalRevenue, 1) > 0.2 ? "Needs Review" : "Neutral",
        detail: `High-risk LOE revenue at risk is $${patentCliff.highRiskRevenue.toFixed(0)}m, led by Farxiga, Lynparza, Soliris, Brilinta and Symbicort.`,
      },
      {
        title: "China exposure",
        signal: china.chinaGrowth < 0.03 ? "Needs Review" : "Neutral",
        detail: `China is ${(china.chinaPercentageOfTotal * 100).toFixed(0)}% of Q1 revenue with ${((china.chinaGrowth) * 100).toFixed(0)}% CER growth; policy risk is not just a footnote.`,
      },
    ],
  };
}

export function calculateAznSummary(data: AznDataset, periodId = getDefaultAznPeriod()): SummaryMetric[] {
  const dashboard = buildAznDashboardData(data, periodId, "Base");
  const currentPrice = dashboard.dataset.marketData.londonPriceGbp;
  return [
    metric("Current Price", currentPrice, undefined, "currency", "London AZN ordinary share price, normalized from GBX to GBP.", "Actual"),
    metric("Base Fair Value", dashboard.valuation.blendedFairValueGbp, dashboard.valuation.blendedFairValueGbp - currentPrice, "currency", "Blended DCF, SOTP, pipeline rNPV and peer multiple fair value.", "Derived"),
    metric("Upside / Downside", computeUpsideDownside(dashboard.valuation.blendedFairValueGbp, currentPrice), undefined, "percent", "Base fair value upside/downside versus London price.", "Derived"),
    metric("Dividend Yield", dashboard.dataset.marketData.dividendYield, undefined, "percent", "FY 2025 dividend over current US ordinary-share market snapshot.", "Actual"),
    metric("Oncology Mix", safeRatio(dashboard.oncology.currentOncologyRevenueBase, dashboard.selectedPeriod.totalRevenue), undefined, "percent", "Q1 2026 Oncology share of Total Revenue.", "Actual"),
    metric("Pipeline rNPV / Share", dashboard.valuation.pipelineFairValueGbp, undefined, "currency", "Probability-adjusted pipeline value per ordinary share; research-only estimate.", "Assumption"),
    metric("Patent Cliff Risk", safeRatio(dashboard.patentCliff.highRiskRevenue, dashboard.dataset.periods[0].totalRevenue), undefined, "percent", "High-risk LOE revenue at risk as a percent of FY 2025 Total Revenue.", "Derived"),
    metric("Risk Score", dashboard.risks.aggregateRiskScore, undefined, "number", "Aggregated risk radar score across patent, clinical, pricing, China, FX, M&A and competition.", "Derived"),
  ];
}

export function calculateAznValuation(
  data: AznDataset,
  periodId: string,
  scenario: Scenario,
  overrides?: Partial<AznValuationAssumptions>,
): ValuationResult {
  const dataset = resolveAznDataset(data);
  const cases = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const dashboard = buildAznDashboardData(dataset, periodId, caseName, caseName === scenario ? overrides : undefined);
    return { scenario: caseName, dashboard };
  });
  const selected = cases.find((item) => item.scenario === scenario)?.dashboard ?? cases[1].dashboard;
  const currentPrice = selected.dataset.marketData.londonPriceGbp;
  const validationWarnings = selected.dataStatus.validationWarnings;

  return {
    currentPrice,
    priceDate: selected.dataset.marketData.priceDate,
    warning: validationWarnings.some((warning) => warning.severity === "high")
      ? "AZN model validation found high-severity issues. Review source evidence, GBX/GBP conversion and research-only pipeline assumptions."
      : undefined,
    validationWarnings,
    fairValues: cases.map(({ scenario: caseName, dashboard }) => ({
      scenario: caseName,
      fairValue: dashboard.valuation.blendedFairValueGbp,
      upsideDownside: computeUpsideDownside(dashboard.valuation.blendedFairValueGbp, currentPrice),
      expectedReturn3Y: dashboard.valuation.impliedCagrReturn,
      targetPrice3Y: dashboard.valuation.blendedFairValueGbp * 1.08,
      cumulativeDividends: (selected.dataset.marketData.dividendPerShareUsd / selected.dataset.marketData.gbpUsd) * 3,
      summary: `${caseName} pharma scenario with explicit pipeline and patent-cliff assumptions`,
    })),
    methodCards: [
      { key: "azn-blended", label: "Blended Fair Value", value: selected.valuation.blendedFairValueGbp, format: "currency", description: "Weighted DCF, SOTP, pipeline rNPV and peer multiples." },
      { key: "azn-dcf", label: "DCF", value: selected.valuation.dcfFairValueGbp, format: "currency", description: "Unlevered core cash-flow DCF converted from USD to GBP per ordinary share." },
      { key: "azn-sotp", label: "Operating SOTP", value: selected.valuation.sotpFairValueGbp, format: "currency", description: "Therapy-area SOTP using Q1 annualized revenue, risk haircuts and net debt deduction." },
      { key: "azn-pipeline", label: "Pipeline rNPV", value: selected.valuation.pipelineFairValueGbp, format: "currency", description: "Probability-adjusted pipeline optionality. Research-only, not reported revenue." },
      { key: "azn-multiple", label: "Peer Multiple", value: selected.valuation.multiplesFairValueGbp, format: "currency", description: "Core EPS times quality-adjusted peer P/E." },
      { key: "azn-us-ordinary", label: "NYSE Ordinary Share FV", value: selected.valuation.nyseOrdinaryFairValueUsd, format: "currency", description: "US ordinary share fair value in USD after the 2026 harmonised listing." },
      { key: "azn-former-adr", label: "Former ADR Equivalent", value: selected.valuation.formerAdrFairValueUsd, format: "currency", description: "Historical 0.5 ordinary-share equivalent per former ADR, shown only for comparability." },
    ],
    expectedReturnBridge: [
      { key: "revenue-growth", label: "Revenue CAGR", value: mergeAssumptions(scenario, overrides).revenueCagr, format: "percent", description: "Modeled five-year revenue growth." },
      { key: "margin", label: "Core Margin", value: mergeAssumptions(scenario, overrides).operatingMargin, format: "percent", description: "Modeled core operating margin." },
      { key: "pipeline-share", label: "Pipeline rNPV / Share", value: selected.valuation.pipelineFairValueGbp, format: "currency", description: "Research-only pipeline value per share." },
      { key: "dividend", label: "Dividend Yield", value: selected.dataset.marketData.dividendYield, format: "percent", description: "Dividend component of total return." },
      { key: "implied-cagr", label: "Implied 3Y CAGR", value: selected.valuation.impliedCagrReturn, format: "percent", description: "3Y return with fair value fade-in and dividends." },
    ],
    sensitivityTables: selected.valuation.sensitivityTables,
    dcfValue: selected.valuation.dcfFairValueGbp,
    sotpFairValue: selected.valuation.sotpFairValueGbp,
    strategicOptionalityPerShare: selected.valuation.pipelineFairValueGbp,
    blendedFairValue: selected.valuation.blendedFairValueGbp,
    recommendedFairValue: selected.valuation.blendedFairValueGbp,
    recommendedFairValueMethod: "DCF / SOTP / pipeline rNPV / peer multiple triangulation",
    recommendedFairValueReason: "AZN requires a pharma-specific blend because current earnings, patent cliffs and pipeline optionality answer different questions.",
    valuationRangeLow: cases[0].dashboard.valuation.blendedFairValueGbp,
    valuationRangeBase: cases[1].dashboard.valuation.blendedFairValueGbp,
    valuationRangeHigh: cases[2].dashboard.valuation.blendedFairValueGbp,
    targetPrice3Y: selected.valuation.blendedFairValueGbp * 1.08,
    expectedReturn3Y: selected.valuation.impliedCagrReturn,
    upsideDownside: computeUpsideDownside(selected.valuation.blendedFairValueGbp, currentPrice),
    dataQualityScore: Math.round(selected.evidenceAudit.averageConfidence * 100),
    integrityScore: selected.dataStatus.valuationReliable ? 86 : 65,
  };
}
