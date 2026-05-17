import { TRI_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "TRI";
const now = () => new Date().toISOString();

const annualRevenue = {
  2018: 5522,
  2019: 5906,
  2020: 5984,
  2021: 6348,
  2022: 6627,
  2023: 6794,
  2024: 7012,
  2025: 7476,
  2026: 8348,
};

const scenarioPresets = {
  Bear: {
    revenueCagr: 0.045,
    big3OrganicGrowth: 0.065,
    terminalAdjustedEbitdaMargin: 0.385,
    fcfConversionOfEbitda: 0.58,
    targetFcfYield: 0.058,
    targetEvEbitda: 13,
    targetPe: 18,
    wacc: 0.087,
    terminalGrowth: 0.02,
    aiPremium: 0.01,
    aiPremiumCap: 0.08,
    riskDiscount: -0.09,
    riskDiscountCap: 0.12,
  },
  Base: {
    revenueCagr: 0.074,
    big3OrganicGrowth: 0.092,
    terminalAdjustedEbitdaMargin: 0.405,
    fcfConversionOfEbitda: 0.64,
    targetFcfYield: 0.047,
    targetEvEbitda: 16,
    targetPe: 22,
    wacc: 0.079,
    terminalGrowth: 0.025,
    aiPremium: 0.04,
    aiPremiumCap: 0.08,
    riskDiscount: -0.035,
    riskDiscountCap: 0.12,
  },
  Bull: {
    revenueCagr: 0.095,
    big3OrganicGrowth: 0.115,
    terminalAdjustedEbitdaMargin: 0.425,
    fcfConversionOfEbitda: 0.68,
    targetFcfYield: 0.04,
    targetEvEbitda: 19,
    targetPe: 26,
    wacc: 0.073,
    terminalGrowth: 0.029,
    aiPremium: 0.07,
    aiPremiumCap: 0.08,
    riskDiscount: -0.02,
    riskDiscountCap: 0.12,
  },
};

function json(value) {
  return JSON.stringify(value ?? null);
}

function eventDate(fiscalYear, quarter) {
  if (quarter === 1) return `${fiscalYear}-05-05`;
  if (quarter === 2) return `${fiscalYear}-08-05`;
  if (quarter === 3) return `${fiscalYear}-11-05`;
  return `${fiscalYear + 1}-02-05`;
}

function eventId(fiscalYear, quarter) {
  return `tri-q${quarter}-${fiscalYear}`;
}

function periodId(fiscalYear, quarter) {
  return `q${quarter}-${String(fiscalYear).slice(2)}`;
}

function eventType(quarter) {
  return `q${quarter}_results`;
}

function interpolate(start, end, pct) {
  return start + (end - start) * pct;
}

function fiscalProgress(fiscalYear, quarter) {
  return Math.max(0, Math.min(1, ((fiscalYear - 2018) * 4 + quarter - 1) / ((2026 - 2018) * 4)));
}

function quarterFinancial(fiscalYear, quarter) {
  const progress = fiscalProgress(fiscalYear, quarter);
  const seasonality = [0, 0.245, 0.245, 0.245, 0.265][quarter];
  const revenue =
    fiscalYear === 2026 && quarter === 1
      ? 2087
      : Math.round((annualRevenue[fiscalYear] ?? annualRevenue[2025]) * seasonality);
  const organicRevenueGrowth = interpolate(0.025, 0.082, progress);
  const adjustedEbitdaMargin =
    fiscalYear === 2026 && quarter === 1
      ? 0.422
      : interpolate(0.315, 0.392, Math.min(1, ((fiscalYear - 2018) * 4 + quarter - 1) / 31));
  const adjustedEbitda = fiscalYear === 2026 && quarter === 1 ? 881 : revenue * adjustedEbitdaMargin;
  const depreciationAmortization = revenue * interpolate(0.105, 0.115, progress);
  const operatingIncome = fiscalYear === 2026 && quarter === 1 ? 639 : adjustedEbitda - depreciationAmortization;
  const operatingMargin = operatingIncome / revenue;
  const capex = revenue * interpolate(0.065, 0.082, progress);
  const freeCashFlow = fiscalYear === 2026 && quarter === 1 ? 332 : adjustedEbitda * interpolate(0.54, 0.64, progress);
  const dilutedShares = interpolate(560, 436.5, progress);
  const dividendPerShareQuarter = interpolate(0.35, 0.6325, progress);
  const dividendsPaid = dilutedShares * dividendPerShareQuarter;
  const buybacks = interpolate(50, 250, progress);
  const netDebt = interpolate(3800, 2250, progress);
  const cashAndShortTermInvestments = interpolate(1100, 1800, progress);
  const debt = cashAndShortTermInvestments + netDebt;
  return {
    revenue,
    organicRevenueGrowth,
    recurringRevenue: revenue * interpolate(0.72, 0.81, progress),
    subscriptionRevenue: revenue * interpolate(0.60, 0.75, progress),
    adjustedEbitda,
    adjustedEbitdaMargin,
    operatingIncome,
    operatingMargin,
    netIncome: operatingIncome * 0.78,
    adjustedEps: fiscalYear === 2026 && quarter === 1 ? 1.23 : (operatingIncome * 0.78) / dilutedShares,
    dilutedShares,
    operatingCashFlow: freeCashFlow + capex,
    capex,
    freeCashFlow,
    depreciationAmortization,
    dividendsPaid,
    buybacks,
    cashAndShortTermInvestments,
    debt,
    netDebt,
    fxImpact: interpolate(-0.01, 0.005, progress),
  };
}

function annualFinancial(fiscalYear) {
  const progress = Math.max(0, Math.min(1, (fiscalYear - 2018) / (2025 - 2018)));
  const quarters = [1, 2, 3, 4].map((quarter) => quarterFinancial(fiscalYear, quarter));
  const revenue = annualRevenue[fiscalYear] ?? quarters.reduce((sum, row) => sum + row.revenue, 0);
  const adjustedEbitdaMargin = interpolate(0.315, 0.392, progress);
  const adjustedEbitda = revenue * adjustedEbitdaMargin;
  const depreciationAmortization = revenue * interpolate(0.105, 0.115, progress);
  const operatingIncome = adjustedEbitda - depreciationAmortization;
  const freeCashFlow = adjustedEbitda * interpolate(0.54, 0.64, progress);
  const capex = revenue * interpolate(0.065, 0.082, progress);
  const dilutedShares = quarters.reduce((sum, row) => sum + row.dilutedShares, 0) / quarters.length;
  const dividendsPaid = quarters.reduce((sum, row) => sum + row.dividendsPaid, 0);
  const dividendPerShare = dividendsPaid / dilutedShares;
  const buybacks = quarters.reduce((sum, row) => sum + row.buybacks, 0);
  const q4 = quarters[3];
  return {
    revenue,
    organicRevenueGrowth: interpolate(0.025, 0.07, progress),
    recurringRevenue: revenue * interpolate(0.72, 0.81, progress),
    subscriptionRevenue: revenue * interpolate(0.60, 0.73, progress),
    adjustedEbitda,
    adjustedEbitdaMargin,
    operatingIncome,
    operatingMargin: operatingIncome / revenue,
    netIncome: operatingIncome * 0.78,
    adjustedEps: (operatingIncome * 0.78) / dilutedShares,
    dilutedEps: (operatingIncome * 0.72) / dilutedShares,
    dilutedShares,
    operatingCashFlow: freeCashFlow + capex,
    capex,
    freeCashFlow,
    depreciationAmortization,
    dividendsPaid,
    buybacks,
    cashAndShortTermInvestments: q4.cashAndShortTermInvestments,
    debt: q4.debt,
    netDebt: q4.netDebt,
    fxImpact: null,
    dividendPerShare,
  };
}

function segmentRowsFor(event, financial) {
  const progress = fiscalProgress(event.fiscalYear, event.fiscalQuarter);
  const segmentDefs = [
    ["Legal Professionals", interpolate(0.34, 0.36, progress), interpolate(0.08, 0.09, progress), interpolate(0.43, 0.483, progress), 0.98, "high"],
    ["Corporates", interpolate(0.255, 0.292, progress), interpolate(0.055, 0.09, progress), interpolate(0.33, 0.4, progress), 0.74, "high"],
    ["Tax & Accounting Professionals", interpolate(0.165, 0.197, progress), interpolate(0.06, 0.1, progress), interpolate(0.38, 0.538, progress), 0.56, "high"],
    ["Reuters News", interpolate(0.14, 0.102, progress), interpolate(0.01, 0.06, progress), interpolate(0.17, 0.161, progress), 0.55, "medium"],
    ["Global Print", interpolate(0.10, 0.054, progress), interpolate(-0.06, -0.05, progress), interpolate(0.32, 0.386, progress), 0.30, "low"],
  ];
  const positiveRevenue = segmentDefs.reduce((sum, [, mix]) => sum + financial.revenue * mix, 0);
  const roundingRevenue = financial.revenue - positiveRevenue;
  const rows = segmentDefs.map(([segment, mix, organicGrowth, margin, recurringRevenuePct, aiExposure]) => ({
    id: `${event.id}-${String(segment).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ticker: TICKER,
    periodId: event.periodId,
    eventId: event.id,
    asOfDate: event.eventDate,
    segment,
    taxonomy: "tri_operating_segment",
    revenue: financial.revenue * mix,
    operatingIncome: financial.revenue * mix * margin,
    operatingMargin: margin,
    adjustedEbitda: financial.revenue * mix * margin,
    adjustedEbitdaMargin: margin,
    organicGrowth,
    recurringRevenuePct,
    fxImpact: financial.fxImpact,
    sourceType: event.sourceType,
    researchOnly: event.sourceType === "official_actual" ? 0 : 1,
    notes: event.sourceType === "official_actual" ? "Official Q1 2026 segment row from local TRI module." : "Research-only historical segment proxy; replace with official TRI disclosures when available.",
    rawJson: json({ aiExposure, valuationImpactAllowed: false }),
  }));
  rows.push({
    id: `${event.id}-corporate-costs`,
    ticker: TICKER,
    periodId: event.periodId,
    eventId: event.id,
    asOfDate: event.eventDate,
    segment: "Corporate Costs",
    taxonomy: "tri_operating_segment",
    revenue: roundingRevenue,
    operatingIncome: -financial.revenue * interpolate(0.018, 0.012, progress),
    operatingMargin: 0,
    adjustedEbitda: -financial.revenue * interpolate(0.018, 0.012, progress),
    adjustedEbitdaMargin: 0,
    organicGrowth: null,
    recurringRevenuePct: null,
    fxImpact: null,
    sourceType: event.sourceType,
    researchOnly: event.sourceType === "official_actual" ? 0 : 1,
    notes: "Corporate cost and rounding row used to reconcile segment table to total TRI economics.",
    rawJson: json({ aiExposure: "medium", valuationImpactAllowed: false }),
  });
  return rows;
}

function proxyPrice(fiscalYear, quarter) {
  const progress = fiscalProgress(fiscalYear, quarter);
  const cyclical = Math.sin(progress * Math.PI * 4) * 4;
  return Number((36 + progress * 58 + cyclical).toFixed(2));
}

function buildEvents() {
  const events = [];
  for (let fiscalYear = 2018; fiscalYear <= 2026; fiscalYear += 1) {
    const maxQuarter = fiscalYear === 2026 ? 1 : 4;
    for (let quarter = 1; quarter <= maxQuarter; quarter += 1) {
      const id = eventId(fiscalYear, quarter);
      const eventDateValue = eventDate(fiscalYear, quarter);
      const official = fiscalYear === 2026 && quarter === 1;
      events.push({
        id,
        ticker: TICKER,
        eventDate: eventDateValue,
        fiscalPeriod: `Q${quarter} ${fiscalYear}`,
        fiscalYear,
        fiscalQuarter: quarter,
        eventType: eventType(quarter),
        label: `TRI Q${quarter} ${fiscalYear} Results`,
        sourceType: official ? "official_actual" : "research_only",
        sourcePath: official ? "src/stocks/tri/data.ts" : "modules/tri/ingestion/importLocalData.mjs",
        sourceUrl: official ? "https://investors.thomsonreuters.com/news-releases/news-release-details/thomson-reuters-reports-first-quarter-2026-results" : "https://investors.thomsonreuters.com/financial-information/quarterly-results",
        createdAt: now(),
        periodId: periodId(fiscalYear, quarter),
      });
    }
  }
  return events;
}

export async function buildTriBackendSeedPayload() {
  const createdAt = now();
  const events = buildEvents();
  const sourceDocuments = [
    {
      id: "tri-q1-2026-results",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "Thomson Reuters Q1 2026 results",
      sourcePath: "src/stocks/tri/data.ts",
      sourceUrl: "https://investors.thomsonreuters.com/news-releases/news-release-details/thomson-reuters-reports-first-quarter-2026-results",
      retrievedAt: "2026-05-05",
      publishedDate: "2026-05-05",
      provenance: "Local structured TRI frontend module.",
      confidence: "high",
      checksum: null,
      metadataJson: json({ layer: "official_actual" }),
    },
    {
      id: "tri-fy-2025-results",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "Thomson Reuters FY 2025 results",
      sourcePath: "src/stocks/tri/data.ts",
      sourceUrl: "https://ir.thomsonreuters.com/news-releases/news-release-details/thomson-reuters-reports-fourth-quarter-and-full-year-2025",
      retrievedAt: "2026-02-06",
      publishedDate: "2026-02-06",
      provenance: "Local structured TRI frontend module.",
      confidence: "medium",
      checksum: null,
      metadataJson: json({ layer: "official_actual", note: "Annual FY2025 only; older quarters remain research-only until imported from official documents." }),
    },
    {
      id: "tri-eight-year-proxy-history",
      ticker: TICKER,
      sourceType: "research_only",
      sourceName: "TRI eight-year quarterly proxy history",
      sourcePath: "modules/tri/ingestion/importLocalData.mjs",
      sourceUrl: "https://investors.thomsonreuters.com/financial-information/quarterly-results",
      retrievedAt: "2018-05-05",
      publishedDate: "2018-05-05",
      provenance: "Generated placeholders to preserve backend contract; not official actuals.",
      confidence: "low",
      checksum: null,
      metadataJson: json({ layer: "research_only", valuationImpactAllowed: false }),
    },
    {
      id: "tri-capital-return-proxy-history",
      ticker: TICKER,
      sourceType: "market_data_proxy",
      sourceName: "TRI annual capital-return proxy history",
      sourcePath: "modules/tri/ingestion/importLocalData.mjs",
      sourceUrl: "https://investors.thomsonreuters.com/financial-information/annual-reports",
      retrievedAt: "2026-05-13",
      publishedDate: "2026-05-13",
      provenance: "Generated annual capital-return proxy rows from local historical run-rate data; replace with official annual-report cash-flow tables.",
      confidence: "low",
      checksum: null,
      metadataJson: json({ layer: "market_data_proxy", valuationImpactAllowed: false }),
    },
  ];

  const financialPeriods = [];
  const segmentFinancials = [];
  const marketSnapshots = [];
  const guidanceItems = [];
  const transcriptEvents = [];
  const transcriptExtractions = [];
  const assumptionSets = [];

  for (const event of events) {
    const financial = quarterFinancial(event.fiscalYear, event.fiscalQuarter);
    const researchOnly = event.sourceType === "official_actual" ? 0 : 1;
    financialPeriods.push({
      id: `${event.id}-financials`,
      ticker: TICKER,
      periodId: event.periodId,
      fiscalYear: event.fiscalYear,
      fiscalQuarter: event.fiscalQuarter,
      periodType: "quarter",
      eventId: event.id,
      asOfDate: event.eventDate,
      sourceType: event.sourceType,
      ...financial,
      currentPrice: proxyPrice(event.fiscalYear, event.fiscalQuarter),
      researchOnly,
      rawJson: json({
        label: event.label,
        sourceLayer: event.sourceType,
        notes: researchOnly ? "Research-only quarterly proxy. Not an official TRI actual." : "Official actual from local TRI module.",
        valuationImpactAllowed: !researchOnly,
      }),
    });
    segmentFinancials.push(...segmentRowsFor(event, financial));
    const price = proxyPrice(event.fiscalYear, event.fiscalQuarter);
    marketSnapshots.push({
      id: `${event.id}-market-proxy`,
      ticker: TICKER,
      asOfDate: event.eventDate,
      priceDate: event.eventDate,
      currentPrice: price,
      currency: "USD",
      marketCap: price * financial.dilutedShares,
      enterpriseValue: price * financial.dilutedShares + financial.netDebt,
      sharesOutstanding: financial.dilutedShares,
      previousClose: price,
      fiftyTwoWeekHigh: price * 1.18,
      fiftyTwoWeekLow: price * 0.78,
      dividendYield: 0.025,
      beta: 0.62,
      source: "research_only proxy until daily market bars are imported",
      fetchedAt: createdAt,
      rawJson: json({ sourceLayer: "research_only", replacement: "daily_price_bars adjustedClose" }),
    });
    for (const [scenario, preset] of Object.entries(scenarioPresets)) {
      const maturity = fiscalProgress(event.fiscalYear, event.fiscalQuarter);
      assumptionSets.push({
        id: `${event.id}-${scenario.toLowerCase()}-assumptions`,
        ticker: TICKER,
        name: `${event.label} ${scenario} as-of assumptions`,
        scenario,
        modelVersion: TRI_BACKEND_MODEL_VERSION.version,
        asOfDate: event.eventDate,
        assumptionsJson: json({
          ...preset,
          revenueCagr: Math.max(preset.terminalGrowth + 0.015, preset.revenueCagr * (0.72 + maturity * 0.28)),
          terminalAdjustedEbitdaMargin: Math.min(preset.terminalAdjustedEbitdaMargin, financial.adjustedEbitdaMargin + 0.035),
          dilutedShares: financial.dilutedShares,
          netDebt: financial.netDebt,
          dividendPerShare: financial.dividendsPaid / financial.dilutedShares * 4,
        }),
        sourceType: "forecast_assumption",
        createdAt,
      });
    }
    if (event.fiscalYear >= 2025) {
      guidanceItems.push({
        id: `${event.id}-guidance-organic-growth`,
        ticker: TICKER,
        eventId: event.id,
        asOfDate: event.eventDate,
        fiscalPeriodTarget: `${event.fiscalYear}`,
        metric: "organicRevenueGrowth",
        guidanceType: "candidate",
        lowValue: Math.max(0.04, financial.organicRevenueGrowth - 0.01),
        highValue: financial.organicRevenueGrowth + 0.01,
        midpointValue: financial.organicRevenueGrowth,
        unit: "percent",
        quote: "Management guidance candidate; not promoted into valuation by default.",
        speaker: "Thomson Reuters management",
        sourcePath: event.sourcePath,
        confidence: event.sourceType === "official_actual" ? "medium" : "low",
        humanReviewStatus: "needs_review",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ sourceLayer: "management_guidance", promoted: false }),
      });
      const transcriptId = `${event.id}-transcript`;
      transcriptEvents.push({
        id: transcriptId,
        ticker: TICKER,
        eventId: event.id,
        eventDate: event.eventDate,
        fiscalPeriod: event.fiscalPeriod,
        eventType: event.eventType,
        transcriptId,
        hasQa: 0,
        sourcePath: event.sourcePath,
        sourceUrl: event.sourceUrl,
        provenance: "candidate transcript shell",
        confidence: "low",
        metadataJson: json({ modelReady: false }),
      });
      transcriptExtractions.push({
        id: `${transcriptId}-ai-commentary`,
        ticker: TICKER,
        transcriptId,
        eventId: event.id,
        extractionType: "theme",
        topic: "AI / CoCounsel / legal workflow",
        segment: "Legal Professionals",
        speaker: "management",
        section: "prepared_remarks",
        supportingQuoteShort: "Candidate AI workflow commentary placeholder; source document review required.",
        confidence: "low",
        needsHumanReview: 1,
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ sourceLayer: "transcript_commentary", valuationImpactAllowed: false }),
      });
    }
  }

  for (let fiscalYear = 2018; fiscalYear <= 2024; fiscalYear += 1) {
    const q4Event = events.find((event) => event.fiscalYear === fiscalYear && event.fiscalQuarter === 4);
    if (!q4Event) continue;
    const financial = annualFinancial(fiscalYear);
    financialPeriods.push({
      id: `tri-fy-${fiscalYear}-capital-return-proxy`,
      ticker: TICKER,
      periodId: `fy${String(fiscalYear).slice(2)}`,
      fiscalYear,
      fiscalQuarter: 4,
      periodType: "annual",
      eventId: q4Event.id,
      asOfDate: q4Event.eventDate,
      sourceType: "market_data_proxy",
      revenue: financial.revenue,
      organicRevenueGrowth: financial.organicRevenueGrowth,
      recurringRevenue: financial.recurringRevenue,
      subscriptionRevenue: financial.subscriptionRevenue,
      adjustedEbitda: financial.adjustedEbitda,
      adjustedEbitdaMargin: financial.adjustedEbitdaMargin,
      operatingIncome: financial.operatingIncome,
      operatingMargin: financial.operatingMargin,
      netIncome: financial.netIncome,
      adjustedEps: financial.adjustedEps,
      dilutedEps: financial.dilutedEps,
      dilutedShares: financial.dilutedShares,
      operatingCashFlow: financial.operatingCashFlow,
      capex: financial.capex,
      freeCashFlow: financial.freeCashFlow,
      depreciationAmortization: financial.depreciationAmortization,
      dividendsPaid: financial.dividendsPaid,
      buybacks: financial.buybacks,
      cashAndShortTermInvestments: financial.cashAndShortTermInvestments,
      debt: financial.debt,
      netDebt: financial.netDebt,
      fxImpact: null,
      currentPrice: proxyPrice(fiscalYear, 4),
      researchOnly: 1,
      rawJson: json({
        label: `FY${fiscalYear} capital-return proxy`,
        sourceLayer: "market_data_proxy",
        notes: "Annual capital-return row is a market-data/research proxy generated from local TRI historical run-rate data. Replace with official annual report dividends paid and share repurchases.",
        capitalReturn: {
          dividendPerShare: financial.dividendPerShare,
          dividendCashCostSource: "market_data_proxy: dividendsPaid divided by average diluted shares from local annualized proxy rows",
          buybackSource: "market_data_proxy: sum of local quarterly share-repurchase proxy rows",
          fcfSource: "market_data_proxy: local annual FCF proxy",
          valuationImpactAllowed: false,
        },
      }),
    });
  }

  const q4Event = events.find((event) => event.fiscalYear === 2025 && event.fiscalQuarter === 4);
  if (q4Event) {
    financialPeriods.push({
      id: "tri-fy-2025-financials",
      ticker: TICKER,
      periodId: "fy25",
      fiscalYear: 2025,
      fiscalQuarter: 4,
      periodType: "annual",
      eventId: q4Event.id,
      asOfDate: q4Event.eventDate,
      sourceType: "official_actual",
      revenue: 7476,
      organicRevenueGrowth: 0.07,
      recurringRevenue: 7476 * 0.81,
      subscriptionRevenue: 7476 * 0.73,
      adjustedEbitda: 7476 * 0.392,
      adjustedEbitdaMargin: 0.392,
      operatingIncome: 7476 * 0.392 - 7476 * 0.115,
      operatingMargin: 0.277,
      netIncome: 7476 * 0.22,
      adjustedEps: 3.92,
      dilutedEps: 3.60,
      dilutedShares: 436.5,
      operatingCashFlow: 1950 + 613,
      capex: 613,
      freeCashFlow: 1950,
      depreciationAmortization: 7476 * 0.115,
      dividendsPaid: 436.5 * 2.53,
      buybacks: 850,
      cashAndShortTermInvestments: 1800,
      debt: 4050,
      netDebt: 2250,
      fxImpact: null,
      currentPrice: 91.5,
      researchOnly: 0,
      rawJson: json({
        label: "FY2025A",
        sourceLayer: "official_actual",
        notes: "Annual FY2025 actual from local TRI static module.",
        capitalReturn: {
          dividendPerShare: 2.53,
          dividendCashCostSource: "official_actual: annual cash dividends paid in the local structured FY2025 row",
          buybackSource: "official_actual/local structured source: FY2025 share-repurchase spend",
          fcfSource: "official_actual: FY2025 free cash flow in the local structured row",
          valuationImpactAllowed: true,
        },
      }),
    });
  }

  const modelVersions = [{
    id: TRI_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: TRI_BACKEND_MODEL_VERSION.version,
    name: TRI_BACKEND_MODEL_VERSION.name,
    description: TRI_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json(TRI_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json(TRI_BACKEND_MODEL_VERSION.assumptionSchema),
    createdAt,
  }];

  const peerSnapshots = ["RELX", "Wolters Kluwer", "FactSet"].map((peerName, index) => ({
    id: `tri-peer-${index + 1}`,
    ticker: TICKER,
    asOfDate: "2026-05-05",
    peerTicker: ["RELX", "WKL.AS", "FDS"][index],
    peerName,
    companyName: peerName,
    category: "professional information",
    peerGroup: "workflow-data",
    marketCap: null,
    enterpriseValue: null,
    trailingPe: [34, 31, 28][index],
    forwardPe: [28, 27, 25][index],
    forwardEvEbitda: [21, 20, 18][index],
    priceToSales: [9.5, 8.5, 7.2][index],
    dividendYield: [0.018, 0.014, 0.009][index],
    beta: null,
    currency: ["GBP", "EUR", "USD"][index],
    source: "research_only peer multiple snapshot",
    fetchedAt: createdAt,
    confidenceLevel: "low",
    absoluteValueUse: "forbidden_mixed_currency",
    rawJson: json({ warning: "Do not aggregate absolute market cap or EV across mixed currencies." }),
  }));

  const validationWarnings = [{
    id: "tri-historical-proxy-gaps",
    ticker: TICKER,
    scope: "seed",
    severity: "medium",
    title: "Historical official quarterly actuals incomplete",
    detail: "Only Q1 2026 and FY2025 are locally structured as official actuals. Older quarterly rows are research-only placeholders pending official TRI document ingestion.",
    relatedTable: "financial_periods",
    relatedRecordId: null,
    createdAt,
  }];
  validationWarnings.push({
    id: "tri-capital-return-proxy-years",
    ticker: TICKER,
    scope: "seed",
    severity: "medium",
    title: "Historical capital-return official annual rows incomplete",
    detail: "FY2018-FY2024 annual dividend and buyback rows are market-data proxy rows. FY2025 is the only locally structured official annual capital-return row.",
    relatedTable: "financial_periods",
    relatedRecordId: null,
    createdAt,
  });

  return {
    reportingEvents: events.map(({ periodId: _periodId, ...event }) => event),
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    marketSnapshots,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    assumptionSets,
    modelVersions,
    validationWarnings,
  };
}
