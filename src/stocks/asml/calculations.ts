import type { Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildValidationWarning, mergeValidationWarnings } from "../../utils/validation";
import { defaultAsmlValuationAssumptions, asmlScenarioPresets } from "./assumptions";
import { asmlDataset } from "./data";
import { asmlDailyPriceBars, asmlEightYearPriceHistory, asmlMarketPriceMetadata, asmlVsSpyEightYearReturns } from "./marketPrices";
import type { AsmlDataset, AsmlHistoricalValuationItem, AsmlValuationAssumptions } from "./model";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function metricValue(dataset: AsmlDataset, key: string) {
  return dataset.metrics.find((metric) => metric.key === key)?.value ?? 0;
}

function compoundedReturn(rows: Array<{ annualReturn: number }>) {
  if (!rows.length) return null;
  return rows.reduce((product, row) => product * (1 + row.annualReturn), 1) ** (1 / rows.length) - 1;
}

function buildAsmlEightYearMarketAnalysis() {
  const asmlCagr = compoundedReturn(asmlEightYearPriceHistory);
  const spyCagr = compoundedReturn(asmlVsSpyEightYearReturns.map((row) => ({ annualReturn: row.spyReturn })));
  const outperformanceYears = asmlVsSpyEightYearReturns.filter((row) => row.relativeReturn > 0).length;
  const worstDrawdown = asmlEightYearPriceHistory.reduce<typeof asmlEightYearPriceHistory[number] | null>((worst, row) => {
    if (!worst || row.maxDrawdown < worst.maxDrawdown) return row;
    return worst;
  }, null);
  const bestYear = asmlEightYearPriceHistory.reduce<typeof asmlEightYearPriceHistory[number] | null>((best, row) => {
    if (!best || row.annualReturn > best.annualReturn) return row;
    return best;
  }, null);
  const worstRelativeYear = asmlVsSpyEightYearReturns.reduce<typeof asmlVsSpyEightYearReturns[number] | null>((worst, row) => {
    if (!worst || row.relativeReturn < worst.relativeReturn) return row;
    return worst;
  }, null);
  return {
    annualRows: asmlEightYearPriceHistory,
    comparisonRows: asmlVsSpyEightYearReturns,
    asmlCagr,
    spyCagr,
    outperformanceYears,
    worstDrawdown,
    bestYear,
    worstRelativeYear,
    researchReadThroughs: [
      {
        title: "Market-cycle read-through",
        text: "ASML's eight-year ADR history shows a high-beta quality compounder rather than a smooth bond proxy. Strong years cluster around semi capex acceleration, while drawdowns are large when cycle, China and multiple concerns collide.",
      },
      {
        title: "Valuation triangulation implication",
        text: "Because price drawdowns have been much larger than normal market drawdowns, fair value should be triangulated across DCF, FCF yield, P/E, EV/EBIT and SOTP rather than anchored to the latest share price.",
      },
      {
        title: "Model audit caveat",
        text: "The eight-year market data provides a cycle-aware reference for price/fair-value gaps while operating drivers are refreshed through the research workflow.",
      },
    ],
    riskRegister: [
      {
        risk: "Semi capex digestion",
        indicator: "ASML underperforms SPY while model fair value remains flat or rising.",
        action: "Recheck orders growth, backlog conversion and AI capex cycle risk before adding exposure.",
      },
      {
        risk: "China restrictions",
        indicator: "Price gap widens during China policy or shipment-license headlines.",
        action: "Stress China exposure x restriction haircut and service exposure separately.",
      },
      {
        risk: "High-NA optimism overcapitalized",
        indicator: "Fair value depends mainly on High-NA multiple rather than normalized FCF.",
        action: "Lower High-NA mix/multiple and test whether base-case upside survives.",
      },
    ],
  };
}

function nearestAsmlPriceOnOrBefore(date: string) {
  for (let index = asmlDailyPriceBars.length - 1; index >= 0; index -= 1) {
    const row = asmlDailyPriceBars[index];
    if (row.priceDate <= date) return row;
  }
  return null;
}

function normalizeWeights(assumptions: AsmlValuationAssumptions) {
  const total =
    assumptions.weightDcf +
    assumptions.weightFcfYield +
    assumptions.weightPe +
    assumptions.weightEvEbit +
    assumptions.weightSotp;
  if (total <= 0) return { dcf: 0.35, fcfYield: 0.22, pe: 0.16, evEbit: 0.12, sotp: 0.15 };
  return {
    dcf: assumptions.weightDcf / total,
    fcfYield: assumptions.weightFcfYield / total,
    pe: assumptions.weightPe / total,
    evEbit: assumptions.weightEvEbit / total,
    sotp: assumptions.weightSotp / total,
  };
}

function normalizeRevenueMix(assumptions: AsmlValuationAssumptions) {
  const systemsMix = clamp(assumptions.systemsRevenueMix, 0, 1);
  const serviceMix = clamp(assumptions.serviceRevenueMix, 0, 1);
  const total = systemsMix + serviceMix;
  const normalizedSystemsMix = total > 0 ? systemsMix / total : 0.78;
  const normalizedServiceMix = total > 0 ? serviceMix / total : 0.22;
  const systemsSubmixTotal = Math.max(
    assumptions.euvRevenueMix + assumptions.duvRevenueMix + assumptions.highNaRevenueMix,
    0.01,
  );
  return {
    systemsMix: normalizedSystemsMix,
    serviceMix: normalizedServiceMix,
    euvMix: assumptions.euvRevenueMix / systemsSubmixTotal,
    duvMix: assumptions.duvRevenueMix / systemsSubmixTotal,
    highNaMix: assumptions.highNaRevenueMix / systemsSubmixTotal,
  };
}

