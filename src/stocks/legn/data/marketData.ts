import type { LegnMarketData } from "../types";

const ordinarySharesOutstandingM = 369.886369;
const adsOutstandingM = ordinarySharesOutstandingM / 2;
const currentPrice = 28.57;
const cashAndTimeDepositsUsdM = 948.6;
const collaborationFundingUsdM = 319.1;
const netCashAfterFundingUsdM = cashAndTimeDepositsUsdM - collaborationFundingUsdM;

export const legnMarketData: LegnMarketData = {
  ticker: "LEGN",
  listing: "NASDAQ ADS",
  currentPrice,
  priceDate: "2026-05-07",
  currency: "USD",
  ordinarySharesPerAds: 2,
  ordinarySharesOutstandingM,
  adsOutstandingM,
  marketCapUsdM: currentPrice * adsOutstandingM,
  enterpriseValueUsdM: currentPrice * adsOutstandingM - netCashAfterFundingUsdM,
  cashAndTimeDepositsUsdM,
  collaborationFundingUsdM,
  netCashAfterFundingUsdM,
  sourceName: "StockAnalysis market snapshot cross-checked to FY 2025 ordinary share count",
  sourceUrl: "https://stockanalysis.com/stocks/legn/",
  sourceQuality: "market_data",
  validationWarnings: [
    {
      id: "legn-market-snapshot-dated",
      title: "Market price is a dated external snapshot",
      detail: "LEGN price uses a May 7, 2026 public market snapshot and should be refreshed before trading decisions.",
      severity: "medium",
    },
    {
      id: "legn-ads-unit",
      title: "LEGN quote is per ADS",
      detail: "Each ADS represents two ordinary shares. Valuation output is per ADS and share-count checks use ADS count.",
      severity: "low",
    },
  ],
};

export const legnCompetitiveMarketMap = [
  {
    category: "BCMA CAR-T",
    competitors: ["ide-cel / Abecma", "other academic or regional BCMA CAR-T"],
    modelImplication: "Direct share and sequencing competition, but CARVYKTI has strong durability data.",
    sourceEvidenceIds: ["bcma-competition-research", "cartitude1-5y-asco-jco", "cartitude4-asco-2025-high-risk"],
  },
  {
    category: "BCMA bispecifics",
    competitors: ["teclistamab", "elranatamab", "linvoseltamab"],
    modelImplication: "Off-the-shelf convenience pressures referral timing and high-frailty patient selection.",
    sourceEvidenceIds: ["bcma-competition-research"],
  },
  {
    category: "Non-BCMA myeloma immunotherapy",
    competitors: ["talquetamab / GPRC5D", "cevostamab / FcRH5", "Darzalex-based regimens"],
    modelImplication: "Can delay or displace BCMA CAR-T in some lines and affects frontline combination strategy.",
    sourceEvidenceIds: ["bcma-competition-research"],
  },
  {
    category: "CLDN18.2 solid tumor",
    competitors: ["zolbetuximab", "CLDN18.2 ADCs", "CLDN18.2 bispecifics", "CT041 and other CAR-T approaches"],
    modelImplication: "Target validation is real, but CAR-T must solve trafficking, toxicity and durability.",
    sourceEvidenceIds: ["lb1908-asco2025", "lb1908-asco-gi2026"],
  },
  {
    category: "DLL3 solid tumor",
    competitors: ["tarlatamab", "DLL3 ADCs", "DLL3 radiopharma and T-cell engagers"],
    modelImplication: "DLL3 has biological rationale but response durability and Novartis economics are unsettled.",
    sourceEvidenceIds: ["lb2102-asco2025", "novartis-lb2102-license"],
  },
];
