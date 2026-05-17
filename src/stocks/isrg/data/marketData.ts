import type { IsrgMarketData } from "../model";
import { isrgMarketData as seededMarketData } from "../realData";

export const marketData: IsrgMarketData = {
  ...seededMarketData,
  source: {
    ...seededMarketData.source,
    sourceStatus: "market_data",
    usedInValuation: false,
    researchOnly: false,
  },
  notes:
    `${seededMarketData.notes} Market data is used for price, reverse valuation, and sanity checks only; it is not treated as fundamental truth.`,
};

