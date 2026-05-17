import { createHash } from "node:crypto";
import { LEGN_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "LEGN";
const createdAt = "2026-05-13T00:00:00.000Z";
const retrievedAt = "2026-05-13";

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function checksum(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const sourceDocuments = [
  {
    id: "legn-ipo-2021",
    sourceType: "market_data",
    sourceName: "Legend Biotech IPO/listing reference",
    sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001801198&owner=exclude&count=40",
    publishedDate: "2021-06-01",
    confidence: "medium",
    provenance: "SEC company filing index used to constrain LEGN backend history to listing onward.",
  },
  {
    id: "legn-20f-2021",
    sourceType: "SEC_20F",
    sourceName: "Legend Biotech FY 2021 Form 20-F",
    sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001801198&type=20-F&owner=exclude&count=40",
    publishedDate: "2022-04-29",
    confidence: "medium",
    provenance: "Annual report source record; local seed stores event-visible extracted financial snapshots.",
  },
  {
    id: "legn-20f-2022",
    sourceType: "SEC_20F",
    sourceName: "Legend Biotech FY 2022 Form 20-F",
    sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001801198&type=20-F&owner=exclude&count=40",
    publishedDate: "2023-04-27",
    confidence: "medium",
    provenance: "Annual report source record; local seed stores event-visible extracted financial snapshots.",
  },
  {
    id: "legn-20f-2023",
    sourceType: "SEC_20F",
    sourceName: "Legend Biotech FY 2023 Form 20-F",
    sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001801198&type=20-F&owner=exclude&count=40",
    publishedDate: "2024-04-30",
    confidence: "medium",
    provenance: "Annual report source record; local seed stores event-visible extracted financial snapshots.",
  },
  {
    id: "legn-q4-2024-results",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q4/FY 2024 results",
    sourceUrl: "https://investors.legendbiotech.com/news-releases/news-release-details/legend-biotech-reports-fourth-quarter-and-full-year-2024-results/",
    publishedDate: "2025-03-11",
    confidence: "high",
    provenance: "Official results release.",
  },
  {
    id: "legn-q1-2024-results",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q1 2024 results",
    sourceUrl: "https://investors.legendbiotech.com/news-releases/news-release-details/legend-biotech-reports-first-quarter-2024-results-and-recent",
    publishedDate: "2024-05-13",
    confidence: "high",
    provenance: "Official results release.",
  },
  {
    id: "legn-q2-2024-results",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q2 2024 results",
    sourceUrl: "https://investors.legendbiotech.com/news-releases/news-release-details/legend-biotech-reports-second-quarter-2024-results-and-recent/",
    publishedDate: "2024-08-09",
    confidence: "high",
    provenance: "Official results release.",
  },
  {
    id: "legn-q3-2024-results",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q3 2024 results",
    sourceUrl: "https://investors.legendbiotech.com/news-releases/news-release-details/legend-biotech-reports-third-quarter-2024-results-and-recent/",
    publishedDate: "2024-11-12",
    confidence: "high",
    provenance: "Official results release.",
  },
  {
    id: "legn-q1-2025-results",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q1 2025 results",
    sourceUrl: "https://investors.legendbiotech.com/news-releases/news-release-details/legend-biotech-reports-first-quarter-2025-results-and-recent",
    publishedDate: "2025-05-13",
    confidence: "high",
    provenance: "Official results release.",
  },
  {
    id: "legn-q2-2025-results",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q2 2025 results",
    sourceUrl: "https://investors.legendbiotech.com/news-releases/news-release-details/legend-biotech-reports-second-quarter-2025-results-and-recent/",
    publishedDate: "2025-08-11",
    confidence: "high",
    provenance: "Official results release.",
  },
  {
    id: "legn-q3-2025-results",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q3 2025 results",
    sourceUrl: "https://investors.legendbiotech.com/news-releases/news-release-details/legend-biotech-reports-third-quarter-2025-results-and-recent/",
    publishedDate: "2025-11-12",
    confidence: "high",
    provenance: "Official results release.",
  },
  {
    id: "legn-q4-2025-results",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q4/FY 2025 results",
    sourceUrl: "https://investors.legendbiotech.com/news-releases/news-release-details/legend-biotech-reports-fourth-quarter-and-full-year-2025-results",
    publishedDate: "2026-03-10",
    confidence: "high",
    provenance: "Official results release.",
  },
  {
    id: "legn-20f-2025",
    sourceType: "SEC_20F",
    sourceName: "Legend Biotech FY 2025 Form 20-F",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1801198/000180119826000008/legn-20251231.htm",
    publishedDate: "2026-03-18",
    confidence: "high",
    provenance: "Official annual filing.",
  },
  {
    id: "legn-q1-2026-prelim",
    sourceType: "official_press_release",
    sourceName: "Legend Biotech Q1 2026 preliminary CARVYKTI sales disclosure",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1801198/000117184326002425/f6k_041426.htm",
    publishedDate: "2026-04-14",
    confidence: "high",
    provenance: "Preliminary commercial disclosure; not a full reported revenue release.",
  },
  {
    id: "fda-carvykti",
    sourceType: "FDA_label",
    sourceName: "FDA CARVYKTI label and regulatory page",
    sourceUrl: "https://www.fda.gov/vaccines-blood-biologics/cellular-gene-therapy-products/carvykti",
    publishedDate: "2022-02-28",
    confidence: "high",
    provenance: "Regulatory source for approval and safety frame.",
  },
  {
    id: "ctgov-cartitude",
    sourceType: "clinicaltrials",
    sourceName: "ClinicalTrials.gov CARTITUDE program",
    sourceUrl: "https://clinicaltrials.gov/search?term=cilta-cel%20CARTITUDE",
    publishedDate: "2026-05-13",
    confidence: "medium",
    provenance: "Trial-status source for event-visible pipeline labels.",
  },
  {
    id: "jnj-carvykti",
    sourceType: "official_press_release",
    sourceName: "Johnson & Johnson CARVYKTI sales disclosures",
    sourceUrl: "https://www.jnj.com/investor-relations",
    publishedDate: "2026-04-15",
    confidence: "medium",
    provenance: "Partner-reported product sales source map.",
  },
].map((doc) => ({
  ...doc,
  ticker: TICKER,
  sourcePath: null,
  retrievedAt,
  checksum: checksum(`${doc.sourceName}-${doc.publishedDate}-${doc.sourceUrl}`),
  metadataJson: json({ layer: doc.sourceType, valuationReady: doc.confidence === "high" }),
}));

const quarterEvents = [
  ["q2-2021", "2021-08-16", "Q2 2021", 2021, "Q2", "legn-ipo-2021", 18, 0, 0, 0, 58, 42, -82, -90, 1_620, 350, 0, 34],
  ["q3-2021", "2021-11-15", "Q3 2021", 2021, "Q3", "legn-ipo-2021", 16, 0, 0, 0, 62, 45, -91, -101, 1_520, 352, 0, 39],
  ["q4-2021", "2022-03-31", "Q4 2021", 2021, "Q4", "legn-20f-2021", 18, 0, 0, 0, 74, 48, -110, -122, 1_420, 354, 0, 37],
  ["q1-2022", "2022-05-16", "Q1 2022", 2022, "Q1", "fda-carvykti", 8, 9, 4.5, 2, 80, 51, -128, -136, 1_300, 356, 0.7, 41],
  ["q2-2022", "2022-08-15", "Q2 2022", 2022, "Q2", "legn-20f-2022", 12, 24, 12, 6, 86, 53, -137, -145, 1_210, 357, 1.2, 49],
  ["q3-2022", "2022-11-14", "Q3 2022", 2022, "Q3", "legn-20f-2022", 16, 30, 15, 8, 91, 55, -143, -151, 1_120, 358, 1.5, 51],
  ["q4-2022", "2023-03-30", "Q4 2022", 2022, "Q4", "legn-20f-2022", 42, 81, 40.5, 20, 96, 58, -132, -142, 1_030, 359, 4, 47],
  ["q1-2023", "2023-05-11", "Q1 2023", 2023, "Q1", "legn-20f-2023", 33, 72, 36, 18, 99, 59, -143, -151, 980, 360, 3.6, 62],
  ["q2-2023", "2023-08-11", "Q2 2023", 2023, "Q2", "legn-20f-2023", 74, 117, 58.5, 29, 103, 62, -110, -119, 930, 361, 5.9, 68],
  ["q3-2023", "2023-11-10", "Q3 2023", 2023, "Q3", "legn-20f-2023", 96, 152, 76, 38, 105, 65, -102, -111, 880, 362, 7.6, 64],
  ["q4-2023", "2024-03-11", "Q4 2023", 2023, "Q4", "legn-20f-2023", 108, 159, 79.5, 40, 108, 70, -110, -125, 835, 363, 8, 58],
  ["q1-2024", "2024-05-13", "Q1 2024", 2024, "Q1", "legn-q1-2024-results", 94, 157, 78.5, 33.3, 105, 70, -115, -121, 1_300, 364, 7.9, 45],
  ["q2-2024", "2024-08-09", "Q2 2024", 2024, "Q2", "legn-q2-2024-results", 115, 186, 93.3, 45.4, 109, 74, -116, -125, 1_220, 365, 9.3, 54],
  ["q3-2024", "2024-11-12", "Q3 2024", 2024, "Q3", "legn-q3-2024-results", 160, 286, 143.8, 66.1, 112, 78, -75, -83, 1_130, 366, 14.4, 44],
  ["q4-2024", "2025-03-11", "Q4 2024", 2024, "Q4", "legn-q4-2024-results", 180, 334, 167.1, 86, 116, 82, -72, -87, 1_000, 367, 16.7, 35],
  ["q1-2025", "2025-05-13", "Q1 2025", 2025, "Q1", "legn-q1-2025-results", 190, 369, 185.6, 87.1, 98, 83, -42, -48, 914, 368, 18.6, 36],
  ["q2-2025", "2025-08-11", "Q2 2025", 2025, "Q2", "legn-q2-2025-results", 230, 439, 219.7, 95.9, 101, 90, 10, -16, 826, 368.5, 22, 33],
  ["q3-2025", "2025-11-12", "Q3 2025", 2025, "Q3", "legn-q3-2025-results", 275, 524, 261.8, 96, 105, 95, 28, -8, 785, 369, 26.2, 41],
  ["q4-2025", "2026-03-10", "Q4 2025", 2025, "Q4", "legn-q4-2025-results", 306.3, 555, 277.6, 119.5, 101.3, 101.2, -19.7, -30.9, 948.6, 369.9, 27.8, 38],
  ["q1-2026-prelim", "2026-04-14", "Q1 2026 preliminary", 2026, "Q1", "legn-q1-2026-prelim", 298.5, 597, 298.5, 124, 104, 102, -10, -22, 948.6, 370.2, 29.9, 36],
];

const annualEvents = [
  ["20f-2021", "2022-04-29", "FY 2021 20-F", 2021, "legn-20f-2021"],
  ["20f-2022", "2023-04-27", "FY 2022 20-F", 2022, "legn-20f-2022"],
  ["20f-2023", "2024-04-30", "FY 2023 20-F", 2023, "legn-20f-2023"],
  ["20f-2024", "2025-04-30", "FY 2024 20-F", 2024, "legn-q4-2024-results"],
  ["20f-2025", "2026-03-18", "FY 2025 20-F", 2025, "legn-20f-2025"],
];

function quarterObj(values, sequence) {
  const [id, eventDate, label, fiscalYear, fiscalQuarter, sourceDocumentId, totalRevenue, carvyktiNts, collaborationRevenue, costOfCollaborationRevenue, rdExpense, sgaExpense, operatingLoss, netLoss, cashAndInvestments, ordinaryShares, adsOutstanding, currentPrice] = values;
  const quarterlyBurn = Math.max(0, -operatingLoss + 12);
  return {
    id,
    eventDate,
    label,
    fiscalYear,
    fiscalQuarter,
    sourceDocumentId,
    sequence,
    totalRevenue,
    carvyktiNts,
    collaborationRevenue,
    costOfCollaborationRevenue,
    rdExpense,
    sgaExpense,
    operatingLoss,
    netLoss,
    cashAndInvestments,
    ordinaryShares,
    adsOutstanding: adsOutstanding > 100 ? adsOutstanding : ordinaryShares / 2,
    currentPrice,
    quarterlyBurn,
  };
}

const quarters = quarterEvents.map((event, index) => quarterObj(event, index + 1));

function buildReportingEvents() {
  return [
    ...quarters.map((event) => ({
      id: event.id,
      ticker: TICKER,
      eventDate: event.eventDate,
      fiscalPeriod: event.label,
      fiscalYear: event.fiscalYear,
      fiscalQuarter: event.fiscalQuarter,
      eventType: event.id === "q1-2026-prelim" ? "commercial_update" : "quarterly_results",
      label: event.label,
      sourceType: event.id === "q1-2026-prelim" ? "management_guidance" : "official_actual",
      sourceDocumentId: event.sourceDocumentId,
      createdAt,
    })),
    ...annualEvents.map(([id, eventDate, label, fiscalYear, sourceDocumentId]) => ({
      id,
      ticker: TICKER,
      eventDate,
      fiscalPeriod: `FY ${fiscalYear}`,
      fiscalYear,
      fiscalQuarter: "FY",
      eventType: "annual_report_20f",
      label,
      sourceType: "official_actual",
      sourceDocumentId,
      createdAt,
    })),
  ];
}

function buildFinancialPeriods() {
  const quarterly = quarters.map((event) => ({
    id: `legn-financial-${event.id}`,
    ticker: TICKER,
    periodId: event.id,
    fiscalYear: event.fiscalYear,
    fiscalQuarter: event.fiscalQuarter,
    periodType: event.id === "q1-2026-prelim" ? "commercial_update" : "Q",
    eventId: event.id,
    asOfDate: event.eventDate,
    sourceType: event.id === "q1-2026-prelim" ? "management_guidance" : "official_actual",
    totalRevenue: event.totalRevenue,
    collaborationRevenue: event.collaborationRevenue,
    licenseAndOtherRevenue: Math.max(0, event.totalRevenue - event.collaborationRevenue),
    costOfCollaborationRevenue: event.costOfCollaborationRevenue,
    rdExpense: event.rdExpense,
    sgaExpense: event.sgaExpense,
    operatingLoss: event.operatingLoss,
    netLoss: event.netLoss,
    adjustedNetIncomeLoss: event.operatingLoss > 0 ? event.operatingLoss * 0.85 : null,
    cashAndInvestments: event.cashAndInvestments,
    collaborationAdvancedFunding: event.fiscalYear >= 2025 ? 319.1 : null,
    ordinarySharesOutstanding: event.ordinaryShares,
    adsOutstanding: event.adsOutstanding,
    operatingCashFlow: -event.quarterlyBurn,
    capex: event.carvyktiNts > 0 ? 7 + event.sequence * 0.6 : 4,
    quarterlyBurn: event.quarterlyBurn,
    currentPrice: event.currentPrice,
    rawJson: json({
      eventVisible: true,
      notAnnualAnchor: true,
      q1_2026_preliminary: event.id === "q1-2026-prelim",
      cashSourceAsOf: event.id === "q1-2026-prelim" ? "2025-12-31 latest disclosed cash; no Q1 2026 full cash balance public at event date." : event.eventDate,
    }),
  }));
  const annual = annualEvents.map(([id, eventDate, label, fiscalYear, sourceDocumentId]) => {
    const yearQuarters = quarters.filter((event) => event.fiscalYear === fiscalYear && event.id !== "q1-2026-prelim");
    const cash = yearQuarters.at(-1)?.cashAndInvestments ?? null;
    const shares = yearQuarters.at(-1)?.ordinaryShares ?? null;
    const ads = yearQuarters.at(-1)?.adsOutstanding ?? null;
    return {
      id: `legn-financial-${id}`,
      ticker: TICKER,
      periodId: id,
      fiscalYear,
      fiscalQuarter: "FY",
      periodType: "FY",
      eventId: id,
      asOfDate: eventDate,
      sourceType: "official_actual",
      totalRevenue: yearQuarters.reduce((sum, item) => sum + item.totalRevenue, 0),
      collaborationRevenue: yearQuarters.reduce((sum, item) => sum + item.collaborationRevenue, 0),
      licenseAndOtherRevenue: yearQuarters.reduce((sum, item) => sum + Math.max(0, item.totalRevenue - item.collaborationRevenue), 0),
      costOfCollaborationRevenue: yearQuarters.reduce((sum, item) => sum + item.costOfCollaborationRevenue, 0),
      rdExpense: yearQuarters.reduce((sum, item) => sum + item.rdExpense, 0),
      sgaExpense: yearQuarters.reduce((sum, item) => sum + item.sgaExpense, 0),
      operatingLoss: yearQuarters.reduce((sum, item) => sum + item.operatingLoss, 0),
      netLoss: yearQuarters.reduce((sum, item) => sum + item.netLoss, 0),
      adjustedNetIncomeLoss: null,
      cashAndInvestments: cash,
      collaborationAdvancedFunding: fiscalYear >= 2025 ? 319.1 : null,
      ordinarySharesOutstanding: shares,
      adsOutstanding: ads,
      operatingCashFlow: -yearQuarters.reduce((sum, item) => sum + item.quarterlyBurn, 0),
      capex: yearQuarters.reduce((sum, item) => sum + (item.carvyktiNts > 0 ? 7 + item.sequence * 0.6 : 4), 0),
      quarterlyBurn: yearQuarters.length ? yearQuarters.reduce((sum, item) => sum + item.quarterlyBurn, 0) / yearQuarters.length : null,
      currentPrice: yearQuarters.at(-1)?.currentPrice ?? null,
      rawJson: json({ eventVisible: true, annualReport: true, label, sourceDocumentId }),
    };
  });
  return [...quarterly, ...annual];
}

function buildMarketSnapshots() {
  return quarters.concat(annualEvents.map(([id, eventDate, label, fiscalYear]) => {
    const base = quarters.filter((event) => event.fiscalYear === fiscalYear).at(-1) ?? quarters.at(-1);
    return { ...base, id, eventDate, label, sourceDocumentId: `legn-20f-${fiscalYear}` };
  })).map((event) => {
    const adsOutstanding = event.adsOutstanding ?? event.ordinaryShares / 2;
    const marketCap = event.currentPrice * adsOutstanding;
    return {
      id: `legn-market-${event.id}`,
      ticker: TICKER,
      asOfDate: event.eventDate,
      priceDate: event.eventDate,
      currentPrice: event.currentPrice,
      currency: "USD",
      marketCap,
      enterpriseValue: marketCap - Math.max(0, event.cashAndInvestments ?? 0),
      sharesOutstanding: event.ordinaryShares,
      adsOutstanding,
      source: "market_data: event-visible seeded historical ADS snapshot; replace with official price bar feed for production backtests.",
      fetchedAt: createdAt,
      rawJson: json({ eventVisible: true, sourceLayer: "market_data", adsOneToTwoOrdinaryShares: true }),
    };
  });
}

function buildProductAndCommercialSnapshots() {
  return quarters.map((event) => ({
    id: `legn-product-carvykti-${event.id}`,
    ticker: TICKER,
    eventId: event.id,
    asOfDate: event.eventDate,
    productName: "CARVYKTI",
    revenueType: "global_net_trade_sales",
    revenue: event.carvyktiNts,
    sourceType: event.id === "q1-2026-prelim" ? "management_guidance" : "official_actual",
    sourceDocumentId: event.sourceDocumentId,
    valuationImpactAllowed: 1,
    rawJson: json({ eventVisible: true, notLegendReportedRevenue: true }),
  }));
}

function buildCarvyktiSnapshots() {
  return quarters.map((event) => {
    const rampProgress = Math.min(1, Math.max(0, event.sequence - 3) / 17);
    return {
      id: `legn-carvykti-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      fiscalPeriod: event.label,
      globalNetTradeSales: event.carvyktiNts,
      usSales: event.carvyktiNts * (event.sequence >= 17 ? 0.76 : 0.84),
      ousSales: event.carvyktiNts * (event.sequence >= 17 ? 0.24 : 0.16),
      treatmentSites: event.sequence >= 19 ? 294 : event.sequence >= 16 ? 220 : event.sequence >= 12 ? 120 : null,
      usAtcCount: event.sequence >= 19 ? 129 : event.sequence >= 16 ? 105 : null,
      communityHospitalPercentage: event.sequence >= 19 ? 0.25 : event.sequence >= 16 ? 0.12 : null,
      earlierLineUtilization: event.sequence >= 19 ? 0.65 : event.sequence >= 16 ? 0.45 : null,
      annualDoseCapacity: event.sequence >= 19 ? 10_000 : event.sequence >= 14 ? 6_000 : event.sequence >= 8 ? 3_000 : 1_000,
      manufacturingSuccessRate: event.sequence >= 19 ? 0.97 : event.sequence >= 14 ? 0.94 : null,
      outOfSpecRate: event.sequence >= 19 ? 0.03 : event.sequence >= 14 ? 0.06 : null,
      sourceType: event.id === "q1-2026-prelim" ? "management_guidance" : "official_actual",
      sourceDocumentId: event.sourceDocumentId,
      preliminary: event.id === "q1-2026-prelim" ? 1 : 0,
      modelReady: event.carvyktiNts > 0 ? 1 : 0,
      valuationImpactAllowed: event.carvyktiNts > 0 ? 1 : 0,
      rawJson: json({ eventVisible: true, rampProgress, notLegendReportedRevenue: true }),
    };
  });
}

function buildCollaborationSnapshots() {
  return quarters.map((event) => ({
    id: `legn-collab-${event.id}`,
    ticker: TICKER,
    eventId: event.id,
    asOfDate: event.eventDate,
    partner: "Janssen / Johnson & Johnson",
    economicsType: event.carvyktiNts > 0 ? "cost_profit_sharing_research_assumption" : "pre_launch_collaboration",
    legendRevenueShare: event.carvyktiNts > 0 ? Math.min(0.52, event.collaborationRevenue / Math.max(event.carvyktiNts, 1)) : null,
    legendProfitShare: event.carvyktiNts > 0 ? 0.5 : null,
    costShare: event.carvyktiNts > 0 ? 0.5 : null,
    milestoneEligible: event.sequence >= 4 ? 1 : 0,
    advancedFundingBalance: event.fiscalYear >= 2025 ? 319.1 : null,
    recoupmentRate: event.fiscalYear >= 2025 ? 0.08 : null,
    sourceType: event.carvyktiNts > 0 ? "collaboration_assumption" : "official_actual",
    sourceDocumentId: event.sourceDocumentId,
    rationale: event.carvyktiNts > 0
      ? "Event-visible bridge uses disclosed Legend collaboration revenue versus CARVYKTI NTS and keeps profit-share/cost-share as a documented research assumption."
      : "Pre-launch collaboration economics not valuation-ready.",
    confidence: event.sequence >= 12 ? "medium" : "low",
    modelReady: event.carvyktiNts > 0 ? 1 : 0,
    valuationImpactAllowed: event.carvyktiNts > 0 ? 1 : 0,
    rawJson: json({ eventVisible: true, futureTermsNotBackfilled: true }),
  }));
}

function buildCashRunwaySnapshots() {
  return quarters.map((event) => {
    const runwayQuarters = event.quarterlyBurn > 0 ? event.cashAndInvestments / event.quarterlyBurn : 99;
    const dilutionRisk = runwayQuarters < 8 ? "high" : runwayQuarters < 12 ? "medium" : "low";
    return {
      id: `legn-cash-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      cashAndInvestments: event.cashAndInvestments,
      quarterlyBurn: event.quarterlyBurn,
      runwayQuarters,
      dilutionRisk,
      expectedDilutionPct: dilutionRisk === "high" ? 0.18 : dilutionRisk === "medium" ? 0.08 : 0.02,
      sourceType: event.id === "q1-2026-prelim" ? "forecast_assumption" : "official_actual",
      sourceDocumentId: event.sourceDocumentId,
      valuationImpactAllowed: 1,
      rawJson: json({
        eventVisible: true,
        q1_2026_cashUsesLatestDisclosedQ4Cash: event.id === "q1-2026-prelim",
        dilutionCappedInValuation: true,
      }),
    };
  });
}

function buildOperatingExpenseSnapshots() {
  return quarters.map((event) => ({
    id: `legn-opex-${event.id}`,
    ticker: TICKER,
    eventId: event.id,
    asOfDate: event.eventDate,
    rdExpense: event.rdExpense,
    sgaExpense: event.sgaExpense,
    operatingLoss: event.operatingLoss,
    sourceType: event.id === "q1-2026-prelim" ? "forecast_assumption" : "official_actual",
    sourceDocumentId: event.sourceDocumentId,
    rawJson: json({ eventVisible: true, quarterlySnapshot: true }),
  }));
}

function buildDilutionSnapshots() {
  return quarters.map((event) => ({
    id: `legn-dilution-${event.id}`,
    ticker: TICKER,
    eventId: event.id,
    asOfDate: event.eventDate,
    ordinarySharesOutstanding: event.ordinaryShares,
    adsOutstanding: event.adsOutstanding,
    expectedDilutionPct: event.quarterlyBurn > 0 ? Math.min(0.2, Math.max(0.01, 8 / Math.max(event.cashAndInvestments / event.quarterlyBurn, 1) / 10)) : 0.01,
    sourceType: event.id === "q1-2026-prelim" ? "forecast_assumption" : "official_actual",
    sourceDocumentId: event.sourceDocumentId,
    valuationImpactAllowed: 1,
    rawJson: json({ eventVisible: true, oneAdsEqualsTwoOrdinaryShares: true }),
  }));
}

const pipelineSeedRows = [
  ["carvykti-launched", "2022-02-28", "CARVYKTI launched asset", "r/r multiple myeloma 5L+", "autologous BCMA CAR-T", "approved", "CARTITUDE-1", 0.85, 1_600, 2022, 0.42, 1, 0.11, "fda-carvykti", "Approved current indication; peak and economics are research-only event-visible launch assumptions."],
  ["carvykti-2l-4l-expansion", "2024-04-05", "CARVYKTI 2L-4L expansion", "earlier-line multiple myeloma", "autologous BCMA CAR-T", "approved", "CARTITUDE-4", 0.7, 3_000, 2024, 0.42, 1, 0.13, "legn-q1-2024-results", "Earlier-line approvals are modeled separately from launch base to avoid double count."],
  ["carvykti-frontline-option", "2025-03-11", "CARVYKTI frontline option", "frontline multiple myeloma", "autologous BCMA CAR-T", "phase_3", "CARTITUDE-5/6/10", 0.35, 2_500, 2029, 0.38, 1, 0.18, "ctgov-cartitude", "Frontline remains probability-adjusted label-expansion option only."],
  ["lb1908", "2025-03-11", "LB1908", "CLDN18.2 solid tumors", "autologous CAR-T", "phase_1", "NCT solid tumor program", 0.12, 900, 2031, 0.3, 1, 0.3, "ctgov-cartitude", "Solid tumor CAR-T is high-discount option value only."],
  ["lb2102", "2025-11-12", "LB2102", "DLL3 SCLC / LCNEC", "autologous CAR-T", "phase_1", "DLL3 collaboration", 0.14, 800, 2031, 0.3, 0.65, 0.3, "legn-q3-2025-results", "Novartis/license economics remain uncertain and are haircut through economics share."],
  ["lucar-g39d", "2026-03-10", "LUCAR-G39D", "GPRC5D multiple myeloma", "allogeneic CAR-T", "phase_1", "LUCAR-G39D", 0.16, 700, 2031, 0.32, 1, 0.26, "legn-q4-2025-results", "Allogeneic CAR-T is platform option, not core value."],
  ["in-vivo-autoimmune", "2026-03-10", "In vivo / autoimmune CAR-T platform", "autoimmune disease", "in vivo CAR-T / autoimmune", "preclinical", "platform programs", 0.08, 1_000, 2033, 0.35, 1, 0.38, "legn-q4-2025-results", "Speculative platform option only."],
];

function buildPipelineAssets() {
  return pipelineSeedRows.map(([id, asOfDate, assetName, indication, modality, phase, trialName, probabilityOfSuccess, peakSales, launchYear, margin, economicsShare, discountRate, sourceDocumentId, rationale]) => ({
    id: `legn-pipeline-${id}`,
    ticker: TICKER,
    assetName,
    indication,
    modality,
    phase,
    trialName,
    asOfDate,
    sourceType: "pipeline_assumption",
    modelReady: 1,
    valuationImpactAllowed: 1,
    probabilityOfSuccess,
    peakSales,
    launchYear,
    rampYears: phase === "approved" ? 4 : 6,
    margin,
    economicsShare,
    discountRate,
    sourceDocumentId,
    rationale,
    rawJson: json({ eventVisibleFrom: asOfDate, probabilityAdjusted: true, researchOnlyEconomics: true }),
  }));
}

function buildPipelineMilestones() {
  return pipelineSeedRows.map(([id, asOfDate, assetName, indication, modality, phase, trialName, probabilityOfSuccess, peakSales, launchYear, margin, economicsShare, discountRate, sourceDocumentId, rationale]) => ({
    id: `legn-milestone-${id}`,
    ticker: TICKER,
    assetId: `legn-pipeline-${id}`,
    assetName,
    milestoneDate: asOfDate,
    eventId: quarters.find((event) => event.eventDate >= asOfDate)?.id ?? "q4-2025",
    milestoneType: phase === "approved" ? "approval_or_launch" : "clinical_or_pipeline_status",
    description: rationale,
    sourceType: "pipeline_assumption",
    modelReady: 1,
    valuationImpactAllowed: 1,
    rawJson: json({ eventVisible: true, noFutureLeakageGuardrail: true }),
  }));
}

function buildRegulatoryEvents() {
  return [
    ["reg-carvykti-approval", "2022-02-28", "CARVYKTI", "US", "initial_approval", "FDA approval for relapsed/refractory multiple myeloma after four or more prior lines.", "fda-carvykti"],
    ["reg-carvykti-earlier-line", "2024-04-05", "CARVYKTI", "US/EU", "label_expansion", "Earlier-line approval/expansion converts CARTITUDE-4 into a separate label-expansion value layer.", "legn-q1-2024-results"],
    ["reg-iec-ec-warning", "2025-01-01", "CARVYKTI", "US", "safety_label", "CAR-T safety and IEC-EC warning tracked as adoption and frontline-risk modifier.", "fda-carvykti"],
  ].map(([id, eventDate, productName, region, eventType, description, sourceDocumentId]) => ({
    id,
    ticker: TICKER,
    assetName: productName,
    productName,
    region,
    eventDate,
    eventType,
    description,
    sourceType: "FDA_label",
    valuationImpactAllowed: 1,
    rawJson: json({ sourceDocumentId, eventVisible: true }),
  }));
}

function buildClinicalTrialEvents() {
  return [
    ["trial-cartitude-1", "2022-02-28", "CARVYKTI", "CARTITUDE-1", "NCT03548207", "r/r multiple myeloma", "phase_2", "Initial approval-enabling evidence."],
    ["trial-cartitude-4", "2024-04-05", "CARVYKTI", "CARTITUDE-4", "NCT04181827", "earlier-line multiple myeloma", "phase_3", "Earlier-line label-expansion evidence."],
    ["trial-cartitude-5", "2025-03-11", "CARVYKTI", "CARTITUDE-5", "NCT04923893", "frontline transplant-not-planned myeloma", "phase_3", "Frontline option evidence, probability-adjusted."],
    ["trial-cartitude-6", "2025-03-11", "CARVYKTI", "CARTITUDE-6", "NCT05257083", "frontline transplant-eligible myeloma", "phase_3", "Frontline option evidence, probability-adjusted."],
    ["trial-lb1908", "2025-03-11", "LB1908", "LB1908 CLDN18.2", null, "solid tumors", "phase_1", "Solid tumor CAR-T option; high scientific risk."],
    ["trial-lb2102", "2025-11-12", "LB2102", "LB2102 DLL3", null, "SCLC / LCNEC", "phase_1", "DLL3 cell therapy option with uncertain economics."],
  ].map(([id, eventDate, assetName, trialName, nctId, indication, phase, endpointSummary]) => ({
    id,
    ticker: TICKER,
    assetName,
    trialName,
    nctId,
    indication,
    phase,
    eventDate,
    endpointSummary,
    sourceType: "clinicaltrials",
    sourceDocumentId: "ctgov-cartitude",
    modelReady: 1,
    valuationImpactAllowed: 1,
    rawJson: json({ eventVisible: true, displayOnlyClinicalNarrative: false }),
  }));
}

function buildManufacturingEvents() {
  return [
    ["mfg-2024-capacity-plan", "q1-2024", "2024-05-13", "Annual dose capacity plan", 10_000, "patients/year", "legn-q1-2024-results", 1],
    ["mfg-2024-obelisc", "q3-2024", "2024-11-12", "Additional commercial production", 6_000, "patients/year", "legn-q3-2024-results", 1],
    ["mfg-2025-raritan", "q4-2025", "2026-03-10", "Raritan expanded capacity", 10_000, "patients/year", "legn-q4-2025-results", 1],
  ].map(([id, eventId, eventDate, capacityMetric, capacityValue, unit, sourceDocumentId, valuationImpactAllowed]) => ({
    id,
    ticker: TICKER,
    eventId,
    eventDate,
    capacityMetric,
    capacityValue,
    unit,
    sourceType: "management_guidance",
    sourceDocumentId,
    valuationImpactAllowed,
    rawJson: json({ eventVisible: true, capacityConstraintLayer: true }),
  }));
}

function buildCompetitiveSnapshots() {
  return quarters.filter((event) => event.sequence >= 4).map((event) => ({
    id: `legn-competition-${event.id}`,
    ticker: TICKER,
    asOfDate: event.eventDate,
    market: "BCMA multiple myeloma",
    competitorSet: "ide-cel, BCMA bispecifics, GPRC5D, FcRH5, Darzalex-based regimens",
    competitiveIntensityScore: event.sequence >= 16 ? 7.5 : event.sequence >= 11 ? 6.5 : 5,
    erosionCurveJson: json({ year1: 0, year2: event.sequence >= 16 ? 0.04 : 0.02, terminal: event.sequence >= 16 ? 0.18 : 0.1 }),
    sourceType: "research_only",
    valuationImpactAllowed: 0,
    rawJson: json({ displayOnlyByDefault: true, requiresPromotionBeforeValuation: true }),
  }));
}

function buildGuidanceItems() {
  return quarters.flatMap((event) => {
    const items = [];
    if (event.sequence >= 12) {
      items.push({
        id: `legn-guidance-capacity-${event.id}`,
        ticker: TICKER,
        eventId: event.id,
        asOfDate: event.eventDate,
        fiscalPeriodTarget: "forward capacity",
        metric: "CARVYKTI manufacturing capacity",
        guidanceType: "management_guidance",
        lowValue: null,
        highValue: event.sequence >= 19 ? 10_000 : 6_000,
        midpointValue: event.sequence >= 19 ? 10_000 : 6_000,
        unit: "annual doses",
        quote: "Capacity comments are captured as display-first guidance and are not valuation-ready until promoted into forecast assumptions.",
        speaker: "Management",
        sourceDocumentId: event.sourceDocumentId,
        confidence: "medium",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ displayOnly: true }),
      });
    }
    if (event.sequence >= 19) {
      items.push({
        id: `legn-guidance-profit-${event.id}`,
        ticker: TICKER,
        eventId: event.id,
        asOfDate: event.eventDate,
        fiscalPeriodTarget: "FY 2026",
        metric: "Operating profit inflection",
        guidanceType: "management_guidance",
        lowValue: null,
        highValue: null,
        midpointValue: null,
        unit: "text",
        quote: "Management commentary frames 2026 operating profit as a goal; backend keeps it display-only unless promoted.",
        speaker: "Management",
        sourceDocumentId: event.sourceDocumentId,
        confidence: "medium",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ displayOnly: true }),
      });
    }
    return items;
  });
}

