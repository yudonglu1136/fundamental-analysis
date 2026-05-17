import { createServer } from "vite";
import { DGE_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

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

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  const parsed = finiteNumber(value);
  if (parsed == null) return undefined;
  return Math.max(min, Math.min(max, parsed));
}

function compactNumbers(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => typeof value === "number" && Number.isFinite(value)));
}

function latestByAsOfDate(rows = [], predicate = () => true) {
  const sorted = [...rows]
    .filter((row) => row?.asOfDate && predicate(row))
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  return sorted[sorted.length - 1] ?? null;
}

function annualizationMultiplier(row) {
  if (!row) return 1;
  if (row.periodType === "half-year" || row.periodType === "H1") return 2;
  if (row.periodType === "quarter" || row.periodType === "trading-update" || row.periodType === "Q") return 4;
  if (row.periodType === "ytd" || row.periodType === "YTD" || String(row.periodId ?? "").startsWith("9m")) return 4 / 3;
  return 1;
}

function annualize(row, key, fallback = undefined) {
  const value = finiteNumber(row?.[key]);
  if (value == null) return fallback;
  return value * annualizationMultiplier(row);
}

function rowIsAsOf(row, cutoff) {
  if (!cutoff || !row?.asOfDate) return true;
  return row.asOfDate <= cutoff;
}

function latestSourceDate(rows = [], cutoff) {
  return rows
    .filter((row) => rowIsAsOf(row, cutoff))
    .map((row) => row?.asOfDate)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function selectValuationFinancial(snapshot) {
  const financials = snapshot?.financialPeriods ?? [];
  const eventId = snapshot?.reportingEvent?.id;
  const eventMatches = financials.filter((row) => row.eventId === eventId);
  if (eventMatches.length) {
    return eventMatches
      .slice()
      .sort((left, right) => (finiteNumber(right.reportedNetSales) ?? 0) - (finiteNumber(left.reportedNetSales) ?? 0))[0];
  }
  return latestByAsOfDate(financials);
}

function periodTypeForDge(row) {
  if (row.periodType === "annual") return "FY";
  if (row.periodType === "half-year") return "H1";
  if (row.periodType === "ytd") return "YTD";
  return "Q";
}

function mapFinancialPeriod(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    id: row.periodId,
    label: raw.label ?? row.periodId,
    fiscalYear: row.fiscalYear,
    periodType: periodTypeForDge(row),
    reportedNetSales: row.reportedNetSales ?? row.revenue ?? 0,
    organicNetSalesGrowth: row.organicNetSalesGrowth ?? raw.organicNetSalesGrowth ?? 0,
    organicNetSalesMovement: raw.organicNetSalesMovement ?? null,
    volumeGrowth: row.volumeGrowth ?? raw.volumeGrowth ?? null,
    priceMixGrowth: row.priceMixGrowth ?? raw.priceMixGrowth ?? null,
    reportedOperatingProfit: row.operatingIncome ?? raw.reportedOperatingProfit ?? null,
    organicOperatingProfitGrowth: raw.organicOperatingProfitGrowth ?? null,
    operatingProfitBeforeExceptional: row.operatingIncome ?? raw.operatingProfitBeforeExceptional ?? null,
    operatingMargin: row.operatingMargin ?? raw.operatingMargin ?? null,
    operatingMarginBeforeExceptional: row.operatingMargin ?? raw.operatingMarginBeforeExceptional ?? null,
    eps: row.dilutedEps ?? raw.eps ?? null,
    epsBeforeExceptional: row.dilutedEps ?? raw.epsBeforeExceptional ?? null,
    freeCashFlow: row.freeCashFlow ?? raw.freeCashFlow ?? null,
    netCashFromOperatingActivities: row.operatingCashFlow ?? raw.netCashFromOperatingActivities ?? null,
    capex: row.capex ?? raw.capex ?? null,
    netDebt: row.netDebt ?? raw.netDebt ?? null,
    adjustedEbitda: row.adjustedEbitda ?? raw.adjustedEbitda ?? null,
    leverageRatio: row.netDebtToEbitda ?? raw.leverageRatio ?? null,
    dividendPerShare: row.dividendPerShare ?? raw.dividendPerShare ?? null,
    payoutRatio: raw.payoutRatio ?? null,
    shareCount: row.dilutedShares ?? raw.shareCount ?? null,
    exceptionalItems: raw.exceptionalItems ?? null,
    fxImpactPct: row.fxImpact ?? raw.fxImpactPct ?? null,
    disposalsImpactPct: raw.disposalsImpactPct ?? null,
    hyperinflationImpactPct: raw.hyperinflationImpactPct ?? null,
    sourceEvidenceIds: raw.sourceEvidenceIds ?? [`backend-${row.sourceType ?? "unknown"}`],
  };
}

