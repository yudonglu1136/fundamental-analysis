import type { DataSourceType, Scenario, Signal, ValidationWarning } from "../types";

export type LegnEvidenceSourceType =
  | "official_press_release"
  | "SEC_20F"
  | "SEC_6K"
  | "FDA_label"
  | "FDA_review"
  | "clinicaltrials"
  | "conference_abstract"
  | "publication"
  | "transcript"
  | "market_data"
  | "research_assumption";

export type LegnEvidenceConfidence = "high" | "medium" | "low";
export type LegnPeriodType = "FY" | "Q";
export type LegnRegion = "US" | "OUS" | "Global";
export type LegnLineOfTherapy = "2L-4L" | "5L+" | "frontline" | "transplant_eligible_frontline" | "transplant_not_planned_frontline";
export type LegnScenarioKey = Lowercase<Scenario>;
export type LegnSourceQuality = "official" | "filing" | "clinical" | "transcript" | "market_data" | "research_only" | "derived";
export type LegnPipelinePhase = "Approved" | "Phase 3" | "Phase 2" | "Phase 1" | "Preclinical" | "Discovery" | "IIT / early POC";
export type LegnModality =
  | "autologous CAR-T"
  | "allogeneic CAR-T"
  | "in vivo CAR-T"
  | "CAR-NK"
  | "autoimmune"
  | "cell therapy platform";
export type LegnOptionalityType = "core" | "near_adjacent" | "long_dated_option" | "platform_option";
export type LegnModelImpact = "commercialBase" | "labelExpansion" | "pipelineOption" | "riskOnly";

export type LegnEvidenceRecord = {
  id: string;
  sourceTitle: string;
  sourceType: LegnEvidenceSourceType;
  date: string;
  url?: string;
  localPath?: string;
  quote: string;
  extractedMetric?: string;
  confidence: LegnEvidenceConfidence;
  usedInModel: boolean;
  notes: string;
};

export type LegnMetricEvidence = {
  value: number;
  unit: string;
  sourceEvidenceIds: string[];
  sourceQuality: LegnSourceQuality;
  researchOnly?: boolean;
};

export type LegnReportedPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: LegnPeriodType;
  totalRevenue: number;
  collaborationRevenue: number;
  licenseAndOtherRevenue: number;
  costOfCollaborationRevenue: number;
  costOfLicenseAndOtherRevenue: number;
  rdExpense: number;
  sellingAndDistributionExpense: number;
  generalAndAdministrativeExpense: number;
  operatingLoss: number;
  adjustedNetIncomeLoss?: number;
  netLoss?: number;
  cashAndEquivalents: number;
  timeDeposits: number;
  cashAndTimeDeposits: number;
  collaborationAdvancedFunding: number;
  ordinarySharesOutstandingM: number;
  adsOutstandingM: number;
  sbcExpense?: number;
  operatingCashFlow?: number;
  capex?: number;
  collaborationAssetInvestment?: number;
  netCashAfterFunding: number;
  sourceEvidenceIds: string[];
};

export type LegnCarvyktiQuarter = {
  id: string;
  label: string;
  periodEnd: string;
  globalNetTradeSales: number;
  usSales?: number;
  ousSales?: number;
  yoyGrowth?: number;
  qoqGrowth?: number;
  preliminary: boolean;
  unverified: boolean;
  isLegendReportedRevenue: false;
  treatmentSites?: number;
  usAtcCount?: number;
  communityHospitalPercentage?: number;
  earlierLineUtilization?: number;
  patientTreatedCumulative?: number;
  launchMarkets?: number;
  manufacturingCapacityAnnualDoses?: number;
  manufacturingSuccessRate?: number;
  outOfSpecRate?: number;
  veinToVeinDays?: number;
  apheresisToReleaseDays?: number;
  sourceEvidenceIds: string[];
};

export type LegnCollaborationTerm = {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  sourceQuality: LegnSourceQuality;
  researchOnly: boolean;
  sourceEvidenceIds: string[];
};

export type LegnCollaborationEconomicsBridge = {
  ntsToCollaborationRevenueRatio: number;
  costOfCollaborationRevenueRatio: number;
  sellingDistributionRatio: number;
  bcmaClinicalRdBurdenRatio: number;
  statedProfitShareExChina: number;
  statedProfitShareGreaterChina: number;
  fundingAdvanceBalance: number;
  fundingAdvanceInterestRate: number;
  sourceEvidenceIds: string[];
};

