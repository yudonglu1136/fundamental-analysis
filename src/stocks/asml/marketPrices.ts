export type AsmlDailyPriceBar = {
  ticker: "ASML";
  priceDate: string;
  close: number;
  adjustedClose: number;
  source: string;
  sourceType: "market_data" | "market_data_unadjusted_proxy";
};

export const asmlDailyPriceBars: AsmlDailyPriceBar[] = [
  {
    "ticker": "ASML",
    "priceDate": "2022-03-31",
    "close": 667.93,
    "adjustedClose": 639.7346,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2022-06-30",
    "close": 475.88,
    "adjustedClose": 458.9242,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2022-09-30",
    "close": 415.35,
    "adjustedClose": 401.5108,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2022-12-30",
    "close": 546.4,
    "adjustedClose": 529.785,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2023-03-31",
    "close": 680.71,
    "adjustedClose": 661.4434,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2023-06-30",
    "close": 724.75,
    "adjustedClose": 706.2974,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2023-09-29",
    "close": 588.66,
    "adjustedClose": 574.9509,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2023-12-29",
    "close": 756.92,
    "adjustedClose": 741.1861,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2024-03-28",
    "close": 970.47,
    "adjustedClose": 951.9602,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2024-06-28",
    "close": 1022.73,
    "adjustedClose": 1005.3096,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2024-09-30",
    "close": 833.25,
    "adjustedClose": 820.5748,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2024-12-31",
    "close": 693.08,
    "adjustedClose": 684.1212,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2025-03-31",
    "close": 662.63,
    "adjustedClose": 655.4478,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2025-06-30",
    "close": 801.39,
    "adjustedClose": 795.1588,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2025-09-30",
    "close": 968.09,
    "adjustedClose": 962.9991,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2025-12-31",
    "close": 1069.86,
    "adjustedClose": 1066.1221,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  },
  {
    "ticker": "ASML",
    "priceDate": "2026-05-15",
    "close": 1501.8101,
    "adjustedClose": 1501.8101,
    "source": "Yahoo Finance chart API",
    "sourceType": "market_data"
  }
];

export type AsmlAnnualPriceHistory = {
  year: number;
  startDate: string;
  endDate: string;
  startPrice: number;
  endPrice: number;
  annualReturn: number;
  high: number;
  low: number;
  maxDrawdown: number;
};

export const asmlEightYearPriceHistory: AsmlAnnualPriceHistory[] = [
  {
    "year": 2018,
    "startDate": "2018-01-02",
    "endDate": "2018-12-31",
    "startPrice": 163.6859,
    "endPrice": 144.5924,
    "annualReturn": -0.116647,
    "high": 205.1351,
    "low": 134.7343,
    "maxDrawdown": -0.343192
  },
  {
    "year": 2019,
    "startDate": "2019-01-02",
    "endDate": "2019-12-31",
    "startPrice": 145.2243,
    "endPrice": 279.3959,
    "annualReturn": 0.923893,
    "high": 280.0852,
    "low": 137.2151,
    "maxDrawdown": -0.108263
  },
  {
    "year": 2020,
    "startDate": "2020-01-02",
    "endDate": "2020-12-31",
    "startPrice": 285.9008,
    "endPrice": 464.5819,
    "annualReturn": 0.624976,
    "high": 466.6681,
    "low": 185.9776,
    "maxDrawdown": -0.379442
  },
  {
    "year": 2021,
    "startDate": "2021-01-04",
    "endDate": "2021-12-31",
    "startPrice": 476.2793,
    "endPrice": 762.5326,
    "annualReturn": 0.60102,
    "high": 849.5903,
    "low": 466.9633,
    "maxDrawdown": -0.19834
  },
  {
    "year": 2022,
    "startDate": "2022-01-03",
    "endDate": "2022-12-30",
    "startPrice": 763.8255,
    "endPrice": 529.785,
    "annualReturn": -0.306406,
    "high": 763.8255,
    "low": 366.4977,
    "maxDrawdown": -0.520181
  },
  {
    "year": 2023,
    "startDate": "2023-01-03",
    "endDate": "2023-12-29",
    "startPrice": 532.8585,
    "endPrice": 741.1861,
    "annualReturn": 0.390962,
    "high": 748.1484,
    "low": 532.8585,
    "maxDrawdown": -0.244585
  },
  {
    "year": 2024,
    "startDate": "2024-01-02",
    "endDate": "2024-12-31",
    "startPrice": 702.0175,
    "endPrice": 684.1212,
    "annualReturn": -0.025493,
    "high": 1080.2313,
    "low": 649.919,
    "maxDrawdown": -0.398352
  },
  {
    "year": 2025,
    "startDate": "2025-01-02",
    "endDate": "2025-12-31",
    "startPrice": 691.3662,
    "endPrice": 1066.1221,
    "annualReturn": 0.542051,
    "high": 1136.9338,
    "low": 588.9169,
    "maxDrawdown": -0.233748
  }
];

export type AsmlVsSpyAnnualReturn = {
  year: number;
  asmlReturn: number;
  spyReturn: number;
  relativeReturn: number;
  asmlMaxDrawdown: number;
  spyMaxDrawdown: number;
};

export const asmlVsSpyEightYearReturns: AsmlVsSpyAnnualReturn[] = [
  {
    "year": 2018,
    "asmlReturn": -0.116647,
    "spyReturn": -0.052471,
    "relativeReturn": -0.064176,
    "asmlMaxDrawdown": -0.343192,
    "spyMaxDrawdown": -0.193489
  },
  {
    "year": 2019,
    "asmlReturn": 0.923893,
    "spyReturn": 0.310875,
    "relativeReturn": 0.613018,
    "asmlMaxDrawdown": -0.108263,
    "spyMaxDrawdown": -0.066184
  },
  {
    "year": 2020,
    "asmlReturn": 0.624976,
    "spyReturn": 0.172352,
    "relativeReturn": 0.452624,
    "asmlMaxDrawdown": -0.379442,
    "spyMaxDrawdown": -0.337173
  },
  {
    "year": 2021,
    "asmlReturn": 0.60102,
    "spyReturn": 0.305055,
    "relativeReturn": 0.295965,
    "asmlMaxDrawdown": -0.19834,
    "spyMaxDrawdown": -0.051141
  },
  {
    "year": 2022,
    "asmlReturn": -0.306406,
    "spyReturn": -0.186464,
    "relativeReturn": -0.119942,
    "asmlMaxDrawdown": -0.520181,
    "spyMaxDrawdown": -0.244964
  },
  {
    "year": 2023,
    "asmlReturn": 0.390962,
    "spyReturn": 0.267092,
    "relativeReturn": 0.12387,
    "asmlMaxDrawdown": -0.244585,
    "spyMaxDrawdown": -0.099743
  },
  {
    "year": 2024,
    "asmlReturn": -0.025493,
    "spyReturn": 0.255893,
    "relativeReturn": -0.281386,
    "asmlMaxDrawdown": -0.398352,
    "spyMaxDrawdown": -0.084056
  },
  {
    "year": 2025,
    "asmlReturn": 0.542051,
    "spyReturn": 0.18009,
    "relativeReturn": 0.361961,
    "asmlMaxDrawdown": -0.233748,
    "spyMaxDrawdown": -0.187552
  }
];

export const asmlMarketPriceMetadata = {
  ticker: "ASML" as const,
  rowCount: 17,
  fullRawRowCount: 2515,
  firstDate: "2022-03-31",
  lastDate: "2026-05-15",
  latestPrice: 1501.8101,
  source: "Yahoo Finance chart API",
  sourceType: "market_data" as const,
};