function mapRegionalSegment(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    periodId: row.periodId,
    region: row.segment,
    reportedNetSales: row.revenue ?? raw.reportedNetSales ?? 0,
    percentageOfNetSales: raw.percentageOfNetSales ?? 0,
    organicNetSalesGrowth: row.growth ?? raw.organicNetSalesGrowth ?? 0,
    volumeGrowth: row.volumeGrowth ?? raw.volumeGrowth ?? null,
    priceMixGrowth: row.priceMixGrowth ?? raw.priceMixGrowth ?? null,
    operatingProfit: row.operatingIncome ?? raw.operatingProfit ?? null,
    margin: row.operatingMargin ?? raw.margin ?? null,
    keyBrands: raw.keyBrands ?? [],
    keyCountries: raw.keyCountries ?? [],
    channelInventoryCommentary: raw.channelInventoryCommentary ?? row.notes ?? "",
    demandSignal: raw.demandSignal ?? "mixed",
    riskSignal: raw.riskSignal ?? "medium",
    managementQuote: raw.managementQuote ?? "",
    sourceEvidenceIds: raw.sourceEvidenceIds ?? [`backend-${row.sourceType ?? "unknown"}`],
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot) {
  const dataset = cloneJson(baseDataset);
  const cutoff = snapshot?.asOfDate ?? "9999-12-31";
  const financials = (snapshot?.financialPeriods ?? []).filter((row) => rowIsAsOf(row, cutoff));
  if (financials.length) {
    dataset.periods = financials.map(mapFinancialPeriod);
  }

  const asOfSegments = (snapshot?.segmentFinancials ?? []).filter((row) => rowIsAsOf(row, cutoff));
  const regionalSegments = asOfSegments.filter((row) => row.taxonomy === "regional_segment");
  dataset.reportedData.regions = regionalSegments.map(mapRegionalSegment);
  dataset.reportedData.brands = [];
  dataset.reportedData.categories = asOfSegments
    .filter((row) => row.taxonomy === "category_mix")
    .map((row) => ({
      id: row.segment,
      category: row.segment,
      categoryGrowth: row.growth ?? 0,
      diageoExposure: "research-only backend snapshot",
      marketShare: null,
      premiumisationStatus: "not available as official as-of actual",
      affordabilityPressure: "unknown",
      priceMixSustainability: "unknown",
      depletionsVsShipments: "not available",
      inventoryLevel: "unknown",
      riskScore: 50,
      sourceEvidenceIds: [`backend-${row.sourceType ?? "unknown"}`],
    }));
  dataset.reportedData.channelInventory = asOfSegments
    .filter((row) => row.taxonomy === "channel_inventory")
    .map((row) => parseJson(row.rawJson, {}));
  dataset.guidanceData = (snapshot?.guidanceItems ?? [])
    .filter((row) => rowIsAsOf(row, cutoff))
    .map((row) => parseJson(row.rawJson, {}))
    .filter((row) => Object.keys(row).length);
  dataset.competitorData = [];
  dataset.researchAssumptions = [];

  const market = snapshot?.marketSnapshot ?? {};
  const priceGbp = finiteNumber(market.currentPrice) ?? dataset.marketData.londonPriceGbp;
  const gbpUsd = dataset.marketData.gbpUsd;
  const sharesOutstandingM = finiteNumber(market.sharesOutstanding) ?? dataset.marketData.sharesOutstandingM;
  const netDebtUsdM = finiteNumber(market.netDebt) ?? dataset.marketData.netDebtUsdM;
  const marketCapGbpM = priceGbp * sharesOutstandingM;
  const marketCapUsdM = marketCapGbpM * gbpUsd;
  dataset.marketData = {
    ...dataset.marketData,
    londonPriceGbp: priceGbp,
    londonPriceGbx: priceGbp * 100,
    priceDate: market.priceDate ?? snapshot?.asOfDate ?? dataset.marketData.priceDate,
    sharesOutstandingM,
    marketCapGbpM,
    marketCapUsdM,
    netDebtUsdM,
    enterpriseValueUsdM: marketCapUsdM + netDebtUsdM,
    sourceName: market.source ?? dataset.marketData.sourceName,
    validationWarnings: [
      ...(dataset.marketData.validationWarnings ?? []),
      {
        id: "dge-backend-market-snapshot",
        title: "Backend market snapshot applied",
        detail: "Backend valuation uses the as-of DGE.L local-price snapshot in GBP after converting London GBp price bars.",
        severity: "low",
      },
    ],
  };
  dataset.currentPeriodId = financials.some((row) => row.periodId === snapshot?.reportingEvent?.id)
    ? snapshot.reportingEvent.id
    : financials.at(-1)?.periodId ?? dataset.periods[0]?.id ?? dataset.currentPeriodId;
  return dataset;
}

