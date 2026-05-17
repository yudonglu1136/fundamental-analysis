import type { DataStatus, Scenario, Signal, ValidationWarning } from "../types";

export type DgeEvidenceSourceType =
  | "annual_report"
  | "interim_results"
  | "trading_statement"
  | "investor_presentation"
  | "earnings_transcript"
  | "company_guidance"
  | "industry_data"
  | "market_data"
  | "research_assumption";

export type EvidenceRecord = {
  id: string;
  sourceTitle: string;
  sourceType: DgeEvidenceSourceType;
  date: string;
  url?: string;
  localPath?: string;
  extractedMetric: string;
  value?: number | string;
  quote?: string;
  confidence: "high" | "medium" | "low";
  usedInModel: boolean;
  notes?: string;
};

export type DgePeriodType = "FY" | "H1" | "Q" | "YTD";
export type DgeRegion = "North America" | "Europe" | "Asia Pacific" | "Latin America & Caribbean" | "Africa" | "Global Travel";
export type DgeCategory =
  | "Scotch"
  | "Tequila"
  | "US Whiskey"
  | "Canadian Whisky"
  | "Vodka"
  | "Rum"
  | "Gin"
  | "Beer / Guinness"
  | "RTD"
  | "Liqueurs";
export type DgeTrend = "improving" | "stable" | "deteriorating" | "mixed";
export type DgePriceTier = "value" | "mainstream" | "premium" | "super-premium" | "luxury" | "mixed";
export type DgeInventoryState = "destocking" | "restocking" | "balanced" | "pull-forward" | "unknown";
export type DgeQuality = "high" | "medium" | "low";

export type DgeReportedPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: DgePeriodType;
  reportedNetSales: number;
  organicNetSalesGrowth: number;
  organicNetSalesMovement: number | null;
  volumeGrowth: number | null;
  priceMixGrowth: number | null;
  reportedOperatingProfit: number | null;
  organicOperatingProfitGrowth: number | null;
  operatingProfitBeforeExceptional: number | null;
  operatingMargin: number | null;
  operatingMarginBeforeExceptional: number | null;
  eps: number | null;
  epsBeforeExceptional: number | null;
  freeCashFlow: number | null;
  netCashFromOperatingActivities: number | null;
  capex: number | null;
  netDebt: number | null;
  adjustedEbitda: number | null;
  leverageRatio: number | null;
  dividendPerShare: number | null;
  payoutRatio: number | null;
  shareCount: number | null;
  exceptionalItems: number | null;
  fxImpactPct: number | null;
  disposalsImpactPct: number | null;
  hyperinflationImpactPct: number | null;
  sourceEvidenceIds: string[];
};

export type DgeRegionalDatum = {
  periodId: string;
  region: DgeRegion;
  reportedNetSales: number;
  percentageOfNetSales: number;
  organicNetSalesGrowth: number;
  volumeGrowth: number | null;
  priceMixGrowth: number | null;
  operatingProfit: number | null;
  margin: number | null;
  keyBrands: string[];
  keyCountries: string[];
  channelInventoryCommentary: string;
  demandSignal: DgeTrend;
  riskSignal: DgeQuality;
  managementQuote: string;
  sourceEvidenceIds: string[];
};

export type DgeBrandDatum = {
  brand: string;
  category: DgeCategory;
  regionExposure: Partial<Record<DgeRegion, number>>;
  priceTier: DgePriceTier;
  currentGrowthTrend: DgeTrend;
  volumeTrend: DgeTrend;
  pricingTrend: DgeTrend;
  promotionalIntensity: number;
  inventoryIssue: DgeInventoryState;
  brandHealthScore: number;
  competitivePressure: number;
  marginContributionProxy: number;
  sourceEvidenceIds: string[];
};

export type DgeCategoryDatum = {
  category: DgeCategory;
  categoryGrowth: number;
  diageoExposure: number;
  marketShare: number | null;
  premiumisationStatus: "durable" | "selective" | "failing" | "not_applicable";
  affordabilityPressure: number;
  priceMixSustainability: number;
  depletionsVsShipments: number;
  inventoryLevel: DgeInventoryState;
  riskScore: number;
  sourceEvidenceIds: string[];
};

export type DgeChannelInventoryDatum = {
  periodId: string;
  region: DgeRegion;
  category?: DgeCategory;
  shipmentsGrowth: number | null;
  depletionsGrowth: number | null;
  consumptionGrowth: number | null;
  distributorInventory: DgeInventoryState;
  retailerInventory: DgeInventoryState;
  pullForward: number;
  destocking: number;
  restocking: number;
  promotionalLoading: number;
  worldCupSeasonalLoading: number;
  tariffPullForward: number;
  erpInventoryBuild: number;
  trueDemand: number;
  commentary: string;
  sourceEvidenceIds: string[];
};

