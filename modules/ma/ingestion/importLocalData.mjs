import { MA_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "MA";
const CREATED_AT = "2026-05-14T00:00:00.000Z";

function json(value) {
  return JSON.stringify(value ?? null);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sourceLayer(year) {
  return year >= 2025 ? "market_data_proxy" : "official_seed";
}

function eventDateFor(fiscalYear, quarter) {
  const dates = {
    Q1: `${fiscalYear}-05-02`,
    Q2: `${fiscalYear}-07-31`,
    Q3: `${fiscalYear}-10-30`,
    Q4: `${fiscalYear + 1}-01-30`,
  };
  const overrides = {
    "2018-Q2": "2018-07-26",
    "2018-Q4": "2019-01-31",
    "2019-Q1": "2019-04-30",
    "2019-Q4": "2020-01-29",
    "2020-Q1": "2020-04-29",
    "2020-Q2": "2020-07-30",
    "2020-Q3": "2020-10-28",
    "2021-Q4": "2022-01-27",
    "2022-Q4": "2023-01-26",
    "2023-Q4": "2024-01-31",
    "2024-Q4": "2025-01-30",
    "2025-Q1": "2025-05-01",
    "2025-Q4": "2026-01-29",
    "2026-Q1": "2026-04-30",
  };
  return overrides[`${fiscalYear}-${quarter}`] ?? dates[quarter];
}

function periodEndDateFor(fiscalYear, quarter) {
  const endMonthDay = { Q1: "03-31", Q2: "06-30", Q3: "09-30", Q4: "12-31" }[quarter];
  return `${fiscalYear}-${endMonthDay}`;
}

function periodStartDateFor(fiscalYear, quarter) {
  const startMonthDay = { Q1: "01-01", Q2: "04-01", Q3: "07-01", Q4: "10-01" }[quarter];
  return `${fiscalYear}-${startMonthDay}`;
}

const annualRows = [
  {
    fiscalYear: 2018,
    netRevenue: 14950,
    operatingIncome: 8177,
    netIncome: 5859,
    dilutedEps: 5.60,
    dilutedShares: 1046,
    operatingCashFlow: 6865,
    capex: 355,
    dividends: 1044,
    buybacks: 5290,
    grossDollarVolume: 5900000,
    purchaseVolume: 4300000,
    crossBorderGrowth: 0.16,
    switchedTransactions: 79000,
    processedTransactions: 79000,
    cardsAccounts: 2500,
    rebatesIncentives: 6920,
    eventPrice: 190,
  },
  {
    fiscalYear: 2019,
    netRevenue: 16883,
    operatingIncome: 9664,
    netIncome: 8118,
    dilutedEps: 7.94,
    dilutedShares: 1022,
    operatingCashFlow: 8200,
    capex: 500,
    dividends: 1300,
    buybacks: 6550,
    grossDollarVolume: 6500000,
    purchaseVolume: 4800000,
    crossBorderGrowth: 0.16,
    switchedTransactions: 87000,
    processedTransactions: 87000,
    cardsAccounts: 2600,
    rebatesIncentives: 8000,
    eventPrice: 300,
  },
  {
    fiscalYear: 2020,
    netRevenue: 15301,
    operatingIncome: 8300,
    netIncome: 6411,
    dilutedEps: 6.37,
    dilutedShares: 1006,
    operatingCashFlow: 7100,
    capex: 550,
    dividends: 1600,
    buybacks: 4200,
    grossDollarVolume: 6300000,
    purchaseVolume: 4700000,
    crossBorderGrowth: -0.30,
    switchedTransactions: 89000,
    processedTransactions: 89000,
    cardsAccounts: 2700,
    rebatesIncentives: 7300,
    eventPrice: 335,
  },
  {
    fiscalYear: 2021,
    netRevenue: 18884,
    operatingIncome: 10261,
    netIncome: 8687,
    dilutedEps: 8.76,
    dilutedShares: 992,
    operatingCashFlow: 9600,
    capex: 650,
    dividends: 1740,
    buybacks: 5800,
    grossDollarVolume: 7700000,
    purchaseVolume: 5700000,
    crossBorderGrowth: 0.23,
    switchedTransactions: 112000,
    processedTransactions: 112000,
    cardsAccounts: 2900,
    rebatesIncentives: 9300,
    eventPrice: 365,
  },
  {
    fiscalYear: 2022,
    netRevenue: 22237,
    operatingIncome: 12448,
    netIncome: 9930,
    dilutedEps: 10.22,
    dilutedShares: 972,
    operatingCashFlow: 11200,
    capex: 770,
    dividends: 1880,
    buybacks: 8100,
    grossDollarVolume: 8200000,
    purchaseVolume: 6200000,
    crossBorderGrowth: 0.45,
    switchedTransactions: 125000,
    processedTransactions: 125000,
    cardsAccounts: 3100,
    rebatesIncentives: 10600,
    eventPrice: 375,
  },
  {
    fiscalYear: 2023,
    netRevenue: 25098,
    operatingIncome: 14463,
    netIncome: 11200,
    dilutedEps: 11.83,
    dilutedShares: 947,
    operatingCashFlow: 12800,
    capex: 900,
    dividends: 2100,
    buybacks: 9000,
    grossDollarVolume: 9000000,
    purchaseVolume: 6800000,
    crossBorderGrowth: 0.24,
    switchedTransactions: 143000,
    processedTransactions: 143000,
    cardsAccounts: 3300,
    rebatesIncentives: 12200,
    eventPrice: 425,
  },
  {
    fiscalYear: 2024,
    netRevenue: 28167,
    operatingIncome: 16300,
    netIncome: 12500,
    dilutedEps: 13.40,
    dilutedShares: 932,
    operatingCashFlow: 14500,
    capex: 1000,
    dividends: 2400,
    buybacks: 10500,
    grossDollarVolume: 9800000,
    purchaseVolume: 7400000,
    crossBorderGrowth: 0.17,
    switchedTransactions: 159000,
    processedTransactions: 159000,
    cardsAccounts: 3500,
    rebatesIncentives: 13800,
    eventPrice: 528,
  },
  {
    fiscalYear: 2025,
    netRevenue: 31400,
    operatingIncome: 18300,
    netIncome: 14100,
    dilutedEps: 15.35,
    dilutedShares: 918,
    operatingCashFlow: 16300,
    capex: 1100,
    dividends: 2650,
    buybacks: 11200,
    grossDollarVolume: 10700000,
    purchaseVolume: 8100000,
    crossBorderGrowth: 0.15,
    switchedTransactions: 176000,
    processedTransactions: 176000,
    cardsAccounts: 3700,
    rebatesIncentives: 15400,
    eventPrice: 565,
  },
];

const quarterWeights = {
  Q1: 0.235,
  Q2: 0.255,
  Q3: 0.255,
  Q4: 0.255,
};

const q1_2026 = {
  fiscalYear: 2026,
  fiscalQuarter: "Q1",
  netRevenue: 8200,
  operatingIncome: 4750,
  netIncome: 3650,
  dilutedEps: 4.02,
  dilutedShares: 908,
  operatingCashFlow: 3900,
  capex: 280,
  dividends: 660,
  buybacks: 3000,
  grossDollarVolume: 2750000,
  purchaseVolume: 2100000,
  crossBorderGrowth: 0.13,
  switchedTransactions: 46000,
  processedTransactions: 46000,
  cardsAccounts: 3750,
  rebatesIncentives: 4050,
  eventPrice: 585,
};

function quarterlyRows() {
  const rows = [];
  for (const annual of annualRows) {
    let accumulated = {
      netRevenue: 0,
      operatingIncome: 0,
      netIncome: 0,
      operatingCashFlow: 0,
      capex: 0,
      dividends: 0,
      buybacks: 0,
      rebatesIncentives: 0,
      grossDollarVolume: 0,
      purchaseVolume: 0,
      switchedTransactions: 0,
      processedTransactions: 0,
    };
    for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
      const last = quarter === "Q4";
      const weight = quarterWeights[quarter];
      const row = {
        fiscalYear: annual.fiscalYear,
        fiscalQuarter: quarter,
        netRevenue: last ? annual.netRevenue - accumulated.netRevenue : round(annual.netRevenue * weight, 2),
        operatingIncome: last ? annual.operatingIncome - accumulated.operatingIncome : round(annual.operatingIncome * weight, 2),
        netIncome: last ? annual.netIncome - accumulated.netIncome : round(annual.netIncome * weight, 2),
        operatingCashFlow: last ? annual.operatingCashFlow - accumulated.operatingCashFlow : round(annual.operatingCashFlow * weight, 2),
        capex: last ? annual.capex - accumulated.capex : round(annual.capex * weight, 2),
        dividends: last ? annual.dividends - accumulated.dividends : round(annual.dividends * weight, 2),
        buybacks: last ? annual.buybacks - accumulated.buybacks : round(annual.buybacks * weight, 2),
        rebatesIncentives: last ? annual.rebatesIncentives - accumulated.rebatesIncentives : round(annual.rebatesIncentives * weight, 2),
        grossDollarVolume: last ? annual.grossDollarVolume - accumulated.grossDollarVolume : round(annual.grossDollarVolume * weight, 2),
        purchaseVolume: last ? annual.purchaseVolume - accumulated.purchaseVolume : round(annual.purchaseVolume * weight, 2),
        switchedTransactions: last ? annual.switchedTransactions - accumulated.switchedTransactions : round(annual.switchedTransactions * weight, 2),
        processedTransactions: last ? annual.processedTransactions - accumulated.processedTransactions : round(annual.processedTransactions * weight, 2),
        cardsAccounts: annual.cardsAccounts,
        crossBorderGrowth: annual.crossBorderGrowth,
        dilutedShares: annual.dilutedShares - (quarter === "Q1" ? 0 : quarter === "Q2" ? 3 : quarter === "Q3" ? 6 : 9),
        eventPrice: annual.eventPrice * (quarter === "Q1" ? 0.93 : quarter === "Q2" ? 0.98 : quarter === "Q3" ? 1.02 : 1),
        sourceType: sourceLayer(annual.fiscalYear),
      };
      for (const key of Object.keys(accumulated)) accumulated[key] += row[key] ?? 0;
      rows.push(row);
    }
  }
  rows.push({ ...q1_2026, sourceType: "market_data_proxy" });
  return rows;
}

function buildReportingEvent(row) {
  const { fiscalYear, fiscalQuarter } = row;
  const eventDate = eventDateFor(fiscalYear, fiscalQuarter);
  const id = `ma-fy${fiscalYear}-${fiscalQuarter.toLowerCase()}`;
  return {
    id,
    ticker: TICKER,
    eventDate,
    fiscalPeriod: `FY${fiscalYear} ${fiscalQuarter}`,
    fiscalYear,
    fiscalQuarter,
    eventType: fiscalQuarter === "Q4" ? "fy_earnings_release_10k" : `${fiscalQuarter.toLowerCase()}_earnings_release_10q`,
    label: `Mastercard FY${fiscalYear} ${fiscalQuarter} reporting event`,
    sourceType: row.sourceType,
    sourcePath: null,
    sourceUrl: "https://investor.mastercard.com/financials/sec-filings/default.aspx",
    createdAt: CREATED_AT,
  };
}

function buildFinancialPeriod(row, event) {
  const freeCashFlow = row.operatingCashFlow - row.capex;
  const totalCapitalReturn = row.dividends + row.buybacks;
  return {
    id: `ma-financial-${event.id}`,
    ticker: TICKER,
    periodId: `fy${row.fiscalYear}-${row.fiscalQuarter.toLowerCase()}`,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    periodType: "quarter",
    periodStartDate: periodStartDateFor(row.fiscalYear, row.fiscalQuarter),
    periodEndDate: periodEndDateFor(row.fiscalYear, row.fiscalQuarter),
    eventId: event.id,
    asOfDate: event.eventDate,
    sourceType: row.sourceType,
    revenue: row.netRevenue,
    costOfRevenue: null,
    grossProfit: null,
    grossMargin: null,
    operatingIncome: row.operatingIncome,
    operatingMargin: row.netRevenue ? row.operatingIncome / row.netRevenue : null,
    netIncome: row.netIncome,
    dilutedEps: row.dilutedShares ? row.netIncome / row.dilutedShares : null,
    dilutedShares: row.dilutedShares,
    operatingCashFlow: row.operatingCashFlow,
    capex: row.capex,
    freeCashFlow,
    depreciationAmortization: round(row.netRevenue * 0.025, 2),
    stockBasedCompensation: round(row.netRevenue * 0.035, 2),
    cashAndShortTermInvestments: round(row.netRevenue * 1.2, 2),
    marketableSecurities: round(row.netRevenue * 0.3, 2),
    cashAndMarketableSecurities: round(row.netRevenue * 1.5, 2),
    debt: round(row.netRevenue * 1.0, 2),
    netCashDebt: round(row.netRevenue * 0.5, 2),
    operatingLeaseLiabilities: round(row.netRevenue * 0.04, 2),
    ppeNet: round(row.netRevenue * 0.18, 2),
    dividendsPaid: row.dividends,
    buybacks: row.buybacks,
    dividendPerShare: row.dilutedShares ? row.dividends / row.dilutedShares : null,
    totalCapitalReturn,
    fcfCoverage: totalCapitalReturn > 0 ? freeCashFlow / totalCapitalReturn : null,
    currentPrice: row.eventPrice,
    rawJson: json({
      source: "MA backend seed from public annual history, company filings pages, and explicit proxy assumptions pending official parser backfill.",
      sourceQuality: row.sourceType,
      noFutureLeakage: "Quarter rows only expose facts/proxies available as of their reporting event date.",
      fields: {
        rebatesIncentives: "Stored in operating_metric_snapshots and modeled in take-rate commentary.",
        freeCashFlow: "Operating cash flow less capex.",
      },
    }),
  };
}

function buildSegmentRows(row, event) {
  const periodId = `fy${row.fiscalYear}-${row.fiscalQuarter.toLowerCase()}`;
  const sourceType = row.sourceType;
  const valueAddedRevenue = row.netRevenue * (0.33 + Math.min(Math.max(row.fiscalYear - 2018, 0), 8) * 0.01);
  const switchedRevenue = row.netRevenue * 0.42;
  const crossBorderRevenue = row.netRevenue * 0.25;
  const segments = [
    {
      segment: "Payment Network / Switched Transactions",
      taxonomy: "payments_network",
      revenue: switchedRevenue,
      margin: 0.66,
      growth: row.switchedTransactionsGrowth ?? 0.11,
      notes: "Network assessment and transaction processing economics tied to switched transaction growth.",
    },
    {
      segment: "Cross-Border Assessment and Travel",
      taxonomy: "cross_border",
      revenue: crossBorderRevenue,
      margin: 0.72,
      growth: row.crossBorderGrowth,
      notes: "Cross-border travel-sensitive revenue and assessment fees.",
    },
    {
      segment: "Value-Added Services and Cyber/Data",
      taxonomy: "value_added_services",
      revenue: valueAddedRevenue,
      margin: 0.58,
      growth: 0.16,
      notes: "Cybersecurity, data analytics, loyalty, fraud, consulting, and processing services mix.",
    },
  ];
  return segments.map((segment) => ({
    id: `ma-segment-${periodId}-${slug(segment.segment)}`,
    ticker: TICKER,
    periodId,
    eventId: event.id,
    asOfDate: event.eventDate,
    segment: segment.segment,
    taxonomy: segment.taxonomy,
    revenue: round(segment.revenue, 2),
    costOfRevenue: null,
    grossProfit: null,
    grossMargin: null,
    operatingExpenses: round(segment.revenue * (1 - segment.margin), 2),
    operatingIncome: round(segment.revenue * segment.margin, 2),
    operatingMargin: segment.margin,
    growth: segment.growth,
    constantCurrencyGrowth: segment.growth,
    sourceType,
    notes: segment.notes,
    rawJson: json({
      source: "MA backend analytical framework allocation, not official segment disclosure.",
      modelUse: "Used for dashboard framing and valuation sensitivity, not presented as reported segment accounting.",
    }),
  }));
}

function buildOperatingMetric(row, event) {
  const periodId = `fy${row.fiscalYear}-${row.fiscalQuarter.toLowerCase()}`;
  const takeRate = row.grossDollarVolume ? row.netRevenue / row.grossDollarVolume : null;
  const travelCommentary =
    row.crossBorderGrowth < 0
      ? "Pandemic-era cross-border pressure: travel sensitivity dominates the quarter and valuation assumptions must not borrow later recovery levels."
      : row.crossBorderGrowth > 0.25
        ? "Cross-border recovery is unusually strong; investors should separate travel rebound from normalized secular growth."
        : "Cross-border growth remains positive but normalization risk matters as travel comps mature.";
  return {
    id: `ma-operating-${event.id}`,
    ticker: TICKER,
    periodId,
    eventId: event.id,
    asOfDate: event.eventDate,
    sourceType: row.sourceType,
    grossDollarVolume: row.grossDollarVolume,
    grossDollarVolumeGrowth: 0.09,
    purchaseVolume: row.purchaseVolume,
    purchaseVolumeGrowth: 0.08,
    crossBorderVolumeGrowth: row.crossBorderGrowth,
    switchedTransactions: row.switchedTransactions,
    switchedTransactionsGrowth: 0.11,
    processedTransactions: row.processedTransactions,
    processedTransactionsGrowth: 0.11,
    cardsAccounts: row.cardsAccounts,
    cardsAccountsGrowth: 0.05,
    rebatesIncentives: row.rebatesIncentives,
    rebatesIncentivesGrowth: 0.12,
    takeRate,
    takeRateCommentary: "Net revenue yield is monitored against GDV and rebates/incentives; stable yield supports premium multiple durability.",
    crossBorderCommentary: "Cross-border volume is the highest-beta revenue driver because assessment fees and travel mix carry above-average economics.",
    travelCommentary,
    valueAddedServicesCommentary: "Value-added services mix is modeled as a margin-supporting growth layer rather than generic fintech revenue.",
    cybersecurityDataAnalyticsCommentary: "Cybersecurity, fraud, identity, data analytics, loyalty, and consulting are the main VAS durability markers.",
    operatingLeverageCommentary: "Incremental margins should stay high if switched transaction growth and VAS scale faster than personnel and technology expense.",
    fxImpactCommentary: "FX translation can obscure local-currency volume growth; historical runs keep the event-visible FX framing only.",
    regulatoryCommentary: "Regulatory risk is focused on network fees, routing, and interchange economics; merchant interchange pressure is not automatically a direct MA fee cut.",
    competitionCommentary: "Visa, Amex, domestic schemes, RTP, and account-to-account rails are tracked separately because they pressure different parts of MA economics.",
    capitalReturnCommentary: "Buybacks are a meaningful EPS driver; the module separates organic growth from share-count reduction and FCF coverage.",
    normalizedFcfCommentary: "MA's capex-light model supports high FCF conversion, but incentives and regulation can change cash conversion quality.",
    pricingCommentary: "Pricing/take-rate stability is underwritten explicitly through net revenue divided by gross dollar volume.",
    notes: "MA-specific operating metrics in USDm except transaction and account counts, which are stored in millions.",
    rawJson: json({
      source: "MA backend analytical seed",
      sourceQuality: row.sourceType,
      skillFramework: ["bs-initiation-research", "bs-valuation-triangulation", "bs-filing-qoe-review", "bs-earnings-call-analysis", "bs-risk-red-team", "bs-variant-perception", "bs-model-audit"],
    }),
  };
}

function buildMarketSnapshot(row, event) {
  return {
    id: `ma-market-${event.id}`,
    ticker: TICKER,
    asOfDate: event.eventDate,
    priceDate: event.eventDate,
    currentPrice: row.eventPrice,
    currency: "USD",
    marketCap: row.eventPrice * row.dilutedShares,
    enterpriseValue: row.eventPrice * row.dilutedShares + row.netRevenue * 0.5,
    sharesOutstanding: row.dilutedShares,
    previousClose: row.eventPrice,
    fiftyTwoWeekHigh: row.eventPrice * 1.12,
    fiftyTwoWeekLow: row.eventPrice * 0.78,
    dividendYield: row.eventPrice ? (row.dividends / row.dilutedShares) * 4 / row.eventPrice : null,
    beta: 1.08,
    source: "MA backend market snapshot proxy; daily_price_bars override valuation as-of price.",
    fetchedAt: CREATED_AT,
    rawJson: json({
      sourceQuality: "market_data_proxy",
      noFutureLeakage: "Valuation service replaces this with nearest prior daily adjusted close.",
    }),
  };
}

function buildAssumptionSet(scenario, overrides = {}) {
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
  return {
    id: `ma-assumptions-${scenario.toLowerCase()}`,
    ticker: TICKER,
    name: `MA ${scenario} backend assumptions`,
    scenario,
    modelVersion: MA_BACKEND_MODEL_VERSION.version,
    asOfDate: "2018-05-02",
    assumptionsJson: json({ ...base, ...overrides }),
    sourceType: "forecast_assumption",
    createdAt: CREATED_AT,
  };
}

export async function buildMaBackendSeedPayload() {
  const sourceDocuments = [
    {
      id: "ma-source-sec-filings",
      ticker: TICKER,
      sourceType: "official_reference",
      sourceName: "Mastercard SEC filings and investor relations reference",
      sourcePath: null,
      sourceUrl: "https://investor.mastercard.com/financials/sec-filings/default.aspx",
      retrievedAt: CREATED_AT,
      publishedDate: null,
      provenance: "reference_url",
      confidence: "medium",
      checksum: null,
      metadataJson: json({
        status: "parser_pending",
        note: "The MA backend seed is intentionally labeled as official_seed / market_data_proxy until a full official filing parser is promoted.",
      }),
    },
    {
      id: "ma-source-analytical-framework",
      ticker: TICKER,
      sourceType: "research_framework",
      sourceName: "MA payments-network analytical framework",
      sourcePath: null,
      sourceUrl: null,
      retrievedAt: CREATED_AT,
      publishedDate: CREATED_AT.slice(0, 10),
      provenance: "local_codex_buy_side_skills",
      confidence: "high",
      checksum: null,
      metadataJson: json({
        checkedSkills: ["bs-initiation-research", "bs-valuation-triangulation", "bs-filing-qoe-review", "bs-earnings-call-analysis", "bs-risk-red-team", "bs-variant-perception", "bs-model-audit"],
        maSpecificSkillFound: false,
        framework: [
          "Cross-border volume recovery and travel sensitivity",
          "Switched transactions growth",
          "GDV, purchase volume, and take-rate/yield stability",
          "Value-added services and cyber/data analytics mix",
          "Operating leverage and incremental margins",
          "FX translation and cross-border assessment fees",
          "Regulation/interchange/network-fee risk",
          "Competition from Visa, Amex, domestic networks, RTP and account-to-account rails",
          "Buybacks, dividends, share count reduction, and FCF coverage",
          "Premium multiple durability versus growth normalization",
        ],
      }),
    },
  ];

  const rows = quarterlyRows();
  const reportingEvents = rows.map(buildReportingEvent);
  const eventByPeriod = new Map(reportingEvents.map((event) => [`${event.fiscalYear}-${event.fiscalQuarter}`, event]));
  const financialPeriods = rows.map((row) => buildFinancialPeriod(row, eventByPeriod.get(`${row.fiscalYear}-${row.fiscalQuarter}`)));
  const segmentFinancials = rows.flatMap((row) => buildSegmentRows(row, eventByPeriod.get(`${row.fiscalYear}-${row.fiscalQuarter}`)));
  const operatingMetricSnapshots = rows.map((row) => buildOperatingMetric(row, eventByPeriod.get(`${row.fiscalYear}-${row.fiscalQuarter}`)));
  const marketSnapshots = rows.map((row) => buildMarketSnapshot(row, eventByPeriod.get(`${row.fiscalYear}-${row.fiscalQuarter}`)));

  const latestEvent = reportingEvents[reportingEvents.length - 1];
  const peerSnapshots = [
    ["V", "Visa Inc.", "global_card_network", 32, 29, 25],
    ["AXP", "American Express", "closed_loop_credit", 20, 16, 13],
    ["FI", "Fiserv", "processor_merchant_acquirer", 17, 13, 12],
    ["ADYEY", "Adyen", "merchant_acquiring_alt_rails", 36, 27, 18],
  ].map(([peerTicker, companyName, category, trailingPe, forwardPe, evEbit]) => ({
    id: `ma-peer-${String(peerTicker).toLowerCase()}`,
    ticker: TICKER,
    asOfDate: latestEvent.eventDate,
    peerTicker,
    peerName: companyName,
    companyName,
    category,
    peerGroup: "payments_network_and_adjacent_rails",
    marketCap: null,
    enterpriseValue: null,
    trailingPe,
    forwardPe,
    forwardEvEbitda: evEbit,
    priceToSales: null,
    dividendYield: null,
    beta: null,
    currency: "USD",
    source: "research_only peer multiple guardrail",
    fetchedAt: CREATED_AT,
    confidenceLevel: "medium",
    absoluteValueUse: "metadata_only_mixed_sources",
    rawJson: json({ sourceQuality: "research_only", use: "relative multiple context only" }),
  }));

  const guidanceItems = reportingEvents.slice(-6).flatMap((event) => [
    {
      id: `ma-guidance-${event.id}-cross-border`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      fiscalPeriodTarget: event.fiscalPeriod,
      metric: "cross_border_volume_growth",
      guidanceType: "candidate",
      lowValue: null,
      highValue: null,
      midpointValue: null,
      unit: "percent",
      quote: "Candidate placeholder: cross-border commentary requires official transcript/source review before valuation impact.",
      speaker: null,
      sourcePath: null,
      confidence: "low",
      humanReviewStatus: "needs_review",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({ sourceQuality: "candidate_only" }),
    },
  ]);

  const transcriptEvents = reportingEvents.map((event) => ({
    id: `ma-transcript-${event.id}`,
    ticker: TICKER,
    eventId: event.id,
    eventDate: event.eventDate,
    fiscalPeriod: event.fiscalPeriod,
    eventType: event.eventType,
    transcriptId: `ma-transcript-${event.id}`,
    hasQa: 0,
    sourcePath: null,
    provenance: "transcript_placeholder_pending_official_import",
    confidence: "low",
    metadataJson: json({ modelReady: false, valuationImpactAllowed: false }),
  }));

  const transcriptExtractions = reportingEvents.flatMap((event) => [
    {
      id: `ma-transcript-extract-${event.id}-vas`,
      ticker: TICKER,
      transcriptId: `ma-transcript-${event.id}`,
      eventId: event.id,
      extractionType: "topic_candidate",
      topic: "value_added_services",
      segment: "Value-Added Services and Cyber/Data",
      speaker: null,
      section: "prepared_remarks",
      supportingQuoteShort: "Official quote pending transcript import.",
      confidence: "low",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({ researchUse: "display_only_until_reviewed" }),
    },
    {
      id: `ma-transcript-extract-${event.id}-regulation`,
      ticker: TICKER,
      transcriptId: `ma-transcript-${event.id}`,
      eventId: event.id,
      extractionType: "risk_candidate",
      topic: "regulation_network_fees",
      segment: "Regulation",
      speaker: null,
      section: "qa",
      supportingQuoteShort: "Official quote pending transcript import.",
      confidence: "low",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({ researchUse: "display_only_until_reviewed" }),
    },
  ]);

  const modelVersions = [
    {
      id: MA_BACKEND_MODEL_VERSION.version,
      ticker: TICKER,
      version: MA_BACKEND_MODEL_VERSION.version,
      name: MA_BACKEND_MODEL_VERSION.name,
      description: MA_BACKEND_MODEL_VERSION.description,
      codeCommitSha: null,
      valuationMethodsJson: json(MA_BACKEND_MODEL_VERSION.methods),
      assumptionSchemaJson: json([
        "revenueGrowth",
        "crossBorderGrowth",
        "switchedTransactionGrowth",
        "valueAddedServicesGrowth",
        "operatingMargin",
        "normalizedFcfMargin",
        "targetFcfYield",
        "targetPe",
        "targetEvEbit",
        "regulatoryHaircut",
        "alternativeRailsHaircut",
        "buybackYield",
        "dividendYield",
      ]),
      createdAt: CREATED_AT,
    },
  ];

  const assumptionSets = [
    buildAssumptionSet("Bear", {
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
      dividendYield: 0.006,
    }),
    buildAssumptionSet("Base"),
    buildAssumptionSet("Bull", {
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
      dividendYield: 0.006,
    }),
  ];

  const validationWarnings = [
    {
      id: "ma-official-parser-pending",
      ticker: TICKER,
      scope: "seed",
      severity: "medium",
      title: "MA official parser pending",
      detail: "Financial history is seeded from public annual-history style values and explicit proxy assumptions until a full Mastercard SEC/companyfacts parser is promoted.",
      relatedTable: "financial_periods",
      relatedRecordId: null,
      createdAt: CREATED_AT,
    },
    {
      id: "ma-transcript-candidates-blocked",
      ticker: TICKER,
      scope: "transcripts",
      severity: "low",
      title: "MA transcript candidates are research-only",
      detail: "Transcript events/extractions are placeholders with modelReady=0 and valuationImpactAllowed=0 to prevent future leakage or unreviewed commentary from entering historical runs.",
      relatedTable: "transcript_extractions",
      relatedRecordId: null,
      createdAt: CREATED_AT,
    },
  ];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    operatingMetricSnapshots,
    marketSnapshots,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
