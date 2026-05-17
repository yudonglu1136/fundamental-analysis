import type { Scenario, Signal, ValidationWarning } from "../types";

export type LsegPeriodType = "FY";
export type LsegDataSource = "actual" | "guidance" | "assumption" | "derived";
export type LsegRevenueDefinition = "revenue" | "totalIncomeExcludingRecoveries";
export type ReportedLsegSegmentName =
  | "Data & Analytics"
  | "FTSE Russell"
  | "Risk Intelligence"
  | "Markets"
  | "Other";
export type AnalyticalLsegSegmentName =
  | "Data & Analytics"
  | "FTSE Russell"
  | "Risk Intelligence"
  | "Capital Markets"
  | "Post Trade"
  | "Other";
export type LsegSegmentName = ReportedLsegSegmentName | AnalyticalLsegSegmentName;
export type LsegSegmentTaxonomy = "reported_2025" | "analytical_split";
export type LsegSplitSource = "company_disclosed" | "analyst_estimate" | "placeholder" | "not_applicable";
export type DcfCashFlowType = "unlevered" | "equity";
export type DcfMethod = "wacc_unlevered" | "cost_of_equity_equity";
export type CashFlowTaxonomy = {
  dcfMethod: DcfMethod;
  dcfCashFlowType: DcfCashFlowType;
  fcfYieldCashFlowType: "equity";
  netDebtTreatment: "subtract_after_ev" | "already_in_equity_cash_flow";
  interestTreatment: "excluded_from_unlevered_dcf" | "included_in_equity_fcf";
};

export type LsegMacroPoint = {
  periodId: string;
  ukRiskFreeRate: number;
  equityRiskPremium: number;
  commentary: string;
  sourceType: LsegDataSource;
};

export type LsegFinancialPeriod = {
  id: string;
  label: string;
  reportedYear?: number;
  fiscalYear: number;
  periodType: LsegPeriodType;
  sourceType: LsegDataSource;
  totalIncomeExcludingRecoveries: number;
  organicConstantCurrencyGrowth: number;
  adjustedEbitda: number;
  adjustedEbitdaMargin: number;
  adjustedOperatingProfit: number;
  adjustedNetIncome?: number;
  adjustedProfitAttributable: number;
  adjustedEps: number;
  weightedAverageShares: number;
  dilutedShares?: number;
  equityFreeCashFlow: number;
  cashTax?: number;
  capex: number;
  capexIntensity: number;
  netDebt: number;
  cashInterestExpense: number;
  taxRate: number;
  minorityInterest: number;
  buybackAmount: number;
  dividendPerShare: number;
  currentPrice: number;
  notes: string;
};

export type LsegSegmentFinancialPoint = {
  periodId: string;
  segment: LsegSegmentName;
  taxonomy: LsegSegmentTaxonomy;
  revenueDefinition: LsegRevenueDefinition;
  revenue: number;
  adjustedEbitda: number;
  adjustedEbitdaMargin: number;
  sourceType: LsegDataSource;
  splitSource?: LsegSplitSource;
  parentReportedSegment?: ReportedLsegSegmentName;
  notes?: string;
};

export type LsegKpiPoint = {
  periodId: string;
  asvGrowth: number;
  retentionH1: number;
  retentionH2: number;
  grossSalesH1: number;
  grossSalesH2: number;
  newProductVitalityIndex: number;
  subscriptionMix: number;
  grossRetention: number;
  netRetention: number;
  averageContractDurationYears: number;
  recurringRevenueMix: number;
  pricingRealization: number;
  sourceType: LsegDataSource;
};

export type TradewebMonthlyPoint = {
  month: string;
  totalVolume?: number;
  adv?: number;
  advYoY?: number;
  tradewebAdv: number;
  tradewebAdvYoY: number;
  ratesAdv: number;
  creditAdv: number;
  repoAdv: number;
  equitiesAdv: number;
  moneyMarketsAdv?: number;
  feePerMillion: number;
  fixedFees: number;
  structuralGrowthEstimate?: number;
  cyclicalUpliftEstimate?: number;
  normalizedAdvGrowth?: number;
  sourceType: LsegDataSource;
};

