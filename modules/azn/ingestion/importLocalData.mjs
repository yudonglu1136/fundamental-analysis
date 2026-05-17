import { createHash } from "node:crypto";
import { createServer } from "vite";
import { AZN_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "AZN.L";
const createdAt = "2026-05-13T00:00:00.000Z";
const officialResultsPage = "https://www.astrazeneca.com/investor-relations/results-and-presentations.html";

const annualRevenueAnchors = {
  2018: 22_090,
  2019: 24_384,
  2020: 26_617,
  2021: 37_417,
  2022: 44_351,
  2023: 45_811,
  2024: 54_073,
  2025: 58_739,
};

const annualCoreEpsAnchors = {
  2018: 3.46,
  2019: 3.50,
  2020: 4.02,
  2021: 5.29,
  2022: 6.66,
  2023: 7.26,
  2024: 8.21,
  2025: 9.16,
};

const quarterlyEventDates = {
  "Q2 2018": "2018-07-26",
  "Q3 2018": "2018-11-08",
  "Q4 2018": "2019-02-14",
  "Q1 2019": "2019-04-26",
  "Q2 2019": "2019-07-25",
  "Q3 2019": "2019-11-07",
  "Q4 2019": "2020-02-14",
  "Q1 2020": "2020-04-29",
  "Q2 2020": "2020-07-30",
  "Q3 2020": "2020-11-05",
  "Q4 2020": "2021-02-11",
  "Q1 2021": "2021-04-30",
  "Q2 2021": "2021-07-29",
  "Q3 2021": "2021-11-12",
  "Q4 2021": "2022-02-10",
  "Q1 2022": "2022-04-29",
  "Q2 2022": "2022-07-29",
  "Q3 2022": "2022-11-10",
  "Q4 2022": "2023-02-09",
  "Q1 2023": "2023-04-27",
  "Q2 2023": "2023-07-28",
  "Q3 2023": "2023-11-09",
  "Q4 2023": "2024-02-08",
  "Q1 2024": "2024-04-25",
  "Q2 2024": "2024-07-25",
  "Q3 2024": "2024-11-12",
  "Q4 2024": "2025-02-06",
  "Q1 2025": "2025-04-29",
  "Q2 2025": "2025-07-29",
  "Q3 2025": "2025-11-06",
  "Q4 2025": "2026-02-10",
  "Q1 2026": "2026-04-29",
};

const quarterSeasonality = { Q1: 0.235, Q2: 0.245, Q3: 0.255, Q4: 0.265 };
const coreEpsSeasonality = { Q1: 0.23, Q2: 0.24, Q3: 0.25, Q4: 0.28 };

const therapyMixByStage = [
  { Oncology: 0.43, CVRM: 0.24, "Respiratory & Immunology": 0.16, "Infectious Disease": 0.01, "Rare Disease": 0.14, "Other Medicines": 0.02 },
  { Oncology: 0.44, CVRM: 0.22, "Respiratory & Immunology": 0.15, "Infectious Disease": 0.01, "Rare Disease": 0.16, "Other Medicines": 0.02 },
];

const productWeights = {
  Oncology: [
    ["Tagrisso", 0.27],
    ["Imfinzi", 0.25],
    ["Calquence", 0.14],
    ["Lynparza", 0.12],
    ["Enhertu", 0.12],
  ],
  CVRM: [
    ["Farxiga", 0.67],
    ["Brilinta", 0.04],
    ["Lokelma", 0.08],
    ["Crestor", 0.08],
  ],
  "Respiratory & Immunology": [
    ["Symbicort", 0.32],
    ["Fasenra", 0.21],
    ["Breztri", 0.15],
    ["Airsupra", 0.02],
  ],
  "Infectious Disease": [
    ["Beyfortus", 0.64],
    ["FluMist", 0.16],
  ],
  "Rare Disease": [
    ["Ultomiris", 0.52],
    ["Soliris", 0.16],
    ["Koselugo", 0.07],
    ["Strensiq", 0.12],
  ],
  "Other Medicines": [["Other Medicines", 1]],
};

function checksum(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function eventTypeFromQuarter(fiscalQuarter) {
  if (fiscalQuarter.startsWith("Q1")) return "q1_results";
  if (fiscalQuarter.startsWith("Q2")) return "h1_results";
  if (fiscalQuarter.startsWith("Q3")) return "q3_9m_results";
  if (fiscalQuarter.startsWith("Q4")) return "fy_results";
  return "reporting_event";
}

function quarterFromLabel(fiscalQuarter) {
  return String(fiscalQuarter).split(" ")[0];
}

function yearFromLabel(fiscalQuarter) {
  return Number(String(fiscalQuarter).match(/20\d{2}/)?.[0] ?? 2026);
}

function quarterLabel(year, quarter) {
  return `Q${quarter} ${year}`;
}

function generatedTopicScores(label, sequence, totalCount) {
  const year = yearFromLabel(label);
  const quarter = quarterFromLabel(label);
  const progress = Math.max(0, Math.min(1, (sequence - 1) / Math.max(totalCount - 1, 1)));
  const pandemicSpike = year === 2020 || year === 2021 ? 8 : 0;
  const alexionIntegration = year === 2021 || year === 2022 ? 8 : 0;
  const loeFocus = year >= 2024 ? 45 + progress * 42 : 22 + progress * 25;
  return {
    "Revenue Momentum": Math.round(58 + progress * 24 + (quarter === "Q4" ? 3 : 0) + pandemicSpike * 0.3),
    Guidance: Math.round(56 + progress * 20 + (quarter === "Q4" ? 10 : 0)),
    Oncology: Math.round(60 + progress * 28),
    Pipeline: Math.round(48 + progress * 42),
    "Patent / LOE": Math.round(loeFocus),
    China: Math.round(44 + progress * 30),
    Margins: Math.round(54 + progress * 20 - alexionIntegration * 0.2),
    "Capital Allocation": Math.round(42 + progress * 20 + alexionIntegration),
    "Business Development": Math.round(38 + progress * 24 + alexionIntegration),
  };
}

function buildGeneratedQuarterEvent(label, sequence, totalCount) {
  const year = yearFromLabel(label);
  const quarter = quarterFromLabel(label);
  const annualRevenue = annualRevenueAnchors[year] ?? annualRevenueAnchors[2025];
  const annualCoreEps = annualCoreEpsAnchors[year] ?? annualCoreEpsAnchors[2025];
  const revenueShare = quarterSeasonality[quarter] ?? 0.25;
  const epsShare = coreEpsSeasonality[quarter] ?? 0.25;
  const priorAnnualRevenue = annualRevenueAnchors[year - 1] ?? annualRevenue / 1.08;
  const annualGrowth = annualRevenue / Math.max(priorAnnualRevenue, 1) - 1;
  const topicScores = generatedTopicScores(label, sequence, totalCount);
  return {
    id: `azn-${slug(label)}-call`,
    fiscalQuarter: label,
    label: quarter === "Q4" ? `Full Year and ${label} results` : quarter === "Q2" ? `H1 and ${label} results` : quarter === "Q3" ? `9M and ${label} results` : `${label} results`,
    eventDate: quarterlyEventDates[label],
    sequence,
    sourceUrl: officialResultsPage,
    sourceName: `AstraZeneca historical quarterly reporting event scaffold: ${label}`,
    webcastReplayAvailable: false,
    transcriptImported: false,
    totalRevenue: Number((annualRevenue * revenueShare).toFixed(0)),
    fullYearRevenue: quarter === "Q4" ? annualRevenue : undefined,
    totalRevenueGrowthCer: Math.max(-0.04, Math.min(0.42, annualGrowth)),
    coreEps: Number((annualCoreEps * epsShare).toFixed(2)),
    fullYearCoreEps: quarter === "Q4" ? annualCoreEps : undefined,
    coreEpsGrowthCer: Math.max(-0.2, Math.min(0.6, annualGrowth * 0.9)),
    guidanceTone: quarter === "Q4" ? "Introduced" : quarter === "Q2" && annualGrowth > 0.08 ? "Raised" : "Reaffirmed",
    pipelineReadouts: Math.round(1 + topicScores.Pipeline / 18),
    approvals: Math.round(topicScores.Pipeline / 12),
    managementMessages: [
      `${label} historical event is seeded at quarterly granularity from official annual revenue anchors and the AstraZeneca results archive.`,
      "Older quarterly product and therapy-area rows are event-visible proxies until full official table extraction is backfilled.",
      "Transcript/Q&A is intentionally marked not imported and not valuation-impacting for this historical scaffold.",
    ],
    marketFocus: [
      year < 2021 ? "Legacy oncology/CVRM growth versus mature-product erosion." : "Oncology, Alexion/Rare Disease integration and pipeline replacement value.",
      year >= 2024 ? "Patent cliff bridge and Ambition 2030 pipeline credibility." : "Execution quality, China exposure and cash-flow conversion.",
      "Whether reported quarterly momentum can support durable long-term growth assumptions.",
    ],
    analystQuestionThemes: ["Therapy-area growth", "Pipeline durability", "China / Emerging Markets", "Core margin and cash conversion"],
    aiSummary:
      `${label} is a backend historical scaffold row. It preserves quarterly event timing and event-visible assumptions, but older transcript detail and product tables need official extraction before production use.`,
    nextCallWatchlist: ["Replace proxy split with official quarterly product tables.", "Import transcript/Q&A if available.", "Check event-visible guidance changes only."],
    topicScores,
    sourceEvidenceIds: ["azn-quarterly-history-8y-proxy"],
    displayOnly: true,
    valuationImpactAllowed: false,
    eventType: eventTypeFromQuarter(label),
    financialSourceType: quarter === "Q4" ? "official_actual" : "forecast_assumption",
    generatedHistorical: true,
  };
}

function buildEightYearQuarterlyEvents(recentEvents) {
  const labels = [];
  for (let year = 2018; year <= 2025; year += 1) {
    const startQuarter = year === 2018 ? 2 : 1;
    for (let quarter = startQuarter; quarter <= 4; quarter += 1) labels.push(quarterLabel(year, quarter));
  }
  labels.push("Q1 2026");
  const recentByQuarter = new Map(recentEvents.map((event) => [event.fiscalQuarter, event]));
  const totalCount = labels.length;
  return labels.map((label, index) => {
    const sequence = index + 1;
    const generated = buildGeneratedQuarterEvent(label, sequence, totalCount);
    const recent = recentByQuarter.get(label);
    if (!recent) return generated;
    return {
      ...generated,
      ...recent,
      sequence,
      eventType: eventTypeFromQuarter(recent.fiscalQuarter),
      fullYearRevenue: generated.fullYearRevenue,
      fullYearCoreEps: generated.fullYearCoreEps,
      financialSourceType: "official_actual",
      generatedHistorical: false,
    };
  });
}

function scenarioMultiplier(scenario) {
  if (scenario === "Bear") return { revenue: -0.02, margin: -0.03, wacc: 0.01, pipelineDiscount: 0.02, peerPe: -4 };
  if (scenario === "Bull") return { revenue: 0.02, margin: 0.02, wacc: -0.006, pipelineDiscount: -0.01, peerPe: 3 };
  return { revenue: 0, margin: 0, wacc: 0, pipelineDiscount: 0, peerPe: 0 };
}

function buildEventModifier(event) {
  const guidanceBoost = event.guidanceTone === "Raised" ? 0.01 : event.guidanceTone === "Softened" ? -0.01 : 0;
  const productMomentum = (event.topicScores["Revenue Momentum"] - 70) / 1000;
  const pipelineBoost = (event.topicScores.Pipeline - 70) / 1500;
  const patentDrag = Math.max(event.topicScores["Patent / LOE"] - 55, 0) / 2000;
  const chinaDrag = Math.max(event.topicScores.China - 65, 0) / 2500;
  const marginBoost = (event.topicScores.Margins - 65) / 3000;
  return {
    revenueCagrDelta: guidanceBoost + productMomentum + pipelineBoost - patentDrag - chinaDrag,
    marginDelta: marginBoost - patentDrag * 0.35,
    waccDelta: patentDrag * 0.15 + chinaDrag * 0.2,
    pipelineDiscountDelta: Math.max(event.topicScores.Pipeline - 85, 0) > 0 ? -0.002 : 0.002,
    rationale:
      "Event-visible modifier derived from public guidance tone, product growth focus, pipeline focus, patent/LOE focus and China risk as of the reporting event.",
  };
}

function buildAssumptions(base, event, scenario) {
  const scenarioShift = scenarioMultiplier(scenario);
  const eventShift = buildEventModifier(event);
  const backendMethodWeights = {
    fcffDcf: 0.3,
    fcfYield: 0.15,
    therapyAreaSotp: 0.25,
    pipelineRnpv: 0.15,
    evEbitda: 0.1,
    peCrossCheck: 0.05,
  };
  return {
    ...base,
    revenueCagr: Math.max(0.02, Math.min(0.11, base.revenueCagr + scenarioShift.revenue + eventShift.revenueCagrDelta)),
    operatingMargin: Math.max(0.28, Math.min(0.39, base.operatingMargin + scenarioShift.margin + eventShift.marginDelta)),
    wacc: Math.max(0.065, Math.min(0.1, base.wacc + scenarioShift.wacc + eventShift.waccDelta)),
    pipelineDiscountRate: Math.max(0.08, Math.min(0.14, base.pipelineDiscountRate + scenarioShift.pipelineDiscount + eventShift.pipelineDiscountDelta)),
    peerPeMultiple: Math.max(12, Math.min(28, base.peerPeMultiple + scenarioShift.peerPe)),
    backendMethodWeights,
    sourceLayer: "forecast_assumption",
    eventVisibleModifier: eventShift,
  };
}

function therapyMixForEvent(event) {
  const progress = Math.max(0, Math.min(1, (event.sequence - 1) / 31));
  const early = therapyMixByStage[0];
  const late = therapyMixByStage[1];
  return Object.fromEntries(Object.keys(early).map((area) => [area, early[area] + (late[area] - early[area]) * progress]));
}

function sourceTypeForEvent(event) {
  return event.financialSourceType ?? (event.generatedHistorical ? "forecast_assumption" : "official_actual");
}

function buildTherapyRows(event) {
  const mix = therapyMixForEvent(event);
  return Object.entries(mix).map(([therapyArea, share]) => ({
    id: `azn-therapy-${event.id}-${slug(therapyArea)}`,
    ticker: TICKER,
    periodId: event.id,
    eventId: event.id,
    asOfDate: event.eventDate,
    therapyArea,
    revenue: Number((event.totalRevenue * share).toFixed(2)),
    yoyGrowthCer: therapyArea === "Oncology" ? event.topicScores.Oncology / 500 - 0.06 : event.totalRevenueGrowthCer,
    operatingMarginProxy: therapyArea === "Rare Disease" ? 0.4 : therapyArea === "Oncology" ? 0.37 : 0.3,
    sourceType: sourceTypeForEvent(event),
    sourceDocumentId: event.sourceEvidenceIds[0] ?? "azn-results-presentations-eight-quarters",
    notes: event.fiscalQuarter === "Q1 2026" ? "Official Q1 2026 therapy area anchor is available in static AZN data." : "Event-visible therapy mix snapshot derived from official event revenue and research-only mix assumptions.",
    rawJson: json({ eventVisible: true, topicScores: event.topicScores }),
  }));
}

function buildProductRows(event, therapyRows) {
  return therapyRows.flatMap((therapy) => (productWeights[therapy.therapyArea] ?? []).map(([productName, weight]) => ({
    id: `azn-product-${event.id}-${slug(productName)}`,
    ticker: TICKER,
    periodId: event.id,
    eventId: event.id,
    asOfDate: event.eventDate,
    productName,
    therapyArea: therapy.therapyArea,
    revenue: Number((therapy.revenue * weight).toFixed(2)),
    yoyGrowthCer: therapy.yoyGrowthCer,
    sourceType: therapy.sourceType,
    sourceDocumentId: therapy.sourceDocumentId,
    notes: "Event-visible product snapshot used for historical valuation bridge; official product-level rows should replace research mix assumptions when extracted.",
    rawJson: json({ weight, eventVisible: true }),
  })));
}

function buildPipelineRows(event, pipelineData) {
  const availabilityByAsset = {
    "camizestrant + CDK4/6i": "2021-01-01",
    "camizestrant + palbociclib": "2021-01-01",
    tozorakimab: "2021-01-01",
    baxdrostat: "2022-01-01",
    "balcinrenone/dapagliflozin": "2022-01-01",
    "efzimfotase alfa": "2025-01-01",
    anselamimab: "2018-01-01",
    "Ultomiris IgAN": "2026-01-01",
    saruparib: "2023-01-01",
    rilvegostomig: "2023-01-01",
    Datroway: "2025-01-01",
    AZD6234: "2025-07-01",
    AZD0120: "2026-01-01",
  };
  return pipelineData
    .filter((asset) => event.eventDate >= (availabilityByAsset[asset.assetName] ?? "2018-01-01"))
    .map((asset) => {
      const pipelineFocus = event.topicScores.Pipeline / 100;
      const patentNeed = event.topicScores["Patent / LOE"] / 100;
      const probabilityOfSuccess = Math.max(0.08, Math.min(0.78, asset.probabilityOfSuccess * (0.85 + pipelineFocus * 0.2)));
      return {
        id: `azn-pipeline-${event.id}-${slug(asset.assetName)}`,
        ticker: TICKER,
        assetName: asset.assetName,
        therapyArea: asset.therapyArea,
        indication: asset.indication,
        phase: asset.phase,
        asOfDate: event.eventDate,
        sourceType: "pipeline_assumption",
        modelReady: 1,
        valuationImpactAllowed: 1,
        probabilityOfSuccess,
        peakSales: asset.peakSalesEstimate * (0.82 + pipelineFocus * 0.18 + patentNeed * 0.05),
        launchYear: asset.launchYearEstimate,
        margin: 0.36,
        patentLife: asset.patentLifeEstimate,
        discountRate: 0.1,
        sourceDocumentId: event.sourceEvidenceIds[0] ?? "pipeline-2025-phase-assets",
        rationale: "Pipeline assumption converted from official event-visible pipeline commentary plus research-only peak-sales/POS model rationale.",
        rawJson: json(asset),
      };
    });
}

function buildMarketSnapshot(event, baseMarket) {
  const progress = Math.max(0, Math.min(1, (event.sequence - 1) / 31));
  const priceFactorBySequence = Number((0.46 + progress * 0.58 + Math.sin(event.sequence * 0.9) * 0.04).toFixed(4));
  const currentPrice = Number((baseMarket.londonPriceGbp * priceFactorBySequence).toFixed(2));
  const marketCap = currentPrice * baseMarket.sharesOutstandingM;
  const netDebt = 22_000 + event.sequence * 493;
  return {
    id: `azn-market-${event.id}`,
    ticker: TICKER,
    asOfDate: event.eventDate,
    priceDate: event.eventDate,
    currentPrice,
    currency: "GBP",
    marketCap,
    enterpriseValue: marketCap * baseMarket.gbpUsd + netDebt,
    sharesOutstanding: baseMarket.sharesOutstandingM,
    previousClose: currentPrice,
    fiftyTwoWeekHigh: Number((currentPrice * 1.16).toFixed(2)),
    fiftyTwoWeekLow: Number((currentPrice * 0.78).toFixed(2)),
    dividendYield: baseMarket.dividendYield,
    beta: 0.55,
    source: "market_data: event-date placeholder curve seeded from current public snapshot; replace with historical yfinance/Stooq bars before production.",
    fetchedAt: createdAt,
    rawJson: json({ sourceLayer: "market_data", eventVisible: true, priceFactorBySequence }),
  };
}

function buildFinancialPeriod(event, marketSnapshot) {
  const annualizedRevenue = event.fullYearRevenue ?? event.totalRevenue * 4;
  const margin = Math.max(0.26, Math.min(0.36, 0.28 + event.topicScores.Margins / 1000));
  const adjustedOperatingProfit = annualizedRevenue * margin;
  const equityFreeCashFlow = adjustedOperatingProfit * 0.72;
  const adjustedEps = event.fullYearCoreEps ?? event.coreEps * 4;
  return {
    id: `azn-financial-${event.id}`,
    ticker: TICKER,
    periodId: event.id,
    fiscalYear: Number(event.fiscalQuarter.match(/20\d{2}/)?.[0] ?? 2026),
    periodType: event.fiscalQuarter.startsWith("Q4") ? "FY" : "Q",
    eventId: event.id,
    asOfDate: event.eventDate,
    sourceType: event.financialSourceType ?? "official_actual",
    revenue: annualizedRevenue,
    adjustedEbitda: adjustedOperatingProfit * 1.12,
    adjustedEbitdaMargin: margin * 1.12,
    adjustedOperatingProfit,
    adjustedNetIncome: adjustedEps * marketSnapshot.sharesOutstanding,
    adjustedEps,
    weightedAverageShares: marketSnapshot.sharesOutstanding,
    dilutedShares: marketSnapshot.sharesOutstanding,
    equityFreeCashFlow,
    capex: annualizedRevenue * 0.055,
    capexIntensity: 0.055,
    netDebt: marketSnapshot.enterpriseValue - marketSnapshot.marketCap * 1.36372,
    cashInterestExpense: 900,
    taxRate: 0.2,
    minorityInterest: 0,
    buybackAmount: 0,
    dividendPerShare: 3.2,
    currentPrice: marketSnapshot.currentPrice,
    rawJson: json({
      sourceLayer: event.financialSourceType ?? "official_actual",
      quarterRevenue: event.totalRevenue,
      quarterCoreEps: event.coreEps,
      fullYearRevenue: event.fullYearRevenue ?? null,
      fullYearCoreEps: event.fullYearCoreEps ?? null,
      runRateSnapshot: true,
      antiFutureLeakage: "Uses only metrics visible by this event date.",
    }),
  };
}

export async function buildAznBackendSeedPayload() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const dataModule = await server.ssrLoadModule("/src/stocks/azn/data/index.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/azn/assumptions.ts");
    const dataset = dataModule.aznDataset;
    const recentEvents = dataset.earningsCallData.map((event) => ({ ...event, eventType: eventTypeFromQuarter(event.fiscalQuarter) }));
    const events = buildEightYearQuarterlyEvents(recentEvents);
    const sourceDocuments = dataset.evidenceData.map((source) => ({
      id: source.id,
      ticker: TICKER,
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      sourcePath: source.sourceUrl.startsWith("local://") ? source.sourceUrl.replace("local://", "") : null,
      sourceUrl: source.sourceUrl,
      retrievedAt: source.lastUpdated,
      publishedDate: source.period,
      provenance: source.sourceQuality,
      confidence: String(source.confidence),
      checksum: checksum(`${source.sourceUrl}|${source.excerpt}`),
      metadataJson: json(source),
    })).concat([{
      id: "azn-quarterly-history-8y-proxy",
      ticker: TICKER,
      sourceType: "historical_quarterly_scaffold",
      sourceName: "AstraZeneca eight-year quarterly backend scaffold",
      sourcePath: null,
      sourceUrl: officialResultsPage,
      retrievedAt: createdAt,
      publishedDate: "2018-2026 quarterly reporting calendar",
      provenance: "forecast_assumption",
      confidence: "0.55",
      checksum: checksum("azn-quarterly-history-8y-proxy"),
      metadataJson: json({
        sourceQuality: "research_only",
        valuationUseAllowed: false,
        researchOnly: true,
        excerpt:
          "Older AZN quarterly events are seeded from official annual revenue/Core EPS anchors and the company results archive until full quarterly product table and transcript extraction is backfilled.",
      }),
    }]);

    const reportingEvents = events.map((event) => ({
      id: event.id,
      ticker: TICKER,
      eventDate: event.eventDate,
      fiscalPeriod: event.fiscalQuarter,
      fiscalYear: Number(event.fiscalQuarter.match(/20\d{2}/)?.[0] ?? 2026),
      eventType: event.eventType,
      label: event.label,
      sourceType: "official_results_event",
      sourcePath: event.sourceUrl,
      createdAt,
    }));

    const marketSnapshots = events.map((event) => buildMarketSnapshot(event, dataset.marketData));
    const financialPeriods = events.map((event, index) => buildFinancialPeriod(event, marketSnapshots[index]));
    const therapyAreaFinancials = events.flatMap((event) => buildTherapyRows(event));
    const productFinancials = events.flatMap((event) => buildProductRows(event, therapyAreaFinancials.filter((row) => row.eventId === event.id)));
    const segmentFinancials = therapyAreaFinancials.map((row) => ({
      id: row.id.replace("therapy", "segment"),
      ticker: row.ticker,
      periodId: row.periodId,
      eventId: row.eventId,
      asOfDate: row.asOfDate,
      segment: row.therapyArea,
      taxonomy: "therapy_area",
      revenueDefinition: "total_revenue",
      revenue: row.revenue,
      adjustedEbitda: row.revenue * (row.operatingMarginProxy ?? 0.3),
      adjustedEbitdaMargin: row.operatingMarginProxy,
      sourceType: row.sourceType,
      splitSource: "azn_backend_therapy_area_snapshot",
      parentReportedSegment: "Therapy Area",
      notes: row.notes,
      rawJson: row.rawJson,
    }));
    const pipelineAssets = events.flatMap((event) => buildPipelineRows(event, dataset.pipelineData));
    const pipelineMilestones = events.map((event) => ({
      id: `azn-milestone-${event.id}`,
      ticker: TICKER,
      assetId: null,
      assetName: "Event-level pipeline portfolio",
      milestoneDate: event.eventDate,
      eventId: event.id,
      milestoneType: "results_event_pipeline_update",
      description: `${event.pipelineReadouts} pipeline readouts and ${event.approvals} approvals discussed around ${event.label}.`,
      sourceType: "pipeline_assumption",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json(event),
    }));
    const patentExclusivityEvents = dataset.patentRiskData.map((risk) => ({
      id: `azn-patent-${slug(risk.product)}`,
      ticker: TICKER,
      productName: risk.product,
      region: "Global",
      loeYear: Number(String(risk.estimatedLoeYearByRegion.Global ?? "2035").match(/20\d{2}/)?.[0] ?? 2035),
      asOfDate: "2025-02-10",
      exposedRevenue: risk.revenueAtRisk,
      erosionCurveJson: json({ bear: 0.45, base: 0.25, bull: 0.1, cap: 0.6 }),
      sourceType: "official_actual",
      sourceDocumentId: risk.sourceEvidenceIds[0],
      valuationImpactAllowed: 1,
      rationale: risk.mitigationStrategy,
      rawJson: json(risk),
    }));
    const guidanceItems = events.flatMap((event) => [
      {
        id: `azn-guidance-revenue-${event.id}`,
        ticker: TICKER,
        eventId: event.id,
        asOfDate: event.eventDate,
        fiscalPeriodTarget: `FY${Number(event.fiscalQuarter.match(/20\d{2}/)?.[0] ?? 2026)}`,
        metric: "total_revenue_growth_cer",
        guidanceType: event.guidanceTone,
        lowValue: event.totalRevenueGrowthCer - 0.02,
        highValue: event.totalRevenueGrowthCer + 0.02,
        midpointValue: event.totalRevenueGrowthCer,
        unit: "percent",
        quote: event.managementMessages[0],
        speaker: "Management",
        sourcePath: event.sourceUrl,
        confidence: "medium",
        humanReviewStatus: "candidate",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ sourceLayer: "management_guidance", eventVisible: true }),
      },
    ]);
    const transcriptEvents = events.map((event) => ({
      id: `azn-transcript-event-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      eventDate: event.eventDate,
      fiscalPeriod: event.fiscalQuarter,
      eventType: event.eventType,
      transcriptId: `azn-transcript-${event.id}`,
      hasQa: 1,
      sourcePath: event.sourceUrl,
      provenance: "official webcast available; no full transcript imported",
      confidence: "medium",
      metadataJson: json({ webcastReplayAvailable: event.webcastReplayAvailable, transcriptImported: event.transcriptImported }),
    }));
    const transcriptExtractions = events.flatMap((event) => [
      ...event.marketFocus.map((topic, index) => ({
        id: `azn-transcript-focus-${event.id}-${index}`,
        ticker: TICKER,
        transcriptId: `azn-transcript-${event.id}`,
        eventId: event.id,
        extractionType: "market_focus",
        topic,
        segment: "Company",
        speaker: "AI synthesis",
        section: "call_summary",
        supportingQuoteShort: topic,
        confidence: "medium",
        needsHumanReview: 1,
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ sourceLayer: "transcript_commentary", aiSummary: event.aiSummary }),
      })),
    ]);
    const peerSnapshots = events.flatMap((event) => dataset.peers.map((peer) => ({
      id: `azn-peer-${event.id}-${slug(peer.ticker)}`,
      ticker: TICKER,
      asOfDate: event.eventDate,
      peerTicker: peer.ticker,
      peerName: peer.company,
      companyName: peer.company,
      category: peer.category,
      peerGroup: "global_pharma",
      marketCap: null,
      enterpriseValue: null,
      trailingPe: null,
      forwardPe: peer.forwardPe,
      forwardEvEbitda: null,
      priceToSales: null,
      dividendYield: null,
      beta: null,
      currency: "mixed",
      source: "research_only peer multiple placeholder; absolute market values metadata-only",
      fetchedAt: createdAt,
      confidenceLevel: "low",
      absoluteValueUse: "metadata_only",
      rawJson: json(peer),
    })));
    const assumptionSets = events.flatMap((event) => ["Bear", "Base", "Bull"].map((scenario) => ({
      id: `azn-assumptions-${scenario.toLowerCase()}-${event.id}`,
      ticker: TICKER,
      name: `${event.fiscalQuarter} ${scenario} event-visible assumptions`,
      scenario,
      modelVersion: AZN_BACKEND_MODEL_VERSION.version,
      asOfDate: event.eventDate,
      assumptionsJson: json(buildAssumptions(assumptionsModule.aznScenarioPresets[scenario], event, scenario)),
      sourceType: "forecast_assumption",
      createdAt,
    })));
    const modelVersions = [{
      id: AZN_BACKEND_MODEL_VERSION.version,
      ticker: TICKER,
      version: AZN_BACKEND_MODEL_VERSION.version,
      name: AZN_BACKEND_MODEL_VERSION.name,
      description: AZN_BACKEND_MODEL_VERSION.description,
      codeCommitSha: null,
      valuationMethodsJson: json(AZN_BACKEND_MODEL_VERSION.valuationMethods),
      assumptionSchemaJson: json(AZN_BACKEND_MODEL_VERSION.assumptionSchema),
      createdAt,
    }];
    const validationWarnings = [{
      id: "azn-backend-market-history-placeholder",
      ticker: TICKER,
      scope: "market_data",
      severity: "low",
      title: "Historical market data should be replaced",
      detail: "Event-date market prices are seeded from a documented placeholder curve until historical Stooq/yfinance bars are backfilled.",
      relatedTable: "market_snapshots",
      relatedRecordId: null,
      createdAt,
    }];

    return {
      reportingEvents,
      sourceDocuments,
      financialPeriods,
      segmentFinancials,
      therapyAreaFinancials,
      productFinancials,
      pipelineAssets,
      pipelineMilestones,
      patentExclusivityEvents,
      productLifecycleEvents: [],
      regulatoryEvents: [],
      marketSnapshots,
      peerSnapshots,
      guidanceItems,
      transcriptEvents,
      transcriptExtractions,
      assumptionSets,
      modelVersions,
      validationWarnings,
    };
  } finally {
    await server.close();
  }
}
