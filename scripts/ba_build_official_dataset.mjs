import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUTPUT_PATH = path.join(ROOT, "data/local/ba/ba_official_dataset.json");
const BUILD_DATE = new Date().toISOString();

const sources = [
  {
    id: "ba-hy-2024-results",
    title: "BAE Systems 2024 half year results",
    url: "https://www.baesystems.com/en/article/2024-half-year-results",
    sourceStatus: "official_actual",
  },
  {
    id: "ba-fy-2024-results",
    title: "BAE Systems 2024 full year results",
    url: "https://www.baesystems.com/en-us/article/2024-full-year-results",
    sourceStatus: "official_actual",
  },
  {
    id: "ba-agm-market-update-may-2024",
    title: "BAE Systems AGM market update May 2024",
    url: "https://www.baesystems.com/en/article/annual-general-meeting-and-market-update-may-2024",
    sourceStatus: "management_guidance",
  },
  {
    id: "ba-market-update-nov-2024",
    title: "BAE Systems market update November 2024",
    url: "https://www.baesystems.com/en-uk/article/market-update-nov-2024",
    sourceStatus: "management_guidance",
  },
  {
    id: "ba-agm-market-update-may-2025",
    title: "BAE Systems AGM market update May 2025",
    url: "https://www.baesystems.com/en-uk/article/annual-general-meeting-and-market-update-may-2025",
    sourceStatus: "management_guidance",
  },
  {
    id: "ba-market-update-nov-2025",
    title: "BAE Systems market update November 2025",
    url: "https://www.baesystems.com/en-us/article/market-update-nov-2025",
    sourceStatus: "management_guidance",
  },
  {
    id: "ba-agm-trading-update-may-2026",
    title: "BAE Systems trading update May 2026",
    url: "https://www.globenewswire.com/news-release/2026/05/07/3289615/1953/en/BAE-Systems-Trading-update.html",
    sourceStatus: "management_guidance",
  },
  {
    id: "ba-ar-2025-web",
    title: "BAE Systems Annual Report 2025 web summary",
    url: "https://www.baesystems.com/annualreport/2025",
    sourceStatus: "official_actual",
  },
  {
    id: "ba-ar-2025-pdf",
    title: "BAE Systems Annual Report 2025 PDF",
    url: "https://investors.baesystems.com/dam/jcr%3A105fe9f2-cff7-4960-9d99-956aba996540/BAE-Systems-Annual-Report-2025.2026-03-24-10-33-48.pdf",
    sourceStatus: "official_actual",
  },
  {
    id: "ba-fy-2025-results",
    title: "BAE Systems 2025 full year results",
    url: "https://www.baesystems.com/en-uk/article/2025-full-year-results",
    sourceStatus: "official_actual",
  },
  {
    id: "ba-share-price-monitor",
    title: "BAE Systems share price monitor",
    url: "https://investors.baesystems.com/share-price-monitor",
    sourceStatus: "market_data",
  },
];

