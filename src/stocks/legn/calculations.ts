import type { DataSourceType, DataStatus, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { computeUpsideDownside } from "../../utils/valuation";
import { defaultLegnValuationAssumptions, legnScenarioPresets } from "./assumptions";
import { legnDataset } from "./data";
import type { LegnDataset, LegnValuationAssumptions } from "./types";
import { buildCarvyktiCommercialEngine } from "./engines/carvyktiCommercialEngine";
import { buildClinicalEvidenceEngine } from "./engines/clinicalEvidenceEngine";
import { buildCollaborationEconomicsEngine } from "./engines/collaborationEconomicsEngine";
import { buildEarningsCallTrendEngine } from "./engines/earningsCallTrendEngine";
import { buildLabelExpansionEngine } from "./engines/labelExpansionEngine";
import { buildManufacturingCapacityEngine } from "./engines/manufacturingCapacityEngine";
import { buildPipelineRnpvEngine } from "./engines/pipelineRnpvEngine";
import { buildPlatformOptionEngine } from "./engines/platformOptionEngine";
import { buildLegnRiskEngine } from "./engines/riskEngine";
import { buildSolidTumorCartEngine } from "./engines/solidTumorCartEngine";
import { buildLegnValuationEngine } from "./engines/valuationEngine";
import { safeRatio } from "./engines/helpers";

export { defaultLegnValuationAssumptions, legnScenarioPresets };
export type { LegnValuationAssumptions };

type LegnRuntimeContext = {
  __legnResolvedPeriod?: string;
  __legnRequestedDataSourceType?: DataSourceType;
};

type LegnDatasetInput = LegnDataset & Partial<LegnRuntimeContext>;

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

function isLegnDataset(value: unknown): value is LegnDatasetInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      "reportedPeriods" in value &&
      "carvyktiQuarters" in value &&
      "pipelineAssets" in value &&
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

export function resolveLegnDataset(data: unknown): LegnDatasetInput {
  return isLegnDataset(data) ? data : legnDataset;
}

export function attachLegnRuntimeContext(
  data: LegnDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): LegnDatasetInput {
  return {
    ...data,
    __legnResolvedPeriod: context.periodId,
    __legnRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultLegnPeriod() {
  return legnDataset.currentPeriodId;
}

export function getLegnPeriods() {
  return legnDataset.reportedPeriods.map((period) => ({ value: period.id, label: period.label }));
}

export function resolveLegnPeriodFromData(data: unknown, fallback = getDefaultLegnPeriod()) {
  const dataset = resolveLegnDataset(data);
  const runtimePeriod = dataset.__legnResolvedPeriod;
  if (runtimePeriod && dataset.reportedPeriods.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.reportedPeriods.some((period) => period.id === fallback) ? fallback : dataset.currentPeriodId;
}

export function resolveLegnEffectiveDataSourceType(data: unknown): DataSourceType {
  const requested = resolveLegnDataset(data).__legnRequestedDataSourceType;
  return requested === "manual" ? "manual" : "mock";
}

function mergeAssumptions(scenario: Scenario, overrides?: Partial<LegnValuationAssumptions>): LegnValuationAssumptions {
  return {
    ...legnScenarioPresets[scenario],
    ...(overrides ?? {}),
  };
}

function applyLegnOverrides(data: LegnDataset, scenario: Scenario, overrides?: Partial<LegnValuationAssumptions>): LegnDataset {
  if (!overrides) return data;
  const merged = mergeAssumptions(scenario, overrides);
  const marketCapUsdM = merged.currentPrice * data.marketData.adsOutstandingM;
  const marketData = {
    ...data.marketData,
    currentPrice: merged.currentPrice,
    marketCapUsdM,
    enterpriseValueUsdM: marketCapUsdM - data.marketData.netCashAfterFundingUsdM,
  };
  const commercialScenarios = {
    ...data.assumptions.commercialScenarios,
    [scenario]: {
      ...data.assumptions.commercialScenarios[scenario],
      approvedPeakNts: merged.approvedPeakNts,
    },
  };
  const pipelineAssets = data.pipelineAssets.map((asset) =>
    asset.assetName.startsWith("CARTITUDE")
      ? {
          ...asset,
          probabilityOfSuccess: Math.min(0.95, asset.probabilityOfSuccess * merged.labelExpansionProbabilityScalar),
        }
      : asset,
  );
  const researchAssumptions = data.assumptions.researchAssumptions.map((item) =>
    item.id === "bear-equity-raise" ? { ...item, value: merged.bearDilutionUsdM } : item,
  );
  return {
    ...data,
    marketData,
    pipelineAssets,
    collaborationEconomicsBridge: {
      ...data.collaborationEconomicsBridge,
      ntsToCollaborationRevenueRatio: merged.ntsToLegendRevenueRatio,
    },
    assumptions: {
      ...data.assumptions,
      commercialScenarios,
      researchAssumptions,
    },
  };
}

export function validateLegnData(data: LegnDataset, warnings: ValidationWarning[] = []): ValidationWarning[] {
  const validationWarnings: ValidationWarning[] = [...warnings];
  const fy = data.reportedPeriods.find((period) => period.id === "fy2025");
  const q1Prelim = data.carvyktiQuarters.find((period) => period.id === "q1-2026");

  if (fy && Math.abs(fy.totalRevenue - 1_028.9) > 0.05) {
    validationWarnings.push({
      id: "legn-fy2025-revenue-mismatch",
      title: "FY 2025 reported revenue mismatch",
      detail: `Expected $1,028.9m but found $${fy.totalRevenue.toFixed(1)}m.`,
      severity: "high",
    });
  }
  if (fy && Math.abs(fy.collaborationRevenue - 944.8) > 0.05) {
    validationWarnings.push({
      id: "legn-fy2025-collaboration-revenue-mismatch",
      title: "FY 2025 collaboration revenue mismatch",
      detail: `Expected $944.8m but found $${fy.collaborationRevenue.toFixed(1)}m.`,
      severity: "high",
    });
  }
  if (q1Prelim && (!q1Prelim.preliminary || !q1Prelim.unverified || q1Prelim.isLegendReportedRevenue !== false)) {
    validationWarnings.push({
      id: "legn-q1-2026-preliminary-flag",
      title: "Q1 2026 preliminary NTS flag is wrong",
      detail: "Q1 2026 $597m must remain preliminary/unverified and separate from reported Legend revenue.",
      severity: "high",
    });
  }
  if (data.pipelineAssets.some((asset) => !asset.researchOnly)) {
    validationWarnings.push({
      id: "legn-pipeline-assumptions-not-research-only",
      title: "Pipeline rNPV assumptions must be research-only",
      detail: "Every pipeline peak sales, POS and discount-rate assumption must be marked research-only.",
      severity: "high",
    });
  }
  const evidenceIds = new Set(data.evidence.map((item) => item.id));
  const requiredEvidenceIds = [
    ...data.reportedPeriods.flatMap((period) => period.sourceEvidenceIds),
    ...data.carvyktiQuarters.flatMap((period) => period.sourceEvidenceIds),
    ...data.earningsCalls.flatMap((call) => call.sourceEvidenceIds),
    ...data.pipelineAssets.flatMap((asset) => asset.sourceEvidenceIds),
    ...data.clinicalTrials.flatMap((trial) => trial.sourceEvidenceIds),
  ];
  const missingEvidence = Array.from(new Set(requiredEvidenceIds.filter((id) => !evidenceIds.has(id))));
  if (missingEvidence.length > 0) {
    validationWarnings.push({
      id: "legn-missing-evidence-records",
      title: "Missing evidence records",
      detail: missingEvidence.join(", "),
      severity: "high",
    });
  }
  if (Math.abs(data.marketData.adsOutstandingM * 2 - data.marketData.ordinarySharesOutstandingM) > 0.001) {
    validationWarnings.push({
      id: "legn-ads-share-unit",
      title: "ADS / ordinary share unit mismatch",
      detail: "LEGN ADS count must equal ordinary share count divided by two.",
      severity: "high",
    });
  }
  return uniqueWarnings(validationWarnings);
}

export function buildLegnDashboardData(
  data: LegnDataset,
  periodId: string,
  scenario: Scenario,
  overrides?: Partial<LegnValuationAssumptions>,
) {
  const dataset = applyLegnOverrides(resolveLegnDataset(data), scenario, overrides);
  const selectedPeriod = dataset.reportedPeriods.find((period) => period.id === periodId) ?? dataset.reportedPeriods[0];
  const commercial = buildCarvyktiCommercialEngine(dataset, scenario);
  const manufacturing = buildManufacturingCapacityEngine(dataset, scenario);
  const collaboration = buildCollaborationEconomicsEngine(dataset, commercial, scenario);
  const labelExpansion = buildLabelExpansionEngine(dataset, scenario);
  const clinical = buildClinicalEvidenceEngine(dataset);
  const earningsCallTrend = buildEarningsCallTrendEngine(dataset);
  const solidTumor = buildSolidTumorCartEngine(dataset, scenario);
  const pipelineRnpv = buildPipelineRnpvEngine(dataset);
  const rawPlatformOption = buildPlatformOptionEngine(dataset, scenario);
  const platformScalar = mergeAssumptions(scenario, overrides).platformOptionScalar;
  const platformOption = {
    ...rawPlatformOption,
    probabilityWeightedOptionValue: rawPlatformOption.probabilityWeightedOptionValue * platformScalar,
  };
  const risks = buildLegnRiskEngine(dataset);
  const valuation = buildLegnValuationEngine(
    dataset,
    commercial,
    collaboration,
    labelExpansion,
    pipelineRnpv,
    platformOption,
    scenario,
    mergeAssumptions(scenario, overrides),
  );
  const validationWarnings = validateLegnData(dataset, [
    ...valuation.warnings,
    ...(labelExpansion.doubleCountGuardrail.warning
      ? [
          {
            id: "legn-label-expansion-double-count-guardrail",
            title: "Label expansion double-count guardrail",
            detail: labelExpansion.doubleCountGuardrail.warning,
            severity: "high" as const,
          },
        ]
      : []),
  ]);
  const evidenceCoverageRatio =
    dataset.evidence.filter((item) => item.usedInModel).length / Math.max(dataset.evidence.length, 1);

  const dataStatus: DataStatus = {
    sourceType: resolveLegnEffectiveDataSourceType(dataset),
    lastUpdated: dataset.marketData.priceDate,
    missingFields: evidenceCoverageRatio < 0.9 ? ["Evidence coverage below 90%"] : [],
    validationWarnings,
    valuationReliable: !validationWarnings.some((warning) => warning.severity === "high"),
  };

  return {
    dataset,
    selectedPeriod,
    scenario,
    commercial,
    collaboration,
    manufacturing,
    labelExpansion,
    clinical,
    earningsCallTrend,
    solidTumor,
    pipelineRnpv,
    platformOption,
    risks,
    valuation,
    dataStatus,
    thesis: {
      onePage:
        "LEGN is primarily a CARVYKTI execution story: the equity works if 2L-4L demand, manufacturing throughput and J&J collaboration economics convert a roughly $1.9bn 2025 NTS base into a $5bn+ peak-sales asset, while frontline and solid tumor programs remain separate options.",
      topDrivers: [
        "CARVYKTI gross NTS ramp and site productivity",
        "Janssen collaboration revenue/profit bridge and advance recoupment",
        "Manufacturing success, release timing and capacity additions",
        "CARTITUDE-5/6/10 frontline label-expansion probability",
        "Solid tumor and platform option value staying disciplined",
      ],
      keyRisks: risks.risks.slice(0, 5).map((risk) => risk.title),
      nextCatalysts: clinical.readoutCatalystTimeline.map((item) => `${item.date}: ${item.catalyst}`),
    },
  };
}

export function calculateLegnSummary(data: LegnDataset, periodId = getDefaultLegnPeriod()): SummaryMetric[] {
  const dashboard = buildLegnDashboardData(data, periodId, "Base");
  const fyNts = data.carvyktiQuarters
    .filter((quarter) => quarter.periodEnd.startsWith("2025"))
    .reduce((sum, quarter) => sum + quarter.globalNetTradeSales, 0);
  return [
    metric("Current Price", dashboard.dataset.marketData.currentPrice, undefined, "currency", "NASDAQ ADS market snapshot.", "Actual"),
    metric("Base Fair Value", dashboard.valuation.fairValuePerAds, dashboard.valuation.fairValuePerAds - dashboard.dataset.marketData.currentPrice, "currency", "Stage-gated biotech NAV per ADS.", "Derived"),
    metric("Upside / Downside", dashboard.valuation.marginOfSafety, undefined, "percent", "Base fair value versus current ADS price.", "Derived"),
    metric("2025 CARVYKTI NTS", fyNts, undefined, "currency", "Gross CARVYKTI net trade sales, not Legend reported revenue.", "Actual"),
    metric("Peak NTS", dashboard.commercial.peakNts, undefined, "currency", "Approved-label CARVYKTI peak NTS in the selected scenario.", "Assumption"),
    metric("NTS to Legend Rev.", dashboard.dataset.collaborationEconomicsBridge.ntsToCollaborationRevenueRatio, undefined, "percent", "FY 2025 collaboration revenue divided by CARVYKTI NTS.", "Derived"),
    metric("Clinical Score", dashboard.clinical.clinicalEvidenceScore, undefined, "number", "CARVYKTI clinical moat score after safety penalty.", "Derived"),
    metric("Capacity Utilization", safeRatio(dashboard.commercial.annualForecast[0]?.estimatedPatientsTreated ?? 0, dashboard.manufacturing.annualRows[0]?.annualDoseCapacity ?? 1), undefined, "percent", "2026 modeled dose demand versus available capacity.", "Derived"),
  ];
}

export function calculateLegnValuation(
  data: LegnDataset,
  periodId: string,
  scenario: Scenario,
  overrides?: Partial<LegnValuationAssumptions>,
): ValuationResult {
  const dataset = resolveLegnDataset(data);
  const cases = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const dashboard = buildLegnDashboardData(dataset, periodId, caseName, caseName === scenario ? overrides : undefined);
    return { scenario: caseName, dashboard };
  });
  const selected = cases.find((item) => item.scenario === scenario)?.dashboard ?? cases[1].dashboard;
  const currentPrice = selected.dataset.marketData.currentPrice;

  return {
    currentPrice,
    priceDate: selected.dataset.marketData.priceDate,
    warning: selected.dataStatus.validationWarnings.some((warning) => warning.severity === "high")
      ? "LEGN validation found high-severity issues. Review evidence, ADS units, preliminary NTS flags and double-count guardrails."
      : undefined,
    validationWarnings: selected.dataStatus.validationWarnings,
    fairValues: cases.map(({ scenario: caseName, dashboard }) => ({
      scenario: caseName,
      fairValue: dashboard.valuation.fairValuePerAds,
      upsideDownside: computeUpsideDownside(dashboard.valuation.fairValuePerAds, currentPrice),
      expectedReturn3Y: currentPrice > 0 ? (dashboard.valuation.fairValuePerAds / currentPrice) ** (1 / 3) - 1 : 0,
      targetPrice3Y: dashboard.valuation.fairValuePerAds,
      cumulativeDividends: 0,
      summary: `${caseName} LEGN biotech NAV: CARVYKTI core + label expansion + pipeline + platform option`,
    })),
    methodCards: [
      {
        key: "legn-fv",
        label: "Fair Value / ADS",
        value: selected.valuation.fairValuePerAds,
        format: "currency",
        description: "Stage-gated biotech NAV. No perpetuity model.",
      },
      {
        key: "legn-core-carvykti",
        label: "Core CARVYKTI NAV",
        value: selected.valuation.coreCarvyktiNavPerAds,
        format: "currency",
        description: "Approved-label CARVYKTI NAV after collaboration economics and recoupment.",
      },
      {
        key: "legn-label-expansion",
        label: "Label Expansion NAV",
        value: selected.valuation.labelExpansionNavPerAds,
        format: "currency",
        description: "CARTITUDE-5/6/10 value kept separate to avoid double counting.",
      },
      {
        key: "legn-pipeline-rnpv",
        label: "Pipeline rNPV",
        value: selected.valuation.pipelineRnpvPerAds,
        format: "currency",
        description: "Asset-level rNPV for LB1908, LB2102, LUCAR and other options.",
      },
      {
        key: "legn-platform-option",
        label: "Platform Option",
        value: selected.valuation.platformOptionValuePerAds,
        format: "currency",
        description: "Speculative in vivo/allogeneic/autoimmune option value.",
      },
      {
        key: "legn-net-cash",
        label: "Net Cash / Funding Adj.",
        value: selected.valuation.netCashFundingAdjustmentPerAds,
        format: "currency",
        description: "Cash plus time deposits minus Janssen funding advance.",
      },
    ],
    expectedReturnBridge: [
      { key: "peak-nts", label: "Peak NTS", value: selected.valuation.peakCarvyktiNts, format: "currency", description: "Approved-label peak CARVYKTI net trade sales." },
      { key: "collab-ratio", label: "NTS to LEGN Revenue", value: selected.dataset.collaborationEconomicsBridge.ntsToCollaborationRevenueRatio, format: "percent", description: "Reported collaboration revenue bridge." },
      { key: "risk-score", label: "Risk Score", value: selected.risks.aggregateRiskScore, format: "number", description: "Probability x severity risk heatmap." },
      { key: "mos", label: "Margin of Safety", value: selected.valuation.marginOfSafety, format: "percent", description: "Fair value versus current ADS price." },
    ],
    sensitivityTables: [{ title: "CARVYKTI Peak NTS x Discount Rate", table: selected.valuation.sensitivityHeatmap }],
    blendedFairValue: selected.valuation.fairValuePerAds,
    recommendedFairValue: selected.valuation.fairValuePerAds,
    recommendedFairValueMethod: "LEGN stage-gated biotech NAV",
    recommendedFairValueReason: "CARVYKTI commercialization and label expansion dominate value; solid tumor and platform programs remain high-discount options.",
    valuationRangeLow: cases[0].dashboard.valuation.fairValuePerAds,
    valuationRangeBase: cases[1].dashboard.valuation.fairValuePerAds,
    valuationRangeHigh: cases[2].dashboard.valuation.fairValuePerAds,
    targetPrice3Y: selected.valuation.fairValuePerAds,
    expectedReturn3Y: currentPrice > 0 ? (selected.valuation.fairValuePerAds / currentPrice) ** (1 / 3) - 1 : 0,
    upsideDownside: selected.valuation.marginOfSafety,
    dataQualityScore: Math.round(
      (selected.dataset.evidence.filter((item) => item.usedInModel).length / Math.max(selected.dataset.evidence.length, 1)) * 100,
    ),
    integrityScore: selected.dataStatus.valuationReliable ? 88 : 62,
    customSummary: selected.thesis.onePage,
  };
}
