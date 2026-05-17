import type { Scenario, ValidationWarning } from "../types";

export type MetaSourceStatus =
  | "official_actual"
  | "management_guidance"
  | "forecast_assumption"
  | "research_only"
  | "market_data"
  | "derived"
  | "manual_seed"
  | "missing";

export type DataLineage = {
  sourceType:
    | "official_actual"
    | "management_guidance"
    | "forecast_assumption"
    | "research_only"
    | "market_data"
    | "derived"
    | "manual_seed";
  sourceName: string;
  sourceUrl?: string;
  filingType?: "10-K" | "10-Q" | "earnings_release" | "transcript" | "investor_presentation" | "market_snapshot";
  period: string;
  asOfDate: string;
  retrievedAt?: string;
  confidence: "high" | "medium" | "low";
  valuationTreatment:
    | "direct_input"
    | "forecast_anchor"
    | "scenario_only"
    | "risk_monitor"
    | "not_used_in_valuation";
  notes?: string;
};

export type MetaFieldLineage = Partial<Record<string, DataLineage>>;

export type MetaSource = {
  id: string;
  title: string;
  url: string;
  publisher: "Meta Investor Relations" | "SEC" | "Nasdaq" | "Yahoo Finance" | "Analyst";
  sourceStatus: MetaSourceStatus;
  reportingPeriod?: string;
  publishedDate?: string;
  accessedDate: string;
  lineage: DataLineage;
  notes?: string;
};

export type MetaFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: "FY" | "Q";
  sourceStatus: "official_actual";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  revenue: number;
  costsAndExpenses: number;
  operatingIncome: number;
  operatingMargin: number;
  incomeBeforeTax: number;
  taxProvision: number;
  effectiveTaxRate: number;
  netIncome: number;
  normalizedNetIncome: number;
  dilutedEps: number;
  normalizedDilutedEps: number;
  dilutedShares: number;
  basicShares?: number;
  cashAndMarketableSecurities: number;
  longTermDebt: number;
  operatingLeaseLiabilities?: number;
  netCash: number;
  capitalExpendituresInclFinanceLeases: number;
  purchasesOfPropertyAndEquipment: number;
  principalPaymentsOnFinanceLeases: number;
  operatingCashFlow: number;
  freeCashFlow: number;
  depreciationAndAmortization: number;
  shareBasedCompensation: number;
  shareRepurchases: number;
  dividendsAndEquivalents: number;
  headcount: number;
  familyDailyActivePeople?: number;
  adImpressionsGrowth?: number;
  averagePricePerAdGrowth?: number;
  notes: string;
};

export type MetaSegmentName = "Family of Apps" | "Reality Labs";

export type MetaSegmentFinancial = {
  periodId: string;
  segment: MetaSegmentName;
  sourceStatus: "official_actual";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  revenue: number;
  operatingIncome: number;
  operatingMargin: number;
  notes?: string;
};

export type MetaGuidance = {
  id: string;
  sourceStatus: "management_guidance";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  guidancePeriod: string;
  revenueLow?: number;
  revenueHigh?: number;
  totalExpenseLow?: number;
  totalExpenseHigh?: number;
  capexLow?: number;
  capexHigh?: number;
  taxRateLow?: number;
  taxRateHigh?: number;
  operatingIncomeAbovePriorYear?: boolean;
  realityLabsLossCommentary?: string;
  regulatoryCommentary?: string;
  notes: string;
};

export type MetaAdEconomicsPoint = {
  periodId: string;
  sourceStatus: "official_actual" | "management_guidance" | "forecast_assumption";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  advertisingRevenue: number;
  familyDailyActivePeople?: number;
  adImpressionsGrowth: number;
  averagePricePerAdGrowth: number;
  constantCurrencyAdRevenueGrowth?: number;
  adRevenueGrowth?: number;
  impliedGrowthFromImpressionsAndPrice?: number;
  notes: string;
};

export type MetaAiCapexPoint = {
  periodId: string;
  sourceStatus: MetaSourceStatus;
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  capexInclFinanceLeases: number;
  capexIntensity: number;
  cashFlowFromOperations?: number;
  freeCashFlow?: number;
  contractualCommitments?: number;
  additionalCommitmentsAfterQuarter?: number;
  aiCapexShare?: number;
  notes: string;
};