function segmentGrowth(snapshot, segment) {
  const rows = (snapshot?.segmentFinancials ?? [])
    .filter((row) => row.taxonomy === "regional_segment" && row.segment === segment && row.growth != null)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  return finiteNumber(rows[rows.length - 1]?.growth);
}

function buildAsOfAssumptionOverrides({ snapshot, scenarioPreset = {}, payloadAssumptions = {}, valuationFinancial }) {
  const base = { ...scenarioPreset, ...payloadAssumptions };
  const sourceType = valuationFinancial?.sourceType ?? "research_only";
  const asOfYear = Number((snapshot?.asOfDate ?? "").slice(0, 4)) || valuationFinancial?.fiscalYear || 2026;
  const maturity = clamp((asOfYear - 2018) / 8, 0, 1) ?? 1;
  const latestFullFinancial = latestByAsOfDate(snapshot?.financialPeriods ?? [], (row) => row.operatingIncome != null || row.freeCashFlow != null);
  const revenue = annualize(valuationFinancial, "reportedNetSales", annualize(valuationFinancial, "revenue", undefined));
  const fullRevenue = annualize(latestFullFinancial, "reportedNetSales", annualize(latestFullFinancial, "revenue", undefined));
  const revenueScale = revenue && fullRevenue ? clamp(revenue / fullRevenue, 0.65, 1.22) ?? 1 : 0.80 + maturity * 0.20;
  const operatingMargin =
    finiteNumber(valuationFinancial?.operatingMargin) ??
    finiteNumber(latestFullFinancial?.operatingMargin) ??
    base.operatingMargin ??
    0.285;
  const operatingIncome =
    annualize(valuationFinancial, "operatingIncome", undefined) ??
    (revenue != null && operatingMargin != null ? revenue * operatingMargin : undefined) ??
    (base.normalizedEbit ?? 5_650) * revenueScale;
  const freeCashFlow =
    annualize(valuationFinancial, "freeCashFlow", undefined) ??
    annualize(latestFullFinancial, "freeCashFlow", undefined) ??
    (base.normalizedFcf ?? 2_850) * revenueScale;
  const ebitda =
    valuationFinancial?.adjustedEbitda != null && !["quarter", "trading-update", "ytd"].includes(valuationFinancial.periodType)
      ? finiteNumber(valuationFinancial.adjustedEbitda)
      : operatingIncome != null
        ? operatingIncome * 1.14
        : (base.normalizedEbitda ?? 6_450) * revenueScale;
  const epsMultiplier = annualizationMultiplier(valuationFinancial);
  const eps = valuationFinancial?.dilutedEps != null
    ? finiteNumber(valuationFinancial.dilutedEps) * epsMultiplier
    : (base.epsBeforeExceptional ?? 1.64) * revenueScale;
  const organicGrowth = finiteNumber(valuationFinancial?.organicNetSalesGrowth) ?? 0;
  const naGrowth = segmentGrowth(snapshot, "North America");
  const lacGrowth = segmentGrowth(snapshot, "Latin America & Caribbean");
  const sourceHaircut = sourceType === "official_actual" ? 0 : 0.006;
  const negativeGrowthPenalty = Math.max(0, -organicGrowth) * 0.05;

  return compactNumbers({
    currentPriceGbp: finiteNumber(snapshot?.marketSnapshot?.currentPrice),
    sharesOutstandingM: finiteNumber(snapshot?.marketSnapshot?.sharesOutstanding),
    netDebtUsdM: finiteNumber(valuationFinancial?.netDebt) ?? finiteNumber(snapshot?.marketSnapshot?.netDebt) ?? base.netDebtUsdM,
    normalizedFcf: clamp(freeCashFlow, 1_700, 3_650),
    normalizedEbit: clamp(operatingIncome, 4_100, 6_700),
    normalizedEbitda: clamp(ebitda, 5_200, 7_600),
    epsBeforeExceptional: clamp(eps, 0.95, 2.25),
    operatingMargin: clamp(operatingMargin, 0.23, 0.335),
    targetFcfYield: clamp((base.targetFcfYield ?? 0.08) + (1 - maturity) * 0.012 + sourceHaircut + negativeGrowthPenalty, 0.055, 0.12),
    usOrganicGrowth: clamp(naGrowth ?? organicGrowth - 0.015, -0.12, 0.05),
    lacNormalizedGrowth: clamp((lacGrowth ?? organicGrowth + 0.015) - (sourceType === "official_actual" ? 0.018 : 0.025), -0.05, 0.11),
    regionQualityAdjustment: clamp((base.regionQualityAdjustment ?? -0.05) + (maturity - 1) * 0.04 + organicGrowth * 0.20 - sourceHaircut, -0.22, 0.08),
  });
}

