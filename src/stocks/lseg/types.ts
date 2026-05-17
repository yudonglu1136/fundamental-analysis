import type { Scenario, ValidationWarning } from "../types";

export type LsegSourceType =
  | "official_actual"
  | "management_guidance"
  | "forecast_assumption"
  | "transcript_commentary"
  | "research_only"
  | "market_data"
  | "derived";

export type LsegEventSnapshotSourceType =
  | "annual_report"
  | "fy_preliminary_results"
  | "h1_interim_results"
  | "q1_trading_update"
  | "q3_trading_update"
  | "transcript"
  | "market_snapshot"
  | "guidance_update";

export type LsegValuationMethodBase = {
  valuationBase: string;
  baseYear?: number;
  forecastYear?: number;
  sourceConfidence: "high" | "medium" | "low";
};

export type LsegValuationSnapshotSemantics = {
  auditedActualBase: {
    periodId: string;
    fiscalYear: number;
    label: string;
    revenue: number;
    adjustedEbitda: number;
    equityFreeCashFlow: number;
    adjustedEpsPence: number;
    dilutedShares: number;
    sourceType: LsegSourceType;
  };
  eventVisibleRunRate?: {
    periodId: string;
    fiscalYear: number;
    label: string;
    revenue: number;
    adjustedEbitda: number;
    adjustedEbitdaMargin: number;
    equityFreeCashFlow: number;
    adjustedEpsPence: number;
    dilutedShares: number;
    sourceType: LsegSourceType;
  };
  guidanceAnchor?: {
    sourceId: string;
    fiscalYear: number;
    organicTotalIncomeGrowthLow: number;
    organicTotalIncomeGrowthHigh: number;
    equityFreeCashFlowFloor: number;
  };
  forecastStartYear: number;
  firstGrowthYear: number;
  isAnnualizedRunRate: boolean;
  isSameYearForecastAnchor: boolean;
  dcfYearOneGrowthSuppressed: boolean;
  sourceType: LsegEventSnapshotSourceType;
  methodBases: {
    dcf: LsegValuationMethodBase;
    fcfYield: LsegValuationMethodBase;
    sotp: LsegValuationMethodBase;
    evEbitda: LsegValuationMethodBase;
    pe: LsegValuationMethodBase;
    platformMoat: LsegValuationMethodBase;
  };
  balanceSheetCarryForward?: {
    sourcePeriodId: string;
    sourceFiscalYear: number;
    leaseLiabilities?: number;
    pensionSurplusDeficit?: number;
    minorityInterest?: number;
    cashInterestExpense?: number;
    regulatoryOperationalAmounts?: number;
    notes: string;
  };
};

export type LsegSourceStatus = "cached" | "blocked" | "parse_failed" | "manual_placeholder" | "not_fetched";

export type LsegSegment =
  | "Data & Analytics"
  | "FTSE Russell / Index"
  | "Risk Intelligence"
  | "Capital Markets"
  | "Post Trade / LCH"
  | "Corporate / Other";

export type LsegReportedSegment = "Data & Analytics" | "FTSE Russell" | "Risk Intelligence" | "Markets" | "Other";

export type LsegSourceRecord = {
  id: string;
  title: string;
  url: string;
  publisher: "LSEG" | "LSEG investor relations" | "Public market data" | "Manual transcript export" | "Research placeholder";
  sourceType: LsegSourceType;
  reportingPeriod?: string;
  publishedDate?: string;
  downloadedAt?: string;
  localPath?: string;
  status: LsegSourceStatus;
  parseStatus?: "parsed" | "not_parsed" | "parse_failed" | "not_applicable";
  notes: string;
};

export type LsegDataPoint<T> = {
  value: T;
  sourceId: string;
  sourceType: LsegSourceType;
  asOfDate?: string;
  rationale?: string;
};

export type LsegOfficialActual = {
  periodId: string;
  fiscalYear: number;
  label: string;
  sourceId: string;
  sourceType: LsegSourceType;
  reportingCurrency: "GBP";
  totalIncomeExRecoveries: number;
  recoveries: number;
  totalIncomeInclRecoveries: number;
  reportedGrowth: number;
  organicConstantCurrencyGrowth: number;
  adjustedEbitda: number;
  adjustedEbitdaMargin: number;
  adjustedOperatingProfit: number;
  adjustedDepreciationAmortisation: number;
  adjustedNetFinanceExpense: number;
  adjustedTaxExpense: number;
  adjustedEffectiveTaxRate: number;
  nonControllingInterest: number;
  adjustedProfitAttributable: number;
  adjustedEpsPence: number;
  weightedAverageShares: number;
  equityFreeCashFlow: number;
  equityFcfPerSharePence: number;
  cashCapex: number;
  capexIntensity: number;
  buybackSpend: number;
  totalDividendPerSharePence: number;
  finalDividendPerSharePence?: number;
  netDebt: number;
  leaseLiabilities: number;
  regulatoryOperationalAmounts: number;
  operatingNetDebt: number;
  leverage: number;
  pensionSurplusDeficit?: number;
  notes: string;
};