export type MetaProductSignal = {
  id: string;
  sourceStatus: "management_guidance" | "research_only";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  product: "Facebook" | "Instagram" | "WhatsApp" | "Threads" | "Ads" | "Meta AI" | "Reality Labs";
  metric: string;
  value?: number;
  unit?: "percent" | "users" | "USD" | "number";
  valuationMapping: "ad_inventory" | "pricing_power" | "ai_monetization" | "rl_option" | "risk_only" | "none";
  notes: string;
};

export type MetaRealityLabsPoint = {
  periodId: string;
  sourceStatus: "official_actual" | "management_guidance";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  revenue: number;
  operatingLoss: number;
  revenueGrowth?: number;
  optionValueTreatment: "explicit_sotp_option_only" | "drag_only" | "commentary_only";
  notes: string;
};

export type MetaRegulatoryRiskItem = {
  id: string;
  sourceStatus: "research_only" | "management_guidance";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  name: string;
  probability: number;
  impact: number;
  detectability: number;
  affectedDriver: string;
  monitoringTrigger: string;
  notes: string;
};

export type MetaTranscriptInsight = {
  id: string;
  sourceStatus: "management_guidance" | "research_only";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  speaker: "Mark Zuckerberg" | "Susan Li" | "Investor Relations" | "Analyst";
  topic: string;
  metric?: string;
  value?: number;
  valuationMapping: "forecast_driver" | "risk_trigger" | "optionality" | "source_context";
  notes: string;
};

export type MetaEarningsCallQuarter = {
  id: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter: "Q1" | "Q2" | "Q3" | "Q4";
  callDate: string;
  sourceStatus: "management_guidance" | "research_only";
  sourceId: string;
  lineage: DataLineage;
  sourceCoverage: "official_transcript_cached" | "official_transcript_metadata" | "curated_from_official_and_model_context";
  headline: string;
  managementTone: "constructive" | "confident" | "balanced" | "defensive";
  marketFocus: string[];
  analystQuestionThemes: string[];
  keyDebates: string[];
  modelImplications: string[];
  themeScores: {
    adMomentum: number;
    aiMonetization: number;
    aiCapexConcern: number;
    engagement: number;
    regulation: number;
    realityLabs: number;
    capitalReturn: number;
  };
  focusShiftSummary: string;
  aiSynthesis: string;
  notes: string;
};

export type MetaMarketData = {
  ticker: "META";
  sourceStatus: "market_data";
  sourceId: string;
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  currentPrice: number;
  priceDate: string;
  source: string;
  sharesForMarketCap: number;
  marketCap: number;
  enterpriseValue: number;
  netCash: number;
  dividendPerShareAnnualized: number;
  dividendYield: number;
  notes: string;
};

export type MetaResearchNote = {
  id: string;
  sourceStatus: "research_only";
  lineage: DataLineage;
  fieldLineage?: MetaFieldLineage;
  topic: string;
  conclusion: string;
  valuationMapping: string;
  notes: string;
};

export type MetaDataset = {
  company: "Meta Platforms, Inc.";
  ticker: "META";
  currency: "USD";
  reportingCurrency: "USD";
  unitScale: "USD billions";
  latestReportingPeriod: string;
  sources: MetaSource[];
  periods: MetaFinancialPeriod[];
  segments: MetaSegmentFinancial[];
  guidance: MetaGuidance[];
  adEconomics: MetaAdEconomicsPoint[];
  aiCapex: MetaAiCapexPoint[];
  productSignals: MetaProductSignal[];
  realityLabs: MetaRealityLabsPoint[];
  regulatoryRisks: MetaRegulatoryRiskItem[];
  transcriptInsights: MetaTranscriptInsight[];
  earningsCalls: MetaEarningsCallQuarter[];
  marketData: MetaMarketData;
  researchNotes: MetaResearchNote[];
  sourceMap: Record<string, MetaSource>;
};