export type LegnClinicalTrial = {
  trialName: string;
  nct: string;
  phase: LegnPipelinePhase;
  indication: string;
  lineOfTherapy: string;
  comparator: string;
  endpoints: string[];
  orr?: number;
  crScr?: number;
  mrdNegativity?: number;
  pfs?: string;
  os?: string;
  dor?: string;
  safety: {
    crs?: number;
    grade3Crs?: number;
    icans?: number;
    grade3Icans?: number;
    iecEc?: string;
    secondaryMalignancy?: string;
    neurotoxicity?: string;
    infections?: string;
    deaths?: string;
    giToxicity?: string;
  };
  followUpDurationMonths?: number;
  evidenceLevel: "registrational" | "randomized_phase_3" | "single_arm" | "early_signal" | "preclinical";
  regulatoryStatus: string;
  modelImpact: LegnModelImpact;
  sourceEvidenceIds: string[];
};

export type LegnPipelineAsset = {
  assetName: string;
  modality: LegnModality;
  target: string;
  indication: string;
  phase: LegnPipelinePhase;
  partner: string;
  source: string;
  estimatedLaunchYear: number;
  estimatedPeakSales: number;
  probabilityOfSuccess: number;
  discountRate: number;
  developmentCostRemaining: number;
  commercialRights: string;
  optionalityType: LegnOptionalityType;
  evidenceScore: number;
  riskScore: number;
  researchOnly: true;
  sourceEvidenceIds: string[];
};

export type LegnPublicationRecord = {
  id: string;
  title: string;
  venue: string;
  date: string;
  assetOrTrial: string;
  evidenceType: "publication" | "conference" | "regulatory";
  keyFinding: string;
  sourceEvidenceIds: string[];
};

export type LegnEarningsCallQuarter = {
  id: string;
  label: string;
  fiscalQuarter: string;
  callDate: string;
  carvyktiNts: number;
  collaborationRevenue: number;
  costOfCollaborationRevenue: number;
  cashAndInvestments: number;
  patientsTreated?: number;
  treatmentSites?: number;
  launchMarkets?: number;
  managementTone: "execution" | "capacity" | "clinical_moat" | "profitability" | "optionality";
  marketFocus: Array<{
    topic:
      | "launch_ramp"
      | "capacity"
      | "earlier_line"
      | "profitability"
      | "ous_expansion"
      | "safety"
      | "competition"
      | "pipeline_option"
      | "collaboration_economics";
    intensity: number;
    summary: string;
  }>;
  analystQuestions: string[];
  aiSummary: string;
  sourceEvidenceIds: string[];
};

export type LegnEarningsCallTrendOutput = {
  quarters: LegnEarningsCallQuarter[];
  selectedQuarter: LegnEarningsCallQuarter;
  topicTrendRows: Array<{
    topic: LegnEarningsCallQuarter["marketFocus"][number]["topic"];
    label: string;
    direction: "rising" | "falling" | "stable" | "volatile";
    latestIntensity: number;
    eightQuarterAverage: number;
    aiSynthesis: string;
  }>;
  overview: {
    aiTrendSummary: string;
    phaseShift: string;
    investorDebateNow: string;
    fadingDebates: string[];
    risingDebates: string[];
  };
  explainability: LegnExplainability;
};

export type LegnMarketData = {
  ticker: "LEGN";
  listing: "NASDAQ ADS";
  currentPrice: number;
  priceDate: string;
  currency: "USD";
  ordinarySharesPerAds: 2;
  ordinarySharesOutstandingM: number;
  adsOutstandingM: number;
  marketCapUsdM: number;
  enterpriseValueUsdM: number;
  cashAndTimeDepositsUsdM: number;
  collaborationFundingUsdM: number;
  netCashAfterFundingUsdM: number;
  sourceName: string;
  sourceUrl: string;
  sourceQuality: LegnSourceQuality;
  validationWarnings: ValidationWarning[];
};

export type LegnCommercialScenario = {
  scenario: Scenario;
  eligiblePopulation: Record<LegnRegion, number>;
  diagnosisRate: Record<LegnRegion, number>;
  lineEligibility: Record<LegnLineOfTherapy, number>;
  referralRate: Record<LegnRegion, number>;
  carTAdoption: Record<LegnLineOfTherapy, number>;
  carvyktiShare: Record<LegnLineOfTherapy, number>;
  manufacturingSuccess: number;
  treatmentCompletion: number;
  activeTreatmentCenters: Record<LegnRegion, number>;
  patientsPerCenter: Record<LegnRegion, number>;
  utilization: Record<LegnRegion, number>;
  communityExpansionMultiplier: number;
  netPrice: Record<LegnRegion, number>;
  grossToNet: Record<LegnRegion, number>;
  approvedPeakNts: number;
  approvedPeakYear: number;
  includeFrontlineInBase: boolean;
  sourceEvidenceIds: string[];
};