function historicalRegime(asOfDate) {
  const year = Number(String(asOfDate ?? "").slice(0, 4)) || 2026;
  if (year <= 2019) {
    return {
      name: "pre-covid premiumisation",
      targetFcfYield: 0.056,
      evEbitMultiple: 15.2,
      evEbitdaMultiple: 12.3,
      peMultiple: 23.5,
      dividendYield: 0.032,
      terminalGrowth: 0.035,
      regionQualityAdjustment: 0.06,
    };
  }
  if (year === 2020) {
    return {
      name: "covid demand shock",
      targetFcfYield: 0.072,
      evEbitMultiple: 12.4,
      evEbitdaMultiple: 10.1,
      peMultiple: 18.0,
      dividendYield: 0.044,
      terminalGrowth: 0.018,
      regionQualityAdjustment: -0.06,
    };
  }
  if (year <= 2022) {
    return {
      name: "reopening premiumisation",
      targetFcfYield: 0.052,
      evEbitMultiple: 16.1,
      evEbitdaMultiple: 12.9,
      peMultiple: 24.5,
      dividendYield: 0.031,
      terminalGrowth: 0.036,
      regionQualityAdjustment: 0.08,
    };
  }
  if (year === 2023) {
    return {
      name: "normalisation warning",
      targetFcfYield: 0.064,
      evEbitMultiple: 13.5,
      evEbitdaMultiple: 10.9,
      peMultiple: 19.5,
      dividendYield: 0.039,
      terminalGrowth: 0.025,
      regionQualityAdjustment: -0.01,
    };
  }
  if (year === 2024) {
    return {
      name: "us-lac reset",
      targetFcfYield: 0.078,
      evEbitMultiple: 11.4,
      evEbitdaMultiple: 9.4,
      peMultiple: 15.5,
      dividendYield: 0.050,
      terminalGrowth: 0.015,
      regionQualityAdjustment: -0.11,
    };
  }
  return {
    name: "fy2025-fy2026 turnaround proof",
    targetFcfYield: 0.084,
    evEbitMultiple: 10.7,
    evEbitdaMultiple: 8.9,
    peMultiple: 14.0,
    dividendYield: 0.052,
    terminalGrowth: 0.014,
    regionQualityAdjustment: -0.13,
  };
}

function scenarioCaseAdjustments(caseName) {
  if (caseName === "Bear") {
    return {
      normalizedFcfMultiplier: 0.84,
      ebitMultiplier: 0.89,
      ebitdaMultiplier: 0.91,
      epsMultiplier: 0.84,
      dividendMultiplier: 0.92,
      yieldShift: 0.016,
      multipleMultiplier: 0.84,
      regionShift: -0.11,
      terminalGrowthShift: -0.01,
    };
  }
  if (caseName === "Bull") {
    return {
      normalizedFcfMultiplier: 1.16,
      ebitMultiplier: 1.10,
      ebitdaMultiplier: 1.09,
      epsMultiplier: 1.14,
      dividendMultiplier: 1.06,
      yieldShift: -0.010,
      multipleMultiplier: 1.16,
      regionShift: 0.08,
      terminalGrowthShift: 0.010,
    };
  }
  return {
    normalizedFcfMultiplier: 1,
    ebitMultiplier: 1,
    ebitdaMultiplier: 1,
    epsMultiplier: 1,
    dividendMultiplier: 1,
    yieldShift: 0,
    multipleMultiplier: 1,
    regionShift: 0,
    terminalGrowthShift: 0,
  };
}

function latestFinancialWith(snapshot, predicate) {
  return latestByAsOfDate(snapshot?.financialPeriods ?? [], (row) => rowIsAsOf(row, snapshot?.asOfDate) && predicate(row));
}