export type MetaValuationAssumptions = {
  currentPrice: number;
  revenueGrowth2026: number;
  revenueCagr2027To2030: number;
  adImpressionCagr: number;
  pricePerAdCagr: number;
  foaOperatingMargin: number;
  realityLabsAnnualLoss: number;
  realityLabsRevenueGrowth: number;
  realityLabsLossCagr: number;
  regulatoryRevenueHaircut: number;
  taxRate: number;
  capex2026: number;
  terminalCapexIntensity: number;
  maintenanceCapexIntensity: number;
  aiCapexShare: number;
  depreciationSalesIntensity: number;
  workingCapitalDragPctRevenueGrowth: number;
  netInterestIncome: number;
  annualDilutionFromSbc: number;
  sbcExpensePctRevenue: number;
  buybackYield: number;
  buybackSpend2026: number;
  wacc: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  foaEbitMultiple: number;
  realityLabsOptionValue: number;
  aiRevenueUpliftPct: number;
  aiIncrementalMargin: number;
  exitPe: number;
  dividendPerShare: number;
  netCash: number;
  dilutedShares: number;
  weightDcf: number;
  weightFcfYield: number;
  weightPe: number;
  weightEvEbit: number;
  weightSotp: number;
};

export type MetaAssumptionMetadata = {
  key: keyof MetaValuationAssumptions;
  lineage: DataLineage;
  confidence: DataLineage["confidence"];
  lastUpdated: string;
  source: "official_actual" | "management_guidance" | "forecast_assumption" | "research_only" | "market_data" | "derived";
  sensitivity: "high" | "medium" | "low";
  thesisRole: "core_driver" | "valuation_multiple" | "risk_control" | "accounting_bridge" | "capital_allocation";
  notes: string;
};

export type MetaRevenueBridge = {
  q1Actual: number;
  q2GuidanceMidpoint: number;
  h2Implied: number;
  h2ImpliedQuarterlyAverage: number;
  q2GuidanceRangeLow?: number;
  q2GuidanceRangeHigh?: number;
  yearOneRevenueGrowth: number;
  h2SequentialStepUpVsQ2: number;
};

export type MetaAdDriverAttribution = {
  year: number;
  baseAdvertisingRevenue: number;
  impressionContribution: number;
  priceContribution: number;
  aiMonetizationContribution: number;
  regulatoryHaircut: number;
  mixFxResidual: number;
  forecastAdvertisingRevenue: number;
};

export type MetaForecastYear = {
  year: number;
  revenueBridge?: MetaRevenueBridge;
  adDriverAttribution?: MetaAdDriverAttribution;
  revenue: number;
  familyOfAppsRevenue: number;
  advertisingRevenue: number;
  familyOfAppsOtherRevenue: number;
  realityLabsRevenue: number;
  familyOfAppsOperatingIncome: number;
  realityLabsOperatingIncome: number;
  operatingIncome: number;
  operatingMargin: number;
  nopat: number;
  depreciationAndAmortization: number;
  capitalExpenditures: number;
  capexIntensity: number;
  workingCapitalInvestment: number;
  unleveredFreeCashFlow: number;
  netIncome: number;
  shareBasedCompensation: number;
  buybackSpend: number;
  grossSbcDilution: number;
  buybackShareReduction: number;
  dilutedShares: number;
  eps: number;
  fcfPerShare: number;
  aiIncrementalRevenue: number;
  aiIncrementalAfterTaxProfit: number;
  aiGrowthCapex: number;
  cumulativeAiGrowthCapex: number;
  aiPaybackYears: number;
  aiRoic: number;
};

export type MetaAdEconomicsOutput = {
  latestActual: MetaAdEconomicsPoint;
  revenueBridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  attributionBridge: MetaAdDriverAttribution[];
  productDriverMap: Array<{ signal: string; product: string; valuationDriver: string; treatment: DataLineage["valuationTreatment"]; confidence: DataLineage["confidence"] }>;
  sensitivities: Array<{ driver: string; shock: string; fairValueRisk: string; modelKey: keyof MetaValuationAssumptions }>;
  impliedAdRevenueGrowth: number;
  reconciliationGap: number;
  monetizationSignal: "Positive" | "Neutral" | "Negative";
  notes: string[];
};

