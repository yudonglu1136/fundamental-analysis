import { createServer } from "vite";
import { GOOGL_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => typeof value === "number" && Number.isFinite(value)));
}

function clamp(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function latestByAsOfDate(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate) || (left.periodId ?? "").localeCompare(right.periodId ?? ""));
  return sorted[sorted.length - 1];
}

function valuationFinancialForSnapshot(snapshot) {
  const rows = snapshot?.financialPeriods ?? [];
  const eventId = snapshot?.reportingEvent?.id;
  const eventRows = eventId ? rows.filter((row) => row.eventId === eventId) : [];
  return latestByAsOfDate(eventRows) ?? latestByAsOfDate(rows);
}

function sourceStatus(sourceType) {
  if (sourceType === "official_actual") return "official_actual";
  if (sourceType === "official_derived") return "official_derived";
  if (sourceType === "management_guidance") return "management_guidance";
  if (sourceType === "company_commentary") return "company_commentary";
  if (sourceType === "market_data") return "market_data";
  if (sourceType === "forecast_assumption") return "forecast_assumption";
  return "derived";
}

export function getGooglRegime(eventDate = "9999-12-31") {
  if (eventDate < "2022-01-01") return "pre_2022_search_youtube_cloud_optionality";
  if (eventDate < "2023-01-01") return "rate_shock_2022_ad_slowdown";
  if (eventDate < "2024-01-01") return "efficiency_reset_2023_ai_uncertainty";
  if (eventDate < "2025-01-01") return "ai_capex_2024_cloud_tpu_relevance";
  return "ai_monetization_2025_plus";
}

export function getAllowedNarrativesForRegime(regime) {
  const base = {
    regime,
    allowAiSearchCannibalization: false,
    allowAiSearchMonetization: false,
    allowTpuEfficiencyNarrative: false,
    allowAiCapexCycle: false,
    allowFullRegulatoryRemedyRisk: false,
    notes: [],
  };
  if (regime === "pre_2022_search_youtube_cloud_optionality") {
    return {
      ...base,
      notes: ["Search scale, YouTube growth, Cloud optionality, and low-rate multiples are the main allowed narratives."],
    };
  }
  if (regime === "rate_shock_2022_ad_slowdown") {
    return {
      ...base,
      allowFullRegulatoryRemedyRisk: true,
      notes: ["Ad slowdown, rate shock, multiple compression, and cost pressure are the main allowed narratives."],
    };
  }
  if (regime === "efficiency_reset_2023_ai_uncertainty") {
    return {
      ...base,
      allowAiSearchCannibalization: true,
      allowFullRegulatoryRemedyRisk: true,
      notes: ["Efficiency reset, early AI disruption risk, and early AI CapEx uncertainty are allowed, but mature AI monetization is not."],
    };
  }
  if (regime === "ai_capex_2024_cloud_tpu_relevance") {
    return {
      ...base,
      allowAiSearchCannibalization: true,
      allowAiSearchMonetization: true,
      allowTpuEfficiencyNarrative: true,
      allowAiCapexCycle: true,
      allowFullRegulatoryRemedyRisk: true,
      notes: ["AI CapEx cycle, Cloud acceleration, TPU relevance, and Search uncertainty are allowed as model bridges."],
    };
  }
  return {
    ...base,
    allowAiSearchCannibalization: true,
    allowAiSearchMonetization: true,
    allowTpuEfficiencyNarrative: true,
    allowAiCapexCycle: true,
    allowFullRegulatoryRemedyRisk: true,
    notes: ["Full AI monetization, cannibalization, TPU efficiency, Cloud AI workload, and regulatory remedy logic are allowed."],
  };
}

function sumNumbers(rows, key) {
  const values = rows.map((row) => row?.[key]).filter((value) => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function safeRatio(numerator, denominator) {
  return typeof numerator === "number" && typeof denominator === "number" && denominator !== 0 ? numerator / denominator : undefined;
}

function quarterNumber(row) {
  const raw = parseJson(row?.rawJson, {});
  const fromRaw = raw.quarter ?? raw.fiscalQuarter?.match?.(/Q([1-4])/)?.[1];
  if (fromRaw) return Number(fromRaw);
  const fromPeriod = row?.periodId?.match?.(/q([1-4])/i)?.[1];
  return fromPeriod ? Number(fromPeriod) : null;
}

function uniqueLatestByPeriodId(rows = []) {
  const map = new Map();
  for (const row of [...rows].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate))) {
    if (row?.periodId) map.set(row.periodId, row);
  }
  return [...map.values()].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate) || (left.periodId ?? "").localeCompare(right.periodId ?? ""));
}

