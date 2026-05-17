import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUTPUT_PATH = path.join(ROOT, "data/local/lseg/lseg_official_dataset.json");
const BUILD_DATE = new Date().toISOString();

const sources = [
  {
    id: "lseg-fy2025-results-web",
    title: "LSEG 2025 Preliminary Results investor-relations page",
    url: "https://www.lseg.com/en/investor-relations/financial-results/2025-preliminary-results",
    source_type: "official_actual",
    reporting_period: "Year ended 31 December 2025",
    status: "curated_from_official_page",
  },
  {
    id: "lseg-fy2025-results-rns-pdf",
    title: "LSEG FY2025 preliminary results RNS PDF",
    url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/preliminary-results/rns/lseg-2025-preliminary-results-rns-26feb2026.pdf",
    source_type: "official_actual",
    reporting_period: "Year ended 31 December 2025",
    status: "curated_from_official_pdf",
  },
  {
    id: "lseg-ar2025-pdf",
    title: "LSEG Annual Report 2025 PDF",
    url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/annual-reports/lseg-annual-report-2025.pdf",
    source_type: "official_actual",
    reporting_period: "Year ended 31 December 2025",
    status: "curated_from_official_pdf",
  },
  {
    id: "lseg-fy2025-transcript",
    title: "LSEG 2025 Preliminary Results transcript",
    url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/preliminary-results/transcripts/lseg-2025-preliminary-results-transcript-26feb2026.pdf",
    source_type: "transcript",
    reporting_period: "FY2025 results call",
    status: "cached_manual_export_or_official_pdf",
  },
  {
    id: "lseg-market-snapshot-2026-05-07",
    title: "LSEG public market data snapshot",
    url: "data/local/lseg/yfinance/curated/market_snapshot.json",
    source_type: "market_data",
    reporting_period: "Market snapshot",
    status: "local_market_data_snapshot",
  },
];