export type LegnManufacturingAssumptions = {
  scenario: Scenario;
  annualDoseCapacity: number;
  targetAnnualDoseCapacity: number;
  treatmentSiteCount: number;
  averagePatientsPerSiteYear: number;
  atcVsCommunityMix: {
    academicAtc: number;
    communityAndRegional: number;
  };
  outOfSpecRate: number;
  manufacturingSuccessRate: number;
  releaseTimeDays: number;
  cogsAsPctNts: number;
  scaleCogsImprovement: number;
  sourceEvidenceIds: string[];
};

export type LegnResearchAssumptionRecord = {
  id: string;
  label: string;
  value: number | string | boolean;
  unit: string;
  category: string;
  scenario?: Scenario;
  sourceQuality: "research_only";
  sourceEvidenceIds: string[];
  rationale: string;
};

export type LegnValuationAssumptions = {
  currentPrice: number;
  approvedPeakNts: number;
  ntsToLegendRevenueRatio: number;
  productDiscountRate: number;
  labelExpansionProbabilityScalar: number;
  platformOptionScalar: number;
  bearDilutionUsdM: number;
};

export type LegnExplainability = {
  summary: string;
  formula: string;
  evidenceIds: string[];
  keyAssumptions: string[];
};

export type LegnAnnualCommercialForecast = {
  year: number;
  usNts: number;
  ousNts: number;
  globalNts: number;
  nts2L4L: number;
  nts5LPlus: number;
  ntsFrontline: number;
  demandConstrainedNts: number;
  capacityConstrainedNts: number;
  activeTreatmentCenters: number;
  estimatedPatientsTreated: number;
  capacityUtilization: number;
  carvyktiShare: number;
};

export type LegnCommercialEngineOutput = {
  scenario: Scenario;
  quarterlyNts: LegnCarvyktiQuarter[];
  annualForecast: LegnAnnualCommercialForecast[];
  patientFunnel: Array<{ label: string; value: number; conversion: number; evidenceIds: string[] }>;
  siteFunnel: Array<{ label: string; value: number; evidenceIds: string[] }>;
  peakNts: number;
  timeToPeak: number;
  growthFade: number;
  marketShareAtPeak: number;
  explainability: LegnExplainability;
};

export type LegnManufacturingCapacityOutput = {
  scenario: Scenario;
  annualRows: Array<{
    year: number;
    annualDoseCapacity: number;
    treatmentSiteCount: number;
    demandDoses: number;
    feasibleDoses: number;
    bottleneckScore: number;
    demandConstrainedRevenue: number;
    capacityConstrainedRevenue: number;
    marginImpact: number;
  }>;
  currentSuccessRate: number;
  currentOutOfSpecRate: number;
  bottleneckScore: number;
  explainability: LegnExplainability;
};

export type LegnCollaborationEconomicsOutput = {
  scenario: Scenario;
  rows: Array<{
    year: number;
    carvyktiNts: number;
    legendCollaborationRevenue: number;
    legendGrossProfitContribution: number;
    costOfCollaborationRevenue: number;
    sellingDistributionBurden: number;
    bcmaClinicalRdBurden: number;
    recoupmentOfJanssenAdvances: number;
    operatingProfitContribution: number;
    cashContribution: number;
    margin: number;
  }>;
  sensitivity: Array<{ label: string; bear: number; base: number; bull: number }>;
  bridge: LegnCollaborationEconomicsBridge;
  explainability: LegnExplainability;
};

export type LegnLabelExpansionOutput = {
  scenario: Scenario;
  expansions: Array<{
    trialName: string;
    nct: string;
    currentApprovedLabel: string;
    potentialLabel: string;
    probability: number;
    timing: number;
    eligiblePatientPool: number;
    adoptionCurve: number[];
    cannibalization: number;
    peakNtsImpact: number;
    riskAdjustedPeakNtsImpact: number;
    navUsdM: number;
    safetyRegulatoryRiskAdjustment: number;
    sourceEvidenceIds: string[];
  }>;
  totalNavUsdM: number;
  doubleCountGuardrail: {
    frontlineIncludedInBase: boolean;
    warning: string | null;
  };
  explainability: LegnExplainability;
};

export type LegnClinicalEvidenceOutput = {
  trials: LegnClinicalTrial[];
  clinicalEvidenceScore: number;
  durabilityScore: number;
  safetyPenalty: number;
  evidenceMaturityScore: number;
  readoutCatalystTimeline: Array<{ date: string; catalyst: string; impact: LegnModelImpact; evidenceIds: string[] }>;
  explainability: LegnExplainability;
};