export type LsegPeerPoint = {
  ticker?: string;
  peer: string;
  companyName?: string;
  category: string;
  peerGroup?: string;
  marketCap?: number;
  enterpriseValue?: number;
  trailingPe?: number;
  revenueGrowth: number;
  ebitdaMargin: number;
  fcfYield: number;
  forwardPe: number;
  forwardEVEbitda?: number;
  ebitdaMultiple?: number;
  priceToSales?: number;
  dividendYield?: number;
  beta?: number;
  currency?: string;
  fetchedAt?: string;
  absoluteValueAggregationAllowed?: false;
  absoluteValueCurrency?: string;
  absoluteValueUse?: "metadata_only";
  dataDate?: string;
  source?: string;
  sourceUrlOptional?: string;
  lastReviewedDate?: string;
  isPlaceholder?: boolean;
  isStale?: boolean;
  confidenceLevel?: LsegConfidenceLevel;
  peerSetCompleteness?: number;
  notes?: string;
  qualityNotes?: string;
  commentary: string;
  signal: Signal;
  sourceType?: LsegDataSource;
};

export type LsegConfidenceLevel = "high" | "medium" | "low";
export type LsegSotpMultiplePolicy = "conservative_operating" | "base_operating" | "premium_operating" | "strategic";

export type LsegSotpMinorityAdjustmentInput = {
  id: "tradewebNciAdjustment" | "postTradeSolutionsNciAdjustment" | "otherMinorityInterests";
  label: string;
  amount: number;
  source: string;
  sourceType: LsegDataSource;
  isPlaceholder: boolean;
  confidenceLevel: LsegConfidenceLevel;
  notes?: string;
};

export type LsegSotpCorporateInput = {
  treatment: "included_in_segment_ebitda" | "deducted_separately" | "not_applicable" | "unknown";
  amount: number;
  multiple?: number;
  source: string;
  sourceDate?: string;
  sourceType: LsegDataSource;
  isPlaceholder: boolean;
  confidenceLevel: LsegConfidenceLevel;
  includedInSegmentEbitda: boolean;
  deductedSeparately: boolean;
  notes: string;
};

export type LsegOwnershipRelatedSegment = "Markets" | "DataAndAnalytics" | "FtseRussell" | "RiskIntelligence" | "Other";

export type LsegOwnershipComponent = {
  id: string;
  name: string;
  relatedSegment: LsegOwnershipRelatedSegment;
  consolidationTreatment: "fully_consolidated" | "proportionately_consolidated" | "equity_method" | "not_consolidated" | "unknown";
  lsegOwnershipPct: number | null;
  minorityOwnershipPct: number | null;
  includedInSegmentEbitda: boolean;
  includedEbitdaAmount: number | null;
  selectedMultiple: number | null;
  balanceSheetNciValue: number | null;
  valuationMethod: "economic_value_deduction" | "balance_sheet_nci" | "analyst_estimate" | "placeholder";
  source: string;
  sourceDate: string;
  isPlaceholder: boolean;
  confidenceLevel: LsegConfidenceLevel;
  notes: string;
};

export type LsegOwnershipBridgeRow = {
  id: string;
  name: string;
  relatedSegment: LsegOwnershipRelatedSegment;
  consolidationTreatment: LsegOwnershipComponent["consolidationTreatment"];
  lsegOwnershipPct: number | null;
  minorityOwnershipPct: number | null;
  includedInSegmentEbitda: boolean;
  includedEbitdaAmount: number | null;
  selectedMultiple: number | null;
  economicNciDeduction: number;
  fallbackBalanceSheetNci: number | null;
  methodUsed: "economic_value_deduction" | "balance_sheet_nci" | "no_deduction" | "placeholder_fallback";
  source: string;
  sourceDate: string;
  isPlaceholder: boolean;
  confidenceLevel: LsegConfidenceLevel;
  notes: string;
};