export type DgeGuidanceDatum = {
  period: string;
  organicNetSalesGrowthLow: number;
  organicNetSalesGrowthHigh: number;
  organicOperatingProfitGrowthLow: number;
  organicOperatingProfitGrowthHigh: number;
  accelerateSavings: number;
  freeCashFlow: number;
  capexLow: number;
  capexHigh: number;
  taxRateBeforeExceptional: number;
  effectiveInterestRate: number;
  dividendFloor: number;
  payoutPolicyLow: number;
  payoutPolicyHigh: number;
  erpInventoryBuildExcludedFromFcf: number;
  sourceEvidenceIds: string[];
};

export type DgeMarketData = {
  londonTicker: "DGE.L";
  londonPriceGbx: number;
  londonPriceGbp: number;
  adrTicker: "DEO";
  adrPriceUsd: number;
  gbpUsd: number;
  ordinarySharesPerAdr: number;
  sharesOutstandingM: number;
  marketCapGbpM: number;
  marketCapUsdM: number;
  netDebtUsdM: number;
  enterpriseValueUsdM: number;
  dividendPerShareUsd: number;
  dividendYield: number;
  priceDate: string;
  sourceName: string;
  sourceUrl: string;
  validationWarnings: ValidationWarning[];
  sourceEvidenceIds: string[];
};

export type DgeResearchAssumption = {
  id: string;
  label: string;
  value: number;
  unit: string;
  category: string;
  rationale: string;
  sourceEvidenceIds: string[];
};

export type DgeCompetitorDatum = {
  company: string;
  ticker: string;
  focus: string;
  latestPeriod: string;
  organicSalesGrowth: number | null;
  usGrowth: number | null;
  tequilaCommentary: string;
  inventoryCommentary: string;
  premiumisationCommentary: string;
  marginCommentary: string;
  sourceEvidenceIds: string[];
};

export type DgeValuationAssumptions = {
  currentPriceGbp: number;
  gbpUsd: number;
  sharesOutstandingM: number;
  netDebtUsdM: number;
  normalizedFcf: number;
  targetFcfYield: number;
  normalizedEbit: number;
  normalizedEbitda: number;
  evEbitMultiple: number;
  evEbitdaMultiple: number;
  epsBeforeExceptional: number;
  peMultiple: number;
  dividendFloorUsd: number;
  terminalOrganicGrowth: number;
  operatingMargin: number;
  usOrganicGrowth: number;
  lacNormalizedGrowth: number;
  regionQualityAdjustment: number;
  weightFcfYield: number;
  weightEvEbit: number;
  weightEvEbitda: number;
  weightPe: number;
  weightDividend: number;
  weightRegionQuality: number;
};

export type DgeScenarioDefinition = {
  name: Scenario;
  assumptions: DgeValuationAssumptions;
};

export type ExplainableScore = {
  score: number;
  signal: Signal;
  explanation: string;
  evidenceIds: string[];
  warnings: string[];
};

export type DgeUsDemandOutput = {
  usDemandScore: number;
  trueConsumptionTrend: "improving" | "stable" | "deteriorating";
  shipmentQualityScore: number;
  depletionsVsShipmentsGap: number;
  affordabilityPressureScore: number;
  competitivePressureScore: number;
  tequilaRiskScore: number;
  scenarios: Record<Scenario, number>;
  diagnosis: string;
  bridge: Array<{ label: string; value: number; explanation: string }>;
  evidenceIds: string[];
  warnings: string[];
};

export type DgeLacInventoryOutput = {
  lacInventoryHealthScore: number;
  destockingCompletionProbability: number;
  restockingRisk: number;
  pullForwardRisk: number;
  realDemandRecoveryScore: number;
  brazilRecoveryScore: number;
  mexicoStabilizationScore: number;
  priceMixQualityScore: number;
  normalizedLacGrowth: number;
  reportedGrowthAdjustedForInventory: number;
  bridge: Array<{ label: string; value: number; researchOnly: boolean }>;
  evidenceIds: string[];
  warnings: string[];
};

export type DgeRegionalQualityOutput = {
  regionScores: Array<{
    region: DgeRegion;
    organicGrowth: number;
    volumeContribution: number | null;
    priceMixContribution: number | null;
    shipmentQuality: number;
    inventoryDistortion: number;
    consumerDemandQuality: number;
    fxRisk: number;
    marginQuality: number;
    sustainabilityScore: number;
    explanation: string;
    evidenceIds: string[];
  }>;
  aggregateScore: number;
  warnings: string[];
};

