import type { Scenario, ValidationWarning } from "../types";

export type GooglSourceType =
  | "official_actual"
  | "management_guidance"
  | "company_commentary"
  | "forecast_assumption"
  | "research_only"
  | "market_data"
  | "third_party_secondary"
  | "derived";

export type GooglSegmentName = "Google Services" | "Google Cloud" | "Other Bets" | "Alphabet-level activities";
export type GooglPeriodType = "annual" | "quarterly";

export type GooglSource = {
  id: string;
  title: string;
  url: string;
  publisher: "Alphabet" | "SEC / Alphabet" | "StockAnalysis" | "Analyst";
  sourceType: GooglSourceType;
  reportingPeriod?: string;
  accessedDate: string;
  notes?: string;
};

export type GooglFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: GooglPeriodType;
  sourceType: "official_actual";
  sourceId: string;
  totalRevenue: number;
  revenueGrowth?: number;
  constantCurrencyRevenueGrowth?: number;
  operatingIncome: number;
  operatingMargin?: number;
  netIncome?: number;
  netCashProvidedByOperatingActivities: number;
  capex: number;
  freeCashFlow: number;
  ttmOperatingCashFlow?: number;
  ttmCapex?: number;
  ttmFreeCashFlow?: number;
  shareRepurchases?: number;
  dividendPayments?: number;
  dilutedEps?: number;
  depreciation?: number;
  cashAndMarketableSecurities?: number;
  longTermDebt?: number;
  sharesOutstanding?: number;
  dilutedShares?: number;
  operatingLeaseLiabilities?: number;
  financeLeaseLiabilities?: number;
  legalRegulatoryCharge?: number;
};

export type GooglRevenueLine = {
  periodId: string;
  sourceType: "official_actual";
  sourceId: string;
  googleSearchOther: number;
  youtubeAds: number;
  googleNetwork: number;
  googleAdvertising: number;
  googleSubscriptionsPlatformsDevices: number;
  googleServicesTotal: number;
  googleCloud: number;
  otherBets: number;
  hedging: number;
  totalRevenue: number;
};

export type GooglSegmentFinancial = {
  periodId: string;
  segment: GooglSegmentName;
  sourceType: "official_actual";
  sourceId: string;
  revenue: number;
  operatingIncome: number;
};

export type GooglMonetizationMetrics = {
  periodId: string;
  sourceType: "official_actual";
  sourceId: string;
  googleSearchPaidClicksGrowth: number;
  googleSearchCostPerClickGrowth: number;
  googleNetworkImpressionsGrowth: number;
  googleNetworkCostPerImpressionGrowth: number;
};

export type GooglCloudBacklog = {
  periodId: string;
  sourceType: "official_actual";
  sourceId: string;
  totalRevenueBacklog: number;
  googleCloudBacklog: number;
  expectedRecognitionWithin24Months: number;
  oneYearOrLessContractsIncluded: number;
};

export type GooglGuidance = {
  sourceType: "management_guidance";
  sourceId: string;
  fy2026CapexLow: number;
  fy2026CapexHigh: number;
  fy2027CapexDirection: string;
  q2FxTailwind: number;
  wizCloudMarginHeadwind: string;
  tpuHardwareRevenueTiming: string;
};

export type GooglAiOperatingSignals = {
  sourceType: "company_commentary";
  sourceId: string;
  subscriptions: number;
  geminiEnterprisePaidMauQoqGrowth: number;
  firstPartyModelTokensPerMinute: number;
  cloudCustomersAboveOneTrillionTokens: number;
  cloudCustomersAboveTenTrillionTokens: number;
  waymoWeeklyFullyAutonomousRides: number;
  youtubeLivingRoomDailyUsHours: number;
  youtubeChannelsPublishingShortsDaily: number;
  tpu8iPerformancePerDollarImprovement: number;
  tpu8tProcessingPowerVsIronwood: number;
  aiResponseCostReduction: number;
  computeConstrainedCommentary: boolean;
};

