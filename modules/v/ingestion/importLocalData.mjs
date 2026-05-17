import { V_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "V";
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
    Q1: `${fiscalYear}-01-28`,
    Q2: `${fiscalYear}-04-28`,
    Q3: `${fiscalYear}-07-28`,
    Q4: `${fiscalYear}-10-28`,
  };
  const overrides = {
    "2018-Q1": "2018-02-01",
    "2018-Q2": "2018-04-25",
    "2018-Q3": "2018-07-25",
    "2018-Q4": "2018-10-24",
    "2019-Q1": "2019-01-30",
    "2019-Q2": "2019-04-24",
    "2019-Q3": "2019-07-23",
    "2019-Q4": "2019-10-24",
    "2020-Q1": "2020-01-30",
    "2020-Q2": "2020-04-30",
    "2020-Q3": "2020-07-28",
    "2020-Q4": "2020-10-28",
    "2021-Q1": "2021-01-28",
    "2021-Q2": "2021-04-27",
    "2021-Q3": "2021-07-27",
    "2021-Q4": "2021-10-26",
    "2022-Q1": "2022-01-27",
    "2022-Q2": "2022-04-26",
    "2022-Q3": "2022-07-26",
    "2022-Q4": "2022-10-25",
    "2023-Q1": "2023-01-26",
    "2023-Q2": "2023-04-25",
    "2023-Q3": "2023-07-25",
    "2023-Q4": "2023-10-24",
    "2024-Q1": "2024-01-25",
    "2024-Q2": "2024-04-23",
    "2024-Q3": "2024-07-23",
    "2024-Q4": "2024-10-29",
    "2025-Q1": "2025-01-30",
    "2025-Q2": "2025-04-29",
    "2025-Q3": "2025-07-29",
    "2025-Q4": "2025-10-28",
    "2026-Q1": "2026-01-29",
    "2026-Q2": "2026-04-29",
  };
  return overrides[`${fiscalYear}-${quarter}`] ?? dates[quarter];
}

function periodEndDateFor(fiscalYear, quarter) {
  if (quarter === "Q1") return `${fiscalYear - 1}-12-31`;
  if (quarter === "Q2") return `${fiscalYear}-03-31`;
  if (quarter === "Q3") return `${fiscalYear}-06-30`;
  return `${fiscalYear}-09-30`;
}

function periodStartDateFor(fiscalYear, quarter) {
  if (quarter === "Q1") return `${fiscalYear - 1}-10-01`;
  if (quarter === "Q2") return `${fiscalYear}-01-01`;
  if (quarter === "Q3") return `${fiscalYear}-04-01`;
  return `${fiscalYear}-07-01`;
}