export type DgeBrandPortfolioOutput = {
  brandRows: Array<DgeBrandDatum & { moatScore: number; affordabilityGap: number; explanation: string }>;
  brandHealthScore: number;
  premiumisationDurabilityScore: number;
  affordabilityGapScore: number;
  guinnessStructuralGrowthScore: number;
  tequilaNormalizationRisk: number;
  scotchGrowthScore: number;
  usWhiskeyRisk: number;
  valueTierCoverageScore: number;
  portfolioRebalancingNeed: number;
  evidenceIds: string[];
  warnings: string[];
};

export type DgePriceMixVolumeOutput = {
  organicNetSalesBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  priceMixQuality: number;
  volumeQuality: number;
  negativeMixDrivers: string[];
  promotionalIntensity: number;
  downtradingSignal: number;
  pricingPowerScore: number;
  evidenceIds: string[];
  warnings: string[];
};

export type DgeMarginSavingsOutput = {
  underlyingMarginScore: number;
  savingsQualityScore: number;
  tariffDrag: number;
  mixDrag: number;
  apEfficiencyRisk: number;
  sustainableMarginScenario: Record<Scenario, number>;
  evidenceIds: string[];
  warnings: string[];
};

export type DgeCashFlowOutput = {
  fcfQualityScore: number;
  deleveragingPath: Array<{ period: string; netDebtToEbitda: number; netDebt: number }>;
  dividendSafetyScore: number;
  payoutRatio: number;
  fcfAfterDividend: number;
  debtReductionCapacity: number;
  leveragePath: Record<Scenario, Array<{ year: number; netDebtToEbitda: number }>>;
  evidenceIds: string[];
  warnings: string[];
};

export type DgeManagementTurnaroundOutput = {
  turnaroundCredibilityScore: number;
  executionRiskScore: number;
  strategyChangeIntensity: number;
  earlyWins: string[];
  redFlags: string[];
  evidenceIds: string[];
};

export type DgeValuationOutput = {
  normalizedFcfFairValueGbp: number;
  evEbitFairValueGbp: number;
  evEbitdaFairValueGbp: number;
  peFairValueGbp: number;
  dividendFloorValueGbp: number;
  regionQualityFairValueGbp: number;
  blendedFairValueGbp: number;
  blendedFairValueGbx: number;
  adrEquivalentUsd: number;
  marketImplied: {
    normalizedFcf: number;
    requiredFcfYield: number;
    usDemandRecovery: number;
    lacNormalizedGrowth: number;
    operatingMargin: number;
    netDebtToEbitda: number;
    terminalOrganicGrowth: number;
  };
  methodWeights: Record<string, number>;
  sensitivityTables: { title: string; table: Array<Array<string | number>> }[];
  warnings: ValidationWarning[];
};

export type DgeDataset = {
  periods: DgeReportedPeriod[];
  currentPeriodId: string;
  reportedData: {
    regions: DgeRegionalDatum[];
    brands: DgeBrandDatum[];
    categories: DgeCategoryDatum[];
    channelInventory: DgeChannelInventoryDatum[];
  };
  guidanceData: DgeGuidanceDatum[];
  marketData: DgeMarketData;
  competitorData: DgeCompetitorDatum[];
  researchAssumptions: DgeResearchAssumption[];
  evidenceData: EvidenceRecord[];
};

export type DgeDashboardData = {
  dataset: DgeDataset;
  selectedPeriod: DgeReportedPeriod;
  usDemand: DgeUsDemandOutput;
  lacInventory: DgeLacInventoryOutput;
  regionalQuality: DgeRegionalQualityOutput;
  brandPortfolio: DgeBrandPortfolioOutput;
  priceMixVolume: DgePriceMixVolumeOutput;
  marginSavings: DgeMarginSavingsOutput;
  cashFlow: DgeCashFlowOutput;
  managementTurnaround: DgeManagementTurnaroundOutput;
  valuation: DgeValuationOutput;
  riskRedTeam: ReturnType<typeof import("./engines/riskRedTeamEngine").buildDgeRiskRedTeam>;
  evidenceAudit: ReturnType<typeof import("./engines/evidenceEngine").buildDgeEvidenceAudit>;
  dataStatus: DataStatus;
  thesisBoard: {
    onePageThesis: string;
    whatMustBeTrue: string[];
    upsideDrivers: string[];
    downsideRisks: string[];
    catalysts: string[];
    valueTrapCase: string;
    meanReversionCase: string;
  };
};