function buildNormalizedFinancialMetrics({ latestFinancial, financialHistory = [] }) {
  const rows = uniqueLatestByPeriodId(financialHistory).filter((row) => row?.asOfDate && row?.revenue);
  const quarterlyRows = rows.filter((row) => row.periodType === "quarterly" && row.asOfDate <= latestFinancial.asOfDate);
  const annualRows = rows.filter((row) => row.periodType === "annual" && row.asOfDate <= latestFinancial.asOfDate);
  const latestQuarter = latestFinancial.periodType === "quarterly" ? latestFinancial : quarterlyRows[quarterlyRows.length - 1] ?? null;
  const last4Quarters = quarterlyRows.slice(-4);
  const prior4Quarters = quarterlyRows.slice(-8, -4);
  const last8Quarters = quarterlyRows.slice(-8);
  const ttmRevenue = last4Quarters.length === 4 ? sumNumbers(last4Quarters, "revenue") : null;
  const ttmOperatingIncome = last4Quarters.length === 4 ? sumNumbers(last4Quarters, "operatingIncome") : null;
  const ttmNetIncome = last4Quarters.length === 4 ? sumNumbers(last4Quarters, "netIncome") : null;
  const ttmCapex = last4Quarters.length === 4 ? sumNumbers(last4Quarters, "capex") : null;
  const ttmFcf = last4Quarters.length === 4 ? sumNumbers(last4Quarters, "freeCashFlow") : null;
  const ttmDepreciation = last4Quarters.length === 4 ? sumNumbers(last4Quarters, "depreciationAmortization") : null;
  const ttmSbc = last4Quarters.length === 4 ? sumNumbers(last4Quarters, "stockBasedCompensation") : null;
  const ttmBuybacks = last4Quarters.length === 4 ? sumNumbers(last4Quarters, "buybacks") : null;
  const priorTtmRevenue = prior4Quarters.length === 4 ? sumNumbers(prior4Quarters, "revenue") : null;
  const ttmRevenueGrowth = safeRatio(ttmRevenue, priorTtmRevenue) != null ? safeRatio(ttmRevenue, priorTtmRevenue) - 1 : undefined;
  const sameQuarterPriorYear =
    latestQuarter && quarterNumber(latestQuarter)
      ? [...quarterlyRows]
          .reverse()
          .find((row) => row.fiscalYear === latestQuarter.fiscalYear - 1 && quarterNumber(row) === quarterNumber(latestQuarter))
      : null;
  const latestQuarterYoyRevenueGrowth =
    latestQuarter?.revenue && sameQuarterPriorYear?.revenue ? latestQuarter.revenue / sameQuarterPriorYear.revenue - 1 : undefined;
  const latestAnnual = annualRows[annualRows.length - 1] ?? null;
  const priorAnnual = annualRows[annualRows.length - 2] ?? null;
  const annualRevenueGrowth = latestAnnual?.revenue && priorAnnual?.revenue ? latestAnnual.revenue / priorAnnual.revenue - 1 : undefined;
  const normalizedRevenueBase = latestFinancial.periodType === "annual" ? latestFinancial.revenue : ttmRevenue ?? latestFinancial.revenue * 4;
  const normalizedOperatingMargin =
    safeRatio(ttmOperatingIncome, ttmRevenue) ?? safeRatio(latestFinancial.operatingIncome, latestFinancial.revenue);
  const normalizedCapexIntensity = safeRatio(ttmCapex, ttmRevenue) ?? safeRatio(latestFinancial.capex, latestFinancial.revenue);
  const normalizedFcfMargin = safeRatio(ttmFcf, ttmRevenue) ?? safeRatio(latestFinancial.freeCashFlow, latestFinancial.revenue);
  const normalizedDepreciationIntensity =
    safeRatio(ttmDepreciation, ttmRevenue) ?? safeRatio(latestFinancial.depreciationAmortization, latestFinancial.revenue);
  const normalizedSbcIntensity = safeRatio(ttmSbc, ttmRevenue) ?? safeRatio(latestFinancial.stockBasedCompensation, latestFinancial.revenue);
  const eightQuarterRevenue = last8Quarters.length ? sumNumbers(last8Quarters, "revenue") : null;
  const eightQuarterOperatingIncome = last8Quarters.length ? sumNumbers(last8Quarters, "operatingIncome") : null;
  const normalizedEightQuarterOperatingMargin = safeRatio(eightQuarterOperatingIncome, eightQuarterRevenue);
  return {
    latestQuarter,
    latestAnnual,
    priorAnnual,
    last4QuarterCount: last4Quarters.length,
    last8QuarterCount: last8Quarters.length,
    ttmRevenue,
    ttmOperatingIncome,
    ttmNetIncome,
    ttmCapex,
    ttmFcf,
    ttmDepreciation,
    ttmSbc,
    ttmBuybacks,
    priorTtmRevenue,
    ttmRevenueGrowth,
    latestQuarterYoyRevenueGrowth,
    annualRevenueGrowth,
    normalizedRevenueBase,
    normalizedOperatingMargin,
    normalizedEightQuarterOperatingMargin,
    normalizedCapexIntensity,
    normalizedFcfMargin,
    normalizedDepreciationIntensity,
    normalizedSbcIntensity,
    dataQuality: last4Quarters.length >= 4 ? "official_derived" : "model_bridge",
    sparseQuarterHistory: latestFinancial.periodType === "quarterly" && last4Quarters.length < 4,
  };
}

function regimePolicy(regime) {
  if (regime === "pre_2022_search_youtube_cloud_optionality") {
    return { maturity: 0.20, wacc: 0.072, terminalGrowth: 0.032, targetFcfYield: 0.032, targetPe: 29, targetEvEbit: 27, servicesMultiple: 24, cloudMultiple: 18 };
  }
  if (regime === "rate_shock_2022_ad_slowdown") {
    return { maturity: 0.32, wacc: 0.092, terminalGrowth: 0.026, targetFcfYield: 0.047, targetPe: 21, targetEvEbit: 20, servicesMultiple: 18, cloudMultiple: 16 };
  }
  if (regime === "efficiency_reset_2023_ai_uncertainty") {
    return { maturity: 0.52, wacc: 0.086, terminalGrowth: 0.028, targetFcfYield: 0.041, targetPe: 24, targetEvEbit: 22, servicesMultiple: 20, cloudMultiple: 22 };
  }
  if (regime === "ai_capex_2024_cloud_tpu_relevance") {
    return { maturity: 0.72, wacc: 0.082, terminalGrowth: 0.029, targetFcfYield: 0.038, targetPe: 26, targetEvEbit: 24, servicesMultiple: 21, cloudMultiple: 28 };
  }
  return { maturity: 0.90, wacc: 0.080, terminalGrowth: 0.030, targetFcfYield: 0.037, targetPe: 27, targetEvEbit: 25, servicesMultiple: 22, cloudMultiple: 30 };
}

function mapFinancial(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    id: row.periodId,
    label: raw.label ?? (row.periodType === "annual" && row.fiscalYear ? `FY${row.fiscalYear}A` : row.periodId),
    fiscalYear: row.fiscalYear,
    periodType: row.periodType === "quarterly" ? "quarterly" : "annual",
    sourceType: sourceStatus(row.sourceType),
    sourceId: row.eventId ?? row.id,
    totalRevenue: row.revenue ?? raw.totalRevenue,
    revenueGrowth: raw.revenueGrowth,
    constantCurrencyRevenueGrowth: raw.constantCurrencyRevenueGrowth,
    operatingIncome: row.operatingIncome ?? raw.operatingIncome,
    operatingMargin: row.operatingMargin ?? raw.operatingMargin,
    netIncome: row.netIncome ?? raw.netIncome,
    netCashProvidedByOperatingActivities: row.operatingCashFlow ?? raw.netCashProvidedByOperatingActivities,
    capex: row.capex ?? raw.capex,
    freeCashFlow: row.freeCashFlow ?? raw.freeCashFlow,
    ttmOperatingCashFlow: raw.ttmOperatingCashFlow,
    ttmCapex: raw.ttmCapex,
    ttmFreeCashFlow: raw.ttmFreeCashFlow,
    shareRepurchases: row.buybacks ?? raw.shareRepurchases,
    dividendPayments: row.dividendsPaid ?? raw.dividendPayments,
    dilutedEps: row.dilutedEps ?? raw.dilutedEps,
    depreciation: row.depreciationAmortization ?? raw.depreciation,
    cashAndMarketableSecurities: row.cashAndShortTermInvestments ?? raw.cashAndMarketableSecurities,
    longTermDebt: row.debt ?? raw.longTermDebt,
    sharesOutstanding: raw.sharesOutstanding ?? row.dilutedShares,
    dilutedShares: row.dilutedShares ?? raw.dilutedShares,
    operatingLeaseLiabilities: row.operatingLeaseLiabilities ?? raw.operatingLeaseLiabilities,
    financeLeaseLiabilities: raw.financeLeaseLiabilities,
    legalRegulatoryCharge: raw.legalRegulatoryCharge,
  };
}

function mapSegment(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    periodId: row.periodId,
    segment: row.segment,
    sourceType: sourceStatus(row.sourceType),
    sourceId: row.eventId ?? row.id,
    revenue: row.revenue ?? 0,
    operatingIncome: row.operatingIncome ?? 0,
  };
}

