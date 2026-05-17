export type AmznSourceStatus = "official_actual" | "forecast_assumption" | "research_only" | "market_data" | "transcript_commentary";

export type AmznPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter?: string;
  periodType: "quarter" | "annual" | "forecast";
  sourceStatus: AmznSourceStatus;
  sourceId: string;
  revenue: number;
  operatingIncome: number;
  operatingMargin: number;
  netIncome?: number | null;
  dilutedEps?: number | null;
  dilutedShares: number;
  operatingCashFlow?: number | null;
  capex?: number | null;
  equipmentFinanceLeases?: number | null;
  freeCashFlow?: number | null;
  stockBasedCompensation?: number | null;
  cashAndMarketableSecurities?: number | null;
  debt?: number | null;
  netDebt?: number | null;
  fulfillmentCost?: number | null;
  shippingCost?: number | null;
  technologyAndContentExpense?: number | null;
  notes?: string;
};

export type AmznSegment = {
  periodId: string;
  segment: "North America" | "International" | "AWS" | "Advertising" | "Subscription / Prime" | "Other";
  sourceStatus: AmznSourceStatus;
  revenue: number;
  operatingIncome: number;
  operatingMargin: number;
  revenueGrowth?: number | null;
  notes?: string;
};

export type AmznOperatingMetric = {
  periodId: string;
  sourceStatus: AmznSourceStatus;
  awsGrowth?: number | null;
  advertisingGrowth?: number | null;
  capexIntensity?: number | null;
  reportedFcf?: number | null;
  normalizedFcf?: number | null;
  fcfConversion?: number | null;
  paidUnitsGrowth?: number | null;
  primeSubscriptionIndicator?: number | null;
  awsBacklog?: number | null;
  retailMarginBridge: string;
  aiCommentary: string;
  projectKuiperCommentary: string;
};

export type AmznDataset = {
  marketData: {
    currentPrice: number;
    priceDate: string;
    sharesOutstanding: number;
    currency: "USD";
    source: string;
    sourceStatus: AmznSourceStatus;
  };
  periods: AmznPeriod[];
  segments: AmznSegment[];
  operatingMetrics: AmznOperatingMetric[];
  sourceNotes: string[];
};

export const amznDataset: AmznDataset = {
  marketData: {
    currentPrice: 188,
    priceDate: "2026-05-12",
    sharesOutstanding: 10_650,
    currency: "USD",
    source: "Static research-only fallback. Backend daily_price_bars override this when API is online.",
    sourceStatus: "research_only",
  },
  periods: [
    {
      id: "fy25e",
      label: "FY2025 research baseline",
      fiscalYear: 2025,
      periodType: "forecast",
      sourceStatus: "research_only",
      sourceId: "amzn-static-research-baseline",
      revenue: 700_000,
      operatingIncome: 75_000,
      operatingMargin: 0.107,
      netIncome: 65_000,
      dilutedShares: 10_650,
      operatingCashFlow: 128_000,
      capex: 86_000,
      equipmentFinanceLeases: 7_000,
      freeCashFlow: 42_000,
      stockBasedCompensation: 25_000,
      cashAndMarketableSecurities: 110_000,
      debt: 65_000,
      netDebt: -45_000,
      fulfillmentCost: 105_000,
      shippingCost: 95_000,
      technologyAndContentExpense: 95_000,
      notes: "Research-only offline fallback. The backend seed replaces historical actuals with SEC Companyfacts when fetched.",
    },
  ],
  segments: [
    { periodId: "fy25e", segment: "North America", sourceStatus: "research_only", revenue: 430_000, operatingIncome: 25_800, operatingMargin: 0.06, revenueGrowth: 0.10, notes: "Retail margin bridge placeholder until official segment rows are imported." },
    { periodId: "fy25e", segment: "International", sourceStatus: "research_only", revenue: 150_000, operatingIncome: 3_750, operatingMargin: 0.025, revenueGrowth: 0.11, notes: "International profit inflection placeholder." },
    { periodId: "fy25e", segment: "AWS", sourceStatus: "research_only", revenue: 120_000, operatingIncome: 37_200, operatingMargin: 0.31, revenueGrowth: 0.17, notes: "AWS AI economics placeholder." },
    { periodId: "fy25e", segment: "Advertising", sourceStatus: "research_only", revenue: 70_000, operatingIncome: 29_400, operatingMargin: 0.42, revenueGrowth: 0.20, notes: "Advertising treated as a high-margin profit-pool lens, not an official segment." },
    { periodId: "fy25e", segment: "Subscription / Prime", sourceStatus: "research_only", revenue: 50_000, operatingIncome: 10_000, operatingMargin: 0.20, revenueGrowth: 0.10, notes: "Prime subscription flywheel proxy." },
  ],
  operatingMetrics: [
    {
      periodId: "fy25e",
      sourceStatus: "research_only",
      awsGrowth: 0.17,
      advertisingGrowth: 0.20,
      capexIntensity: 0.123,
      reportedFcf: 42_000,
      normalizedFcf: 59_500,
      fcfConversion: 0.085,
      paidUnitsGrowth: null,
      primeSubscriptionIndicator: null,
      awsBacklog: null,
      retailMarginBridge: "Fulfillment regionalization and fixed-cost leverage remain the core retail margin question.",
      aiCommentary: "AWS AI demand must earn attractive returns after GPU, Trainium, Inferentia, Bedrock, Amazon Q, and price competition.",
      projectKuiperCommentary: "Kuiper is modeled as optionality with explicit capex and ROIC dilution risk.",
    },
  ],
  sourceNotes: [
    "Offline AMZN values are research-only placeholders. Backend historical rows use SEC Companyfacts for consolidated actuals when local SEC files are present.",
    "Segment and business-unit allocation rows are tagged research_only unless official segment filings are later imported.",
  ],
};
