import type { ValidationWarning } from "../../types";
import type { AznMarketData } from "../types";

const sharesOutstandingM = 1_550;
const londonPriceGbx = 13_502;
const londonPriceGbp = londonPriceGbx / 100;
const gbpUsd = 1.36372;
const nyseOrdinaryPriceUsd = 182.64;
const netDebtUsdM = 25_944;
const marketCapGbpM = londonPriceGbp * sharesOutstandingM;
const marketCapUsdM = marketCapGbpM * gbpUsd;

const marketWarnings: ValidationWarning[] = [
  {
    id: "azn-yahoo-rate-limited",
    title: "Yahoo chart endpoint was rate limited",
    detail: "The local fetch stored a Stooq market snapshot because Yahoo Finance returned a rate-limit response. Treat market data as a dated external snapshot, not an institutional feed.",
    severity: "low",
  },
  {
    id: "azn-us-listing-harmonised",
    title: "US line is ordinary shares, not legacy ADRs",
    detail: "AstraZeneca began NYSE ordinary-share trading on 2 February 2026. The module still displays former ADR conversion for historical comparability, but the active US line is 1 ordinary share.",
    severity: "low",
  },
];

export const aznMarketData: AznMarketData = {
  londonTicker: "AZN.L",
  londonPriceGbx,
  londonPriceGbp,
  nyseTicker: "AZN",
  nyseOrdinaryPriceUsd,
  gbpUsd,
  historicalAdrRatioOrdinarySharePerAdr: 0.5,
  currentUsListingOrdinaryShareRatio: 1,
  sharesOutstandingM,
  marketCapGbpM,
  marketCapUsdM,
  enterpriseValueUsdM: marketCapUsdM + netDebtUsdM,
  dividendPerShareUsd: 3.2,
  dividendYield: 3.2 / nyseOrdinaryPriceUsd,
  priceDate: "2026-05-11",
  sourceName: "Stooq market snapshot with official listing-ratio cross-check",
  sourceUrl: "data/local/azn/yfinance/raw/AZN.L-stooq-detail.csv",
  sourceQuality: "market_data",
  validationWarnings: marketWarnings,
};