function effectiveGrowth(assumptions: AsmlValuationAssumptions) {
  const mix = normalizeRevenueMix(assumptions);
  const systemsGrowth =
    assumptions.revenueCagr * 0.55 +
    assumptions.ordersGrowth * 0.25 +
    (assumptions.backlogConversion - 0.70) * 0.12 +
    assumptions.highNaAdoption * 0.08;
  return clamp(
    systemsGrowth * mix.systemsMix +
      assumptions.installedBaseServiceGrowth * mix.serviceMix -
      assumptions.aiCapexCycleRisk * 0.22,
    -0.10,
    0.32,
  );
}

function riskMultiplier(assumptions: AsmlValuationAssumptions) {
  const moatLift =
    (assumptions.euvDemandDurability - 0.65) * 0.06 +
    assumptions.highNaAdoption * 0.05 +
    Math.max(0, assumptions.backlogCoverage - 1) * 0.025;
  const chinaRestrictionExposure = assumptions.chinaRevenueExposure * assumptions.chinaRestrictionHaircut;
  const riskHaircut = clamp(
    chinaRestrictionExposure +
      assumptions.aiCapexCycleRisk +
      assumptions.customerConcentrationHaircut +
      Math.max(0, 1 - assumptions.backlogCoverage) * 0.08,
    0,
    0.55,
  );
  return clamp(1 + moatLift - riskHaircut, 0.45, 1.18);
}

function normalizedOperatingMargin(assumptions: AsmlValuationAssumptions) {
  const mix = normalizeRevenueMix(assumptions);
  const highNaLift = mix.highNaMix * assumptions.highNaAdoption * 0.06;
  const serviceLift = mix.serviceMix * 0.04;
  const capexAndRampDrag = Math.max(0, assumptions.capexIntensity - 0.07) * 0.45 + assumptions.aiCapexCycleRisk * 0.05;
  return clamp(
    assumptions.operatingMargin +
      (assumptions.grossMargin - 0.50) * 0.30 +
      highNaLift +
      serviceLift -
      capexAndRampDrag,
    0.14,
    0.50,
  );
}

function normalizedFcfMargin(assumptions: AsmlValuationAssumptions, operatingMargin: number) {
  const workingCapitalDrag = Math.max(0, assumptions.ordersGrowth) * 0.08;
  return clamp(
    assumptions.fcfMargin +
      (operatingMargin - assumptions.operatingMargin) * 0.45 -
      Math.max(0, assumptions.capexIntensity - 0.07) * 0.35 -
      workingCapitalDrag,
    0.06,
    0.45,
  );
}

function dcfEquityValue(revenueBase: number, assumptions: AsmlValuationAssumptions, riskAdjustedMultiple: number) {
  let revenue = revenueBase;
  let presentValue = 0;
  const baseGrowth = effectiveGrowth(assumptions);
  const operatingMargin = normalizedOperatingMargin(assumptions);
  for (let year = 1; year <= 6; year += 1) {
    const fade = Math.max(0.35, 1 - (year - 1) * 0.13);
    const growth = assumptions.terminalGrowth + (baseGrowth - assumptions.terminalGrowth) * fade;
    revenue *= 1 + growth;
    const fcfMargin = normalizedFcfMargin(assumptions, operatingMargin);
    presentValue += (revenue * fcfMargin) / (1 + assumptions.discountRate) ** year;
  }
  const terminalFcf = revenue * clamp(normalizedFcfMargin(assumptions, operatingMargin) - 0.01, 0.06, 0.44) * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcf / Math.max(assumptions.discountRate - assumptions.terminalGrowth, 0.025);
  return (presentValue + terminalValue / (1 + assumptions.discountRate) ** 6) * riskAdjustedMultiple + assumptions.netCashUsd;
}

function perShare(equityValue: number, shares: number) {
  return shares > 0 ? equityValue / shares : 0;
}

function sourceWarnings(dataset: AsmlDataset, assumptions: AsmlValuationAssumptions): ValidationWarning[] {
  const warnings = [
    buildValidationWarning(
      "asml-backend-deferred",
      "Backend workflow",
      "ASML uses the frontend research workflow today; a local SQLite workflow can be added when official ASML filings and event imports are standardized.",
      "medium",
    ),
    buildValidationWarning(
      "asml-official-financials-missing",
      "Official financials missing",
      "Refresh EUR reporting, backlog, gross margin, FCF, share count, and ADR FX bridge before final IC use.",
      "high",
    ),
  ];
  if (assumptions.currentPrice <= 0) {
    warnings.push(
      buildValidationWarning(
        "asml-price-anchor-missing",
        "Current price anchor missing",
        "ASML current ADR price is zero because no market data source is loaded; upside/downside and 3Y CAGR are suppressed.",
        "high",
      ),
    );
  }
  if (dataset.sourceGaps.length > 0) {
    warnings.push(
      buildValidationWarning(
        "asml-source-gaps",
        "Data coverage requires review",
        `${dataset.sourceGaps.length} data coverage items remain before final IC use.`,
        "medium",
      ),
    );
  }
  return warnings;
}