function estimateHistoricalInputs(snapshot, valuationFinancial, baseDataset) {
  const market = snapshot?.marketSnapshot ?? {};
  const latestFullFinancial = latestFinancialWith(
    snapshot,
    (row) => row.periodType === "annual" || row.operatingIncome != null || row.freeCashFlow != null || row.dividendPerShare != null,
  );
  const salesRow = valuationFinancial ?? latestFullFinancial;
  const sales =
    annualize(salesRow, "reportedNetSales", annualize(salesRow, "revenue", undefined)) ??
    annualize(latestFullFinancial, "reportedNetSales", annualize(latestFullFinancial, "revenue", undefined)) ??
    17_000;
  const operatingMargin =
    finiteNumber(salesRow?.operatingMargin) ??
    finiteNumber(latestFullFinancial?.operatingMargin) ??
    (Number(String(snapshot?.asOfDate ?? "").slice(0, 4)) <= 2022 ? 0.306 : 0.285);
  const operatingIncome =
    annualize(salesRow, "operatingIncome", undefined) ??
    annualize(latestFullFinancial, "operatingIncome", undefined) ??
    sales * operatingMargin;
  const freeCashFlow =
    annualize(salesRow, "freeCashFlow", undefined) ??
    annualize(latestFullFinancial, "freeCashFlow", undefined) ??
    sales * (Number(String(snapshot?.asOfDate ?? "").slice(0, 4)) <= 2022 ? 0.135 : 0.105);
  const adjustedEbitda =
    finiteNumber(salesRow?.adjustedEbitda) ??
    finiteNumber(latestFullFinancial?.adjustedEbitda) ??
    operatingIncome * 1.14;
  const eps =
    annualize(salesRow, "dilutedEps", undefined) ??
    annualize(latestFullFinancial, "dilutedEps", undefined) ??
    (operatingIncome * 0.63) / (finiteNumber(market.sharesOutstanding) ?? baseDataset.marketData.sharesOutstandingM ?? 2_220);
  const dividend =
    finiteNumber(salesRow?.dividendPerShare) ??
    finiteNumber(latestFullFinancial?.dividendPerShare) ??
    (Number(String(snapshot?.asOfDate ?? "").slice(0, 4)) >= 2025 ? 0.50 : 0.95);
  const sourceRowsUsed = [
    valuationFinancial?.id ?? valuationFinancial?.periodId,
    latestFullFinancial?.id ?? latestFullFinancial?.periodId,
    market?.id,
  ].filter(Boolean);

  return compactNumbers({
    currentPriceGbp: finiteNumber(market.currentPrice) ?? baseDataset.marketData.londonPriceGbp,
    sharesOutstandingM: finiteNumber(market.sharesOutstanding) ?? baseDataset.marketData.sharesOutstandingM,
    netDebtUsdM:
      finiteNumber(salesRow?.netDebt) ??
      finiteNumber(latestFullFinancial?.netDebt) ??
      finiteNumber(market.netDebt) ??
      baseDataset.marketData.netDebtUsdM,
    normalizedFcf: freeCashFlow,
    normalizedEbit: operatingIncome,
    normalizedEbitda: adjustedEbitda,
    epsBeforeExceptional: eps,
    dividendPerShareUsd: dividend,
    operatingMargin,
    gbpUsd: baseDataset.marketData.gbpUsd,
    sourceRowsUsedCount: sourceRowsUsed.length,
  });
}

function applySourceQualityToRegime(regime, valuationFinancial) {
  const sourceType = valuationFinancial?.sourceType ?? "research_only";
  const proxyPenalty = sourceType === "official_actual" ? 0 : 0.006;
  return {
    ...regime,
    targetFcfYield: regime.targetFcfYield + proxyPenalty,
    evEbitMultiple: regime.evEbitMultiple * (sourceType === "official_actual" ? 1 : 0.965),
    evEbitdaMultiple: regime.evEbitdaMultiple * (sourceType === "official_actual" ? 1 : 0.965),
    peMultiple: regime.peMultiple * (sourceType === "official_actual" ? 1 : 0.955),
    regionQualityAdjustment: regime.regionQualityAdjustment - proxyPenalty * 4,
  };
}

function equityValuePerShareGbp(equityValueUsdM, inputs) {
  return equityValueUsdM / inputs.sharesOutstandingM / inputs.gbpUsd;
}

function pctUpside(fairValue, currentPrice) {
  return currentPrice > 0 ? fairValue / currentPrice - 1 : null;
}

function expectedShareholderCagr(targetPrice3Y, currentPrice, cumulativeDividends) {
  if (!(targetPrice3Y > 0) || !(currentPrice > 0)) return null;
  return ((targetPrice3Y + cumulativeDividends) / currentPrice) ** (1 / 3) - 1;
}

