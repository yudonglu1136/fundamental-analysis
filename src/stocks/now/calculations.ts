import type { Scenario, SummaryMetric, ValuationResult } from "../types";
import {
  buildPriceAnchorWarnings,
  buildSourceGapWarnings,
  buildValidationWarning,
  deriveValuationReliability,
  mapSourceStatusToDataQualityTag,
  mergeValidationWarnings,
} from "../../utils/validation";
import { nowScenarioPresets, defaultNowValuationAssumptions } from "./assumptions";
import { nowDataset } from "./data";
import type { NowDataset, NowFinancialPeriod, ValuationAssumptions } from "./model";

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function latestPeriod(data: NowDataset) { return [...data.periods].sort((a, b) => String(a.asOfDate ?? a.periodEndDate).localeCompare(String(b.asOfDate ?? b.periodEndDate)))[data.periods.length - 1]; }
function latestMetric(data: NowDataset) { return [...data.operatingMetrics].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))[data.operatingMetrics.length - 1]; }
function annualizePeriod(period: NowFinancialPeriod) { const m = period.periodType === "quarter" ? 4 : 1; return { revenue: period.revenue * m, operatingIncome: period.operatingIncome * m, netIncome: (period.netIncome ?? period.operatingIncome * 0.75) * m, freeCashFlow: (period.freeCashFlow ?? period.revenue * 0.33) * m, buybacks: (period.buybacks ?? 0) * m }; }
function methodCard(key: string, label: string, value: number, description: string) { return { key, label, value, format: "currency" as const, description }; }
function dcfValue(fcf: number, growth: number, terminalGrowth: number, discountRate: number, shares: number) { let pv = 0; let yearFcf = fcf; for (let year = 1; year <= 5; year += 1) { yearFcf *= 1 + Math.max(growth * (1 - (year - 1) * 0.10), terminalGrowth); pv += yearFcf / (1 + discountRate) ** year; } const terminal = (yearFcf * (1 + terminalGrowth)) / Math.max(discountRate - terminalGrowth, 0.025); return (pv + terminal / (1 + discountRate) ** 5) / shares; }

export function getNowPeriods() { return nowDataset.periods.map((period) => ({ value: period.id, label: period.label })); }
export function getDefaultNowPeriod() { return nowDataset.periods[nowDataset.periods.length - 1]?.id ?? "fy2026-q1"; }

export function calculateNowSummary(data: unknown): SummaryMetric[] {
  const dataset = (data as NowDataset) ?? nowDataset;
  const period = latestPeriod(dataset);
  const annualized = annualizePeriod(period);
  const metric = latestMetric(dataset);
  return [
    { key: "revenue", label: "Annualized Revenue", value: annualized.revenue, format: "currency", description: "Latest reported period annualized.", badge: mapSourceStatusToDataQualityTag(period.sourceStatus) },
    { key: "subscriptionGrowth", label: "Subscription Growth", value: metric?.subscriptionRevenueGrowth ?? 0, format: "percent", description: "Subscription revenue growth.", badge: "Derived" },
    { key: "crpoGrowth", label: "cRPO Growth", value: metric?.currentRpoGrowth ?? 0, format: "percent", description: "Current RPO growth as forward demand proxy.", badge: "Derived" },
    { key: "agentArr", label: "Agent ARR Proxy", value: metric?.agenticAiArr ?? 0, format: "currency", description: "Agentic AI ARR proxy pending official parser.", badge: "Placeholder" },
    { key: "fcfMargin", label: "FCF Margin", value: annualized.freeCashFlow / annualized.revenue, format: "percent", description: "Free cash flow conversion after capex.", badge: "Derived" },
  ];
}

