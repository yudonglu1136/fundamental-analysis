import { createServer } from "vite";
import { NOC_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latestByAsOf(rows = []) {
  return [...rows].sort((left, right) => String(left.asOfDate ?? "").localeCompare(String(right.asOfDate ?? ""))).at(-1) ?? null;
}

function eventFinancial(snapshot) {
  const eventId = snapshot.reportingEvent?.id;
  const rows = snapshot.financialPeriods ?? [];
  const event = snapshot.reportingEvent ?? {};
  if (event.eventType === "q4_results" && event.fiscalYear != null) {
    const annualRow = rows
      .filter((row) => row.periodType === "annual" && row.fiscalYear === event.fiscalYear && row.asOfDate <= event.eventDate)
      .sort((left, right) => String(left.asOfDate ?? "").localeCompare(String(right.asOfDate ?? "")))
      .at(-1);
    if (annualRow) return annualRow;
  }
  return rows.find((row) => row.eventId === eventId) ?? latestByAsOf(rows);
}

function annualizeFinancial(row) {
  const isQuarter = row?.periodType === "quarter";
  const multiplier = isQuarter ? 4 : 1;
  const sales = finite(row?.sales);
  const operatingIncome = finite(row?.operatingIncome);
  const segmentOperatingIncome = finite(row?.segmentOperatingIncome, operatingIncome);
  const freeCashFlow = finite(row?.freeCashFlow, sales * 0.07);
  const capex = finite(row?.capex, sales * 0.035);
  return {
    id: "fy25",
    label: `${row?.periodId ?? "backend"} event-visible run-rate`,
    fiscalYear: finite(row?.fiscalYear, 2025),
    periodType: "annual",
    sourceStatus: row?.sourceType ?? "research_only",
    sourceId: row?.eventId ?? row?.id,
    sales: sales * multiplier,
    organicSales: finite(row?.organicSales, sales) * multiplier,
    productSales: finite(row?.productSales, sales * 0.8) * multiplier,
    serviceSales: finite(row?.serviceSales, sales * 0.2) * multiplier,
    operatingIncome: operatingIncome * multiplier,
    operatingMargin: sales ? operatingIncome / sales : finite(row?.operatingMargin, 0.1),
    segmentOperatingIncome: segmentOperatingIncome * multiplier,
    segmentOperatingMargin: sales ? segmentOperatingIncome / sales : finite(row?.segmentOperatingMargin, 0.105),
    netEarnings: finite(row?.netEarnings, operatingIncome * 0.78) * multiplier,
    dilutedEps: finite(row?.dilutedEps, 0) * multiplier,
    dilutedShares: finite(row?.dilutedShares, 145),
    operatingCashFlow: finite(row?.operatingCashFlow, sales * 0.1) * multiplier,
    freeCashFlow: freeCashFlow * multiplier,
    capex: capex * multiplier,
    netAwards: finite(row?.netAwards, sales * 1.05) * multiplier,
    fundedBacklog: finite(row?.fundedBacklog, sales * 4),
    unfundedBacklog: finite(row?.unfundedBacklog, sales * 5),
    totalBacklog: finite(row?.totalBacklog, sales * 9),
    cash: finite(row?.cash, 2_200),
    longTermDebt: finite(row?.longTermDebt, sales * 1.35),
    currentDebt: finite(row?.currentDebt, sales * 0.05),
    pensionAssets: row?.pensionAssets ?? null,
    pensionLiabilities: row?.pensionLiabilities ?? null,
    pensionAndOpbAssets: row?.pensionAndOpbAssets ?? null,
    pensionAndOpbLiabilities: row?.pensionAndOpbLiabilities ?? null,
    dividendsPaid: finite(row?.dividendsPaid, finite(row?.dilutedShares, 145) * finite(row?.dividendPerShare, 7)),
    dividendPerShare: finite(row?.dividendPerShare, 7),
    buybacks: finite(row?.buybacks, 0),
    fixedPriceSales: finite(row?.fixedPriceSales, sales * 0.5) * multiplier,
    costTypeSales: finite(row?.costTypeSales, sales * 0.5) * multiplier,
    notes: `Backend event-visible ${isQuarter ? "quarterly annualized" : "annual"} NOC financial period. Original DB periodId=${row?.periodId}.`,
    backendSource: {
      id: row?.id,
      periodId: row?.periodId,
      eventId: row?.eventId,
      asOfDate: row?.asOfDate,
      sourceType: row?.sourceType,
      rawJson: parseJson(row?.rawJson, {}),
      annualizedFromQuarter: isQuarter,
      annualizationMultiplier: multiplier,
    },
  };
}

function annualizeSegments(rows, sourcePeriodType) {
  const multiplier = sourcePeriodType === "quarter" ? 4 : 1;
  return rows.map((row) => {
    const sales = finite(row.sales);
    const operatingIncome = row.operatingIncome == null ? sales * finite(row.operatingMargin, 0.1) : finite(row.operatingIncome);
    return {
      periodId: "fy25",
      segment: row.segment,
      sourceStatus: row.sourceType ?? "research_only",
      sourceId: row.eventId ?? row.id,
      sales: sales * multiplier,
      salesPriorYear: row.salesPriorYear == null ? null : finite(row.salesPriorYear) * multiplier,
      operatingIncome: operatingIncome * multiplier,
      operatingIncomePriorYear: row.operatingIncomePriorYear == null ? null : finite(row.operatingIncomePriorYear) * multiplier,
      operatingMargin: sales ? operatingIncome / sales : finite(row.operatingMargin, 0.1),
      fundedBacklog: row.fundedBacklog == null ? null : finite(row.fundedBacklog),
      unfundedBacklog: row.unfundedBacklog == null ? null : finite(row.unfundedBacklog),
      totalBacklog: row.totalBacklog == null ? null : finite(row.totalBacklog),
      totalBacklogPriorYear: row.totalBacklogPriorYear == null ? null : finite(row.totalBacklogPriorYear),
      costTypeSales: row.costTypeSales == null ? null : finite(row.costTypeSales) * multiplier,
      fixedPriceSales: row.fixedPriceSales == null ? null : finite(row.fixedPriceSales) * multiplier,
      capex: row.capex == null ? null : finite(row.capex) * multiplier,
      depreciationAmortization: row.depreciationAmortization == null ? null : finite(row.depreciationAmortization) * multiplier,
      strategicImportance: row.strategicImportance ?? "Backend event-visible segment row.",
      keyPrograms: parseJson(row.keyProgramsJson, []),
      risks: parseJson(row.risksJson, []),
      notes: row.notes ?? row.sourceType,
      backendSource: {
        id: row.id,
        eventId: row.eventId,
        sourceType: row.sourceType,
        rawJson: parseJson(row.rawJson, {}),
      },
    };
  });
}

function mapMarketData(baseMarket, market, financial) {
  const currentPrice = finite(market?.currentPrice, baseMarket.currentPrice);
  const shares = finite(market?.sharesOutstandingM, financial.dilutedShares);
  const marketCap = finite(market?.marketCapUsdM, currentPrice * shares);
  const debt = financial.longTermDebt + financial.currentDebt;
  const cash = financial.cash;
  return {
    ...baseMarket,
    sourceStatus: "market_data",
    sourceId: market?.id ?? baseMarket.sourceId,
    currentPrice,
    priceDate: market?.priceDate ?? market?.asOfDate ?? baseMarket.priceDate,
    source: market?.source ?? "backend market snapshot",
    sharesForMarketCap: shares,
    marketCap,
    enterpriseValue: finite(market?.enterpriseValueUsdM, marketCap + debt - cash),
    dividendYield: financial.dividendPerShare / Math.max(currentPrice, 0.01),
    fcfYield: financial.freeCashFlow / Math.max(marketCap, 1),
    notes: "Backend event-visible market snapshot. Daily adjusted close is applied by the valuation service when available.",
  };
}

function mapGuidance(snapshot) {
  const rows = snapshot.guidanceItems ?? [];
  if (!rows.length) return [];
  const byYear = new Map();
  for (const row of rows) {
    if (row.valuationImpactAllowed !== 1) continue;
    const item = byYear.get(row.fiscalYear) ?? {
      year: row.fiscalYear,
      sourceStatus: "management_guidance",
      sourceId: row.guidanceSourceId ?? row.id,
      asOfDate: row.asOfDate,
      salesLow: null,
      salesHigh: null,
      segmentOperatingIncomeLow: null,
      segmentOperatingIncomeHigh: null,
      mtmAdjustedEpsLow: 0,
      mtmAdjustedEpsHigh: 0,
      freeCashFlowLow: null,
      freeCashFlowHigh: null,
      segmentGuidance: [],
      notes: "Backend explicit management guidance imported from guidance_items.",
    };
    if (row.metric === "sales") {
      item.salesLow = row.low;
      item.salesHigh = row.high;
    }
    if (row.metric === "segmentOperatingIncome") {
      item.segmentOperatingIncomeLow = row.low;
      item.segmentOperatingIncomeHigh = row.high;
    }
    if (row.metric === "freeCashFlow") {
      item.freeCashFlowLow = row.low;
      item.freeCashFlowHigh = row.high;
    }
    byYear.set(row.fiscalYear, item);
  }
  return [...byYear.values()].filter((item) => item.salesLow != null || item.freeCashFlowLow != null);
}

function buildAsOfAssumptionOverrides(financial, market, baseAssumptions, scenario) {
  const sales = Math.max(financial.sales, 1);
  const margin = clamp(financial.segmentOperatingMargin, 0.06, 0.14);
  const bookToBill = financial.netAwards / Math.max(sales, 1);
  const backlogCoverage = financial.totalBacklog / Math.max(sales, 1);
  const fcfMargin = financial.freeCashFlow / Math.max(sales, 1);
  const year = financial.fiscalYear;
  const programRiskPeriod = year >= 2025 ? 1 : year >= 2023 ? 0.6 : 0.25;
  const scenarioBias = scenario === "Bull" ? 0.004 : scenario === "Bear" ? -0.006 : 0;
  const revenueCagr = clamp(
    baseAssumptions.revenueCagr + (bookToBill - 1) * 0.006 + (backlogCoverage - 2.2) * 0.002 + (year - 2024) * 0.001 + scenarioBias,
    0.005,
    0.075,
  );
  const targetFcfYield = clamp(
    baseAssumptions.targetFcfYield - clamp(fcfMargin - 0.075, -0.025, 0.025) * 0.18,
    0.035,
    0.075,
  );
  return {
    currentPrice: market.currentPrice,
    revenueCagr,
    segmentOperatingMargin: margin,
    targetFcfYield,
    targetPe: clamp(baseAssumptions.targetPe + (margin - 0.105) * 35 + (backlogCoverage - 2.2) * 0.15, 12, 23),
    targetEvEbit: clamp(baseAssumptions.targetEvEbit + (margin - 0.105) * 20 + (backlogCoverage - 2.2) * 0.12, 10, 18.5),
    netDebt: financial.longTermDebt + financial.currentDebt - financial.cash,
    pensionSurplusCredit: (financial.pensionAndOpbAssets ?? financial.pensionAssets ?? 0) - (financial.pensionAndOpbLiabilities ?? financial.pensionLiabilities ?? 0),
    dilutedShares: financial.dilutedShares,
    dividendPerShare: financial.dividendPerShare,
    capexIntensity: clamp(financial.capex / Math.max(sales, 1), 0.02, 0.07),
    workingCapitalDragPctRevenueGrowth: clamp(baseAssumptions.workingCapitalDragPctRevenueGrowth + Math.max(0, 0.08 - fcfMargin) * 0.5, 0.06, 0.2),
    b21ScaleMultiplier: clamp(baseAssumptions.b21ScaleMultiplier * (year < 2021 ? 0.93 : year < 2024 ? 0.98 : 1 + programRiskPeriod * 0.015), 0.82, 1.3),
    sentinelRiskCharge: clamp(baseAssumptions.sentinelRiskCharge + programRiskPeriod * 0.002 + (margin < 0.095 ? 0.0015 : 0), 0, 0.018),
    spaceGrowthPremium: clamp(baseAssumptions.spaceGrowthPremium + (year <= 2023 ? 0.004 : year >= 2025 ? -0.001 : 0), -0.002, 0.018),
    missionMoatPremium: clamp(baseAssumptions.missionMoatPremium + (margin > 0.11 ? 0.003 : 0), 0, 0.03),
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot, baseAssumptions, scenario) {
  const financialRow = eventFinancial(snapshot);
  if (!financialRow) {
    throw new Error("NOC backend snapshot has no financial_periods row for valuation.");
  }
  const financial = annualizeFinancial(financialRow);
  const segmentEventId = financialRow.eventId ?? snapshot.reportingEvent?.id;
  const eventSegments = (snapshot.segmentFinancials ?? []).filter((row) => row.eventId === segmentEventId);
  const market = mapMarketData(baseDataset.marketData, snapshot.marketSnapshot, financial);
  const asOfAssumptionOverrides = buildAsOfAssumptionOverrides(financial, market, baseAssumptions, scenario);
  const dataset = cloneJson(baseDataset);
  dataset.periods = [financial];
  dataset.segments = annualizeSegments(eventSegments, financialRow.periodType);
  dataset.guidance = mapGuidance(snapshot);
  dataset.marketData = market;
  dataset.latestReportingPeriod = snapshot.reportingEvent?.fiscalPeriod ?? financial.label;
  return { dataset, financial, market, financialRow, eventSegments, asOfAssumptionOverrides };
}

function buildRowUsage(snapshot) {
  const tableRows = {
    financial_periods: snapshot.financialPeriods ?? [],
    segment_financials: snapshot.segmentFinancials ?? [],
    market_snapshots: snapshot.marketSnapshot ? [snapshot.marketSnapshot] : [],
    guidance_items: snapshot.guidanceItems ?? [],
    transcript_extractions: snapshot.transcriptExtractions ?? [],
  };
  return Object.fromEntries(Object.entries(tableRows).map(([table, rows]) => [
    table,
    rows.map((row) => ({ id: row.id, eventId: row.eventId, asOfDate: row.asOfDate ?? row.callDate, sourceType: row.sourceType })),
  ]));
}

export function buildNocBackendValuationPayload({
  snapshot,
  scenario = "Base",
  modelVersion = NOC_BACKEND_MODEL_VERSION.version,
  assumptions = {},
}) {
  return {
    ticker: "NOC",
    scenario,
    modelVersion,
    assumptionSetId: assumptions.assumptionSetId ?? null,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
  };
}

export async function runNocBackendValuation(input) {
  const payload = buildNocBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/noc/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/noc/data/index.ts");
    const { dataset, financial, market, financialRow, eventSegments, asOfAssumptionOverrides } = buildDatasetFromSnapshot(
      dataModule.nocDataset,
      payload.snapshot,
      payload.assumptions,
      payload.scenario,
    );
    const backendAssumptions = {
      ...payload.assumptions,
      ...asOfAssumptionOverrides,
    };
    const valuation = calculations.calculateNocValuation(dataset, "fy25", payload.scenario, backendAssumptions);
    const fairValue = finite(valuation.recommendedFairValue ?? valuation.blendedFairValue ?? valuation.valuationRangeBase, null);
    const currentPrice = market.currentPrice;
    const targetPrice3Y = fairValue != null
      ? fairValue * (1 + finite(backendAssumptions.revenueCagr, 0.035)) ** 0.5
      : null;
    const expectedShareholderCagr = currentPrice && targetPrice3Y
      ? ((targetPrice3Y + finite(backendAssumptions.dividendPerShare, 0) * 3) / currentPrice) ** (1 / 3) - 1
      : null;
    const upsideDownside = currentPrice && fairValue ? fairValue / currentPrice - 1 : null;
    const backendSnapshot = {
      asOfDate: payload.asOfDate,
      reportingEventId: payload.reportingEventId,
      fiscalPeriod: payload.snapshot.reportingEvent?.fiscalPeriod,
      valuationPeriodId: financialRow.periodId,
      backendValuationPeriodId: "fy25",
      marketSnapshotId: payload.snapshot.marketSnapshot?.id ?? null,
      guidanceSourceId: (payload.snapshot.guidanceItems ?? [])[0]?.guidanceSourceId ?? null,
      assumptionSetId: payload.assumptionSetId ?? null,
      financialPeriodCount: payload.snapshot.financialPeriods?.length ?? 0,
      segmentFinancialCount: eventSegments.length,
      transcriptExtractionCount: payload.snapshot.transcriptExtractions?.length ?? 0,
      annualizedFromQuarter: financialRow.periodType === "quarter",
      currentPrice,
      currentPriceSource: market.source,
      eventVisibleSales: financial.sales,
      eventVisibleSegmentOperatingMargin: financial.segmentOperatingMargin,
      eventVisibleFreeCashFlow: financial.freeCashFlow,
      eventVisibleBacklog: financial.totalBacklog,
      assumptionDilutedShares: backendAssumptions.dilutedShares,
      financialWeightedAverageShares: financial.dilutedShares,
      asOfAssumptionOverrides,
      rowUsage: buildRowUsage(payload.snapshot),
    };
    const warnings = [
      ...(valuation.validationWarnings ?? []),
      {
        id: "noc-backend-event-visible-snapshot",
        title: "Event-visible snapshot enforced",
        detail: "Backend valuation uses rows available on or before the selected NOC reporting event date; transcript rows remain research-only.",
        severity: "low",
      },
    ];
    return {
      ...valuation,
      currentPrice,
      fairValues: (valuation.fairValues ?? []).map((item) => item.scenario === payload.scenario ? {
        ...item,
        fairValue,
        upsideDownside,
        targetPrice3Y,
        expectedReturn3Y: expectedShareholderCagr,
      } : item),
      recommendedFairValue: fairValue,
      blendedFairValue: fairValue,
      valuationRangeBase: fairValue,
      targetPrice3Y,
      expectedReturn3Y: expectedShareholderCagr,
      expectedShareholderCagr,
      upsideDownside,
      probabilityWeightedFairValue: fairValue,
      backendModelVersion: payload.modelVersion,
      backendSnapshot,
      validationWarnings: warnings,
    };
  } finally {
    await server.close();
  }
}