export type LsegCorporateReconciliationInput = {
  id: string;
  reportedGroupAdjustedEbitda: number;
  sumOfReportedSegmentAdjustedEbitda: number;
  otherOrCorporateAdjustedEbitda: number;
  eliminations: number;
  difference: number;
  tolerance: number;
  treatment: "included_in_segment_ebitda" | "deducted_separately" | "unknown";
  corporateCostMultiple: number;
  source: string;
  sourceDate: string;
  confidenceLevel: LsegConfidenceLevel;
  notes: string;
};

export type LsegCorporateReconciliationAudit = LsegCorporateReconciliationInput & {
  verified: boolean;
  selectedCorporateCostAmount: number;
  selectedCorporateCostValueDeduction: number;
};

export type LsegSotpInputs = {
  minorityAdjustments: LsegSotpMinorityAdjustmentInput[];
  corporateCost: LsegSotpCorporateInput;
};

export type LsegGuidancePoint = {
  guidanceYear: number;
  revenueGrowthLow: number;
  revenueGrowthHigh: number;
  ebitdaMarginExpansionLowBps: number;
  ebitdaMarginExpansionHighBps: number;
  equityFcfMinimum: number;
  capexIntensityTarget: number;
  taxRateLow: number;
  taxRateHigh: number;
  buybackAuthorization: number;
  sourceType: LsegDataSource;
};

export type LsegConsensusPoint = {
  fiscalYear: number;
  totalIncomeExcludingRecoveries: number;
  organicGrowth: number;
  adjustedEbitda: number;
  adjustedEbitdaMargin: number;
  adjustedEps: number;
  equityFcf: number;
  dividendPerShare: number;
  segmentGrowth: Partial<Record<ReportedLsegSegmentName, number>>;
  sourceType: LsegDataSource;
};

export type LsegConsensusSnapshot = {
  consensusDate: string;
  currentPriceAtConsensusDate: number;
  consensusTargetPrice: number;
  numberOfBuyRatings: number;
  numberOfHoldRatings: number;
  numberOfSellRatings: number;
  yearly: LsegConsensusPoint[];
};

export type LsegMarketData = {
  currentPrice: number;
  currentPriceCurrency: "GBP";
  priceDate: string;
  source: string;
  manualOverride?: number | null;
  previousClose: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketCap: number;
  enterpriseValue: number;
  sharesOutstanding: number;
  dilutedShares: number;
  netDebt: number;
  sourceType: LsegDataSource;
  ticker?: string;
  rawCurrency?: string | null;
  fetchedAt?: string | null;
  asOfDate?: string | null;
  providerSourceType?: "yahoo_finance_snapshot" | "manual_snapshot" | "unknown";
  qualityTag?: "Actual" | "Derived" | "Assumption" | "Placeholder";
  currentPriceGbp?: number | null;
  previousCloseGbp?: number | null;
  fiftyTwoWeekHighGbp?: number | null;
  fiftyTwoWeekLowGbp?: number | null;
  marketCapGbp?: number | null;
  enterpriseValueGbp?: number | null;
  sharesOutstandingRaw?: number | null;
  beta?: number | null;
  dividendYield?: number | null;
  validationWarnings?: ValidationWarning[];
};

export type LsegScenarioWeights = {
  dcf: number;
  fcfYield: number;
  sotp: number;
  pe: number;
};

export type LsegGrowthAssumption = {
  organicGrowthStart: number;
  organicGrowthFadeTo: number;
  pricingContribution: number;
  volumeContribution: number;
  acquisitionContribution: number;
  disposalImpact: number;
  fxImpact: number;
};

export type LsegMarginAssumption = {
  operatingLeverageBps: number;
  synergyBenefitBps: number;
  productivityBenefitBps: number;
  reinvestmentBps: number;
  costInflationBps: number;
  annualFadeBps: number;
};

export type LsegSotpMultipleSet = Record<LsegSegmentName, number>;