export function calculateNowValuation(data: unknown, assumptionOverrides: Partial<ValuationAssumptions> = {}, scenario: Scenario = "Base"): ValuationResult {
  const dataset = (data as NowDataset) ?? nowDataset;
  const period = latestPeriod(dataset);
  const annualized = annualizePeriod(period);
  const metric = latestMetric(dataset);
  const preset = nowScenarioPresets[scenario] ?? nowScenarioPresets.Base;
  const assumptions: ValuationAssumptions = { ...defaultNowValuationAssumptions, ...preset, ...assumptionOverrides };

  function computePoint(name: Scenario, driverSet: ValuationAssumptions) {
    const currentPrice = driverSet.currentPrice || dataset.marketData.currentPrice;
    const shares = driverSet.dilutedShares || period.dilutedShares || dataset.marketData.sharesForMarketCap;
    const subscriptionGrowth = metric?.subscriptionRevenueGrowth ?? driverSet.subscriptionGrowth;
    const currentRpoGrowth = metric?.currentRpoGrowth ?? driverSet.currentRpoGrowth;
    const revenueGrowth = clamp(driverSet.revenueGrowth * 0.35 + subscriptionGrowth * 0.30 + currentRpoGrowth * 0.20 + (driverSet.netRetentionRate - 1) * 0.10 + driverSet.proPlusAdoptionRate * 0.05, 0.02, 0.30);
    const operatingMargin = clamp(driverSet.operatingMargin + (subscriptionGrowth - 0.18) * 0.08 + driverSet.proPlusAdoptionRate * 0.04 - driverSet.platformCompetitionHaircut * 0.10, 0.08, 0.25);
    const fcfMargin = clamp(driverSet.normalizedFcfMargin + (operatingMargin - 0.16) * 0.45 - driverSet.sbcDilutionHaircut * 0.20, 0.24, 0.42);
    const nextRevenue = annualized.revenue * (1 + revenueGrowth);
    const nextOperatingIncome = nextRevenue * operatingMargin;
    const nextFcf = nextRevenue * fcfMargin;
    const nextNetIncome = nextOperatingIncome * 0.72;
    const nextShares = shares * (1 - driverSet.buybackYield);
    const eps = nextNetIncome / nextShares;
    const fcfPerShare = nextFcf / nextShares;
    const dcf = dcfValue(annualized.freeCashFlow, revenueGrowth, driverSet.terminalGrowth, driverSet.discountRate, nextShares);
    const fcfYield = fcfPerShare / driverSet.targetFcfYield;
    const pe = eps * driverSet.targetPe;
    const evRevenue = (nextRevenue * driverSet.targetEvRevenue) / nextShares;
    const peer = eps * 42 * (1 + (name === "Bull" ? 0.20 : name === "Bear" ? -0.05 : 0.12));
    const riskHaircut = 1 - driverSet.aiExecutionHaircut - driverSet.platformCompetitionHaircut - driverSet.sbcDilutionHaircut;
    const fairValue = (dcf * 0.35 + fcfYield * 0.25 + pe * 0.20 + evRevenue * 0.10 + peer * 0.10) * riskHaircut;
    const targetPrice3Y = fairValue * (1 + revenueGrowth) ** 2;
    const cumulativeDividends = 0;
    const expectedReturn3Y = ((targetPrice3Y + cumulativeDividends) / currentPrice) ** (1 / 3) - 1;
    return { scenario: name, fairValue, upsideDownside: fairValue / currentPrice - 1, expectedReturn3Y, targetPrice3Y, cumulativeDividends, currentPrice, revenueGrowth, subscriptionGrowth, currentRpoGrowth, operatingMargin, fcfMargin, dcf, fcfYield, pe, evRevenue, peer };
  }

  const selected = computePoint(scenario, assumptions);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((name) => computePoint(name, { ...defaultNowValuationAssumptions, ...nowScenarioPresets[name] }));
  const selectedFairValues = fairValues.map(({ scenario, fairValue, upsideDownside, expectedReturn3Y, targetPrice3Y, cumulativeDividends }) => ({ scenario, fairValue, upsideDownside, expectedReturn3Y, targetPrice3Y, cumulativeDividends }));
  const validationWarnings = mergeValidationWarnings(
    [
      buildValidationWarning(
        "now-static-fallback",
        "Static fallback",
        "Interactive valuation uses local fallback until backend saved runs are inspected.",
      ),
    ],
    buildSourceGapWarnings("NOW", [
      { key: "revenue", label: "latest revenue", value: period.revenue },
      { key: "diluted-shares", label: "diluted shares", value: period.dilutedShares },
      { key: "free-cash-flow", label: "free cash flow", value: period.freeCashFlow },
      { key: "subscription-growth", label: "subscription revenue growth", value: metric?.subscriptionRevenueGrowth },
      { key: "crpo-growth", label: "current RPO growth", value: metric?.currentRpoGrowth },
      { key: "agent-arr", label: "Agent ARR proxy", value: metric?.agenticAiArr, severity: "low" },
    ]),
    buildPriceAnchorWarnings({
      ticker: "NOW",
      currentPrice: selected.currentPrice,
      marketReference: dataset.marketData.currentPrice,
      priceDate: dataset.marketData.priceDate,
      currency: "USD",
    }),
  );
  const reliability = deriveValuationReliability({
    warnings: validationWarnings,
    sourceStatuses: [period.sourceStatus, metric?.sourceStatus, dataset.marketData.sourceStatus],
  });
  return {
    currentPrice: selected.currentPrice,
    priceDate: dataset.marketData.priceDate,
    fairValues: selectedFairValues,
    methodCards: [
      methodCard("dcf", "DCF / FCFF", selected.dcf, "FCFF fade using subscription growth, cRPO and FCF conversion."),
      methodCard("fcf-yield", "FCF Yield", selected.fcfYield, "Normalized FCF per share capitalized at a target yield."),
      methodCard("pe", "P/E", selected.pe, "Next-year EPS multiple after SBC/buyback offset."),
      methodCard("ev-revenue", "EV/Revenue", selected.evRevenue, "Forward revenue multiple for enterprise SaaS."),
      methodCard("peer-premium", "Enterprise SaaS Peer Premium", selected.peer, "SaaS workflow peer guardrail with AI premium/risk."),
    ],
    expectedReturnBridge: [
      { key: "subscription-growth", label: "Subscription Growth", value: selected.subscriptionGrowth, format: "percent", description: "Subscription revenue durability." },
      { key: "crpo-growth", label: "cRPO Growth", value: selected.currentRpoGrowth, format: "percent", description: "Forward demand proxy." },
      { key: "fcf-margin", label: "FCF Margin", value: selected.fcfMargin, format: "percent", description: "Normalized cash conversion." },
      { key: "ai-risk", label: "AI Execution Haircut", value: assumptions.aiExecutionHaircut, format: "percent", description: "Agentic AI execution and monetization risk." },
    ],
    sensitivityTables: [{ title: "Agent AI vs Platform Risk", table: [["Driver", "Bear", "Base", "Bull"], ["cRPO growth", "12%", "19%", "22%"], ["AI haircut", "10%", "4%", "2%"], ["Fair value", fairValues[0].fairValue, fairValues[1].fairValue, fairValues[2].fairValue]] }],
    recommendedFairValue: selected.fairValue,
    blendedFairValue: selected.fairValue,
    probabilityWeightedFairValue: selectedFairValues[0].fairValue * 0.25 + selectedFairValues[1].fairValue * 0.5 + selectedFairValues[2].fairValue * 0.25,
    targetPrice3Y: selected.targetPrice3Y,
    expectedReturn3Y: selected.expectedReturn3Y,
    upsideDownside: selected.fairValue / selected.currentPrice - 1,
    fcfFairValue: selected.fcfYield,
    peFairValue: selected.pe,
    dcfValue: selected.dcf,
    validationWarnings,
    dataQualityScore: reliability.score,
    recommendedValuationConfidence: reliability.score / 100,
    overallIntegrityScore: reliability.score,
  };
}