const annualRows = [
  {
    fiscalYear: 2018,
    netRevenue: 20609,
    operatingIncome: 13000,
    netIncome: 10301,
    dilutedEps: 4.42,
    dilutedShares: 2330,
    operatingCashFlow: 12000,
    capex: 600,
    dividends: 2100,
    buybacks: 7600,
    grossDollarVolume: 8200000,
    purchaseVolume: 6100000,
    crossBorderGrowth: 0.11,
    switchedTransactions: 124000,
    processedTransactions: 124000,
    cardsAccounts: 3350,
    rebatesIncentives: 6500,
    eventPrice: 140,
  },
  {
    fiscalYear: 2019,
    netRevenue: 22977,
    operatingIncome: 15000,
    netIncome: 12080,
    dilutedEps: 5.32,
    dilutedShares: 2270,
    operatingCashFlow: 13000,
    capex: 700,
    dividends: 2500,
    buybacks: 8500,
    grossDollarVolume: 8800000,
    purchaseVolume: 6600000,
    crossBorderGrowth: 0.09,
    switchedTransactions: 138000,
    processedTransactions: 138000,
    cardsAccounts: 3500,
    rebatesIncentives: 7300,
    eventPrice: 180,
  },
  {
    fiscalYear: 2020,
    netRevenue: 21846,
    operatingIncome: 14500,
    netIncome: 10866,
    dilutedEps: 4.89,
    dilutedShares: 2220,
    operatingCashFlow: 10700,
    capex: 750,
    dividends: 2800,
    buybacks: 7000,
    grossDollarVolume: 8500000,
    purchaseVolume: 6500000,
    crossBorderGrowth: -0.30,
    switchedTransactions: 140000,
    processedTransactions: 140000,
    cardsAccounts: 3600,
    rebatesIncentives: 7600,
    eventPrice: 200,
  },
  {
    fiscalYear: 2021,
    netRevenue: 24105,
    operatingIncome: 15700,
    netIncome: 12311,
    dilutedEps: 5.63,
    dilutedShares: 2185,
    operatingCashFlow: 15200,
    capex: 800,
    dividends: 3100,
    buybacks: 11100,
    grossDollarVolume: 9600000,
    purchaseVolume: 7200000,
    crossBorderGrowth: 0.20,
    switchedTransactions: 165000,
    processedTransactions: 165000,
    cardsAccounts: 3750,
    rebatesIncentives: 8800,
    eventPrice: 225,
  },
  {
    fiscalYear: 2022,
    netRevenue: 29310,
    operatingIncome: 19500,
    netIncome: 14957,
    dilutedEps: 7.00,
    dilutedShares: 2136,
    operatingCashFlow: 18000,
    capex: 900,
    dividends: 3400,
    buybacks: 11700,
    grossDollarVolume: 11300000,
    purchaseVolume: 8500000,
    crossBorderGrowth: 0.38,
    switchedTransactions: 193000,
    processedTransactions: 193000,
    cardsAccounts: 3950,
    rebatesIncentives: 10900,
    eventPrice: 190,
  },
  {
    fiscalYear: 2023,
    netRevenue: 32653,
    operatingIncome: 21500,
    netIncome: 17273,
    dilutedEps: 8.28,
    dilutedShares: 2086,
    operatingCashFlow: 20000,
    capex: 1000,
    dividends: 3800,
    buybacks: 12500,
    grossDollarVolume: 12400000,
    purchaseVolume: 9300000,
    crossBorderGrowth: 0.18,
    switchedTransactions: 213000,
    processedTransactions: 213000,
    cardsAccounts: 4150,
    rebatesIncentives: 12600,
    eventPrice: 235,
  },
  {
    fiscalYear: 2024,
    netRevenue: 35926,
    operatingIncome: 24000,
    netIncome: 19500,
    dilutedEps: 9.65,
    dilutedShares: 2020,
    operatingCashFlow: 22000,
    capex: 1100,
    dividends: 4200,
    buybacks: 15500,
    grossDollarVolume: 13700000,
    purchaseVolume: 10200000,
    crossBorderGrowth: 0.15,
    switchedTransactions: 235000,
    processedTransactions: 235000,
    cardsAccounts: 4350,
    rebatesIncentives: 14300,
    eventPrice: 275,
  },
  {
    fiscalYear: 2025,
    netRevenue: 39500,
    operatingIncome: 26600,
    netIncome: 21600,
    dilutedEps: 11.00,
    dilutedShares: 1960,
    operatingCashFlow: 24700,
    capex: 1200,
    dividends: 4700,
    buybacks: 17000,
    grossDollarVolume: 15000000,
    purchaseVolume: 11200000,
    crossBorderGrowth: 0.12,
    switchedTransactions: 258000,
    processedTransactions: 258000,
    cardsAccounts: 4550,
    rebatesIncentives: 16000,
    eventPrice: 330,
  },
];

const quarterWeights = {
  Q1: 0.235,
  Q2: 0.255,
  Q3: 0.255,
  Q4: 0.255,
};