const dataset = {
  company: "London Stock Exchange Group plc",
  ticker: "LSEG.L",
  currency: "GBP",
  latestReportingPeriod: "FY2025",
  buildDate: BUILD_DATE,
  sources,
  official_actual: {
    sourceId: "lseg-fy2025-results-rns-pdf",
    fy2025: {
      totalIncomeExRecoveries: 8986,
      recoveries: 360,
      totalIncomeInclRecoveries: 9346,
      organicConstantCurrencyGrowth: 0.071,
      adjustedEbitda: 4523,
      adjustedEbitdaMargin: 0.503,
      adjustedOperatingProfit: 3506,
      adjustedEpsPence: 420.6,
      equityFreeCashFlow: 2447,
      equityFcfPerSharePence: 467,
      weightedAverageShares: 524,
      cashCapex: 917,
      buybackSpend: 2100,
      totalDividendPerSharePence: 150,
      netDebt: 7598,
      leaseLiabilities: 627,
      regulatoryOperationalAmounts: 1204,
      operatingNetDebt: 8175,
      leverage: 1.8,
    },
  },
  segment_actuals: {
    sourceId: "lseg-ar2025-pdf",
    fy2025: [
      { segment: "Data & Analytics", source_type: "official_actual", revenueExRecoveries: 3978, revenueInclRecoveries: 4338, adjustedEbitda: 1617, adjustedOperatingProfit: 1043, organicGrowth: 0.05 },
      { segment: "FTSE Russell / Index", source_type: "official_actual", revenue: 954, adjustedEbitda: 635, adjustedOperatingProfit: 546, organicGrowth: 0.073 },
      { segment: "Risk Intelligence", source_type: "official_actual", revenue: 579, adjustedEbitda: 333, adjustedOperatingProfit: 285, organicGrowth: 0.117 },
      { segment: "Markets", source_type: "official_actual", revenueExRecoveries: 3467, adjustedEbitda: 1929, adjustedOperatingProfit: 1623, organicGrowth: 0.089 },
      { segment: "Corporate / Other", source_type: "official_actual", revenue: 8, adjustedEbitda: 9, adjustedOperatingProfit: 9, organicGrowth: -0.356 },
    ],
  },
  analytical_markets_split: {
    source_type: "forecast_assumption",
    note: "LSEG combined Capital Markets and Post Trade into Markets from FY2025. Revenue split maps official product lines; EBITDA split is an analyst assumption and is not an official actual.",
    fy2025: [
      { segment: "Capital Markets", revenue: 2223, adjustedEbitda: 850 },
      { segment: "Post Trade / LCH", revenue: 1244, adjustedEbitda: 1079 },
    ],
  },
  product_lines: {
    sourceId: "lseg-ar2025-pdf",
    fy2025: [
      { segment: "Data & Analytics", line: "Workflows", source_type: "official_actual", revenue: 1925 },
      { segment: "Data & Analytics", line: "Data & feeds", source_type: "official_actual", revenue: 1822 },
      { segment: "Data & Analytics", line: "Analytics", source_type: "official_actual", revenue: 231 },
      { segment: "Data & Analytics", line: "Recoveries", source_type: "official_actual", revenue: 360 },
      { segment: "FTSE Russell / Index", line: "Subscriptions", source_type: "official_actual", revenue: 630 },
      { segment: "FTSE Russell / Index", line: "Asset-based", source_type: "official_actual", revenue: 324 },
      { segment: "Risk Intelligence", line: "Customer and third-party risk solutions", source_type: "official_actual", revenue: 579 },
      { segment: "Markets", line: "Equities", source_type: "official_actual", revenue: 412 },
      { segment: "Markets", line: "Fixed income, derivatives and other", source_type: "official_actual", revenue: 1539 },
      { segment: "Markets", line: "FX", source_type: "official_actual", revenue: 272 },
      { segment: "Markets", line: "OTC derivatives", source_type: "official_actual", revenue: 641 },
      { segment: "Markets", line: "Securities & reporting", source_type: "official_actual", revenue: 229 },
      { segment: "Markets", line: "Non-cash collateral", source_type: "official_actual", revenue: 117 },
      { segment: "Markets", line: "Net treasury income", source_type: "official_actual", revenue: 257 },
    ],
  },
  management_guidance: {
    sourceId: "lseg-fy2025-results-web",
    fy2026: {
      source_type: "management_guidance",
      organicTotalIncomeGrowthRange: [0.065, 0.075],
      constantCurrencyEbitdaMarginExpansionBpsRange: [80, 100],
      capexIntensity: 0.095,
      equityFreeCashFlowFloor: 2700,
      effectiveTaxRateRange: [0.24, 0.25],
      buybackPlan: 3000,
      buybackCompletionBy: "2027-02-28",
      mediumTermRevenueCommentary: "Mid- to high-single-digit growth from 2027 to 2029, including acceleration in subscription businesses.",
      mediumTermMarginCommentary: "Around 150 bps cumulative EBITDA margin improvement over 2027-2029.",
      mediumTermCapexCommentary: "Capex intensity to move toward c.8% by 2029.",
      fcfPerShareCommentary: "Free cash flow per share expected to compound at double-digit rates.",
    },
  },
  market_data: {
    sourceId: "lseg-market-snapshot-2026-05-07",
    source_type: "market_data",
    currentPriceGbp: 92.26,
    priceDate: "2026-05-07",
    marketCapGbp: 45917,
    enterpriseValueGbp: 54092,
    notes: "Not official company disclosure.",
  },
  forecast_assumption: {
    note: "Forecast assumptions are stored separately and must not be represented as official actuals.",
  },
  research_only: {
    note: "Workspace competition, peer multiples, AI disruption and regulatory risk are research-only unless translated into explicit scenario assumptions.",
  },
};

await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`LSEG official dataset written to ${OUTPUT_PATH}`);
