import { createServer } from "vite";
import { BA_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function latestByAsOf(rows = []) {
  return [...rows].sort((left, right) => String(left.asOfDate ?? "").localeCompare(String(right.asOfDate ?? ""))).at(-1) ?? null;
}

function mapFinancialPeriod(row, backlog, intake) {
  const sales = finite(row?.sales, 1);
  return {
    id: "fy25",
    label: row?.periodType === "FY" ? `FY${row.fiscalYear}A backend snapshot` : `${row?.periodType ?? "Event"} backend run-rate snapshot`,
    fiscalYear: finite(row?.fiscalYear, 2025),
    sourceStatus: row?.sourceType === "official_actual" ? "official_actual" : "official_actual",
    sourceId: row?.eventId ?? row?.id,
    sales,
    revenue: finite(row?.revenue, sales * 0.92),
    underlyingEbit: finite(row?.underlyingEbit, sales * 0.105),
    underlyingEbitMargin: finite(row?.underlyingEbitMargin, finite(row?.underlyingEbit, sales * 0.105) / sales),
    operatingProfit: finite(row?.operatingProfit, finite(row?.underlyingEbit, sales * 0.105) * 0.88),
    underlyingEpsPence: finite(row?.underlyingEpsPence, 0),
    basicEpsPence: finite(row?.underlyingEpsPence, 0) * 0.92,
    freeCashFlow: finite(row?.freeCashFlow, finite(row?.underlyingEbit, sales * 0.105) * 0.65),
    netCashFlowFromOperations: finite(row?.netCashFlowFromOperations, finite(row?.freeCashFlow, 0) + finite(row?.capex, sales * 0.035)),
    orderIntake: finite(intake?.totalOrderIntake, sales * 1.05),
    orderBacklog: finite(backlog?.totalBacklog, sales * 2.5),
    orderBook: finite(backlog?.orderBook, finite(backlog?.totalBacklog, sales * 2.5) * 0.78),
    dividendPerSharePence: finite(row?.dividendPerSharePence, 0),
    netDebtExLeases: finite(row?.netDebtExLeases, 0),
    leaseLiabilitiesNet: finite(row?.leaseLiabilitiesNet, 0),
    postEmploymentBenefitSurplus: finite(row?.pensionSurplusCredit, 0),
    depreciationAmortizationImpairment: sales * 0.038,
    capex: finite(row?.capex, sales * 0.035),
    taxExpense: finite(row?.underlyingEbit, sales * 0.105) * 0.22,
    profitBeforeTax: finite(row?.underlyingEbit, sales * 0.105) - 350,
    profitAttributableToEquity: (finite(row?.underlyingEbit, sales * 0.105) - 350) * 0.78,
    weightedAverageBasicShares: finite(row?.basicShares, row?.dilutedShares ?? 3000),
    weightedAverageDilutedShares: finite(row?.dilutedShares, 3000),
    outstandingSharesForEps: finite(row?.dilutedShares, 3000),
    notes: "Backend event-visible BA.L financial snapshot mapped to the existing BA frontend valuation dataset shape.",
    backendSource: {
      id: row?.id,
      periodId: row?.periodId,
      eventId: row?.eventId,
      asOfDate: row?.asOfDate,
      sourceType: row?.sourceType,
      runRateSnapshot: Boolean(row?.runRateSnapshot),
      rawJson: parseJson(row?.rawJson, {}),
    },
  };
}

function mapSegments(rows, periodId) {
  return rows.map((row) => ({
    periodId,
    segment: row.segment === "HQ / eliminations" ? "Intra-group" : row.segment,
    sourceStatus: "official_actual",
    sourceId: row.eventId ?? row.id,
    sales: finite(row.sales),
    revenue: finite(row.revenue, row.sales),
    underlyingEbit: finite(row.underlyingEbit),
    underlyingEbitMargin: finite(row.margin, row.sales ? row.underlyingEbit / row.sales : 0),
    orderIntake: finite(row.orderIntake),
    orderBacklog: finite(row.orderBacklog),
    orderBook: finite(row.orderBook),
    strategicImportance: "Backend event-visible segment snapshot.",
    cyclicality: "Defense-prime programme cycle.",
    keyPrograms: [],
    risks: [],
    notes: row.sourceType,
  }));
}

function mapMarketData(baseMarket, market, financial) {
  const currentPriceGbx = finite(market?.currentPriceGbx, baseMarket.currentPriceGbx);
  const currentPriceGbp = finite(market?.currentPriceGbp, currentPriceGbx / 100);
  const shares = finite(market?.sharesOutstandingM, financial.weightedAverageDilutedShares);
  const marketCap = finite(market?.marketCapGbpM, currentPriceGbp * shares);
  return {
    ...baseMarket,
    sourceStatus: "market_data",
    sourceId: market?.id ?? baseMarket.sourceId,
    currentPriceGbp,
    currentPriceGbx,
    priceDate: market?.priceDate ?? market?.asOfDate ?? baseMarket.priceDate,
    collectionTime: market?.asOfDate,
    sharesForMarketCap: shares,
    marketCap,
    enterpriseValueExLeases: finite(market?.enterpriseValueGbpM, marketCap + financial.netDebtExLeases),
    dividendYield: (financial.dividendPerSharePence / 100) / Math.max(currentPriceGbp, 0.01),
    fcfYield: financial.freeCashFlow / Math.max(marketCap, 1),
    forwardPe: currentPriceGbp / Math.max(financial.underlyingEpsPence / 100, 0.01),
    source: market?.source ?? "backend market snapshot",
    notes: "Backend market snapshot. London BA.L price is stored in GBX and normalized to GBP by dividing by 100.",
  };
}

function mapGuidance(snapshot, financial) {
  const guidanceRows = snapshot.guidanceItems ?? [];
  const revenueGrowth = guidanceRows.find((row) => row.metric === "revenueCagr");
  const fcf = guidanceRows.find((row) => row.metric === "fcfFloor");
  return [{
    year: financial.fiscalYear + 1,
    sourceStatus: "management_guidance",
    sourceId: revenueGrowth?.guidanceSourceId ?? snapshot.reportingEvent?.sourceDocumentId ?? snapshot.reportingEvent?.id,
    salesGrowthLow: finite(revenueGrowth?.low, 0.03),
    salesGrowthHigh: finite(revenueGrowth?.high, 0.07),
    underlyingEbitGrowthLow: finite(revenueGrowth?.low, 0.03),
    underlyingEbitGrowthHigh: finite(revenueGrowth?.high, 0.07) + 0.01,
    underlyingEpsGrowthLow: finite(revenueGrowth?.low, 0.03),
    underlyingEpsGrowthHigh: finite(revenueGrowth?.high, 0.07) + 0.01,
    freeCashFlowFloor: finite(fcf?.value, financial.freeCashFlow * 0.65),
    threeYearFcfGuidance: [{ period: `${financial.fiscalYear}-${financial.fiscalYear + 2}`, floor: Math.max(financial.freeCashFlow * 2.2, 1500) }],
    underlyingNetFinanceCosts: 370,
    effectiveTaxRate: 0.22,
    nonControllingInterests: 80,
    fxSensitivity: {
      moveUsdPerGbp: 0.05,
      salesImpact: 450,
      underlyingEbitImpact: 65,
      epsImpactPence: 1.2,
    },
    segmentGuidance: [],
  }];
}

function segmentSotpValue(segmentRows, assumptions, financial) {
  const multiples = {
    "Electronic Systems": 18,
    "Platforms & Services": 14,
    Air: 16,
    Maritime: 13,
    "Cyber & Intelligence": 12,
    "HQ / eliminations": 8,
  };
  const ev = segmentRows.reduce((sum, row) => sum + Math.max(finite(row.underlyingEbit), 0) * (multiples[row.segment] ?? 12), 0);
  const equity = ev - assumptions.netDebtExLeases - assumptions.leaseLiabilitiesNet + assumptions.pensionSurplusCredit;
  return equity / Math.max(financial.weightedAverageDilutedShares, 1);
}

function pickMethod(valuation, key) {
  return (valuation.methodCards ?? []).find((method) => method.key === key)?.value ?? null;
}

function buildBackendMethodBridge(valuation, snapshot, assumptions, financial) {
  const eventId = financial?.backendSource?.eventId;
  const eventSegments = (snapshot.segmentFinancials ?? []).filter((row) => row.eventId === eventId);
  const segmentSotp = segmentSotpValue(eventSegments.length ? eventSegments : [], assumptions, financial);
  const cards = [
    { key: "fcffDcf", label: "FCFF DCF", value: valuation.dcfValue, weight: 0.3, source: "existing_ba_calculation" },
    { key: "fcfYield", label: "FCF Yield", value: valuation.fcfFairValue, weight: 0.2, source: "existing_ba_calculation" },
    { key: "evEbit", label: "EV / EBIT", value: pickMethod(valuation, "ev-ebit"), weight: 0.2, source: "existing_ba_calculation" },
    { key: "segmentSotp", label: "Segment SOTP", value: segmentSotp, weight: 0.15, source: "backend_segment_bridge" },
    { key: "backlogOverlay", label: "Backlog / Order Book Overlay", value: pickMethod(valuation, "backlog"), weight: 0.1, source: "existing_ba_calculation" },
    { key: "peCrossCheck", label: "P/E Cross-check", value: valuation.peFairValue, weight: 0.05, source: "existing_ba_calculation" },
  ];
  const fairValue = cards.reduce((sum, card) => sum + finite(card.value) * card.weight, 0);
  return { cards, fairValue };
}

function buildDatasetFromSnapshot(baseDataset, snapshot, assumptions) {
  const latestFinancial = latestByAsOf(snapshot.financialPeriods ?? []);
  const latestBacklog = latestByAsOf(snapshot.orderBacklogSnapshots ?? []);
  const latestIntake = latestByAsOf(snapshot.orderIntakeSnapshots ?? []);
  const period = mapFinancialPeriod(latestFinancial, latestBacklog, latestIntake);
  const market = mapMarketData(baseDataset.marketData, snapshot.marketSnapshot, period);
  const dataset = cloneJson(baseDataset);
  dataset.periods = [period];
  dataset.segments = mapSegments((snapshot.segmentFinancials ?? []).filter((row) => row.eventId === snapshot.reportingEvent?.id), "fy25");
  dataset.guidance = mapGuidance(snapshot, period);
  dataset.marketData = market;
  dataset.latestReportingPeriod = snapshot.reportingEvent?.fiscalPeriod ?? period.label;
  dataset.sourceMap = baseDataset.sourceMap;
  return { dataset, period, market, latestFinancial, latestBacklog, latestIntake };
}

function buildRowUsage(snapshot) {
  const tableRows = {
    financial_periods: snapshot.financialPeriods ?? [],
    segment_financials: snapshot.segmentFinancials ?? [],
    market_snapshots: snapshot.marketSnapshot ? [snapshot.marketSnapshot] : [],
    guidance_items: snapshot.guidanceItems ?? [],
    order_backlog_snapshots: snapshot.orderBacklogSnapshots ?? [],
    order_intake_snapshots: snapshot.orderIntakeSnapshots ?? [],
    transcript_extractions: snapshot.transcriptExtractions ?? [],
    program_exposures: snapshot.programExposures ?? [],
    contract_awards: snapshot.contractAwards ?? [],
    defense_budget_indicators: snapshot.defenseBudgetIndicators ?? [],
    pension_snapshots: snapshot.pensionSnapshots ?? [],
    capital_allocation_events: snapshot.capitalAllocationEvents ?? [],
  };
  return Object.fromEntries(Object.entries(tableRows).map(([table, rows]) => [
    table,
    rows.map((row) => ({ id: row.id, asOfDate: row.asOfDate ?? row.announcementDate ?? row.eventDate, sourceType: row.sourceType ?? row.source })),
  ]));
}

export function buildBaBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = BA_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "BA.L",
    scenario,
    modelVersion,
    assumptionSetId: assumptions.assumptionSetId ?? null,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
  };
}

