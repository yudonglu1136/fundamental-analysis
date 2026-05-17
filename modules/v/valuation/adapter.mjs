import { V_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  const parsed = finite(value);
  if (parsed == null) return min;
  return Math.max(min, Math.min(max, parsed));
}

function latestByAsOfDate(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.asOfDate)
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
  return sorted[sorted.length - 1] ?? null;
}

function selectValuationFinancial(snapshot) {
  const financials = snapshot?.financialPeriods ?? [];
  const eventId = snapshot?.reportingEvent?.id;
  return financials.find((row) => row.eventId === eventId) ?? latestByAsOfDate(financials);
}

function trailingQuarterRows(snapshot, selected) {
  if (!selected) return [];
  const quarters = [...(snapshot?.financialPeriods ?? [])]
    .filter((row) => row?.periodType === "quarter" && row?.asOfDate && row.asOfDate <= selected.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const selectedIndex = quarters.findIndex((row) => row.periodId === selected.periodId || row.eventId === selected.eventId);
  const endIndex = selectedIndex >= 0 ? selectedIndex : quarters.length - 1;
  return quarters.slice(Math.max(0, endIndex - 3), endIndex + 1);
}

function sum(rows, key) {
  const values = rows.map((row) => finite(row?.[key])).filter((value) => value != null);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function average(values) {
  const finiteValues = values.map(finite).filter((value) => value != null);
  return finiteValues.length ? finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length : null;
}

function latestMetric(snapshot, selected) {
  const metrics = [...(snapshot?.operatingMetricSnapshots ?? [])]
    .filter((row) => row?.asOfDate && row.asOfDate <= selected.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  return metrics[metrics.length - 1] ?? null;
}

function scenarioDrivers(scenario, assumptions = {}) {
  const base = {
    revenueGrowth: 0.105,
    crossBorderGrowth: 0.13,
    switchedTransactionGrowth: 0.10,
    valueAddedServicesGrowth: 0.15,
    operatingMargin: 0.585,
    normalizedFcfMargin: 0.49,
    terminalGrowth: 0.035,
    discountRate: 0.082,
    targetFcfYield: 0.028,
    targetPe: 34,
    targetEvEbit: 29,
    peerPremium: 0.08,
    regulatoryHaircut: 0.035,
    alternativeRailsHaircut: 0.015,
    buybackYield: 0.022,
    dividendYield: 0.006,
  };
  const presets = {
    Bear: {
      revenueGrowth: 0.065,
      crossBorderGrowth: 0.06,
      switchedTransactionGrowth: 0.07,
      valueAddedServicesGrowth: 0.10,
      operatingMargin: 0.555,
      normalizedFcfMargin: 0.455,
      terminalGrowth: 0.025,
      discountRate: 0.09,
      targetFcfYield: 0.034,
      targetPe: 27,
      targetEvEbit: 23,
      peerPremium: -0.02,
      regulatoryHaircut: 0.09,
      alternativeRailsHaircut: 0.04,
      buybackYield: 0.014,
    },
    Base: base,
    Bull: {
      revenueGrowth: 0.125,
      crossBorderGrowth: 0.16,
      switchedTransactionGrowth: 0.12,
      valueAddedServicesGrowth: 0.18,
      operatingMargin: 0.605,
      normalizedFcfMargin: 0.51,
      terminalGrowth: 0.04,
      discountRate: 0.078,
      targetFcfYield: 0.025,
      targetPe: 39,
      targetEvEbit: 33,
      peerPremium: 0.14,
      regulatoryHaircut: 0.02,
      alternativeRailsHaircut: 0.01,
      buybackYield: 0.026,
    },
  };
  return { ...base, ...(presets[scenario] ?? base), ...assumptions };
}

function buildBaseline(snapshot) {
  const selected = selectValuationFinancial(snapshot);
  if (!selected) return null;
  const windowRows = trailingQuarterRows(snapshot, selected);
  const annualizationFactor = windowRows.length ? 4 / windowRows.length : 4;
  const annualRevenue = (sum(windowRows, "revenue") ?? finite(selected.revenue) ?? 0) * annualizationFactor;
  const annualOperatingIncome = (sum(windowRows, "operatingIncome") ?? finite(selected.operatingIncome) ?? annualRevenue * 0.57) * annualizationFactor;
  const annualNetIncome = (sum(windowRows, "netIncome") ?? finite(selected.netIncome) ?? annualOperatingIncome * 0.80) * annualizationFactor;
  const annualFcf = (sum(windowRows, "freeCashFlow") ?? finite(selected.freeCashFlow) ?? annualRevenue * 0.48) * annualizationFactor;
  const annualDividends = (sum(windowRows, "dividendsPaid") ?? finite(selected.dividendsPaid) ?? annualRevenue * 0.08) * annualizationFactor;
  const annualBuybacks = (sum(windowRows, "buybacks") ?? finite(selected.buybacks) ?? annualRevenue * 0.32) * annualizationFactor;
  const dilutedShares =
    average(windowRows.map((row) => row.dilutedShares)) ??
    finite(selected.dilutedShares) ??
    finite(snapshot?.marketSnapshot?.sharesOutstanding) ??
    900;
  const metric = latestMetric(snapshot, selected);
  const marketCap = finite(snapshot?.marketSnapshot?.marketCap);
  const enterpriseValue = finite(snapshot?.marketSnapshot?.enterpriseValue);
  const netCashDebt =
    finite(selected.netCashDebt) ??
    (marketCap != null && enterpriseValue != null ? marketCap - enterpriseValue : 0);
  return {
    selected,
    windowRows,
    metric,
    annualRevenue,
    annualOperatingIncome,
    annualNetIncome,
    annualFcf,
    annualDividends,
    annualBuybacks,
    dilutedShares,
    netCashDebt: netCashDebt ?? 0,
    currentPrice: finite(snapshot?.marketSnapshot?.currentPrice) ?? finite(selected.currentPrice) ?? null,
    latestFinancialAsOfDate: selected.asOfDate,
    latestMetricAsOfDate: metric?.asOfDate ?? selected.asOfDate,
    grossDollarVolume: finite(metric?.grossDollarVolume),
    crossBorderVolumeGrowth: finite(metric?.crossBorderVolumeGrowth),
    switchedTransactionsGrowth: finite(metric?.switchedTransactionsGrowth),
    takeRate: finite(metric?.takeRate),
  };
}

function dcfPerShare({ fcf, growth, terminalGrowth, discountRate, shares, netCashDebt }) {
  let presentValue = 0;
  let yearFcf = fcf;
  for (let year = 1; year <= 5; year += 1) {
    const fade = 1 - (year - 1) * 0.10;
    yearFcf *= 1 + Math.max(growth * fade, terminalGrowth);
    presentValue += yearFcf / (1 + discountRate) ** year;
  }
  const terminalFcf = yearFcf * (1 + terminalGrowth);
  const terminalValue = terminalFcf / Math.max(discountRate - terminalGrowth, 0.025);
  presentValue += terminalValue / (1 + discountRate) ** 5;
  return (presentValue + netCashDebt) / shares;
}

function valueForScenario(name, baseline, assumptions) {
  const drivers = scenarioDrivers(name, assumptions);
  const eventCrossBorder = baseline.crossBorderVolumeGrowth;
  const eventSwitchedGrowth = baseline.switchedTransactionsGrowth;
  const crossBorderGrowth = eventCrossBorder == null ? drivers.crossBorderGrowth : clamp((eventCrossBorder + drivers.crossBorderGrowth) / 2, -0.20, 0.25);
  const switchedGrowth = eventSwitchedGrowth == null ? drivers.switchedTransactionGrowth : clamp((eventSwitchedGrowth + drivers.switchedTransactionGrowth) / 2, 0.02, 0.17);
  const vasGrowth = drivers.valueAddedServicesGrowth;
  const revenueGrowth = clamp(
    drivers.revenueGrowth * 0.55 + crossBorderGrowth * 0.20 + switchedGrowth * 0.15 + vasGrowth * 0.10,
    -0.02,
    0.18,
  );
  const margin = clamp(
    drivers.operatingMargin + (switchedGrowth - 0.10) * 0.12 + (vasGrowth - 0.15) * 0.08 - drivers.regulatoryHaircut * 0.08,
    0.48,
    0.64,
  );
  const fcfMargin = clamp(drivers.normalizedFcfMargin + (margin - 0.58) * 0.35, 0.40, 0.56);
  const nextRevenue = baseline.annualRevenue * (1 + revenueGrowth);
  const nextOperatingIncome = nextRevenue * margin;
  const nextFcf = nextRevenue * fcfMargin;
  const nextNetIncome = nextOperatingIncome * 0.79;
  const buybackShareReduction = clamp(drivers.buybackYield, 0, 0.035);
  const shares = baseline.dilutedShares * (1 - buybackShareReduction);
  const eps = nextNetIncome / shares;
  const fcfPerShare = nextFcf / shares;
  const growthForDcf = clamp(revenueGrowth + (fcfMargin - (baseline.annualFcf / Math.max(baseline.annualRevenue, 1))) * 0.25, 0.02, 0.16);
  const dcfValue = dcfPerShare({
    fcf: baseline.annualFcf,
    growth: growthForDcf,
    terminalGrowth: drivers.terminalGrowth,
    discountRate: drivers.discountRate,
    shares,
    netCashDebt: baseline.netCashDebt,
  });
  const fcfYieldValue = fcfPerShare / drivers.targetFcfYield;
  const peValue = eps * drivers.targetPe;
  const evEbitValue = (nextOperatingIncome * drivers.targetEvEbit + baseline.netCashDebt) / shares;
  const peerValue = eps * 32 * (1 + drivers.peerPremium);
  const businessRiskHaircut = 1 - drivers.regulatoryHaircut - drivers.alternativeRailsHaircut;
  const blendedFairValue = (
    dcfValue * 0.35 +
    fcfYieldValue * 0.25 +
    peValue * 0.20 +
    evEbitValue * 0.10 +
    peerValue * 0.10
  ) * businessRiskHaircut;
  const cumulativeDividends = (baseline.annualDividends / baseline.dilutedShares) * 3 * 1.08;
  const targetPrice3Y = blendedFairValue * (1 + revenueGrowth) ** 2.2;
  const currentPrice = baseline.currentPrice;
  return {
    scenario: name,
    fairValue: blendedFairValue,
    upsideDownside: currentPrice ? blendedFairValue / currentPrice - 1 : null,
    expectedReturn3Y: currentPrice ? ((targetPrice3Y + cumulativeDividends) / currentPrice) ** (1 / 3) - 1 : null,
    targetPrice3Y,
    cumulativeDividends,
    drivers,
    methodValues: {
      dcfValue,
      fcfYieldValue,
      peValue,
      evEbitValue,
      peerValue,
    },
    methodFacts: {
      nextRevenue,
      nextOperatingIncome,
      nextFcf,
      nextNetIncome,
      eps,
      fcfPerShare,
      revenueGrowth,
      margin,
      fcfMargin,
      crossBorderGrowth,
      switchedGrowth,
      vasGrowth,
      businessRiskHaircut,
    },
  };
}

function methodCard(key, label, value, description, valuationBase) {
  return {
    key,
    label,
    value,
    format: "currency",
    description,
    valuationBase,
    sourceConfidence: "medium",
  };
}

function warning(id, title, detail, severity = "low") {
  return { id, title, detail, severity };
}

export async function runVBackendValuation({
  snapshot,
  scenario = "Base",
  modelVersion = V_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const baseline = buildBaseline(snapshot);
  if (!baseline) {
    throw new Error("V backend valuation requires at least one event-visible financial_periods row.");
  }
  const fairValues = ["Bear", "Base", "Bull"].map((name) => valueForScenario(name, baseline, name === scenario ? assumptions : {}));
  const selected = fairValues.find((row) => row.scenario === scenario) ?? fairValues[1];
  const currentPrice = baseline.currentPrice;
  const methodValues = selected.methodValues;
  const methodFacts = selected.methodFacts;
  const warnings = [
    warning(
      "v-proxy-seed-data",
      "V official parser pending",
      "Financial and operating metric rows are tagged official_seed or market_data_proxy until the Visa SEC/companyfacts parser is promoted.",
      "medium",
    ),
    ...(baseline.windowRows.length < 4
      ? [warning("v-partial-ttm", "Partial historical window", `${baseline.selected.periodId} valuation annualizes ${baseline.windowRows.length} quarter(s) visible as of the event date.`, "medium")]
      : []),
    ...(baseline.crossBorderVolumeGrowth != null && baseline.crossBorderVolumeGrowth < 0
      ? [warning("v-cross-border-shock", "Cross-border travel shock", "This historical event uses the then-visible cross-border decline rather than later recovery assumptions.", "low")]
      : []),
  ];

  const methodCards = [
    methodCard("dcf", "DCF / FCFF", methodValues.dcfValue, "Five-year FCFF fade with event-visible revenue growth, cross-border recovery, operating leverage, terminal growth, and discount rate.", "normalized TTM FCF"),
    methodCard("fcf-yield", "FCF Yield", methodValues.fcfYieldValue, "Normalized FCF per share capitalized at the scenario's target yield.", "next-year FCF per share"),
    methodCard("pe", "P/E", methodValues.peValue, "Next-year EPS after buyback-driven share-count reduction capitalized at the scenario's P/E.", "next-year EPS"),
    methodCard("ev-ebit", "EV/EBIT", methodValues.evEbitValue, "Network operating income capitalized at an EV/EBIT multiple and bridged to equity value.", "next-year EBIT"),
    methodCard("peer-premium", "Payments Peer Premium", methodValues.peerValue, "Mastercard/Amex/processor peer reference with explicit premium or discount for V growth and risk framing.", "peer EPS multiple"),
  ];

  const sensitivityTables = [
    {
      title: "Cross-Border vs Regulatory Haircut",
      table: [
        ["Cross-border / Reg", "Low reg", "Base reg", "High reg"],
        ["Normalizing", selected.fairValue * 1.04, selected.fairValue, selected.fairValue * 0.92],
        ["Recovery", selected.fairValue * 1.10, selected.fairValue * 1.05, selected.fairValue * 0.97],
        ["Shock", selected.fairValue * 0.95, selected.fairValue * 0.90, selected.fairValue * 0.82],
      ],
    },
    {
      title: "FCF Yield Sensitivity",
      table: [
        ["Yield", "2.5%", "2.8%", "3.2%", "3.5%"],
        ["Fair value", methodFacts.fcfPerShare / 0.025, methodFacts.fcfPerShare / 0.028, methodFacts.fcfPerShare / 0.032, methodFacts.fcfPerShare / 0.035],
      ],
    },
  ];

  return {
    ticker: "V",
    modelVersion,
    scenario,
    currentPrice,
    priceDate: snapshot?.marketSnapshot?.priceDate ?? snapshot?.asOfDate,
    fairValues: fairValues.map((row) => ({
      scenario: row.scenario,
      fairValue: row.fairValue,
      upsideDownside: row.upsideDownside,
      expectedReturn3Y: row.expectedReturn3Y,
      targetPrice3Y: row.targetPrice3Y,
      cumulativeDividends: row.cumulativeDividends,
      summary: `${row.scenario}: revenue growth ${Math.round(row.methodFacts.revenueGrowth * 1000) / 10}%, operating margin ${Math.round(row.methodFacts.margin * 1000) / 10}%, regulatory haircut ${Math.round(row.drivers.regulatoryHaircut * 1000) / 10}%.`,
    })),
    recommendedFairValue: selected.fairValue,
    blendedFairValue: selected.fairValue,
    probabilityWeightedFairValue: fairValues[0].fairValue * 0.25 + fairValues[1].fairValue * 0.50 + fairValues[2].fairValue * 0.25,
    targetPrice3Y: selected.targetPrice3Y,
    expectedReturn3Y: selected.expectedReturn3Y,
    upsideDownside: selected.upsideDownside,
    methodCards,
    sensitivityTables,
    validationWarnings: warnings,
    assumptions: selected.drivers,
    fcfFairValue: methodValues.fcfYieldValue,
    peFairValue: methodValues.peValue,
    dcfValue: methodValues.dcfValue,
    expectedReturnBridge: [
      { key: "organic-growth", label: "Organic growth", value: methodFacts.revenueGrowth, format: "percent", description: "Revenue growth from cross-border, switched transactions, and VAS mix." },
      { key: "fcf-conversion", label: "FCF margin", value: methodFacts.fcfMargin, format: "percent", description: "Normalized FCF conversion after low capex intensity." },
      { key: "buyback-yield", label: "Buyback yield", value: selected.drivers.buybackYield, format: "percent", description: "Gross repurchase support for EPS growth." },
      { key: "regulatory-risk", label: "Regulatory haircut", value: selected.drivers.regulatoryHaircut, format: "percent", description: "Network-fee/interchange/routing risk applied explicitly." },
    ],
    backendSnapshot: {
      ticker: "V",
      asOfDate: snapshot?.asOfDate,
      reportingEventId: snapshot?.reportingEvent?.id,
      reportingEventDate: snapshot?.reportingEvent?.eventDate,
      fiscalPeriod: snapshot?.reportingEvent?.fiscalPeriod,
      sourceMaxAsOfDate: baseline.latestFinancialAsOfDate,
      latestFinancialAsOfDate: baseline.latestFinancialAsOfDate,
      latestMetricAsOfDate: baseline.latestMetricAsOfDate,
      latestAnnualizedRevenue: baseline.annualRevenue,
      latestAnnualizedOperatingIncome: baseline.annualOperatingIncome,
      latestAnnualizedFcf: baseline.annualFcf,
      latestAnnualizedNetIncome: baseline.annualNetIncome,
      dilutedShares: baseline.dilutedShares,
      asOfAssumptionOverrides: {
        revenueGrowth: methodFacts.revenueGrowth,
        crossBorderGrowth: methodFacts.crossBorderGrowth,
        switchedTransactionGrowth: methodFacts.switchedGrowth,
        valueAddedServicesGrowth: methodFacts.vasGrowth,
        operatingMargin: methodFacts.margin,
        normalizedFcfMargin: methodFacts.fcfMargin,
        regulatoryHaircut: selected.drivers.regulatoryHaircut,
        alternativeRailsHaircut: selected.drivers.alternativeRailsHaircut,
        dilutedShares: baseline.dilutedShares,
      },
      vAnalyticalFramework: {
        crossBorderAndTravel: baseline.metric?.crossBorderCommentary ?? null,
        switchedTransactions: baseline.metric?.switchedTransactionsGrowth ?? null,
        takeRate: baseline.takeRate,
        valueAddedServices: baseline.metric?.valueAddedServicesCommentary ?? null,
        regulation: baseline.metric?.regulatoryCommentary ?? null,
        competition: baseline.metric?.competitionCommentary ?? null,
        capitalReturn: baseline.metric?.capitalReturnCommentary ?? null,
      },
      sourceQuality: parseJson(baseline.selected.rawJson, {}).sourceQuality ?? baseline.selected.sourceType,
    },
  };
}