export type GooglCommitmentsAndCapitalStructure = {
  periodId: string;
  sourceType: "official_actual";
  sourceId: string;
  purchaseCommitmentsAndObligations: number;
  shortTermPurchaseCommitmentsAndObligations: number;
  longTermSupplyEnergyContentCommitments: number;
  dataCenterLeasesNotCommenced: number;
  creditBackstopGuarantees: number;
  creditDerivativesBackstops: number;
  accruedLegalRegulatory: number;
  remainingShareRepurchaseAuthorization: number;
  quarterlyDividendPerShare: number;
  seniorUnsecuredNotes: number;
};

export type GooglMarketData = {
  ticker: "GOOGL";
  sourceType: "market_data";
  sourceId: string;
  currentPrice: number;
  priceDate: string;
  marketCap: number;
  enterpriseValue: number;
  peRatio: number;
  forwardPe: number;
  dividendPerShareAnnualized: number;
  sharesOut: number;
  notes: string;
};

export type GooglRiskItem = {
  id: string;
  sourceType: "research_only";
  sourceId: string;
  name: string;
  affectedDriver: string;
  probability: number;
  impact: number;
  detectability: number;
};

export type GooglScenarioDriver = {
  scenario: Scenario;
  sourceType: "forecast_assumption";
  sourceId: string;
  narrative: string;
  searchRevenueCagr: number;
  searchMonetizationChange: number;
  searchAiCannibalization: number;
  youtubeRevenueCagr: number;
  subscriptionsRevenueCagr: number;
  cloudRevenueCagr: number;
  cloudTerminalMargin: number;
  capexIntensity: number;
  dAndAIntensity: number;
  fcfMargin: number;
  tpuEfficiencyBenefit: number;
  aiComputeConstraint: number;
  regulatoryDiscount: number;
  otherBetsOptionValue: number;
  wacc: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  servicesMultiple: number;
  cloudMultiple: number;
};

export type GooglDataset = {
  company: "Alphabet Inc.";
  ticker: "GOOGL";
  alternateTickers: string[];
  currency: "USD";
  reportingCurrency: "USD";
  latestReportingPeriod: string;
  buildDate?: string;
  sources: GooglSource[];
  financials: GooglFinancialPeriod[];
  revenueLines: GooglRevenueLine[];
  segments: GooglSegmentFinancial[];
  monetizationMetrics: GooglMonetizationMetrics;
  cloudBacklog: GooglCloudBacklog;
  guidance: GooglGuidance;
  aiOperatingSignals: GooglAiOperatingSignals;
  commitmentsAndCapitalStructure: GooglCommitmentsAndCapitalStructure;
  marketData: GooglMarketData;
  risks: GooglRiskItem[];
  scenarioDrivers: GooglScenarioDriver[];
  sourceMap: Record<string, GooglSource>;
  notes: string[];
};

export type GooglValuationAssumptions = {
  currentPrice: number;
  searchRevenueCagr: number;
  searchMonetizationChange: number;
  searchAiCannibalization: number;
  youtubeRevenueCagr: number;
  subscriptionsRevenueCagr: number;
  cloudRevenueCagr: number;
  cloudTerminalMargin: number;
  capexIntensity: number;
  dAndAIntensity: number;
  workingCapitalPctRevenueGrowth: number;
  taxRate: number;
  fcfMargin: number;
  tpuEfficiencyBenefit: number;
  aiComputeConstraint: number;
  regulatoryDiscount: number;
  otherBetsOptionValue: number;
  wacc: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  servicesMultiple: number;
  cloudMultiple: number;
  weightDcf: number;
  weightFcfYield: number;
  weightEvEbit: number;
  weightPe: number;
  weightSotp: number;
  dilutedShares: number;
  netCash: number;
  dividendPerShareAnnualized: number;
};