export type LsegScenarioAssumptions = {
  scenario: Scenario;
  segmentTaxonomy: LsegSegmentTaxonomy;
  currentPrice: number;
  taxRate: number;
  capexIntensity: number;
  cashInterestExpense: number;
  workingCapitalAsPctRevenue: number;
  integrationCashCost: number;
  minorityInterest: number;
  leasePayments: number;
  stockCompensationDilution: number;
  riskFreeRate: number;
  beta: number;
  equityRiskPremium: number;
  preTaxCostOfDebt: number;
  targetPe: number;
  targetFcfYield: number;
  terminalGrowth: number;
  exitPe: number;
  dividendYield: number;
  probabilityWeight: number;
  valuationWeights: LsegScenarioWeights;
  buybackByYear: Record<number, number>;
  averageBuybackPriceByYear: Record<number, number>;
  segmentGrowth: Partial<Record<LsegSegmentName, LsegGrowthAssumption>>;
  segmentMargin: Partial<Record<LsegSegmentName, LsegMarginAssumption>>;
  sotpMultiples: Partial<LsegSotpMultipleSet>;
  strategicSotpMultiples: Partial<LsegSotpMultipleSet>;
  strategicOptionality: {
    tradewebLookThroughStakeValue: number;
    postTradeStandaloneUplift: number;
    portfolioSimplificationValue: number;
    excessCapitalReturnOptionality: number;
    activistBreakupValue: number;
    taxLeakage: number;
    disSynergyCost: number;
    executionDiscount: number;
  };
  marketsSplitAssumption?: {
    revenue: number;
    capitalMarketsRevenue: number;
    postTradeRevenue: number;
    adjustedEbitda: number;
    capitalMarketsEbitda: number;
    postTradeEbitda: number;
    splitSource: LsegSplitSource;
  };
};

export type LsegRevenueForecastRow = {
  fiscalYear: number;
  scenario: Scenario;
  segment: LsegSegmentName;
  revenueDefinition: LsegRevenueDefinition;
  beginningRevenue: number;
  organicGrowth: number;
  pricingContribution: number;
  volumeContribution: number;
  acquisitionContribution: number;
  disposalImpact: number;
  fxImpact: number;
  totalGrowth: number;
  endingRevenue: number;
};

export type LsegMarginForecastRow = {
  fiscalYear: number;
  scenario: Scenario;
  segment: LsegSegmentName;
  baseMargin: number;
  operatingLeverageBps: number;
  synergyBenefitBps: number;
  productivityBenefitBps: number;
  reinvestmentBps: number;
  costInflationBps: number;
  endingMargin: number;
  adjustedEbitda: number;
};

export type LsegGroupForecastRow = {
  fiscalYear: number;
  scenario: Scenario;
  revenue: number;
  adjustedEbitda: number;
  adjustedEbitdaMargin: number;
  adjustedOperatingProfit: number;
  depreciationAndAmortization: number;
  revenueGrowth: number;
  marginExpansionBps: number;
};

export type LsegFcfForecastRow = {
  fiscalYear: number;
  scenario: Scenario;
  adjustedEbitda: number;
  adjustedOperatingProfit: number;
  depreciationAndAmortization?: number;
  cashTaxOnEbit?: number;
  cashTax: number;
  cashInterest: number;
  capex: number;
  leasePayments: number;
  workingCapitalInvestment: number;
  integrationCashCost: number;
  minorityInterest: number;
  equityFreeCashFlow: number;
  unleveredFreeCashFlow: number;
  fcfMargin: number;
  fcfConversion: number;
  cashConversionFromEbitda: number;
};
export type FcfForecastYear = LsegFcfForecastRow;

export type LsegBuybackForecastRow = {
  fiscalYear: number;
  scenario: Scenario;
  beginningDilutedShares: number;
  buybackAmount: number;
  averageBuybackPrice: number;
  sharesRepurchased: number;
  stockCompensationDilution: number;
  endingDilutedShares: number;
  averageDilutedShares: number;
  adjustedNetIncome: number;
  adjustedEps: number;
  epsWithoutBuyback: number;
  buybackEpsAccretion: number;
};

export type LsegWaccBuild = {
  scenario: Scenario;
  riskFreeRate: number;
  beta: number;
  equityRiskPremium: number;
  costOfEquity: number;
  preTaxCostOfDebt: number;
  taxRate: number;
  afterTaxCostOfDebt: number;
  marketValueEquity: number;
  netDebt: number;
  equityWeight: number;
  debtWeight: number;
  wacc: number;
  sensitivity: Array<{ label: string; wacc: number }>;
};

