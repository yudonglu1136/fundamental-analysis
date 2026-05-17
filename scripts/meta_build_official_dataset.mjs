import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUTPUT_DIR = path.join(ROOT, "data/local/meta/official");
const SEC_DIR = path.join(ROOT, "data/local/meta/sec");
const MARKET_DIR = path.join(ROOT, "data/local/meta/market");
const TRANSCRIPT_DIR = path.join(ROOT, "data/local/meta/transcripts");
const BUILT_AT = new Date().toISOString();

const lineages = {
  fy2025Actual: {
    sourceType: "official_actual",
    sourceName: "Meta Reports Fourth Quarter and Full Year 2025 Results",
    sourceUrl: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/",
    filingType: "earnings_release",
    period: "FY 2025",
    asOfDate: "2026-01-28",
    retrievedAt: BUILT_AT,
    confidence: "high",
    valuationTreatment: "forecast_anchor",
  },
  q1_2026Actual: {
    sourceType: "official_actual",
    sourceName: "Meta Reports First Quarter 2026 Results",
    sourceUrl: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/",
    filingType: "earnings_release",
    period: "Q1 2026",
    asOfDate: "2026-04-29",
    retrievedAt: BUILT_AT,
    confidence: "high",
    valuationTreatment: "forecast_anchor",
  },
  q1_2026Guidance: {
    sourceType: "management_guidance",
    sourceName: "Meta Q1 2026 earnings release outlook",
    sourceUrl: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/",
    filingType: "earnings_release",
    period: "FY 2026 / Q2 2026 guidance",
    asOfDate: "2026-04-29",
    retrievedAt: BUILT_AT,
    confidence: "high",
    valuationTreatment: "forecast_anchor",
  },
  marketSnapshot: {
    sourceType: "market_data",
    sourceName: "Dated Yahoo Finance META quote snapshot",
    sourceUrl: "https://finance.yahoo.com/quote/META/",
    filingType: "market_snapshot",
    period: "Market close 2026-05-08",
    asOfDate: "2026-05-08",
    retrievedAt: BUILT_AT,
    confidence: "medium",
    valuationTreatment: "direct_input",
  },
};