export type GooglForecastYear = {
  year: number;
  servicesRevenue: number;
  searchRevenue: number;
  youtubeAdsRevenue: number;
  subscriptionsRevenue: number;
  cloudRevenue: number;
  otherBetsRevenue: number;
  totalRevenue: number;
  operatingIncome: number;
  nopat: number;
  depreciation: number;
  capex: number;
  workingCapitalInvestment: number;
  unleveredFreeCashFlow: number;
  freeCashFlowMargin: number;
};

export type GooglDcfOutput = {
  forecast: GooglForecastYear[];
  presentValueCashFlows: number;
  terminalValue: number;
  presentValueTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  terminalValueShareOfEv: number;
};

export type GooglSearchAdsOutput = {
  searchRevenue: number;
  youtubeAdsRevenue: number;
  networkRevenue: number;
  advertisingRevenue: number;
  searchGrowth: number;
  youtubeGrowth: number;
  paidClicksGrowth: number;
  cpcGrowth: number;
  tacRatio: number;
  searchMoatScore: number;
  aiSearchBalanceScore: number;
  monetizationRisk: "Low" | "Medium" | "High";
  bridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
};

export type GooglYoutubeOutput = {
  adsRevenue: number;
  subscriptionsSignal: number;
  livingRoomDailyHours: number;
  shortsPublisherCount: number;
  youtubeScaleScore: number;
  monetizationScore: number;
  notes: string[];
};

export type GooglCloudOutput = {
  revenue: number;
  operatingIncome: number;
  margin: number;
  backlog: number;
  backlogCoverageYears: number;
  recognizedWithin24Months: number;
  backlogConversionRevenue: number;
  aiWorkloadScore: number;
  computeConstraintScore: number;
  marginBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
};

export type GooglAiTpuCapexOutput = {
  capex: number;
  capexIntensity: number;
  fy2026CapexMidpoint: number;
  fy2026CapexIntensityOfTtmRevenue: number;
  depreciationBurden: number;
  tpuMoatScore: number;
  aiCapexPaybackScore: number;
  computeConstraint: number;
  bridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
};

export type GooglRegulatoryRiskOutput = {
  discount: number;
  riskScore: number;
  legalAccrual: number;
  killCriteria: string[];
  monitoringTriggers: string[];
  riskRows: Array<GooglRiskItem & { riskScore: number; severityLabel: "Low" | "Medium" | "High" }>;
};

export type GooglOtherBetsOutput = {
  revenue: number;
  operatingLoss: number;
  waymoRideScale: number;
  optionValuePerShare: number;
  cappedOptionValue: number;
  burnRiskScore: number;
  notes: string[];
};

export type GooglCapitalReturnOutput = {
  netCash: number;
  netCashPerShare: number;
  dividendPerShareAnnualized: number;
  dividendYield: number;
  remainingBuybackAuthorization: number;
  remainingBuybackAuthorizationPerShare: number;
  ttmFcf: number;
  ttmFcfYield: number;
  capitalReturnScore: number;
};

export type GooglMoatOutput = {
  moatScore: number;
  drivers: Array<{ label: string; score: number; explanation: string }>;
};

export type GooglValuationEngineOutput = {
  dcf: GooglDcfOutput;
  fcfYieldFairValue: number;
  evEbitFairValue: number;
  peFairValue: number;
  sotpFairValue: number;
  aiTpuCapexAdjustment: number;
  regulatoryAdjustedSotp: number;
  blendedFairValue: number;
  valuationRangeLow: number;
  valuationRangeHigh: number;
  probabilityWeightedFairValue: number;
  weights: Record<"dcf" | "fcfYield" | "evEbit" | "pe" | "sotp", number>;
  finalWeights: Record<"dcf" | "fcfYield" | "evEbit" | "pe" | "sotp", number>;
  methodWarnings: ValidationWarning[];
  sotpBreakdown: Array<{ label: string; value: number; sourceType: GooglSourceType; note: string }>;
};
