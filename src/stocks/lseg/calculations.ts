import type {
  DataSourceType,
  DashboardInterpretation,
  DataStatus,
  Scenario,
  SummaryMetric,
  ValuationResult,
  ValidationWarning,
} from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { computeUpsideDownside, daysBetweenIso } from "../../utils/valuation";
import { defaultLsegValuationAssumptions, type LsegValuationAssumptions } from "./config/assumptions";
import { lsegScenarioDefinitions, lsegScenarioPresets } from "./config/scenarios";
import { lsegMockData, type LsegRawData } from "./data";
import { lsegPeerLayerWarnings, lsegPeerPopulationSummary } from "./data/lsegPeers";
import { calculateBuybackEngine } from "./engines/buybackEngine";
import { calculateConsensusComparisonEngine } from "./engines/consensusComparisonEngine";
import { calculateDcfEngine } from "./engines/dcfEngine";
import { calculateFcfEngine } from "./engines/fcfEngine";
import { getPeriodById, safeRatio } from "./engines/helpers";
import { calculateMarginEngine } from "./engines/marginEngine";
import { calculateMarketImpliedValuationEngine } from "./engines/marketImpliedValuationEngine";
import { calculateOperatingSotpEngine, calculateStrategicSotpEngine } from "./engines/sotpEngine";
import { calculateQualityDiagnosticsEngine } from "./engines/qualityDiagnosticsEngine";
import { calculateRevenueEngine } from "./engines/revenueEngine";
import { buildScenarioAssumptions } from "./engines/scenarioEngine";
import { calculateValuationIntegrityEngine } from "./engines/valuationIntegrityEngine";
import { calculateValuationEngine } from "./engines/valuationEngine";
import { calculateWaccEngine } from "./engines/waccEngine";
import type {
  LsegConsensusComparison,
  LsegDashboardDataset,
  LsegFinancialPeriod,
  LsegInvestmentThesis,
  LsegMarketImpliedValuation,
  LsegQualityDiagnostics,
  LsegScenarioOutput,
  LsegValuationIntegrity,
} from "./model";

export type LsegDataset = LsegRawData;
export { defaultLsegValuationAssumptions } from "./config/assumptions";
export { lsegScenarioPresets } from "./config/scenarios";

type LsegRuntimeContext = {
  __lsegResolvedPeriod?: string;
  __lsegRequestedDataSourceType?: DataSourceType;
};

type LsegDatasetInput = LsegDataset & Partial<LsegRuntimeContext>;

type LsegScenarioCalculation = {
  period: LsegFinancialPeriod;
  assumptions: ReturnType<typeof buildScenarioAssumptions>;
  revenue: ReturnType<typeof calculateRevenueEngine>;
  margin: ReturnType<typeof calculateMarginEngine>;
  fcf: ReturnType<typeof calculateFcfEngine>;
  buyback: ReturnType<typeof calculateBuybackEngine>;
  wacc: ReturnType<typeof calculateWaccEngine>;
  dcf: ReturnType<typeof calculateDcfEngine>;
  conservativeOperatingSotp: ReturnType<typeof calculateOperatingSotpEngine>;
  baseOperatingSotp: ReturnType<typeof calculateOperatingSotpEngine>;
  premiumOperatingSotp: ReturnType<typeof calculateOperatingSotpEngine>;
  operatingSotp: ReturnType<typeof calculateOperatingSotpEngine>;
  strategicSotp: ReturnType<typeof calculateStrategicSotpEngine>;
  quality: LsegQualityDiagnostics;
  valuation: ReturnType<typeof calculateValuationEngine>;
  consensusComparison: LsegConsensusComparison;
  marketImplied: LsegMarketImpliedValuation;
  integrity: LsegValuationIntegrity;
  thesis: LsegInvestmentThesis;
  fcfPerShareSeries: number[];
  qualityDirectValuationLink: false;
  warnings: ValidationWarning[];
};

type DashboardData = ReturnType<typeof buildLsegDashboardData>;

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

const REPORTED_SEGMENT_MULTIPLE_GUARDRAILS: Record<string, { min: number; max: number }> = {
  "Data & Analytics": { min: 15, max: 21 },
  "FTSE Russell": { min: 20, max: 27 },
  "Risk Intelligence": { min: 16, max: 24 },
  Markets: { min: 13, max: 20 },
  Other: { min: -2, max: 2 },
};

function uniqueWarnings(warnings: ValidationWarning[]) {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    if (seen.has(warning.id)) return false;
    seen.add(warning.id);
    return true;
  });
}

function warningFromText(text: string, index: number): ValidationWarning {
  const severity = text.toLowerCase().includes("double counting") || text.toLowerCase().includes("placeholder")
    ? "high"
    : "medium";
  return {
    id: `lseg-text-warning-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}`,
    title: text.length > 72 ? `${text.slice(0, 69)}...` : text,
    detail: text,
    severity,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isLsegDataset(value: unknown): value is LsegDatasetInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      "periods" in value &&
      "segmentFinancials" in value &&
      "kpis" in value &&
      "marketData" in value,
  );
}

export function resolveLsegDataset(data: unknown): LsegDatasetInput {
  return isLsegDataset(data) ? data : lsegMockData;
}

export function resolveLsegPeriodFromData(data: unknown, fallback = getDefaultLsegPeriod()): string {
  const dataset = resolveLsegDataset(data);
  const runtimePeriod = dataset.__lsegResolvedPeriod;
  if (runtimePeriod && dataset.periods.some((period) => period.id === runtimePeriod)) {
    return runtimePeriod;
  }
  return dataset.periods.some((period) => period.id === fallback) ? fallback : getDefaultLsegPeriodId(dataset);
}

export function resolveLsegRequestedDataSourceType(data: unknown): DataSourceType | undefined {
  const dataset = resolveLsegDataset(data);
  return dataset.__lsegRequestedDataSourceType;
}

export function resolveLsegEffectiveDataSourceType(data: unknown): DataSourceType {
  const requested = resolveLsegRequestedDataSourceType(data);
  return requested === "manual" ? "manual" : "mock";
}

export function attachLsegRuntimeContext(
  data: LsegDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): LsegDatasetInput {
  return {
    ...data,
    __lsegResolvedPeriod: context.periodId,
    __lsegRequestedDataSourceType: context.dataSourceType,
  };
}