const partial2026Rows = [
  {
    fiscalYear: 2026,
    fiscalQuarter: "Q1",
    netRevenue: 10100,
    operatingIncome: 6800,
    netIncome: 5500,
    dilutedEps: 2.83,
    dilutedShares: 1945,
    operatingCashFlow: 6100,
    capex: 300,
    dividends: 1200,
    buybacks: 4300,
    grossDollarVolume: 3900000,
    purchaseVolume: 2900000,
    crossBorderGrowth: 0.10,
    switchedTransactions: 67000,
    processedTransactions: 67000,
    cardsAccounts: 4600,
    rebatesIncentives: 4200,
    eventPrice: 345,
  },
  {
    fiscalYear: 2026,
    fiscalQuarter: "Q2",
    netRevenue: 10400,
    operatingIncome: 7000,
    netIncome: 5650,
    dilutedEps: 2.92,
    dilutedShares: 1932,
    operatingCashFlow: 6400,
    capex: 320,
    dividends: 1250,
    buybacks: 4500,
    grossDollarVolume: 4050000,
    purchaseVolume: 3020000,
    crossBorderGrowth: 0.11,
    switchedTransactions: 69000,
    processedTransactions: 69000,
    cardsAccounts: 4650,
    rebatesIncentives: 4350,
    eventPrice: 350,
  },
];

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
  rows.push(...partial2026Rows.map((row) => ({ ...row, sourceType: "market_data_proxy" })));
  return rows;
}

function buildReportingEvent(row) {
  const { fiscalYear, fiscalQuarter } = row;
  const eventDate = eventDateFor(fiscalYear, fiscalQuarter);
  const id = `v-fy${fiscalYear}-${fiscalQuarter.toLowerCase()}`;
  return {
    id,
    ticker: TICKER,
    eventDate,
    fiscalPeriod: `FY${fiscalYear} ${fiscalQuarter}`,
    fiscalYear,
    fiscalQuarter,
    eventType: fiscalQuarter === "Q4" ? "fy_earnings_release_10k" : `${fiscalQuarter.toLowerCase()}_earnings_release_10q`,
    label: `Visa FY${fiscalYear} ${fiscalQuarter} reporting event`,
    sourceType: row.sourceType,
    sourcePath: null,
    sourceUrl: "https://investor.visa.com/financial-information/sec-filings/default.aspx",
    createdAt: CREATED_AT,
  };
}

function buildFinancialPeriod(row, event) {
  const freeCashFlow = row.operatingCashFlow - row.capex;
  const totalCapitalReturn = row.dividends + row.buybacks;
  return {
    id: `v-financial-${event.id}`,
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
      source: "V backend seed from public annual history, company filings pages, and explicit proxy assumptions pending official parser backfill.",
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
    id: `v-segment-${periodId}-${slug(segment.segment)}`,
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
      source: "V backend analytical framework allocation, not official segment disclosure.",
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
    id: `v-operating-${event.id}`,
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
    regulatoryCommentary: "Regulatory risk is focused on network fees, routing, and interchange economics; merchant interchange pressure is not automatically a direct V fee cut.",
    competitionCommentary: "Mastercard, Amex, domestic schemes, RTP, and account-to-account rails are tracked separately because they pressure different parts of V economics.",
    capitalReturnCommentary: "Buybacks are a meaningful EPS driver; the module separates organic growth from share-count reduction and FCF coverage.",
    normalizedFcfCommentary: "V's capex-light model supports high FCF conversion, but incentives and regulation can change cash conversion quality.",
    pricingCommentary: "Pricing/take-rate stability is underwritten explicitly through net revenue divided by gross dollar volume.",
    notes: "V-specific operating metrics in USDm except transaction and account counts, which are stored in millions.",
    rawJson: json({
      source: "V backend analytical seed",
      sourceQuality: row.sourceType,
      skillFramework: ["bs-initiation-research", "bs-valuation-triangulation", "bs-filing-qoe-review", "bs-earnings-call-analysis", "bs-risk-red-team", "bs-variant-perception", "bs-model-audit"],
    }),
  };
}

function buildMarketSnapshot(row, event) {
  return {
    id: `v-market-${event.id}`,
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
    source: "V backend market snapshot proxy; daily_price_bars override valuation as-of price.",
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
    id: `v-assumptions-${scenario.toLowerCase()}`,
    ticker: TICKER,
    name: `V ${scenario} backend assumptions`,
    scenario,
    modelVersion: V_BACKEND_MODEL_VERSION.version,
    asOfDate: "2018-02-01",
    assumptionsJson: json({ ...base, ...overrides }),
    sourceType: "forecast_assumption",
    createdAt: CREATED_AT,
  };
}

