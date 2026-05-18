import type { Scenario, SummaryMetric, ValuationResult } from "../types";
import {
  buildPriceAnchorWarnings,
  buildSourceGapWarnings,
  buildValidationWarning,
  deriveValuationReliability,
  mapSourceStatusToDataQualityTag,
  mergeValidationWarnings,
} from "../../utils/validation";
import { cegScenarioPresets, defaultCegValuationAssumptions } from "./assumptions";
import { cegDataset } from "./data";
import type { CegDataset, CegFinancialPeriod, CegValuationAssumptions } from "./model";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function latestPeriod(data: CegDataset) {
  return [...data.periods].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))[data.periods.length - 1];
}

function annualize(period: CegFinancialPeriod) {
  const multiplier = period.periodType === "quarter" ? 4 : 1;
  return {
    revenue: period.revenue * multiplier,
    operatingIncome: period.operatingIncome * multiplier,
    netIncome: (period.netIncome ?? period.operatingIncome * 0.76) * multiplier,
    freeCashFlow: (period.freeCashFlow ?? period.revenue * 0.08) * multiplier,
    dividendsPaid: (period.dividendsPaid ?? 0) * multiplier,
    buybacks: (period.buybacks ?? 0) * multiplier,
  };
}

function dcfPerShare(startingFcf: number, growth: number, fcfMargin: number, revenue: number, discountRate: number, terminalGrowth: number, shares: number) {
  let pv = 0;
  let projectedRevenue = revenue;
  for (let year = 1; year <= 6; year += 1) {
    const fade = Math.max(0.25, 1 - (year - 1) * 0.13);
    projectedRevenue *= 1 + terminalGrowth + (growth - terminalGrowth) * fade;
    const fcf = year === 1 ? Math.max(startingFcf, projectedRevenue * fcfMargin * 0.8) : projectedRevenue * fcfMargin;
    pv += fcf / (1 + discountRate) ** year;
  }
  const terminalFcf = projectedRevenue * fcfMargin * (1 + terminalGrowth);
  pv += (terminalFcf / Math.max(discountRate - terminalGrowth, 0.02)) / (1 + discountRate) ** 6;
  return shares ? pv / shares : 0;
}