export type LsegDcfResult = {
  scenario: Scenario;
  cashFlowTaxonomy: CashFlowTaxonomy;
  pvForecastCashFlow: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  terminalValuePctOfEv: number;
  yearlyPresentValues: Array<{ fiscalYear: number; presentValue: number }>;
};

export type LsegSotpComponent = {
  segmentId: string;
  segment: LsegSegmentName;
  segmentName: string;
  taxonomy: LsegSegmentTaxonomy;
  financialMetricUsed: `${number}${"A" | "E"} EBITDA`;
  baseYearRevenueOrIncome: number;
  baseYearAdjustedEbitda: number;
  forecastYearRevenueOrIncome: number;
  forecastYearAdjustedEbitda: number;
  forecastYear2027RevenueOrIncome?: number;
  forecastYear2027AdjustedEbitda?: number;
  forwardRevenue: number;
  forwardEbitda: number;
  ebitdaMargin: number;
  source: "reported" | "forecast_from_margin_engine" | "analyst_estimate" | "placeholder";
  definition: "revenue" | "totalIncomeExRecoveries" | "adjustedEbitda";
  definitionWarning?: string;
  recurringRevenuePct: number;
  retention: number;
  pricingPower: number;
  switchingCostScore: number;
  workflowPenetration: number;
  capitalIntensity: number;
  incrementalRoic: number;
  growth: number;
  fcfConversion: number;
  peerGroup: string;
  peerGroupMedian: number;
  peerGroupRangeLow: number;
  peerGroupRangeHigh: number;
  peerDataDate?: string;
  peerDataSource?: string;
  peerDataIsPlaceholder?: boolean;
  peerDataIsStale?: boolean;
  peerDataConfidenceLevel?: LsegConfidenceLevel;
  peerValidCount?: number;
  multiplePremiumDiscountToMedian: number;
  multipleJustification: string;
  guardrailWarning?: string;
  targetMultiple: number;
  enterpriseValueContribution: number;
};

export type LsegSotpBridge = {
  segmentEnterpriseValueSubtotal: number;
  corporateCostAmount: number;
  corporateCostMultiple: number;
  corporateCostValueDeduction: number;
  otherSegmentValue: number;
  eliminationAdjustment: number;
  nonOperatingAssets: number;
  associatesOrInvestmentsAddBack: number;
  listedStakeLookThroughValue: number;
  netDebt: number;
  minorityInterestDeduction: number;
  nciDeduction: number;
  tradewebNciAdjustment: number;
  postTradeSolutionsNciAdjustment: number;
  otherMinorityInterests: number;
  pensionOrOtherClaims: number;
  equityValue: number;
  dilutedShares: number;
  valuePerShare: number;
};

export type LsegSotpSensitivity = {
  multipleSensitivity: Array<{
    segment: LsegSegmentName;
    bearMultiple: number;
    baseMultiple: number;
    bullMultiple: number;
    bearValuePerShare: number;
    baseValuePerShare: number;
    bullValuePerShare: number;
  }>;
  ebitdaSensitivity: Array<{
    segment: LsegSegmentName;
    down10ValuePerShare: number;
    baseValuePerShare: number;
    up10ValuePerShare: number;
  }>;
  corporateNciSensitivity: Array<{
    label: string;
    valuePerShare: number;
  }>;
};