const dataset = {
  company: "Meta Platforms, Inc.",
  ticker: "META",
  currency: "USD",
  unitScale: "USD billions unless noted",
  built_at: BUILT_AT,
  source_layering: {
    official_actual: [
      "Meta Q1 2026 earnings release",
      "Meta FY2025 earnings release",
      "Meta FY2025 Form 10-K",
      "Meta Q1 2026 Form 10-Q",
    ],
    management_guidance: [
      "Q2 2026 revenue outlook",
      "FY2026 expense, capex, and tax outlook",
      "Q1 2026 earnings-call product and AI commentary",
    ],
    market_data: ["Dated META market snapshot"],
    forecast_assumption: ["Scenario assumptions in src/stocks/meta/assumptions.ts"],
    research_only: ["Risk red-team, product mapping, and option-value framing"],
  },
  periods: [
    {
      id: "fy2025",
      lineage: lineages.fy2025Actual,
      revenue: 200.966,
      operatingIncome: 83.276,
      netIncome: 60.458,
      dilutedEps: 23.49,
      normalizedDilutedEps: 29.06,
      dilutedShares: 2.574,
      operatingCashFlow: 115.8,
      capexInclFinanceLeases: 72.215,
      freeCashFlow: 43.585,
      depreciationAndAmortization: 18.616,
      shareBasedCompensation: 20.427,
      cashAndMarketableSecurities: 81.59,
      longTermDebt: 58.74,
      headcount: 78865,
      familyDailyActivePeople: 3.58,
      adImpressionsGrowth: 0.12,
      averagePricePerAdGrowth: 0.09,
      source_id: "meta-fy2025-pr",
    },
    {
      id: "q1_2026",
      lineage: lineages.q1_2026Actual,
      revenue: 56.311,
      operatingIncome: 22.872,
      netIncome: 26.773,
      normalizedNetIncome: 18.743,
      dilutedEps: 10.44,
      normalizedDilutedEps: 7.31,
      dilutedShares: 2.564,
      operatingCashFlow: 32.226,
      capexInclFinanceLeases: 19.84,
      freeCashFlow: 12.386,
      depreciationAndAmortization: 5.999,
      shareBasedCompensation: 6.032,
      cashAndMarketableSecurities: 81.18,
      longTermDebt: 58.748,
      headcount: 80638,
      familyDailyActivePeople: 3.56,
      adImpressionsGrowth: 0.19,
      averagePricePerAdGrowth: 0.12,
      source_id: "meta-q1-2026-pr",
    },
  ],
  segments: [
    { period_id: "fy2025", segment: "Family of Apps", revenue: 198.759, operatingIncome: 102.469, source_id: "meta-fy2025-pr", lineage: lineages.fy2025Actual },
    { period_id: "fy2025", segment: "Reality Labs", revenue: 2.207, operatingIncome: -19.193, source_id: "meta-fy2025-pr", lineage: lineages.fy2025Actual },
    { period_id: "q1_2026", segment: "Family of Apps", revenue: 55.909, operatingIncome: 26.9, source_id: "meta-q1-2026-pr", lineage: lineages.q1_2026Actual },
    { period_id: "q1_2026", segment: "Reality Labs", revenue: 0.402, operatingIncome: -4.028, source_id: "meta-q1-2026-pr", lineage: lineages.q1_2026Actual },
  ],
  guidance: {
    q2_2026_revenue_range: [58, 61],
    fy2026_expense_range: [162, 169],
    fy2026_capex_range: [125, 145],
    remainder_2026_tax_rate_range: [0.13, 0.16],
    reality_labs_2026_losses: "same general range as 2025",
    lineage: lineages.q1_2026Guidance,
  },
  metadata: {
    blocked: false,
    fallback_used: true,
    reason: "Curated seed built from official releases and SEC filings because the model should not depend on live network access.",
    source_urls: [
      "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/",
      "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/",
      "https://www.sec.gov/Archives/edgar/data/1326801/000132680126000041/meta-20260331.htm",
      "https://www.sec.gov/Archives/edgar/data/1326801/000132680126000011/meta-20251231.htm",
    ],
  },
};

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(SEC_DIR, { recursive: true });
await fs.mkdir(MARKET_DIR, { recursive: true });
await fs.mkdir(TRANSCRIPT_DIR, { recursive: true });
await fs.writeFile(path.join(OUTPUT_DIR, "meta_official_dataset.json"), JSON.stringify(dataset, null, 2));
await fs.writeFile(path.join(SEC_DIR, "sec_filing_inventory.json"), JSON.stringify({
  built_at: BUILT_AT,
  filings: dataset.metadata.source_urls.filter((url) => url.includes("sec.gov")).map((url) => ({ url, blocked: false, fallback_used: true })),
}, null, 2));
await fs.writeFile(path.join(MARKET_DIR, "market_snapshot.json"), JSON.stringify({
  ticker: "META",
  currentPrice: 609.63,
  priceDate: "2026-05-08",
  sharesForMarketCap: 2.564,
  marketCap: 609.63 * 2.564,
  netCash: 81.18 - 58.748,
  enterpriseValue: (609.63 * 2.564) - (81.18 - 58.748),
  source_status: "market_data",
  source_url: "https://finance.yahoo.com/quote/META/",
  lineage: lineages.marketSnapshot,
  attempted_at: BUILT_AT,
  blocked: false,
  fallback_used: true,
  reason: "Dated manually seeded market snapshot; use meta_fetch_official_data.mjs and a market data feed to refresh.",
}, null, 2));
await fs.writeFile(path.join(TRANSCRIPT_DIR, "transcript_metadata.json"), JSON.stringify({
  company: "Meta Platforms, Inc.",
  ticker: "META",
  built_at: BUILT_AT,
  records: [
    {
      title: "Meta Q2 2024 Earnings Call Transcript",
      source_url: "https://s21.q4cdn.com/399680738/files/doc_financials/2024/q2/META-Q2-2024-Earnings-Call-Transcript.pdf",
      source_status: "management_guidance",
      blocked: false,
      fallback_used: true,
      curated_insights_file: "src/stocks/meta/data/earningsCallData.ts",
    },
    {
      title: "Meta Q3 2024 Earnings Call Transcript",
      source_url: "https://s21.q4cdn.com/399680738/files/doc_financials/2024/q3/META-Q3-2024-Earnings-Call-Transcript.pdf",
      source_status: "management_guidance",
      blocked: false,
      fallback_used: true,
      curated_insights_file: "src/stocks/meta/data/earningsCallData.ts",
    },
    {
      title: "Meta Q4 2024 Earnings Call Transcript",
      source_url: "https://s21.q4cdn.com/399680738/files/doc_financials/2024/q4/META-Q4-2024-Earnings-Call-Transcript.pdf",
      source_status: "management_guidance",
      blocked: false,
      fallback_used: true,
      curated_insights_file: "src/stocks/meta/data/earningsCallData.ts",
    },
    {
      title: "Meta Q1 2025 Earnings Call Transcript",
      source_url: "https://s21.q4cdn.com/399680738/files/doc_financials/2025/q1/META-Q1-2025-Earnings-Call-Transcript.pdf",
      source_status: "management_guidance",
      blocked: false,
      fallback_used: true,
      curated_insights_file: "src/stocks/meta/data/earningsCallData.ts",
    },
    {
      title: "Meta Q2 2025 Earnings Call Transcript",
      source_url: "https://s21.q4cdn.com/399680738/files/doc_financials/2025/q2/META-Q2-2025-Earnings-Call-Transcript.pdf",
      source_status: "management_guidance",
      blocked: false,
      fallback_used: true,
      curated_insights_file: "src/stocks/meta/data/earningsCallData.ts",
    },
    {
      title: "Meta Q3 2025 Earnings Call Transcript",
      source_url: "https://s21.q4cdn.com/399680738/files/doc_financials/2025/q3/META-Q3-2025-Earnings-Call-Transcript.pdf",
      source_status: "management_guidance",
      blocked: false,
      fallback_used: true,
      curated_insights_file: "src/stocks/meta/data/earningsCallData.ts",
    },
    {
      title: "Meta Q4 2025 Earnings Call Transcript",
      source_url: "https://s21.q4cdn.com/399680738/files/doc_financials/2025/q4/META-Q4-2025-Earnings-Call-Transcript.pdf",
      source_status: "management_guidance",
      blocked: false,
      fallback_used: true,
      curated_insights_file: "src/stocks/meta/data/earningsCallData.ts",
    },
    {
      title: "Meta Q1 2026 Earnings Call Transcript",
      source_url: "https://s21.q4cdn.com/399680738/files/doc_financials/2026/q1/META-Q1-2026-Earnings-Call-Transcript.pdf",
      source_status: "management_guidance",
      blocked: false,
      fallback_used: true,
      curated_insights_file: "src/stocks/meta/data/transcriptData.ts and src/stocks/meta/data/earningsCallData.ts",
    },
  ],
}, null, 2));
console.log(`META official dataset saved to ${path.join(OUTPUT_DIR, "meta_official_dataset.json")}`);