function buildLsegDataSourceWarnings(data: unknown): ValidationWarning[] {
  const requested = resolveLsegRequestedDataSourceType(data);
  const warnings: ValidationWarning[] = [];
  if (requested && requested !== "mock" && requested !== "manual") {
    warnings.push({
      id: "lseg-unsupported-data-source",
      title: "Requested data source is not implemented for LSEG",
      detail: `LSEG currently supports the module mock baseline plus manual assumption overrides. Requested source "${requested}" falls back to the module baseline data.`,
      severity: "medium",
    });
  }
  if (requested === "manual") {
    warnings.push({
      id: "lseg-manual-assumptions-active",
      title: "Manual assumption overrides are active",
      detail: "The baseline operating dataset still comes from the module mock snapshot. Only the valuation assumptions have switched to manual overrides.",
      severity: "low",
    });
  }
  return warnings;
}

function getDefaultLsegPeriodId(data: LsegDataset = lsegMockData) {
  return data.periods.find((period) => period.id === "fy25")?.id ?? data.periods[data.periods.length - 1]?.id ?? "";
}

export function getDefaultLsegPeriod() {
  return getDefaultLsegPeriodId(lsegMockData);
}

export function getLsegPeriods() {
  return lsegMockData.periods.map((period) => ({ value: period.id, label: period.label }));
}

function normalizeScenarioProbabilities(baseQuality: LsegQualityDiagnostics) {
  const raw = {
    Bear: lsegScenarioDefinitions.Bear.probabilityWeight + baseQuality.scenarioProbabilityAdjustment.Bear,
    Base: lsegScenarioDefinitions.Base.probabilityWeight + baseQuality.scenarioProbabilityAdjustment.Base,
    Bull: lsegScenarioDefinitions.Bull.probabilityWeight + baseQuality.scenarioProbabilityAdjustment.Bull,
  };
  const floored = {
    Bear: Math.max(raw.Bear, 0.05),
    Base: Math.max(raw.Base, 0.1),
    Bull: Math.max(raw.Bull, 0.05),
  };
  const total = floored.Bear + floored.Base + floored.Bull;
  return {
    Bear: floored.Bear / total,
    Base: floored.Base / total,
    Bull: floored.Bull / total,
  } as Record<Scenario, number>;
}

function buildInvestmentThesis(
  selected: LsegScenarioCalculation,
  probabilities: Record<Scenario, number>,
): LsegInvestmentThesis {
  const year1RevenueGrowth = selected.revenue.groupRevenueByYear[0]?.growth ?? 0;
  const year1Margin = selected.margin.groupRows[0]?.adjustedEbitdaMargin ?? selected.period.adjustedEbitdaMargin;
  const year1Fcf = selected.fcf.rows[0]?.equityFreeCashFlow ?? selected.period.equityFreeCashFlow;
  const currentPrice = selected.assumptions.currentPrice;

  return {
    bullCaseSummary:
      `Bull case assumes LSEG compounds like a higher-quality data and workflow asset: ${(year1RevenueGrowth * 100).toFixed(1)}% year-one growth, ${(year1Margin * 100).toFixed(1)}% EBITDA margin, declining capex intensity, and durable buybacks, with Tradeweb structural growth and AI-ready data monetization supporting double-digit FCF/share compounding.`,
    baseCaseSummary:
      `Base case treats LSEG as a diversified financial-market operating system: recurring data, index licensing, risk intelligence, and mixed Markets exposure combine to support mid/high-single-digit revenue growth, modest margin expansion, and steady equity FCF/share growth without relying on activist breakup value.`,
    bearCaseSummary:
      "Bear case assumes Workspace and Microsoft-linked monetization disappoint, Markets/Tradeweb volume normalizes, capex intensity stays elevated, and the integrated portfolio does not earn a strategic premium beyond the operating business.",
    keyUpsideDrivers: [
      "High retention and positive ASV growth keep recurring revenue durable.",
      "FTSE Russell, Risk Intelligence, and licensed data monetization support pricing power.",
      "Declining capex intensity can unlock stronger equity FCF/share and buyback capacity.",
      "Tradeweb and post-trade economics can add upside if structural growth proves more durable than cyclical volume.",
    ],
    keyDownsideRisks: [
      "AI compresses workflow pricing faster than LSEG monetizes AI-ready data distribution.",
      "Markets growth proves cyclical and fades before fixed-fee or data monetization offsets it.",
      "Capex intensity and transformation costs remain high, muting FCF/share growth.",
      "Buybacks executed near full value dilute incremental capital allocation returns.",
    ],
    debatePoints: [
      "Is LSEG a premium data/workflow compounder or a mixed market-infrastructure company that deserves a lower terminal multiple?",
      "How much of Markets growth is structural electronic-trading penetration versus volatility-driven activity?",
      "Can FCF/share compound fast enough through 2027-2029 to justify the current price without strategic optionality?",
      "Is the portfolio worth more integrated or partially separated in a strategic review?",
    ],
    whatMarketIsPricing:
      `At £${currentPrice.toFixed(2)} and ${selected.marketImplied.impliedPe.toFixed(1)}x forward EPS, the market appears to price in roughly ${(((selected.marketImplied.impliedFcfShareCagr ?? 0) * 100)).toFixed(1)}% FCF/share CAGR and a relatively stable terminal infrastructure multiple.`,
    whatWeNeedToBelieve:
      `We need to believe retention above 92%, ASV growth around ${(selected.quality.sourceMetrics.asvGrowth * 100).toFixed(1)}%, and a base-case probability of ${(probabilities.Base * 100).toFixed(0)}% are sufficient to keep D&A / FTSE / Risk quality high while Markets cyclicality fades.`,
    whatCouldBreakTheThesis:
      "A weaker data-pricing environment, slower Workspace monetization, stubborn capex, or regulatory pressure on clearing/post-trade economics would break the thesis that LSEG can compound equity FCF/share at a premium multiple.",
  };
}

