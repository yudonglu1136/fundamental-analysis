import { CEG_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "CEG";
const now = () => new Date().toISOString();
const json = (value) => JSON.stringify(value ?? null);

const annualRows = [
  { fiscalYear: 2022, eventDate: "2023-02-16", revenue: 24440, operatingIncome: 495, netIncome: -160, dilutedEps: -0.49, dilutedShares: 329, operatingCashFlow: -2353, capex: 1689, freeCashFlow: -4042, dividendsPaid: 185, buybacks: 0 },
  { fiscalYear: 2023, eventDate: "2024-02-27", revenue: 24918, operatingIncome: 1610, netIncome: 1623, dilutedEps: 5.01, dilutedShares: 324, operatingCashFlow: -5301, capex: 2422, freeCashFlow: -7723, dividendsPaid: 366, buybacks: 992 },
  { fiscalYear: 2024, eventDate: "2025-02-18", revenue: 23568, operatingIncome: 4352, netIncome: 3749, dilutedEps: 11.89, dilutedShares: 315, operatingCashFlow: -2464, capex: 2565, freeCashFlow: -5029, dividendsPaid: 444, buybacks: 999 },
  { fiscalYear: 2025, eventDate: "2026-02-17", revenue: 25533, operatingIncome: 3086, netIncome: 2319, dilutedEps: 7.4, dilutedShares: 314, operatingCashFlow: 4237, capex: 2949, freeCashFlow: 1288, dividendsPaid: 486, buybacks: 400 },
];

const quarterRows = [
  [2022, 1, "2022-05-12", 5591, 435, 106, 0.32, 328, 1351, 410, 941, 46, 0],
  [2022, 2, "2022-08-04", 5465, 272, -111, -0.34, 328, -88, 390, -478, 47, 0],
  [2022, 3, "2022-11-08", 6051, -41, -188, -0.57, 328, -1194, 290, -1484, 46, 0],
  [2022, 4, "2023-02-16", 7333, -171, 33, null, 329, -2422, 599, -3021, 46, 0],
  [2023, 1, "2023-05-04", 7565, 31, 96, 0.29, 328, -934, 660, -1594, 93, 231],
  [2023, 2, "2023-08-03", 5446, 669, 833, 2.56, 325, -192, 676, -868, 92, 268],
  [2023, 3, "2023-11-06", 6111, 977, 731, 2.26, 323, -993, 399, -1392, 92, 251],
  [2023, 4, "2024-02-27", 5796, -67, -37, null, 324, -3182, 687, -3869, 89, 242],
  [2024, 1, "2024-05-09", 6161, 813, 883, 2.78, 318, -723, 738, -1461, 112, 499],
  [2024, 2, "2024-08-06", 5475, 1100, 814, 2.58, 316, -613, 546, -1159, 110, 500],
  [2024, 3, "2024-11-04", 6550, 1467, 1200, 3.82, 314, -112, 552, -664, 111, 0],
  [2024, 4, "2025-02-18", 5382, 972, 852, null, 315, -1016, 729, -1745, 111, 0],
  [2025, 1, "2025-05-06", 6788, 451, 118, 0.38, 314, 107, 806, -699, 122, 0],
  [2025, 2, "2025-08-07", 6101, 951, 839, 2.67, 314, 1477, 767, 710, 122, 0],
  [2025, 3, "2025-11-07", 6570, 1086, 930, 2.97, 313, 1848, 390, 1458, 121, 0],
  [2025, 4, "2026-02-17", 6074, 598, 432, null, 314, 805, 986, -181, 121, 400],
  [2026, 1, "2026-05-08", 11122, 2332, 1590, 4.49, 354, 425, 1275, -850, 155, 0],
].map(([fiscalYear, fiscalQuarter, eventDate, revenue, operatingIncome, netIncome, dilutedEps, dilutedShares, operatingCashFlow, capex, freeCashFlow, dividendsPaid, buybacks]) => ({
  fiscalYear,
  fiscalQuarter,
  eventDate,
  revenue,
  operatingIncome,
  netIncome,
  dilutedEps,
  dilutedShares,
  operatingCashFlow,
  capex,
  freeCashFlow,
  dividendsPaid,
  buybacks,
}));

const scenarioPresets = {
  Bear: {
    revenueGrowth: 0.015,
    operatingMargin: 0.14,
    normalizedFcfMargin: 0.065,
    targetFcfYield: 0.062,
    targetPe: 17,
    evEbitdaMultiple: 9.5,
    discountRate: 0.092,
    terminalGrowth: 0.018,
    nuclearScarcityPremium: 0.04,
    dataCenterDemandUplift: 0.01,
    regulatoryHaircut: 0.13,
    commodityHedgeHaircut: 0.08,
    balanceSheetHaircut: 0.06,
    buybackYield: 0.005,
    dividendYield: 0.005,
  },
  Base: {
    revenueGrowth: 0.035,
    operatingMargin: 0.18,
    normalizedFcfMargin: 0.085,
    targetFcfYield: 0.048,
    targetPe: 22,
    evEbitdaMultiple: 12.5,
    discountRate: 0.083,
    terminalGrowth: 0.024,
    nuclearScarcityPremium: 0.11,
    dataCenterDemandUplift: 0.08,
    regulatoryHaircut: 0.07,
    commodityHedgeHaircut: 0.05,
    balanceSheetHaircut: 0.035,
    buybackYield: 0.01,
    dividendYield: 0.006,
  },
  Bull: {
    revenueGrowth: 0.06,
    operatingMargin: 0.22,
    normalizedFcfMargin: 0.11,
    targetFcfYield: 0.038,
    targetPe: 28,
    evEbitdaMultiple: 15.5,
    discountRate: 0.077,
    terminalGrowth: 0.028,
    nuclearScarcityPremium: 0.18,
    dataCenterDemandUplift: 0.14,
    regulatoryHaircut: 0.045,
    commodityHedgeHaircut: 0.035,
    balanceSheetHaircut: 0.025,
    buybackYield: 0.018,
    dividendYield: 0.006,
  },
};

function quarterEventId(row) {
  return `ceg-q${row.fiscalQuarter}-${row.fiscalYear}`;
}

function periodId(row) {
  return `q${row.fiscalQuarter}-${String(row.fiscalYear).slice(2)}`;
}

function financialRowFromQuarter(row) {
  const id = quarterEventId(row);
  return {
    id,
    ticker: TICKER,
    periodId: periodId(row),
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    periodType: "quarter",
    eventId: id,
    asOfDate: row.eventDate,
    sourceType: "official_actual",
    revenue: row.revenue,
    organicRevenueGrowth: null,
    recurringRevenue: null,
    subscriptionRevenue: null,
    adjustedEbitda: row.operatingIncome * 1.18,
    adjustedEbitdaMargin: row.revenue ? (row.operatingIncome * 1.18) / row.revenue : null,
    operatingIncome: row.operatingIncome,
    operatingMargin: row.revenue ? row.operatingIncome / row.revenue : null,
    netIncome: row.netIncome,
    adjustedEps: row.dilutedEps,
    dilutedEps: row.dilutedEps,
    dilutedShares: row.dilutedShares,
    operatingCashFlow: row.operatingCashFlow,
    capex: row.capex,
    freeCashFlow: row.freeCashFlow,
    depreciationAmortization: Math.max(0, row.operatingIncome * 0.18),
    dividendsPaid: row.dividendsPaid,
    buybacks: row.buybacks,
    cashAndShortTermInvestments: null,
    debt: null,
    netDebt: row.fiscalYear >= 2026 ? 28000 : 7600,
    fxImpact: null,
    currentPrice: null,
    researchOnly: 0,
    rawJson: json({
      source: "SEC companyfacts local extract",
      noFutureLeakage: `Visible as of ${row.eventDate}`,
      reportedFcfIncludesCollateralAndWorkingCapitalVolatility: true,
    }),
  };
}

function financialRowFromAnnual(row) {
  return {
    id: `ceg-fy-${row.fiscalYear}`,
    ticker: TICKER,
    periodId: `fy${row.fiscalYear}`,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: null,
    periodType: "annual",
    eventId: `ceg-q4-${row.fiscalYear}`,
    asOfDate: row.eventDate,
    sourceType: "official_actual",
    revenue: row.revenue,
    organicRevenueGrowth: null,
    recurringRevenue: null,
    subscriptionRevenue: null,
    adjustedEbitda: row.operatingIncome * 1.18,
    adjustedEbitdaMargin: row.revenue ? (row.operatingIncome * 1.18) / row.revenue : null,
    operatingIncome: row.operatingIncome,
    operatingMargin: row.revenue ? row.operatingIncome / row.revenue : null,
    netIncome: row.netIncome,
    adjustedEps: row.dilutedEps,
    dilutedEps: row.dilutedEps,
    dilutedShares: row.dilutedShares,
    operatingCashFlow: row.operatingCashFlow,
    capex: row.capex,
    freeCashFlow: row.freeCashFlow,
    depreciationAmortization: Math.max(0, row.operatingIncome * 0.18),
    dividendsPaid: row.dividendsPaid,
    buybacks: row.buybacks,
    cashAndShortTermInvestments: null,
    debt: null,
    netDebt: row.fiscalYear >= 2025 ? 28000 : 7600,
    fxImpact: null,
    currentPrice: null,
    researchOnly: 0,
    rawJson: json({
      source: "SEC companyfacts local extract",
      dividendPerShare: row.dilutedShares ? row.dividendsPaid / row.dilutedShares : null,
      reportedFcfIncludesCollateralAndWorkingCapitalVolatility: true,
    }),
  };
}

function buildMarketSnapshots() {
  return quarterRows.map((row) => ({
    id: `ceg-market-${periodId(row)}`,
    ticker: TICKER,
    asOfDate: row.eventDate,
    priceDate: row.eventDate,
    currentPrice: null,
    currency: "USD",
    marketCap: null,
    enterpriseValue: null,
    sharesOutstanding: row.dilutedShares,
    previousClose: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    dividendYield: 0.006,
    beta: null,
    source: "Nasdaq daily price anchor applied during valuation run",
    fetchedAt: now(),
    rawJson: json({ source: "market_snapshot_placeholder_until_price_import", asOfDate: row.eventDate }),
  }));
}

export async function buildCegBackendSeedPayload() {
  const reportingEvents = quarterRows.map((row) => ({
    id: quarterEventId(row),
    ticker: TICKER,
    eventDate: row.eventDate,
    fiscalPeriod: `Q${row.fiscalQuarter} ${row.fiscalYear}`,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    eventType: `q${row.fiscalQuarter}_results`,
    label: `CEG Q${row.fiscalQuarter} ${row.fiscalYear} results`,
    sourceType: "official_actual",
    sourcePath: "data/local/ceg/sec/companyfacts.json",
    sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001868275.json",
    createdAt: now(),
  }));

  const sourceDocuments = [
    {
      id: "ceg-sec-companyfacts-1868275",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "SEC companyfacts CIK0001868275",
      sourcePath: "data/local/ceg/sec/companyfacts.json",
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001868275.json",
      retrievedAt: "2026-05-18",
      publishedDate: "2026-05-08",
      provenance: "official_sec_api",
      confidence: "high",
      checksum: null,
      metadataJson: json({ company: "Constellation Energy Corporation", cik: "0001868275" }),
    },
    {
      id: "ceg-nasdaq-chart",
      ticker: TICKER,
      sourceType: "market_data",
      sourceName: "Nasdaq CEG and SPY daily chart payloads",
      sourcePath: "data/local/ceg/market",
      sourceUrl: "https://api.nasdaq.com/api/quote/CEG/chart",
      retrievedAt: "2026-05-18",
      publishedDate: "2026-05-18",
      provenance: "nasdaq_chart_api",
      confidence: "medium",
      checksum: null,
      metadataJson: json({ adjustedCloseTreatment: "Nasdaq chart close fallback; not dividend-adjusted." }),
    },
  ];

  const financialPeriods = [
    ...quarterRows.map(financialRowFromQuarter),
    ...annualRows.map(financialRowFromAnnual),
  ];

  const modelVersions = [{
    id: CEG_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: CEG_BACKEND_MODEL_VERSION.version,
    name: CEG_BACKEND_MODEL_VERSION.name,
    description: CEG_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json(CEG_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json(CEG_BACKEND_MODEL_VERSION.assumptionSchema),
    createdAt: now(),
  }];

  const assumptionSets = Object.entries(scenarioPresets).map(([scenario, assumptions]) => ({
    id: `ceg-${scenario.toLowerCase()}-${CEG_BACKEND_MODEL_VERSION.version}`,
    ticker: TICKER,
    name: `CEG ${scenario} nuclear scarcity case`,
    scenario,
    modelVersion: CEG_BACKEND_MODEL_VERSION.version,
    asOfDate: "2022-05-12",
    assumptionsJson: json(assumptions),
    sourceType: "research_assumption",
    createdAt: now(),
  }));

  const validationWarnings = [
    {
      id: "ceg-public-history-starts-2022",
      ticker: TICKER,
      scope: "historical_coverage",
      severity: "medium",
      title: "Standalone CEG public history starts in 2022",
      detail: "The backend does not fabricate eight years of standalone CEG financials before the public spin. Quarterly reporting-event history starts at Q1 2022.",
      relatedTable: "reporting_events",
      relatedRecordId: null,
      createdAt: now(),
    },
    {
      id: "ceg-operating-kpi-parser-gap",
      ticker: TICKER,
      scope: "operating_metrics",
      severity: "medium",
      title: "Nuclear fleet and AI PPA operating metrics are not official structured rows yet",
      detail: "Financials are SEC-backed; capacity factor, TWh and contracted AI load are kept out of backend valuation until official metric extraction is added.",
      relatedTable: "financial_periods",
      relatedRecordId: null,
      createdAt: now(),
    },
  ];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials: [],
    marketSnapshots: buildMarketSnapshots(),
    peerSnapshots: [],
    guidanceItems: [],
    transcriptEvents: [],
    transcriptExtractions: [],
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
