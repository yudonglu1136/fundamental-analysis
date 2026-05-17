import { createServer } from "vite";
import { DGE_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "DGE.L";
const CREATED_AT = new Date().toISOString();

function json(value) {
  return JSON.stringify(value ?? {});
}

function event(id, eventDate, fiscalPeriod, fiscalYear, eventType, label, sourceType, sourcePath = null) {
  return {
    id,
    ticker: TICKER,
    eventDate,
    fiscalPeriod,
    fiscalYear,
    eventType,
    label,
    sourceType,
    sourcePath,
    createdAt: CREATED_AT,
  };
}

function proxyPriceGbp(eventDate) {
  const year = Number(eventDate.slice(0, 4));
  const anchor = {
    2018: 27.2,
    2019: 30.5,
    2020: 25.5,
    2021: 34.0,
    2022: 36.5,
    2023: 33.0,
    2024: 25.5,
    2025: 19.0,
    2026: 15.0,
  }[year] ?? 20;
  return anchor;
}

function historicalProxyFinancial(eventRow, index) {
  const yearsFromStart = index / 2;
  const isH1 = /H1/i.test(eventRow.fiscalPeriod ?? "");
  const isTrading = /trading/i.test(eventRow.eventType);
  const fullYearSales = 16_600 + yearsFromStart * 380 - (eventRow.fiscalYear >= 2024 ? 1_100 : 0);
  const sales = isTrading ? fullYearSales * 0.24 : isH1 ? fullYearSales * 0.49 : fullYearSales;
  const margin = 0.292 - Math.max(0, eventRow.fiscalYear - 2022) * 0.006;
  return {
    id: `dge-proxy-${eventRow.id}`,
    ticker: TICKER,
    periodId: eventRow.id,
    fiscalYear: eventRow.fiscalYear,
    periodType: isH1 ? "half-year" : isTrading ? "trading-update" : "annual",
    eventId: eventRow.id,
    asOfDate: eventRow.eventDate,
    sourceType: "forecast_assumption",
    currency: "USD",
    reportedNetSales: sales,
    organicNetSalesGrowth: eventRow.fiscalYear <= 2021 ? -0.03 + yearsFromStart * 0.012 : eventRow.fiscalYear <= 2023 ? 0.08 : -0.01,
    volumeGrowth: eventRow.fiscalYear <= 2021 ? -0.025 : eventRow.fiscalYear <= 2023 ? 0.02 : -0.01,
    priceMixGrowth: eventRow.fiscalYear <= 2021 ? -0.005 : eventRow.fiscalYear <= 2023 ? 0.06 : 0.0,
    fxImpact: null,
    revenue: sales,
    costOfRevenue: null,
    grossProfit: null,
    grossMargin: null,
    operatingIncome: isTrading ? null : sales * margin,
    operatingMargin: isTrading ? null : margin,
    netIncome: null,
    dilutedEps: isTrading ? null : 1.35 + yearsFromStart * 0.035,
    dilutedShares: 2_220,
    operatingCashFlow: isTrading ? null : sales * 0.2,
    capex: isTrading ? null : sales * 0.065,
    freeCashFlow: isTrading ? null : sales * 0.135,
    depreciationAmortization: null,
    stockBasedCompensation: null,
    cashAndShortTermInvestments: null,
    debt: null,
    netDebt: 17_000 + yearsFromStart * 520,
    adjustedEbitda: isTrading ? null : sales * (margin + 0.04),
    netDebtToEbitda: isTrading ? null : 2.7 + Math.max(0, eventRow.fiscalYear - 2022) * 0.15,
    operatingLeaseLiabilities: null,
    ppeNet: null,
    dividendsPaid: null,
    dividendPerShare: isTrading ? null : 0.9 + yearsFromStart * 0.012,
    buybacks: eventRow.fiscalYear < 2024 ? 500 : 0,
    currentPrice: proxyPriceGbp(eventRow.eventDate),
    rawJson: json({
      sourceBoundary:
        "Historical DGE proxy row for backend pilot only. Diageo did not provide a full official quarterly statement for this event in the local source layer.",
      sourceType: "forecast_assumption",
      officialActual: false,
      currencyMetadata: "USD-equivalent values for compatibility with existing DGE valuation assumptions.",
    }),
  };
}

function mapReportedPeriod(period) {
  const eventId = period.id === "9m-fy2026" ? "q3-fy2026" : period.id;
  return {
    id: `dge-financial-${period.id}`,
    ticker: TICKER,
    periodId: period.id,
    fiscalYear: period.fiscalYear,
    periodType: period.periodType === "FY" ? "annual" : period.periodType === "H1" ? "half-year" : period.periodType === "Q" ? "trading-update" : "ytd",
    eventId,
    asOfDate: period.id === "fy2025" ? "2025-08-05" : period.id === "h1-fy2026" ? "2026-02-25" : period.id === "q1-fy2026" ? "2025-11-06" : period.id === "q3-fy2026" ? "2026-05-06" : "2026-05-06",
    sourceType: "official_actual",
    currency: "USD",
    reportedNetSales: period.reportedNetSales,
    organicNetSalesGrowth: period.organicNetSalesGrowth,
    volumeGrowth: period.volumeGrowth,
    priceMixGrowth: period.priceMixGrowth,
    fxImpact: period.fxImpactPct,
    revenue: period.reportedNetSales,
    costOfRevenue: null,
    grossProfit: null,
    grossMargin: null,
    operatingIncome: period.operatingProfitBeforeExceptional ?? period.reportedOperatingProfit,
    operatingMargin: period.operatingMarginBeforeExceptional ?? period.operatingMargin,
    netIncome: null,
    dilutedEps: period.epsBeforeExceptional ?? period.eps,
    dilutedShares: period.shareCount,
    operatingCashFlow: period.netCashFromOperatingActivities,
    capex: period.capex,
    freeCashFlow: period.freeCashFlow,
    depreciationAmortization: null,
    stockBasedCompensation: null,
    cashAndShortTermInvestments: null,
    debt: null,
    netDebt: period.netDebt,
    adjustedEbitda: period.adjustedEbitda,
    netDebtToEbitda: period.leverageRatio,
    operatingLeaseLiabilities: null,
    ppeNet: null,
    dividendsPaid: null,
    dividendPerShare: period.dividendPerShare,
    buybacks: null,
    currentPrice: null,
    rawJson: json({ ...period, currency: "USD", officialActual: true }),
  };
}

function mapRegion(region) {
  return {
    id: `dge-segment-${region.periodId}-${region.region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ticker: TICKER,
    periodId: region.periodId,
    eventId: region.periodId,
    asOfDate: region.periodId === "q1-fy2026" ? "2025-11-06" : "2026-05-06",
    segment: region.region,
    taxonomy: "regional_segment",
    currency: "USD",
    revenue: region.reportedNetSales,
    costOfRevenue: null,
    operatingExpenses: null,
    operatingIncome: region.operatingProfit,
    operatingMargin: region.margin,
    grossMargin: null,
    growth: region.organicNetSalesGrowth,
    constantCurrencyGrowth: region.organicNetSalesGrowth,
    volumeGrowth: region.volumeGrowth,
    priceMixGrowth: region.priceMixGrowth,
    inventoryDistortion: /World Cup|restocking|destocking|shipment/i.test(region.channelInventoryCommentary) ? 1 : 0,
    sourceType: "official_actual",
    notes: region.channelInventoryCommentary,
    rawJson: json(region),
  };
}

function mapCategory(category) {
  return {
    id: `dge-category-${category.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ticker: TICKER,
    periodId: "q3-fy2026",
    eventId: "q3-fy2026",
    asOfDate: "2026-05-06",
    segment: category.category,
    taxonomy: "category_mix",
    currency: null,
    revenue: null,
    costOfRevenue: null,
    operatingExpenses: null,
    operatingIncome: null,
    operatingMargin: null,
    grossMargin: null,
    growth: category.categoryGrowth,
    constantCurrencyGrowth: category.categoryGrowth,
    volumeGrowth: null,
    priceMixGrowth: category.priceMixSustainability / 100,
    inventoryDistortion: Math.abs(category.depletionsVsShipments),
    sourceType: "research_only",
    notes: `Category mix row for ${category.category}; public data does not provide Diageo official category P&L.`,
    rawJson: json(category),
  };
}

function marketSnapshotForEvent(eventRow, marketData) {
  const priceGbp = eventRow.id === "q3-fy2026" ? marketData.londonPriceGbp : proxyPriceGbp(eventRow.eventDate);
  const marketCapGbp = priceGbp * marketData.sharesOutstandingM;
  return {
    id: `dge-market-${eventRow.id}`,
    ticker: TICKER,
    asOfDate: eventRow.eventDate,
    priceDate: eventRow.eventDate,
    currentPrice: priceGbp,
    priceUnit: "GBP",
    currency: "GBP",
    marketCap: marketCapGbp,
    marketCapCurrency: "GBP",
    enterpriseValue: marketCapGbp + (marketData.netDebtUsdM / marketData.gbpUsd),
    enterpriseValueCurrency: "GBP",
    sharesOutstanding: marketData.sharesOutstandingM,
    netDebt: marketData.netDebtUsdM,
    netDebtCurrency: "USD",
    previousClose: priceGbp,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    dividendYield: marketData.dividendYield,
    beta: null,
    source: eventRow.id === "q3-fy2026" ? marketData.sourceName : "research_only historical market proxy until daily price import is run",
    fetchedAt: CREATED_AT,
    rawJson: json({
      warning:
        eventRow.id === "q3-fy2026"
          ? "Current local Stooq snapshot."
          : "Proxy/backcast market snapshot; valuation service replaces this with daily price bars when available.",
      dgeTradesInGBp: true,
      currentPriceStoredInGbp: true,
    }),
  };
}

function guidanceRows(guidance) {
  return [
    ["organic_net_sales_growth", guidance.organicNetSalesGrowthLow, guidance.organicNetSalesGrowthHigh, null, "percent"],
    ["organic_operating_profit_growth", guidance.organicOperatingProfitGrowthLow, guidance.organicOperatingProfitGrowthHigh, null, "percent"],
    ["free_cash_flow", null, null, guidance.freeCashFlow, "USD millions"],
    ["accelerate_savings", null, null, guidance.accelerateSavings, "USD millions"],
    ["dividend_floor", null, null, guidance.dividendFloor, "USD/share"],
  ].map(([metric, lowValue, highValue, midpointValue, unit]) => ({
    id: `dge-guidance-fy2026-${metric}`,
    ticker: TICKER,
    eventId: "q3-fy2026",
    asOfDate: "2026-05-06",
    fiscalPeriodTarget: guidance.period,
    metric,
    guidanceType: "management_guidance",
    lowValue,
    highValue,
    midpointValue,
    unit,
    quote: null,
    speaker: "Diageo management",
    sourcePath: "src/stocks/dge/data/guidanceData.ts",
    confidence: "high",
    humanReviewStatus: "reviewed",
    modelReady: 1,
    valuationImpactAllowed: 1,
    rawJson: json(guidance),
  }));
}

async function loadDgeFrontendModules() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const dataModule = await server.ssrLoadModule("/src/stocks/dge/data/index.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/dge/assumptions.ts");
    return {
      dataset: dataModule.dgeDataset,
      scenarioPresets: assumptionsModule.dgeScenarioPresets,
    };
  } finally {
    await server.close();
  }
}