export function buildNowDashboardData(data: NowDataset, scenario: Scenario, assumptions: Partial<ValuationAssumptions>) {
  const period = latestPeriod(data);
  const annualized = annualizePeriod(period);
  const metric = latestMetric(data);
  const valuation = calculateNowValuation(data, assumptions, scenario);
  const volumeRows = data.operatingMetrics.map((row) => ({ label: row.periodId?.replace("fy", "FY").replace("-", " ") ?? row.asOfDate, subscriptionRevenue: row.subscriptionRevenue ?? row.rebatesIncentives ?? 0, currentRpo: row.currentRpo ?? row.grossDollarVolume ?? 0, rpo: row.remainingPerformanceObligations ?? row.purchaseVolume ?? 0, agenticAiArr: row.agenticAiArr ?? 0, proPlusAdoption: (row.proPlusAdoptionRate ?? 0) * 100 }));
  const marginRows = data.periods.map((row) => ({ label: row.label, operatingMargin: ((row.operatingMargin ?? row.operatingIncome / Math.max(row.revenue, 1)) * 100), fcfMargin: ((row.freeCashFlow ?? 0) / Math.max(row.revenue, 1)) * 100, buybacks: row.buybacks ?? 0, dilutedShares: row.dilutedShares ?? 0 }));
  return { period, annualized, metric, valuation, volumeRows, marginRows, segmentRows: data.segmentFinancials };
}

export function resolveNowDataset(data: unknown): NowDataset {
  return (data as NowDataset) ?? nowDataset;
}
