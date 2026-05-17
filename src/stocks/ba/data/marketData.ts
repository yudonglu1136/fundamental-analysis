import type { BaMarketData } from "../model";
import { baFinancialPeriods } from "./segmentData";

const latest = baFinancialPeriods.find((period) => period.id === "fy25") ?? baFinancialPeriods[baFinancialPeriods.length - 1];
const currentPriceGbx = 1_888.5;
const currentPriceGbp = currentPriceGbx / 100;
const sharesForMarketCap = latest.outstandingSharesForEps ?? latest.weightedAverageDilutedShares ?? 0;
const marketCap = currentPriceGbp * sharesForMarketCap;
const enterpriseValueExLeases = marketCap + latest.netDebtExLeases;

export const baMarketData: BaMarketData = {
  ticker: "BA.L",
  sourceStatus: "market_data",
  sourceId: "ba-share-price-monitor",
  currentPriceGbp,
  currentPriceGbx,
  priceDate: "2026-05-11",
  collectionTime: "13:57",
  source: "BAE Systems investor-relations share price monitor; LSE data delayed by at least 15 minutes.",
  sharesForMarketCap,
  marketCap,
  enterpriseValueExLeases,
  dividendYield: latest.dividendPerSharePence / currentPriceGbx,
  fcfYield: latest.freeCashFlow / marketCap,
  forwardPe: currentPriceGbp / ((latest.underlyingEpsPence * 1.1) / 100),
  notes: "Market data is a dated page snapshot and is not official financial actual data. Market cap uses FY2025 outstanding shares for EPS as a transparent approximation until a live market-data feed is wired.",
};
