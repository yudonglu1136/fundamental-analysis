import type { Scenario, Signal, ValidationWarning } from "../types";

export type AznSourceQuality = "official" | "filing" | "market_data" | "third_party" | "research_only";
export type AznPeriodType = "FY" | "Q";
export type AznRiskLevel = "Low" | "Medium" | "High";
export type AznPipelinePhase = "Phase 1" | "Phase 2" | "Phase 3" | "Registration" | "Approved / ramping";
export type AznRegion = "US" | "Europe" | "China" | "Japan" | "Emerging Markets" | "Established RoW" | "Global";
export type AznEarningsCallTopic =
  | "Revenue Momentum"
  | "Guidance"
  | "Oncology"
  | "Pipeline"
  | "Patent / LOE"
  | "China"
  | "Margins"
  | "Capital Allocation"
  | "Business Development";
export type AznTherapyArea =
  | "Oncology"
  | "CVRM"
  | "Respiratory & Immunology"
  | "Infectious Disease"
  | "Rare Disease"
  | "Other Medicines";

export type AznSourceEvidence = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  sourceQuality: AznSourceQuality;
  period: string;
  page?: string;
  excerpt: string;
  confidence: number;
  lastUpdated: string;
  valuationUseAllowed: boolean;
  researchOnly: boolean;
};

export type AznReportedPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: AznPeriodType;
  totalRevenue: number;
  productRevenue: number;
  productSales: number;
  allianceRevenue: number;
  collaborationRevenue: number;
  revenueGrowthActual: number;
  revenueGrowthCer: number;
  reportedEps: number;
  coreEps: number;
  reportedOperatingProfit: number;
  coreOperatingProfit: number;
  reportedOperatingMargin: number;
  coreOperatingMargin: number;
  grossMargin: number;
  coreGrossMargin: number;
  rdExpense: number;
  coreRdExpense: number;
  sgaExpense: number;
  coreSgaExpense: number;
  netOperatingCashFlow: number;
  capex: number;
  netDebt: number;
  dividendPerShare?: number;
  sourceEvidenceIds: string[];
};

export type AznTherapyAreaRevenue = {
  periodId: string;
  therapyArea: AznTherapyArea;
  revenue: number;
  yoyGrowthActual: number;
  yoyGrowthCer: number;
  percentageOfTotal: number;
  operatingMarginProxy?: number;
  keyProducts: string[];
  growthDrivers: string[];
  keyRisks: string[];
  sourceEvidenceIds: string[];
};

export type AznGeographyRevenue = {
  periodId: string;
  region: AznRegion;
  revenue: number;
  percentageOfTotal: number;
  yoyGrowthActual: number;
  yoyGrowthCer: number;
  sourceEvidenceIds: string[];
};

export type AznDrugRevenue = {
  periodId: string;
  drugName: string;
  therapyArea: AznTherapyArea;
  mechanism: string;
  indication: string;
  currentRevenue: number;
  revenueGrowthActual: number;
  revenueGrowthCer: number;
  marketPosition: string;
  competitiveRisk: AznRiskLevel;
  pricingRisk: AznRiskLevel;
  lifecycleExpansion: string;
  comboTherapyPotential: string;
  regionExposure: Record<AznRegion, number>;
  sourceEvidenceIds: string[];
};

export type AznDurabilityScore = {
  drugName: string;
  marketLeadershipScore: number;
  patentProtectionScore: number;
  indicationExpansionScore: number;
  competitiveMoatScore: number;
  pricingPowerScore: number;
  geographicDiversificationScore: number;
  durabilityScore: number;
  explanation: string;
};

export type AznPatentRisk = {
  product: string;
  therapyArea: AznTherapyArea;
  estimatedLoeYearByRegion: Partial<Record<AznRegion, string>>;
  revenueAtRisk: number;
  percentageOfTotalRevenue: number;
  genericBiosimilarRisk: AznRiskLevel;
  mitigationStrategy: string;
  lifecycleManagement: string;
  nextGenReplacementCandidate: string;
  confidenceLevel: "Low" | "Medium" | "High";
  sourceEvidenceIds: string[];
};

export type AznPipelineAsset = {
  assetName: string;
  modality: string;
  mechanism: string;
  therapyArea: AznTherapyArea;
  indication: string;
  phase: AznPipelinePhase;
  trialName: string;
  targetPopulation: string;
  peakSalesEstimate: number;
  probabilityOfSuccess: number;
  launchYearEstimate: number;
  patentLifeEstimate: number;
  regulatoryMilestone: string;
  nextCatalystDate: string;
  catalystType: string;
  riskLevel: AznRiskLevel;
  sourceQuality: AznSourceQuality;
  researchOnlyEstimate: boolean;
  sourceEvidenceIds: string[];
};

export type AznMarketData = {
  londonTicker: "AZN.L";
  londonPriceGbx: number;
  londonPriceGbp: number;
  nyseTicker: "AZN";
  nyseOrdinaryPriceUsd: number;
  gbpUsd: number;
  historicalAdrRatioOrdinarySharePerAdr: number;
  currentUsListingOrdinaryShareRatio: number;
  sharesOutstandingM: number;
  marketCapGbpM: number;
  marketCapUsdM: number;
  enterpriseValueUsdM: number;
  dividendPerShareUsd: number;
  dividendYield: number;
  priceDate: string;
  sourceName: string;
  sourceUrl: string;
  sourceQuality: AznSourceQuality;
  validationWarnings: ValidationWarning[];
};

export type AznGuidance = {
  period: string;
  totalRevenueGrowthCer: string;
  coreEpsGrowthCer: string;
  coreTaxRateRange: [number, number];
  dividendIntentPerShareUsd?: number;
  sourceEvidenceIds: string[];
};

