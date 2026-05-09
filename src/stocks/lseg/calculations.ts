import type { DashboardInterpretation, DataStatus, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { safeDivide } from "../../utils/financialMath";
import { checkExtremeGrowthRates, checkImpossibleCagrCombination, checkPeSanity, checkValuationReliability } from "../../utils/validation";
import { buildPriceValidationWarnings, computeExpectedShareholderCagr, computeUpsideDownside, getCanonicalCurrentPrice } from "../../utils/valuation";
import { lsegMockData } from "./data";

export type LsegDataset = typeof lsegMockData;
export type LsegValuationAssumptions = {
  currentPrice: number;
  forwardAdjustedEps: number;
  targetPe: number;
  equityFcfPerShare: number;
  targetFcfYield: number;
  organicIncomeGrowth: number;
  ebitdaMarginExpansionBps: number;
  wacc: number;
  terminalGrowth: number;
  refinitivSynergyUplift: number;
  swapclearEpsContribution: number;
  capexIntensity: number;
  exitPe: number;
  dividendYield: number;
};

export const defaultLsegValuationAssumptions: LsegValuationAssumptions = {
  currentPrice: getCanonicalCurrentPrice("LSEG", 107.8),
  forwardAdjustedEps: 4.73,
  targetPe: 25,
  equityFcfPerShare: 4.58,
  targetFcfYield: 0.04,
  organicIncomeGrowth: 0.07,
  ebitdaMarginExpansionBps: 75,
  wacc: 0.08,
  terminalGrowth: 0.025,
  refinitivSynergyUplift: 0.008,
  swapclearEpsContribution: 0.45,
  capexIntensity: 0.1,
  exitPe: 24,
  dividendYield: 0.012,
};

export function getLsegPeriods() {
  return lsegMockData.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getLatestLsegPeriod(periodId: string) {
  return lsegMockData.periods.find((period) => period.id === periodId) ?? lsegMockData.periods[lsegMockData.periods.length - 1];
}

export function calculateLsegSummary(data: LsegDataset, periodId: string): SummaryMetric[] {
  const period = getLatestLsegPeriod(periodId);
  return [
    metric("Forward Adjusted EPS", period.forwardAdjustedEps, period.epsGrowth, "currency", "Headline EPS estimate supported by recurring subscription and post-trade economics.", "Actual"),
    metric("Organic Revenue Growth", period.organicRevenueGrowth, period.yoyTrend, "percent", "Underlying recurring growth across data, index, and clearing products.", "Actual"),
    metric("EBITDA Margin", period.ebitdaMargin, period.yoyTrend / 2, "percent", "Operating leverage from subscription scale and synergy delivery.", "Derived"),
    metric("Equity FCF", period.equityFcf, period.equityFcf * 0.08, "currency", "Cash earnings quality after capex and working capital.", "Derived"),
    metric("FCF Yield", period.fcfYield, 0.002, "percent", "Cash support for valuation and capital allocation.", "Derived"),
    metric("Net Debt / EBITDA", period.netDebtToEbitda, -0.2, "multiple", "Leverage path matters for equity duration and buyback flexibility.", "Actual"),
    metric("Base Fair Value", period.fairValueBase, period.currentPrice, "currency", "Scenario fair value from the stock-specific valuation stack.", "Derived"),
    metric("Base Upside", period.impliedUpsideBase, period.yoyTrend, "percent", "Upside relative to current price.", "Derived"),
  ];
}

export function calculateLsegValuation(data: LsegDataset, periodId: string, scenario: Scenario, assumptions?: Partial<LsegValuationAssumptions>): ValuationResult {
  const period = getLatestLsegPeriod(periodId);
  const merged = { ...defaultLsegValuationAssumptions, ...assumptions };
  const currentPrice = merged.currentPrice || getCanonicalCurrentPrice("LSEG", period.currentPrice);
  const annualizationFactor = period.periodType === "FY" ? 1 : period.periodType === "HY" ? 2 : 4;
  const annualForwardEps = assumptions?.forwardAdjustedEps ?? period.forwardAdjustedEps * annualizationFactor;
  const annualEquityFcfTotal = period.equityFcf * annualizationFactor;
  const impliedShares = Math.max(safeDivide(annualEquityFcfTotal, Math.max(merged.equityFcfPerShare, 0.1)), 1);
  const peFairValue = merged.forwardAdjustedEps * merged.targetPe;
  const fcfFairValue = merged.equityFcfPerShare / merged.targetFcfYield;
  const annualFcfGrowth = merged.organicIncomeGrowth + merged.ebitdaMarginExpansionBps / 10000 - merged.capexIntensity * 0.15 + merged.refinitivSynergyUplift;
  let yearFcf = merged.equityFcfPerShare;
  let dcfValue = 0;
  for (let year = 1; year <= 5; year += 1) {
    yearFcf *= 1 + annualFcfGrowth;
    dcfValue += yearFcf / ((1 + merged.wacc) ** year);
  }
  const terminalValue = (yearFcf * (1 + merged.terminalGrowth)) / Math.max(merged.wacc - merged.terminalGrowth, 0.01);
  dcfValue += terminalValue / ((1 + merged.wacc) ** 5);
  const segmentRows = data.segmentFinancials.filter((row) => row.periodId === period.id);
  const segmentMultiples: Record<string, number> = {
    "Data & Analytics": 18,
    "FTSE Russell": 22,
    "Risk Intelligence": 14,
    "Capital Markets": 13,
    "Post Trade": 18,
    Other: 6,
  };
  const sotpComponents = segmentRows.reduce<Record<string, number>>((acc, row) => {
    const annualOpProfit = row.operatingProfit * annualizationFactor;
    acc[row.segment] = safeDivide(annualOpProfit * 0.78 * (segmentMultiples[row.segment] ?? 12), impliedShares);
    return acc;
  }, {});
  const netDebtAdjustment = -(period.netDebtToEbitda * period.ebitdaMargin * 12);
  const sotpFairValue =
    (sotpComponents["Data & Analytics"] ?? 0) +
    (sotpComponents["FTSE Russell"] ?? 0) +
    (sotpComponents["Risk Intelligence"] ?? 0) +
    (sotpComponents["Capital Markets"] ?? 0) +
    (sotpComponents["Post Trade"] ?? 0) +
    (sotpComponents.Other ?? 0) +
    netDebtAdjustment;
  const expectedPrice3Y = merged.forwardAdjustedEps * ((1 + merged.organicIncomeGrowth + merged.refinitivSynergyUplift) ** 3) * merged.exitPe;
  const cumulativeDividends = currentPrice * merged.dividendYield * 3;
  const expected3YReturn = computeExpectedShareholderCagr(expectedPrice3Y, currentPrice, cumulativeDividends);
  const blendedFairValue = (peFairValue * 0.35) + (fcfFairValue * 0.35) + (dcfValue * 0.2) + (sotpFairValue * 0.1);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((item) => ({
    scenario: item,
    fairValue: blendedFairValue,
    targetPrice3Y: expectedPrice3Y,
    cumulativeDividends,
    upsideDownside: computeUpsideDownside(blendedFairValue, currentPrice),
    expectedReturn3Y: expected3YReturn,
    summary: item === scenario ? "Selected scenario" : undefined,
  }));
  const flagged = fairValues.find((row) => row.scenario === "Bull")!.upsideDownside > 0.35;
  const validationWarnings = [
    ...buildPriceValidationWarnings("LSEG", currentPrice, "2026-05-09"),
    ...checkPeSanity(peFairValue, 110, 125, "LSEG"),
    ...checkImpossibleCagrCombination(computeUpsideDownside(blendedFairValue, currentPrice), expected3YReturn),
    ...(annualForwardEps < 3 ? [{
      id: "lseg-quarterly-eps-used",
      title: "Quarterly or half-year EPS may be leaking into annual valuation",
      detail: "Valuation expects annual EPS in GBP. Inputs were normalized, but the selected period is not annual.",
      severity: "medium" as const,
    }] : []),
  ];
  return {
    warning: flagged ? "Valuation may be aggressive if post-trade or index growth assumptions are too optimistic." : undefined,
    currentPrice,
    validationWarnings,
    methodCards: [
      { key: "pe-fair", label: "P/E Fair Value", value: peFairValue, format: "currency", description: "Forward adjusted EPS times target P/E." },
      { key: "fcf-fair", label: "FCF Yield Fair Value", value: fcfFairValue, format: "currency", description: "Equity FCF per share capitalized at the target FCF yield." },
      { key: "dcf-fair", label: "DCF Fair Value", value: dcfValue, format: "currency", description: "Simplified 5-year FCF forecast discounted by WACC plus terminal value, without adding SwapClear twice." },
      { key: "sotp-fair", label: "SOTP Fair Value", value: sotpFairValue, format: "currency", description: "Segment-based SOTP across Data & Analytics, FTSE Russell, Risk Intelligence, Capital Markets, Post Trade, and net debt." },
      { key: "expected-price", label: "3Y Expected Price", value: expectedPrice3Y, format: "currency", description: "Forward EPS compounded by growth and valued at exit P/E." },
      { key: "blended", label: "Blended Fair Value", value: blendedFairValue, format: "currency", description: "Weighted blend: P/E 35%, FCF 35%, DCF 20%, SOTP 10%." },
      { key: "upside", label: "Upside / Downside", value: computeUpsideDownside(blendedFairValue, currentPrice), format: "percent", description: "Blended fair value versus current price." },
      { key: "expected-cagr", label: "Expected 3Y CAGR", value: expected3YReturn, format: "percent", description: "Shareholder CAGR from target price plus cumulative dividends." },
    ],
    expectedReturnBridge: [
      { key: "eps-growth", label: "EPS Growth", value: merged.organicIncomeGrowth, format: "percent", description: "Core earnings growth contribution." },
      { key: "dividend", label: "Dividend Yield", value: merged.dividendYield, format: "percent", description: "Cash return from dividends." },
      { key: "fcf", label: "FCF Conversion Improvement", value: Math.max(0, merged.ebitdaMarginExpansionBps / 10000 - merged.capexIntensity * 0.1), format: "percent", description: "Margin expansion less capex intensity drag." },
      { key: "multiple", label: "Multiple Effect", value: Math.pow(safeDivide(merged.exitPe, merged.targetPe), 1 / 3) - 1, format: "percent", description: "Target to exit multiple change." },
      { key: "synergy", label: "Refinitiv Synergy Contribution", value: merged.refinitivSynergyUplift, format: "percent", description: "Refinitiv synergy contribution. SwapClear is already embedded inside EPS and Post Trade segment economics." },
    ],
    fairValues,
    customSummary: scenario ? `${scenario} scenario defaults loaded.` : undefined,
    sensitivityTables: [
      {
        title: "Forward P/E x Forward EPS",
        table: buildSensitivityTable("P/E", "Forward EPS", [merged.targetPe - 4, merged.targetPe - 2, merged.targetPe, merged.targetPe + 2, merged.targetPe + 4], [merged.forwardAdjustedEps * 0.9, merged.forwardAdjustedEps * 0.95, merged.forwardAdjustedEps, merged.forwardAdjustedEps * 1.05, merged.forwardAdjustedEps * 1.1], (pe, eps) => pe * eps),
      },
      {
        title: "FCF Yield x FCF / Share",
        table: buildSensitivityTable("FCF Yield", "FCF / Share", [merged.targetFcfYield - 0.01, merged.targetFcfYield - 0.005, merged.targetFcfYield, merged.targetFcfYield + 0.005, merged.targetFcfYield + 0.01], [merged.equityFcfPerShare * 0.9, merged.equityFcfPerShare * 0.95, merged.equityFcfPerShare, merged.equityFcfPerShare * 1.05, merged.equityFcfPerShare * 1.1], (yieldRate, fcfPerShare) => fcfPerShare / yieldRate),
      },
      {
        title: "EPS CAGR x Exit Multiple",
        table: buildSensitivityTable("Organic Growth", "Exit P/E", [merged.organicIncomeGrowth - 0.02, merged.organicIncomeGrowth - 0.01, merged.organicIncomeGrowth, merged.organicIncomeGrowth + 0.01, merged.organicIncomeGrowth + 0.02], [merged.exitPe - 3, merged.exitPe - 1, merged.exitPe, merged.exitPe + 1, merged.exitPe + 3], (growth, exit) => (merged.forwardAdjustedEps * ((1 + growth) ** 3)) * exit),
      },
      {
        title: "WACC x Terminal Growth DCF",
        table: buildSensitivityTable("WACC", "Terminal Growth", [merged.wacc - 0.01, merged.wacc - 0.005, merged.wacc, merged.wacc + 0.005, merged.wacc + 0.01], [merged.terminalGrowth - 0.01, merged.terminalGrowth - 0.005, merged.terminalGrowth, merged.terminalGrowth + 0.005, merged.terminalGrowth + 0.01], (wacc, terminal) => {
          const stableFcf = merged.equityFcfPerShare * ((1 + annualFcfGrowth) ** 5);
          const tv = (stableFcf * (1 + terminal)) / Math.max(wacc - terminal, 0.01);
          return tv / ((1 + wacc) ** 5);
        }),
      },
    ],
  };
}

export function buildLsegDashboardData(data: LsegDataset, periodId: string, scenario: Scenario) {
  const period = getLatestLsegPeriod(periodId);
  const segments = data.segmentFinancials.filter((row) => row.periodId === periodId);
  const subscriptions = data.subscriptionMetrics.filter((row) => row.periodId === periodId || row.periodId === period.periodType.toLowerCase());
  const epsBridge = data.epsBridge.filter((row) => row.periodId === periodId);
  const epsQuality = data.epsQuality.find((row) => row.periodId === periodId) ?? data.epsQuality[0];
  const fcfSeries = data.fcfMetrics.filter((row) => row.periodId === periodId || row.periodId.startsWith(period.periodType.toLowerCase()) || row.periodId.startsWith(`fy${period.fiscalYear.toString().slice(-2)}`));
  const synergies = data.synergyMetrics.filter((row) => row.periodId === periodId || row.periodId.startsWith(period.periodType.toLowerCase()) || row.periodId.startsWith(`fy${period.fiscalYear.toString().slice(-2)}`));
  const postTrade = data.postTradeScenarios.find((row) => row.scenario === scenario) ?? data.postTradeScenarios[1];
  const valuation = calculateLsegValuation(data, periodId, scenario);
  const warnings = validateLsegData(data, periodId);
  const peerRows = data.peerMetrics.map((row) => ({
    peer: row.name,
    category: row.category,
    revenueGrowth: row.revenueGrowth,
    ebitdaMargin: row.ebitdaMargin,
    fcfYield: row.fcfYield,
    forwardPe: row.forwardPe,
    subscriptionGrowth: row.subscriptionGrowth,
    indexGrowth: row.indexGrowth,
    clearingTradingGrowth: row.clearingTradingGrowth,
    signal: row.signal,
  }));
  const peerScore = peerRows.reduce((sum, row) => sum + (row.signal === "Positive" ? 1 : row.signal === "Negative" ? -1 : 0), 0);
  const latestSubscription = subscriptions[subscriptions.length - 1];
  const readThrough: DashboardInterpretation[] = [
    { title: "Is EPS growth high quality?", signal: epsQuality.qualityScore >= 75 ? "Positive" : "Neutral", detail: epsQuality.qualityScore >= 75 ? "Operating profit and recurring revenue are still the dominant EPS drivers." : "Synergies and financial levers still matter more than ideal.", badge: "Derived" },
    { title: "Is Data & Analytics subscription quality strong?", signal: latestSubscription?.qualityScore && latestSubscription.qualityScore >= 75 ? "Positive" : "Neutral", detail: latestSubscription?.qualityScore && latestSubscription.qualityScore >= 75 ? "ASV growth and retention imply high recurring earnings quality." : "Workspace and retention need continued proof.", badge: "Actual" },
    { title: "Are FTSE Russell and Post Trade helping mix?", signal: period.organicRevenueGrowth > 0.06 ? "Positive" : "Neutral", detail: "Index and clearing economics remain the cleanest high-margin mix contributors.", badge: "Derived" },
    { title: "Are peers supportive?", signal: peerScore >= 4 ? "Positive" : peerScore <= 0 ? "Negative" : "Neutral", detail: peerScore >= 4 ? "Bloomberg, FactSet, S&P, MSCI, CME, and ICE remain constructive read-throughs." : "Peer setup is mixed and needs more confirmation.", badge: "Actual" },
    { title: "Is valuation attractive?", signal: valuation.warning ? "Needs Review" : period.impliedUpsideBase > 0.08 ? "Positive" : "Neutral", detail: valuation.warning ?? (period.impliedUpsideBase > 0.08 ? "Base-case upside still exists if recurring growth quality holds." : "The market already prices in a fair amount of execution."), badge: valuation.warning ? "Needs Review" : "Derived" },
  ];
  const dataStatus: DataStatus = {
    sourceType: "mock",
    lastUpdated: period.label,
    missingFields: [],
    validationWarnings: warnings,
    valuationReliable: !valuation.warning,
  };
  return {
    summary: calculateLsegSummary(data, periodId),
    dataStatus,
    readThrough,
    segments,
    subscriptions,
    epsBridge,
    epsQuality,
    fcfSeries,
    synergies,
    postTrade,
    valuation,
    peerRows,
  };
}

export function validateLsegData(data: LsegDataset, periodId: string): ValidationWarning[] {
  const period = getLatestLsegPeriod(periodId);
  return [
    ...checkExtremeGrowthRates([{ label: "EPS growth", value: period.epsGrowth }, { label: "Organic revenue growth", value: period.organicRevenueGrowth }], 0.3),
    ...checkValuationReliability(period.impliedUpsideBase > 0.2),
  ];
}

function metric(label: string, value: number, delta: number, format: SummaryMetric["format"], description: string, badge: SummaryMetric["badge"]): SummaryMetric {
  return { key: label.toLowerCase().replace(/\s+/g, "-"), label, value, delta, format, description, badge };
}