function computeAsOfCase(caseName, inputs, regime) {
  const adjustment = scenarioCaseAdjustments(caseName);
  const normalizedFcf = inputs.normalizedFcf * adjustment.normalizedFcfMultiplier;
  const normalizedEbit = inputs.normalizedEbit * adjustment.ebitMultiplier;
  const normalizedEbitda = inputs.normalizedEbitda * adjustment.ebitdaMultiplier;
  const eps = inputs.epsBeforeExceptional * adjustment.epsMultiplier;
  const dividend = inputs.dividendPerShareUsd * adjustment.dividendMultiplier;
  const targetFcfYield = clamp(regime.targetFcfYield + adjustment.yieldShift, 0.04, 0.13);
  const evEbitMultiple = regime.evEbitMultiple * adjustment.multipleMultiplier;
  const evEbitdaMultiple = regime.evEbitdaMultiple * adjustment.multipleMultiplier;
  const peMultiple = regime.peMultiple * adjustment.multipleMultiplier;
  const dividendYield = clamp(regime.dividendYield + adjustment.yieldShift * 0.35, 0.028, 0.07);
  const regionQualityAdjustment = clamp(regime.regionQualityAdjustment + adjustment.regionShift, -0.28, 0.14);
  const terminalGrowth = clamp(regime.terminalGrowth + adjustment.terminalGrowthShift, -0.005, 0.05);
  const normalizedFcfFairValueGbp = equityValuePerShareGbp(normalizedFcf / targetFcfYield, inputs);
  const evEbitFairValueGbp = equityValuePerShareGbp(normalizedEbit * evEbitMultiple - inputs.netDebtUsdM, inputs);
  const evEbitdaFairValueGbp = equityValuePerShareGbp(normalizedEbitda * evEbitdaMultiple - inputs.netDebtUsdM, inputs);
  const peFairValueGbp = eps * peMultiple / inputs.gbpUsd;
  const dividendFloorValueGbp = dividend / dividendYield / inputs.gbpUsd;
  const regionQualityFairValueGbp = normalizedFcfFairValueGbp * (1 + regionQualityAdjustment);
  const weights = {
    fcfYield: 0.31,
    evEbit: 0.22,
    evEbitda: 0.18,
    pe: 0.15,
    dividend: 0.06,
    regionQuality: 0.08,
  };
  const blendedFairValueGbp =
    normalizedFcfFairValueGbp * weights.fcfYield +
    evEbitFairValueGbp * weights.evEbit +
    evEbitdaFairValueGbp * weights.evEbitda +
    peFairValueGbp * weights.pe +
    dividendFloorValueGbp * weights.dividend +
    regionQualityFairValueGbp * weights.regionQuality;
  const targetPrice3Y = blendedFairValueGbp * (1 + terminalGrowth) ** 3;
  const cumulativeDividends = (dividend / inputs.gbpUsd) * 3;

  return {
    scenario: caseName,
    fairValue: blendedFairValueGbp,
    upsideDownside: pctUpside(blendedFairValueGbp, inputs.currentPriceGbp),
    expectedReturn3Y: expectedShareholderCagr(targetPrice3Y, inputs.currentPriceGbp, cumulativeDividends),
    targetPrice3Y,
    cumulativeDividends,
    summary: `${caseName} no-lookahead DGE backend valuation using only data available as of the reporting event.`,
    methods: {
      normalizedFcfFairValueGbp,
      evEbitFairValueGbp,
      evEbitdaFairValueGbp,
      peFairValueGbp,
      dividendFloorValueGbp,
      regionQualityFairValueGbp,
    },
    assumptions: {
      targetFcfYield,
      evEbitMultiple,
      evEbitdaMultiple,
      peMultiple,
      dividendYield,
      regionQualityAdjustment,
      terminalGrowth,
    },
  };
}

function buildBackendSensitivityTables(inputs, baseCase) {
  const rows = (xValues, yValues, fn) => [
    ["", ...yValues],
    ...xValues.map((x) => [x, ...yValues.map((y) => fn(x, y))]),
  ];
  return [
    {
      title: "US Organic Growth x Target FCF Yield",
      table: rows(
        [-0.08, -0.05, -0.02, 0, 0.02],
        [baseCase.assumptions.targetFcfYield - 0.01, baseCase.assumptions.targetFcfYield - 0.005, baseCase.assumptions.targetFcfYield, baseCase.assumptions.targetFcfYield + 0.005, baseCase.assumptions.targetFcfYield + 0.01],
        (growth, yieldRate) => equityValuePerShareGbp((inputs.normalizedFcf * (1 + growth * 1.25)) / Math.max(0.001, yieldRate), inputs),
      ),
    },
    {
      title: "Operating Margin x FCF",
      table: rows(
        [inputs.operatingMargin - 0.025, inputs.operatingMargin - 0.01, inputs.operatingMargin, inputs.operatingMargin + 0.01, inputs.operatingMargin + 0.025],
        [inputs.normalizedFcf - 350, inputs.normalizedFcf - 175, inputs.normalizedFcf, inputs.normalizedFcf + 175, inputs.normalizedFcf + 350],
        (margin, fcf) => baseCase.fairValue * (1 + (margin - inputs.operatingMargin) * 1.8 + (fcf - inputs.normalizedFcf) / Math.max(1, inputs.normalizedFcf) * 0.75),
      ),
    },
    {
      title: "Net Debt / EBITDA x EV/EBITDA Multiple",
      table: rows(
        [2.4, 2.8, 3.2, 3.6, 4.0],
        [baseCase.assumptions.evEbitdaMultiple - 1.0, baseCase.assumptions.evEbitdaMultiple - 0.5, baseCase.assumptions.evEbitdaMultiple, baseCase.assumptions.evEbitdaMultiple + 0.5, baseCase.assumptions.evEbitdaMultiple + 1.0],
        (leverage, multiple) => equityValuePerShareGbp(inputs.normalizedEbitda * multiple - inputs.normalizedEbitda * leverage, inputs),
      ),
    },
  ];
}