export type LegnSolidTumorCartOutput = {
  assets: Array<{
    assetName: string;
    scientificRiskScore: number;
    targetValidationScore: number;
    earlySignalScore: number;
    toxicityMitigationScore: number;
    competitiveIntensityScore: number;
    optionValueRange: [number, number];
    notInCoreBaseCase: true;
    sourceEvidenceIds: string[];
  }>;
  totalProbabilityWeightedOptionValue: number;
  explainability: LegnExplainability;
};

export type LegnPipelineRnpvOutput = {
  assets: Array<LegnPipelineAsset & {
    unadjustedPeakSales: number;
    unadjustedNpv: number;
    probabilityAdjustedRnpv: number;
    valuePerAds: number;
    sourceTrace: string[];
  }>;
  totalRnpvUsdM: number;
  valuePerAds: number;
  explainability: LegnExplainability;
};

export type LegnPlatformOptionOutput = {
  platformReadinessScore: number;
  modalityRiskScore: number;
  partnershipPotentialScore: number;
  strategicValueScore: number;
  comparableTransactionValueRange: [number, number];
  probabilityWeightedOptionValue: number;
  speculative: true;
  explainability: LegnExplainability;
};

export type LegnRiskOutput = {
  aggregateRiskScore: number;
  risks: Array<{
    id: string;
    category: string;
    title: string;
    probability: number;
    severity: number;
    detectability: number;
    timeToMaterialize: string;
    mitigation: string;
    killCriteria: string;
    sourceEvidenceIds: string[];
  }>;
  heatmap: Array<{ risk: string; score: number; signal: Signal }>;
  monitoringPlan: Array<{ metric: string; threshold: string; action: string; evidenceIds: string[] }>;
  explainability: LegnExplainability;
};

export type LegnValuationOutput = {
  scenario: Scenario;
  currentPrice: number;
  fairValuePerAds: number;
  coreCarvyktiNavPerAds: number;
  labelExpansionNavPerAds: number;
  pipelineRnpvPerAds: number;
  platformOptionValuePerAds: number;
  netCashFundingAdjustmentPerAds: number;
  dilutionAdjustmentPerAds: number;
  marginOfSafety: number;
  peakCarvyktiNts: number;
  impliedCarvyktiPeakSalesInCurrentPrice: number;
  impliedProbabilityOfSolidTumorSuccess: number;
  navStack: Array<{ label: string; valuePerAds: number; valueUsdM: number; quality: LegnSourceQuality }>;
  keyAssumptions: Array<{ label: string; value: number | string; sourceQuality: LegnSourceQuality; evidenceIds: string[] }>;
  sensitivityHeatmap: Array<Array<string | number>>;
  crossChecks: Array<{ label: string; value: number; unit: string; note: string }>;
  doubleCountGuardrail: LegnLabelExpansionOutput["doubleCountGuardrail"];
  warnings: ValidationWarning[];
  explainability: LegnExplainability;
};

export type LegnDataset = {
  currentPeriodId: string;
  reportedPeriods: LegnReportedPeriod[];
  carvyktiQuarters: LegnCarvyktiQuarter[];
  collaborationTerms: LegnCollaborationTerm[];
  collaborationEconomicsBridge: LegnCollaborationEconomicsBridge;
  clinicalTrials: LegnClinicalTrial[];
  pipelineAssets: LegnPipelineAsset[];
  publications: LegnPublicationRecord[];
  earningsCalls: LegnEarningsCallQuarter[];
  marketData: LegnMarketData;
  assumptions: {
    commercialScenarios: Record<Scenario, LegnCommercialScenario>;
    manufacturingScenarios: Record<Scenario, LegnManufacturingAssumptions>;
    researchAssumptions: LegnResearchAssumptionRecord[];
  };
  evidence: LegnEvidenceRecord[];
};

export type LegnDashboardData = {
  dataset: LegnDataset;
  selectedPeriod: LegnReportedPeriod;
  scenario: Scenario;
  commercial: LegnCommercialEngineOutput;
  collaboration: LegnCollaborationEconomicsOutput;
  manufacturing: LegnManufacturingCapacityOutput;
  labelExpansion: LegnLabelExpansionOutput;
  clinical: LegnClinicalEvidenceOutput;
  earningsCallTrend: LegnEarningsCallTrendOutput;
  solidTumor: LegnSolidTumorCartOutput;
  pipelineRnpv: LegnPipelineRnpvOutput;
  platformOption: LegnPlatformOptionOutput;
  risks: LegnRiskOutput;
  valuation: LegnValuationOutput;
  dataStatus: {
    sourceType: DataSourceType;
    lastUpdated: string;
    missingFields: string[];
    validationWarnings: ValidationWarning[];
    valuationReliable: boolean;
  };
  thesis: {
    onePage: string;
    topDrivers: string[];
    keyRisks: string[];
    nextCatalysts: string[];
  };
};