const dataset = {
  company: "BAE Systems plc",
  ticker: "BA.L",
  currency: "GBP",
  reportingCurrency: "GBP",
  latestReportingPeriod: "Year ended 31 December 2025",
  buildDate: BUILD_DATE,
  financials: {
    sourceStatus: "official_actual",
    sourceId: "ba-fy-2025-results",
    fy2025: {
      sales: 30_662,
      revenue: 28_336,
      underlyingEbit: 3_322,
      underlyingEbitMargin: 0.108,
      underlyingEpsPence: 75.2,
      basicEpsPence: 68.8,
      freeCashFlow: 2_158,
      netCashFlowFromOperations: 3_432,
      orderIntake: 36_800,
      orderBacklog: 83_600,
      orderBook: 63_100,
      dividendPerSharePence: 36.3,
      netDebtExLeases: 3_844,
      leaseLiabilitiesNet: 1_742,
      postEmploymentBenefitSurplus: 844,
      weightedAverageDilutedShares: 3_031,
    },
    fy2024: {
      sales: 28_335,
      revenue: 26_312,
      underlyingEbit: 3_015,
      underlyingEbitMargin: 0.106,
      underlyingEpsPence: 68.5,
      basicEpsPence: 64.9,
      freeCashFlow: 2_505,
      netCashFlowFromOperations: 3_925,
      orderIntake: 33_700,
      orderBacklog: 77_800,
      orderBook: 60_400,
      dividendPerSharePence: 33.0,
    },
  },
  segments: {
    sourceStatus: "official_actual",
    sourceId: "ba-ar-2025-pdf",
    fy2025: [
      { segment: "Electronic Systems", sales: 7_528, underlyingEbit: 1_162, margin: 0.154, orderIntake: 8_700, orderBacklog: 13_600, orderBook: 9_100 },
      { segment: "Platforms & Services", sales: 5_039, underlyingEbit: 576, margin: 0.114, orderIntake: 6_200, orderBacklog: 15_000, orderBook: 14_600 },
      { segment: "Air", sales: 9_299, underlyingEbit: 1_108, margin: 0.119, orderIntake: 14_600, orderBacklog: 32_600, orderBook: 18_500 },
      { segment: "Maritime", sales: 6_797, underlyingEbit: 457, margin: 0.067, orderIntake: 5_000, orderBacklog: 21_300, orderBook: 20_500 },
      { segment: "Cyber & Intelligence", sales: 2_397, underlyingEbit: 223, margin: 0.093, orderIntake: 2_700, orderBacklog: 2_100, orderBook: 1_400 },
      { segment: "HQ", sales: 232, underlyingEbit: -204, orderIntake: 200, orderBacklog: 0 },
      { segment: "Deduct: Intra-group", sales: -630, orderIntake: -600, orderBacklog: -1_000, orderBook: -1_000 },
    ],
  },
  backlog: {
    sourceStatus: "official_actual",
    sourceId: "ba-fy-2025-results",
    totalBacklog: 83_600,
    priorBacklog: 77_800,
    orderIntake: 36_800,
    bookToBill: 36_800 / 30_662,
    backlogCoverageYears: 83_600 / 30_662,
  },
  orderIntake: {
    sourceStatus: "official_actual",
    sourceId: "ba-fy-2025-results",
    fy2025: 36_800,
    fy2024: 33_700,
  },
  guidance: {
    sourceStatus: "management_guidance",
    sourceId: "ba-fy-2025-results",
    fy2026: {
      salesGrowthRange: [0.07, 0.09],
      underlyingEbitGrowthRange: [0.09, 0.11],
      underlyingEpsGrowthRange: [0.09, 0.11],
      freeCashFlowFloor: 1_300,
      effectiveTaxRate: 0.22,
      underlyingNetFinanceCosts: 370,
      nonControllingInterests: 80,
    },
  },
  programs: [
    { name: "Typhoon for Türkiye", segment: "Air", sourceStatus: "research_only", sourceId: "ba-fy-2025-results" },
    { name: "Type 26 Norway", segment: "Maritime", sourceStatus: "research_only", sourceId: "ba-ar-2025-web" },
    { name: "US Space Force missile warning and tracking", segment: "Electronic Systems", sourceStatus: "research_only", sourceId: "ba-ar-2025-web" },
    { name: "GCAP / Tempest", segment: "Air", sourceStatus: "research_only", sourceId: "ba-fy-2025-results" },
    { name: "Dreadnought / Astute / SSN-AUKUS", segment: "Maritime", sourceStatus: "research_only", sourceId: "ba-ar-2025-web" },
  ],
  reportingEvents: {
    sourceStatus: "mixed_official_and_research_synthesis",
    note: "BAE follows a UK reporting cadence. These are eight quarter windows anchored to official results, AGM market updates, and trading updates; AI summaries are research-only and do not enter valuation.",
    windows: [
      { quarter: "2024-Q3", eventDate: "2024-08-01", event: "2024 Half Year Results", sourceId: "ba-hy-2024-results", transcriptStatus: "official_video_available" },
      { quarter: "2024-Q4", eventDate: "2024-11-12", event: "November 2024 Market Update", sourceId: "ba-market-update-nov-2024", transcriptStatus: "official_release_only" },
      { quarter: "2025-Q1", eventDate: "2025-02-19", event: "2024 Full Year Results", sourceId: "ba-fy-2024-results", transcriptStatus: "official_video_available" },
      { quarter: "2025-Q2", eventDate: "2025-05-07", event: "May 2025 AGM Market Update", sourceId: "ba-agm-market-update-may-2025", transcriptStatus: "official_release_only" },
      { quarter: "2025-Q3", eventDate: "2025-07-30", event: "2025 Half Year Results", sourceId: "ba-hy-2025-results", transcriptStatus: "official_video_available" },
      { quarter: "2025-Q4", eventDate: "2025-11-12", event: "November 2025 Market Update", sourceId: "ba-market-update-nov-2025", transcriptStatus: "official_release_only" },
      { quarter: "2026-Q1", eventDate: "2026-02-18", event: "2025 Full Year Results", sourceId: "ba-fy-2025-results", transcriptStatus: "official_video_available" },
      { quarter: "2026-Q2", eventDate: "2026-05-07", event: "May 2026 Trading Update", sourceId: "ba-agm-trading-update-may-2026", transcriptStatus: "official_release_only" },
    ],
  },
  capitalReturns: {
    sourceStatus: "official_actual",
    sourceId: "ba-fy-2025-results",
    dividendPerSharePence: 36.3,
    buybackSpend: 502,
    totalReturnsToShareholders: 1_529,
  },
  balanceSheet: {
    sourceStatus: "official_actual",
    sourceId: "ba-ar-2025-pdf",
    netDebtExLeases: 3_844,
    leaseLiabilitiesNet: 1_742,
    postEmploymentBenefitSurplus: 844,
  },
  marketData: {
    sourceStatus: "market_data",
    sourceId: "ba-share-price-monitor",
    currentPriceGbx: 1_888.5,
    currentPriceGbp: 18.885,
    priceDate: "2026-05-11",
  },
  sources,
  notes: [
    "This JSON is a structured official dataset for the BA.L module.",
    "research_only programme records are intentionally excluded from direct valuation math.",
    "Run scripts/ba_model_validation.mjs after changing this file or the TypeScript BA.L module.",
  ],
};

await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await fs.writeFile(OUTPUT_PATH, JSON.stringify(dataset, null, 2));
console.log(`BA.L official dataset written to ${OUTPUT_PATH}`);