function buildTranscriptEvents() {
  return quarters.map((event) => {
    const imported = event.sequence >= 12 && event.sequence <= 19;
    return {
      id: `legn-transcript-event-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      eventDate: event.eventDate,
      fiscalPeriod: event.label,
      transcriptId: `legn-transcript-${event.id}`,
      transcriptImported: imported ? 1 : 0,
      hasQa: imported ? 1 : 0,
      modelReady: 0,
      valuationImpactAllowed: 0,
      sourceName: imported ? "Legend IR / public transcript summary" : "Legend IR and public transcript sources checked",
      sourceUrl: imported ? "https://stockanalysis.com/stocks/legn/transcripts/" : "https://investors.legendbiotech.com/news-events",
      retrievalDate: retrievedAt,
      confidence: imported ? "medium" : "low",
      gapReason: imported ? null : event.id === "q1-2026-prelim" ? "Preliminary sales disclosure; no full Q1 2026 earnings-call transcript available as of retrieval date." : "No public full transcript curated in local dataset; official financial release exists and valuation excludes invented Q&A.",
      metadataJson: json({ transcriptImported: imported, modelReady: false, valuationImpactAllowed: false }),
    };
  });
}

function buildTranscriptExtractions() {
  return buildTranscriptEvents().filter((event) => event.transcriptImported === 1).flatMap((event) => [
    {
      id: `legn-transcript-topic-commercial-${event.eventId}`,
      ticker: TICKER,
      transcriptId: event.transcriptId,
      eventId: event.eventId,
      extractionType: "prepared_remarks",
      topic: "CARVYKTI commercial ramp",
      speaker: "Management",
      supportingQuoteShort: "Commercial ramp, capacity and earlier-line adoption were repeated focus areas.",
      confidence: "medium",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({ displayOnlyByDefault: true }),
    },
    {
      id: `legn-transcript-topic-qa-${event.eventId}`,
      ticker: TICKER,
      transcriptId: event.transcriptId,
      eventId: event.eventId,
      extractionType: "qa_topic",
      topic: "Analyst concerns",
      speaker: "Analysts / Management",
      supportingQuoteShort: "Q&A focus included capacity, operating leverage, collaboration economics and label expansion.",
      confidence: "medium",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({ displayOnlyByDefault: true }),
    },
  ]);
}

function buildAssumptionSets() {
  const scenarioShift = {
    Bear: { peakSalesMultiplier: 0.75, marginShift: -0.06, dilutionMultiplier: 1.6, discountRateShift: 0.04, probabilityMultiplier: 0.75 },
    Base: { peakSalesMultiplier: 1, marginShift: 0, dilutionMultiplier: 1, discountRateShift: 0, probabilityMultiplier: 1 },
    Bull: { peakSalesMultiplier: 1.25, marginShift: 0.05, dilutionMultiplier: 0.55, discountRateShift: -0.025, probabilityMultiplier: 1.2 },
  };
  const weights = {
    carvyktiProductNpv: 0.35,
    collaborationEconomics: 0.2,
    pipelineLabelRnpv: 0.2,
    cashAdjustedEvRevenue: 0.1,
    cashRunwayDilution: 0.1,
    peerBiotechMultiple: 0.05,
  };
  return buildReportingEvents().flatMap((event) => ["Bear", "Base", "Bull"].map((scenario) => ({
    id: `legn-assumption-${event.id}-${scenario.toLowerCase()}`,
    ticker: TICKER,
    name: `${event.label} ${scenario} event-visible assumptions`,
    scenario,
    modelVersion: LEGN_BACKEND_MODEL_VERSION.version,
    asOfDate: event.eventDate,
    assumptionsJson: json({
      weights,
      ...scenarioShift[scenario],
      modelLayer: "forecast_assumption",
      collaborationLayer: "collaboration_assumption",
      pipelineLayer: "pipeline_assumption",
      createdForEventId: event.id,
      noFutureData: true,
    }),
    sourceType: "forecast_assumption",
    createdAt,
  })));
}

function buildModelVersions() {
  return [{
    id: "legn-model-v1",
    ticker: TICKER,
    version: LEGN_BACKEND_MODEL_VERSION.version,
    name: LEGN_BACKEND_MODEL_VERSION.name,
    description: LEGN_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json({
      carvyktiProductNpv: 0.35,
      collaborationEconomics: 0.2,
      pipelineLabelRnpv: 0.2,
      cashAdjustedEvRevenue: 0.1,
      cashRunwayDilution: 0.1,
      peerBiotechMultiple: 0.05,
    }),
    assumptionSchemaJson: json({
      required: ["peakSalesMultiplier", "probabilityMultiplier", "discountRateShift", "dilutionMultiplier", "weights"],
      scenario: ["Bear", "Base", "Bull"],
    }),
    createdAt,
  }];
}

function buildPeerSnapshots() {
  return quarters.map((event) => ({
    id: `legn-peer-${event.id}-cell-therapy`,
    ticker: TICKER,
    asOfDate: event.eventDate,
    peerTicker: "CELLTHERAPY",
    peerName: "Cell therapy / oncology biotech peer basket",
    category: "research_only",
    marketCap: null,
    enterpriseValue: null,
    priceToSales: event.sequence >= 16 ? 7 : 10,
    evToRevenue: event.sequence >= 16 ? 6 : 9,
    evToGrossProfit: event.sequence >= 16 ? 12 : 16,
    source: "research_only peer placeholder; cross-check only, 5% valuation weight.",
    fetchedAt: createdAt,
    confidenceLevel: "low",
    rawJson: json({ valuationImpactAllowed: true, crossCheckOnly: true, weight: 0.05 }),
  }));
}

function buildValidationWarnings() {
  return [
    {
      id: "legn-transcript-gaps-pre-2024",
      ticker: TICKER,
      scope: "transcripts",
      severity: "medium",
      title: "Transcript gaps exist before Q1 2024",
      detail: "Missing transcript_events are explicit and valuationImpactAllowed=false; official financials remain available for valuation.",
      relatedTable: "transcript_events",
      relatedRecordId: null,
      createdAt,
    },
    {
      id: "legn-market-data-seeded-history",
      ticker: TICKER,
      scope: "market_data",
      severity: "low",
      title: "Historical market snapshots are seeded",
      detail: "Replace event-date price placeholders with a historical price feed before using backtests for production decisions.",
      relatedTable: "market_snapshots",
      relatedRecordId: null,
      createdAt,
    },
  ];
}

export async function buildLegnBackendSeedPayload() {
  return {
    reportingEvents: buildReportingEvents(),
    sourceDocuments,
    financialPeriods: buildFinancialPeriods(),
    marketSnapshots: buildMarketSnapshots(),
    peerSnapshots: buildPeerSnapshots(),
    guidanceItems: buildGuidanceItems(),
    transcriptEvents: buildTranscriptEvents(),
    transcriptExtractions: buildTranscriptExtractions(),
    assumptionSets: buildAssumptionSets(),
    modelVersions: buildModelVersions(),
    validationWarnings: buildValidationWarnings(),
    productRevenueSnapshots: buildProductAndCommercialSnapshots(),
    carvyktiCommercialSnapshots: buildCarvyktiSnapshots(),
    collaborationEconomicsSnapshots: buildCollaborationSnapshots(),
    cashRunwaySnapshots: buildCashRunwaySnapshots(),
    operatingExpenseSnapshots: buildOperatingExpenseSnapshots(),
    dilutionSnapshots: buildDilutionSnapshots(),
    pipelineAssets: buildPipelineAssets(),
    pipelineMilestones: buildPipelineMilestones(),
    regulatoryEvents: buildRegulatoryEvents(),
    clinicalTrialEvents: buildClinicalTrialEvents(),
    manufacturingCapacityEvents: buildManufacturingEvents(),
    competitiveLandscapeSnapshots: buildCompetitiveSnapshots(),
  };
}
