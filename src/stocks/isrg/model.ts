import type { Scenario, ValidationWarning } from "../types";

export type IsrgSourceType =
  | "official_ir"
  | "earnings_release"
  | "sec_filing"
  | "company_presentation"
  | "product_announcement"
  | "transcript"
  | "yfinance"
  | "market_snapshot"
  | "derived"
  | "assumption"
  | "manual_todo";

export type IsrgSourceConfidence = "high" | "medium" | "low" | "todo";
export type IsrgMetricUnit = "USDm" | "USD" | "percent" | "count" | "systems" | "procedures" | "shares_m" | "multiple" | "score" | "text";
export type IsrgSourceStatus =
  | "official_actual"
  | "management_guidance"
  | "forecast_assumption"
  | "research_only"
  | "market_data"
  | "derived"
  | "missing";

export type IsrgMetricSource = {
  sourceUrl: string | null;
  sourceType: IsrgSourceType;
  sourceStatus?: IsrgSourceStatus;
  publishedDate: string | null;
  retrievedAt: string;
  period: string;
  metricName: string;
  rawValue: string | number | null;
  normalizedValue: number | string | null;
  confidence: IsrgSourceConfidence;
  usedInValuation: boolean;
  researchOnly: boolean;
  notes: string;
};

export type IsrgMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: IsrgMetricUnit;
  source: IsrgMetricSource;
};

export type IsrgRevenueBreakdown = {
  instrumentsAccessories: IsrgMetric;
  systems: IsrgMetric;
  services: IsrgMetric;
  other?: IsrgMetric;
  total: IsrgMetric;
};

export type IsrgProcedureMetrics = {
  worldwideDaVinciProcedures: IsrgMetric;
  worldwideDaVinciProcedureGrowth: IsrgMetric;
  worldwideCombinedProcedureGrowth: IsrgMetric;
  usDaVinciProcedureGrowth: IsrgMetric;
  ousDaVinciProcedureGrowth: IsrgMetric;
  ionProcedureGrowth: IsrgMetric;
  procedureGrowthGuidanceLow?: IsrgMetric;
  procedureGrowthGuidanceHigh?: IsrgMetric;
  commentary: string;
};

export type IsrgInstalledBaseMetrics = {
  daVinciInstalledBase: IsrgMetric;
  ionInstalledBase: IsrgMetric;
  totalInstalledBase: IsrgMetric;
};

export type IsrgPlacementMetrics = {
  daVinciPlacements: IsrgMetric;
  daVinci5Placements: IsrgMetric;
  ionPlacements: IsrgMetric;
  spPlacements: IsrgMetric;
  operatingLeasePlacements: IsrgMetric;
  usageBasedLeasePlacements: IsrgMetric;
};

export type IsrgActualPeriod = {
  periodId: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4 | null;
  periodType: "FY" | "Q";
  periodEnd: string;
  sourceQuality: IsrgSourceConfidence;
  revenue: IsrgRevenueBreakdown;
  grossProfit: IsrgMetric;
  gaapGrossMargin: IsrgMetric;
  nonGaapGrossMargin: IsrgMetric;
  operatingIncome: IsrgMetric;
  nonGaapOperatingIncome: IsrgMetric;
  netIncome: IsrgMetric;
  dilutedEps: IsrgMetric;
  nonGaapEps: IsrgMetric;
  dilutedShares: IsrgMetric;
  cashInvestments: IsrgMetric;
  sbcExpense: IsrgMetric;
  buybackAmount: IsrgMetric;
  procedures: IsrgProcedureMetrics;
  installedBase: IsrgInstalledBaseMetrics;
  placements: IsrgPlacementMetrics;
};

export type IsrgGuidancePoint = {
  id: string;
  period: string;
  metric: string;
  low: number | null;
  high: number | null;
  midpoint: number | null;
  unit: IsrgMetricUnit;
  source: IsrgMetricSource;
};

export type IsrgForecastAnchor = {
  id: string;
  label: string;
  metricKey: string;
  value: number;
  unit: IsrgMetricUnit;
  source: IsrgMetricSource;
  driverMapping: string;
};

export type IsrgResearchSignal = {
  id: string;
  category:
    | "Moat"
    | "Procedure"
    | "da Vinci 5"
    | "Ion"
    | "SP"
    | "International"
    | "Competition"
    | "Margin"
    | "GLP-1"
    | "Capital Allocation"
    | "Valuation";
  title: string;
  score: number;
  direction: "positive" | "neutral" | "negative" | "mixed";
  evidence: string;
  source: IsrgMetricSource;
  valuationImpactAllowed: false;
};

export type IsrgProductEvent = {
  id: string;
  platform: "da Vinci 5" | "Ion" | "SP" | "Digital" | "Other";
  date: string;
  title: string;
  geography: string;
  status: "cleared" | "approved" | "launched" | "announced" | "research_only";
  description: string;
  features: string[];
  source: IsrgMetricSource;
  valuationImpactAllowed: false;
};