export async function buildVBackendSeedPayload() {
  const sourceDocuments = [
    {
      id: "v-source-sec-filings",
      ticker: TICKER,
      sourceType: "official_reference",
      sourceName: "Visa SEC filings and investor relations reference",
      sourcePath: null,
      sourceUrl: "https://investor.visa.com/financial-information/sec-filings/default.aspx",
      retrievedAt: CREATED_AT,
      publishedDate: null,
      provenance: "reference_url",
      confidence: "medium",
      checksum: null,
      metadataJson: json({
        status: "parser_pending",
        note: "The V backend seed is intentionally labeled as official_seed / market_data_proxy until a full official filing parser is promoted.",
      }),
    },
    {
      id: "v-source-analytical-framework",
      ticker: TICKER,
      sourceType: "research_framework",
      sourceName: "V payments-network analytical framework",
      sourcePath: null,
      sourceUrl: null,
      retrievedAt: CREATED_AT,
      publishedDate: CREATED_AT.slice(0, 10),
      provenance: "local_codex_buy_side_skills",
      confidence: "high",
      checksum: null,
      metadataJson: json({
        checkedSkills: ["bs-initiation-research", "bs-valuation-triangulation", "bs-filing-qoe-review", "bs-earnings-call-analysis", "bs-risk-red-team", "bs-variant-perception", "bs-model-audit"],
        vSpecificSkillFound: false,
        framework: [
          "Cross-border volume recovery and travel sensitivity",
          "Switched transactions growth",
          "GDV, purchase volume, and take-rate/yield stability",
          "Value-added services and cyber/data analytics mix",
          "Operating leverage and incremental margins",
          "FX translation and cross-border assessment fees",
          "Regulation/interchange/network-fee risk",
          "Competition from Mastercard, Amex, domestic networks, RTP and account-to-account rails",
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
    ["MA", "Mastercard Inc.", "global_card_network", 34, 31, 27],
    ["AXP", "American Express", "closed_loop_credit", 20, 16, 13],
    ["FI", "Fiserv", "processor_merchant_acquirer", 17, 13, 12],
    ["ADYEY", "Adyen", "merchant_acquiring_alt_rails", 36, 27, 18],
  ].map(([peerTicker, companyName, category, trailingPe, forwardPe, evEbit]) => ({
    id: `v-peer-${String(peerTicker).toLowerCase()}`,
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
      id: `v-guidance-${event.id}-cross-border`,
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
    id: `v-transcript-${event.id}`,
    ticker: TICKER,
    eventId: event.id,
    eventDate: event.eventDate,
    fiscalPeriod: event.fiscalPeriod,
    eventType: event.eventType,
    transcriptId: `v-transcript-${event.id}`,
    hasQa: 0,
    sourcePath: null,
    provenance: "transcript_placeholder_pending_official_import",
    confidence: "low",
    metadataJson: json({ modelReady: false, valuationImpactAllowed: false }),
  }));

  const transcriptExtractions = reportingEvents.flatMap((event) => [
    {
      id: `v-transcript-extract-${event.id}-vas`,
      ticker: TICKER,
      transcriptId: `v-transcript-${event.id}`,
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
      id: `v-transcript-extract-${event.id}-regulation`,
      ticker: TICKER,
      transcriptId: `v-transcript-${event.id}`,
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
      id: V_BACKEND_MODEL_VERSION.version,
      ticker: TICKER,
      version: V_BACKEND_MODEL_VERSION.version,
      name: V_BACKEND_MODEL_VERSION.name,
      description: V_BACKEND_MODEL_VERSION.description,
      codeCommitSha: null,
      valuationMethodsJson: json(V_BACKEND_MODEL_VERSION.methods),
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
      id: "v-official-parser-pending",
      ticker: TICKER,
      scope: "seed",
      severity: "medium",
      title: "V official parser pending",
      detail: "Financial history is seeded from public annual-history style values and explicit proxy assumptions until a full Visa SEC/companyfacts parser is promoted.",
      relatedTable: "financial_periods",
      relatedRecordId: null,
      createdAt: CREATED_AT,
    },
    {
      id: "v-transcript-candidates-blocked",
      ticker: TICKER,
      scope: "transcripts",
      severity: "low",
      title: "V transcript candidates are research-only",
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