function deriveRevenueLine(financial, baseDataset) {
  const existing = (baseDataset.revenueLines ?? []).find((line) => line.periodId === financial.id);
  if (existing) return existing;
  const year = financial.fiscalYear ?? 2024;
  const totalRevenue = financial.totalRevenue ?? 0;
  const cloudShare = clamp(0.045 + (year - 2017) * 0.013, 0.045, 0.155) ?? 0.11;
  const youtubeShare = clamp(0.062 + (year - 2017) * 0.006, 0.062, 0.105) ?? 0.09;
  const networkShare = clamp(0.165 - (year - 2017) * 0.011, 0.065, 0.165) ?? 0.09;
  const subscriptionsShare = clamp(0.055 + (year - 2017) * 0.009, 0.055, 0.125) ?? 0.10;
  const otherBetsShare = clamp(0.004 + (year - 2017) * 0.0002, 0.004, 0.006) ?? 0.004;
  const googleCloud = totalRevenue * cloudShare;
  const youtubeAds = totalRevenue * youtubeShare;
  const googleNetwork = totalRevenue * networkShare;
  const googleSubscriptionsPlatformsDevices = totalRevenue * subscriptionsShare;
  const otherBets = totalRevenue * otherBetsShare;
  const hedging = 0;
  const googleServicesTotal = totalRevenue - googleCloud - otherBets - hedging;
  const googleSearchOther = Math.max(googleServicesTotal - youtubeAds - googleNetwork - googleSubscriptionsPlatformsDevices, 0);
  return {
    periodId: financial.id,
    sourceType: "derived",
    sourceId: `${financial.sourceId}-adapter-revenue-line-bridge`,
    googleSearchOther,
    youtubeAds,
    googleNetwork,
    googleAdvertising: googleSearchOther + youtubeAds + googleNetwork,
    googleSubscriptionsPlatformsDevices,
    googleServicesTotal,
    googleCloud,
    otherBets,
    hedging,
    totalRevenue,
  };
}

function deriveSegments(financial, line) {
  const year = financial.fiscalYear ?? 2024;
  const consolidatedOperatingIncome = financial.operatingIncome ?? 0;
  const consolidatedMargin = financial.totalRevenue ? consolidatedOperatingIncome / financial.totalRevenue : 0.25;
  const servicesMargin = clamp(consolidatedMargin + 0.055, 0.27, 0.46) ?? 0.36;
  const cloudMargin = clamp(-0.16 + (year - 2017) * 0.055, -0.20, 0.33) ?? 0.08;
  const otherBetsLoss = -Math.max(line.otherBets * 1.2, financial.totalRevenue * 0.012);
  const servicesOperatingIncome = line.googleServicesTotal * servicesMargin;
  const cloudOperatingIncome = line.googleCloud * cloudMargin;
  const alphabetLevelActivities = consolidatedOperatingIncome - servicesOperatingIncome - cloudOperatingIncome - otherBetsLoss;
  const sourceId = `${financial.sourceId}-adapter-segment-bridge`;
  return [
    {
      periodId: financial.id,
      segment: "Google Services",
      sourceType: "derived",
      sourceId,
      revenue: line.googleServicesTotal,
      operatingIncome: servicesOperatingIncome,
    },
    {
      periodId: financial.id,
      segment: "Google Cloud",
      sourceType: "derived",
      sourceId,
      revenue: line.googleCloud,
      operatingIncome: cloudOperatingIncome,
    },
    {
      periodId: financial.id,
      segment: "Other Bets",
      sourceType: "derived",
      sourceId,
      revenue: line.otherBets,
      operatingIncome: otherBetsLoss,
    },
    {
      periodId: financial.id,
      segment: "Alphabet-level activities",
      sourceType: "derived",
      sourceId,
      revenue: 0,
      operatingIncome: alphabetLevelActivities,
    },
  ];
}