export type LsegSegmentActual = {
  periodId: string;
  segment: LsegSegment;
  reportedSegment: LsegReportedSegment;
  sourceId: string;
  sourceType: LsegSourceType;
  revenue: number;
  revenueDefinition: "total_income_ex_recoveries" | "revenue_ex_recoveries" | "analytical_revenue_split";
  adjustedEbitda: number;
  adjustedOperatingProfit?: number;
  organicGrowth: number;
  reportedGrowth?: number;
  margin: number;
  officialDisclosure: boolean;
  splitRationale?: string;
  qualityRationale: string;
};

export type LsegProductLine = {
  periodId: string;
  segment: LsegSegment;
  name: string;
  sourceId: string;
  sourceType: "official_actual";
  revenue: number;
  organicGrowth?: number;
  revenueModel: "subscription" | "asset_based" | "transactional" | "net_treasury_income" | "other";
  recognition: "over_time" | "point_in_time" | "mixed";
  notes: string;
};

export type LsegManagementGuidance = {
  year: number;
  sourceId: string;
  sourceType: "management_guidance";
  organicTotalIncomeGrowthLow: number;
  organicTotalIncomeGrowthHigh: number;
  constantCurrencyEbitdaMarginExpansionLowBps: number;
  constantCurrencyEbitdaMarginExpansionHighBps: number;
  capexIntensity: number;
  equityFreeCashFlowFloor: number;
  effectiveTaxRateLow: number;
  effectiveTaxRateHigh: number;
  buybackPlan: number;
  buybackCompletionBy: string;
  mediumTermRevenueCommentary: string;
  mediumTermMarginCommentary: string;
  mediumTermCapexCommentary: string;
  fcfPerShareCommentary: string;
};

export type LsegForecastAssumption = {
  key: string;
  label: string;
  sourceType: "forecast_assumption";
  value: number;
  unit: "percent" | "GBPm" | "multiple" | "score" | "GBP/share" | "number";
  scenario?: Scenario;
  rationale: string;
  mappedDebate: string;
  canDriveValuation: boolean;
  sourceId: string;
};

export type LsegScenarioAssumption = {
  scenario: Scenario;
  sourceType: "forecast_assumption";
  revenueGrowthBySegment: Record<LsegSegment, number>;
  ebitdaMarginBySegment: Record<LsegSegment, number>;
  wacc: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  evEbitdaMultiples: Record<LsegSegment, number>;
  evEbitMultiple: number;
  platformMoatAdjustment: number;
  riskAdjustment: number;
  postTradeEconomics: LsegPostTradeScenarioEconomics;
  probability: number;
  narrative: string;
};

export type LsegPostTradeSwapClearEconomicsAssumption = {
  enabled: boolean;
  knownFromDate: string;
  effectiveYearStart: number;
  forwardEconomicsStart: number;
  economicsEndYear: number;
  oldBankRevenueShare: number;
  currentBankRevenueShare2025: number;
  forwardBankRevenueShare2026Onward: number;
  eligibleProfitPool: number;
  transactionDebtImpact: number;
  netDebtImpactAlreadyCaptured: boolean;
  disclosed2025AepsAccretionLow: number;
  disclosed2025AepsAccretionHigh: number;
  benefitAlreadyIncludedInActualsThroughYear: number;
  sourceId: string;
  uncertaintyNote: string;
};

export type LsegPostTradeScenarioEconomics = {
  passthroughRate: number;
  profitPoolGrowth: number;
  fcfConversionRate: number;
  segmentMultiplePremium: number;
  terminalResidualCapturePct: number;
  aepsAccretion2026Plus: number;
  durationCapturePct: number;
  description: string;
};

