import { ANET_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

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
    revenueGrowth: 0.18,
    subscriptionGrowth: 0.17,
    currentRpoGrowth: 0.19,
    agenticAiGrowth: 0.75,
    proPlusAdoptionRate: 0.22,
    netRetentionRate: 1.21,
    operatingMargin: 0.38,
    normalizedFcfMargin: 0.33,
    terminalGrowth: 0.035,
    discountRate: 0.09,
    targetFcfYield: 0.027,
    targetPe: 34,
    targetEvRevenue: 10,
    peerPremium: 0.12,
    aiExecutionHaircut: 0.04,
    platformCompetitionHaircut: 0.03,
    sbcDilutionHaircut: 0.02,
    buybackYield: 0.008,
    dividendYield: 0,
  };
  const presets = {
    Bear: {
      revenueGrowth: 0.08,
      subscriptionGrowth: 0.09,
      currentRpoGrowth: 0.05,
      agenticAiGrowth: 0.35,
      proPlusAdoptionRate: 0.45,
      netRetentionRate: 1.05,
      operatingMargin: 0.33,
      normalizedFcfMargin: 0.29,
      discountRate: 0.095,
      targetFcfYield: 0.035,
      targetPe: 22,
      targetEvRevenue: 8,
      peerPremium: -0.05,
      aiExecutionHaircut: 0.10,
      platformCompetitionHaircut: 0.08,
      sbcDilutionHaircut: 0.04,
      buybackYield: 0.004,
    },
    Base: base,
    Bull: {
      revenueGrowth: 0.22,
      subscriptionGrowth: 0.23,
      currentRpoGrowth: 0.22,
      agenticAiGrowth: 0.75,
      proPlusAdoptionRate: 0.62,
      netRetentionRate: 1.12,
      operatingMargin: 0.41,
      normalizedFcfMargin: 0.36,
      discountRate: 0.08,
      targetFcfYield: 0.023,
      targetPe: 44,
      targetEvRevenue: 14,
      peerPremium: 0.20,
      aiExecutionHaircut: 0.02,
      platformCompetitionHaircut: 0.015,
      sbcDilutionHaircut: 0.015,
      buybackYield: 0.012,
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
    subscriptionRevenue: finite(metric?.subscriptionRevenue),
    subscriptionRevenueGrowth: finite(metric?.subscriptionRevenueGrowth),
    currentRpo: finite(metric?.currentRpo),
    currentRpoGrowth: finite(metric?.currentRpoGrowth),
    remainingPerformanceObligations: finite(metric?.remainingPerformanceObligations),
    netRetentionRate: finite(metric?.netRetentionRate),
    agenticAiArr: finite(metric?.agenticAiArr),
    agenticAiCustomers: finite(metric?.agenticAiCustomers),
    proPlusAdoptionRate: finite(metric?.proPlusAdoptionRate),
    sbcToRevenue: annualRevenue ? sum(windowRows, "stockBasedCompensation") / annualRevenue * annualizationFactor : null,
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
  const eventSubscriptionGrowth = baseline.subscriptionRevenueGrowth;
  const eventCurrentRpoGrowth = baseline.currentRpoGrowth;
  const eventNetRetention = baseline.netRetentionRate;
  const subscriptionGrowth = eventSubscriptionGrowth == null ? drivers.subscriptionGrowth : clamp((eventSubscriptionGrowth + drivers.subscriptionGrowth) / 2, 0.04, 0.32);
  const currentRpoGrowth = eventCurrentRpoGrowth == null ? drivers.currentRpoGrowth : clamp((eventCurrentRpoGrowth + drivers.currentRpoGrowth) / 2, 0.02, 0.32);
  const netRetentionRate = eventNetRetention == null ? drivers.netRetentionRate : clamp((eventNetRetention + drivers.netRetentionRate) / 2, 1.05, 1.35);
  const agenticAiGrowth = clamp(drivers.agenticAiGrowth, 0, 1.5);
  const proPlusAdoptionRate = baseline.proPlusAdoptionRate == null ? drivers.proPlusAdoptionRate : clamp((baseline.proPlusAdoptionRate + drivers.proPlusAdoptionRate) / 2, 0, 0.60);
  const revenueGrowth = clamp(
    drivers.revenueGrowth * 0.35 + subscriptionGrowth * 0.30 + currentRpoGrowth * 0.20 + (netRetentionRate - 1) * 0.10 + agenticAiGrowth * 0.03 + proPlusAdoptionRate * 0.02,
    0.02,
    0.30,
  );
  const margin = clamp(
    drivers.operatingMargin + (subscriptionGrowth - 0.16) * 0.08 + proPlusAdoptionRate * 0.03 - drivers.platformCompetitionHaircut * 0.08 - drivers.sbcDilutionHaircut * 0.04,
    0.25,
    0.45,
  );
  const fcfMargin = clamp(drivers.normalizedFcfMargin + (margin - 0.34) * 0.45 - drivers.sbcDilutionHaircut * 0.20, 0.24, 0.42);
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
  const evRevenueValue = (nextRevenue * drivers.targetEvRevenue + baseline.netCashDebt) / shares;
  const peerValue = eps * 42 * (1 + drivers.peerPremium);
  const businessRiskHaircut = 1 - drivers.aiExecutionHaircut - drivers.platformCompetitionHaircut - drivers.sbcDilutionHaircut;
  const blendedFairValue = (
    dcfValue * 0.35 +
    fcfYieldValue * 0.25 +
    peValue * 0.20 +
    evRevenueValue * 0.10 +
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
      evRevenueValue,
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
      subscriptionGrowth,
      currentRpoGrowth,
      agenticAiGrowth,
      proPlusAdoptionRate,
      netRetentionRate,
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

export async function runAnetBackendValuation({
  snapshot,
  scenario = "Base",
  modelVersion = ANET_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const baseline = buildBaseline(snapshot);
  if (!baseline) {
    throw new Error("ANET backend valuation requires at least one event-visible financial_periods row.");
  }
  const fairValues = ["Bear", "Base", "Bull"].map((name) => valueForScenario(name, baseline, name === scenario ? assumptions : {}));
  const selected = fairValues.find((row) => row.scenario === scenario) ?? fairValues[1];
  const currentPrice = baseline.currentPrice;
  const methodValues = selected.methodValues;
  const methodFacts = selected.methodFacts;
  const warnings = [
    warning(
      "anet-proxy-seed-data",
      "ANET official parser pending",
      "Financial and operating metric rows are tagged official_seed or market_data_proxy until the Arista SEC/companyfacts parser is promoted.",
      "medium",
    ),
    ...(baseline.windowRows.length < 4
      ? [warning("anet-partial-ttm", "Partial historical window", `${baseline.selected.periodId} valuation annualizes ${baseline.windowRows.length} quarter(s) visible as of the event date.`, "medium")]
      : []),
  ];

  const methodCards = [
    methodCard("dcf", "DCF / FCFF", methodValues.dcfValue, "Five-year FCFF fade with event-visible cloud titan growth, backlog growth, operating leverage, terminal growth, and discount rate.", "normalized TTM FCF"),
    methodCard("fcf-yield", "FCF Yield", methodValues.fcfYieldValue, "Normalized FCF per share capitalized at the scenario's target yield.", "next-year FCF per share"),
    methodCard("pe", "P/E", methodValues.peValue, "Next-year EPS after SBC dilution and buyback offset capitalized at the scenario's P/E.", "next-year EPS"),
    methodCard("ev-revenue", "EV/Revenue", methodValues.evRevenueValue, "Forward revenue capitalized at a AI networking growth-and-margin multiple and bridged to equity value.", "next-year revenue"),
    methodCard("peer-premium", "AI Networking Peer Premium", methodValues.peerValue, "AI networking peer reference with explicit premium or discount for AI adoption and platform risk.", "peer EPS multiple"),
  ];

  const sensitivityTables = [
    {
      title: "AI Ethernet Demand vs Competition Risk",
      table: [
        ["AI Ethernet / Risk", "Low risk", "Base risk", "High risk"],
        ["Slow adoption", selected.fairValue * 0.98, selected.fairValue * 0.93, selected.fairValue * 0.84],
        ["Base adoption", selected.fairValue * 1.05, selected.fairValue, selected.fairValue * 0.90],
        ["Strong adoption", selected.fairValue * 1.16, selected.fairValue * 1.09, selected.fairValue * 0.98],
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
    ticker: "ANET",
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
      summary: `${row.scenario}: revenue growth ${Math.round(row.methodFacts.revenueGrowth * 1000) / 10}%, FCF margin ${Math.round(row.methodFacts.fcfMargin * 1000) / 10}%, AI execution haircut ${Math.round(row.drivers.aiExecutionHaircut * 1000) / 10}%.`,
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
      { key: "subscription-growth", label: "Cloud titan growth", value: methodFacts.subscriptionGrowth, format: "percent", description: "Event-visible cloud titan growth blended with scenario demand." },
      { key: "crpo-growth", label: "backlog growth", value: methodFacts.currentRpoGrowth, format: "percent", description: "Forward demand check from current remaining performance obligations." },
      { key: "fcf-conversion", label: "FCF margin", value: methodFacts.fcfMargin, format: "percent", description: "Normalized FCF conversion after cloud cost, sales efficiency and SBC checks." },
      { key: "ai-risk", label: "AI execution haircut", value: selected.drivers.aiExecutionHaircut, format: "percent", description: "Explicit haircut for AI Ethernet demand conversion risk." },
    ],
    backendSnapshot: {
      ticker: "ANET",
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
        subscriptionGrowth: methodFacts.subscriptionGrowth,
        currentRpoGrowth: methodFacts.currentRpoGrowth,
        agenticAiGrowth: methodFacts.agenticAiGrowth,
        proPlusAdoptionRate: methodFacts.proPlusAdoptionRate,
        netRetentionRate: methodFacts.netRetentionRate,
        operatingMargin: methodFacts.margin,
        normalizedFcfMargin: methodFacts.fcfMargin,
        aiExecutionHaircut: selected.drivers.aiExecutionHaircut,
        platformCompetitionHaircut: selected.drivers.platformCompetitionHaircut,
        sbcDilutionHaircut: selected.drivers.sbcDilutionHaircut,
        dilutedShares: baseline.dilutedShares,
      },
      anetAnalyticalFramework: {
        subscriptionRevenueGrowth: baseline.subscriptionRevenueGrowth,
        currentRpoGrowth: baseline.currentRpoGrowth,
        currentRpo: baseline.currentRpo,
        netRetentionRate: baseline.netRetentionRate,
        agenticAiArr: baseline.agenticAiArr,
        agenticAiCustomers: baseline.agenticAiCustomers,
        proPlusAdoptionRate: baseline.proPlusAdoptionRate,
        aiAgentCommentary: baseline.metric?.aiAgentCommentary ?? null,
        competition: baseline.metric?.competitionCommentary ?? null,
        capitalReturn: baseline.metric?.capitalReturnCommentary ?? null,
      },
      sourceQuality: parseJson(baseline.selected.rawJson, {}).sourceQuality ?? baseline.selected.sourceType,
    },
  };
}