function buildAsOfAssumptionBridge({ snapshot, scenarioPreset = {}, payloadAssumptions = {}, latestFinancial, financialHistory = [] }) {
  const asOfDate = snapshot?.asOfDate ?? latestFinancial?.asOfDate ?? "9999-12-31";
  const regime = getGooglRegime(asOfDate);
  const allowedNarratives = getAllowedNarrativesForRegime(regime);
  const policy = regimePolicy(regime);
  const metrics = buildNormalizedFinancialMetrics({ latestFinancial, financialHistory });
  const base = { ...scenarioPreset, ...payloadAssumptions };
  const latestCloud = latestByAsOfDate(snapshot?.cloudAiKpis ?? []);
  const cloudMargin = clamp(latestCloud?.googleCloudOperatingMargin, -0.15, 0.36);
  const revenueGrowthSignal =
    metrics.ttmRevenueGrowth ?? metrics.annualRevenueGrowth ?? metrics.latestQuarterYoyRevenueGrowth ?? 0.08;
  const momentumSignal = metrics.latestQuarterYoyRevenueGrowth ?? revenueGrowthSignal;
  const blendedGrowth = clamp(revenueGrowthSignal * 0.72 + momentumSignal * 0.28, -0.08, 0.32) ?? 0.08;
  const growthFactor = clamp(0.82 + Math.max(blendedGrowth, -0.04) * 1.55, 0.64, 1.18) ?? 1;
  const normalizedOperatingMargin = metrics.normalizedEightQuarterOperatingMargin ?? metrics.normalizedOperatingMargin;
  const normalizedCapexIntensity = metrics.normalizedCapexIntensity ?? base.capexIntensity ?? 0.22;
  const normalizedFcfMargin = metrics.normalizedFcfMargin ?? base.fcfMargin ?? 0.20;
  const aiCapexCycle = allowedNarratives.allowAiCapexCycle
    ? clamp(normalizedCapexIntensity / 0.255, 0.65, 1.25) ?? 1
    : 0.70;

  const proposedAiCannibalization = clamp((base.searchAiCannibalization ?? 0.012) * (0.40 + policy.maturity * 0.70), 0.002, 0.04);
  const proposedAiMonetization = clamp((base.searchMonetizationChange ?? 0.005) * (0.25 + policy.maturity * 0.85), -0.018, 0.024);
  const proposedTpuEfficiency = clamp((base.tpuEfficiencyBenefit ?? 0.035) * (0.20 + policy.maturity * 0.80), 0.002, 0.055);
  const blockedNarratives = [];
  const searchAiCannibalization = allowedNarratives.allowAiSearchCannibalization ? proposedAiCannibalization : 0;
  const searchMonetizationChange = allowedNarratives.allowAiSearchMonetization ? proposedAiMonetization : 0;
  const tpuEfficiencyBenefit = allowedNarratives.allowTpuEfficiencyNarrative ? proposedTpuEfficiency : 0;
  if (!allowedNarratives.allowAiSearchCannibalization) {
    blockedNarratives.push({ key: "searchAiCannibalization", proposedValue: proposedAiCannibalization, appliedValue: 0, reason: "Generative AI Search cannibalization narrative not allowed before 2023 regime." });
  }
  if (!allowedNarratives.allowAiSearchMonetization) {
    blockedNarratives.push({ key: "searchMonetizationChange", proposedValue: proposedAiMonetization, appliedValue: 0, reason: "Gemini/AI Overviews monetization narrative not allowed before 2024 regime." });
  }
  if (!allowedNarratives.allowTpuEfficiencyNarrative) {
    blockedNarratives.push({ key: "tpuEfficiencyBenefit", proposedValue: proposedTpuEfficiency, appliedValue: 0, reason: "TPU efficiency narrative not allowed as a material valuation driver in this regime." });
  }

  const overrides = finiteObject({
    searchRevenueCagr: clamp((base.searchRevenueCagr ?? 0.085) * growthFactor * (0.90 + policy.maturity * 0.12), 0.025, 0.13),
    searchMonetizationChange,
    searchAiCannibalization,
    youtubeRevenueCagr: clamp((base.youtubeRevenueCagr ?? 0.09) * (0.78 + growthFactor * 0.26), 0.025, 0.145),
    subscriptionsRevenueCagr: clamp((base.subscriptionsRevenueCagr ?? 0.16) * (0.66 + policy.maturity * 0.40), 0.045, 0.21),
    cloudRevenueCagr: clamp((base.cloudRevenueCagr ?? 0.32) * (0.46 + policy.maturity * 0.58) + Math.max(blendedGrowth, 0) * 0.12, 0.08, 0.40),
    cloudTerminalMargin: clamp((base.cloudTerminalMargin ?? 0.32) + ((cloudMargin ?? normalizedOperatingMargin ?? 0.25) - 0.30) * 0.12 + (policy.maturity - 0.80) * 0.025, 0.18, 0.38),
    capexIntensity: clamp(normalizedCapexIntensity * 0.72 + (base.capexIntensity ?? 0.255) * 0.28, 0.10, 0.33),
    dAndAIntensity: clamp((metrics.normalizedDepreciationIntensity ?? base.dAndAIntensity ?? 0.075) * 0.80 + (base.dAndAIntensity ?? 0.075) * 0.20, 0.04, 0.105),
    fcfMargin: clamp(normalizedFcfMargin * 0.70 + (base.fcfMargin ?? 0.205) * 0.30, 0.10, 0.285),
    tpuEfficiencyBenefit,
    aiComputeConstraint: clamp((base.aiComputeConstraint ?? 0.52) * (1.16 - policy.maturity * 0.18) + Math.max(aiCapexCycle - 1, 0) * 0.12, 0.24, 0.82),
    regulatoryDiscount: clamp((base.regulatoryDiscount ?? 0.07) * (allowedNarratives.allowFullRegulatoryRemedyRisk ? 1 : 0.52), 0.012, 0.15),
    wacc: policy.wacc,
    terminalGrowth: policy.terminalGrowth,
    targetFcfYield: clamp(policy.targetFcfYield + Math.max(normalizedCapexIntensity - 0.22, 0) * 0.025, 0.028, 0.055),
    targetPe: clamp(policy.targetPe - Math.max(normalizedCapexIntensity - 0.22, 0) * 13, 17, 34),
    targetEvEbit: clamp(policy.targetEvEbit, 17, 32),
    servicesMultiple: clamp(policy.servicesMultiple - (base.regulatoryDiscount ?? 0.07) * 5, 16, 27),
    cloudMultiple: clamp(policy.cloudMultiple, 16, 38),
  });

  const meta = Object.fromEntries(Object.keys(overrides).map((key) => [
    key,
    {
      source: "as_of_bridge",
      sourceDate: asOfDate,
      asOfDate,
      dataQuality: metrics.dataQuality === "official_derived" ? "official_derived" : "model_bridge",
      confidence: metrics.sparseQuarterHistory ? "medium" : "high",
      valuationImpactAllowed: true,
      notes: `Derived from ${metrics.last4QuarterCount >= 4 ? "TTM/8Q normalized actuals" : "available actuals plus bridge fallback"} and ${regime} policy.`,
    },
  ]));

  return {
    overrides,
    metrics,
    regimeInfo: {
      regime,
      allowedNarratives,
      policy,
      blockedNarratives,
    },
    assumptionMeta: meta,
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot) {
  const dataset = cloneJson(baseDataset);
  const financialRows = [...(snapshot?.financialPeriods ?? [])].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const mappedFinancials = financialRows.map(mapFinancial).filter((row) => row.totalRevenue != null && row.operatingIncome != null);
  dataset.financials = mappedFinancials.sort((left, right) => (left.fiscalYear ?? 0) - (right.fiscalYear ?? 0) || left.id.localeCompare(right.id));

  const revenueLineMap = new Map();
  for (const financial of mappedFinancials) {
    if (!revenueLineMap.has(financial.id)) revenueLineMap.set(financial.id, deriveRevenueLine(financial, dataset));
  }
  dataset.revenueLines = Array.from(revenueLineMap.values());

  const segmentMap = new Map();
  for (const row of (snapshot?.segmentFinancials ?? []).map(mapSegment)) {
    segmentMap.set(`${row.periodId}:${row.segment}`, { ...(segmentMap.get(`${row.periodId}:${row.segment}`) ?? {}), ...row });
  }
  for (const financial of mappedFinancials) {
    const hasAllSegments = ["Google Services", "Google Cloud", "Other Bets", "Alphabet-level activities"].every((segment) => segmentMap.has(`${financial.id}:${segment}`));
    if (!hasAllSegments) {
      const line = revenueLineMap.get(financial.id) ?? deriveRevenueLine(financial, dataset);
      for (const segment of deriveSegments(financial, line)) {
        if (!segmentMap.has(`${segment.periodId}:${segment.segment}`)) segmentMap.set(`${segment.periodId}:${segment.segment}`, segment);
      }
    }
  }
  dataset.segments = Array.from(segmentMap.values());

  const latestFinancial = mappedFinancials[mappedFinancials.length - 1] ?? null;
  const previousFinancial = mappedFinancials.length > 1 ? mappedFinancials[mappedFinancials.length - 2] : null;
  const latestLine = latestFinancial ? revenueLineMap.get(latestFinancial.id) : null;
  const previousLine = previousFinancial ? revenueLineMap.get(previousFinancial.id) : null;
  const revenueGrowth =
    latestFinancial?.totalRevenue && previousFinancial?.totalRevenue
      ? latestFinancial.totalRevenue / previousFinancial.totalRevenue - 1
      : 0.08;
  const searchGrowth =
    latestLine?.googleSearchOther && previousLine?.googleSearchOther
      ? latestLine.googleSearchOther / previousLine.googleSearchOther - 1
      : revenueGrowth;
  dataset.monetizationMetrics = {
    periodId: latestFinancial?.id ?? "as-of",
    sourceType: "derived",
    sourceId: `${latestFinancial?.sourceId ?? "snapshot"}-as-of-monetization-bridge`,
    googleSearchPaidClicksGrowth: clamp(searchGrowth * 0.55, -0.08, 0.18) ?? 0,
    googleSearchCostPerClickGrowth: clamp(searchGrowth * 0.45, -0.08, 0.18) ?? 0,
    googleNetworkImpressionsGrowth: clamp(revenueGrowth * 0.25, -0.10, 0.10) ?? 0,
    googleNetworkCostPerImpressionGrowth: clamp(revenueGrowth * 0.20, -0.10, 0.10) ?? 0,
  };

  const latestCloud = latestByAsOfDate(snapshot?.cloudAiKpis ?? []);
  const cloudRevenueBase = latestLine?.googleCloud ?? Math.max((latestFinancial?.totalRevenue ?? 0) * 0.10, 1);
  const asOfDate = snapshot?.asOfDate ?? latestFinancial?.sourceId ?? "2026-05-07";
  const maturity =
    asOfDate < "2020-01-01"
      ? 0.25
      : asOfDate < "2022-01-01"
        ? 0.40
        : asOfDate < "2024-01-01"
          ? 0.58
          : asOfDate < "2025-01-01"
            ? 0.72
            : asOfDate < "2026-01-01"
              ? 0.86
              : 1.00;
  const inferredCloudBacklog = cloudRevenueBase * (1.8 + maturity * 3.2);
  dataset.cloudBacklog = {
    periodId: latestCloud?.periodId ?? latestFinancial?.id ?? "as-of",
    sourceType: latestCloud?.googleCloudBacklog ? sourceStatus(latestCloud.sourceType) : "derived",
    sourceId: latestCloud?.googleCloudBacklog ? latestCloud.id : `${latestFinancial?.sourceId ?? "snapshot"}-as-of-cloud-backlog-bridge`,
    totalRevenueBacklog: latestCloud?.totalRevenueBacklog ?? inferredCloudBacklog * 1.02,
    googleCloudBacklog: latestCloud?.googleCloudBacklog ?? inferredCloudBacklog,
    expectedRecognitionWithin24Months: latestCloud?.expectedRecognitionWithin24Months ?? clamp(0.45 + maturity * 0.10, 0.42, 0.56) ?? 0.5,
    oneYearOrLessContractsIncluded: latestCloud?.oneYearOrLessContractsIncluded ?? 0,
  };

  const capexRunRate = (latestFinancial?.capex ?? 0) * (latestFinancial?.periodType === "quarterly" ? 4 : 1);
  dataset.guidance = {
    sourceType: snapshot?.guidanceItems?.length ? "management_guidance" : "forecast_assumption",
    sourceId: snapshot?.guidanceItems?.[0]?.id ?? `${latestFinancial?.sourceId ?? "snapshot"}-as-of-capex-run-rate`,
    fy2026CapexLow: snapshot?.guidanceItems?.find((item) => item.metric === "fy2026CapexLow")?.midpointValue ?? capexRunRate * 0.92,
    fy2026CapexHigh: snapshot?.guidanceItems?.find((item) => item.metric === "fy2026CapexHigh")?.midpointValue ?? capexRunRate * 1.08,
    fy2027CapexDirection:
      snapshot?.guidanceItems?.find((item) => item.metric === "fy2027CapexDirection")?.quote ?? "No later-period management guidance available in the as-of snapshot; use current run-rate only.",
    q2FxTailwind: snapshot?.guidanceItems?.find((item) => item.metric === "q2FxTailwind")?.midpointValue ?? 0,
    wizCloudMarginHeadwind:
      snapshot?.guidanceItems?.find((item) => item.metric === "wizCloudMarginHeadwind")?.quote ?? "No as-of Wiz/cloud margin guidance available.",
    tpuHardwareRevenueTiming:
      snapshot?.guidanceItems?.find((item) => item.metric === "tpuHardwareRevenueTiming")?.quote ?? "No as-of TPU hardware timing guidance available.",
  };

  dataset.aiOperatingSignals = {
    sourceType: latestCloud?.geminiEnterprisePaidMauQoqGrowth != null ? sourceStatus(latestCloud.sourceType) : "derived",
    sourceId: latestCloud?.id ?? `${latestFinancial?.sourceId ?? "snapshot"}-as-of-ai-signal-bridge`,
    subscriptions: Math.round(80 + maturity * 240),
    geminiEnterprisePaidMauQoqGrowth: latestCloud?.geminiEnterprisePaidMauQoqGrowth ?? clamp(0.04 + maturity * 0.18, 0.04, 0.22),
    firstPartyModelTokensPerMinute: latestCloud?.firstPartyModelTokensPerMinute ?? clamp(1 + maturity * 10, 1, 12),
    cloudCustomersAboveOneTrillionTokens: latestCloud?.cloudCustomersAboveOneTrillionTokens ?? Math.round(25 + maturity * 190),
    cloudCustomersAboveTenTrillionTokens: latestCloud?.cloudCustomersAboveTenTrillionTokens ?? Math.round(2 + maturity * 22),
    waymoWeeklyFullyAutonomousRides: Math.round(20_000 + maturity * 260_000),
    youtubeLivingRoomDailyUsHours: Math.round(40_000_000 + maturity * 110_000_000),
    youtubeChannelsPublishingShortsDaily: Math.round(1_000_000 + maturity * 6_000_000),
    tpu8iPerformancePerDollarImprovement: latestCloud?.tpuEfficiencyBenefit ?? clamp(0.10 + maturity * 0.42, 0.10, 0.52),
    tpu8tProcessingPowerVsIronwood: clamp(1 + maturity * 1.5, 1, 2.5),
    aiResponseCostReduction: clamp(0.04 + maturity * 0.18, 0.04, 0.22),
    computeConstrainedCommentary: maturity > 0.65,
  };

  dataset.commitmentsAndCapitalStructure = {
    periodId: latestFinancial?.id ?? "as-of",
    sourceType: sourceStatus(latestFinancial?.sourceType),
    sourceId: `${latestFinancial?.sourceId ?? "snapshot"}-as-of-capital-structure`,
    purchaseCommitmentsAndObligations: (latestFinancial?.capex ?? 0) * 4.5,
    shortTermPurchaseCommitmentsAndObligations: (latestFinancial?.capex ?? 0) * 1.6,
    longTermSupplyEnergyContentCommitments: (latestFinancial?.capex ?? 0) * 2.4,
    dataCenterLeasesNotCommenced: (latestFinancial?.capex ?? 0) * 0.8,
    creditBackstopGuarantees: 0,
    creditDerivativesBackstops: 0,
    accruedLegalRegulatory: (latestFinancial?.totalRevenue ?? 0) * (0.006 + maturity * 0.012),
    remainingShareRepurchaseAuthorization: Math.max((latestFinancial?.shareRepurchases ?? 0) * 1.5, 0),
    quarterlyDividendPerShare: asOfDate >= "2024-06-01" ? 0.20 : 0,
    seniorUnsecuredNotes: latestFinancial?.longTermDebt ?? 0,
  };

  const market = snapshot?.marketSnapshot;
  if (market) {
    dataset.marketData = {
      ...dataset.marketData,
      sourceType: "market_data",
      sourceId: market.id,
      currentPrice: market.currentPrice,
      priceDate: market.priceDate ?? market.asOfDate,
      marketCap: market.marketCap ?? market.currentPrice * (market.sharesOutstanding ?? dataset.marketData.sharesOut),
      enterpriseValue: market.enterpriseValue ?? dataset.marketData.enterpriseValue,
      sharesOut: market.sharesOutstanding ?? dataset.marketData.sharesOut,
      notes: market.source,
    };
  }
  dataset.latestReportingPeriod = snapshot?.reportingEvent?.fiscalPeriod ?? dataset.latestReportingPeriod;
  return dataset;
}

function applyNormalizedValuationBase(dataset, periodId, metrics) {
  const period = dataset.financials.find((row) => row.id === periodId);
  if (!period || period.periodType !== "quarterly" || !metrics?.ttmRevenue || metrics.last4QuarterCount < 4) {
    return { applied: false, reason: "Annual event or insufficient quarterly history for TTM valuation base." };
  }
  const scale = period.totalRevenue ? metrics.ttmRevenue / period.totalRevenue : 1;
  period.periodType = "annual";
  period.label = `${period.label} TTM valuation base`;
  period.sourceType = "official_derived";
  period.totalRevenue = metrics.ttmRevenue;
  period.operatingIncome = metrics.ttmOperatingIncome ?? period.operatingIncome * scale;
  period.netIncome = metrics.ttmNetIncome ?? period.netIncome * scale;
  period.capex = metrics.ttmCapex ?? period.capex * scale;
  period.freeCashFlow = metrics.ttmFcf ?? period.freeCashFlow * scale;
  period.ttmFreeCashFlow = metrics.ttmFcf ?? period.freeCashFlow;
  period.ttmCapex = metrics.ttmCapex ?? period.capex;
  period.ttmOperatingCashFlow = metrics.ttmFcf != null && metrics.ttmCapex != null ? metrics.ttmFcf + metrics.ttmCapex : period.netCashProvidedByOperatingActivities * scale;
  period.depreciation = metrics.ttmDepreciation ?? period.depreciation;
  period.operatingMargin = metrics.normalizedOperatingMargin ?? period.operatingMargin;
  period.revenueGrowth = metrics.ttmRevenueGrowth ?? metrics.latestQuarterYoyRevenueGrowth ?? period.revenueGrowth;

  const line = dataset.revenueLines.find((row) => row.periodId === periodId);
  if (line) {
    for (const key of [
      "googleSearchOther",
      "youtubeAds",
      "googleNetwork",
      "googleAdvertising",
      "googleSubscriptionsPlatformsDevices",
      "googleServicesTotal",
      "googleCloud",
      "otherBets",
      "hedging",
    ]) {
      if (typeof line[key] === "number") line[key] *= scale;
    }
    line.totalRevenue = metrics.ttmRevenue;
    line.sourceType = "model_bridge";
    line.sourceId = `${line.sourceId ?? periodId}-ttm-normalized-base`;
  }
  for (const segment of dataset.segments.filter((row) => row.periodId === periodId)) {
    if (typeof segment.revenue === "number") segment.revenue *= scale;
    if (typeof segment.operatingIncome === "number") segment.operatingIncome *= scale;
    segment.sourceType = segment.sourceType === "official_actual" ? "official_derived" : "model_bridge";
    segment.sourceId = `${segment.sourceId ?? periodId}-ttm-normalized-base`;
  }
  return {
    applied: true,
    scale,
    ttmRevenue: metrics.ttmRevenue,
    ttmOperatingIncome: metrics.ttmOperatingIncome,
    ttmFcf: metrics.ttmFcf,
    note: "Quarterly event valuation base normalized to TTM so the engine does not overfit one quarter annualized by four.",
  };
}

function buildShareCountAnalysis({ latestFinancial, metrics, market }) {
  const reportedWeightedAverageShares = latestFinancial?.dilutedShares ?? null;
  const marketShares = market?.sharesOutstanding ?? null;
  const valuationShareCount = marketShares && marketShares > 0 ? marketShares : reportedWeightedAverageShares;
  const usedWeightedAverageShares = !(marketShares && marketShares > 0);
  const ttmSbc = metrics?.ttmSbc ?? latestFinancial?.stockBasedCompensation ?? null;
  const ttmBuybacks = metrics?.ttmBuybacks ?? latestFinancial?.buybacks ?? null;
  const ttmRevenue = metrics?.ttmRevenue ?? latestFinancial?.revenue ?? null;
  const ttmFcf = metrics?.ttmFcf ?? latestFinancial?.freeCashFlow ?? null;
  const sbcDrag = ttmSbc ?? 0;
  const buybackOffsetToSbc = Math.min(ttmBuybacks ?? 0, sbcDrag);
  const netBuybackAfterSbcOffset = Math.max((ttmBuybacks ?? 0) - sbcDrag, 0);
  const sbcAdjustedFcf = ttmFcf != null ? ttmFcf - sbcDrag : null;
  return {
    reportedWeightedAverageShares,
    marketShares,
    valuationShareCount,
    usedWeightedAverageShares,
    warning: usedWeightedAverageShares ? "Period-end shares unavailable; valuation uses weighted-average diluted shares." : null,
    ttmSbc,
    ttmBuybacks,
    sbcAsPctRevenue: safeRatio(ttmSbc, ttmRevenue) ?? null,
    sbcAsPctFcf: safeRatio(ttmSbc, ttmFcf) ?? null,
    buybackOffsetToSbc,
    netBuybackAfterSbcOffset,
    sbcAdjustedFcf,
    buybackYieldNotDoubleCounted: true,
  };
}

function snapshotAsOfAudit(snapshot) {
  const eventDate = snapshot?.reportingEvent?.eventDate ?? snapshot?.asOfDate ?? null;
  const tableRows = {
    financialPeriods: snapshot?.financialPeriods ?? [],
    segmentFinancials: snapshot?.segmentFinancials ?? [],
    cloudAiKpis: snapshot?.cloudAiKpis ?? [],
    peerSnapshots: snapshot?.peerSnapshots ?? [],
    guidanceItems: snapshot?.guidanceItems ?? [],
    transcriptEvents: snapshot?.transcriptEvents ?? [],
  };
  return Object.fromEntries(Object.entries(tableRows).map(([name, rows]) => {
    const asOfField = name === "transcriptEvents" ? "eventDate" : "asOfDate";
    const maxDate = rows.map((row) => row?.[asOfField]).filter(Boolean).sort().at(-1) ?? null;
    return [name, { rowCount: rows.length, maxAsOfDate: maxDate, eventDate, passes: !maxDate || !eventDate || maxDate <= eventDate }];
  }));
}

function buildAssumptionAudit({ backendAssumptions, bridge, payload, latestFinancial, market, shareAnalysis }) {
  const asOfDate = payload.asOfDate;
  const payloadKeys = new Set(Object.keys(payload.assumptions ?? {}));
  const audit = Object.entries(backendAssumptions).map(([key, value]) => {
    const bridgeMeta = bridge.assumptionMeta?.[key];
    if (bridgeMeta) return { key, value, applied: true, ...bridgeMeta };
    if (key === "currentPrice") {
      const priceQuality = market?.priceQuality ?? "research_proxy";
      return {
        key,
        value,
        applied: true,
        source: market?.priceSource ?? market?.source ?? "market_snapshot",
        sourceDate: market?.priceDate ?? market?.asOfDate ?? asOfDate,
        asOfDate,
        dataQuality: priceQuality === "research_proxy" ? "research_proxy" : "market_data",
        confidence: priceQuality === "research_proxy" ? "low" : "medium",
        valuationImpactAllowed: true,
        notes: priceQuality === "research_proxy" ? "Proxy price is allowed for display math but not for investable backtest signal validation." : "Market snapshot input.",
      };
    }
    if (["dilutedShares", "netCash", "dividendPerShareAnnualized"].includes(key)) {
      return {
        key,
        value,
        applied: true,
        source: latestFinancial?.eventId ?? latestFinancial?.id ?? "financial_period",
        sourceDate: latestFinancial?.asOfDate ?? asOfDate,
        asOfDate,
        dataQuality: key === "netCash" ? "official_derived" : "official_actual",
        confidence: shareAnalysis?.usedWeightedAverageShares && key === "dilutedShares" ? "medium" : "high",
        valuationImpactAllowed: true,
        notes: key === "dilutedShares" ? "Valuation share count selected by backend share count module." : "Derived from as-of financial period.",
      };
    }
    if (payloadKeys.has(key)) {
      return {
        key,
        value,
        applied: true,
        source: "request_override",
        sourceDate: asOfDate,
        asOfDate,
        dataQuality: "manual_promoted",
        confidence: "medium",
        valuationImpactAllowed: true,
        notes: "Runtime override supplied to backend valuation call.",
      };
    }
    return {
      key,
      value,
      applied: true,
      source: "allowed_static_policy_assumption",
      sourceDate: asOfDate,
      asOfDate,
      dataQuality: "model_bridge",
      confidence: "medium",
      valuationImpactAllowed: true,
      notes: "Scenario baseline policy assumption used only after explicit as-of bridge/regime review.",
    };
  });
  for (const blocked of bridge.regimeInfo?.blockedNarratives ?? []) {
    audit.push({
      key: blocked.key,
      value: blocked.proposedValue,
      appliedValue: blocked.appliedValue,
      applied: false,
      source: "regime_clock",
      sourceDate: asOfDate,
      asOfDate,
      dataQuality: "blocked",
      confidence: "high",
      valuationImpactAllowed: false,
      notes: blocked.reason,
    });
  }
  return audit;
}

function buildQualityFlags({ market, bridge, assumptionAudit }) {
  const priceQuality = market?.priceQuality ?? "research_proxy";
  const signalBacktestAllowed = Boolean(market?.signalBacktestAllowed);
  const applied = assumptionAudit.filter((item) => item.applied !== false);
  const bridgeCount = applied.filter((item) => ["model_bridge", "research_proxy"].includes(item.dataQuality)).length;
  const officialCount = applied.filter((item) => ["official_actual", "official_derived", "market_data"].includes(item.dataQuality)).length;
  const flags = [];
  if (officialCount >= bridgeCount) flags.push("official-heavy");
  if (bridgeCount > officialCount) flags.push("bridge-heavy");
  if (priceQuality === "research_proxy") flags.push("proxy-heavy");
  flags.push(signalBacktestAllowed ? "signal-backtestable" : "not-backtestable");
  if (bridge.metrics?.sparseQuarterHistory) flags.push("sparse-quarter-history");
  return {
    flags,
    priceQuality,
    signalBacktestAllowed,
    officialAssumptionCount: officialCount,
    bridgeAssumptionCount: bridgeCount,
    regime: bridge.regimeInfo?.regime,
  };
}

function buildFactorAttribution({ valuation, backendAssumptions, bridge, latestFinancial, shareAnalysis, normalizedBase }) {
  const methodValues = {
    dcf: valuation.dcfValue ?? null,
    fcfYield: valuation.fcfFairValue ?? null,
    evEbit: valuation.methodCards?.find((item) => item.key === "ev-ebit")?.value ?? null,
    pe: valuation.peFairValue ?? null,
    sotp: valuation.sotpFairValue ?? null,
    blended: valuation.blendedFairValue ?? valuation.recommendedFairValue ?? null,
  };
  const weights = {
    dcf: backendAssumptions.weightDcf,
    fcfYield: backendAssumptions.weightFcfYield,
    evEbit: backendAssumptions.weightEvEbit,
    pe: backendAssumptions.weightPe,
    sotp: backendAssumptions.weightSotp,
  };
  const weightSum = Object.values(weights).filter((value) => typeof value === "number").reduce((sum, value) => sum + value, 0) || 1;
  const methodBridge = Object.entries(weights).map(([key, weight]) => ({
    key,
    fairValue: methodValues[key],
    normalizedWeight: typeof weight === "number" ? weight / weightSum : null,
    weightedContribution: typeof weight === "number" && typeof methodValues[key] === "number" ? methodValues[key] * weight / weightSum : null,
  }));
  return {
    methodBridge,
    factorSummary: {
      revenueBase: bridge.metrics.normalizedRevenueBase ?? latestFinancial?.revenue,
      revenueGrowthSignal: bridge.metrics.ttmRevenueGrowth ?? bridge.metrics.latestQuarterYoyRevenueGrowth ?? bridge.metrics.annualRevenueGrowth ?? null,
      growthAssumptions: {
        searchRevenueCagr: backendAssumptions.searchRevenueCagr,
        youtubeRevenueCagr: backendAssumptions.youtubeRevenueCagr,
        cloudRevenueCagr: backendAssumptions.cloudRevenueCagr,
      },
      marginAssumptions: {
        operatingMargin: bridge.metrics.normalizedOperatingMargin ?? null,
        fcfMargin: backendAssumptions.fcfMargin,
        cloudTerminalMargin: backendAssumptions.cloudTerminalMargin,
      },
      fcfConversion: {
        reportedTtmFcf: bridge.metrics.ttmFcf ?? latestFinancial?.freeCashFlow ?? null,
        sbcAdjustedFcf: shareAnalysis.sbcAdjustedFcf,
        fcfMargin: backendAssumptions.fcfMargin,
      },
      aiTpuContribution: {
        tpuEfficiencyBenefit: backendAssumptions.tpuEfficiencyBenefit,
        computeConstraint: backendAssumptions.aiComputeConstraint,
      },
      capexIntensityDrag: backendAssumptions.capexIntensity,
      discountRate: backendAssumptions.wacc,
      targetMultiples: {
        targetFcfYield: backendAssumptions.targetFcfYield,
        targetPe: backendAssumptions.targetPe,
        targetEvEbit: backendAssumptions.targetEvEbit,
        servicesMultiple: backendAssumptions.servicesMultiple,
        cloudMultiple: backendAssumptions.cloudMultiple,
      },
      netCash: backendAssumptions.netCash,
      shareCount: shareAnalysis.valuationShareCount,
      regulatoryDrag: backendAssumptions.regulatoryDiscount,
      sbcDilutionDrag: shareAnalysis.sbcAsPctFcf,
      otherBetsFundingDrag: "Captured by existing Other Bets engine and SOTP option value cap.",
      normalizedBase,
    },
  };
}

function buildInvestmentValidation({ market }) {
  const signalBacktestAllowed = Boolean(market?.signalBacktestAllowed);
  return {
    signalBacktestAllowed,
    priceQuality: market?.priceQuality ?? "research_proxy",
    fairValueSimulationAllowed: true,
    upsideDownsideInvestable: signalBacktestAllowed,
    expectedShareholderCagrInvestable: signalBacktestAllowed,
    backtestStatus: signalBacktestAllowed ? "signal_backtest_ready" : "not_backtestable",
    reason: signalBacktestAllowed
      ? "Event-date market price is marked as real market data."
      : "Event-date market price is missing or research proxy; do not use upside/downside or expected CAGR as investable backtest claims.",
    forecastValidationStatus: "deferred",
    forecastValidationNotes: "Forecast error storage is staged; real forward actual comparison should be run only after point-in-time runs are frozen.",
  };
}

export function buildGooglBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = GOOGL_BACKEND_MODEL_VERSION.version, assumptions = {}, baseAssumptions = {} }) {
  const priceQuality = snapshot?.marketSnapshot?.priceQuality ?? "research_proxy";
  const usesProxyPrice = ["research_proxy", "missing"].includes(priceQuality);
  const usesUnadjustedMarketPrice = priceQuality === "unadjusted_market_data";
  return {
    ticker: "GOOGL",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    baseAssumptions,
    snapshot,
    adapterWarnings: [
      "Phase 1 GOOGL adapter maps SQLite reporting-event snapshots into the existing GOOGL frontend valuation engine.",
      "SEC Companyfacts is filtered by period/form/filed date but is not a full accession-level point-in-time filing database; future ingestion should use accession accepted timestamps.",
      ...(usesProxyPrice
        ? [
            "Historical market prices are explicitly marked research_only proxy/backcast rows until event-dated market data is imported.",
            "Because historical prices are proxy rows, upside/downside and expected shareholder CAGR are not investable backtest signals.",
          ]
        : []),
      ...(usesUnadjustedMarketPrice
        ? ["Historical as-of price uses daily market close data, but adjusted close is unavailable for the imported source; price-return metrics are not dividend-adjusted."]
        : []),
      "Older Search/YouTube/Cloud/Other Bets splits needed by the existing formula are adapter-level derived bridges, not official_actual statement facts.",
      "Transcript and guidance candidate rows remain blocked from valuation impact unless promoted through reviewed forecast assumptions.",
      "No GOOGL valuation formula is duplicated or intentionally changed in the backend pilot.",
    ],
  };
}