export type LsegValuationAssumptions = {
  currentPrice: number;
  priceDate: string;
  dilutedShares: number;
  netDebt: number;
  leaseLiabilities: number;
  pensionSurplusDeficit: number;
  associatesAndInvestments: number;
  taxRate: number;
  dAndAIntensity: number;
  capexIntensity: number;
  workingCapitalDragPctRevenueGrowth: number;
  integrationCashCost: number;
  maintenanceCapexPctCapex: number;
  dividendPerSharePence: number;
  buyback2026: number;
  buyback2027: number;
  averageBuybackPrice2026: number;
  averageBuybackPrice2027: number;
  weightFcffDcf: number;
  weightFcfYield: number;
  weightSotp: number;
  weightEvEbitda: number;
  weightPe: number;
  weightPlatformMoat: number;
  platformMoatCap: number;
  riskAdjustmentCap: number;
  postTradeSwapClearEconomics: LsegPostTradeSwapClearEconomicsAssumption;
};

export type LsegMarketData = {
  ticker: "LSEG.L";
  sourceId: string;
  sourceType: "market_data";
  currentPriceGbp: number;
  priceDate: string;
  marketCapGbp: number;
  enterpriseValueGbp: number;
  sharesOutstanding: number;
  dividendYield?: number;
  fcfYield?: number;
  source: string;
  notes: string;
};

export type LsegResearchOnlyItem = {
  id: string;
  sourceType: "research_only";
  topic: string;
  affectedSegment: LsegSegment | "Group";
  evidence: string;
  valuationMapping: "scenario_assumption_only" | "risk_discount_only" | "monitoring_only" | "none";
  sourceId: string;
};

export type LsegTranscriptQa = {
  id: string;
  transcriptId: string;
  eventDate: string;
  speaker: string;
  speakerRole: "analyst" | "management" | "operator" | "unknown";
  topic: string;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  metricMentioned?: string;
  question: string;
  answer: string;
  managementGaveQuantGuidance: boolean;
  followUpRisk: string;
  sourcePath: string;
  sourceType: "transcript_commentary";
  valuationImpactAllowed: false;
  needsHumanReview: boolean;
};

export type LsegCockpitDataset = {
  company: "London Stock Exchange Group plc";
  ticker: "LSEG.L";
  reportingCurrency: "GBP";
  latestReportingPeriod: string;
  buildDate: string;
  valuationSemantics?: LsegValuationSnapshotSemantics;
  sources: LsegSourceRecord[];
  sourceMap: Record<string, LsegSourceRecord>;
  officialActuals: LsegOfficialActual[];
  segmentActuals: LsegSegmentActual[];
  productLines: LsegProductLine[];
  managementGuidance: LsegManagementGuidance[];
  forecastAssumptions: LsegForecastAssumption[];
  scenarios: Record<Scenario, LsegScenarioAssumption>;
  marketData: LsegMarketData;
  researchOnly: LsegResearchOnlyItem[];
};

export type LsegSegmentEngineRow = LsegSegmentActual & {
  revenueShare: number;
  ebitdaShare: number;
  qualityScore: number;
  riskScore: number;
  contribution: string;
};

export type LsegSegmentEngineOutput = {
  rows: LsegSegmentEngineRow[];
  totalRevenue: number;
  totalAdjustedEbitda: number;
  groupMargin: number;
  reconciliation: {
    groupRevenue: number;
    segmentRevenue: number;
    revenueDifference: number;
    groupAdjustedEbitda: number;
    segmentAdjustedEbitda: number;
    ebitdaDifference: number;
  };
};

export type LsegSpecialistEngineOutput = {
  title: string;
  segment: LsegSegment;
  summary: string;
  metrics: Array<{ label: string; value: number | string; sourceType: LsegSourceType; sourceId: string }>;
  drivers: string[];
  debates: string[];
  monitoring: string[];
  warnings: string[];
};

export type LsegMoatBreakdown = {
  dataSwitchingCost: number;
  workflowEmbedding: number;
  benchmarkIndexNetworkEffect: number;
  clearingNetworkEffect: number;
  regulatoryLicenseMoat: number;
  brandTrust: number;
  aiDisruptionResilience: number;
  pricingPowerDurability: number;
  overallScore: number;
  cappedValuationAdjustment: number;
  cap: number;
  commentary: string;
};

export type LsegRiskRedTeamItem = {
  id: string;
  risk: string;
  affectedSegment: LsegSegment | "Group";
  mechanism: string;
  leadingIndicator: string;
  killCriterion: string;
  monitoringTrigger: string;
  valuationImpact: number;
  probability: number;
  severity: number;
};