export type IsrgMoatFactor = {
  id: string;
  label: string;
  score: number;
  trend: "improving" | "stable" | "deteriorating" | "needs_review";
  evidence: string;
  source: IsrgMetricSource;
  confidence: IsrgSourceConfidence;
  valuationRelevant: boolean;
};

export type IsrgCompetitor = {
  id: string;
  name: string;
  productStatus: string;
  regulatoryStatus: string;
  targetProcedures: string;
  geography: string;
  commercializationMaturity: "early" | "ramping" | "scaled" | "unclear";
  likelyImpact: string;
  riskSeverity: "High" | "Medium" | "Low";
  timing: "Near term" | "Medium term" | "Long term" | "Unclear";
  source: IsrgMetricSource;
  researchOnly: true;
};

export type IsrgRiskRedTeamItem = {
  id: string;
  redFlag: string;
  evidence: string;
  source: IsrgMetricSource;
  severity: "High" | "Medium" | "Low";
  timeHorizon: "Next quarter" | "1-2 years" | "3-5 years" | "Long term";
  valuationImpact: string;
  monitorNextQuarter: string;
};

export type IsrgTranscriptTopic =
  | "Procedure growth"
  | "da Vinci 5"
  | "System placements"
  | "Lease mix"
  | "OUS growth"
  | "China"
  | "Ion"
  | "SP"
  | "Margins"
  | "Tariffs"
  | "Competition"
  | "GLP-1"
  | "Bariatric"
  | "Capital allocation"
  | "Guidance";

export type IsrgTranscriptEvent = {
  transcriptId: string;
  ticker: "ISRG";
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  callDate: string;
  sourceName: string;
  transcriptUrl: string | null;
  officialIrUrl: string | null;
  earningsReleaseUrl: string | null;
  status: "parsed" | "raw_fetched" | "manifest_only" | "missing_source" | "needs_review";
  sourceQuality: IsrgSourceConfidence;
  modelReady: false;
  valuationImpactAllowed: false;
  notes: string;
};

export type IsrgQaPair = {
  id: string;
  transcriptId: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  analystName: string;
  analystFirm: string;
  question: string;
  managementSpeaker: string;
  managementRole: string;
  answer: string;
  topicTags: IsrgTranscriptTopic[];
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  evidenceStrength: "high" | "medium" | "low";
  sourcePath: string;
  modelReady: false;
  valuationImpactAllowed: false;
  candidateOnly: true;
};

export type IsrgTopicTrendPoint = {
  periodId: string;
  fiscalYear: number;
  fiscalQuarter: number;
  topic: IsrgTranscriptTopic;
  mentions: number;
  preparedRemarkMentions: number;
  qaMentions: number;
  evidenceStrength: "high" | "medium" | "low";
};

export type IsrgQuarterFocusSnapshot = {
  periodId: string;
  label: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  callDate: string;
  primaryMarketFocus: string;
  aiSummary: string;
  bullBearRead: string;
  focusScores: Record<string, number>;
  sourceQuality: IsrgSourceConfidence;
  sourcePath: string;
  researchOnly: true;
  valuationImpactAllowed: false;
};

export type IsrgMarketData = {
  ticker: "ISRG";
  currentPrice: number;
  priceDate: string;
  marketCap: number | null;
  enterpriseValue: number | null;
  sharesOutstanding: number | null;
  beta: number | null;
  forwardPe: number | null;
  evSales: number | null;
  evEbit: number | null;
  fcfYield: number | null;
  source: IsrgMetricSource;
  notes: string;
};

export type IsrgDataLayer = {
  actualData: IsrgActualPeriod[];
  officialGuidance: IsrgGuidancePoint[];
  forecastAnchors: IsrgForecastAnchor[];
  transcriptInsights: {
    events: IsrgTranscriptEvent[];
    qaPairs: IsrgQaPair[];
    topicTrends: IsrgTopicTrendPoint[];
    quarterFocus?: IsrgQuarterFocusSnapshot[];
  };
  marketData: IsrgMarketData;
  researchOnlyData: {
    signals: IsrgResearchSignal[];
    productEvents: IsrgProductEvent[];
    moatFactors: IsrgMoatFactor[];
    competitors: IsrgCompetitor[];
    redTeam: IsrgRiskRedTeamItem[];
  };
  valuationInputs: {
    latestFullYearPeriodId: string;
    latestQuarterPeriodId: string;
    allowedSourceTypes: IsrgSourceType[];
    excludedSourceTypes: IsrgSourceType[];
    notes: string[];
  };
  sources: IsrgSourceRecord[];
  dataStatus: {
    lastUpdated: string;
    sourceNote: string;
    warnings: ValidationWarning[];
  };
};

export type IsrgSourceRecord = {
  id: string;
  label: string;
  url: string;
  sourceType: IsrgSourceType;
  sourceStatus?: IsrgSourceStatus;
  sourceConfidence: IsrgSourceConfidence;
  notes: string;
};

export type IsrgDataSourceAuditRecord = {
  id: string;
  url: string;
  sourceType: IsrgSourceType;
  sourceStatus: IsrgSourceStatus;
  reportingPeriod: string;
  downloadDate: string;
  blocked: boolean;
  parsedSuccessfully: boolean;
  manuallySeeded: boolean;
  usedInValuation: boolean;
  researchOnly: boolean;
  notes: string;
};