function overlayAsOfBackendValuation({ valuation, snapshot, valuationFinancial, baseDataset, scenario }) {
  const sourceMaxDate = latestSourceDate(
    [
      ...(snapshot?.financialPeriods ?? []),
      ...(snapshot?.segmentFinancials ?? []),
      ...(snapshot?.guidanceItems ?? []),
      snapshot?.marketSnapshot ?? {},
    ],
    snapshot?.asOfDate,
  ) ?? snapshot?.asOfDate;
  const rawInputs = estimateHistoricalInputs(snapshot, valuationFinancial, baseDataset);
  const inputs = {
    ...rawInputs,
    normalizedFcf: clamp(rawInputs.normalizedFcf, 900, 4_200),
    normalizedEbit: clamp(rawInputs.normalizedEbit, 2_800, 7_200),
    normalizedEbitda: clamp(rawInputs.normalizedEbitda, 3_600, 8_200),
    epsBeforeExceptional: clamp(rawInputs.epsBeforeExceptional, 0.45, 2.65),
    dividendPerShareUsd: clamp(rawInputs.dividendPerShareUsd, 0.35, 1.25),
    operatingMargin: clamp(rawInputs.operatingMargin, 0.18, 0.36),
  };
  const regime = applySourceQualityToRegime(historicalRegime(snapshot?.asOfDate), valuationFinancial);
  const cases = ["Bear", "Base", "Bull"].map((caseName) => computeAsOfCase(caseName, inputs, regime));
  const selected = cases.find((item) => item.scenario === scenario) ?? cases[1];
  const base = cases.find((item) => item.scenario === "Base") ?? selected;
  const probabilityWeightedFairValue = cases.reduce((sum, item, index) => sum + item.fairValue * [0.25, 0.5, 0.25][index], 0);
  const methodCards = [
    { key: "dge-backend-blended", label: "No-Lookahead Blended Fair Value", value: selected.fairValue, format: "currency", description: "Backend as-of FCF yield, EV multiples, P/E, dividend floor and region-quality triangulation." },
    { key: "dge-backend-fcf-yield", label: "Normalized FCF Yield", value: selected.methods.normalizedFcfFairValueGbp, format: "currency", description: "As-of normalized FCF divided by the historical risk-regime target FCF yield." },
    { key: "dge-backend-ev-ebit", label: "EV / EBIT", value: selected.methods.evEbitFairValueGbp, format: "currency", description: "As-of normalized EBIT multiple less as-of net debt." },
    { key: "dge-backend-ev-ebitda", label: "EV / EBITDA", value: selected.methods.evEbitdaFairValueGbp, format: "currency", description: "As-of normalized EBITDA multiple less as-of net debt." },
    { key: "dge-backend-pe", label: "P/E Cross Check", value: selected.methods.peFairValueGbp, format: "currency", description: "As-of EPS before exceptional items times the historical risk-regime P/E multiple." },
    { key: "dge-backend-dividend", label: "Dividend Floor", value: selected.methods.dividendFloorValueGbp, format: "currency", description: "As-of dividend floor capitalized at the historical risk-regime dividend yield." },
  ];
  const noLookaheadWarning = {
    id: "dge-backend-no-lookahead",
    title: "Backend valuation uses an as-of data boundary",
    detail: `Valuation inputs are capped at ${snapshot?.asOfDate}; latest source row used is ${sourceMaxDate}. ${valuationFinancial?.sourceType === "official_actual" ? "The selected row is official_actual." : "The selected historical row is forecast_assumption/research proxy, not an official quarterly actual."}`,
    severity: valuationFinancial?.sourceType === "official_actual" ? "low" : "medium",
  };

  return {
    ...valuation,
    currentPrice: inputs.currentPriceGbp,
    fairValues: cases.map(({ scenario: caseName, fairValue, upsideDownside, expectedReturn3Y, targetPrice3Y, cumulativeDividends, summary }) => ({
      scenario: caseName,
      fairValue,
      upsideDownside,
      expectedReturn3Y,
      targetPrice3Y,
      cumulativeDividends,
      summary,
    })),
    methodCards,
    sensitivityTables: buildBackendSensitivityTables(inputs, base),
    fcfFairValue: selected.methods.normalizedFcfFairValueGbp,
    peFairValue: selected.methods.peFairValueGbp,
    blendedFairValue: selected.fairValue,
    probabilityWeightedFairValue,
    recommendedFairValue: selected.fairValue,
    recommendedFairValueMethod: "Backend no-lookahead FCF yield / EV multiples / P/E / dividend floor / region-quality triangulation",
    recommendedFairValueReason: "Historical DGE backend runs use only event-available financials, market prices and explicitly marked proxy rows so later US/LAC/tequila evidence does not leak into older dates.",
    valuationRangeLow: cases[0].fairValue,
    valuationRangeBase: cases[1].fairValue,
    valuationRangeHigh: cases[2].fairValue,
    targetPrice3Y: selected.targetPrice3Y,
    expectedReturn3Y: selected.expectedReturn3Y,
    upsideDownside: selected.upsideDownside,
    validationWarnings: [noLookaheadWarning, ...(valuation.validationWarnings ?? [])],
    backendNoLookahead: {
      asOfDataCutoff: snapshot?.asOfDate,
      sourceMaxDate,
      historicalRegime: regime.name,
      sourceRowsUsedCount: inputs.sourceRowsUsedCount,
      selectedFinancialSourceType: valuationFinancial?.sourceType ?? "unknown",
      noFutureData: true,
      methodInputs: {
        currentPriceGbp: inputs.currentPriceGbp,
        normalizedFcfUsdM: inputs.normalizedFcf,
        normalizedEbitUsdM: inputs.normalizedEbit,
        normalizedEbitdaUsdM: inputs.normalizedEbitda,
        epsBeforeExceptionalUsd: inputs.epsBeforeExceptional,
        dividendPerShareUsd: inputs.dividendPerShareUsd,
        netDebtUsdM: inputs.netDebtUsdM,
        sharesOutstandingM: inputs.sharesOutstandingM,
        gbpUsd: inputs.gbpUsd,
      },
      baseCaseAssumptions: base.assumptions,
    },
  };
}