export type LsegSotpAudit = {
  confidenceScore: number;
  confidenceCapReasons?: string[];
  warnings: ValidationWarning[];
  severeWarnings: ValidationWarning[];
  auditNotes: string[];
  passedChecks: string[];
  failedChecks: string[];
  inputAuditRows: Array<{
    segment: LsegSegmentName;
    ebitdaUsed: number;
    ebitdaYear: number;
    multiple: number;
    peerGroup: string;
    source: string;
    isPlaceholder: boolean;
    isStale?: boolean;
    confidenceLevel?: LsegConfidenceLevel;
    guardrailWarning?: string;
  }>;
  minorityAdjustments: LsegSotpMinorityAdjustmentInput[];
  ownershipBridge: LsegOwnershipBridgeRow[];
  corporateCostAudit: LsegSotpCorporateInput;
  corporateReconciliation: LsegCorporateReconciliationAudit;
  reconciliation: {
    reportedGroupAdjustedEbitda: number;
    sumOfSegmentAdjustedEbitda: number;
    corporateCostOrOtherAdjustment: number;
    reconciledGroupAdjustedEbitda: number;
    reconciliationDifference: number;
    reconciliationTolerance: number;
  };
};

export type LsegSotpResult = {
  scenario: Scenario;
  taxonomy: LsegSegmentTaxonomy;
  multiplePolicy?: LsegSotpMultiplePolicy;
  valuedSegments: LsegSegmentName[];
  postTradeTreatment: "included_in_markets" | "commentary_only" | "standalone_strategic";
  forwardMetricYear: number;
  components: LsegSotpComponent[];
  segmentEnterpriseValueSubtotal: number;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  impliedGroupEvToEbitda: number;
  type?: "operating" | "strategic";
  blendedUsesOperatingSotp?: boolean;
  corporateCostTreatment?: "included_in_segment_ebitda" | "deducted_separately" | "not_applicable" | "unknown";
  corporateCostAmount?: number;
  corporateCostMultiple?: number;
  corporateCostValueDeduction?: number;
  otherSegmentValue?: number;
  eliminationAdjustment?: number;
  treatmentNote?: string;
  minorityInterestDeduction?: number;
  nciDeduction?: number;
  tradewebNciAdjustment?: number;
  postTradeSolutionsNciAdjustment?: number;
  associatesOrInvestmentsAddBack?: number;
  listedStakeLookThroughValue?: number;
  nonOperatingAssets?: number;
  pensionOrOtherClaims?: number;
  strategicOptionalityPerShare?: number;
  strategicOptionalityValue?: number;
  strategicOptionalityPctOfOperating?: number;
  doubleCountWarnings?: string[];
  bridge: LsegSotpBridge;
  sensitivity: LsegSotpSensitivity;
  audit: LsegSotpAudit;
  sotpWarnings?: ValidationWarning[];
};

export type LsegQualityDiagnostics = {
  overallQualityScore: number;
  revenueDurabilityScore: number;
  pricingPowerSignal: Signal;
  workflowLockInSignal: Signal;
  postTradeMoatSignal: Signal;
  capitalEfficiencySignal: Signal;
  scenarioProbabilityAdjustment: Record<Scenario, number>;
  recommendedMultipleRangeCommentary: string;
  riskFlags: string[];
  interpretation: string;
  sourceMetrics: {
    asvGrowth: number;
    grossRetention: number;
    netRetention: number;
    newProductVitalityIndex: number;
    recurringRevenueMix: number;
    capitalIntensity: number;
    fcfConversion: number;
  };
};

export type LsegConsensusComparisonRow = {
  metric: string;
  fiscalYear: number;
  modelValue: number;
  consensusValue: number;
  absoluteDifference: number;
  percentageDifference: number;
  stance: "above_consensus" | "in_line" | "below_consensus";
  materiality: "low" | "medium" | "high";
};

export type LsegConsensusComparison = {
  rows: LsegConsensusComparisonRow[];
  summary: string;
};

export type LsegMarketImpliedValuation = {
  currentPrice: number;
  priceDate: string;
  impliedPe: number;
  impliedFcfYield: number;
  impliedEquityValue: number;
  impliedEnterpriseValue: number;
  impliedEvebitda: number;
  impliedTerminalGrowth?: number;
  impliedWacc?: number;
  impliedFcfShareCagr?: number;
  impliedExitPeFor3YTarget?: number;
  warnings: string[];
  commentary: string;
};

