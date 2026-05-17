import type { MetaMarketData, MetaSource } from "../model";
import { fieldLineage, metaLineage } from "./lineage";

export const metaMarketSources: MetaSource[] = [
  {
    id: "meta-market-snapshot-2026-05-08",
    title: "META market snapshot",
    url: "https://finance.yahoo.com/quote/META/",
    publisher: "Yahoo Finance",
    sourceStatus: "market_data",
    reportingPeriod: "Market close 2026-05-08",
    publishedDate: "2026-05-08",
    accessedDate: "2026-05-11",
    lineage: metaLineage.marketSnapshot,
    notes: "Dated market snapshot used only for upside/downside and market-cap references. Not an official company financial source.",
  },
];

const currentPrice = 609.63;
const sharesForMarketCap = 2.564;
const netCash = 81.18 - 58.748;

export const metaMarketData: MetaMarketData = {
  ticker: "META",
  sourceStatus: "market_data",
  sourceId: "meta-market-snapshot-2026-05-08",
  lineage: metaLineage.marketSnapshot,
  fieldLineage: {
    ...fieldLineage(["currentPrice", "priceDate", "source", "marketCap", "enterpriseValue", "dividendPerShareAnnualized", "dividendYield"], metaLineage.marketSnapshot),
    sharesForMarketCap: metaLineage.q1_2026Actual,
    netCash: metaLineage.q1_2026Actual,
  },
  currentPrice,
  priceDate: "2026-05-08",
  source: "Dated Yahoo Finance quote snapshot; refresh before relying on live upside/downside.",
  sharesForMarketCap,
  marketCap: currentPrice * sharesForMarketCap,
  enterpriseValue: currentPrice * sharesForMarketCap - netCash,
  netCash,
  dividendPerShareAnnualized: 2.1,
  dividendYield: 2.1 / currentPrice,
  notes: "Share count uses Q1 2026 diluted shares. Enterprise value subtracts cash and marketable securities net of long-term debt.",
};