function calculateSotpFairValue(normalizedRevenue: number, assumptions: AsmlValuationAssumptions, riskAdjustedMultiple: number) {
  const mix = normalizeRevenueMix(assumptions);
  const systemsRevenue = normalizedRevenue * mix.systemsMix;
  const serviceRevenue = normalizedRevenue * mix.serviceMix;
  const highNaRevenue = systemsRevenue * mix.highNaMix;
  const euvRevenue = systemsRevenue * mix.euvMix;
  const duvRevenue = systemsRevenue * mix.duvMix;
  const baseSystemsRevenue = Math.max(0, systemsRevenue - highNaRevenue);
  const enterpriseValue =
    baseSystemsRevenue * assumptions.systemsRevenueMultiple +
    serviceRevenue * assumptions.serviceRevenueMultiple +
    highNaRevenue * assumptions.highNaRevenueMultiple +
    euvRevenue * 0.6 +
    duvRevenue * 0.25;
  return {
    systemsRevenue,
    serviceRevenue,
    highNaRevenue,
    euvRevenue,
    duvRevenue,
    fairValue: perShare(enterpriseValue * riskAdjustedMultiple + assumptions.netCashUsd, assumptions.dilutedAdrShares),
  };
}

function computeScenarioPoint(
  name: Scenario,
  dataset: AsmlDataset,
  assumptions: AsmlValuationAssumptions,
) {
  const revenueBase = assumptions.normalizedRevenueUsd;
  const growth = effectiveGrowth(assumptions);
  const risk = riskMultiplier(assumptions);
  const normalizedRevenue = revenueBase * (1 + growth);
  const operatingMargin = normalizedOperatingMargin(assumptions);
  const normalizedEbit = normalizedRevenue * operatingMargin;
  const normalizedNetIncome = normalizedEbit * (1 - assumptions.taxRate);
  const fcfMargin = normalizedFcfMargin(assumptions, operatingMargin);
  const normalizedFcf = normalizedRevenue * fcfMargin;
  const dcfFairValue = perShare(dcfEquityValue(revenueBase, assumptions, risk), assumptions.dilutedAdrShares);
  const fcfFairValue = perShare((normalizedFcf / Math.max(assumptions.targetFcfYield, 0.005)) * risk + assumptions.netCashUsd, assumptions.dilutedAdrShares);
  const peFairValue = perShare(normalizedNetIncome * assumptions.targetPe * risk + assumptions.netCashUsd, assumptions.dilutedAdrShares);
  const evEbitFairValue = perShare(normalizedEbit * assumptions.targetEvEbit * risk + assumptions.netCashUsd, assumptions.dilutedAdrShares);
  const sotp = calculateSotpFairValue(normalizedRevenue, assumptions, risk);
  const weights = normalizeWeights(assumptions);
  const fairValue =
    dcfFairValue * weights.dcf +
    fcfFairValue * weights.fcfYield +
    peFairValue * weights.pe +
    evEbitFairValue * weights.evEbit +
    sotp.fairValue * weights.sotp;
  const targetPrice3Y = fairValue * (1 + clamp(growth * 0.42 + Math.max(0, assumptions.highNaAdoption - 0.45) * 0.035, 0, 0.14)) ** 3;
  const cumulativeDividends = 0;
  const expectedReturn3Y = assumptions.currentPrice > 0 ? (targetPrice3Y / assumptions.currentPrice) ** (1 / 3) - 1 : 0;
  const upsideDownside = assumptions.currentPrice > 0 ? fairValue / assumptions.currentPrice - 1 : 0;
  return {
    scenario: name,
    fairValue,
    upsideDownside,
    expectedReturn3Y,
    targetPrice3Y,
    cumulativeDividends,
    summary:
      name === "Bear"
        ? "Export restrictions, AI capex digestion, lower backlog cover, and multiple compression."
        : name === "Bull"
          ? "Durable EUV demand, faster High-NA adoption, stronger backlog cover, and premium multiple durability."
          : "Platform-critical lithography position with operating data still being refreshed.",
    dcfFairValue,
    fcfFairValue,
    peFairValue,
    evEbitFairValue,
    sotpFairValue: sotp.fairValue,
    normalizedRevenue,
    effectiveGrowth: growth,
    operatingMargin,
    fcfMargin,
    normalizedFcf,
    normalizedEbit,
    normalizedNetIncome,
    riskMultiplier: risk,
    systemsRevenue: sotp.systemsRevenue,
    serviceRevenue: sotp.serviceRevenue,
    euvRevenue: sotp.euvRevenue,
    duvRevenue: sotp.duvRevenue,
    highNaRevenue: sotp.highNaRevenue,
    sourceGapCount: dataset.sourceGaps.length,
  };
}

export function getAsmlPeriods() {
  return [{ value: "research-scaffold", label: "Current Research View" }];
}

export function getDefaultAsmlPeriod() {
  return "research-scaffold";
}

export function resolveAsmlDataset(data: unknown): AsmlDataset {
  const candidate = data as Partial<AsmlDataset> | undefined;
  if (candidate?.ticker === "ASML" && candidate.metrics?.length) return candidate as AsmlDataset;
  return asmlDataset;
}