export type LsegValuationIntegrity = {
  overallIntegrityScore: number;
  integrityScore: number;
  sotpIntegrityScore: number;
  sotpConfidenceScore: number;
  dataQualityScore: number;
  recommendedValuationConfidence: number;
  capReasons: string[];
  warnings: ValidationWarning[];
  severeWarnings: ValidationWarning[];
  dataQualityWarnings: ValidationWarning[];
  recommendationWarnings: ValidationWarning[];
  openAuditItems: string[];
  auditNotes: string[];
  passedChecks: string[];
  failedChecks: string[];
};

export type LsegValuationRecommendation = {
  recommendedFairValue: number;
  recommendedFairValueMethod: "core_ex_sotp" | "sotp_25_uplift" | "sotp_50_uplift" | "sotp_75_uplift" | "full_operating_sotp_blend";
  recommendedFairValueReason: string;
  valuationRangeLow: number;
  valuationRangeBase: number;
  valuationRangeHigh: number;
  primaryUnderwritingValue: number;
  secondaryUpsideValue: number;
  strategicOptionalityValue: number;
  selectedSotpPolicy: LsegSotpMultiplePolicy;
  selectedSotpForBlended: number;
  reasonForSelectedSotpPolicy: string;
};

export type LsegInvestmentThesis = {
  bullCaseSummary: string;
  baseCaseSummary: string;
  bearCaseSummary: string;
  keyUpsideDrivers: string[];
  keyDownsideRisks: string[];
  debatePoints: string[];
  whatMarketIsPricing: string;
  whatWeNeedToBelieve: string;
  whatCouldBreakTheThesis: string;
};

export type LsegScenarioOutput = {
  scenario: Scenario;
  valuation: {
    peFairValue: number;
    fcfFairValue: number;
    dcfValue: number;
    sotpFairValue: number;
    operatingSotpFairValue: number;
    strategicSotpFairValue: number;
    coreValueExSotp?: number;
    operatingSotpUpliftVsCore?: number;
    blendedFairValue: number;
  };
  forecast: {
    revenueCagr: number;
    ebitdaMarginYear1: number;
    fcfPerShareYear1: number;
    wacc: number;
    terminalGrowth: number;
    targetPe: number;
  };
  targetPrice3Y: number;
  cumulativeDividends3Y: number;
  expectedCagr3Y: number;
  downsideToBear?: number;
  probabilityWeight?: number;
};

export type LsegDashboardDataset = {
  periods: LsegFinancialPeriod[];
  segmentFinancials: LsegSegmentFinancialPoint[];
  kpis: LsegKpiPoint[];
  tradewebMonthly: TradewebMonthlyPoint[];
  peers: LsegPeerPoint[];
  macro: LsegMacroPoint[];
  guidance: LsegGuidancePoint[];
  consensus: LsegConsensusSnapshot;
  marketData: LsegMarketData;
  sotpInputs: LsegSotpInputs;
  ownership: LsegOwnershipComponent[];
  corporateReconciliation: LsegCorporateReconciliationInput;
};

export type LsegValuationDiagnostics = {
  warnings: ValidationWarning[];
  definitionWarnings: string[];
};

export type {
  LsegCockpitDataset,
  LsegDataPoint,
  LsegDividendBuybackOutput,
  LsegFcffDcfOutput,
  LsegFcfYieldOutput,
  LsegForecastAssumption,
  LsegForecastYear,
  LsegManagementGuidance,
  LsegMarketData as LsegCockpitMarketData,
  LsegMoatBreakdown,
  LsegMultipleOutput,
  LsegOfficialActual,
  LsegProductLine,
  LsegResearchOnlyItem,
  LsegRiskRedTeamItem,
  LsegRiskRedTeamOutput,
  LsegScenarioAssumption as LsegCockpitScenarioAssumption,
  LsegSegment as LsegCockpitSegment,
  LsegSegmentActual,
  LsegSegmentEngineOutput,
  LsegSourceRecord,
  LsegSourceType,
  LsegSotpOutput as LsegCockpitSotpOutput,
  LsegTranscriptQa,
  LsegValuationAssumptions as LsegCockpitValuationAssumptions,
  LsegValuationBridge,
  LsegValuationOutput as LsegCockpitValuationOutput,
} from "./types";