export type MetaAiCapexOutput = {
  capexGuidanceMidpoint: number;
  capexStepUpVs2025: number;
  capexAsPctRevenue2026: number;
  cumulativeAiGrowthCapex: number;
  yearFiveAiRoic: number;
  yearFiveAiRoicSpread: number;
  yearFivePayback: number;
  infrastructureCommitments: number;
  capexToRevenueBridge: Array<{ year: number; capex: number; capexIntensity: number; aiGrowthCapex: number; aiRoic: number; paybackYears: number }>;
  notes: string[];
};

export type MetaRiskOutput = {
  riskScore: number;
  redTeamVerdict: string;
  killCriteria: string[];
  rows: Array<MetaRegulatoryRiskItem & { weightedScore: number; severityLabel: "Low" | "Medium" | "High"; valuationHaircutPct: number; linkedAssumption?: keyof MetaValuationAssumptions }>;
  valuationHaircutPct: number;
  monitoringTriggers: string[];
};

export type MetaDcfOutput = {
  forecast: MetaForecastYear[];
  presentValueCashFlows: number;
  terminalValue: number;
  presentValueTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  terminalValueShareOfEv: number;
};

export type MetaValuationOutput = {
  dcf: MetaDcfOutput;
  fcfYieldFairValue: number;
  peFairValue: number;
  evEbitFairValue: number;
  sotpFairValue: number;
  blendedFairValue: number;
  probabilityWeightedFairValue: number;
  valuationRangeLow: number;
  valuationRangeHigh: number;
  normalizedFcf: number;
  forwardEps: number;
  forwardEbit: number;
  aiExcessReturnValuePerShare: number;
  aiPaybackYears: number;
  aiRoic: number;
  finalWeights: Record<string, number>;
  sourceIsolationWarnings: ValidationWarning[];
};

export type MetaMarketImpliedValuation = {
  currentPrice: number;
  currentMarketCap: number;
  currentEnterpriseValue: number;
  currentFcfYieldOnYearThree: number;
  currentForwardPe: number;
  currentForwardEvEbit: number;
  impliedTerminalGrowth: number | null;
  impliedRevenueCagr2027To2030: number | null;
  impliedFoaOperatingMargin: number | null;
  impliedAiRoic: number;
  impliedAiRoicSpread: number;
  verdict: "Market prices execution" | "Market prices disappointment" | "Market prices heroic execution";
  notes: string[];
};

export type MetaThesisBreakpoint = {
  id: string;
  driver: string;
  assumptionKey: keyof MetaValuationAssumptions;
  baseValue: number;
  breakValue: number | null;
  units: "percent" | "USD billions" | "multiple" | "USD/share";
  fairValueAtBreak: number | null;
  direction: "below" | "above";
  severity: "low" | "medium" | "high";
  thesisQuestion: string;
};

export type MetaValuationAttribution = {
  bridge: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total"; note: string }>;
  bearToBase: Array<{ driver: string; fairValueDelta: number; note: string }>;
  baseToBull: Array<{ driver: string; fairValueDelta: number; note: string }>;
};

export type MetaLineageAuditItem = {
  area: string;
  covered: number;
  total: number;
  coverage: number;
  manualSeedCount: number;
  lowConfidenceCount: number;
  notes: string;
};

export type MetaValuationIntegrityOutput = {
  overallIntegrityScore: number;
  dataLineageScore: number;
  assumptionQualityScore: number;
  valuationIsolationScore: number;
  marketImpliedScore: number;
  lineageAudit: MetaLineageAuditItem[];
  blindSpots: string[];
  severeWarnings: ValidationWarning[];
};

export type MetaEarningsCallTrendOutput = {
  quarters: MetaEarningsCallQuarter[];
  latestQuarter: MetaEarningsCallQuarter;
  focusTrendRows: Array<{ theme: string; firstHalfAverage: number; secondHalfAverage: number; change: number; direction: "rising" | "falling" | "stable"; interpretation: string }>;
  marketFocusTimeline: Array<{ quarter: string; primaryFocus: string; secondaryFocus: string; tone: MetaEarningsCallQuarter["managementTone"] }>;
  aiOverview: string;
  trendSummary: string[];
  quarterOptions: Array<{ value: string; label: string }>;
};

export type MetaScenarioDefinition = {
  scenario: Scenario;
  sourceStatus: "forecast_assumption";
  probabilityWeight: number;
  narrative: string;
  mappedDrivers: string[];
};
