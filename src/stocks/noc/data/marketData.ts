import type { NocMarketData } from "../model";

export const nocMarketData: NocMarketData = {
  ticker: "NOC",
  sourceStatus: "market_data",
  sourceId: "noc-market-snapshot-2026-04-24",
  currentPrice: 575.11,
  priceDate: "2026-04-24",
  source: "StockAnalysis public market snapshot referenced for a replaceable current-price anchor",
  sharesForMarketCap: 142.0,
  marketCap: 81_666,
  enterpriseValue: 94_595,
  dividendYield: 8.99 / 575.11,
  fcfYield: 3_307 / 81_666,
  notes: "Market data is deliberately isolated from official actuals. Refresh before using upside/downside for live trading work.",
};