export function getCegPeriods() {
  return cegDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultCegPeriod() {
  return cegDataset.periods[cegDataset.periods.length - 1]?.id ?? "fy2026-q1";
}

export function resolveCegDataset(data: unknown): CegDataset {
  const maybe = data as CegDataset | undefined;
  return maybe?.ticker === "CEG" && maybe.periods?.length ? maybe : cegDataset;
}

export function calculateCegSummary(data: unknown): SummaryMetric[] {
  const dataset = resolveCegDataset(data);
  const period = latestPeriod(dataset);
  const annual = annualize(period);
  const metric = dataset.operatingMetrics.find((item) => item.periodId === period.id) ?? dataset.operatingMetrics[dataset.operatingMetrics.length - 1];
  return [
    { key: "revenue", label: "Annualized Revenue", value: annual.revenue, format: "currency", description: "Latest SEC period annualized for scale context.", badge: mapSourceStatusToDataQualityTag(period.sourceStatus) },
    { key: "operatingMargin", label: "Operating Margin", value: period.operatingMargin ?? period.operatingIncome / period.revenue, format: "percent", description: "Reported operating margin, not normalized for hedge/collateral noise.", badge: "Actual" },
    { key: "nuclearCapacityFactor", label: "Nuclear Capacity Factor", value: metric?.nuclearCapacityFactor ?? 0, format: "percent", description: "Research-only fleet reliability marker pending official metric parser.", badge: "Placeholder" },
    { key: "freeCashFlow", label: "Reported FCF", value: annual.freeCashFlow, format: "currency", description: "Operating cash flow less capex; volatile for CEG because collateral and working capital move sharply.", badge: "Derived" },
    { key: "powerDemand", label: "AI Load Growth Proxy", value: metric?.commercialLoadGrowth ?? 0, format: "percent", description: "Research-only power-demand proxy for data-center scarcity debate.", badge: "Placeholder" },
  ];
}

export function calculateCegValuation(data: unknown, overrides: Partial<CegValuationAssumptions> = {}, scenario: Scenario = "Base"): ValuationResult {
  const dataset = resolveCegDataset(data);
  const period = latestPeriod(dataset);
  const annual = annualize(period);
  const metric = dataset.operatingMetrics.find((item) => item.periodId === period.id) ?? dataset.operatingMetrics[dataset.operatingMetrics.length - 1];
  const preset = cegScenarioPresets[scenario] ?? cegScenarioPresets.Base;
  const base = {
    ...defaultCegValuationAssumptions,
    ...preset,
    currentPrice: dataset.marketData.currentPrice,
    dilutedShares: period.dilutedShares ?? preset.dilutedShares,
    normalizedRevenue: Math.max(preset.normalizedRevenue, annual.revenue * 0.82),
    ...overrides,
  };

  function point(name: Scenario, assumptions: CegValuationAssumptions) {
    const scarcityUplift = 1 + assumptions.nuclearScarcityPremium + assumptions.dataCenterDemandUplift + assumptions.powerPriceUpside;
    const riskMultiplier = clamp(1 - assumptions.regulatoryHaircut - assumptions.commodityHedgeHaircut - assumptions.balanceSheetHaircut, 0.55, 1.15);
    const revenue = assumptions.normalizedRevenue * (1 + assumptions.revenueGrowth);
    const operatingIncome = revenue * assumptions.operatingMargin;
    const normalizedFcf = revenue * assumptions.normalizedFcfMargin;
    const netIncome = operatingIncome * 0.74;
    const shares = assumptions.dilutedShares * (1 - assumptions.buybackYield);
    const eps = netIncome / shares;
    const dcf = dcfPerShare(Math.max(annual.freeCashFlow, normalizedFcf * 0.45), assumptions.revenueGrowth, assumptions.normalizedFcfMargin, revenue, assumptions.discountRate, assumptions.terminalGrowth, shares);
    const fcfYield = (normalizedFcf / shares) / assumptions.targetFcfYield;
    const pe = eps * assumptions.targetPe;
    const evEbitda = ((operatingIncome * 1.22) * assumptions.evEbitdaMultiple) / shares;
    const scarcityValue = (fcfYield * 0.45 + pe * 0.35 + evEbitda * 0.20) * scarcityUplift * riskMultiplier;
    const fairValue = dcf * 0.35 + scarcityValue * 0.65;
    const targetPrice3Y = fairValue * (1 + clamp(assumptions.revenueGrowth + assumptions.dataCenterDemandUplift * 0.12, -0.02, 0.13)) ** 3;
    const cumulativeDividends = assumptions.currentPrice * assumptions.dividendYield * 3;
    return {
      scenario: name,
      fairValue,
      upsideDownside: fairValue / assumptions.currentPrice - 1,
      expectedReturn3Y: ((targetPrice3Y + cumulativeDividends) / assumptions.currentPrice) ** (1 / 3) - 1,
      targetPrice3Y,
      cumulativeDividends,
      dcf,
      fcfYield,
      pe,
      evEbitda,
      riskMultiplier,
      scarcityUplift,
      normalizedFcf,
    };
  }

  const selected = point(scenario, base);
  const scenarioPoints = (["Bear", "Base", "Bull"] as Scenario[]).map((name) => point(name, { ...defaultCegValuationAssumptions, ...cegScenarioPresets[name], currentPrice: base.currentPrice, dilutedShares: base.dilutedShares, normalizedRevenue: base.normalizedRevenue }));
  const validationWarnings = mergeValidationWarnings(
    [buildValidationWarning("ceg-public-history-limit", "Standalone history starts in 2022", "CEG was spun out as a standalone public company in 2022. The module does not fabricate pre-spin standalone public-company rows.", "medium")],
    buildSourceGapWarnings("CEG", [
      { key: "revenue", label: "SEC revenue", value: period.revenue },
      { key: "shares", label: "diluted shares", value: period.dilutedShares },
      { key: "fcf", label: "free cash flow", value: period.freeCashFlow },
      { key: "capacity-factor", label: "nuclear capacity factor parser", value: metric?.nuclearCapacityFactor, severity: "low" },
    ]),
    buildPriceAnchorWarnings({
      ticker: "CEG",
      currentPrice: base.currentPrice,
      marketReference: dataset.marketData.currentPrice,
      priceDate: dataset.marketData.priceDate,
      currency: "USD",
    }),
  );
  const reliability = deriveValuationReliability({
    warnings: validationWarnings,
    sourceStatuses: [period.sourceStatus, dataset.marketData.sourceStatus, metric?.sourceStatus],
  });

  return {
    currentPrice: base.currentPrice,
    priceDate: dataset.marketData.priceDate,
    fairValues: scenarioPoints.map(({ scenario, fairValue, upsideDownside, expectedReturn3Y, targetPrice3Y, cumulativeDividends }) => ({ scenario, fairValue, upsideDownside, expectedReturn3Y, targetPrice3Y, cumulativeDividends })),
    methodCards: [
      { key: "dcf", label: "DCF / Normalized FCF", value: selected.dcf, format: "currency", description: "Six-year FCF fade from normalized revenue and FCF margin; avoids blindly capitalizing noisy collateral-driven FCF.", sourceConfidence: "medium" },
      { key: "fcf-yield", label: "FCF Yield", value: selected.fcfYield, format: "currency", description: "Normalized FCF per share capitalized at target yield.", sourceConfidence: "medium" },
      { key: "pe", label: "P/E", value: selected.pe, format: "currency", description: "Normalized EPS multiple after power-price and risk settings.", sourceConfidence: "medium" },
      { key: "ev-ebitda", label: "EV/EBITDA", value: selected.evEbitda, format: "currency", description: "Infrastructure-style EBITDA multiple cross-check.", sourceConfidence: "medium" },
      { key: "scarcity", label: "Scarcity / AI Power Overlay", value: selected.fcfYield * selected.scarcityUplift * selected.riskMultiplier, format: "currency", description: "Explicit nuclear scarcity, AI load and regulatory/commodity haircut overlay.", sourceConfidence: "low" },
    ],
    expectedReturnBridge: [
      { key: "nuclear-scarcity", label: "Nuclear Scarcity Premium", value: base.nuclearScarcityPremium, format: "percent", description: "Reliable zero-carbon baseload scarcity uplift." },
      { key: "ai-load", label: "AI Load Uplift", value: base.dataCenterDemandUplift, format: "percent", description: "Long-duration contracted data-center demand uplift." },
      { key: "power-price", label: "Power Price Upside", value: base.powerPriceUpside, format: "percent", description: "Forward power curve / realized price sensitivity." },
      { key: "risk-multiplier", label: "Risk Multiplier", value: selected.riskMultiplier, format: "multiple", description: "Regulatory, hedge and balance-sheet risk multiplier." },
    ],
    sensitivityTables: [
      { title: "AI Load vs Regulatory Risk", table: [["Driver", "Bear", "Base", "Bull"], ["AI uplift", "1%", "8%", "14%"], ["Regulatory haircut", "13%", "7%", "4.5%"], ["Fair value", scenarioPoints[0].fairValue, scenarioPoints[1].fairValue, scenarioPoints[2].fairValue]] },
    ],
    recommendedFairValue: selected.fairValue,
    recommendedFairValueMethod: "Blended DCF / FCF yield / P-E / EV-EBITDA with explicit scarcity overlay",
    recommendedFairValueReason: "CEG should not be valued as a generic utility; the key debate is scarcity rent duration versus regulation and commodity/hedge risk.",
    blendedFairValue: selected.fairValue,
    probabilityWeightedFairValue: scenarioPoints[0].fairValue * 0.25 + scenarioPoints[1].fairValue * 0.50 + scenarioPoints[2].fairValue * 0.25,
    targetPrice3Y: selected.targetPrice3Y,
    expectedReturn3Y: selected.expectedReturn3Y,
    upsideDownside: selected.fairValue / base.currentPrice - 1,
    fcfFairValue: selected.fcfYield,
    peFairValue: selected.pe,
    dcfValue: selected.dcf,
    validationWarnings,
    dataQualityScore: reliability.score,
    recommendedValuationConfidence: reliability.score / 100,
    overallIntegrityScore: reliability.score,
  };
}