function buildValidationWarnings(
  data: LsegDashboardDataset,
  periodId: string,
  scenarioCase: Omit<LsegScenarioCalculation, "warnings" | "thesis">,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [
    ...scenarioCase.revenue.warnings,
    ...scenarioCase.margin.warnings,
    ...scenarioCase.fcf.warnings,
    ...scenarioCase.integrity.warnings,
    ...scenarioCase.integrity.dataQualityWarnings,
    ...scenarioCase.integrity.recommendationWarnings,
    ...(scenarioCase.operatingSotp.doubleCountWarnings ?? []).map(warningFromText),
    ...(scenarioCase.strategicSotp.doubleCountWarnings ?? []).map(warningFromText),
  ];

  if (daysBetweenIso(data.marketData.priceDate, todayIso()) > 7) {
    warnings.push({
      id: "lseg-stale-price",
      title: "Current price may be stale",
      detail: `Current price anchor is dated ${data.marketData.priceDate}. Expected CAGR and upside/downside should be refreshed if the market moved materially.`,
      severity: "medium",
    });
  }
  const livePrice = data.marketData.manualOverride ?? data.marketData.currentPrice;
  if (livePrice > 0) {
    const deviation = Math.abs(safeRatio(scenarioCase.assumptions.currentPrice, livePrice) - 1);
    if (deviation > 0.1) {
      warnings.push({
        id: "lseg-current-price-mismatch",
        title: "Current price input differs from dated market snapshot",
        detail: `Scenario current price of £${scenarioCase.assumptions.currentPrice.toFixed(2)} differs by more than 10% from the dated market snapshot of £${livePrice.toFixed(2)}.`,
        severity: "medium",
      });
    }
  }
  if (scenarioCase.dcf.cashFlowTaxonomy.dcfCashFlowType !== "unlevered" || scenarioCase.dcf.cashFlowTaxonomy.dcfMethod !== "wacc_unlevered") {
    warnings.push({
      id: "lseg-dcf-taxonomy",
      title: "DCF cash flow taxonomy is invalid",
      detail: "DCF should use unlevered FCF discounted at WACC, with net debt subtracted after enterprise value.",
      severity: "high",
    });
  }
  if (scenarioCase.dcf.cashFlowTaxonomy.dcfCashFlowType === "equity" && scenarioCase.dcf.cashFlowTaxonomy.netDebtTreatment === "subtract_after_ev") {
    warnings.push({
      id: "lseg-dcf-equity-netdebt-doublecount",
      title: "DCF subtracts net debt after using equity FCF",
      detail: "Interest expense deducted in DCF cash flow and net debt also deducted would double count financing drag.",
      severity: "high",
    });
  }
  if (scenarioCase.fcf.rows.some((row) => !Number.isFinite(row.unleveredFreeCashFlow))) {
    warnings.push({
      id: "lseg-unlevered-fcf-missing",
      title: "Unlevered FCF missing but WACC DCF selected",
      detail: "DCF requires a complete unlevered FCF forecast if WACC is the chosen discount rate.",
      severity: "high",
    });
  }

  const reportedRows = data.segmentFinancials.filter((row) => row.periodId === periodId && row.taxonomy === "reported_2025");
  const revenueDefinitionSet = new Set(reportedRows.map((row) => row.revenueDefinition));
  if (revenueDefinitionSet.size > 1) {
    warnings.push({
      id: "lseg-definition-mix",
      title: "Revenue vs total income definition mismatch",
      detail: "Reported segment rows mix revenue and total income excluding recoveries definitions. Margin and mix conclusions should be read with that labeling in mind.",
      severity: "medium",
    });
  }
  if (scenarioCase.baseOperatingSotp.valuePerShare > scenarioCase.dcf.valuePerShare * 1.5) {
    warnings.push({
      id: "lseg-sotp-above-dcf",
      title: "Operating SOTP exceeds DCF by more than 50%",
      detail: "Operating SOTP exceeds DCF by more than 50%, which should be treated as a live audit issue rather than a harmless method difference.",
      severity: "medium",
    });
  }
  const averageMarketMethods = (scenarioCase.valuation.peFairValue + scenarioCase.valuation.fcfFairValue) / 2;
  if (scenarioCase.baseOperatingSotp.valuePerShare > averageMarketMethods * 1.4) {
    warnings.push({
      id: "lseg-sotp-audit-vs-market-methods",
      title: "Operating SOTP is materially above P/E and FCF yield cross-checks",
      detail: "Operating SOTP exceeds the average of P/E and FCF yield methods by more than 40%. Review peer multiples, corporate deductions, and cyclical capitalization.",
      severity: "medium",
    });
  }
  if ((scenarioCase.strategicSotp.strategicOptionalityPctOfOperating ?? 0) < 0.1) {
    warnings.push({
      id: "lseg-strategic-too-close-warning",
      title: "Strategic optionality is too small versus operating SOTP",
      detail: "Strategic optionality is below 10% of operating SOTP, which suggests break-up or activist value may already be embedded in operating assumptions.",
      severity: "medium",
    });
  }
  if (
    scenarioCase.dcf.valuePerShare <
    Math.min(scenarioCase.valuation.peFairValue, scenarioCase.valuation.fcfFairValue) * 0.75
  ) {
    warnings.push({
      id: "lseg-dcf-below-market-methods",
      title: "DCF materially below market multiples",
      detail: "DCF materially below market multiples; audit cash flow taxonomy, capex intensity, and terminal assumptions.",
      severity: "medium",
    });
  }
  if ((scenarioCase.revenue.groupRevenueByYear[0]?.marketsBridge?.cyclicalUplift ?? 0) > 0.015) {
    warnings.push({
      id: "lseg-markets-terminal-risk",
      title: "Markets growth includes cyclical volume uplift",
      detail: "Markets growth includes cyclical volume uplift; do not fully capitalize it into terminal growth or the Markets multiple.",
      severity: "medium",
    });
  }
  for (const component of scenarioCase.operatingSotp.components) {
    const guardrail = REPORTED_SEGMENT_MULTIPLE_GUARDRAILS[component.segment];
    if (!guardrail) continue;
    if (component.targetMultiple < guardrail.min || component.targetMultiple > guardrail.max) {
      warnings.push({
        id: `lseg-sotp-guardrail-${component.segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: `${component.segment} multiple sits outside guardrail`,
        detail: `${component.segment} is valued at ${component.targetMultiple.toFixed(1)}x versus a guardrail range of ${guardrail.min}x to ${guardrail.max}x.`,
        severity: "medium",
      });
    }
  }

  return uniqueWarnings(warnings);
}

function buildScenarioCalculation(
  data: LsegDataset,
  periodId: string,
  scenario: Scenario,
  overrides?: Partial<LsegValuationAssumptions>,
): LsegScenarioCalculation {
  const assumptions = buildScenarioAssumptions(scenario, overrides);
  const period = getPeriodById(data, periodId);
  assumptions.currentPrice = overrides?.currentPrice ?? assumptions.currentPrice ?? (data.marketData.manualOverride ?? data.marketData.currentPrice);
  const revenue = calculateRevenueEngine(data, periodId, assumptions);
  const margin = calculateMarginEngine(data, periodId, assumptions, revenue);
  const fcf = calculateFcfEngine(data, periodId, assumptions, revenue, margin);
  const buyback = calculateBuybackEngine(data, periodId, assumptions, margin);
  const wacc = calculateWaccEngine(data, periodId, assumptions);
  const dcf = calculateDcfEngine(data, periodId, assumptions.terminalGrowth, fcf, wacc);
  const conservativeOperatingSotp = calculateOperatingSotpEngine(data, periodId, assumptions, revenue, margin, "conservative_operating");
  const baseOperatingSotp = calculateOperatingSotpEngine(data, periodId, assumptions, revenue, margin, "base_operating");
  const premiumOperatingSotp = calculateOperatingSotpEngine(data, periodId, assumptions, revenue, margin, "premium_operating");
  const selectedSotpPolicy =
    baseOperatingSotp.audit.confidenceScore < 70 || (baseOperatingSotp.audit.severeWarnings?.length ?? 0) > 0
      ? "conservative_operating"
      : assumptions.scenario === "Bull" && baseOperatingSotp.audit.confidenceScore >= 75
        ? "premium_operating"
        : "base_operating";
  const operatingSotp =
    selectedSotpPolicy === "conservative_operating"
      ? conservativeOperatingSotp
      : selectedSotpPolicy === "premium_operating"
        ? premiumOperatingSotp
        : baseOperatingSotp;
  const strategicSotp = calculateStrategicSotpEngine(data, periodId, assumptions, revenue, margin, operatingSotp);
  const quality = calculateQualityDiagnosticsEngine(data, periodId, scenario, revenue, fcf, operatingSotp);
  const valuation = calculateValuationEngine(
    assumptions,
    revenue,
    margin,
    buyback,
    fcf,
    dcf,
    conservativeOperatingSotp,
    baseOperatingSotp,
    premiumOperatingSotp,
    operatingSotp,
    strategicSotp,
  );
  const fcfPerShareSeries = fcf.rows.map((row, index) => safeRatio(row.equityFreeCashFlow, buyback.rows[index]?.averageDilutedShares ?? 1));
  const marketImplied = calculateMarketImpliedValuationEngine(data, periodId, assumptions, wacc, margin, fcf, buyback, dcf);
  const consensusComparison = calculateConsensusComparisonEngine(data, revenue, margin, fcf, buyback, valuation.blendedFairValue);
  const integrity = calculateValuationIntegrityEngine(data, {
    assumptions,
    revenue,
    margin,
    fcf,
    buyback,
    wacc,
    dcf,
    conservativeOperatingSotp,
    baseOperatingSotp,
    premiumOperatingSotp,
    operatingSotp,
    strategicSotp,
    valuation,
    quality,
    fcfPerShareSeries,
    qualityDirectValuationLink: false,
  });
  const partial = {
    period,
    assumptions,
    revenue,
    margin,
    fcf,
    buyback,
    wacc,
    dcf,
    conservativeOperatingSotp,
    baseOperatingSotp,
    premiumOperatingSotp,
    operatingSotp,
    strategicSotp,
    quality,
    valuation,
    consensusComparison,
    marketImplied,
    integrity,
    fcfPerShareSeries,
    qualityDirectValuationLink: false as const,
  };
  const warnings = buildValidationWarnings(data, periodId, partial);
  const probabilities = normalizeScenarioProbabilities(quality);
  const thesis = buildInvestmentThesis({ ...partial, warnings, thesis: {} as LsegInvestmentThesis }, probabilities);
  return { ...partial, warnings, thesis };
}

function buildScenarioOutputs(
  cases: Record<Scenario, LsegScenarioCalculation>,
  probabilities: Record<Scenario, number>,
): LsegScenarioOutput[] {
  const bearFairValue = cases.Bear.valuation.blendedFairValue;
  return (["Bear", "Base", "Bull"] as Scenario[]).map((scenario) => {
    const current = cases[scenario];
    const year3Revenue = current.revenue.groupRevenueByYear[Math.min(2, current.revenue.groupRevenueByYear.length - 1)]?.revenue ??
      current.revenue.groupRevenueByYear[0]?.revenue ?? 1;
    return {
      scenario,
      valuation: {
        peFairValue: current.valuation.peFairValue,
        fcfFairValue: current.valuation.fcfFairValue,
        dcfValue: current.valuation.dcfValue,
        sotpFairValue: current.valuation.operatingSotpFairValue,
        operatingSotpFairValue: current.valuation.operatingSotpFairValue,
        strategicSotpFairValue: current.valuation.strategicSotpFairValue,
        coreValueExSotp: current.valuation.coreValueExSotp,
        operatingSotpUpliftVsCore: current.valuation.operatingSotpUpliftVsCore,
        blendedFairValue: current.valuation.blendedFairValue,
      },
      forecast: {
        revenueCagr: ((year3Revenue / Math.max(current.period.totalIncomeExcludingRecoveries, 1)) ** (1 / 3)) - 1,
        ebitdaMarginYear1: current.margin.groupRows[0]?.adjustedEbitdaMargin ?? current.period.adjustedEbitdaMargin,
        fcfPerShareYear1: current.valuation.forwardFcfPerShare,
        wacc: current.wacc.wacc,
        terminalGrowth: current.assumptions.terminalGrowth,
        targetPe: current.assumptions.targetPe,
      },
      targetPrice3Y: current.valuation.targetPrice3Y,
      cumulativeDividends3Y: current.valuation.cumulativeDividends3Y,
      expectedCagr3Y: current.valuation.expectedCagr3Y,
      downsideToBear: computeUpsideDownside(current.valuation.blendedFairValue, bearFairValue),
      probabilityWeight: probabilities[scenario],
    };
  });
}

function buildInvestmentReadThrough(selected: LsegScenarioCalculation): DashboardInterpretation[] {
  const year1Fcf = selected.fcf.rows[0];
  const marketsBridge = selected.revenue.groupRevenueByYear[0]?.marketsBridge;
  return [
    {
      title: "FCF/share thesis",
      signal: selected.valuation.expectedCagr3Y > 0.09 ? "Positive" : selected.valuation.expectedCagr3Y > 0.05 ? "Neutral" : "Needs Review",
      detail: `Year-one equity FCF of £${(year1Fcf?.equityFreeCashFlow ?? 0).toFixed(0)}m and ${selected.buyback.rows[0]?.sharesRepurchased.toFixed(1) ?? "0.0"}m shares repurchased support the shareholder-yield leg of the thesis.`,
      badge: "Derived",
    },
    {
      title: "Markets cyclicality",
      signal: (marketsBridge?.cyclicalUplift ?? 0) > 0.015 ? "Needs Review" : "Neutral",
      detail: `Markets growth splits into ${(marketsBridge?.structuralGrowth ?? 0) * 100}% structural and ${(marketsBridge?.cyclicalUplift ?? 0) * 100}% cyclical uplift in year one, so terminal capitalization is explicitly restrained.`,
      badge: "Derived",
    },
    {
      title: "Consensus positioning",
      signal: selected.consensusComparison.summary.toLowerCase().includes("above consensus") ? "Positive" : "Neutral",
      detail: selected.consensusComparison.summary,
      badge: "Assumption",
    },
  ];
}

export function calculateLsegSummary(data: LsegDataset, periodId: string): SummaryMetric[] {
  const dataset = resolveLsegDataset(data);
  const selected = buildScenarioCalculation(dataset, periodId, "Base");
  return [
    metric("Current Price", selected.assumptions.currentPrice, undefined, "currency", `Dated market snapshot as of ${dataset.marketData.priceDate}.`, "Actual"),
    metric("Recommended Fair Value", selected.valuation.recommendedFairValue, selected.valuation.recommendedFairValue - selected.assumptions.currentPrice, "currency", selected.valuation.recommendedFairValueReason, "Derived"),
    metric("Blended Fair Value", selected.valuation.blendedFairValue, selected.valuation.blendedFairValue - selected.assumptions.currentPrice, "currency", "Blend uses DCF, equity FCF yield, selected operating SOTP policy, and P/E cross-checks. Strategic SOTP stays outside the base blend.", "Derived"),
    metric("Probability-Weighted FV", calculateProbabilityWeightedFairValue(dataset, periodId), undefined, "currency", "Scenario fair values weighted by diagnostics-informed probabilities.", "Derived"),
    metric("2026 Revenue Growth", selected.revenue.groupRevenueByYear[0]?.growth ?? 0, (selected.revenue.groupRevenueByYear[0]?.growth ?? 0) - selected.period.organicConstantCurrencyGrowth, "percent", "Group revenue growth from segment KPIs, calibrated to guidance in the base case.", "Derived"),
    metric("2026 EBITDA Margin", selected.margin.groupRows[0]?.adjustedEbitdaMargin ?? 0, (selected.margin.groupRows[0]?.adjustedEbitdaMargin ?? 0) - selected.period.adjustedEbitdaMargin, "percent", "Segment-driven margin build with explicit leverage, reinvestment, inflation, and productivity terms.", "Derived"),
    metric("2026 FCF / Share", selected.valuation.forwardFcfPerShare, selected.valuation.forwardFcfPerShare - safeRatio(selected.period.equityFreeCashFlow, selected.period.weightedAverageShares), "currency", "Equity FCF per share used for shareholder-yield valuation, separate from unlevered DCF cash flow.", "Derived"),
    metric("3Y Target Price", selected.valuation.targetPrice3Y, selected.valuation.targetPrice3Y - selected.assumptions.currentPrice, "currency", "Three-year target price based on projected EPS and exit P/E rather than ROIC-spread shortcuts.", "Derived"),
    metric("Overall Integrity Score", selected.integrity.overallIntegrityScore, undefined, "number", "Model integrity score summarizing cash-flow taxonomy, valuation weights, guidance reconciliation, SOTP mechanics, and data quality.", "Derived"),
  ];
}

function calculateProbabilityWeightedFairValue(data: LsegDataset, periodId: string) {
  const dataset = resolveLsegDataset(data);
  const cases: Record<Scenario, LsegScenarioCalculation> = {
    Bear: buildScenarioCalculation(dataset, periodId, "Bear"),
    Base: buildScenarioCalculation(dataset, periodId, "Base"),
    Bull: buildScenarioCalculation(dataset, periodId, "Bull"),
  };
  const probabilities = normalizeScenarioProbabilities(cases.Base.quality);
  return (cases.Bear.valuation.blendedFairValue * probabilities.Bear) +
    (cases.Base.valuation.blendedFairValue * probabilities.Base) +
    (cases.Bull.valuation.blendedFairValue * probabilities.Bull);
}

export function calculateLsegValuation(
  data: LsegDataset,
  periodId: string,
  scenario: Scenario,
  assumptions?: Partial<LsegValuationAssumptions>,
): ValuationResult {
  const dataset = resolveLsegDataset(data);
  const cases: Record<Scenario, LsegScenarioCalculation> = {
    Bear: buildScenarioCalculation(dataset, periodId, "Bear", scenario === "Bear" ? assumptions : undefined),
    Base: buildScenarioCalculation(dataset, periodId, "Base", scenario === "Base" ? assumptions : undefined),
    Bull: buildScenarioCalculation(dataset, periodId, "Bull", scenario === "Bull" ? assumptions : undefined),
  };
  const selected = cases[scenario];
  const probabilities = normalizeScenarioProbabilities(cases.Base.quality);
  const scenarioOutputs = buildScenarioOutputs(cases, probabilities);
  const probabilityWeightedFairValue = (scenarioOutputs[0].valuation.blendedFairValue * probabilities.Bear) +
    (scenarioOutputs[1].valuation.blendedFairValue * probabilities.Base) +
    (scenarioOutputs[2].valuation.blendedFairValue * probabilities.Bull);
  const scenarioWarnings: ValidationWarning[] = [];
  const fairValues = scenarioOutputs.map((item) => item.valuation.blendedFairValue);
  if ((Math.max(...fairValues) - Math.min(...fairValues)) / Math.max(selected.assumptions.currentPrice, 1) < 0.08) {
    scenarioWarnings.push({
      id: "lseg-scenarios-too-similar",
      title: "Scenario outputs are too similar",
      detail: "Bear, Base, and Bull should differ because revenue, margin, FCF, WACC, and valuation inputs are independently modeled.",
      severity: "high",
    });
  }
  const validationWarnings = uniqueWarnings([...selected.warnings, ...scenarioWarnings]);

  const dcfSensitivity = buildSensitivityTable(
    "WACC",
    "Terminal Growth",
    [selected.wacc.wacc - 0.005, selected.wacc.wacc - 0.0025, selected.wacc.wacc, selected.wacc.wacc + 0.0025, selected.wacc.wacc + 0.005],
    [selected.assumptions.terminalGrowth - 0.005, selected.assumptions.terminalGrowth - 0.0025, selected.assumptions.terminalGrowth, selected.assumptions.terminalGrowth + 0.0025, selected.assumptions.terminalGrowth + 0.005],
    (wacc, terminalGrowth) => {
      const pvForecast = selected.fcf.rows.reduce((sum, row, index) => sum + (row.unleveredFreeCashFlow / ((1 + wacc) ** (index + 1))), 0);
      const finalFcf = selected.fcf.rows[selected.fcf.rows.length - 1]?.unleveredFreeCashFlow ?? 0;
      const terminalValue = (finalFcf * (1 + terminalGrowth)) / Math.max(wacc - terminalGrowth, 0.0001);
      const pvTerminal = terminalValue / ((1 + wacc) ** selected.fcf.rows.length);
      return safeRatio(pvForecast + pvTerminal - selected.period.netDebt - selected.period.minorityInterest, selected.period.weightedAverageShares);
    },
  );

  return {
    currentPrice: selected.assumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    warning: validationWarnings.some((warning) => warning.severity === "high")
      ? "Model integrity checks found high-severity items that should be reviewed before relying on the fair value output."
      : undefined,
    validationWarnings,
    fairValues: scenarioOutputs.map((item) => ({
      scenario: item.scenario,
      fairValue: item.valuation.blendedFairValue,
      upsideDownside: computeUpsideDownside(item.valuation.blendedFairValue, selected.assumptions.currentPrice),
      expectedReturn3Y: item.expectedCagr3Y,
      targetPrice3Y: item.targetPrice3Y,
      cumulativeDividends: item.cumulativeDividends3Y,
      summary: `${(probabilities[item.scenario] * 100).toFixed(0)}% probability weight`,
    })),
    methodCards: [
      { key: "lseg-recommended", label: "Recommended Fair Value", value: selected.valuation.recommendedFairValue, format: "currency", description: selected.valuation.recommendedFairValueReason },
      { key: "lseg-core-ex-sotp", label: "Core Value Ex-SOTP", value: selected.valuation.coreValueExSotp, format: "currency", description: "Reference anchor built only from DCF, FCF yield, and forward P/E. This excludes any SOTP premium." },
      { key: "lseg-dcf", label: "DCF Fair Value (Base Method)", value: selected.valuation.dcfValue, format: "currency", description: "Base-blend method. Unlevered FCF discounted at WACC, with net debt and minority interest deducted after enterprise value." },
      { key: "lseg-fcf", label: "FCF Yield Fair Value (Base Method)", value: selected.valuation.fcfFairValue, format: "currency", description: "Base-blend method. Forward equity FCF per share capitalized at the target FCF yield." },
      { key: "lseg-pe", label: "Forward P/E Fair Value (Base Method)", value: selected.valuation.peFairValue, format: "currency", description: "Base-blend method. Forward adjusted EPS multiplied by the visible target P/E cross-check." },
      { key: "lseg-operating-sotp", label: "Selected Operating SOTP (Base Blend)", value: selected.valuation.operatingSotpFairValue, format: "currency", description: `Base-blend method. Selected operating SOTP policy is ${selected.valuation.selectedSotpPolicy}. Strategic optionality remains outside the base blend.` },
      { key: "lseg-base-operating-sotp", label: "Base Operating SOTP (Reference)", value: selected.valuation.baseOperatingSotpFairValue, format: "currency", description: "Reference operating SOTP using the base multiple set, shown even when the selected underwriting policy is more conservative." },
      { key: "lseg-blended", label: "Blended Fair Value (Base Blend Output)", value: selected.valuation.blendedFairValue, format: "currency", description: "Base fair value using DCF, FCF yield, forward P/E, and the selected operating SOTP policy. Strategic SOTP is excluded." },
      { key: "lseg-strategic-sotp", label: "Strategic / Activist SOTP (Optionality)", value: selected.valuation.strategicSotpFairValue, format: "currency", description: "Optionality case only. Analytical split, portfolio review, and activist-style strategic upside are not included in the base blended fair value." },
      { key: "lseg-probability", label: "Probability-Weighted Fair Value (Overlay)", value: probabilityWeightedFairValue, format: "currency", description: "Overlay / diagnostic only. Scenario probabilities are informed by diagnostics, but this does not replace the base blended fair value." },
    ],
    expectedReturnBridge: [
      { key: "operating-cagr", label: "Operating Contribution", value: selected.valuation.operatingContributionToEpsCagr, format: "percent", description: "Revenue and volume/mix contribution to 3Y EPS CAGR." },
      { key: "margin-cagr", label: "Margin Contribution", value: selected.valuation.marginContributionToEpsCagr, format: "percent", description: "Incremental EPS CAGR driven by margin expansion." },
      { key: "buyback-cagr", label: "Buyback Contribution", value: selected.valuation.buybackContributionToEpsCagr, format: "percent", description: "EPS CAGR supported by share count reduction." },
      { key: "tax-interest-drag", label: "Tax / Interest / FX", value: selected.valuation.taxInterestFxDrag, format: "percent", description: "Residual drag after operating and buyback contributions." },
      { key: "dividend-yield", label: "Dividend Yield", value: selected.assumptions.dividendYield, format: "percent", description: "Dividend component of total return." },
      { key: "multiple-effect", label: "Exit Multiple", value: Math.pow(safeRatio(selected.assumptions.exitPe, selected.assumptions.targetPe), 1 / 3) - 1, format: "percent", description: "Annualized effect of moving from forward P/E to the year-three exit P/E." },
    ],
    customSummary:
      `${scenario} case uses ${selected.dcf.cashFlowTaxonomy.dcfMethod === "wacc_unlevered" ? "unlevered FCF + WACC" : "equity FCF + cost of equity"} for DCF, equity FCF/share for yield valuation, ${selected.valuation.selectedSotpPolicy} as the operating SOTP policy for the blend, and keeps strategic optionality outside the base fair value.`,
    sensitivityTables: [
      {
        title: "Forward P/E x Forward EPS",
        table: buildSensitivityTable(
          "P/E",
          "Forward EPS",
          [selected.assumptions.targetPe - 2, selected.assumptions.targetPe - 1, selected.assumptions.targetPe, selected.assumptions.targetPe + 1, selected.assumptions.targetPe + 2],
          [selected.valuation.forwardAdjustedEps * 0.94, selected.valuation.forwardAdjustedEps * 0.97, selected.valuation.forwardAdjustedEps, selected.valuation.forwardAdjustedEps * 1.03, selected.valuation.forwardAdjustedEps * 1.06],
          (pe, eps) => pe * eps,
        ),
      },
      {
        title: "FCF Yield x FCF / Share",
        table: buildSensitivityTable(
          "FCF Yield",
          "FCF / Share",
          [selected.assumptions.targetFcfYield - 0.0075, selected.assumptions.targetFcfYield - 0.0025, selected.assumptions.targetFcfYield, selected.assumptions.targetFcfYield + 0.0025, selected.assumptions.targetFcfYield + 0.0075],
          [selected.valuation.forwardFcfPerShare * 0.94, selected.valuation.forwardFcfPerShare * 0.97, selected.valuation.forwardFcfPerShare, selected.valuation.forwardFcfPerShare * 1.03, selected.valuation.forwardFcfPerShare * 1.06],
          (yieldRate, fcfPerShare) => fcfPerShare / Math.max(yieldRate, 0.001),
        ),
      },
      {
        title: "WACC x Terminal Growth",
        table: dcfSensitivity,
      },
      {
        title: "Operating SOTP Multiple x Forward EBITDA",
        table: buildSensitivityTable(
          "EV / EBITDA",
          "Forward EBITDA",
          [selected.operatingSotp.impliedGroupEvToEbitda - 1.5, selected.operatingSotp.impliedGroupEvToEbitda - 0.75, selected.operatingSotp.impliedGroupEvToEbitda, selected.operatingSotp.impliedGroupEvToEbitda + 0.75, selected.operatingSotp.impliedGroupEvToEbitda + 1.5],
          [(selected.margin.groupRows[0]?.adjustedEbitda ?? 1) * 0.94, (selected.margin.groupRows[0]?.adjustedEbitda ?? 1) * 0.97, selected.margin.groupRows[0]?.adjustedEbitda ?? 1, (selected.margin.groupRows[0]?.adjustedEbitda ?? 1) * 1.03, (selected.margin.groupRows[0]?.adjustedEbitda ?? 1) * 1.06],
          (multiple, ebitda) => safeRatio((multiple * ebitda) - selected.period.netDebt - selected.period.minorityInterest, selected.period.weightedAverageShares),
        ),
      },
    ],
    peFairValue: selected.valuation.peFairValue,
    fcfFairValue: selected.valuation.fcfFairValue,
    dcfValue: selected.valuation.dcfValue,
    sotpFairValue: selected.valuation.operatingSotpFairValue,
    operatingSotpFairValue: selected.valuation.operatingSotpFairValue,
    conservativeOperatingSotpFairValue: selected.valuation.conservativeOperatingSotpFairValue,
    baseOperatingSotpFairValue: selected.valuation.baseOperatingSotpFairValue,
    premiumOperatingSotpFairValue: selected.valuation.premiumOperatingSotpFairValue,
    strategicSotpFairValue: selected.valuation.strategicSotpFairValue,
    strategicUpsideFairValue: selected.valuation.strategicUpsideFairValue,
    strategicOptionalityPerShare: selected.valuation.strategicOptionalityPerShare,
    coreValueExSotp: selected.valuation.coreValueExSotp,
    operatingSotpUpliftVsCore: selected.valuation.operatingSotpUpliftVsCore,
    blendedFairValue25Sotp: selected.valuation.blendedFairValue25Sotp,
    blendedFairValueHalfSotp: selected.valuation.blendedFairValueHalfSotp,
    blendedFairValue75Sotp: selected.valuation.blendedFairValue75Sotp,
    blendedFairValueExSotp: selected.valuation.blendedFairValueExSotp,
    selectedSotpForBlended: selected.valuation.selectedSotpForBlended,
    selectedSotpPolicy: selected.valuation.selectedSotpPolicy,
    reasonForSelectedSotpPolicy: selected.valuation.reasonForSelectedSotpPolicy,
    recommendedFairValue: selected.valuation.recommendedFairValue,
    recommendedFairValueMethod: selected.valuation.recommendedFairValueMethod,
    recommendedFairValueReason: selected.valuation.recommendedFairValueReason,
    valuationRangeLow: selected.valuation.valuationRangeLow,
    valuationRangeBase: selected.valuation.valuationRangeBase,
    valuationRangeHigh: selected.valuation.valuationRangeHigh,
    primaryUnderwritingValue: selected.valuation.primaryUnderwritingValue,
    secondaryUpsideValue: selected.valuation.secondaryUpsideValue,
    strategicOptionalityValue: selected.valuation.strategicOptionalityValue,
    sotpWarnings: selected.operatingSotp.sotpWarnings,
    sotpAudit: selected.operatingSotp.audit,
    blendedFairValue: selected.valuation.blendedFairValue,
    probabilityWeightedFairValue,
    targetPrice3Y: selected.valuation.targetPrice3Y,
    expectedReturn3Y: selected.valuation.expectedCagr3Y,
    upsideDownside: selected.valuation.upsideDownside,
    methodDispersion: selected.valuation.methodDispersion,
    overallIntegrityScore: selected.integrity.overallIntegrityScore,
    sotpIntegrityScore: selected.integrity.sotpIntegrityScore,
    sotpConfidenceScore: selected.integrity.sotpConfidenceScore,
    dataQualityScore: selected.integrity.dataQualityScore,
    recommendedValuationConfidence: selected.integrity.recommendedValuationConfidence,
    integrityScore: selected.integrity.overallIntegrityScore,
  };
}

export function buildLsegDashboardData(data: LsegDataset, periodId: string, scenario: Scenario) {
  const dataset = resolveLsegDataset(data);
  const selected = buildScenarioCalculation(dataset, periodId, scenario);
  const valuation = calculateLsegValuation(dataset, periodId, scenario);
  const summary = calculateLsegSummary(dataset, periodId);
  const scenarioCases: Record<Scenario, LsegScenarioCalculation> = {
    Bear: buildScenarioCalculation(dataset, periodId, "Bear"),
    Base: buildScenarioCalculation(dataset, periodId, "Base"),
    Bull: buildScenarioCalculation(dataset, periodId, "Bull"),
  };
  const scenarioProbabilities = normalizeScenarioProbabilities(scenarioCases.Base.quality);
  const warnings = validateLsegData(dataset, periodId, selected, [
    ...buildLsegDataSourceWarnings(dataset),
    ...(valuation.validationWarnings ?? []),
  ]);
  const readThrough = buildInvestmentReadThrough(selected);
  const effectiveSourceType = resolveLsegEffectiveDataSourceType(dataset);

  const dataStatus: DataStatus = {
    sourceType: effectiveSourceType,
    lastUpdated: dataset.marketData.priceDate,
    missingFields: [],
    validationWarnings: warnings,
    valuationReliable: !warnings.some((warning) => warning.severity === "high"),
  };

  const segmentForecast = selected.revenue.groupRevenueByYear.map((groupPoint) => ({
    fiscalYear: groupPoint.fiscalYear,
    revenue: groupPoint.revenue,
    growth: groupPoint.growth,
    marketsBridge: groupPoint.marketsBridge,
    segments: selected.revenue.rows.filter((row) => row.fiscalYear === groupPoint.fiscalYear),
    margins: selected.margin.segmentRows.filter((row) => row.fiscalYear === groupPoint.fiscalYear),
  }));

  const epsBridge = (() => {
    const year1 = selected.buyback.rows[0];
    const year1Margin = selected.margin.groupRows[0];
    if (!year1 || !year1Margin) return [];
    const operatingProfitContribution =
      ((year1Margin.adjustedOperatingProfit - selected.period.adjustedOperatingProfit) * (1 - selected.assumptions.taxRate)) /
      Math.max(year1.averageDilutedShares, 1);
    const marginExpansionContribution =
      ((year1Margin.revenue * (year1Margin.adjustedEbitdaMargin - selected.period.adjustedEbitdaMargin)) * (1 - selected.assumptions.taxRate)) /
      Math.max(year1.averageDilutedShares, 1);
    const revenueVolumeContribution = operatingProfitContribution - marginExpansionContribution;
    const buybackContribution = year1.buybackEpsAccretion;
    const totalGrowth = year1.adjustedEps - selected.period.adjustedEps;
    const taxInterestOther = totalGrowth - revenueVolumeContribution - marginExpansionContribution - buybackContribution;
    return [
      { label: "Prior Year EPS", value: selected.period.adjustedEps, type: "start" as const },
      { label: "Revenue / Mix Contribution", value: revenueVolumeContribution, type: "change" as const },
      { label: "Margin Expansion", value: marginExpansionContribution, type: "change" as const },
      { label: "Buyback", value: buybackContribution, type: "change" as const },
      { label: "Tax / Interest / NCI", value: taxInterestOther, type: "change" as const },
      { label: "Current Year EPS", value: year1.adjustedEps, type: "end" as const },
    ];
  })();

  return {
    period: selected.period,
    marketData: dataset.marketData,
    summary,
    dataStatus,
    readThrough,
    scenarioCases,
    scenarioProbabilities,
    qualityDiagnostics: selected.quality,
    valuation,
    warnings,
    segmentForecast,
    revenueEngine: selected.revenue,
    marginEngine: selected.margin,
    fcfEngine: selected.fcf,
    buybackEngine: selected.buyback,
    waccBuild: selected.wacc,
    dcf: selected.dcf,
    operatingSotp: selected.operatingSotp,
    conservativeOperatingSotp: selected.conservativeOperatingSotp,
    baseOperatingSotp: selected.baseOperatingSotp,
    premiumOperatingSotp: selected.premiumOperatingSotp,
    strategicSotp: selected.strategicSotp,
    consensusComparison: selected.consensusComparison,
    marketImplied: selected.marketImplied,
    integrity: selected.integrity,
    thesis: selected.thesis,
    peers: dataset.peers,
    peerDataQuality: {
      fetchedAt: lsegPeerPopulationSummary.fetchedAt,
      fetchedDate: lsegPeerPopulationSummary.fetchedDate,
      yfinancePopulatedPeers: lsegPeerPopulationSummary.populatedTickers,
      manualFallbackPeers: lsegPeerPopulationSummary.manualFallbackTickers,
      warnings: lsegPeerLayerWarnings.map((warning) => ({
        id: warning.id,
        title: warning.id.replace(/^lseg-peer-/, "").replace(/-/g, " "),
        detail: warning.message,
        severity: warning.severity,
      })),
      notes: [
        "Peer multiples from yfinance are used as a dated external cross-check.",
        "SOTP guardrails remain manually curated unless explicitly changed.",
        "Mixed-currency absolute values are not aggregated; ratios are used for comparison.",
      ],
    },
    kpi: dataset.kpis.find((item) => item.periodId === periodId) ?? dataset.kpis[dataset.kpis.length - 1],
    tradewebMonthly: dataset.tradewebMonthly,
    epsBridge,
    moatScore: selected.quality.overallQualityScore,
  };
}

export function validateLsegData(
  data: LsegDataset,
  periodId: string,
  selected = buildScenarioCalculation(data, periodId, "Base"),
  valuationWarnings: ValidationWarning[] = [],
): ValidationWarning[] {
  const period = selected.period;
  const segmentRows = data.segmentFinancials.filter((row) => row.periodId === periodId && row.taxonomy === "reported_2025");
  const segmentRevenueSum = segmentRows.reduce((sum, row) => sum + row.revenue, 0);
  const segmentEbitdaSum = segmentRows.reduce((sum, row) => sum + row.adjustedEbitda, 0);
  const warnings: ValidationWarning[] = [...valuationWarnings];

  if (Math.abs(segmentRevenueSum - period.totalIncomeExcludingRecoveries) > 450) {
    warnings.push({
      id: "lseg-revenue-reconcile",
      title: "Reported segment revenue does not reconcile tightly to group total income",
      detail: "The reported taxonomy should reconcile to total income excluding recoveries within a reasonable tolerance before the operating SOTP is trusted.",
      severity: "medium",
    });
  }
  if (Math.abs(segmentEbitdaSum - period.adjustedEbitda) > 125) {
    warnings.push({
      id: "lseg-ebitda-reconcile",
      title: "Reported segment EBITDA does not reconcile tightly to group EBITDA",
      detail: "Operating SOTP and margin bridge outputs depend on segment EBITDA tying back to the group anchor.",
      severity: "medium",
    });
  }
  selected.quality.riskFlags.forEach((flag, index) => {
    warnings.push({
      id: `lseg-quality-flag-${index}`,
      title: "Quality diagnostics risk flag",
      detail: flag,
      severity: "low",
    });
  });
  return uniqueWarnings(warnings);
}