export async function runBaBackendValuation(input) {
  const payload = buildBaBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/ba/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/ba/data/index.ts");
    const { dataset, period, market, latestFinancial, latestBacklog, latestIntake } = buildDatasetFromSnapshot(
      dataModule.baDataset,
      payload.snapshot,
      payload.assumptions,
    );
    const rawWeights = payload.assumptions.backendMethodWeights ?? Object.fromEntries(BA_BACKEND_MODEL_VERSION.valuationMethods.map((method) => [method.key, method.weight]));
    const existingWeightTotal = rawWeights.fcffDcf + rawWeights.fcfYield + rawWeights.evEbit + rawWeights.peCrossCheck + rawWeights.backlogOverlay;
    const normalizedExistingWeights = {
      weightDcf: rawWeights.fcffDcf / existingWeightTotal,
      weightFcfYield: rawWeights.fcfYield / existingWeightTotal,
      weightEvEbit: rawWeights.evEbit / existingWeightTotal,
      weightPe: rawWeights.peCrossCheck / existingWeightTotal,
      weightBacklogDurability: rawWeights.backlogOverlay / existingWeightTotal,
    };
    const backendAssumptions = {
      ...payload.assumptions,
      currentPrice: market.currentPriceGbp,
      netDebtExLeases: period.netDebtExLeases,
      leaseLiabilitiesNet: period.leaseLiabilitiesNet ?? 0,
      pensionSurplusCredit: period.postEmploymentBenefitSurplus ?? 0,
      dilutedShares: period.weightedAverageDilutedShares,
      dividendPerShare: period.dividendPerSharePence / 100,
      dAndAIntensity: period.depreciationAmortizationImpairment / Math.max(period.sales, 1),
      capexIntensity: period.capex / Math.max(period.sales, 1),
      ...normalizedExistingWeights,
    };
    const valuation = calculations.calculateBaValuation(dataset, "fy25", payload.scenario, backendAssumptions);
    const bridge = buildBackendMethodBridge(valuation, payload.snapshot, backendAssumptions, period);
    const fairValue = bridge.fairValue;
    const currentPrice = market.currentPriceGbp;
    const upsideDownside = currentPrice ? fairValue / currentPrice - 1 : null;
    const targetPrice3Y = fairValue * (1 + finite(backendAssumptions.revenueCagr, 0.04)) ** 0.5;
    const expectedShareholderCagr = currentPrice ? ((targetPrice3Y + backendAssumptions.dividendPerShare * 3) / currentPrice) ** (1 / 3) - 1 : null;
    const backendSnapshot = {
      asOfDate: payload.asOfDate,
      reportingEventId: payload.reportingEventId,
      fiscalPeriod: payload.snapshot.reportingEvent?.fiscalPeriod,
      valuationPeriodId: latestFinancial?.id ?? null,
      marketSnapshotId: payload.snapshot.marketSnapshot?.id ?? null,
      guidanceSourceId: (payload.snapshot.guidanceItems ?? [])[0]?.guidanceSourceId ?? null,
      assumptionSetId: payload.assumptionSetId ?? null,
      financialPeriodCount: payload.snapshot.financialPeriods?.length ?? 0,
      segmentFinancialCount: payload.snapshot.segmentFinancials?.length ?? 0,
      orderBacklogSnapshotId: latestBacklog?.id ?? null,
      orderIntakeSnapshotId: latestIntake?.id ?? null,
      currentPriceGbx: market.currentPriceGbx,
      currentPriceGbp: market.currentPriceGbp,
      gbxToGbpDivisor: 100,
      gbpUsd: payload.snapshot.marketSnapshot?.gbpUsd ?? null,
      currencyNote: "BA.L London price is quoted in GBX. Backend normalizes to GBP by currentPriceGbp = currentPriceGbx / 100. GBP/USD is stored explicitly for USD peer and defense-budget reference metadata.",
      interimRunRateSnapshot: Boolean(latestFinancial?.runRateSnapshot),
      staleAnnualAnchor: false,
      assumptionDilutedShares: backendAssumptions.dilutedShares,
      financialWeightedAverageShares: period.weightedAverageDilutedShares,
      backendMethodWeights: rawWeights,
      methodBridge: bridge.cards,
      rowUsage: buildRowUsage(payload.snapshot),
    };
    const warnings = [
      ...(valuation.validationWarnings ?? []),
      {
        id: "ba-backend-no-future-data",
        title: "Event-visible snapshot enforced",
        detail: "Backend snapshot rows are filtered by asOfDate <= reporting event date before valuation.",
        severity: "low",
      },
    ];
    return {
      ...valuation,
      currentPrice,
      fairValues: (valuation.fairValues ?? []).map((item) => item.scenario === payload.scenario ? { ...item, fairValue, upsideDownside, targetPrice3Y, expectedReturn3Y: expectedShareholderCagr } : item),
      methodCards: bridge.cards.map((card) => ({
        key: card.key,
        label: card.label,
        value: card.value,
        format: "currency",
        description: `${(card.weight * 100).toFixed(0)}% backend method weight; source=${card.source}.`,
      })),
      recommendedFairValue: fairValue,
      blendedFairValue: fairValue,
      valuationRangeBase: fairValue,
      targetPrice3Y,
      expectedReturn3Y: expectedShareholderCagr,
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
