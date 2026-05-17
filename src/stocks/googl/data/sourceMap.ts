import type { GooglSource } from "../model";

export const googlSources: GooglSource[] = [
  {
    id: "goog-fy-2025-10k",
    title: "Alphabet FY2025 Form 10-K",
    url: "https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm",
    publisher: "SEC / Alphabet",
    sourceType: "official_actual",
    reportingPeriod: "Year ended December 31, 2025",
    accessedDate: "2026-05-11",
  },
  {
    id: "goog-q1-2026-release",
    title: "Alphabet Announces First Quarter 2026 Results",
    url: "https://s206.q4cdn.com/479360582/files/doc_financials/2026/q1/2026q1-alphabet-earnings-release.pdf",
    publisher: "Alphabet",
    sourceType: "official_actual",
    reportingPeriod: "Quarter ended March 31, 2026",
    accessedDate: "2026-05-11",
  },
  {
    id: "goog-q1-2026-10q",
    title: "Alphabet Q1 2026 Form 10-Q",
    url: "https://www.sec.gov/Archives/edgar/data/1652044/000165204426000048/goog-20260331.htm",
    publisher: "SEC / Alphabet",
    sourceType: "official_actual",
    reportingPeriod: "Quarter ended March 31, 2026",
    accessedDate: "2026-05-11",
  },
  {
    id: "goog-q1-2026-transcript",
    title: "Alphabet Q1 2026 Earnings Call Transcript",
    url: "https://abc.xyz/investor/events/event-details/default.aspx",
    publisher: "Alphabet",
    sourceType: "company_commentary",
    reportingPeriod: "Quarter ended March 31, 2026",
    accessedDate: "2026-05-11",
  },
  {
    id: "goog-q4-2025-release",
    title: "Alphabet Announces Fourth Quarter and Fiscal Year 2025 Results",
    url: "https://s206.q4cdn.com/479360582/files/doc_news/2026/Feb/04/attachments/2025q4-alphabet-earnings-release.pdf",
    publisher: "Alphabet",
    sourceType: "official_actual",
    reportingPeriod: "Quarter and year ended December 31, 2025",
    accessedDate: "2026-05-11",
  },
  {
    id: "goog-market-stockanalysis",
    title: "GOOGL market price snapshot",
    url: "https://stockanalysis.com/stocks/googl/",
    publisher: "StockAnalysis",
    sourceType: "market_data",
    reportingPeriod: "Market snapshot",
    accessedDate: "2026-05-11",
    notes: "Third-party delayed market data. Not an Alphabet official actual.",
  },
];

export const googlSourceMap = Object.fromEntries(googlSources.map((source) => [source.id, source]));