async function loadDgeFrontendModules() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const dataModule = await server.ssrLoadModule("/src/stocks/dge/data/index.ts");
    const calculationsModule = await server.ssrLoadModule("/src/stocks/dge/calculations.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/dge/assumptions.ts");
    return {
      baseDataset: dataModule.dgeDataset,
      calculateDgeValuation: calculationsModule.calculateDgeValuation,
      scenarioPresets: assumptionsModule.dgeScenarioPresets,
    };
  } finally {
    await server.close();
  }
}

export async function runDgeBackendValuation({
  snapshot,
  scenario = "Base",
  modelVersion = DGE_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const { baseDataset, calculateDgeValuation, scenarioPresets } = await loadDgeFrontendModules();
  const valuationFinancial = selectValuationFinancial(snapshot);
  const dataset = buildDatasetFromSnapshot(baseDataset, snapshot);
  const scenarioPreset = scenarioPresets[scenario] ?? scenarioPresets.Base;
  const asOfAssumptionOverrides = buildAsOfAssumptionOverrides({
    snapshot,
    scenarioPreset,
    payloadAssumptions: assumptions,
    valuationFinancial,
  });
  const periodId = dataset.periods.some((period) => period.id === valuationFinancial?.periodId)
    ? valuationFinancial.periodId
    : dataset.currentPeriodId;
  const frontendValuation = calculateDgeValuation(dataset, periodId, scenario, {
    ...assumptions,
    ...asOfAssumptionOverrides,
  });
  const valuation = overlayAsOfBackendValuation({
    valuation: frontendValuation,
    snapshot,
    valuationFinancial,
    baseDataset,
    scenario,
  });

  return {
    ...valuation,
    modelVersion,
    backendSnapshot: {
      reportingEvent: snapshot?.reportingEvent ?? null,
      selectedFinancialPeriod: valuationFinancial ?? null,
      asOfAssumptionOverrides,
      backendNoLookahead: valuation.backendNoLookahead,
      sourceBoundary:
        valuationFinancial?.sourceType === "official_actual"
          ? "Official DGE event row with backend market price anchor."
          : "Forecast-assumption/proxy row used for historical valuation continuity; not an official quarterly actual.",
    },
    assumptions: {
      ...scenarioPreset,
      ...assumptions,
      ...asOfAssumptionOverrides,
    },
  };
}
