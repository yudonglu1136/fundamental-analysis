import type { Scenario, ValidationWarning } from "../types";

export type MsftSourceStatus =
  | "official_actual"
  | "management_guidance"
  | "management_commentary"
  | "market_data"
  | "research_only"
  | "scenario_assumption"
  | "derived"
  | "missing";

export type MsftSource = {
  id: string;
  title: string;
  url: string;
  publisher: "Microsoft" | "SEC" | "Analyst" | "Market data";
  sourceStatus: MsftSourceStatus;
  reportingPeriod?: string;
  publishedDate?: string;
  accessedDate: string;
  notes?: string;
};

export type MsftReportingSegment = "Productivity and Business Processes" | "Intelligent Cloud" | "More Personal Computing";

export type MsftFinancialPeriod = {
  id: string;
  label: string;
  fiscalYear: number;
  periodType: "annual" | "quarter" | "ytd" | "forecast";
  sourceStatus: "official_actual" | "management_guidance" | "derived";
  sourceId: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  grossMargin: number;
  operatingIncome: number;
  operatingMargin: number;
  netIncome?: number;
  dilutedEps?: number;
  dilutedShares?: number;
  operatingCashFlow?: number;
  capex?: number;
  freeCashFlow?: number;
  depreciationAmortizationAndOther?: number;
  stockBasedCompensation?: number;
  cashAndShortTermInvestments?: number;
  debt?: number;
  operatingLeaseLiabilities?: number;
  ppeNet?: number;
  dividendsPaid?: number;
  buybacks?: number;
  shareholderReturn?: number;
  notes: string;
};

export type MsftSegmentFinancial = {
  periodId: string;
  segment: MsftReportingSegment;
  sourceStatus: "official_actual" | "management_guidance";
  sourceId: string;
  revenue: number;
  costOfRevenue?: number;
  operatingExpenses?: number;
  operatingIncome: number;
  growth?: number;
  constantCurrencyGrowth?: number;
  operatingMargin?: number;
  grossMargin?: number;
  keyDrivers: string[];
  marginDebate: string;
  riskNotes: string[];
};

export type MsftCloudMetric = {
  periodId: string;
  label: string;
  sourceStatus: "official_actual";
  sourceId: string;
  microsoftCloudRevenue: number;
  microsoftCloudGrowth: number;
  microsoftCloudConstantCurrencyGrowth?: number;
  microsoftCloudGrossMargin: number;
  commercialRpo?: number;
  commercialBookingsGrowth?: number;
  azureGrowth?: number;
  azureConstantCurrencyGrowth?: number;
  m365CommercialCloudGrowth?: number;
  m365CommercialSeatGrowth?: number;
  linkedInGrowth?: number;
  dynamics365Growth?: number;
  searchExTacGrowth?: number;
  xboxContentServicesGrowth?: number;
  windowsOemDevicesGrowth?: number;
};

export type MsftEarningsFocusScores = {
  azureDemand: number;
  aiCapexFcf: number;
  cloudGrossMargin: number;
  copilotMonetization: number;
  openAiExposure: number;
  bookingsRpo: number;
  consumerGamingPc: number;
};

export type MsftEarningsCallQuarter = {
  id: string;
  label: string;
  fiscalQuarter: string;
  callDate: string;
  sourceStatus: "official_actual" | "management_commentary" | "research_only";
  metricsSourceId: string;
  transcriptSourceId: string;
  pressReleaseSourceId: string;
  microsoftCloudRevenue: number;
  microsoftCloudGrowth: number;
  microsoftCloudGrossMargin: number;
  azureGrowth: number;
  m365CommercialCloudGrowth: number;
  commercialRpo: number;
  commercialBookingsGrowth?: number;
  searchExTacGrowth?: number;
  windowsOemDevicesGrowth?: number;
  xboxContentServicesGrowth?: number;
  aiRevenueRunRate?: number;
  copilotPaidSeats?: number;
  keyReportedFacts: string[];
  managementTone: string;
  analystFocus: string[];
  marketFocusSummary: string;
  modelReadThrough: string;
  focusScores: MsftEarningsFocusScores;
};

export type MsftEarningsTrendSynthesis = {
  sourceStatus: "research_only";
  generatedBy: "AI synthesis";
  generatedAt: string;
  summary: string;
  phases: Array<{
    period: string;
    title: string;
    description: string;
  }>;
  focusTrend: Array<{
    theme: keyof MsftEarningsFocusScores;
    startScore: number;
    endScore: number;
    change: number;
    interpretation: string;
  }>;
};

export type MsftAiDisclosure = {
  id: string;
  label: string;
  sourceStatus: "management_commentary" | "management_guidance" | "official_actual" | "scenario_assumption" | "research_only";
  sourceId: string;
  metric?: number;
  unit?: "USDm" | "USDbn" | "percent" | "seats_m" | "years" | "text";
  detail: string;
  modelMapping: string;
};

