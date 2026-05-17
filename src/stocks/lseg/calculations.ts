import type { DataSourceType, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { defaultLsegCockpitAssumptions, lsegScenarioAssumptions } from "./data/assumptions";
import { lsegCockpitDataset } from "./data/cockpitDataset";
import { calculateLsegCapitalMarketsEngine } from "./engines/capitalMarketsEngine";
import { calculateLsegDataAnalyticsEngine } from "./engines/dataAnalyticsEngine";
import { calculateLsegIndexEngine } from "./engines/indexEngine";
import { calculateLsegPostTradeEngine } from "./engines/postTradeEngine";
import { calculateLsegRefinitivSynergyEngine } from "./engines/refinitivSynergyEngine";
import { calculateLsegRiskRedTeamEngine } from "./engines/riskRedTeamEngine";
import { calculateLsegSegmentEngine } from "./engines/segmentEngine";
import { calculateLsegTranscriptIntelligenceEngine } from "./engines/transcriptIntelligenceEngine";
import { calculateLsegValuationEngine } from "./engines/valuationEngine";
import type { LsegCockpitDataset, LsegValuationAssumptions } from "./types";

export { defaultLsegCockpitAssumptions } from "./data/assumptions";
export { lsegScenarioAssumptions } from "./data/assumptions";

type LsegRuntimeContext = {
  __lsegResolvedPeriod?: string;
  __lsegRequestedDataSourceType?: DataSourceType;
};

type LsegDatasetInput = LsegCockpitDataset & Partial<LsegRuntimeContext>;

function isLsegCockpitDataset(data: unknown): data is LsegDatasetInput {
  return Boolean(
    data &&
      typeof data === "object" &&
      "officialActuals" in data &&
      "segmentActuals" in data &&
      "managementGuidance" in data &&
      "forecastAssumptions" in data,
  );
}

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

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function resolveLsegDataset(data: unknown): LsegDatasetInput {
  return isLsegCockpitDataset(data) ? data : lsegCockpitDataset;
}

export function attachLsegRuntimeContext(
  data: LsegCockpitDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): LsegDatasetInput {
  return {
    ...data,
    __lsegResolvedPeriod: context.periodId,
    __lsegRequestedDataSourceType: context.dataSourceType,
  };
}

export function resolveLsegEffectiveDataSourceType(data: unknown): DataSourceType {
  const dataset = resolveLsegDataset(data);
  return dataset.__lsegRequestedDataSourceType === "manual" ? "manual" : "mock";
}

export function getDefaultLsegPeriod() {
  return "fy2025";
}

export function getLsegPeriods() {
  return [
    { value: "fy2025", label: "FY2025A" },
    { value: "fy2024", label: "FY2024A" },
  ];
}

export function resolveLsegPeriodFromData(data: unknown, fallback = getDefaultLsegPeriod()): string {
  const dataset = resolveLsegDataset(data);
  return dataset.__lsegResolvedPeriod ?? fallback;
}

export function calculateLsegSummary(data: unknown): SummaryMetric[] {
  const dataset = resolveLsegDataset(data);
  const latest = dataset.officialActuals.find((period) => period.periodId === "fy2025") ?? dataset.officialActuals[dataset.officialActuals.length - 1];
  const valuation = calculateLsegValuationEngine(dataset, "Base", defaultLsegCockpitAssumptions);

  return [
    metric("Current Price", dataset.marketData.currentPriceGbp, undefined, "currency", `Market data as of ${dataset.marketData.priceDate}.`, "Actual"),
    metric("Base Fair Value", valuation.fairValue, valuation.upsideDownside, "currency", "Blended FCFF DCF, FCF yield, SOTP, multiple and capped platform/risk overlay.", "Derived"),
    metric("Organic Growth", latest.organicConstantCurrencyGrowth, latest.organicConstantCurrencyGrowth - (dataset.officialActuals[0]?.organicConstantCurrencyGrowth ?? 0), "percent", "Official total income excluding recoveries organic constant-currency growth.", "Actual"),
    metric("Adj. EBITDA Margin", latest.adjustedEbitdaMargin, latest.adjustedEbitdaMargin - (dataset.officialActuals[0]?.adjustedEbitdaMargin ?? 0), "percent", "Official adjusted EBITDA margin.", "Actual"),
    metric("Equity FCF", latest.equityFreeCashFlow, undefined, "currency", "Official equity free cash flow, GBPm.", "Actual"),
    metric("Operating Net Debt / EBITDA", latest.leverage, undefined, "multiple", "Official leverage based on operating net debt / adjusted EBITDA.", "Actual"),
  ];
}

export function calculateLsegValuation(
  data: unknown,
  _periodId = getDefaultLsegPeriod(),
  scenario: Scenario = "Base",
  overrides?: Partial<LsegValuationAssumptions>,
): ValuationResult {
  const dataset = resolveLsegDataset(data);
  const assumptions = { ...defaultLsegCockpitAssumptions, ...overrides };
  const valuation = calculateLsegValuationEngine(dataset, scenario, assumptions);
  const warning: ValidationWarning | undefined = valuation.warnings[0];

  return {
    warning: warning?.detail,
    currentPrice: valuation.currentPrice,
    priceDate: valuation.priceDate,
    validationWarnings: valuation.warnings,
    fairValues: valuation.scenarioValues.map((row) => ({
      scenario: row.scenario,
      fairValue: row.fairValue,
      upsideDownside: row.upsideDownside,
      expectedReturn3Y: row.upsideDownside / 3 + (dataset.marketData.dividendYield ?? 0),
      targetPrice3Y: row.fairValue * (1 + (dataset.marketData.dividendYield ?? 0) * 3),
      cumulativeDividends: valuation.dividendBuyback.dividendCashCost / Math.max(assumptions.dilutedShares, 1) * 3,
      summary: dataset.scenarios[row.scenario].narrative,
    })),
    methodCards: valuation.methodBridge.map((row) => ({
      key: row.method.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: row.method,
      value: row.fairValue,
      format: "currency",
      description: `${(row.weight * 100).toFixed(0)}% weight. ${row.explanation}`,
      valuationBase: row.valuationBase,
      baseYear: row.baseYear,
      forecastYear: row.forecastYear,
      sourceConfidence: row.sourceConfidence,
    })),
    expectedReturnBridge: [
      {
        key: "upside-downside",
        label: "Upside / downside",
        value: valuation.upsideDownside,
        format: "percent",
        description: "Base fair value versus current market price.",
      },
      {
        key: "terminal-value-share",
        label: "DCF terminal value share",
        value: valuation.fcffDcf.terminalValuePctOfEnterpriseValue,
        format: "percent",
        description: "Validation warning threshold is 75% of enterprise value.",
      },
      {
        key: "fcff-conversion",
        label: "Average FCFF conversion",
        value: valuation.fcffDcf.averageFcffConversion,
        format: "percent",
        description: "Average forecast FCFF / adjusted EBITDA.",
      },
      {
        key: "platform-risk-overlay",
        label: "Moat less risk overlay",
        value: valuation.moat.cappedValuationAdjustment + valuation.risk.cappedRiskAdjustment,
        format: "percent",
        description: "Capped platform moat premium less capped red-team risk haircut.",
      },
      {
        key: "post-trade-forward-uplift",
        label: "Post Trade forward uplift",
        value: valuation.postTradeBridge.totalUplift,
        format: "currency",
        description: "Difference between the current snapshot valuation and the valuation after applying 2026-2045 SwapClear forward economics.",
      },
    ],
    customSummary: `Base cockpit fair value is £${valuation.fairValue.toFixed(2)} (${pct(valuation.upsideDownside)} upside/downside). The Post Trade / SwapClear layer bridges from £${valuation.postTradeBridge.snapshotFairValue.toFixed(2)} snapshot value to £${valuation.postTradeBridge.adjustedFairValue.toFixed(2)} after 2026-2045 forward economics. Official actuals, guidance, forecast assumptions, transcripts and research-only items are separated.`,
    sensitivityTables: [
      {
        title: "Scenario valuation bridge",
        table: [
          ["Scenario", "Fair value", "Upside/downside", "Probability"],
          ...valuation.scenarioValues.map((row) => [row.scenario, Number(row.fairValue.toFixed(2)), Number((row.upsideDownside * 100).toFixed(1)), Number((row.probability * 100).toFixed(0))]),
        ],
      },
      {
        title: "Method contribution",
        table: [
          ["Method", "Fair value", "Weight", "Contribution"],
          ...valuation.methodBridge.map((row) => [row.method, Number(row.fairValue.toFixed(2)), Number((row.weight * 100).toFixed(0)), Number(row.contribution.toFixed(2))]),
        ],
      },
      {
        title: "Post Trade / SwapClear forward economics bridge",
        table: [
          ["Bridge item", "GBP/share", "Detail"],
          ...valuation.postTradeBridge.rows.map((row) => [row.label, Number(row.valuePerShare.toFixed(2)), row.detail]),
        ],
      },
      {
        title: "Model QA: DCF year-one base audit",
        table: [
          ["Metric", "Value"],
          ["Latest audited actual revenue", Number(valuation.modelQaDiagnostics.dcfYearOneBaseAudit.latestAuditedActualRevenue.toFixed(1))],
          ["Event run-rate revenue", Number(valuation.modelQaDiagnostics.dcfYearOneBaseAudit.eventRunRateRevenue.toFixed(1))],
          ["Year-one DCF revenue before fix", Number(valuation.modelQaDiagnostics.dcfYearOneBaseAudit.yearOneRevenueBeforeFix.toFixed(1))],
          ["Year-one DCF revenue after fix", Number(valuation.modelQaDiagnostics.dcfYearOneBaseAudit.yearOneRevenueAfterFix.toFixed(1))],
          ["Implied growth vs audited before fix", Number((valuation.modelQaDiagnostics.dcfYearOneBaseAudit.impliedGrowthVsAuditedBeforeFix * 100).toFixed(1))],
          ["Implied growth vs audited after fix", Number((valuation.modelQaDiagnostics.dcfYearOneBaseAudit.impliedGrowthVsAuditedAfterFix * 100).toFixed(1))],
          ["Same-year growth suppressed", valuation.modelQaDiagnostics.dcfYearOneBaseAudit.sameYearGrowthSuppressed ? "Yes" : "No"],
        ],
      },
      {
        title: "Model QA: balance-sheet bridge audit",
        table: [
          ["Metric", "Value"],
          ["Net debt", Number(valuation.modelQaDiagnostics.balanceSheetBridgeAudit.netDebt.toFixed(1))],
          ["Lease liabilities", Number(valuation.modelQaDiagnostics.balanceSheetBridgeAudit.leaseLiabilities.toFixed(1))],
          ["Carried-forward lease liabilities", Number(valuation.modelQaDiagnostics.balanceSheetBridgeAudit.carriedForwardLeaseLiabilities.toFixed(1))],
          ["Gross per-share impact", Number(valuation.modelQaDiagnostics.balanceSheetBridgeAudit.grossPerShareImpact.toFixed(2))],
          ["Weighted valuation impact", Number(valuation.modelQaDiagnostics.balanceSheetBridgeAudit.weightedValuationImpact.toFixed(2))],
          ["Carry-forward source period", valuation.modelQaDiagnostics.balanceSheetBridgeAudit.sourcePeriodId ?? "n/a"],
        ],
      },
      {
        title: "Model QA: Post Trade driver audit",
        table: [
          ["Metric", "Value"],
          ["Snapshot FV before Post Trade layer", Number(valuation.modelQaDiagnostics.postTradeDriverAudit.snapshotFairValue.toFixed(2))],
          ["Final FV after Post Trade layer", Number(valuation.modelQaDiagnostics.postTradeDriverAudit.finalFairValue.toFixed(2))],
          ["Post Trade layer uplift", Number(valuation.modelQaDiagnostics.postTradeDriverAudit.uplift.toFixed(2))],
          ["Post Trade layer uplift percent", Number((valuation.modelQaDiagnostics.postTradeDriverAudit.upliftPct * 100).toFixed(1))],
        ],
      },
    ],
    dcfValue: valuation.fcffDcf.fairValuePerShare,
    fcfFairValue: valuation.fcfYield.impliedPrice,
    sotpFairValue: valuation.sotp.fairValuePerShare,
    peFairValue: valuation.multiples.peFairValue,
    blendedFairValue: valuation.fairValue,
    recommendedFairValue: valuation.fairValue,
    recommendedFairValueMethod: "LSEG cockpit weighted triangulation",
    recommendedFairValueReason: "Weighted FCFF DCF, normalized FCF yield, LSEG-specific SOTP, multiples and capped moat/risk overlay.",
    valuationRangeLow: valuation.valuationRangeLow,
    valuationRangeBase: valuation.fairValue,
    valuationRangeHigh: valuation.valuationRangeHigh,
    probabilityWeightedFairValue: valuation.scenarioValues.reduce((sum, row) => sum + row.fairValue * row.probability, 0),
    upsideDownside: valuation.upsideDownside,
  };
}

export function buildLsegDashboardData(data: unknown, _periodId = getDefaultLsegPeriod(), scenario: Scenario = "Base") {
  const dataset = resolveLsegDataset(data);
  const assumptions = defaultLsegCockpitAssumptions;
  const valuationEngine = calculateLsegValuationEngine(dataset, scenario, assumptions);
  const valuation = calculateLsegValuation(dataset, getDefaultLsegPeriod(), scenario, assumptions);
  const segment = calculateLsegSegmentEngine(dataset);
  const dataAnalytics = calculateLsegDataAnalyticsEngine(dataset);
  const index = calculateLsegIndexEngine(dataset);
  const postTrade = calculateLsegPostTradeEngine(dataset);
  const capitalMarkets = calculateLsegCapitalMarketsEngine(dataset);
  const refinitivSynergy = calculateLsegRefinitivSynergyEngine(dataset);
  const transcriptIntelligence = calculateLsegTranscriptIntelligenceEngine();
  const risk = calculateLsegRiskRedTeamEngine(assumptions);
  const latest = dataset.officialActuals.find((period) => period.periodId === "fy2025") ?? dataset.officialActuals[dataset.officialActuals.length - 1];

  return {
    dataset,
    latest,
    assumptions,
    scenarioDefinitions: lsegScenarioAssumptions,
    summary: calculateLsegSummary(dataset),
    valuation,
    valuationEngine,
    segment,
    dataAnalytics,
    index,
    postTrade,
    capitalMarkets,
    refinitivSynergy,
    transcriptIntelligence,
    risk,
    dataStatus: {
      sourceType: resolveLsegEffectiveDataSourceType(dataset),
      lastUpdated: dataset.buildDate,
      missingFields: [
        "Workspace seat count / pricing / retention are not disclosed as official actuals.",
        "Capital Markets vs Post Trade EBITDA split is analytical, not company-disclosed under 2025 Markets segment.",
        "Peer multiples are research-only placeholders unless refreshed from a market-data provider.",
      ],
      validationWarnings: valuationEngine.warnings,
      valuationReliable: valuationEngine.warnings.every((warning) => warning.severity !== "high"),
    },
    thesis: {
      summary:
        "LSEG is underwritten as financial market infrastructure plus financial data/workflow plus index IP plus clearing infrastructure, not as a generic exchange or EPS multiple stock.",
      debates: [
        "Is LSEG a data/workflow/infrastructure platform or still valued like a mixed exchange group?",
        "Has Refinitiv shifted from integration drag to platform compounding?",
        "Can Workspace and enterprise data challenge Bloomberg/FactSet/S&P workflow lock-in?",
        "Does FTSE Russell deserve a high-ROIC IP premium despite fee pressure?",
        "Is LCH a durable clearing moat or a regulated/rate-cycle utility?",
        "Does AI expand trusted data consumption or compress terminal pricing?",
        "Are buybacks value-creating while leverage, FX and Post Trade capital demands remain manageable?",
      ],
    },
  };
}
