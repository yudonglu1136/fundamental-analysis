import type { LsegConsensusSnapshot } from "../model";

export const lsegConsensus: LsegConsensusSnapshot = {
  consensusDate: "2026-05-07",
  currentPriceAtConsensusDate: 92.26,
  consensusTargetPrice: 104.5,
  numberOfBuyRatings: 14,
  numberOfHoldRatings: 5,
  numberOfSellRatings: 1,
  yearly: [
    {
      fiscalYear: 2026,
      totalIncomeExcludingRecoveries: 9595,
      organicGrowth: 0.069,
      adjustedEbitda: 4900,
      adjustedEbitdaMargin: 0.511,
      adjustedEps: 4.49,
      equityFcf: 2720,
      dividendPerShare: 1.48,
      segmentGrowth: {
        "Data & Analytics": 0.048,
        "FTSE Russell": 0.069,
        "Risk Intelligence": 0.096,
        Markets: 0.056,
      },
      sourceType: "assumption",
    },
    {
      fiscalYear: 2027,
      totalIncomeExcludingRecoveries: 10205,
      organicGrowth: 0.064,
      adjustedEbitda: 5210,
      adjustedEbitdaMargin: 0.51,
      adjustedEps: 4.78,
      equityFcf: 2895,
      dividendPerShare: 1.56,
      segmentGrowth: {
        "Data & Analytics": 0.045,
        "FTSE Russell": 0.067,
        "Risk Intelligence": 0.09,
        Markets: 0.051,
      },
      sourceType: "assumption",
    },
    {
      fiscalYear: 2028,
      totalIncomeExcludingRecoveries: 10815,
      organicGrowth: 0.06,
      adjustedEbitda: 5495,
      adjustedEbitdaMargin: 0.508,
      adjustedEps: 5.07,
      equityFcf: 3050,
      dividendPerShare: 1.64,
      segmentGrowth: {
        "Data & Analytics": 0.042,
        "FTSE Russell": 0.063,
        "Risk Intelligence": 0.085,
        Markets: 0.047,
      },
      sourceType: "assumption",
    },
  ],
};