export type IsrgValuationAssumptions = {
  currentPrice: number;
  baseDaVinciInstalledBase: number;
  installedBaseCagr: number;
  procedureCagr: number;
  utilizationGrowth: number;
  revenuePerProcedureGrowth: number;
  systemPlacementCagr: number;
  systemAspGrowth: number;
  serviceRevenuePerSystemGrowth: number;
  daVinci5ReplacementCycleUplift: number;
  operatingMargin: number;
  fcfMargin: number;
  taxRate: number;
  wacc: number;
  terminalGrowth: number;
  targetPe: number;
  targetFcfYield: number;
  recurringRevenueMultiple: number;
  systemsRevenueMultiple: number;
  servicesRevenueMultiple: number;
  ionProbability: number;
  ionRevenueRamp: number;
  spProbability: number;
  spRevenueRamp: number;
  optionalityDeduplicationHaircut: number;
  competitionAspPressure: number;
  tariffGrossMarginDrag: number;
  marginCompression: number;
  netCash: number;
  dilutedShares: number;
  weightProcedureDcf: number;
  weightSegment: number;
  weightPe: number;
  weightFcfYield: number;
};

export type IsrgScenarioDefinition = {
  name: Scenario;
  summary: string;
  assumptions: Partial<IsrgValuationAssumptions>;
};

export type IsrgForecastYear = {
  year: number;
  installedBase: number;
  proceduresPerSystem: number;
  daVinciProcedures: number;
  revenuePerProcedure: number;
  instrumentsAccessoriesRevenue: number;
  systemPlacements: number;
  systemAsp: number;
  systemsRevenue: number;
  serviceRevenuePerSystem: number;
  servicesRevenue: number;
  totalRevenue: number;
  operatingIncome: number;
  freeCashFlow: number;
  discountFactor: number;
  presentValueFcf: number;
};

export type IsrgValuationMethod = {
  key: string;
  label: string;
  fairValue: number;
  enterpriseValue?: number;
  description: string;
};

export type IsrgSegmentQualityScore = {
  segment: "Instruments & Accessories" | "Systems" | "Services" | "Ion / SP Optionality";
  revenueRecurrence: number;
  marginDurability: number;
  cyclicality: number;
  pricingPower: number;
  competitiveIntensity: number;
  dataConfidence: number;
  overall: number;
};

export type IsrgReverseDcf = {
  requiredProcedureCagr: number;
  requiredUtilizationGrowth: number;
  requiredOperatingMargin: number;
  notes: string[];
};

export type IsrgScenarioOutput = {
  scenario: Scenario;
  revenueCagr: number;
  operatingMargin: number;
  fcfMargin: number;
  epsCagr: number;
  fairValue: number;
  impliedReturn: number;
  downsideRisk: number;
  upsideRisk: number;
  summary: string;
};

export type IsrgDashboardData = {
  latestActual: IsrgActualPeriod;
  latestFullYear: IsrgActualPeriod;
  actualData: IsrgActualPeriod[];
  officialGuidance: IsrgGuidancePoint[];
  marketData: IsrgMarketData;
  sources: IsrgSourceRecord[];
  dataStatus: IsrgDataLayer["dataStatus"];
  procedureEngine: ReturnType<typeof import("./procedureEngine").calculateProcedureEngine>;
  installedBaseEngine: ReturnType<typeof import("./installedBaseEngine").calculateInstalledBaseEngine>;
  recurringRevenueEngine: ReturnType<typeof import("./recurringRevenueEngine").calculateRecurringRevenueEngine>;
  daVinci5Engine: ReturnType<typeof import("./daVinci5Engine").calculateDaVinci5Engine>;
  ionEngine: ReturnType<typeof import("./ionEngine").calculateIonEngine>;
  spEngine: ReturnType<typeof import("./spEngine").calculateSpEngine>;
  internationalEngine: ReturnType<typeof import("./internationalExpansionEngine").calculateInternationalExpansionEngine>;
  hospitalCapexEngine: ReturnType<typeof import("./hospitalCapexEngine").calculateHospitalCapexEngine>;
  regulatorySafetyEngine: ReturnType<typeof import("./regulatorySafetyEngine").calculateRegulatorySafetyEngine>;
  competitionRiskEngine: ReturnType<typeof import("./competitionRiskEngine").calculateCompetitionRiskEngine>;
  marginRiskEngine: ReturnType<typeof import("./marginRiskEngine").calculateMarginRiskEngine>;
  moatEngine: ReturnType<typeof import("./moatEngine").calculateMoatEngine>;
  riskRedTeam: ReturnType<typeof import("./riskRedTeamEngine").calculateRiskRedTeamEngine>;
  transcript: ReturnType<typeof import("./transcriptEngine").calculateTranscriptEngine>;
  valuation: ReturnType<typeof import("./valuationEngine").calculateIsrgValuationEngine>;
  scenarios: IsrgScenarioOutput[];
  valuationWarnings: ValidationWarning[];
};