export type AznEarningsCallEvent = {
  id: string;
  fiscalQuarter: string;
  label: string;
  eventDate: string;
  sequence: number;
  sourceUrl: string;
  sourceName: string;
  webcastReplayAvailable: boolean;
  transcriptImported: boolean;
  totalRevenue: number;
  totalRevenueGrowthCer: number;
  coreEps: number;
  coreEpsGrowthCer: number;
  guidanceTone: "Raised" | "Reaffirmed" | "Introduced" | "Softened";
  pipelineReadouts: number;
  approvals: number;
  managementMessages: string[];
  marketFocus: string[];
  analystQuestionThemes: string[];
  aiSummary: string;
  nextCallWatchlist: string[];
  topicScores: Record<AznEarningsCallTopic, number>;
  sourceEvidenceIds: string[];
  displayOnly: true;
  valuationImpactAllowed: false;
};

export type AznValuationAssumptions = {
  currentPriceGbp: number;
  gbpUsd: number;
  revenueCagr: number;
  terminalGrowth: number;
  operatingMargin: number;
  taxRate: number;
  reinvestmentRate: number;
  wacc: number;
  terminalRoic: number;
  fcfConversion: number;
  targetPipelineMargin: number;
  pipelineDiscountRate: number;
  oncologyRevenueMultiple: number;
  cvrmRevenueMultiple: number;
  respiratoryRevenueMultiple: number;
  rareDiseaseRevenueMultiple: number;
  infectiousDiseaseRevenueMultiple: number;
  otherRevenueMultiple: number;
  pipelineMultiple: number;
  netDebtUsdM: number;
  peerPeMultiple: number;
  dividendPerShareUsd: number;
  weightDcf: number;
  weightSotp: number;
  weightPipeline: number;
  weightMultiples: number;
};

export type AznScenarioDefinition = {
  name: Scenario;
  assumptions: AznValuationAssumptions;
};

export type AznPeerMultiple = {
  company: string;
  ticker: string;
  category: string;
  forwardPe: number;
  revenueGrowth: number;
  businessQualityAdjustment: number;
  sourceQuality: AznSourceQuality;
  sourceEvidenceIds: string[];
};

export type AznResearchEstimate = {
  id: string;
  label: string;
  value: number;
  unit: string;
  sourceQuality: "research_only";
  rationale: string;
  sourceEvidenceIds: string[];
};

export type AznDataset = {
  periods: AznReportedPeriod[];
  currentPeriodId: string;
  reportedData: {
    therapyAreas: AznTherapyAreaRevenue[];
    drugRevenue: AznDrugRevenue[];
    geographies: AznGeographyRevenue[];
  };
  guidanceData: AznGuidance[];
  earningsCallData: AznEarningsCallEvent[];
  marketData: AznMarketData;
  pipelineData: AznPipelineAsset[];
  patentRiskData: AznPatentRisk[];
  peers: AznPeerMultiple[];
  researchEstimates: AznResearchEstimate[];
  evidenceData: AznSourceEvidence[];
};

export type AznPipelineValue = AznPipelineAsset & {
  probabilityAdjustedPipelineValue: number;
  discountFactor: number;
  durationFactor: number;
};

export type AznValuationOutput = {
  dcfFairValueGbp: number;
  dcfFairValueUsd: number;
  sotpFairValueGbp: number;
  sotpFairValueUsd: number;
  pipelineFairValueGbp: number;
  pipelineFairValueUsd: number;
  multiplesFairValueGbp: number;
  multiplesFairValueUsd: number;
  blendedFairValueGbp: number;
  blendedFairValueUsd: number;
  formerAdrFairValueUsd: number;
  nyseOrdinaryFairValueUsd: number;
  impliedCagrReturn: number;
  dividendReinvestmentReturn: number;
  methodWeights: Record<string, number>;
  sensitivityTables: { title: string; table: Array<Array<string | number>> }[];
  warnings: ValidationWarning[];
};

export type AznDashboardData = {
  dataset: AznDataset;
  selectedPeriod: AznReportedPeriod;
  therapyAreaDashboard: ReturnType<typeof import("./engines/therapyAreaEngine").buildTherapyAreaDashboard>;
  drugDurability: ReturnType<typeof import("./engines/drugDurabilityEngine").buildDrugDurabilityMatrix>;
  earningsCall: ReturnType<typeof import("./engines/earningsCallEngine").buildAznEarningsCallIntelligence>;
  patentCliff: ReturnType<typeof import("./engines/patentCliffEngine").buildPatentCliffMonitor>;
  pipeline: ReturnType<typeof import("./engines/pipelineEngine").buildPipelineIntelligenceLab>;
  oncology: ReturnType<typeof import("./engines/oncologyEngine").buildOncologyEngine>;
  rareDisease: ReturnType<typeof import("./engines/rareDiseaseEngine").buildRareDiseaseEngine>;
  cvrm: ReturnType<typeof import("./engines/cvrmEngine").buildCvrmEngine>;
  china: ReturnType<typeof import("./engines/chinaExposureEngine").buildChinaExposureEngine>;
  financialQuality: ReturnType<typeof import("./engines/financialQualityEngine").buildFinancialQualityEngine>;
  valuation: AznValuationOutput;
  risks: ReturnType<typeof import("./engines/riskEngine").buildRiskRadar>;
  evidenceAudit: ReturnType<typeof import("./engines/evidenceEngine").buildEvidenceAudit>;
  thesisBoard: {
    bullCase: string;
    baseCase: string;
    bearCase: string;
    keyDebate: string;
    variantPerception: string;
    whatMarketMayBeMissing: string;
  };
  readThrough: Array<{ title: string; signal: Signal; detail: string }>;
};
