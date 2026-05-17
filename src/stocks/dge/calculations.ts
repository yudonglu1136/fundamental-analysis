import type { DataSourceType, DataStatus, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import { defaultDgeValuationAssumptions, dgeScenarioPresets } from "./assumptions";
import { dgeDataset } from "./data";
import type { DgeDashboardData, DgeDataset, DgeValuationAssumptions } from "./types";
import { buildDgeBrandPortfolioEngine } from "./engines/brandPortfolioEngine";
import { buildDgeCashFlowDeleveragingEngine } from "./engines/cashFlowDeleveragingEngine";
import { buildDgeEvidenceAudit } from "./engines/evidenceEngine";
import { buildDgeLacInventoryEngine } from "./engines/lacInventoryEngine";
import { buildDgeManagementTurnaroundEngine } from "./engines/managementTurnaroundEngine";
import { buildDgeMarginAndSavingsEngine } from "./engines/marginAndSavingsEngine";
import { buildDgePriceMixVolumeEngine } from "./engines/priceMixVolumeEngine";
import { buildDgeRegionalGrowthQualityEngine } from "./engines/regionalGrowthQualityEngine";
import { buildDgeRiskRedTeam } from "./engines/riskRedTeamEngine";
import { buildDgeUsDemandEngine } from "./engines/usDemandEngine";
import { buildDgeValuationEngine } from "./engines/valuationEngine";

export { defaultDgeValuationAssumptions, dgeScenarioPresets };
export type { DgeValuationAssumptions };

type DgeRuntimeContext = {
  __dgeResolvedPeriod?: string;
  __dgeRequestedDataSourceType?: DataSourceType;
};

type DgeDatasetInput = DgeDataset & Partial<DgeRuntimeContext>;

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

function isDgeDataset(value: unknown): value is DgeDatasetInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      "periods" in value &&
      "reportedData" in value &&
      "guidanceData" in value &&
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

export function resolveDgeDataset(data: unknown): DgeDatasetInput {
  return isDgeDataset(data) ? data : dgeDataset;
}

export function attachDgeRuntimeContext(
  data: DgeDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): DgeDatasetInput {
  return {
    ...data,
    __dgeResolvedPeriod: context.periodId,
    __dgeRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultDgePeriod() {
  return dgeDataset.currentPeriodId;
}

export function getDgePeriods() {
  return dgeDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function resolveDgePeriodFromData(data: unknown, fallback = getDefaultDgePeriod()) {
  const dataset = resolveDgeDataset(data);
  const runtimePeriod = dataset.__dgeResolvedPeriod;
  if (runtimePeriod && dataset.periods.some((period) => period.id === runtimePeriod)) return runtimePeriod;
  return dataset.periods.some((period) => period.id === fallback) ? fallback : dataset.currentPeriodId;
}

export function resolveDgeEffectiveDataSourceType(data: unknown): "mock" | "manual" {
  return resolveDgeDataset(data).__dgeRequestedDataSourceType === "manual" ? "manual" : "mock";
}

function mergeAssumptions(scenario: Scenario, overrides?: Partial<DgeValuationAssumptions>): DgeValuationAssumptions {
  return {
    ...dgeScenarioPresets[scenario],
    ...(overrides ?? {}),
  };
}

export function validateDgeData(data: DgeDataset, periodId: string, warnings: ValidationWarning[] = []): ValidationWarning[] {
  const validationWarnings: ValidationWarning[] = [...warnings];
  const evidence = buildDgeEvidenceAudit(data);
  const period = data.periods.find((row) => row.id === periodId) ?? data.periods[0];
  const q3Na = data.reportedData.regions.find((row) => row.periodId === "q3-fy2026" && row.region === "North America");
  const q3Lac = data.reportedData.regions.find((row) => row.periodId === "q3-fy2026" && row.region === "Latin America & Caribbean");
  const guidance = data.guidanceData[0];
  const market = data.marketData;
  const assumptionEvidence = new Set(data.evidenceData.filter((item) => item.sourceType === "research_assumption").map((item) => item.id));
  const assumptionEvidenceIds = new Set(data.researchAssumptions.flatMap((item) => item.sourceEvidenceIds));

  if (period.reportedNetSales === period.organicNetSalesMovement) {
    validationWarnings.push({
      id: "dge-reported-organic-mix",
      title: "Reported and organic sales are mixed",
      detail: "Reported net sales must remain separate from organic net sales movement/growth.",
      severity: "high",
    });
  }

  data.reportedData.channelInventory.forEach((row) => {
    if (row.shipmentsGrowth != null && row.depletionsGrowth != null && row.consumptionGrowth != null) {
      if (row.shipmentsGrowth === row.depletionsGrowth && row.depletionsGrowth === row.consumptionGrowth) {
        validationWarnings.push({
          id: `dge-inventory-undifferentiated-${row.periodId}-${row.region}`,
          title: "Shipments, depletions and consumption are not separated",
          detail: `${row.region} ${row.periodId} has identical shipments, depletions and consumption values.`,
          severity: "high",
        });
      }
    }
  });

  if (!q3Na || !q3Na.sourceEvidenceIds.some((id) => id.includes("q3fy2026"))) {
    validationWarnings.push({
      id: "dge-na-source-missing",
      title: "North America source evidence missing",
      detail: "North America / US Spirits demand cannot be proxied by group data.",
      severity: "high",
    });
  }

  if (!q3Lac || !data.researchAssumptions.some((item) => item.id === "assumption-lac-low-base-effect")) {
    validationWarnings.push({
      id: "dge-lac-inventory-adjustment-missing",
      title: "LAC inventory adjustment missing",
      detail: "LAC reported growth must be adjusted for inventory, low-base and pull-forward effects.",
      severity: "high",
    });
  }

  if (guidance && (guidance.freeCashFlow !== 3_000 || guidance.organicNetSalesGrowthLow !== -0.03 || guidance.organicNetSalesGrowthHigh !== -0.02)) {
    validationWarnings.push({
      id: "dge-guidance-misaligned",
      title: "FY2026 guidance is not aligned",
      detail: "FY2026 guidance should reflect organic net sales down 2-3% and FCF around $3bn.",
      severity: "high",
    });
  }

  if (!guidance || guidance.capexLow <= 0 || guidance.erpInventoryBuildExcludedFromFcf <= 0) {
    validationWarnings.push({
      id: "dge-fcf-bridge-incomplete",
      title: "FCF guidance bridge is incomplete",
      detail: "FCF $3bn must be linked to OCF, capex, working capital, exceptionals and inventory build exclusions.",
      severity: "medium",
    });
  }

  if (guidance && guidance.dividendFloor >= 1) {
    validationWarnings.push({
      id: "dge-old-dividend-anchor",
      title: "Dividend model appears to use old payout anchor",
      detail: "Dividend safety must use the rebased floor and 30-50% payout policy, not old dividend growth.",
      severity: "high",
    });
  }

  if (market.londonPriceGbp !== market.londonPriceGbx / 100) {
    validationWarnings.push({
      id: "dge-gbx-gbp-conversion",
      title: "GBX / GBP conversion error",
      detail: "DGE.L quote must be divided by 100 before GBP valuation.",
      severity: "high",
    });
  }

  if (market.ordinarySharesPerAdr !== 4) {
    validationWarnings.push({
      id: "dge-adr-ratio",
      title: "ADR ratio is wrong",
      detail: "Diageo ADR equivalent should use one ADR for four ordinary shares.",
      severity: "high",
    });
  }

  if (Math.abs(market.enterpriseValueUsdM - (market.marketCapUsdM + market.netDebtUsdM)) > 1) {
    validationWarnings.push({
      id: "dge-ev-calculation",
      title: "Enterprise value calculation is wrong",
      detail: "EV must equal market cap plus net debt.",
      severity: "high",
    });
  }

  if (evidence.evidenceCoverageRatio < 0.9) {
    validationWarnings.push({
      id: "dge-evidence-coverage",
      title: "Evidence coverage below 90%",
      detail: `Evidence coverage ratio is ${(evidence.evidenceCoverageRatio * 100).toFixed(1)}%.`,
      severity: "high",
    });
  }

  if (!assumptionEvidence.has("research-assumption-demand-cycle") || !assumptionEvidenceIds.has("research-assumption-demand-cycle")) {
    validationWarnings.push({
      id: "dge-research-assumption-audit",
      title: "Research-only assumptions are not audited",
      detail: "Every research-only assumption must appear in assumptions.ts and evidence.ts.",
      severity: "high",
    });
  }

  return uniqueWarnings(validationWarnings);
}

function buildThesisBoard(dashboard: Omit<DgeDashboardData, "thesisBoard">) {
  return {
    onePageThesis:
      `DGE.L is not a simple stable-staples DCF. At £${dashboard.valuation.blendedFairValueGbp.toFixed(2)} base fair value, the buy case requires US Spirits depletions to stabilize, LAC growth to survive inventory normalization, Guinness to stay structurally strong, and $3bn FY26 FCF to convert into deleveraging after the dividend rebasing.`,
    whatMustBeTrue: [
      "US Spirits weakness must be cyclical/channel-led enough that depletions improve before shipments do.",
      "Casamigos, Don Julio and Crown Royal must stop losing share or require less promotional support.",
      "LAC normalized growth must remain positive after low-base, restocking and World Cup pull-forward fade.",
      "The rebased dividend floor must remain covered by normalized FCF while net debt / EBITDA moves lower.",
      "Accelerate savings must fund reinvestment and tariff/mix pressure rather than only flattering margin.",
    ],
    upsideDrivers: [
      "US depletions stabilize and shipment gap closes.",
      "Tequila normalizes rather than structurally derates.",
      "Brazil recovery broadens and Mexico stabilizes.",
      "Guinness and RTD momentum remain strong without needing high promotion.",
      "EABL disposal and FCF drive visible leverage reduction.",
    ],
    downsideRisks: [
      "US Spirits true consumption keeps deteriorating.",
      "LAC Q3 growth unwinds after World Cup pull-forward.",
      "Premiumisation failure forces a value-tier reset.",
      "Tariffs, FX and mix absorb Accelerate savings.",
      "Dividend floor credibility weakens if FCF misses.",
    ],
    catalysts: [
      "FY2026 results and cash-flow bridge.",
      "US NielsenIQ/Circana/NABCA depletion and share updates.",
      "LAC Q4/FY2027 sell-out after World Cup phasing.",
      "Dave Lewis strategy update and operating model changes.",
      "EABL disposal completion and leverage update.",
    ],
    valueTrapCase:
      "DGE is a value trap if US weakness is share/brand-led, tequila super-premium remains promotional, LAC restocking reverses, and the market keeps capitalizing a lower-quality cash-flow stream at a higher yield.",
    meanReversionCase:
      "DGE is a quality mean-reversion opportunity if US consumption bottoms, LAC normalized growth stays positive, Guinness remains a real structural growth asset, and $3bn FCF proves dividend/deleveraging capacity.",
  };
}

export function buildDgeDashboardData(data: DgeDataset, periodId: string, scenario: Scenario, overrides?: Partial<DgeValuationAssumptions>): DgeDashboardData {
  const dataset = resolveDgeDataset(data);
  const selectedPeriod = dataset.periods.find((period) => period.id === periodId) ?? dataset.periods.find((period) => period.id === dataset.currentPeriodId) ?? dataset.periods[0];
  const assumptions = mergeAssumptions(scenario, overrides);
  const usDemand = buildDgeUsDemandEngine(dataset);
  const lacInventory = buildDgeLacInventoryEngine(dataset);
  const regionalQuality = buildDgeRegionalGrowthQualityEngine(dataset);
  const brandPortfolio = buildDgeBrandPortfolioEngine(dataset);
  const priceMixVolume = buildDgePriceMixVolumeEngine(dataset, selectedPeriod.id);
  const marginSavings = buildDgeMarginAndSavingsEngine(dataset);
  const cashFlow = buildDgeCashFlowDeleveragingEngine(dataset);
  const managementTurnaround = buildDgeManagementTurnaroundEngine(dataset);
  const valuation = buildDgeValuationEngine(dataset, assumptions, scenario, usDemand, lacInventory, brandPortfolio, cashFlow, marginSavings);
  const riskRedTeam = buildDgeRiskRedTeam(dataset, usDemand, lacInventory, brandPortfolio, marginSavings, cashFlow);
  const evidenceAudit = buildDgeEvidenceAudit(dataset);
  const validationWarnings = validateDgeData(dataset, selectedPeriod.id, [
    ...valuation.warnings,
    ...(evidenceAudit.warnings.length > 0
      ? evidenceAudit.warnings.map((detail, index) => ({
          id: `dge-evidence-audit-${index}`,
          title: "Evidence audit warning",
          detail,
          severity: "medium" as const,
        }))
      : []),
  ]);

  const dataStatus: DataStatus = {
    sourceType: resolveDgeEffectiveDataSourceType(dataset),
    lastUpdated: dataset.marketData.priceDate,
    missingFields: evidenceAudit.missingEvidenceIds,
    validationWarnings,
    valuationReliable: !validationWarnings.some((warning) => warning.severity === "high"),
  };

  const partial = {
    dataset,
    selectedPeriod,
    usDemand,
    lacInventory,
    regionalQuality,
    brandPortfolio,
    priceMixVolume,
    marginSavings,
    cashFlow,
    managementTurnaround,
    valuation,
    riskRedTeam,
    evidenceAudit,
    dataStatus,
  };

  return {
    ...partial,
    thesisBoard: buildThesisBoard(partial),
  };
}

export function calculateDgeSummary(data: DgeDataset, periodId = getDefaultDgePeriod()): SummaryMetric[] {
  const dashboard = buildDgeDashboardData(data, periodId, "Base");
  const currentPrice = dashboard.dataset.marketData.londonPriceGbp;
  return [
    metric("Current Price", currentPrice, undefined, "currency", "London DGE.L ordinary share price, normalized from GBX to GBP.", "Actual"),
    metric("Base Fair Value", dashboard.valuation.blendedFairValueGbp, dashboard.valuation.blendedFairValueGbp - currentPrice, "currency", "Blended FCF yield, EV/EBIT, EV/EBITDA, P/E, dividend floor and region-quality valuation.", "Derived"),
    metric("Upside / Downside", computeUpsideDownside(dashboard.valuation.blendedFairValueGbp, currentPrice), undefined, "percent", "Base fair value upside/downside versus London price.", "Derived"),
    metric("US Demand Score", dashboard.usDemand.usDemandScore, undefined, "number", "0-100 score separating shipments, depletions, consumption, affordability and category pressure.", "Derived"),
    metric("LAC Inventory Score", dashboard.lacInventory.lacInventoryHealthScore, undefined, "number", "0-100 score after LAC inventory, low-base and World Cup pull-forward adjustments.", "Derived"),
    metric("Dividend Yield", dashboard.dataset.marketData.dividendYield, undefined, "percent", "Rebased dividend floor over current ordinary-share price.", "Actual"),
    metric("FCF After Dividend", dashboard.cashFlow.fcfAfterDividend, undefined, "currency", "Normalized FCF less rebased dividend floor cash requirement.", "Assumption"),
    metric("Risk Score", dashboard.riskRedTeam.aggregateRiskScore, undefined, "number", "Aggregate red-team risk score across US demand, LAC, tequila, premiumisation, FX/tariffs, leverage and execution.", "Derived"),
  ];
}

export function calculateDgeValuation(
  data: DgeDataset,
  periodId: string,
  scenario: Scenario,
  overrides?: Partial<DgeValuationAssumptions>,
): ValuationResult {
  const dataset = resolveDgeDataset(data);
  const cases = (["Bear", "Base", "Bull"] as Scenario[]).map((caseName) => {
    const dashboard = buildDgeDashboardData(dataset, periodId, caseName, caseName === scenario ? overrides : undefined);
    return { scenario: caseName, dashboard };
  });
  const selected = cases.find((item) => item.scenario === scenario)?.dashboard ?? cases[1].dashboard;
  const currentPrice = selected.dataset.marketData.londonPriceGbp;
  const cumulativeDividends = (selected.dataset.marketData.dividendPerShareUsd / selected.dataset.marketData.gbpUsd) * 3;

  return {
    currentPrice,
    priceDate: selected.dataset.marketData.priceDate,
    warning: selected.dataStatus.validationWarnings.some((warning) => warning.severity === "high")
      ? "DGE model validation found high-severity issues. Review evidence, unit conversion and research-only assumptions."
      : undefined,
    validationWarnings: selected.dataStatus.validationWarnings,
    fairValues: cases.map(({ scenario: caseName, dashboard }) => {
      const targetPrice3Y = dashboard.valuation.blendedFairValueGbp * (1 + selected.valuation.marketImplied.terminalOrganicGrowth) ** 3;
      return {
        scenario: caseName,
        fairValue: dashboard.valuation.blendedFairValueGbp,
        upsideDownside: computeUpsideDownside(dashboard.valuation.blendedFairValueGbp, currentPrice),
        expectedReturn3Y: computeExpectedShareholderCagr(targetPrice3Y, currentPrice, cumulativeDividends),
        targetPrice3Y,
        cumulativeDividends,
        summary: `${caseName} beverage-cycle scenario with explicit US demand, LAC inventory and FCF/deleveraging assumptions.`,
      };
    }),
    methodCards: [
      { key: "dge-blended", label: "Blended Fair Value", value: selected.valuation.blendedFairValueGbp, format: "currency", description: "Weighted FCF yield, EV/EBIT, EV/EBITDA, P/E, dividend floor and region-quality valuation." },
      { key: "dge-fcf-yield", label: "Normalized FCF Yield", value: selected.valuation.normalizedFcfFairValueGbp, format: "currency", description: "Equity FCF yield model using normalized FCF and dynamic target yield." },
      { key: "dge-ev-ebit", label: "EV / EBIT", value: selected.valuation.evEbitFairValueGbp, format: "currency", description: "Normalized EBIT multiple after net debt deduction." },
      { key: "dge-ev-ebitda", label: "EV / EBITDA", value: selected.valuation.evEbitdaFairValueGbp, format: "currency", description: "Normalized EBITDA multiple with leverage sensitivity." },
      { key: "dge-pe", label: "P/E Cross Check", value: selected.valuation.peFairValueGbp, format: "currency", description: "EPS before exceptional items times scenario P/E; cross-check only." },
      { key: "dge-dividend", label: "Dividend Floor", value: selected.valuation.dividendFloorValueGbp, format: "currency", description: "Rebased dividend floor capitalized at a risk-adjusted dividend yield." },
      { key: "dge-adr", label: "DEO ADR Equivalent", value: selected.valuation.adrEquivalentUsd, format: "currency", description: "One ADR equals four ordinary shares, shown in USD." },
    ],
    expectedReturnBridge: [
      { key: "us-demand-score", label: "US Demand Score", value: selected.usDemand.usDemandScore, format: "number", description: "Demand-cycle score after channel adjustments." },
      { key: "lac-score", label: "LAC Inventory Score", value: selected.lacInventory.lacInventoryHealthScore, format: "number", description: "Inventory-adjusted LAC score." },
      { key: "fcf-yield", label: "Required FCF Yield", value: selected.valuation.marketImplied.requiredFcfYield, format: "percent", description: "Normalized FCF over current market cap." },
      { key: "dividend-yield", label: "Dividend Yield", value: selected.dataset.marketData.dividendYield, format: "percent", description: "Rebased dividend floor yield." },
      { key: "expected-cagr", label: "Expected 3Y CAGR", value: computeExpectedShareholderCagr(selected.valuation.blendedFairValueGbp * 1.08, currentPrice, cumulativeDividends), format: "percent", description: "Fair value fade-in plus rebased dividends." },
    ],
    sensitivityTables: selected.valuation.sensitivityTables,
    fcfFairValue: selected.valuation.normalizedFcfFairValueGbp,
    peFairValue: selected.valuation.peFairValueGbp,
    blendedFairValue: selected.valuation.blendedFairValueGbp,
    probabilityWeightedFairValue: cases.reduce((sum, item, index) => sum + item.dashboard.valuation.blendedFairValueGbp * [0.25, 0.5, 0.25][index], 0),
    recommendedFairValue: selected.valuation.blendedFairValueGbp,
    recommendedFairValueMethod: "FCF yield / EV multiples / P/E / dividend floor / region-quality triangulation",
    recommendedFairValueReason: "DGE requires cash-flow, leverage, dividend and regional-quality triangulation because reported growth is distorted by channel inventory and category divergence.",
    valuationRangeLow: cases[0].dashboard.valuation.blendedFairValueGbp,
    valuationRangeBase: cases[1].dashboard.valuation.blendedFairValueGbp,
    valuationRangeHigh: cases[2].dashboard.valuation.blendedFairValueGbp,
    targetPrice3Y: selected.valuation.blendedFairValueGbp * 1.08,
    expectedReturn3Y: computeExpectedShareholderCagr(selected.valuation.blendedFairValueGbp * 1.08, currentPrice, cumulativeDividends),
    upsideDownside: computeUpsideDownside(selected.valuation.blendedFairValueGbp, currentPrice),
    dataQualityScore: Math.round(selected.evidenceAudit.averageConfidence * 100),
    integrityScore: selected.dataStatus.valuationReliable ? 88 : 66,
    recommendedValuationConfidence: Math.round(selected.evidenceAudit.evidenceCoverageRatio * 100),
  };
}