export async function buildDgeBackendSeedPayload() {
  const { dataset, scenarioPresets } = await loadDgeFrontendModules();
  const sourceDocuments = dataset.evidenceData.map((record) => ({
    id: `dge-source-${record.id}`,
    ticker: TICKER,
    sourceType: record.sourceType === "research_assumption" ? "research_only" : record.sourceType,
    sourceName: record.sourceTitle,
    sourcePath: record.localPath ?? null,
    sourceUrl: record.url ?? null,
    retrievedAt: CREATED_AT,
    publishedDate: record.date,
    provenance: record.notes ?? record.extractedMetric,
    confidence: record.confidence,
    checksum: null,
    metadataJson: json(record),
  }));

  const baseEvents = [
    event("fy2018", "2018-07-26", "FY 2018", 2018, "annual_results", "FY 2018 annual results", "forecast_assumption"),
    event("h1-fy2019", "2019-01-31", "H1 FY 2019", 2019, "interim_results", "H1 FY 2019 interim results", "forecast_assumption"),
    event("fy2019", "2019-07-25", "FY 2019", 2019, "annual_results", "FY 2019 annual results", "forecast_assumption"),
    event("h1-fy2020", "2020-01-30", "H1 FY 2020", 2020, "interim_results", "H1 FY 2020 interim results", "forecast_assumption"),
    event("fy2020", "2020-08-04", "FY 2020", 2020, "annual_results", "FY 2020 annual results", "forecast_assumption"),
    event("h1-fy2021", "2021-01-28", "H1 FY 2021", 2021, "interim_results", "H1 FY 2021 interim results", "forecast_assumption"),
    event("fy2021", "2021-07-29", "FY 2021", 2021, "annual_results", "FY 2021 annual results", "forecast_assumption"),
    event("h1-fy2022", "2022-01-27", "H1 FY 2022", 2022, "interim_results", "H1 FY 2022 interim results", "forecast_assumption"),
    event("fy2022", "2022-07-28", "FY 2022", 2022, "annual_results", "FY 2022 annual results", "forecast_assumption"),
    event("h1-fy2023", "2023-01-26", "H1 FY 2023", 2023, "interim_results", "H1 FY 2023 interim results", "forecast_assumption"),
    event("fy2023", "2023-08-01", "FY 2023", 2023, "annual_results", "FY 2023 annual results", "forecast_assumption"),
    event("h1-fy2024", "2024-01-30", "H1 FY 2024", 2024, "interim_results", "H1 FY 2024 interim results", "forecast_assumption"),
    event("fy2024", "2024-07-30", "FY 2024", 2024, "annual_results", "FY 2024 annual results", "forecast_assumption"),
    event("h1-fy2025", "2025-02-04", "H1 FY 2025", 2025, "interim_results", "H1 FY 2025 interim results", "forecast_assumption"),
  ];
  const actualEvents = [
    event("fy2025", "2025-08-05", "FY 2025", 2025, "annual_results", "FY 2025 preliminary results", "official_actual", "src/stocks/dge/data/reportedData.ts"),
    event("q1-fy2026", "2025-11-06", "Q1 FY 2026", 2026, "trading_update", "FY 2026 Q1 trading statement", "official_actual", "src/stocks/dge/data/reportedData.ts"),
    event("h1-fy2026", "2026-02-25", "H1 FY 2026", 2026, "interim_results", "FY 2026 interim results", "official_actual", "src/stocks/dge/data/reportedData.ts"),
    event("q3-fy2026", "2026-05-06", "Q3 FY 2026", 2026, "trading_update", "FY 2026 Q3 trading statement", "official_actual", "src/stocks/dge/data/reportedData.ts"),
  ];
  const reportingEvents = [...baseEvents, ...actualEvents];
  const actualFinancials = dataset.periods.map(mapReportedPeriod);
  const actualEventIds = new Set(actualFinancials.map((row) => row.eventId));
  const proxyFinancials = reportingEvents
    .filter((row) => !actualEventIds.has(row.id))
    .map((row, index) => historicalProxyFinancial(row, index));

  const peerSnapshots = dataset.competitorData.map((peer) => ({
    id: `dge-peer-${peer.ticker.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ticker: TICKER,
    asOfDate: "2026-05-06",
    peerTicker: peer.ticker,
    peerName: peer.company,
    companyName: peer.company,
    category: peer.focus,
    peerGroup: "global_beverages",
    marketCap: null,
    enterpriseValue: null,
    trailingPe: null,
    forwardPe: null,
    forwardEvEbitda: null,
    priceToSales: null,
    dividendYield: null,
    beta: null,
    currency: null,
    source: "src/stocks/dge/data/competitorData.ts",
    fetchedAt: CREATED_AT,
    confidenceLevel: "medium",
    absoluteValueUse: "metadata_only_mixed_currency",
    rawJson: json(peer),
  }));

  const transcriptEvents = [
    {
      id: "dge-transcript-h1-fy2026",
      ticker: TICKER,
      eventId: "h1-fy2026",
      eventDate: "2026-02-25",
      fiscalPeriod: "H1 FY 2026",
      eventType: "earnings_transcript",
      transcriptId: "dge-h1-fy2026-qa",
      hasQa: 1,
      sourcePath: "src/stocks/dge/data/evidence.ts",
      provenance: "management Q&A commentary captured in evidence layer",
      confidence: "medium",
      metadataJson: json({ sourceLayer: "transcript_commentary", modelReady: false }),
    },
  ];
  const transcriptExtractions = [
    "US Spirits",
    "North America weakness",
    "Tequila pricing",
    "LAC destocking",
    "Dividend rebasing",
    "FCF guidance",
  ].map((topic) => ({
    id: `dge-transcript-h1-fy2026-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ticker: TICKER,
    transcriptId: "dge-h1-fy2026-qa",
    eventId: "h1-fy2026",
    extractionType: "topic_commentary",
    topic,
    segment: null,
    speaker: "Diageo management",
    section: "Q&A",
    supportingQuoteShort: null,
    confidence: "medium",
    needsHumanReview: 1,
    modelReady: 0,
    valuationImpactAllowed: 0,
    rawJson: json({ sourceLayer: "transcript_commentary", valuationImpactAllowed: false }),
  }));

  const assumptionSets = Object.entries(scenarioPresets).map(([scenario, assumptions]) => ({
    id: `dge-assumption-${scenario.toLowerCase()}-${DGE_BACKEND_MODEL_VERSION.version}`,
    ticker: TICKER,
    name: `${scenario} DGE backend assumptions`,
    scenario,
    modelVersion: DGE_BACKEND_MODEL_VERSION.version,
    asOfDate: "2026-05-06",
    assumptionsJson: json(assumptions),
    sourceType: "forecast_assumption",
    createdAt: CREATED_AT,
  }));

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods: [...proxyFinancials, ...actualFinancials],
    segmentFinancials: [...dataset.reportedData.regions.map(mapRegion), ...dataset.reportedData.categories.map(mapCategory)],
    marketSnapshots: reportingEvents.map((row) => marketSnapshotForEvent(row, dataset.marketData)),
    peerSnapshots,
    guidanceItems: dataset.guidanceData.flatMap(guidanceRows),
    transcriptEvents,
    transcriptExtractions,
    modelVersions: [{
      id: DGE_BACKEND_MODEL_VERSION.version,
      ticker: TICKER,
      version: DGE_BACKEND_MODEL_VERSION.version,
      name: DGE_BACKEND_MODEL_VERSION.name,
      description: DGE_BACKEND_MODEL_VERSION.description,
      codeCommitSha: null,
      valuationMethodsJson: json(DGE_BACKEND_MODEL_VERSION.valuationMethods),
      assumptionSchemaJson: json(DGE_BACKEND_MODEL_VERSION.assumptionSchema),
      createdAt: CREATED_AT,
    }],
    assumptionSets,
    validationWarnings: [
      {
        id: "dge-proxy-history-warning",
        ticker: TICKER,
        scope: "seed",
        severity: "medium",
        title: "Historical pre-FY2025 rows are forecast assumptions",
        detail: "The backend pilot creates previous-eight-year event slots, but pre-FY2025 financial rows are not official actuals in the local source layer.",
        relatedTable: "financial_periods",
        relatedRecordId: "dge-proxy-history",
        createdAt: CREATED_AT,
      },
      {
        id: "dge-quarterly-financials-warning",
        ticker: TICKER,
        scope: "seed",
        severity: "medium",
        title: "Diageo does not provide full quarterly financial statements",
        detail: "Q1 and Q3 trading updates are event rows with partial official metrics; missing quarterly P&L fields remain null or forecast assumptions.",
        relatedTable: "reporting_events",
        relatedRecordId: "q1-fy2026",
        createdAt: CREATED_AT,
      },
    ],
  };
}