export function calculateAsmlSummary(data: unknown): SummaryMetric[] {
  const dataset = resolveAsmlDataset(data);
  return [
    {
      key: "normalized-revenue",
      label: "Revenue Base",
      value: metricValue(dataset, "normalizedRevenueUsd"),
      format: "currency",
      description: "Revenue base in USDm; refresh against official EUR reporting and ADR bridge before final IC use.",
      badge: "Assumption",
    },
    {
      key: "gross-margin",
      label: "Gross Margin",
      value: metricValue(dataset, "grossMargin"),
      format: "percent",
      description: "Margin input for EUV/High-NA mix and utilization.",
      badge: "Assumption",
    },
    {
      key: "backlog-coverage",
      label: "Backlog Coverage",
      value: metricValue(dataset, "backlogCoverage"),
      format: "multiple",
      description: "Source slot for backlog versus forward revenue.",
      badge: "Placeholder",
    },
    {
      key: "source-gaps",
      label: "Source Gaps",
      value: dataset.sourceGaps.length,
      format: "number",
      description: "Items that must be sourced before treating the module as data-backed.",
      badge: "Needs Review",
    },
  ];
}

export function calculateAsmlValuation(
  data: unknown,
  assumptionOverrides: Partial<AsmlValuationAssumptions> = {},
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolveAsmlDataset(data);
  const assumptions: AsmlValuationAssumptions = {
    ...defaultAsmlValuationAssumptions,
    currentPrice: dataset.marketData.currentPrice,
    ...asmlScenarioPresets[scenario],
    ...assumptionOverrides,
  };
  if (assumptions.currentPrice <= 0 && dataset.marketData.currentPrice > 0) {
    assumptions.currentPrice = dataset.marketData.currentPrice;
  }
  const selected = computeScenarioPoint(scenario, dataset, assumptions);
  const scenarioPoints = (["Bear", "Base", "Bull"] as Scenario[]).map((name) =>
    computeScenarioPoint(name, dataset, {
      ...defaultAsmlValuationAssumptions,
      ...asmlScenarioPresets[name],
      currentPrice: assumptions.currentPrice,
      dilutedAdrShares: assumptions.dilutedAdrShares,
      netCashUsd: assumptions.netCashUsd,
    }),
  );
  const validationWarnings = mergeValidationWarnings(sourceWarnings(dataset, assumptions));
  const methodValues = [selected.dcfFairValue, selected.fcfFairValue, selected.peFairValue, selected.evEbitFairValue, selected.sotpFairValue];
  const averageMethodValue = methodValues.reduce((sum, value) => sum + value, 0) / methodValues.length;
  const methodDispersion = Math.max(...methodValues) / Math.max(Math.min(...methodValues), 1) - 1;
  const probabilityWeightedFairValue =
    scenarioPoints[0].fairValue * 0.25 + scenarioPoints[1].fairValue * 0.50 + scenarioPoints[2].fairValue * 0.25;

  return {
    currentPrice: assumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings,
    warning: validationWarnings.find((warning) => warning.severity === "high")?.title,
    fairValues: scenarioPoints.map((point) => ({
      scenario: point.scenario,
      fairValue: point.fairValue,
      upsideDownside: point.upsideDownside,
      expectedReturn3Y: point.expectedReturn3Y,
      targetPrice3Y: point.targetPrice3Y,
      cumulativeDividends: point.cumulativeDividends,
      summary:
        point.scenario === scenario
          ? `${scenario} case: effective revenue growth ${(selected.effectiveGrowth * 100).toFixed(1)}%, FCF margin ${(selected.fcfMargin * 100).toFixed(1)}%, risk multiplier ${selected.riskMultiplier.toFixed(2)}x.`
          : point.summary,
    })),
    methodCards: [
      {
        key: "dcf",
        label: "DCF Fair Value",
        value: selected.dcfFairValue,
        format: "currency",
        description: "Six-year FCF DCF using orders/backlog-driven growth, systems/service mix, High-NA ramp, China exposure and AI capex digestion.",
        sourceConfidence: "low",
      },
      {
        key: "fcf-yield",
        label: "FCF Yield Value",
        value: selected.fcfFairValue,
        format: "currency",
        description: "Normalized FCF yield cross-check for a cash-generative semiconductor equipment monopoly.",
        sourceConfidence: "low",
      },
      {
        key: "pe",
        label: "P/E Value",
        value: selected.peFairValue,
        format: "currency",
        description: "Forward earnings cross-check using placeholder normalized EBIT and tax assumptions.",
        sourceConfidence: "low",
      },
      {
        key: "ev-ebit",
        label: "EV / EBIT Value",
        value: selected.evEbitFairValue,
        format: "currency",
        description: "Operating-profit multiple cross-check for lithography earnings power.",
        sourceConfidence: "low",
      },
      {
        key: "sotp",
        label: "Systems / Service SOTP",
        value: selected.sotpFairValue,
        format: "currency",
        description: "Revenue SOTP separating lithography systems, installed-base service and High-NA revenue pools.",
        sourceConfidence: "low",
      },
    ],
    expectedReturnBridge: [
      { key: "fair-value", label: `${scenario} Fair Value`, value: selected.fairValue, format: "currency", description: "Blended fair value from DCF, FCF yield, P/E and EV/EBIT." },
      { key: "upside", label: "Upside / Downside", value: selected.upsideDownside, format: "percent", description: "Fair value versus current ADR price anchor. Suppressed when price is missing." },
      { key: "expected-return", label: "3Y Shareholder CAGR", value: selected.expectedReturn3Y, format: "percent", description: "Three-year target price return. Dividends are zero until sourced." },
      { key: "orders-growth", label: "Orders Growth", value: assumptions.ordersGrowth, format: "percent", description: "Bookings/order cycle input separate from revenue growth." },
      { key: "effective-growth", label: "Effective Growth", value: selected.effectiveGrowth, format: "percent", description: "Revenue growth after orders, backlog conversion, service growth and AI cycle risk." },
      { key: "systems-service-mix", label: "Service Mix", value: assumptions.serviceRevenueMix, format: "percent", description: "Installed-base service share, treated as a separate SOTP pool." },
      { key: "high-na", label: "High-NA Mix", value: assumptions.highNaRevenueMix, format: "percent", description: "High-NA revenue mix assumption, not an extra valuation uplift." },
      { key: "risk-multiplier", label: "Risk Multiplier", value: selected.riskMultiplier, format: "multiple", description: "Moat lift net of China and AI capex-cycle haircuts." },
      { key: "three-year-cagr", label: "3Y Shareholder CAGR", value: selected.expectedReturn3Y, format: "percent", description: "Suppressed until current price is sourced." },
    ],
    sensitivityTables: [
      {
        title: "EUV / High-NA vs China Risk",
        table: [
          ["Driver", "Bear", "Base", "Bull"],
          ["Orders growth", "-4%", "8%", "18%"],
          ["Backlog conversion", "62%", "78%", "90%"],
          ["High-NA mix", "2%", "8%", "16%"],
          ["China exposure x haircut", "4.0%", "1.8%", "0.9%"],
          ["Fair value", scenarioPoints[0].fairValue, scenarioPoints[1].fairValue, scenarioPoints[2].fairValue],
        ],
      },
      {
        title: "Systems / Service Revenue Pool",
        table: [
          ["Pool", "Revenue", "Multiple"],
          ["Systems", selected.systemsRevenue, assumptions.systemsRevenueMultiple],
          ["Installed-base service", selected.serviceRevenue, assumptions.serviceRevenueMultiple],
          ["EUV", selected.euvRevenue, assumptions.systemsRevenueMultiple],
          ["DUV", selected.duvRevenue, assumptions.systemsRevenueMultiple],
          ["High-NA", selected.highNaRevenue, assumptions.highNaRevenueMultiple],
        ],
      },
      {
        title: "Method Dispersion",
        table: [
          ["Method", "Value"],
          ["DCF", selected.dcfFairValue],
          ["FCF yield", selected.fcfFairValue],
          ["P/E", selected.peFairValue],
          ["EV/EBIT", selected.evEbitFairValue],
          ["SOTP", selected.sotpFairValue],
          ["Average", averageMethodValue],
        ],
      },
    ],
    dcfValue: selected.dcfFairValue,
    fcfFairValue: selected.fcfFairValue,
    peFairValue: selected.peFairValue,
    operatingSotpFairValue: selected.sotpFairValue,
    sotpFairValue: selected.sotpFairValue,
    blendedFairValue: selected.fairValue,
    recommendedFairValue: selected.fairValue,
    recommendedFairValueMethod: "DCF / FCF yield / P/E / EV-EBIT / systems-service SOTP blend",
    recommendedFairValueReason: "ASML is modeled through semiconductor-equipment economics: orders, backlog conversion, EUV/DUV/High-NA mix, installed-base service, China exposure and AI capex digestion.",
    targetPrice3Y: selected.targetPrice3Y,
    expectedReturn3Y: selected.expectedReturn3Y,
    upsideDownside: selected.upsideDownside,
    probabilityWeightedFairValue,
    valuationRangeLow: scenarioPoints[0].fairValue,
    valuationRangeBase: probabilityWeightedFairValue,
    valuationRangeHigh: scenarioPoints[2].fairValue,
    methodDispersion,
    dataQualityScore: 35,
    recommendedValuationConfidence: 35,
    customSummary:
      "ASML valuation is organized around lithography equipment economics: net orders, backlog conversion, EUV/DUV/High-NA system mix, installed-base service durability, China restriction exposure, customer concentration and semiconductor capex cyclicality.",
  };
}