export type LsegRiskRedTeamOutput = {
  verdict: string;
  items: LsegRiskRedTeamItem[];
  topKillCriteria: string[];
  cappedRiskAdjustment: number;
  cap: number;
};

export type LsegForecastYear = {
  year: number;
  valuationBase: string;
  sameYearGrowthSuppressed: boolean;
  baseRevenueBeforeGrowth: number;
  growthApplied: number;
  revenueBySegment: Record<LsegSegment, number>;
  ebitdaBySegment: Record<LsegSegment, number>;
  totalRevenue: number;
  adjustedEbitda: number;
  adjustedEbitdaMargin: number;
  depreciationAmortisation: number;
  adjustedEbit: number;
  tax: number;
  nopat: number;
  capex: number;
  maintenanceCapex: number;
  workingCapitalInvestment: number;
  integrationCashCost: number;
  fcff: number;
  fcffConversion: number;
  postTradeIncrementalEbitda: number;
  postTradeIncrementalFcff: number;
};

export type LsegPostTradeAnnualUplift = {
  year: number;
  bankRevenueShareBaseline: number;
  bankRevenueShareForward: number;
  eligibleProfitPool: number;
  incrementalEbitda: number;
  incrementalNopat: number;
  incrementalFcff: number;
  incrementalAepsPence: number;
};

export type LsegPostTradeEconomicsOutput = {
  active: boolean;
  knownAsOfDate: string;
  knownFromDate: string;
  sourceId: string;
  scenario: Scenario;
  explanation: string;
  originalModelLimitation: string;
  alreadyIncludedInActuals: boolean;
  assumptionDriven: boolean;
  uncertaintyNote: string;
  oldBankRevenueShare: number;
  currentBankRevenueShare2025: number;
  forwardBankRevenueShare2026Onward: number;
  transactionDebtImpact: number;
  netDebtImpactAlreadyCaptured: boolean;
  segmentMultiplePremium: number;
  terminalResidualCapturePct: number;
  annualUplifts: LsegPostTradeAnnualUplift[];
  yearOneIncrementalEbitda: number;
  yearOneIncrementalFcff: number;
  pvExplicitFcffAfterForecast: number;
  residualTerminalValue: number;
  pvResidualTerminalValue: number;
  durationValue: number;
  netDebtDragPerShare: number;
  warnings: string[];
};

export type LsegFcffDcfOutput = {
  scenario: Scenario;
  valuationBase: LsegValuationMethodBase;
  yearOneBaseAudit: {
    latestAuditedActualRevenue: number;
    eventRunRateRevenue: number;
    yearOneRevenueBeforeFix: number;
    yearOneRevenueAfterFix: number;
    impliedGrowthVsAuditedBeforeFix: number;
    impliedGrowthVsAuditedAfterFix: number;
    sameYearGrowthSuppressed: boolean;
    forecastStartYear: number;
    firstGrowthYear: number;
  };
  forecast: LsegForecastYear[];
  revenueBridge: Array<{ year: number; totalRevenue: number; growth: number }>;
  marginBridge: Array<{ year: number; adjustedEbitdaMargin: number; adjustedEbitMargin: number }>;
  discountFactors: number[];
  presentValueFcff: number;
  terminalValue: number;
  presentValueTerminalValue: number;
  postTradeDurationValue: number;
  postTradeTerminalValueAdjustment: number;
  enterpriseValue: number;
  netDebt: number;
  leaseLiabilities: number;
  pensionSurplusDeficit: number;
  associatesAndInvestments: number;
  equityValue: number;
  dilutedShares: number;
  fairValuePerShare: number;
  terminalValuePctOfEnterpriseValue: number;
  averageFcffConversion: number;
};

export type LsegFcfYieldOutput = {
  valuationBase: LsegValuationMethodBase;
  currentFcfYield: number;
  normalizedFcf: number;
  normalizedFcfYield: number;
  targetYield: number;
  impliedEquityValue: number;
  impliedPrice: number;
  maintenanceCapex: number;
  growthCapex: number;
  dividendCoverage: number;
  buybackAdjustedShares: number;
  normalFcfBeforePostTradeUplift: number;
  postTradeIncrementalFcf: number;
  postTradeUpliftedFcf: number;
};

