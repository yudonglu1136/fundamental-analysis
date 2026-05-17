export type AsmlSourceStatus = "assumption" | "derived" | "placeholder" | "source_gap";

export type AsmlValuationAssumptions = {
  currentPrice: number;
  normalizedRevenueUsd: number;
  revenueCagr: number;
  ordersGrowth: number;
  backlogConversion: number;
  systemsRevenueMix: number;
  serviceRevenueMix: number;
  euvRevenueMix: number;
  duvRevenueMix: number;
  highNaRevenueMix: number;
  installedBaseServiceGrowth: number;
  grossMargin: number;
  operatingMargin: number;
  fcfMargin: number;
  taxRate: number;
  capexIntensity: number;
  discountRate: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  systemsRevenueMultiple: number;
  serviceRevenueMultiple: number;
  highNaRevenueMultiple: number;
  dilutedAdrShares: number;
  netCashUsd: number;
  euvDemandDurability: number;
  highNaAdoption: number;
  backlogCoverage: number;
  chinaRevenueExposure: number;
  customerConcentrationHaircut: number;
  chinaRestrictionHaircut: number;
  aiCapexCycleRisk: number;
  weightDcf: number;
  weightFcfYield: number;
  weightPe: number;
  weightEvEbit: number;
  weightSotp: number;
};

export type AsmlResearchMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: "USDm" | "percent" | "multiple" | "number";
  sourceStatus: AsmlSourceStatus;
  note: string;
};

export type AsmlResearchQuestion = {
  key: string;
  question: string;
  currentView: string;
  evidenceNeeded: string;
};

export type AsmlHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: "research_scaffold";
  fiscalPeriod: string;
  label: string;
  sourceStatus: AsmlSourceStatus;
  sourceNote: string;
};

export type AsmlHistoricalValuationRun = {
  id: string;
  asOfDate: string;
  currentPrice: number | null;
  fairValue: number | null;
  targetPrice3Y: number | null;
  expectedShareholderCagr: number | null;
  upsideDownside: number | null;
  methodOutputsJson: Array<{ key?: string; label?: string; value?: number; format?: string; description?: string }>;
  warningsJson: Array<{ id?: string; title?: string; detail?: string; severity?: string } | string>;
  dataSnapshotJson: {
    assumptions: Partial<AsmlValuationAssumptions>;
    revenueBase: number | null;
    effectiveGrowth: number | null;
    normalizedRevenue: number | null;
    operatingMargin: number | null;
    fcfMargin: number | null;
    riskMultiplier: number | null;
    sourceDiscipline: string;
  };
};

export type AsmlHistoricalValuationItem = {
  event: AsmlHistoricalValuationEvent;
  valuationRun: AsmlHistoricalValuationRun | null;
};

export type AsmlDataset = {
  ticker: "ASML";
  companyName: string;
  currency: "USD";
  listing: string;
  latestReportingPeriod: string;
  marketData: {
    currentPrice: number;
    priceDate: string;
    source: string;
    sourceStatus: AsmlSourceStatus;
  };
  metrics: AsmlResearchMetric[];
  researchQuestions: AsmlResearchQuestion[];
  sourceGaps: string[];
};
