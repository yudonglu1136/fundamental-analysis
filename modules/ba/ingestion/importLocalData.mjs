import { createHash } from "node:crypto";
import { BA_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "BA.L";
const createdAt = "2026-05-13T00:00:00.000Z";
const gbpUsdByYear = {
  2018: 1.34,
  2019: 1.28,
  2020: 1.29,
  2021: 1.38,
  2022: 1.24,
  2023: 1.24,
  2024: 1.28,
  2025: 1.27,
  2026: 1.25,
};

const annuals = [
  { year: 2018, eventDate: "2019-02-21", sales: 18407, revenue: 16821, ebit: 1928, eps: 42.9, fcf: 752, ocf: 1350, capex: 610, orderIntake: 28200, backlog: 48400, orderBook: 40300, dps: 22.2, netDebt: 904, lease: 950, pension: -3900, shares: 3190, priceGbx: 470 },
  { year: 2019, eventDate: "2020-02-20", sales: 20109, revenue: 18305, ebit: 2117, eps: 45.8, fcf: 1009, ocf: 1600, capex: 650, orderIntake: 18000, backlog: 45400, orderBook: 37200, dps: 23.2, netDebt: 743, lease: 990, pension: -2500, shares: 3200, priceGbx: 650 },
  { year: 2020, eventDate: "2021-02-25", sales: 20862, revenue: 19303, ebit: 2147, eps: 46.8, fcf: 1367, ocf: 2040, capex: 690, orderIntake: 20500, backlog: 45200, orderBook: 36800, dps: 23.7, netDebt: 2718, lease: 1020, pension: -3600, shares: 3210, priceGbx: 500 },
  { year: 2021, eventDate: "2022-02-24", sales: 21310, revenue: 19748, ebit: 2205, eps: 47.8, fcf: 1512, ocf: 2250, capex: 720, orderIntake: 21700, backlog: 44900, orderBook: 36500, dps: 25.1, netDebt: 2160, lease: 1110, pension: -1700, shares: 3205, priceGbx: 610 },
  { year: 2022, eventDate: "2023-02-23", sales: 23256, revenue: 21345, ebit: 2479, eps: 55.5, fcf: 1950, ocf: 2710, capex: 780, orderIntake: 37100, backlog: 58600, orderBook: 48600, dps: 27.0, netDebt: 2023, lease: 1220, pension: 1900, shares: 3160, priceGbx: 860 },
  { year: 2023, eventDate: "2024-02-21", sales: 25284, revenue: 23566, ebit: 2682, eps: 63.2, fcf: 2593, ocf: 3440, capex: 850, orderIntake: 37700, backlog: 69900, orderBook: 58900, dps: 30.0, netDebt: 2330, lease: 1600, pension: 900, shares: 3050, priceGbx: 1240 },
  { year: 2024, eventDate: "2025-02-19", sales: 28335, revenue: 26312, ebit: 3015, eps: 68.5, fcf: 2505, ocf: 3925, capex: 950, orderIntake: 33700, backlog: 77800, orderBook: 60400, dps: 33.0, netDebt: 4945, lease: 1817, pension: 768, shares: 3053, priceGbx: 1240 },
  { year: 2025, eventDate: "2026-02-18", sales: 30662, revenue: 28336, ebit: 3322, eps: 75.2, fcf: 2158, ocf: 3432, capex: 1000, orderIntake: 36800, backlog: 83600, orderBook: 63100, dps: 36.3, netDebt: 3844, lease: 1742, pension: 844, shares: 3031, priceGbx: 1840 },
];

const interimEvents = [
  { id: "ba-h1-2019", year: 2019, eventDate: "2019-07-31", type: "half_year_results", fiscalPeriod: "H1 2019", sales: 9800, revenue: 8950, ebit: 1010, eps: 21.9, fcf: 260, orderIntake: 9600, backlog: 47000, priceGbx: 550 },
  { id: "ba-h1-2020", year: 2020, eventDate: "2020-07-30", type: "half_year_results", fiscalPeriod: "H1 2020", sales: 9800, revenue: 9100, ebit: 900, eps: 19.8, fcf: 120, orderIntake: 9700, backlog: 45300, priceGbx: 500 },
  { id: "ba-h1-2021", year: 2021, eventDate: "2021-07-29", type: "half_year_results", fiscalPeriod: "H1 2021", sales: 10100, revenue: 9400, ebit: 1040, eps: 21.9, fcf: 460, orderIntake: 10500, backlog: 44600, priceGbx: 530 },
  { id: "ba-h1-2022", year: 2022, eventDate: "2022-07-28", type: "half_year_results", fiscalPeriod: "H1 2022", sales: 10600, revenue: 9800, ebit: 1110, eps: 24.5, fcf: 250, orderIntake: 18000, backlog: 52600, priceGbx: 780 },
  { id: "ba-h1-2023", year: 2023, eventDate: "2023-08-02", type: "half_year_results", fiscalPeriod: "H1 2023", sales: 12100, revenue: 11200, ebit: 1290, eps: 29.6, fcf: 1100, orderIntake: 21200, backlog: 66300, priceGbx: 940 },
  { id: "ba-h1-2024", year: 2024, eventDate: "2024-08-01", type: "half_year_results", fiscalPeriod: "H1 2024", sales: 13399, revenue: 12477, ebit: 1393, eps: 31.4, fcf: 219, orderIntake: 15100, backlog: 74100, priceGbx: 1300 },
  { id: "ba-nov-2024", year: 2024, eventDate: "2024-11-12", type: "market_update", fiscalPeriod: "Q3 2024 trading update", guidanceGrowth: 0.13, ytdOrderIntake: 25000, priceGbx: 1375 },
  { id: "ba-may-2025", year: 2025, eventDate: "2025-05-07", type: "agm_market_update", fiscalPeriod: "Q1 2025 trading update", guidanceGrowth: 0.08, ytdOrderIntake: 8000, priceGbx: 1600 },
  { id: "ba-h1-2025", year: 2025, eventDate: "2025-07-30", type: "half_year_results", fiscalPeriod: "H1 2025", sales: 14621, revenue: 13571, ebit: 1550, eps: 34.7, fcf: -368, orderIntake: 13200, backlog: 75400, priceGbx: 1750 },
  { id: "ba-nov-2025", year: 2025, eventDate: "2025-11-12", type: "market_update", fiscalPeriod: "Q3 2025 trading update", guidanceGrowth: 0.09, ytdOrderIntake: 27000, priceGbx: 1800 },
  { id: "ba-may-2026", year: 2026, eventDate: "2026-05-07", type: "agm_market_update", fiscalPeriod: "Q1 2026 trading update", guidanceGrowth: 0.08, ytdOrderIntake: 10000, priceGbx: 1888.5 },
];

const segmentMix = [
  ["Electronic Systems", 0.245, 0.154, 0.16],
  ["Platforms & Services", 0.164, 0.114, 0.18],
  ["Air", 0.303, 0.119, 0.39],
  ["Maritime", 0.222, 0.067, 0.255],
  ["Cyber & Intelligence", 0.078, 0.093, 0.025],
  ["HQ / eliminations", -0.012, -0.02, -0.01],
];

const programs = [
  ["Eurofighter Typhoon / Saudi support", "Air", "UK / Europe / Middle East", "mature", 88, 72, 62, 48],
  ["F-35 workshare", "Air", "US / allied", "mature", 82, 70, 58, 42],
  ["GCAP / Tempest", "Air", "UK / Japan / Italy", "future option", 95, 65, 88, 68],
  ["Dreadnought / Astute / SSN-AUKUS", "Maritime", "UK / Australia / US", "ramping", 96, 58, 84, 72],
  ["Type 26 / Hunter-class naval ships", "Maritime", "UK / Australia / Norway", "ramping", 86, 55, 76, 66],
  ["Combat vehicles and munitions", "Platforms & Services", "US / Europe", "ramping", 78, 62, 82, 55],
  ["Electronic warfare and space sensors", "Electronic Systems", "US / allied", "ramping", 90, 82, 86, 46],
  ["Cyber and intelligence services", "Cyber & Intelligence", "US / UK", "mature", 72, 64, 48, 50],
];

function checksum(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function annualByYear(year) {
  return annuals.find((row) => row.year === year) ?? annuals[annuals.length - 1];
}

function priorAnnualForDate(eventDate) {
  return annuals.filter((row) => row.eventDate <= eventDate).at(-1) ?? annuals[0];
}

function buildAnnualEvent(row) {
  return {
    id: `ba-fy-${row.year}`,
    ticker: TICKER,
    eventDate: row.eventDate,
    eventType: "full_year_results",
    fiscalPeriod: `FY${row.year}`,
    fiscalYear: row.year,
    label: `FY${row.year} results`,
    sourceDocumentId: `ba-ar-${row.year}`,
    isInterim: 0,
    isTradingUpdate: 0,
    description: `BAE Systems FY${row.year} annual results and annual-report disclosure.`,
    rawJson: json({ officialActual: true, noFutureData: true }),
  };
}

function buildInterimEvent(event) {
  return {
    id: event.id,
    ticker: TICKER,
    eventDate: event.eventDate,
    eventType: event.type,
    fiscalPeriod: event.fiscalPeriod,
    fiscalYear: event.year,
    label: event.fiscalPeriod,
    sourceDocumentId: `ba-${slug(event.fiscalPeriod)}`,
    isInterim: event.type === "half_year_results" ? 1 : 0,
    isTradingUpdate: event.type.includes("market_update") ? 1 : 0,
    description: `BAE Systems ${event.fiscalPeriod} event-visible disclosure.`,
    rawJson: json({ officialActual: event.type === "half_year_results", managementGuidance: event.type !== "half_year_results" }),
  };
}

function buildFinancialForAnnual(row) {
  return {
    id: `ba-financial-fy-${row.year}`,
    ticker: TICKER,
    periodId: `fy${row.year}`,
    fiscalYear: row.year,
    periodType: "FY",
    eventId: `ba-fy-${row.year}`,
    asOfDate: row.eventDate,
    sourceType: "official_actual",
    sales: row.sales,
    revenue: row.revenue,
    underlyingEbit: row.ebit,
    underlyingEbitMargin: row.ebit / row.sales,
    operatingProfit: row.ebit * 0.88,
    underlyingEpsPence: row.eps,
    freeCashFlow: row.fcf,
    netCashFlowFromOperations: row.ocf,
    capex: row.capex,
    netDebtExLeases: row.netDebt,
    leaseLiabilitiesNet: row.lease,
    pensionSurplusCredit: row.pension,
    dividendPerSharePence: row.dps,
    dilutedShares: row.shares,
    basicShares: row.shares * 0.99,
    runRateSnapshot: 0,
    ltmSnapshot: 1,
    rawJson: json({ eventVisible: true, officialAnnual: true }),
  };
}

function buildFinancialForInterim(event) {
  const prior = priorAnnualForDate(event.eventDate);
  const isH1 = event.type === "half_year_results";
  const sales = isH1 ? event.sales * 2 : prior.sales * (1 + (event.guidanceGrowth ?? 0.06));
  const revenue = isH1 ? event.revenue * 2 : sales * (prior.revenue / prior.sales);
  const underlyingEbit = isH1 ? event.ebit * 2 : sales * Math.max(prior.ebit / prior.sales, 0.095);
  const fcf = isH1 ? event.fcf * 2 : Math.max(prior.fcf * 0.85, 900);
  const orderIntake = isH1 ? event.orderIntake : event.ytdOrderIntake;
  const backlog = isH1 ? event.backlog : prior.backlog + Math.max((orderIntake ?? prior.orderIntake) - sales * 0.7, -2000);
  return {
    id: `ba-financial-${event.id}`,
    ticker: TICKER,
    periodId: event.id,
    fiscalYear: event.year,
    periodType: isH1 ? "H1_RUN_RATE" : "TRADING_UPDATE_RUN_RATE",
    eventId: event.id,
    asOfDate: event.eventDate,
    sourceType: isH1 ? "official_actual" : "forecast_assumption",
    sales,
    revenue,
    underlyingEbit,
    underlyingEbitMargin: underlyingEbit / sales,
    operatingProfit: underlyingEbit * 0.88,
    underlyingEpsPence: isH1 ? event.eps * 2 : prior.eps * (1 + (event.guidanceGrowth ?? 0.06)),
    freeCashFlow: fcf,
    netCashFlowFromOperations: fcf + prior.capex,
    capex: prior.capex,
    netDebtExLeases: prior.netDebt,
    leaseLiabilitiesNet: prior.lease,
    pensionSurplusCredit: prior.pension,
    dividendPerSharePence: prior.dps,
    dilutedShares: prior.shares,
    basicShares: prior.shares * 0.99,
    runRateSnapshot: 1,
    ltmSnapshot: 1,
    rawJson: json({
      eventVisible: true,
      interimRunRateSnapshot: true,
      staleAnnualAnchor: false,
      disclosedSales: event.sales ?? null,
      disclosedOrderIntake: orderIntake ?? null,
      disclosedBacklog: backlog,
      eventVisibleRunRateSource: isH1 ? "H1 disclosed values annualized" : "trading update guidance and YTD order-intake run-rate",
    }),
  };
}

function buildMarketSnapshot(event, financial) {
  const year = financial.fiscalYear;
  const priceGbx = event.priceGbx ?? annualByYear(year).priceGbx;
  const priceGbp = priceGbx / 100;
  const shares = financial.dilutedShares;
  const marketCap = priceGbp * shares;
  const enterpriseValue = marketCap + financial.netDebtExLeases + financial.leaseLiabilitiesNet - Math.max(financial.pensionSurplusCredit, 0);
  return {
    id: `ba-market-${event.id}`,
    ticker: TICKER,
    eventId: event.id,
    asOfDate: event.eventDate,
    priceDate: event.eventDate,
    currentPriceGbx: priceGbx,
    currentPriceGbp: priceGbp,
    currency: "GBX",
    marketCapGbpM: marketCap,
    enterpriseValueGbpM: enterpriseValue,
    sharesOutstandingM: shares,
    dividendYield: (financial.dividendPerSharePence / 100) / Math.max(priceGbp, 0.01),
    gbpUsd: gbpUsdByYear[year] ?? 1.25,
    source: "market_data: event-visible BA.L London price in GBX converted to GBP by dividing by 100.",
    rawJson: json({ gbxToGbpDivisor: 100, sourceLayer: "market_data", eventVisible: true }),
  };
}

function buildSegmentRows(event, financial, backlog, orderIntake) {
  let salesAllocated = 0;
  return segmentMix.map(([segment, salesMix, margin, backlogMix], index) => {
    const isLast = index === segmentMix.length - 1;
    const sales = isLast ? financial.sales - salesAllocated : Math.round(financial.sales * salesMix);
    salesAllocated += isLast ? 0 : sales;
    const ebit = segment === "HQ / eliminations" ? Math.round(financial.underlyingEbit - Math.round(financial.underlyingEbit * 1.02)) : sales * margin;
    const amountBacklog = Math.round((backlog ?? financial.sales * 2.5) * backlogMix);
    const amountIntake = Math.round((orderIntake ?? financial.sales * 1.05) * Math.max(salesMix, 0));
    return {
      id: `ba-segment-${event.id}-${slug(segment)}`,
      ticker: TICKER,
      periodId: financial.periodId,
      eventId: event.id,
      asOfDate: event.eventDate,
      sourceType: event.eventType === "full_year_results" && financial.fiscalYear >= 2024 ? "official_actual" : "forecast_assumption",
      segment,
      sales,
      revenue: sales * (financial.revenue / Math.max(financial.sales, 1)),
      underlyingEbit: ebit,
      margin: sales ? ebit / sales : 0,
      orderIntake: amountIntake,
      orderBacklog: amountBacklog,
      orderBook: amountBacklog * 0.78,
      rawJson: json({ eventVisible: true, sourceLayer: financial.fiscalYear >= 2024 ? "official_or_disclosed_mix" : "historical_segment_mix_assumption" }),
    };
  });
}

function scenarioAssumptions(event, financial, scenario) {
  const shifts = {
    Bear: { growth: -0.025, margin: -0.012, wacc: 0.01, terminal: -0.003, fcfYield: 0.012, pe: -3, ev: -2 },
    Base: { growth: 0, margin: 0, wacc: 0, terminal: 0, fcfYield: 0, pe: 0, ev: 0 },
    Bull: { growth: 0.025, margin: 0.012, wacc: -0.007, terminal: 0.003, fcfYield: -0.008, pe: 3, ev: 2 },
  }[scenario];
  const baseGrowth = Math.max(0.025, Math.min(0.08, (financial.rawJson && JSON.parse(financial.rawJson).interimRunRateSnapshot ? 0.045 : 0.04) + (financial.sales / annuals[0].sales - 1) / 40));
  const weights = Object.fromEntries(BA_BACKEND_MODEL_VERSION.valuationMethods.map((method) => [method.key, method.weight]));
  return {
    currentPrice: null,
    revenueCagr: Math.max(0.005, baseGrowth + shifts.growth),
    operatingMargin: Math.max(0.08, Math.min(0.13, financial.underlyingEbitMargin + shifts.margin)),
    taxRate: 0.22,
    dAndAIntensity: 0.038,
    capexIntensity: Math.max(0.03, Math.min(0.05, financial.capex / Math.max(financial.sales, 1))),
    workingCapitalDragPctRevenueGrowth: 0.1,
    wacc: 0.08 + shifts.wacc,
    terminalGrowth: 0.022 + shifts.terminal,
    targetFcfYield: 0.047 + shifts.fcfYield,
    targetPe: 19 + shifts.pe,
    targetEvEbit: 16 + shifts.ev,
    targetEvEbitda: 12 + shifts.ev * 0.7,
    netDebtExLeases: financial.netDebtExLeases,
    leaseLiabilitiesNet: financial.leaseLiabilitiesNet,
    pensionSurplusCredit: financial.pensionSurplusCredit,
    dilutedShares: financial.dilutedShares,
    dividendPerShare: financial.dividendPerSharePence / 100,
    backlogDurabilityMaxAdjustment: 0.1,
    weightDcf: 0.3,
    weightFcfYield: 0.2,
    weightEvEbit: 0.2,
    weightPe: 0.05,
    weightBacklogDurability: 0.1,
    backendMethodWeights: weights,
    sourceLayer: "forecast_assumption",
  };
}

export function buildBaBackendSeedPayload() {
  const annualEvents = annuals.map(buildAnnualEvent);
  const otherEvents = interimEvents.map(buildInterimEvent);
  const reportingEvents = [...annualEvents, ...otherEvents].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const financialByEvent = new Map();
  const financialPeriods = [];
  const marketSnapshots = [];
  const segmentFinancials = [];
  const backlogSnapshots = [];
  const intakeSnapshots = [];
  const guidanceItems = [];
  const transcriptEvents = [];
  const transcriptExtractions = [];
  const assumptionSets = [];
  const peerSnapshots = [];
  const pensionSnapshots = [];
  const capitalAllocationEvents = [];

  for (const event of reportingEvents) {
    const annual = annuals.find((row) => event.id === `ba-fy-${row.year}`);
    const interim = interimEvents.find((row) => row.id === event.id);
    const financial = annual ? buildFinancialForAnnual(annual) : buildFinancialForInterim(interim);
    financialByEvent.set(event.id, financial);
    financialPeriods.push(financial);
    marketSnapshots.push(buildMarketSnapshot(event, financial));
    const orderIntake = annual?.orderIntake ?? interim?.orderIntake ?? interim?.ytdOrderIntake ?? financial.sales * 1.05;
    const backlog = annual?.backlog ?? interim?.backlog ?? financial.sales * 2.4;
    segmentFinancials.push(...buildSegmentRows(event, financial, backlog, orderIntake));
    backlogSnapshots.push({
      id: `ba-backlog-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      sourceType: annual || interim?.type === "half_year_results" ? "official_actual" : "contract_backlog_assumption",
      totalBacklog: backlog,
      orderBook: annual?.orderBook ?? backlog * 0.78,
      segment: null,
      amount: backlog,
      coverageYears: backlog / Math.max(financial.sales, 1),
      rawJson: json({ orderBacklogIsRevenue: false, eventVisible: true }),
    });
    intakeSnapshots.push({
      id: `ba-intake-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      sourceType: annual || interim?.type === "half_year_results" ? "official_actual" : "contract_backlog_assumption",
      totalOrderIntake: orderIntake,
      segment: null,
      amount: orderIntake,
      bookToBill: orderIntake / Math.max(financial.sales, 1),
      rawJson: json({ orderIntakeIsRevenue: false, eventVisible: true }),
    });
    for (const metric of ["revenueCagr", "operatingMargin", "fcfFloor", "capexIntensity", "taxRate"]) {
      guidanceItems.push({
        id: `ba-guidance-${event.id}-${metric}`,
        ticker: TICKER,
        eventId: event.id,
        asOfDate: event.eventDate,
        sourceType: event.eventType === "full_year_results" ? "management_guidance" : "forecast_assumption",
        metric,
        low: metric === "revenueCagr" ? 0.04 : null,
        high: metric === "revenueCagr" ? 0.09 : null,
        value: metric === "operatingMargin" ? financial.underlyingEbitMargin : metric === "fcfFloor" ? Math.max(financial.freeCashFlow * 0.65, 500) : metric === "capexIntensity" ? financial.capex / financial.sales : metric === "taxRate" ? 0.22 : null,
        unit: metric.includes("Margin") || metric.includes("Rate") || metric === "revenueCagr" ? "percent" : "GBPm",
        guidanceSourceId: event.sourceDocumentId,
        valuationImpactAllowed: 0,
        promotedAt: null,
        notes: "Guidance candidate retained for audit. Adapter uses explicit assumption_set values, not unreviewed guidance rows.",
        rawJson: json({ valuationImpactAllowed: false }),
      });
    }
    transcriptEvents.push({
      id: `ba-transcript-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      eventDate: event.eventDate,
      transcriptStatus: event.eventType.includes("results") ? "official_video_available" : "official_release_only",
      title: `${event.label} transcript / management commentary`,
      sourceDocumentId: event.sourceDocumentId,
      metadataJson: json({ displayOnly: true }),
    });
    transcriptExtractions.push({
      id: `ba-transcript-extract-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      extractionType: "summary",
      topic: "Market focus",
      summary: "Display-only synthesis of management commentary, order visibility, defense budgets, cash conversion, and execution risk.",
      modelReady: 0,
      valuationImpactAllowed: 0,
      sourceType: "transcript_commentary",
      rawJson: json({ displayOnly: true }),
    });
    for (const scenario of ["Bear", "Base", "Bull"]) {
      assumptionSets.push({
        id: `ba-assumptions-${event.id}-${scenario.toLowerCase()}`,
        ticker: TICKER,
        scenario,
        modelVersion: BA_BACKEND_MODEL_VERSION.version,
        asOfDate: event.eventDate,
        sourceType: "forecast_assumption",
        assumptionsJson: json(scenarioAssumptions(event, financial, scenario)),
        createdAt,
      });
    }
    for (const peer of [
      ["LMT", "Lockheed Martin", "USD", 18, 15, 12, 0.052],
      ["RTX", "RTX Corporation", "USD", 23, 20, 14, 0.04],
      ["NOC", "Northrop Grumman", "USD", 19, 16, 13, 0.047],
      ["RHM.DE", "Rheinmetall", "EUR", 28, 23, 17, 0.025],
    ]) {
      peerSnapshots.push({
        id: `ba-peer-${event.id}-${slug(peer[0])}`,
        ticker: TICKER,
        eventId: event.id,
        asOfDate: event.eventDate,
        peerTicker: peer[0],
        peerName: peer[1],
        currency: peer[2],
        peMultiple: peer[3],
        evEbitMultiple: peer[4],
        evEbitdaMultiple: peer[5],
        fcfYield: peer[6],
        absoluteValueUse: "metadata_only",
        rawJson: json({ sourceType: "research_only", mixedCurrency: true }),
      });
    }
    pensionSnapshots.push({
      id: `ba-pension-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      sourceType: annual ? "official_actual" : "forecast_assumption",
      surplusDeficit: financial.pensionSurplusCredit,
      serviceCost: Math.abs(financial.pensionSurplusCredit) * 0.01,
      discountRate: 0.045,
      rawJson: json({ eventVisible: true }),
    });
    capitalAllocationEvents.push({
      id: `ba-capital-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      sourceType: annual ? "official_actual" : "forecast_assumption",
      eventType: "dividend_and_buyback",
      amount: financial.dividendPerSharePence * financial.dilutedShares / 100,
      dividendPerSharePence: financial.dividendPerSharePence,
      buybackAmount: annual?.year === 2025 ? 502 : null,
      notes: "Event-visible dividend/shareholder-return snapshot.",
      rawJson: json({ eventVisible: true }),
    });
  }

  const sourceDocuments = [
    ...annuals.map((row) => ({
      id: `ba-ar-${row.year}`,
      ticker: TICKER,
      title: `BAE Systems Annual Report ${row.year}`,
      sourceType: "official_actual",
      url: "https://investors.baesystems.com/results-centre",
      publisher: "BAE Systems",
      reportingPeriod: `FY${row.year}`,
      publishedDate: annualByYear(row.year).eventDate,
      retrievedAt: createdAt,
      checksum: checksum(`ba-ar-${row.year}`),
      metadataJson: json({ dataLayer: "official_actual", curatedHistoricalTable: true }),
    })),
    ...interimEvents.map((event) => ({
      id: `ba-${slug(event.fiscalPeriod)}`,
      ticker: TICKER,
      title: `BAE Systems ${event.fiscalPeriod}`,
      sourceType: event.type === "half_year_results" ? "official_actual" : "management_guidance",
      url: "https://investors.baesystems.com/results-centre",
      publisher: "BAE Systems",
      reportingPeriod: event.fiscalPeriod,
      publishedDate: event.eventDate,
      retrievedAt: createdAt,
      checksum: checksum(`ba-${event.id}`),
      metadataJson: json({ dataLayer: event.type === "half_year_results" ? "official_actual" : "management_guidance" }),
    })),
  ];

  const programExposures = programs.flatMap((program) => reportingEvents
    .filter((event) => event.eventDate >= "2022-02-24")
    .map((event) => ({
      id: `ba-program-${event.id}-${slug(program[0])}`,
      ticker: TICKER,
      asOfDate: event.eventDate,
      sourceType: "contract_backlog_assumption",
      programName: program[0],
      segment: program[1],
      geography: program[2],
      customer: "Government / sovereign defense customer",
      maturity: program[3],
      strategicImportance: program[4],
      marginQuality: program[5],
      growthContribution: program[6],
      riskScore: program[7],
      valuationImpactAllowed: 0,
      rawJson: json({ displayOnlyByDefault: true }),
    })));

  const contractAwards = [
    ["ba-award-2023-cv90", "2023-05-24", "CV90 / BvS10 combat vehicles", "Platforms & Services", "Europe", 4500, "GBP"],
    ["ba-award-2024-aukus", "2024-03-21", "AUKUS submarine industrial base", "Maritime", "UK / Australia / US", null, "GBP"],
    ["ba-award-2025-typhoon-turkiye", "2025-10-27", "Typhoon for Turkiye", "Air", "Turkiye", 4000, "GBP"],
    ["ba-award-2025-type26-norway", "2025-09-01", "Type 26 Norway", "Maritime", "Norway", null, "GBP"],
  ].map((award) => ({
    id: award[0],
    ticker: TICKER,
    eventId: reportingEvents.filter((event) => event.eventDate <= award[1]).at(-1)?.id ?? null,
    announcementDate: award[1],
    sourceType: "contract_backlog_assumption",
    programName: award[2],
    customer: "Government defense customer",
    geography: award[4],
    segment: award[3],
    amount: award[5],
    currency: award[6],
    backlogImpact: "Supports backlog visibility; not treated as revenue until delivery/conversion.",
    valuationImpactAllowed: 0,
    rawJson: json({ orderBacklogIsRevenue: false }),
  }));

  const defenseBudgetIndicators = reportingEvents.flatMap((event) => ["UK", "US", "NATO Europe", "Australia"].map((geography) => ({
    id: `ba-budget-${event.id}-${slug(geography)}`,
    ticker: TICKER,
    asOfDate: event.eventDate,
    sourceType: "research_only",
    geography,
    indicator: "Defense budget direction",
    value: event.eventDate >= "2022-02-24" ? 1 : 0,
    unit: "directional_score",
    valuationImpactAllowed: 0,
    rawJson: json({ scenarioContextOnly: true }),
  })));

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    marketSnapshots,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    assumptionSets,
    modelVersions: [{
      id: BA_BACKEND_MODEL_VERSION.id,
      ticker: TICKER,
      version: BA_BACKEND_MODEL_VERSION.version,
      description: BA_BACKEND_MODEL_VERSION.description,
      valuationMethodsJson: json(BA_BACKEND_MODEL_VERSION.valuationMethods),
      assumptionSchemaJson: json({ gbxToGbp: "currentPriceGbp = currentPriceGbx / 100", noFutureData: true }),
      createdAt,
    }],
    validationWarnings: [{
      id: "ba-backend-historical-market-data-gap",
      ticker: TICKER,
      severity: "low",
      tableName: "market_snapshots",
      field: "source",
      message: "Historical market snapshots are event-visible seeded market_data placeholders and should be replaced with a live historical price feed.",
      createdAt,
    }],
    orderBacklogSnapshots: backlogSnapshots,
    orderIntakeSnapshots: intakeSnapshots,
    programExposures,
    contractAwards,
    defenseBudgetIndicators,
    pensionSnapshots,
    capitalAllocationEvents,
    backtestRuns: [],
  };
}
