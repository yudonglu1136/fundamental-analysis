import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { RTX_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "RTX";
const OFFICIAL_DIR = path.resolve("data/local/rtx/official");
const OFFICIAL_DATASET_PATH = path.resolve("data/local/rtx/rtx_official_dataset.json");

function json(value) {
  return JSON.stringify(value ?? null);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sourceLayer(status, fallback = "research_only") {
  if (status === "official_actual") return "official_actual";
  if (status === "management_guidance") return "management_guidance";
  if (status === "market_data") return "market_data";
  if (status === "forecast_assumption") return "forecast_assumption";
  if (status === "transcript_commentary") return "transcript_commentary";
  return fallback;
}

function eventType(quarter) {
  return `q${quarter}_results`;
}

function quarterLabel(year, quarter) {
  return `CY${year} Q${quarter}`;
}

function releaseDate(year, quarter) {
  const overrides = {
    "2025-4": "2026-01-27",
    "2026-1": "2026-04-21",
  };
  const key = `${year}-${quarter}`;
  if (overrides[key]) return overrides[key];
  const monthDay = {
    1: "04-25",
    2: "07-25",
    3: "10-25",
    4: "01-25",
  }[quarter];
  const releaseYear = quarter === 4 ? year + 1 : year;
  return `${releaseYear}-${monthDay}`;
}

function quarterSeasonality(quarter) {
  return { 1: 0.235, 2: 0.245, 3: 0.25, 4: 0.27 }[quarter] ?? 0.25;
}

function cashSeasonality(quarter) {
  return { 1: 0.16, 2: 0.2, 3: 0.24, 4: 0.4 }[quarter] ?? 0.25;
}

const annualProfiles = {
  2018: { sales: 66501, margin: 0.105, fcf: 4300, backlog: 140000, shares: 950, netDebt: 22000, dividend: 2.9, price: 82, regime: "legacy_utx_pre_merger" },
  2019: { sales: 77046, margin: 0.112, fcf: 5000, backlog: 155000, shares: 860, netDebt: 24000, dividend: 2.94, price: 95, regime: "legacy_utx_pre_merger" },
  2020: { sales: 56587, margin: 0.083, fcf: 2300, backlog: 150000, shares: 1510, netDebt: 30500, dividend: 1.9, price: 72, regime: "raytheon_technologies_merger_transition" },
  2021: { sales: 64388, margin: 0.095, fcf: 5000, backlog: 156000, shares: 1500, netDebt: 28500, dividend: 2.0, price: 89, regime: "raytheon_technologies_post_merger" },
  2022: { sales: 67074, margin: 0.098, fcf: 4800, backlog: 175000, shares: 1480, netDebt: 27500, dividend: 2.2, price: 98, regime: "raytheon_technologies_post_merger" },
  2023: { sales: 68920, margin: 0.086, fcf: 4700, backlog: 196000, shares: 1460, netDebt: 31000, dividend: 2.32, price: 82, regime: "gtf_powder_metal_remediation" },
  2024: { sales: 80738, margin: 0.114, fcf: 4534, backlog: 218000, shares: 1360, netDebt: 31500, dividend: 2.52, price: 118, regime: "rtx_post_realignment" },
  2025: { sales: 88603, margin: 10849 / 88603, fcf: 7940, backlog: 268000, shares: 1349.8, netDebt: 30595, dividend: 2.72, price: 165, regime: "rtx_post_realignment" },
  2026: { sales: 93000, margin: 0.126, fcf: 8500, backlog: 271000, shares: 1364.6, netDebt: 30369, dividend: 2.8, price: 178.61, regime: "rtx_2026_guidance" },
};

const priceQuarterAdjust = {
  1: -0.04,
  2: 0.01,
  3: 0.04,
  4: 0.08,
};

function profileFor(year) {
  return annualProfiles[year] ?? annualProfiles[2026];
}

function eventSource(year, quarter) {
  if (year === 2025 && quarter === 4) {
    return {
      sourceType: "official_actual",
      sourceDocumentId: "rtx-fy2025-results",
      sourcePath: "data/local/rtx/official/fy2025_rtx-reports-2025-results-and-announces-2026-outlook_363a7d94683b.txt",
      sourceUrl: "https://www.rtx.com/news/news-center/2026/01/27/rtx-reports-2025-results-and-announces-2026-outlook",
      title: "FY2025 results and 2026 outlook",
    };
  }
  if (year === 2026 && quarter === 1) {
    return {
      sourceType: "official_actual",
      sourceDocumentId: "rtx-q1-2026-results",
      sourcePath: "data/local/rtx/official/q1-2026_rtx-reports-q1-2026-results_92bb5c6983f6.txt",
      sourceUrl: "https://www.rtx.com/news/news-center/2026/04/21/rtx-reports-q1-2026-results-",
      title: "Q1 2026 results",
    };
  }
  return {
    sourceType: "research_only",
    sourceDocumentId: "rtx-ir-quarterly-archive",
    sourcePath: "data/local/rtx/official/archive_rtx-quarterly-results-archive_6dfd5cb98d45.json",
    sourceUrl: "https://investors.rtx.com/financial-information/quarterly-results",
    title: `${quarterLabel(year, quarter)} historical continuity event`,
  };
}

function buildQuarterConfigs() {
  const rows = [];
  for (let year = 2018; year <= 2026; year += 1) {
    const lastQuarter = year === 2026 ? 1 : 4;
    for (let quarter = 1; quarter <= lastQuarter; quarter += 1) {
      const source = eventSource(year, quarter);
      rows.push({
        id: `rtx-cy${year}-q${quarter}`,
        year,
        quarter,
        eventDate: releaseDate(year, quarter),
        fiscalPeriod: quarterLabel(year, quarter),
        eventType: eventType(quarter),
        label: quarterLabel(year, quarter),
        ...source,
      });
    }
  }
  return rows;
}

function buildEventFinancial(config) {
  const profile = profileFor(config.year);
  const isAnnual = config.quarter === 4;
  const isOfficialQ1_2026 = config.year === 2026 && config.quarter === 1;
  const isOfficialFY2025 = config.year === 2025 && config.quarter === 4;
  const sourceType = config.sourceType;
  const quarterSales = isOfficialQ1_2026 ? 22076 : profile.sales * quarterSeasonality(config.quarter);
  const totalRevenue = isAnnual ? profile.sales : quarterSales;
  const marginDrift = (config.quarter - 2.5) * 0.002;
  const adjustedOperatingProfit = isOfficialQ1_2026
    ? 3023
    : isOfficialFY2025
      ? 10849
      : totalRevenue * Math.max(profile.margin + marginDrift, 0.055);
  const gtfInspectionCharges =
    config.eventDate >= "2023-09-01"
      ? Math.round((config.year === 2023 ? 2900 : config.year === 2024 ? 900 : config.year === 2025 ? 250 : 0) * (isAnnual ? 1 : quarterSeasonality(config.quarter)))
      : 0;
  const operatingProfit = isOfficialQ1_2026
    ? 2555
    : Math.max(adjustedOperatingProfit - gtfInspectionCharges, totalRevenue * 0.035);
  const freeCashFlow = isOfficialQ1_2026 ? 1309 : isAnnual ? profile.fcf : profile.fcf * cashSeasonality(config.quarter);
  const capex = isOfficialQ1_2026 ? 546 : isAnnual ? profile.sales * 0.03 : totalRevenue * 0.032;
  const dilutedShares = isOfficialQ1_2026 ? 1364.6 : profile.shares - (config.quarter - 1) * 1.5;
  const netDebt = isOfficialQ1_2026 ? 30369 : profile.netDebt + (config.quarter - 2) * 120;
  const adjustedEps = isOfficialQ1_2026
    ? 1.78
    : isOfficialFY2025
      ? 6.29
      : ((adjustedOperatingProfit * 0.79 - Math.max(netDebt, 0) * 0.011) / Math.max(dilutedShares, 1)) * (isAnnual ? 1 : 1);
  const gaapEps = isOfficialQ1_2026 ? 1.51 : Math.max(adjustedEps - (gtfInspectionCharges / Math.max(dilutedShares, 1)) * 0.75, -2);
  const backlog = isOfficialQ1_2026 ? 271000 : profile.backlog * (1 + (config.quarter - 4) * 0.012);
  const backlogCommercial = config.year >= 2020 ? backlog * (config.year >= 2025 ? 0.6 : 0.54) : null;
  const backlogDefense = config.year >= 2020 ? backlog - backlogCommercial : null;
  const commercialAftermarketGrowth = config.year >= 2021 ? 0.04 + Math.min(config.year - 2021, 5) * 0.012 + config.quarter * 0.001 : null;
  const defenseBookToBill = config.year >= 2020 ? 1.02 + Math.min(Math.max(config.year - 2020, 0), 6) * 0.025 + config.quarter * 0.003 : null;
  return {
    id: `${config.id}-financial`,
    ticker: TICKER,
    periodId: config.fiscalPeriod.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    eventId: config.id,
    asOfDate: config.eventDate,
    fiscalYear: config.year,
    fiscalQuarter: config.quarter,
    periodType: isAnnual ? "annual" : "quarter",
    sourceType,
    totalRevenue: Math.round(totalRevenue),
    adjustedSales: Math.round(totalRevenue),
    organicSales: config.year >= 2024 ? Math.round(totalRevenue * 0.99) : null,
    operatingProfit: Math.round(operatingProfit),
    adjustedOperatingProfit: Math.round(adjustedOperatingProfit),
    operatingMargin: adjustedOperatingProfit / Math.max(totalRevenue, 1),
    adjustedEps,
    gaapEps,
    dilutedShares,
    netIncome: Math.round(gaapEps * dilutedShares),
    operatingCashFlow: Math.round(freeCashFlow + capex),
    capex: Math.round(capex),
    freeCashFlow: Math.round(freeCashFlow),
    workingCapital: Math.round(totalRevenue * 0.12),
    backlog: Math.round(backlog),
    backlogCommercial: backlogCommercial == null ? null : Math.round(backlogCommercial),
    backlogDefense: backlogDefense == null ? null : Math.round(backlogDefense),
    commercialAftermarketGrowth,
    defenseBookings: defenseBookToBill == null ? null : Math.round(totalRevenue * defenseBookToBill),
    defenseBookToBill,
    gtfInspectionCharges,
    gtfCashImpact: gtfInspectionCharges ? Math.round(gtfInspectionCharges * 0.45) : 0,
    pensionExpense: config.year >= 2025 ? 260 : null,
    nonServicePension: config.year >= 2025 ? -355 : null,
    cash: Math.max(4500, Math.round(profile.sales * 0.075)),
    debt: Math.max(0, Math.round(netDebt + profile.sales * 0.075)),
    netDebt: Math.round(netDebt),
    buybacks: isAnnual ? Math.max(0, Math.round(profile.fcf * 0.16)) : 0,
    dividendsPaid: Math.round(dilutedShares * (isAnnual ? profile.dividend : profile.dividend / 4)),
    dividendPerShare: isAnnual ? profile.dividend : profile.dividend / 4,
    notes: sourceType === "official_actual"
      ? "Official RTX release row from local source cache."
      : `Research-only continuity row for ${config.fiscalPeriod}; not an official actual. Regime=${profile.regime}.`,
    rawJson: json({
      profileRegime: profile.regime,
      sourceBoundary: sourceType,
      mergerComparability: config.year < 2020 ? "legacy United Technologies pre-Raytheon merger; not comparable with current RTX segments" : "post-merger RTX/Raytheon Technologies continuity",
      generatedBy: "modules/rtx/ingestion/importLocalData.mjs",
    }),
  };
}

function segmentMix(config) {
  const year = config.year;
  if (year < 2020) {
    return [
      ["Collins Aerospace", 0.36, 0.145, "legacy_utx", "Legacy UTC aerospace systems mapped to Collins where comparable."],
      ["Pratt & Whitney", 0.30, 0.095, "legacy_utx", "Legacy Pratt & Whitney continuing segment."],
      ["Legacy UTC / discontinued operations", 0.34, 0.105, "legacy_utx", "Otis, Carrier, and other pre-merger operations are not comparable with current RTX."],
    ];
  }
  const gtfDrag = config.eventDate >= "2023-09-01" && config.eventDate < "2025-01-01" ? -0.018 : 0;
  return [
    ["Collins Aerospace", config.year >= 2025 ? 0.34 : 0.35, config.year >= 2025 ? 0.162 : 0.15, "rtx_current", "Collins Aerospace current segment."],
    ["Pratt & Whitney", config.year >= 2025 ? 0.36 : 0.33, Math.max((config.year >= 2025 ? 0.083 : 0.078) + gtfDrag, 0.035), "rtx_current", "Pratt & Whitney current segment; GTF charge/cash impact tracked separately."],
    ["Raytheon", config.year >= 2025 ? 0.30 : 0.32, config.year >= 2025 ? 0.115 : 0.10, "rtx_current", "Raytheon current defense segment."],
  ];
}

function officialSegments(config) {
  if (config.year === 2025 && config.quarter === 4) {
    return [
      ["Collins Aerospace", 30196, 4893, 0.162],
      ["Pratt & Whitney", 32916, 2725, 0.083],
      ["Raytheon", 28043, 3231, 0.115],
    ];
  }
  if (config.year === 2026 && config.quarter === 1) {
    return [
      ["Collins Aerospace", 7602, 1298, 0.171],
      ["Pratt & Whitney", 8173, 711, 0.087],
      ["Raytheon", 6945, 845, 0.122],
    ];
  }
  return null;
}

function buildSegmentRows(config, financial) {
  const official = officialSegments(config);
  if (official) {
    return official.map(([segment, revenue, operatingProfit, margin]) => ({
      id: `${config.id}-${segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      ticker: TICKER,
      periodId: financial.periodId,
      eventId: config.id,
      asOfDate: config.eventDate,
      fiscalYear: config.year,
      fiscalQuarter: config.quarter,
      segment,
      taxonomy: "rtx_current",
      legacySegmentMapping: null,
      sourceType: "official_actual",
      revenue,
      adjustedSales: revenue,
      organicSales: null,
      operatingProfit,
      operatingMargin: margin,
      backlog: null,
      commercialAftermarketGrowth: segment === "Collins Aerospace" ? financial.commercialAftermarketGrowth : null,
      defenseBookings: segment === "Raytheon" ? financial.defenseBookings : null,
      bookToBill: segment === "Raytheon" ? financial.defenseBookToBill : null,
      gtfInspectionCharges: segment === "Pratt & Whitney" ? financial.gtfInspectionCharges : 0,
      gtfCashImpact: segment === "Pratt & Whitney" ? financial.gtfCashImpact : 0,
      notes: "Official RTX segment row from locally cached release.",
      rawJson: json({ sourceBoundary: "official_actual" }),
    }));
  }
  return segmentMix(config).map(([segment, mix, margin, taxonomy, notes]) => {
    const revenue = financial.totalRevenue * mix;
    return {
      id: `${config.id}-${segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      ticker: TICKER,
      periodId: financial.periodId,
      eventId: config.id,
      asOfDate: config.eventDate,
      fiscalYear: config.year,
      fiscalQuarter: config.quarter,
      segment,
      taxonomy,
      legacySegmentMapping: taxonomy === "legacy_utx" ? notes : null,
      sourceType: "research_only",
      revenue: Math.round(revenue),
      adjustedSales: Math.round(revenue),
      organicSales: null,
      operatingProfit: Math.round(revenue * margin),
      operatingMargin: margin,
      backlog: segment === "Raytheon" ? financial.backlogDefense : null,
      commercialAftermarketGrowth: segment === "Collins Aerospace" || segment === "Pratt & Whitney" ? financial.commercialAftermarketGrowth : null,
      defenseBookings: segment === "Raytheon" ? financial.defenseBookings : null,
      bookToBill: segment === "Raytheon" ? financial.defenseBookToBill : null,
      gtfInspectionCharges: segment === "Pratt & Whitney" ? financial.gtfInspectionCharges : 0,
      gtfCashImpact: segment === "Pratt & Whitney" ? financial.gtfCashImpact : 0,
      notes,
      rawJson: json({
        sourceBoundary: "research_only",
        notOfficialActual: true,
        taxonomy,
      }),
    };
  });
}

function buildMarketSnapshot(config, financial) {
  const profile = profileFor(config.year);
  const currentPrice = config.year === 2026 && config.quarter === 1
    ? 178.61
    : profile.price * (1 + (priceQuarterAdjust[config.quarter] ?? 0));
  const marketCap = currentPrice * financial.dilutedShares;
  return {
    id: `${config.id}-market`,
    ticker: TICKER,
    eventId: config.id,
    asOfDate: config.eventDate,
    priceDate: config.eventDate,
    currentPrice,
    currency: "USD",
    marketCap,
    enterpriseValue: marketCap + financial.netDebt,
    sharesOutstanding: financial.dilutedShares,
    previousClose: currentPrice,
    dividendYield: financial.dividendPerShare / Math.max(currentPrice, 0.01),
    beta: 0.9,
    source: "Research-only event market placeholder; daily price bars override valuation currentPrice after import.",
    sourceType: "research_only",
    fetchedAt: new Date().toISOString(),
    rawJson: json({
      sourceBoundary: "research_only",
      dailyPriceBarsRequiredForValuationAnchor: true,
    }),
  };
}

function scenarioAssumptions(config, financial, scenarioPreset) {
  const yearProgress = Math.max(0, Math.min(1, (config.year - 2018) / 8));
  const sourcePenalty = config.sourceType === "official_actual" ? 0 : 0.004;
  const gtfPenalty = financial.gtfInspectionCharges > 0 ? 0.006 : 0;
  const scenarioBias = scenarioPreset.scenario === "Bull" ? 0.008 : scenarioPreset.scenario === "Bear" ? -0.01 : 0;
  const fcfMargin = financial.freeCashFlow / Math.max(financial.periodType === "quarter" ? financial.totalRevenue * 4 : financial.totalRevenue, 1);
  return {
    currentPrice: null,
    revenueCagr: Math.max(0.005, Math.min(0.08, scenarioPreset.revenueCagr - (1 - yearProgress) * 0.012 + scenarioBias)),
    operatingMargin: Math.max(0.055, Math.min(0.15, financial.operatingMargin + scenarioBias * 0.55 - gtfPenalty)),
    targetFcfYield: Math.max(0.032, Math.min(0.07, scenarioPreset.targetFcfYield + (1 - yearProgress) * 0.012 + sourcePenalty + gtfPenalty)),
    targetPe: Math.max(12, Math.min(29, scenarioPreset.targetPe - (1 - yearProgress) * 4.2 - sourcePenalty * 120 - gtfPenalty * 80)),
    targetEvEbit: Math.max(10, Math.min(26, scenarioPreset.targetEvEbit - (1 - yearProgress) * 3.5 - sourcePenalty * 100 - gtfPenalty * 70)),
    netDebt: financial.netDebt,
    dilutedShares: financial.dilutedShares,
    dividendPerShare: financial.periodType === "quarter" ? financial.dividendPerShare * 4 : financial.dividendPerShare,
    capexIntensity: Math.max(0.02, Math.min(0.055, financial.capex / Math.max(financial.totalRevenue, 1))),
    workingCapitalDragPctRevenueGrowth: Math.max(0.08, Math.min(0.18, 0.12 + Math.max(0, 0.075 - fcfMargin))),
    backlogDurabilityMaxAdjustment: config.year < 2020 ? 0.035 : Math.max(0.045, Math.min(0.1, 0.06 + yearProgress * 0.04)),
    taxRate: 0.19,
    dAndAIntensity: 0.048,
    weightDcf: 0.35,
    weightFcfYield: 0.25,
    weightEvEbit: 0.15,
    weightPe: 0.1,
    weightBacklogDurability: 0.15,
  };
}

async function loadStaticRtxModules() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const dataModule = await server.ssrLoadModule("/src/stocks/rtx/data.ts");
    return dataModule.rtxData;
  } finally {
    await server.close();
  }
}

export async function buildRtxBackendSeedPayload() {
  const now = new Date().toISOString();
  const staticDataset = await loadStaticRtxModules();
  const localOfficialDataset = readJson(OFFICIAL_DATASET_PATH, {});
  const events = buildQuarterConfigs();
  const reportingEvents = events.map((event) => ({
    id: event.id,
    ticker: TICKER,
    eventDate: event.eventDate,
    fiscalPeriod: event.fiscalPeriod,
    fiscalYear: event.year,
    fiscalQuarter: event.quarter,
    eventType: event.eventType,
    label: event.label,
    title: event.title,
    sourceType: event.sourceType,
    sourceDocumentId: event.sourceDocumentId,
    sourcePath: event.sourcePath,
    sourceUrl: event.sourceUrl,
    metadataJson: json({
      sourceBoundary: event.sourceType,
      corporateName: event.year >= 2023 ? "RTX Corporation" : event.year >= 2020 ? "Raytheon Technologies" : "United Technologies",
      researchOnlyContinuity: event.sourceType !== "official_actual",
    }),
    createdAt: now,
  }));

  const financialPeriods = events.map(buildEventFinancial);
  const financialByEvent = new Map(financialPeriods.map((row) => [row.eventId, row]));
  const segmentFinancials = events.flatMap((event) => buildSegmentRows(event, financialByEvent.get(event.id)));
  const marketSnapshots = events.map((event) => buildMarketSnapshot(event, financialByEvent.get(event.id)));

  const sourceDocuments = [
    {
      id: "rtx-fy2025-results",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "RTX Reports 2025 Results and Announces 2026 Outlook",
      documentType: "earnings_release",
      sourcePath: "data/local/rtx/official/fy2025_rtx-reports-2025-results-and-announces-2026-outlook_363a7d94683b.txt",
      sourceUrl: "https://www.rtx.com/news/news-center/2026/01/27/rtx-reports-2025-results-and-announces-2026-outlook",
      retrievedAt: now,
      publishedDate: "2026-01-27",
      provenance: "RTX official release cached locally",
      confidence: "high",
      checksum: readJson(path.join(OFFICIAL_DIR, "fy2025_rtx-reports-2025-results-and-announces-2026-outlook_363a7d94683b.json"), {})?.contentHash ?? null,
      metadataJson: json({ reportingPeriod: "FY2025" }),
    },
    {
      id: "rtx-q1-2026-results",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "RTX Reports Q1 2026 Results",
      documentType: "earnings_release",
      sourcePath: "data/local/rtx/official/q1-2026_rtx-reports-q1-2026-results_92bb5c6983f6.txt",
      sourceUrl: "https://www.rtx.com/news/news-center/2026/04/21/rtx-reports-q1-2026-results-",
      retrievedAt: now,
      publishedDate: "2026-04-21",
      provenance: "RTX official release cached locally",
      confidence: "high",
      checksum: readJson(path.join(OFFICIAL_DIR, "q1-2026_rtx-reports-q1-2026-results_92bb5c6983f6.json"), {})?.contentHash ?? null,
      metadataJson: json({ reportingPeriod: "Q1 2026" }),
    },
    {
      id: "rtx-ir-quarterly-archive",
      ticker: TICKER,
      sourceType: "research_only",
      sourceName: "RTX investor relations quarterly results archive",
      documentType: "source_index",
      sourcePath: "data/local/rtx/official/archive_rtx-quarterly-results-archive_6dfd5cb98d45.json",
      sourceUrl: "https://investors.rtx.com/financial-information/quarterly-results",
      retrievedAt: now,
      publishedDate: null,
      provenance: "Local archive index; individual older official releases are not cached in this workspace.",
      confidence: "medium",
      checksum: null,
      metadataJson: json({ olderQuarterRows: "research_only_continuity" }),
    },
    {
      id: "rtx-local-official-dataset",
      ticker: TICKER,
      sourceType: "research_only",
      sourceName: "RTX local official dataset snapshot",
      documentType: "curated_dataset",
      sourcePath: "data/local/rtx/rtx_official_dataset.json",
      sourceUrl: null,
      retrievedAt: now,
      publishedDate: null,
      provenance: "Local curated dataset derived from cached RTX releases.",
      confidence: "medium",
      checksum: null,
      metadataJson: json({ keys: Object.keys(localOfficialDataset ?? {}) }),
    },
  ];

  const peerSnapshots = events.flatMap((event) => {
    const asOfDate = event.eventDate;
    return [
      ["LMT", "Lockheed Martin", "defense_prime"],
      ["NOC", "Northrop Grumman", "defense_prime"],
      ["GE", "GE Aerospace", "commercial_aero"],
    ].map(([peerTicker, peerName, peerGroup]) => ({
      id: `${event.id}-peer-${peerTicker.toLowerCase()}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate,
      peerTicker,
      peerName,
      peerGroup,
      currency: "USD",
      marketCap: null,
      enterpriseValue: null,
      trailingPe: null,
      forwardPe: null,
      forwardEvEbit: null,
      forwardEvEbitda: null,
      dividendYield: null,
      source: "Research-only peer set metadata",
      sourceType: "research_only",
      confidenceLevel: "medium",
      absoluteValueUse: "metadata_only_no_aggregation",
      rawJson: json({ mixedCurrencyGuard: "absolute values are not aggregated" }),
    }));
  });

  const guidanceItems = events.flatMap((event) => {
    if (!(event.year === 2025 && event.quarter === 4) && !(event.year === 2026 && event.quarter === 1)) return [];
    const salesLow = event.year === 2026 && event.quarter === 1 ? 92500 : 92000;
    const salesHigh = event.year === 2026 && event.quarter === 1 ? 93500 : 93000;
    const epsLow = event.year === 2026 && event.quarter === 1 ? 6.7 : 6.6;
    const epsHigh = event.year === 2026 && event.quarter === 1 ? 6.9 : 6.8;
    const sourcePath = event.sourcePath;
    return [
      ["adjusted_sales", salesLow, salesHigh, "USDm"],
      ["adjusted_eps", epsLow, epsHigh, "USD/share"],
      ["free_cash_flow", 8250, 8750, "USDm"],
    ].map(([metric, lowValue, highValue, unit]) => ({
      id: `${event.id}-guidance-${metric}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      fiscalPeriodTarget: "CY2026",
      fiscalYear: 2026,
      metric,
      guidanceType: "management_outlook",
      lowValue,
      highValue,
      midpointValue: (Number(lowValue) + Number(highValue)) / 2,
      unit,
      quote: null,
      speaker: "RTX management",
      sourcePath,
      confidence: "high",
      humanReviewStatus: "reviewed_not_promoted",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({ sourceBoundary: "management_guidance", valuationImpactAllowedReason: "Adapter uses event-dated assumption_sets unless guidance is explicitly promoted." }),
    }));
  });

  const transcriptEvents = events.map((event) => ({
    id: `${event.id}-transcript`,
    ticker: TICKER,
    eventId: event.id,
    eventDate: event.eventDate,
    fiscalPeriod: event.fiscalPeriod,
    eventType: event.eventType,
    transcriptId: `${event.id}-call`,
    hasQa: 0,
    sourcePath: null,
    provenance: event.sourceType === "official_actual" ? "release-only local cache" : "candidate transcript placeholder",
    confidence: event.sourceType === "official_actual" ? "medium" : "low",
    modelReady: 0,
    valuationImpactAllowed: 0,
    metadataJson: json({ sourceBoundary: "transcript_commentary", modelReady: false }),
  }));

  const transcriptExtractions = events.map((event) => ({
    id: `${event.id}-transcript-extraction-supply-chain`,
    ticker: TICKER,
    transcriptId: `${event.id}-call`,
    eventId: event.id,
    extractionType: "theme",
    topic: "supply chain and execution commentary",
    segment: null,
    speaker: null,
    section: "candidate_summary",
    supportingQuoteShort: null,
    confidence: "low",
    needsHumanReview: 1,
    modelReady: 0,
    valuationImpactAllowed: 0,
    rawJson: json({ sourceBoundary: "transcript_commentary", note: "Candidate only; not used in valuation." }),
  }));

  const modelVersions = [{
    id: RTX_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: RTX_BACKEND_MODEL_VERSION.version,
    name: RTX_BACKEND_MODEL_VERSION.name,
    description: RTX_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json([
      "Existing defense-prime frontend valuation engine",
      "DCF",
      "FCF yield",
      "EV/EBIT",
      "P/E",
      "Backlog durability layer",
    ]),
    assumptionSchemaJson: json(staticDataset?.assumptions ?? {}),
    sourceIsolationPolicyJson: json(RTX_BACKEND_MODEL_VERSION.sourceIsolationPolicy),
    createdAt: now,
  }];

  const assumptionSets = events.flatMap((event) => {
    const financial = financialByEvent.get(event.id);
    return (staticDataset?.scenarios ?? []).map((scenarioPreset) => ({
      id: `${event.id}-${scenarioPreset.scenario.toLowerCase()}-assumptions`,
      ticker: TICKER,
      name: `${event.fiscalPeriod} ${scenarioPreset.scenario} assumptions`,
      scenario: scenarioPreset.scenario,
      modelVersion: RTX_BACKEND_MODEL_VERSION.version,
      asOfDate: event.eventDate,
      assumptionsJson: json(scenarioAssumptions(event, financial, scenarioPreset)),
      sourceType: "forecast_assumption",
      notes: "Event-dated assumptions generated from the current RTX model's scenario fields and event-visible financial scale.",
      createdAt: now,
    }));
  });

  const validationWarnings = [
    {
      id: "rtx-merger-comparability-warning",
      ticker: TICKER,
      scope: "historical_coverage",
      severity: "medium",
      title: "RTX historical comparability changes around the 2020 merger",
      detail: "Pre-2020 rows represent legacy United Technologies continuity and are marked research_only; Raytheon segment rows are not backfilled as official actuals before the merger.",
      relatedTable: "reporting_events",
      relatedRecordId: "rtx-cy2018-q1",
      createdAt: now,
    },
    {
      id: "rtx-research-only-quarter-warning",
      ticker: TICKER,
      scope: "financial_periods",
      severity: "medium",
      title: "Older RTX quarterly rows are research-only continuity rows",
      detail: "Only locally cached FY2025 and Q1 2026 RTX releases are promoted as official_actual. Older quarters preserve quarterly granularity but are not presented as official actuals.",
      relatedTable: "financial_periods",
      relatedRecordId: null,
      createdAt: now,
    },
    {
      id: "rtx-gtf-no-future-leakage-warning",
      ticker: TICKER,
      scope: "valuation",
      severity: "low",
      title: "GTF charge assumptions are event-dated",
      detail: "Powder-metal inspection charges and cash impacts are zero before the 2023 disclosure window and are not applied to pre-disclosure valuation runs.",
      relatedTable: "financial_periods",
      relatedRecordId: null,
      createdAt: now,
    },
    {
      id: "rtx-market-proxy-warning",
      ticker: TICKER,
      scope: "market_snapshots",
      severity: "medium",
      title: "Market snapshots are placeholders until daily bars are imported",
      detail: "Valuation service overrides market_snapshots with daily_price_bars adjustedClose using nearest prior trading day when price bars are available.",
      relatedTable: "market_snapshots",
      relatedRecordId: null,
      createdAt: now,
    },
  ];

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
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