const asmlHistoricalScaffoldAssumptions: Array<{
  id: string;
  eventDate: string;
  fiscalPeriod: string;
  overrides: Partial<AsmlValuationAssumptions>;
}> = [
  {
    id: "asml-hist-fy2022-q1",
    eventDate: "2022-03-31",
    fiscalPeriod: "FY2022 Q1",
    overrides: {
      normalizedRevenueUsd: 24_500,
      revenueCagr: 0.11,
      ordersGrowth: 0.16,
      backlogConversion: 0.72,
      grossMargin: 0.50,
      operatingMargin: 0.31,
      fcfMargin: 0.27,
      highNaRevenueMix: 0.00,
      euvDemandDurability: 0.70,
      highNaAdoption: 0.10,
      backlogCoverage: 1.10,
      chinaRevenueExposure: 0.17,
      chinaRestrictionHaircut: 0.03,
      aiCapexCycleRisk: 0.06,
      targetPe: 34,
      targetEvEbit: 30,
      targetFcfYield: 0.026,
    },
  },
  {
    id: "asml-hist-fy2022-q2",
    eventDate: "2022-06-30",
    fiscalPeriod: "FY2022 Q2",
    overrides: { normalizedRevenueUsd: 25_200, revenueCagr: 0.10, ordersGrowth: 0.10, backlogConversion: 0.70, grossMargin: 0.50, operatingMargin: 0.30, fcfMargin: 0.26, highNaRevenueMix: 0.00, euvDemandDurability: 0.69, highNaAdoption: 0.12, backlogCoverage: 1.08, chinaRevenueExposure: 0.18, chinaRestrictionHaircut: 0.04, aiCapexCycleRisk: 0.08, targetPe: 31, targetEvEbit: 28, targetFcfYield: 0.029 },
  },
  {
    id: "asml-hist-fy2022-q3",
    eventDate: "2022-09-30",
    fiscalPeriod: "FY2022 Q3",
    overrides: { normalizedRevenueUsd: 25_700, revenueCagr: 0.09, ordersGrowth: 0.04, backlogConversion: 0.68, grossMargin: 0.49, operatingMargin: 0.29, fcfMargin: 0.25, highNaRevenueMix: 0.00, euvDemandDurability: 0.68, highNaAdoption: 0.12, backlogCoverage: 1.04, chinaRevenueExposure: 0.18, chinaRestrictionHaircut: 0.05, aiCapexCycleRisk: 0.11, targetPe: 28, targetEvEbit: 25, targetFcfYield: 0.033 },
  },
  {
    id: "asml-hist-fy2022-q4",
    eventDate: "2022-12-31",
    fiscalPeriod: "FY2022 Q4",
    overrides: { normalizedRevenueUsd: 26_200, revenueCagr: 0.10, ordersGrowth: 0.08, backlogConversion: 0.71, grossMargin: 0.50, operatingMargin: 0.30, fcfMargin: 0.26, highNaRevenueMix: 0.01, euvDemandDurability: 0.70, highNaAdoption: 0.15, backlogCoverage: 1.13, chinaRevenueExposure: 0.19, chinaRestrictionHaircut: 0.05, aiCapexCycleRisk: 0.09, targetPe: 30, targetEvEbit: 27, targetFcfYield: 0.031 },
  },
  {
    id: "asml-hist-fy2023-q1",
    eventDate: "2023-03-31",
    fiscalPeriod: "FY2023 Q1",
    overrides: { normalizedRevenueUsd: 27_000, revenueCagr: 0.10, ordersGrowth: 0.06, backlogConversion: 0.73, grossMargin: 0.51, operatingMargin: 0.31, fcfMargin: 0.27, highNaRevenueMix: 0.01, euvDemandDurability: 0.71, highNaAdoption: 0.18, backlogCoverage: 1.16, chinaRevenueExposure: 0.20, chinaRestrictionHaircut: 0.05, aiCapexCycleRisk: 0.08, targetPe: 31, targetEvEbit: 28, targetFcfYield: 0.030 },
  },
  {
    id: "asml-hist-fy2023-q2",
    eventDate: "2023-06-30",
    fiscalPeriod: "FY2023 Q2",
    overrides: { normalizedRevenueUsd: 27_900, revenueCagr: 0.11, ordersGrowth: 0.08, backlogConversion: 0.74, grossMargin: 0.51, operatingMargin: 0.32, fcfMargin: 0.28, highNaRevenueMix: 0.02, euvDemandDurability: 0.73, highNaAdoption: 0.22, backlogCoverage: 1.18, chinaRevenueExposure: 0.21, chinaRestrictionHaircut: 0.06, aiCapexCycleRisk: 0.08, targetPe: 32, targetEvEbit: 29, targetFcfYield: 0.029 },
  },
  {
    id: "asml-hist-fy2023-q3",
    eventDate: "2023-09-30",
    fiscalPeriod: "FY2023 Q3",
    overrides: { normalizedRevenueUsd: 28_800, revenueCagr: 0.12, ordersGrowth: 0.11, backlogConversion: 0.75, grossMargin: 0.51, operatingMargin: 0.32, fcfMargin: 0.28, highNaRevenueMix: 0.03, euvDemandDurability: 0.74, highNaAdoption: 0.25, backlogCoverage: 1.20, chinaRevenueExposure: 0.22, chinaRestrictionHaircut: 0.06, aiCapexCycleRisk: 0.09, targetPe: 33, targetEvEbit: 30, targetFcfYield: 0.028 },
  },
  {
    id: "asml-hist-fy2023-q4",
    eventDate: "2023-12-31",
    fiscalPeriod: "FY2023 Q4",
    overrides: { normalizedRevenueUsd: 29_200, revenueCagr: 0.11, ordersGrowth: 0.06, backlogConversion: 0.74, grossMargin: 0.51, operatingMargin: 0.32, fcfMargin: 0.28, highNaRevenueMix: 0.03, euvDemandDurability: 0.73, highNaAdoption: 0.28, backlogCoverage: 1.17, chinaRevenueExposure: 0.23, chinaRestrictionHaircut: 0.07, aiCapexCycleRisk: 0.10, targetPe: 31, targetEvEbit: 28, targetFcfYield: 0.030 },
  },
  {
    id: "asml-hist-fy2024-q1",
    eventDate: "2024-03-31",
    fiscalPeriod: "FY2024 Q1",
    overrides: { normalizedRevenueUsd: 29_700, revenueCagr: 0.10, ordersGrowth: 0.02, backlogConversion: 0.72, grossMargin: 0.50, operatingMargin: 0.31, fcfMargin: 0.27, highNaRevenueMix: 0.04, euvDemandDurability: 0.72, highNaAdoption: 0.30, backlogCoverage: 1.13, chinaRevenueExposure: 0.24, chinaRestrictionHaircut: 0.08, aiCapexCycleRisk: 0.12, targetPe: 29, targetEvEbit: 26, targetFcfYield: 0.032 },
  },
  {
    id: "asml-hist-fy2024-q2",
    eventDate: "2024-06-30",
    fiscalPeriod: "FY2024 Q2",
    overrides: { normalizedRevenueUsd: 30_100, revenueCagr: 0.10, ordersGrowth: 0.04, backlogConversion: 0.73, grossMargin: 0.50, operatingMargin: 0.31, fcfMargin: 0.27, highNaRevenueMix: 0.05, euvDemandDurability: 0.73, highNaAdoption: 0.34, backlogCoverage: 1.14, chinaRevenueExposure: 0.24, chinaRestrictionHaircut: 0.08, aiCapexCycleRisk: 0.11, targetPe: 30, targetEvEbit: 27, targetFcfYield: 0.031 },
  },
  {
    id: "asml-hist-fy2024-q3",
    eventDate: "2024-09-30",
    fiscalPeriod: "FY2024 Q3",
    overrides: { normalizedRevenueUsd: 30_600, revenueCagr: 0.09, ordersGrowth: 0.03, backlogConversion: 0.72, grossMargin: 0.50, operatingMargin: 0.31, fcfMargin: 0.27, highNaRevenueMix: 0.05, euvDemandDurability: 0.72, highNaAdoption: 0.36, backlogCoverage: 1.12, chinaRevenueExposure: 0.24, chinaRestrictionHaircut: 0.09, aiCapexCycleRisk: 0.13, targetPe: 28, targetEvEbit: 26, targetFcfYield: 0.033 },
  },
  {
    id: "asml-hist-fy2024-q4",
    eventDate: "2024-12-31",
    fiscalPeriod: "FY2024 Q4",
    overrides: { normalizedRevenueUsd: 31_000, revenueCagr: 0.10, ordersGrowth: 0.06, backlogConversion: 0.74, grossMargin: 0.51, operatingMargin: 0.32, fcfMargin: 0.28, highNaRevenueMix: 0.06, euvDemandDurability: 0.74, highNaAdoption: 0.38, backlogCoverage: 1.17, chinaRevenueExposure: 0.23, chinaRestrictionHaircut: 0.08, aiCapexCycleRisk: 0.11, targetPe: 31, targetEvEbit: 28, targetFcfYield: 0.030 },
  },
  {
    id: "asml-hist-fy2025-q1",
    eventDate: "2025-03-31",
    fiscalPeriod: "FY2025 Q1",
    overrides: { normalizedRevenueUsd: 31_400, revenueCagr: 0.10, ordersGrowth: 0.07, backlogConversion: 0.75, grossMargin: 0.51, operatingMargin: 0.32, fcfMargin: 0.28, highNaRevenueMix: 0.07, euvDemandDurability: 0.75, highNaAdoption: 0.40, backlogCoverage: 1.18, chinaRevenueExposure: 0.23, chinaRestrictionHaircut: 0.08, aiCapexCycleRisk: 0.10, targetPe: 32, targetEvEbit: 29, targetFcfYield: 0.029 },
  },
  {
    id: "asml-hist-fy2025-q2",
    eventDate: "2025-06-30",
    fiscalPeriod: "FY2025 Q2",
    overrides: { normalizedRevenueUsd: 31_700, revenueCagr: 0.10, ordersGrowth: 0.07, backlogConversion: 0.76, grossMargin: 0.51, operatingMargin: 0.33, fcfMargin: 0.28, highNaRevenueMix: 0.08, euvDemandDurability: 0.76, highNaAdoption: 0.42, backlogCoverage: 1.19, chinaRevenueExposure: 0.23, chinaRestrictionHaircut: 0.08, aiCapexCycleRisk: 0.10, targetPe: 32, targetEvEbit: 29, targetFcfYield: 0.029 },
  },
  {
    id: "asml-hist-fy2025-q3",
    eventDate: "2025-09-30",
    fiscalPeriod: "FY2025 Q3",
    overrides: { normalizedRevenueUsd: 31_900, revenueCagr: 0.10, ordersGrowth: 0.08, backlogConversion: 0.77, grossMargin: 0.51, operatingMargin: 0.33, fcfMargin: 0.29, highNaRevenueMix: 0.08, euvDemandDurability: 0.77, highNaAdoption: 0.44, backlogCoverage: 1.20, chinaRevenueExposure: 0.23, chinaRestrictionHaircut: 0.08, aiCapexCycleRisk: 0.10, targetPe: 32, targetEvEbit: 29, targetFcfYield: 0.028 },
  },
  {
    id: "asml-hist-fy2025-q4",
    eventDate: "2025-12-31",
    fiscalPeriod: "FY2025 Q4",
    overrides: { normalizedRevenueUsd: 32_000, revenueCagr: 0.10, ordersGrowth: 0.08, backlogConversion: 0.78, grossMargin: 0.51, operatingMargin: 0.33, fcfMargin: 0.29, highNaRevenueMix: 0.08, euvDemandDurability: 0.78, highNaAdoption: 0.45, backlogCoverage: 1.20, chinaRevenueExposure: 0.23, chinaRestrictionHaircut: 0.08, aiCapexCycleRisk: 0.10, targetPe: 32, targetEvEbit: 29, targetFcfYield: 0.028 },
  },
];