export type MsftBusinessUnit = {
  id: string;
  name: string;
  sourceStatus: "research_only";
  revenuePool: string;
  moatScore: number;
  growthScore: number;
  marginScore: number;
  riskScore: number;
  strategicRole: string;
  keyKpis: string[];
  valuationMapping: "productivity_sotp" | "azure_sotp" | "consumer_sotp" | "ai_optionality" | "risk_discount";
};

export type MsftRiskItem = {
  id: string;
  title: string;
  sourceStatus: "research_only";
  probability: number;
  severity: number;
  detectability: number;
  affectedDriver: string;
  killCriterion: string;
  monitoringTrigger: string;
  mitigation: string;
};

export type MsftAiScenario = {
  scenario: Scenario;
  sourceStatus: "scenario_assumption";
  probability: number;
  azureGrowth: number;
  baseSoftwareGrowth: number;
  copilotPenetration: number;
  copilotArpuAnnual: number;
  copilotGrossMarginYear5: number;
  openAiRevenueContribution: number;
  openAiGrossMargin: number;
  aiCapexIntensity: number;
  longRunOperatingMargin: number;
  wacc: number;
  terminalGrowth: number;
  narrative: string;
};

export type MsftMarketData = {
  ticker: "MSFT";
  sourceStatus: "market_data";
  sourceId: string;
  currentPrice: number;
  priceDate: string;
  source: string;
  sharesForMarketCap: number;
  marketCap: number;
  notes: string;
};

export type MsftDataset = {
  company: "Microsoft Corporation";
  ticker: "MSFT";
  currency: "USD";
  reportingCurrency: "USD";
  units: "USDm unless noted";
  latestReportingPeriod: string;
  sources: MsftSource[];
  sourceMap: Record<string, MsftSource>;
  periods: MsftFinancialPeriod[];
  segments: MsftSegmentFinancial[];
  cloudMetrics: MsftCloudMetric[];
  earningsCalls: MsftEarningsCallQuarter[];
  earningsTrendSynthesis: MsftEarningsTrendSynthesis;
  aiDisclosures: MsftAiDisclosure[];
  businessUnits: MsftBusinessUnit[];
  risks: MsftRiskItem[];
  scenarios: MsftAiScenario[];
  marketData: MsftMarketData;
};

export type MsftValuationAssumptions = {
  currentPrice: number;
  baseSoftwareGrowth: number;
  azureGrowth: number;
  copilotPenetration: number;
  copilotArpuAnnual: number;
  copilotGrossMarginYear5: number;
  openAiRevenueContribution: number;
  openAiGrossMargin: number;
  aiCapexIntensity: number;
  normalizedCapexIntensity: number;
  operatingMargin: number;
  taxRate: number;
  depreciationSalesRatio: number;
  workingCapitalDragPctRevenueGrowth: number;
  wacc: number;
  terminalGrowth: number;
  targetFcfYield: number;
  targetPe: number;
  targetEvEbit: number;
  productivitySalesMultiple: number;
  azureSalesMultiple: number;
  windowsSearchGamingSalesMultiple: number;
  aiOptionalityValue: number;
  netCashDebt: number;
  dilutedShares: number;
  dividendPerShare: number;
  weightDcf: number;
  weightFcfYield: number;
  weightPe: number;
  weightEvEbit: number;
  weightSotp: number;
  weightAiOptionality: number;
};

export type MsftSegmentEngineRow = MsftSegmentFinancial & {
  revenueShare: number;
  operatingIncomeShare: number;
  calculatedOperatingMargin: number;
  qualityScore: number;
};

export type MsftValuationForecastYear = {
  year: number;
  revenue: number;
  productivityRevenue: number;
  intelligentCloudRevenue: number;
  consumerRevenue: number;
  copilotRevenue: number;
  openAiScenarioRevenue: number;
  operatingIncome: number;
  nopat: number;
  depreciation: number;
  capex: number;
  workingCapitalInvestment: number;
  unleveredFcf: number;
  operatingMargin: number;
  capexIntensity: number;
};

export type MsftDcfOutput = {
  forecast: MsftValuationForecastYear[];
  presentValueCashFlows: number;
  terminalValue: number;
  presentValueTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  terminalValueShareOfEv: number;
};

export type MsftValuationEngineOutput = {
  dcf: MsftDcfOutput;
  fcfYieldFairValue: number;
  peFairValue: number;
  evEbitFairValue: number;
  sotpFairValue: number;
  aiOptionalityFairValue: number;
  blendedFairValue: number;
  probabilityWeightedFairValue: number;
  valuationRangeLow: number;
  valuationRangeHigh: number;
  finalWeights: Record<string, number>;
  scenarioValues: Array<{ scenario: Scenario; probability: number; value: number }>;
  normalizedFcf: number;
  forwardEps: number;
  forwardEbit: number;
  warnings: ValidationWarning[];
};
