import type { ValidationWarning } from "../../types";
import type { DgeMarketData } from "../types";

const londonPriceGbx = 1_504.5;
const londonPriceGbp = londonPriceGbx / 100;
const adrPriceUsd = 81.64;
const gbpUsd = 1.35232;
const ordinarySharesPerAdr = 4;
const sharesOutstandingM = 2_220;
const netDebtUsdM = 21_700;
const marketCapGbpM = londonPriceGbp * sharesOutstandingM;
const marketCapUsdM = marketCapGbpM * gbpUsd;

const validationWarnings: ValidationWarning[] = [
  {
    id: "dge-stooq-market-snapshot",
    title: "Market data is a public snapshot",
    detail: "DGE.L, DEO and GBP/USD are captured from Stooq on 2026-05-12; use a live terminal before trading.",
    severity: "low",
  },
  {
    id: "dge-adr-ratio-check",
    title: "ADR conversion uses four ordinary shares",
    detail: "DEO ADR valuation uses one ADR equal to four Diageo ordinary shares; ordinary-share fair values stay in GBP/GBX.",
    severity: "low",
  },
];

export const dgeMarketData: DgeMarketData = {
  londonTicker: "DGE.L",
  londonPriceGbx,
  londonPriceGbp,
  adrTicker: "DEO",
  adrPriceUsd,
  gbpUsd,
  ordinarySharesPerAdr,
  sharesOutstandingM,
  marketCapGbpM,
  marketCapUsdM,
  netDebtUsdM,
  enterpriseValueUsdM: marketCapUsdM + netDebtUsdM,
  dividendPerShareUsd: 0.5,
  dividendYield: 0.5 / (londonPriceGbp * gbpUsd),
  priceDate: "2026-05-12",
  sourceName: "Stooq market snapshot with official ADR-ratio cross-check",
  sourceUrl: "https://stooq.com/q/l/?s=dge.uk&f=sd2t2ohlcv&h&e=csv",
  validationWarnings,
  sourceEvidenceIds: ["market-stooq-2026-05-12", "diageo-adr-ratio"],
};