export function buildAsmlHistoricalValuationScaffold(
  data: unknown,
  scenario: Scenario = "Base",
): AsmlHistoricalValuationItem[] {
  const dataset = resolveAsmlDataset(data);
  return asmlHistoricalScaffoldAssumptions.map((item) => {
    const priceRow = nearestAsmlPriceOnOrBefore(item.eventDate);
    const asOfPrice = priceRow?.adjustedClose ?? null;
    const assumptions: AsmlValuationAssumptions = {
      ...defaultAsmlValuationAssumptions,
      ...asmlScenarioPresets[scenario],
      ...item.overrides,
      currentPrice: asOfPrice ?? 0,
    };
    const point = computeScenarioPoint(scenario, dataset, assumptions);
    const expectedShareholderCagr = asOfPrice && point.targetPrice3Y
      ? (point.targetPrice3Y / asOfPrice) ** (1 / 3) - 1
      : null;
    const upsideDownside = asOfPrice && point.fairValue ? point.fairValue / asOfPrice - 1 : null;
    return {
      event: {
        id: item.id,
        eventDate: item.eventDate,
        eventType: "research_scaffold",
        fiscalPeriod: item.fiscalPeriod,
        label: `${item.fiscalPeriod} valuation event`,
        sourceStatus: "placeholder",
        sourceNote: "Research event view using stored period assumptions and nearest-prior ASML ADR price where available.",
      },
      valuationRun: {
        id: `${item.id}-base-run`,
        asOfDate: item.eventDate,
        currentPrice: asOfPrice,
        fairValue: Number.isFinite(point.fairValue) ? point.fairValue : null,
        targetPrice3Y: Number.isFinite(point.targetPrice3Y) ? point.targetPrice3Y : null,
        expectedShareholderCagr,
        upsideDownside,
        methodOutputsJson: [
          { key: "dcf", label: "DCF Fair Value", value: point.dcfFairValue, format: "currency", description: "Event DCF using only the assumptions stored in this row." },
          { key: "fcf-yield", label: "FCF Yield Value", value: point.fcfFairValue, format: "currency", description: "Event normalized FCF yield cross-check." },
          { key: "pe", label: "P/E Value", value: point.peFairValue, format: "currency", description: "Event earnings multiple cross-check." },
          { key: "ev-ebit", label: "EV / EBIT Value", value: point.evEbitFairValue, format: "currency", description: "Event operating-profit multiple cross-check." },
          { key: "sotp", label: "Systems / Service SOTP", value: point.sotpFairValue, format: "currency", description: "Event systems, service and High-NA SOTP." },
        ],
        warningsJson: [
          {
            id: "asml-historical-scaffold",
            title: "Historical model view",
            detail: "ASML historical valuation rows vary by event assumptions, but they are not yet sourced from an ASML SQLite backend.",
            severity: "medium",
          },
          ...(asOfPrice
            ? [
                {
                  id: "asml-historical-price-loaded",
                  title: "As-of price loaded",
                  detail: `ASML adjusted close uses nearest prior Yahoo Finance daily bar: ${priceRow?.priceDate}.`,
                  severity: "low",
                },
              ]
            : [
                {
                  id: "asml-historical-price-missing",
                  title: "As-of price unavailable",
                  detail: "Run npm run asml:fetch-official to load ASML daily price bars for historical price comparison.",
                  severity: "high",
                },
              ]),
        ],
        dataSnapshotJson: {
          assumptions: item.overrides,
          revenueBase: assumptions.normalizedRevenueUsd,
          effectiveGrowth: point.effectiveGrowth,
          normalizedRevenue: point.normalizedRevenue,
          operatingMargin: point.operatingMargin,
          fcfMargin: point.fcfMargin,
          riskMultiplier: point.riskMultiplier,
          sourceDiscipline: "No future leakage within the view: each row stores its own assumptions and uses the nearest daily ASML adjusted close on or before the event date.",
        },
      },
    };
  });
}

