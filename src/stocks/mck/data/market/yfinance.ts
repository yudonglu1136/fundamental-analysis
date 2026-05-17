import type { MckMarketSnapshot } from "../../types";

export const mckMarketSnapshot: MckMarketSnapshot = {
  ticker: "MCK",
  currentPrice: 737.11,
  marketCap: 88450,
  enterpriseValue: 95340,
  sharesOut: 122.49,
  forwardPe: 17.16,
  fcfYield: 0.061,
  dividendYield: 0.0043,
  buybackYield: 0.054,
  netDebtToEbitda: 1.2,
  fiftyTwoWeekHigh: 999,
  fiftyTwoWeekLow: 637,
  priceDate: "2026-05-08",
  tag: {
    sourceType: "market",
    source: "StockAnalysis market snapshot used as a temporary yfinance-style market proxy",
    sourceUrl: "https://stockanalysis.com/stocks/mck/",
    asOfDate: "2026-05-08",
    confidence: "medium",
    notes: "Market data should be refreshed with scripts/mck_build_metric_database.mjs or a yfinance export before investment use.",
  },
};