export async function runGooglBackendValuation(input) {
  const payload = buildGooglBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/googl/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/googl/data/index.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/googl/assumptions.ts");
    const latestSnapshotFinancial = valuationFinancialForSnapshot(payload.snapshot);
    const scenarioPolicyBaseline = {
      ...(assumptionsModule.googlScenarioPresets?.[payload.scenario] ?? {}),
      ...(payload.baseAssumptions ?? {}),
    };
    const bridge = buildAsOfAssumptionBridge({
      snapshot: payload.snapshot,
      scenarioPreset: scenarioPolicyBaseline,
      payloadAssumptions: payload.assumptions,
      latestFinancial: latestSnapshotFinancial,
      financialHistory: payload.snapshot?.financialPeriods ?? [],
    });
    const backendDataset = buildDatasetFromSnapshot(dataModule.googlDataset, payload.snapshot);
    const latestFinancial = latestSnapshotFinancial ? mapFinancial(latestSnapshotFinancial) : backendDataset.financials[backendDataset.financials.length - 1];
    const periodId = latestFinancial?.id ?? "q1-26";
    const market = backendDataset.marketData;
    const normalizedBase = applyNormalizedValuationBase(backendDataset, periodId, bridge.metrics);
    const shareAnalysis = buildShareCountAnalysis({ latestFinancial: latestSnapshotFinancial, metrics: bridge.metrics, market: payload.snapshot?.marketSnapshot });
    const asOfOverrides = bridge.overrides;
    const backendAssumptions = {
      ...scenarioPolicyBaseline,
      ...finiteObject({
        currentPrice: market.currentPrice,
        dilutedShares: shareAnalysis.valuationShareCount ?? latestFinancial?.dilutedShares ?? market.sharesOut,
        netCash: (latestFinancial?.cashAndMarketableSecurities ?? 0) - (latestFinancial?.longTermDebt ?? 0),
        dividendPerShareAnnualized: payload.asOfDate >= "2024-06-01" ? 0.80 : 0,
      }),
      ...asOfOverrides,
      ...payload.assumptions,
    };
    const assumptionAudit = buildAssumptionAudit({
      backendAssumptions,
      bridge,
      payload,
      latestFinancial: latestSnapshotFinancial,
      market: payload.snapshot?.marketSnapshot,
      shareAnalysis,
    });
    const valuation = calculations.calculateGooglValuation(backendDataset, periodId, payload.scenario, backendAssumptions);
    const qualityFlags = buildQualityFlags({ market: payload.snapshot?.marketSnapshot, bridge, assumptionAudit });
    const factorAttribution = buildFactorAttribution({ valuation, backendAssumptions, bridge, latestFinancial: latestSnapshotFinancial, shareAnalysis, normalizedBase });
    const investmentValidation = buildInvestmentValidation({ market: payload.snapshot?.marketSnapshot });
    return {
      ...valuation,
      backendModelVersion: payload.modelVersion,
      priceQuality: payload.snapshot?.marketSnapshot?.priceQuality ?? "research_proxy",
      signalBacktestAllowed: Boolean(payload.snapshot?.marketSnapshot?.signalBacktestAllowed),
      backendAssumptionAudit: assumptionAudit,
      backendFactorAttribution: factorAttribution,
      backendQualityFlags: qualityFlags,
      backendInvestmentValidation: investmentValidation,
      backendShareCountAnalysis: shareAnalysis,
      backendSnapshot: {
        asOfDate: payload.asOfDate,
        reportingEventId: payload.reportingEventId,
        financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
        segmentFinancialCount: payload.snapshot?.segmentFinancials?.length ?? 0,
        cloudAiKpiCount: payload.snapshot?.cloudAiKpis?.length ?? 0,
        marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
        valuationPeriodId: periodId,
        latestFinancialAsOfDate: latestSnapshotFinancial?.asOfDate ?? null,
        priceDate: market.priceDate,
        priceQuality: payload.snapshot?.marketSnapshot?.priceQuality ?? "research_proxy",
        signalBacktestAllowed: Boolean(payload.snapshot?.marketSnapshot?.signalBacktestAllowed),
        futureStaticDataBlocked: true,
        snapshotAsOfAudit: snapshotAsOfAudit(payload.snapshot),
        normalizedFinancialMetrics: bridge.metrics,
        regimeInfo: bridge.regimeInfo,
        shareCountAnalysis: shareAnalysis,
        normalizedValuationBase: normalizedBase,
        asOfAssumptionOverrides: asOfOverrides,
        adapterWarnings: payload.adapterWarnings,
      },
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...(bridge.metrics.sparseQuarterHistory
          ? [{
              id: "googl-sparse-quarter-history",
              title: "Sparse quarterly history for normalized bridge",
              detail: "Less than four as-of quarters were available; assumptions lean more heavily on bridge policy and annual actuals.",
              severity: "medium",
            }]
          : []),
        ...(shareAnalysis.warning
          ? [{
              id: "googl-share-count-period-end-missing",
              title: "Valuation share count uses weighted-average shares",
              detail: shareAnalysis.warning,
              severity: "medium",
            }]
          : []),
        ...(!investmentValidation.signalBacktestAllowed
          ? [{
              id: "googl-not-backtestable-proxy-price",
              title: "Historical signal is not investable",
              detail: investmentValidation.reason,
              severity: "medium",
            }]
          : []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `googl-backend-adapter-gap-${index + 1}`,
          title: "GOOGL backend adapter boundary",
          detail,
          severity: index === 1 || index === 2 ? "medium" : "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}