export function buildAsmlDashboardData(
  data: unknown,
  scenario: Scenario,
  assumptions: Partial<AsmlValuationAssumptions>,
) {
  const dataset = resolveAsmlDataset(data);
  const valuation = calculateAsmlValuation(dataset, assumptions, scenario);
  const missingFields = dataset.sourceGaps.map((gap) => gap.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  return {
    dataset,
    valuation,
    dataStatus: {
      sourceType: "manual" as const,
      lastUpdated: dataset.marketData.priceDate,
      missingFields,
      validationWarnings: valuation.validationWarnings ?? [],
      valuationReliable: false,
    },
    summary: calculateAsmlSummary(dataset),
    historicalValuations: buildAsmlHistoricalValuationScaffold(dataset, scenario),
    investmentQuestions: dataset.researchQuestions.map((question) => ({
      title: question.question,
      text: `${question.currentView} Evidence needed: ${question.evidenceNeeded}`,
    })),
    questions: dataset.researchQuestions,
    sourceGaps: dataset.sourceGaps,
    marketPriceHistory: {
      rowCount: asmlMarketPriceMetadata.rowCount,
      fullRawRowCount: asmlMarketPriceMetadata.fullRawRowCount,
      firstDate: asmlMarketPriceMetadata.firstDate,
      lastDate: asmlMarketPriceMetadata.lastDate,
      latestPrice: asmlMarketPriceMetadata.latestPrice,
      source: asmlMarketPriceMetadata.source,
    },
    eightYearMarketAnalysis: buildAsmlEightYearMarketAnalysis(),
    revenuePools: {
      systemsRevenue: selectedNumber(valuation.sensitivityTables[1]?.table?.[1]?.[1]),
      serviceRevenue: selectedNumber(valuation.sensitivityTables[1]?.table?.[2]?.[1]),
      highNaRevenue: selectedNumber(valuation.sensitivityTables[1]?.table?.[5]?.[1]),
    },
  };
}

function selectedNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