export type LsegSotpComponent = {
  segment: LsegSegment;
  revenue: number;
  adjustedEbitda: number;
  adjustedEbit?: number;
  margin: number;
  growth: number;
  multiple: number;
  baseMultiple: number;
  postTradeMultiplePremium: number;
  postTradeIncrementalEbitda: number;
  multipleRationale: string;
  riskPremiumDiscount: number;
  impliedEnterpriseValue: number;
  contributionToFairValue: number;
  sourceType: LsegSourceType;
  sourceId: string;
  valuationBase: string;
  sourceConfidence: "high" | "medium" | "low";
};

export type LsegSotpOutput = {
  valuationBase: LsegValuationMethodBase;
  components: LsegSotpComponent[];
  segmentEnterpriseValue: number;
  postTradeSegmentUplift: number;
  corporateCostValue: number;
  netDebt: number;
  leaseLiabilities: number;
  pensionSurplusDeficit: number;
  associatesAndInvestments: number;
  equityValue: number;
  fairValuePerShare: number;
};

export type LsegMultipleOutput = {
  valuationBases: {
    evEbitda: LsegValuationMethodBase;
    pe: LsegValuationMethodBase;
  };
  currentPe: number;
  currentEvEbitda: number;
  currentEvEbit: number;
  fcfYield: number;
  dividendYield: number;
  evEbitdaFairValue: number;
  peFairValue: number;
  postTradeForwardEbitdaUplift: number;
  postTradeAepsAccretionPence: number;
  peerRows: Array<{
    peer: string;
    category: string;
    forwardPe?: number;
    evEbitda?: number;
    fcfYield?: number;
    sourceType: LsegSourceType;
    sourceDate: string;
    notes: string;
  }>;
};

export type LsegDividendBuybackOutput = {
  dividendPerSharePence: number;
  dividendCashCost: number;
  payoutRatioVsAdjustedProfit: number;
  fcfCoverage: number;
  buybackAuthorization: number;
  modeledShareReduction: number;
  buybackAdjustedShareCount: number;
  leverageConstraint: string;
  dividendGrowthRunway: string;
};

export type LsegValuationBridge = {
  method: string;
  fairValue: number;
  weight: number;
  contribution: number;
  sourceType: LsegSourceType;
  explanation: string;
  valuationBase: string;
  baseYear?: number;
  forecastYear?: number;
  sourceConfidence: "high" | "medium" | "low";
};

export type LsegPostTradeValuationBridgeRow = {
  label: string;
  valuePerShare: number;
  detail: string;
};

export type LsegPostTradeValuationBridge = {
  active: boolean;
  scenario: Scenario;
  snapshotFairValue: number;
  adjustedFairValue: number;
  totalUplift: number;
  totalUpliftPct: number;
  rows: LsegPostTradeValuationBridgeRow[];
  methodDeltas: Array<{ method: string; methodFairValueDelta: number; weightedContributionDelta: number }>;
  economics: LsegPostTradeEconomicsOutput;
};

export type LsegValuationOutput = {
  scenario: Scenario;
  currentPrice: number;
  priceDate: string;
  peFairValue: number;
  fcfFairValue: number;
  dcfValue: number;
  recommendedFairValueMethod: "core_ex_sotp" | "sotp_25_uplift" | "sotp_50_uplift" | "sotp_75_uplift" | "full_operating_sotp_blend";
  fcffDcf: LsegFcffDcfOutput;
  fcfYield: LsegFcfYieldOutput;
  sotp: LsegSotpOutput;
  multiples: LsegMultipleOutput;
  moat: LsegMoatBreakdown;
  risk: LsegRiskRedTeamOutput;
  dividendBuyback: LsegDividendBuybackOutput;
  methodBridge: LsegValuationBridge[];
  postTradeBridge: LsegPostTradeValuationBridge;
  modelQaDiagnostics: {
    dcfYearOneBaseAudit: LsegFcffDcfOutput["yearOneBaseAudit"];
    valuationSemantics: LsegValuationSnapshotSemantics;
    balanceSheetBridgeAudit: {
      netDebt: number;
      leaseLiabilities: number;
      carriedForwardLeaseLiabilities: number;
      grossPerShareImpact: number;
      weightedValuationImpact: number;
      sourcePeriodId?: string;
    };
    postTradeDriverAudit: {
      snapshotFairValue: number;
      finalFairValue: number;
      uplift: number;
      upliftPct: number;
    };
  };
  fairValue: number;
  valuationRangeLow: number;
  valuationRangeHigh: number;
  upsideDownside: number;
  scenarioValues: Array<{ scenario: Scenario; fairValue: number; upsideDownside: number; probability: number }>;
  warnings: ValidationWarning[];
};
