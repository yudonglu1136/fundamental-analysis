import type { Scenario, ValuationAssumption } from "../types";

export type MsftAssumptions = {
  currentPrice: number;
  aiRevenueGrowth: number;
  aiMixShift: number;
  copilotArpu: number;
  aiUtilizationRate: number;
  aiMonetizationEfficiency: number;
  aiPriceCompression: number;
  aiInfrastructureCostLoad: number;
  aiProductUsageCost: number;
  azureEfficiencyGains: number;
  m365EfficiencyGains: number;
  aiCapexGrowth: number;
  aiDepreciationGrowth: number;
  depreciationSchedule: number;
  inferenceCostEfficiency: number;
  powerEfficiency: number;
  powerCoolingCostPct: number;
  networkingCostPct: number;
  copilotSeatGrowth: number;
  copilotStudioUsageGrowth: number;
  agentPlatformGrowth: number;
  taxRate: number;
  forwardEps: number;
  fy26EpsConsensus: number;
  fy27EpsConsensus: number;
  coreEpsExAiDilution: number;
  targetPe: number;
  aiRevenueCagr: number;
  aiRoic: number;
  fcfMargin: number;
  targetFcfYield: number;
  wacc: number;
  terminalGrowth: number;
  copilotAdoption: number;
  exitMultiple: number;
};

export const msftScenarioDefaults: Record<Scenario, MsftAssumptions> = {
  Bear: {
    currentPrice: 430,
    aiRevenueGrowth: 0.28,
    aiMixShift: 0.28,
    copilotArpu: 360,
    aiUtilizationRate: 0.52,
    aiMonetizationEfficiency: 0.5,
    aiPriceCompression: 0.08,
    aiInfrastructureCostLoad: 0.035,
    aiProductUsageCost: 0.011,
    azureEfficiencyGains: 0.008,
    m365EfficiencyGains: 0.004,
    aiCapexGrowth: 0.34,
    aiDepreciationGrowth: 0.4,
    depreciationSchedule: 0.34,
    inferenceCostEfficiency: 0.16,
    powerEfficiency: 0.08,
    powerCoolingCostPct: 0.13,
    networkingCostPct: 0.08,
    copilotSeatGrowth: 0.4,
    copilotStudioUsageGrowth: 0.5,
    agentPlatformGrowth: 0.65,
    taxRate: 0.18,
    forwardEps: 15.5,
    fy26EpsConsensus: 16,
    fy27EpsConsensus: 19,
    coreEpsExAiDilution: 14.4,
    targetPe: 24,
    aiRevenueCagr: 0.28,
    aiRoic: 0.065,
    fcfMargin: 0.27,
    targetFcfYield: 0.045,
    wacc: 0.09,
    terminalGrowth: 0.02,
    copilotAdoption: 0.12,
    exitMultiple: 26,
  },
  Base: {
    currentPrice: 430,
    aiRevenueGrowth: 0.38,
    aiMixShift: 0.34,
    copilotArpu: 420,
    aiUtilizationRate: 0.62,
    aiMonetizationEfficiency: 0.58,
    aiPriceCompression: 0.05,
    aiInfrastructureCostLoad: 0.028,
    aiProductUsageCost: 0.008,
    azureEfficiencyGains: 0.011,
    m365EfficiencyGains: 0.005,
    aiCapexGrowth: 0.28,
    aiDepreciationGrowth: 0.35,
    depreciationSchedule: 0.32,
    inferenceCostEfficiency: 0.22,
    powerEfficiency: 0.12,
    powerCoolingCostPct: 0.11,
    networkingCostPct: 0.07,
    copilotSeatGrowth: 0.58,
    copilotStudioUsageGrowth: 0.72,
    agentPlatformGrowth: 0.95,
    taxRate: 0.18,
    forwardEps: 16,
    fy26EpsConsensus: 16,
    fy27EpsConsensus: 19,
    coreEpsExAiDilution: 15.1,
    targetPe: 28,
    aiRevenueCagr: 0.38,
    aiRoic: 0.085,
    fcfMargin: 0.3,
    targetFcfYield: 0.038,
    wacc: 0.085,
    terminalGrowth: 0.025,
    copilotAdoption: 0.18,
    exitMultiple: 28,
  },
  Bull: {
    currentPrice: 430,
    aiRevenueGrowth: 0.48,
    aiMixShift: 0.42,
    copilotArpu: 500,
    aiUtilizationRate: 0.72,
    aiMonetizationEfficiency: 0.68,
    aiPriceCompression: 0.03,
    aiInfrastructureCostLoad: 0.023,
    aiProductUsageCost: 0.006,
    azureEfficiencyGains: 0.015,
    m365EfficiencyGains: 0.008,
    aiCapexGrowth: 0.2,
    aiDepreciationGrowth: 0.26,
    depreciationSchedule: 0.29,
    inferenceCostEfficiency: 0.3,
    powerEfficiency: 0.18,
    powerCoolingCostPct: 0.095,
    networkingCostPct: 0.06,
    copilotSeatGrowth: 0.8,
    copilotStudioUsageGrowth: 0.95,
    agentPlatformGrowth: 1.25,
    taxRate: 0.18,
    forwardEps: 16.7,
    fy26EpsConsensus: 16,
    fy27EpsConsensus: 19,
    coreEpsExAiDilution: 16.5,
    targetPe: 32,
    aiRevenueCagr: 0.48,
    aiRoic: 0.13,
    fcfMargin: 0.33,
    targetFcfYield: 0.032,
    wacc: 0.08,
    terminalGrowth: 0.03,
    copilotAdoption: 0.26,
    exitMultiple: 32,
  },
};

export const defaultMsftAssumptions = msftScenarioDefaults.Base;

export const msftAssumptionDefinitions: ValuationAssumption[] = [
  { key: "currentPrice", label: "Current Price", value: defaultMsftAssumptions.currentPrice, min: 250, max: 700, step: 1, format: "currency", source: "actual", description: "Current share price for fair value and upside/downside.", category: "Valuation" },
  { key: "aiRevenueGrowth", label: "AI Revenue Growth", value: defaultMsftAssumptions.aiRevenueGrowth, min: 0.1, max: 0.8, step: 0.01, format: "percent", source: "assumption", description: "Shorter-cycle AI revenue growth used by the scenario engines.", category: "Revenue" },
  { key: "aiMixShift", label: "AI Mix Shift", value: defaultMsftAssumptions.aiMixShift, min: 0.1, max: 0.6, step: 0.01, format: "percent", source: "assumption", description: "Higher mix shift means more AI revenue comes from software and agents rather than pure compute.", category: "Revenue" },
  { key: "copilotArpu", label: "Copilot ARPU", value: defaultMsftAssumptions.copilotArpu, min: 180, max: 800, step: 5, format: "currency", source: "consensus", description: "Average annual revenue per paid Copilot seat.", category: "Revenue" },
  { key: "aiUtilizationRate", label: "AI Utilization Rate", value: defaultMsftAssumptions.aiUtilizationRate, min: 0.3, max: 0.9, step: 0.01, format: "percent", source: "assumption", description: "Higher utilization spreads fixed AI infrastructure cost across more monetized demand.", category: "Revenue" },
  { key: "aiMonetizationEfficiency", label: "AI Monetization Efficiency", value: defaultMsftAssumptions.aiMonetizationEfficiency, min: 0.3, max: 0.9, step: 0.01, format: "percent", source: "derived", description: "Measures how efficiently AI demand turns into paid revenue.", category: "Revenue" },
  { key: "aiPriceCompression", label: "AI Price Compression", value: defaultMsftAssumptions.aiPriceCompression, min: 0, max: 0.15, step: 0.005, format: "percent", source: "assumption", description: "Pricing compression can offset demand growth if AI compute becomes commoditized.", category: "Revenue" },
  { key: "aiInfrastructureCostLoad", label: "AI Infrastructure Dilution", value: defaultMsftAssumptions.aiInfrastructureCostLoad, min: 0.01, max: 0.06, step: 0.001, format: "percent", source: "assumption", description: "Gross-margin drag from AI infrastructure deployment.", category: "Margins" },
  { key: "aiProductUsageCost", label: "AI Product Usage Dilution", value: defaultMsftAssumptions.aiProductUsageCost, min: 0.002, max: 0.02, step: 0.001, format: "percent", source: "assumption", description: "Usage cost drag from inference-heavy AI products.", category: "Margins" },
  { key: "azureEfficiencyGains", label: "Azure Efficiency Gains", value: defaultMsftAssumptions.azureEfficiencyGains, min: 0, max: 0.03, step: 0.001, format: "percent", source: "derived", description: "Operational leverage from better model serving and capacity planning.", category: "Margins" },
  { key: "m365EfficiencyGains", label: "M365 Efficiency Gains", value: defaultMsftAssumptions.m365EfficiencyGains, min: 0, max: 0.02, step: 0.001, format: "percent", source: "derived", description: "Productivity suite efficiency offsets AI cloud dilution.", category: "Margins" },
  { key: "aiCapexGrowth", label: "AI CapEx Growth", value: defaultMsftAssumptions.aiCapexGrowth, min: 0.05, max: 0.5, step: 0.01, format: "percent", source: "actual", description: "Growth rate in AI infrastructure capital deployment.", category: "CapEx" },
  { key: "aiDepreciationGrowth", label: "AI Depreciation Growth", value: defaultMsftAssumptions.aiDepreciationGrowth, min: 0.05, max: 0.5, step: 0.01, format: "percent", source: "derived", description: "How fast CapEx translates into depreciation burden.", category: "CapEx" },
  { key: "depreciationSchedule", label: "Depreciation Schedule", value: defaultMsftAssumptions.depreciationSchedule, min: 0.2, max: 0.45, step: 0.01, format: "percent", source: "assumption", description: "Simplified depreciation schedule for AI infrastructure.", category: "CapEx" },
  { key: "inferenceCostEfficiency", label: "Inference Cost Efficiency", value: defaultMsftAssumptions.inferenceCostEfficiency, min: 0.05, max: 0.4, step: 0.01, format: "percent", source: "derived", description: "Efficiency gain lowering AI inference cost over time.", category: "CapEx" },
  { key: "powerEfficiency", label: "Power Efficiency", value: defaultMsftAssumptions.powerEfficiency, min: 0.02, max: 0.3, step: 0.01, format: "percent", source: "derived", description: "Efficiency gain lowering power and cooling burden.", category: "CapEx" },
  { key: "powerCoolingCostPct", label: "Power / Cooling Cost", value: defaultMsftAssumptions.powerCoolingCostPct, min: 0.04, max: 0.18, step: 0.005, format: "percent", source: "assumption", description: "Energy and thermal burden associated with AI clusters.", category: "CapEx" },
  { key: "networkingCostPct", label: "Networking Cost", value: defaultMsftAssumptions.networkingCostPct, min: 0.03, max: 0.14, step: 0.005, format: "percent", source: "assumption", description: "Networking and interconnect cost as a share of AI investment.", category: "CapEx" },
  { key: "copilotSeatGrowth", label: "Copilot Seat Growth", value: defaultMsftAssumptions.copilotSeatGrowth, min: 0.1, max: 1.2, step: 0.01, format: "percent", source: "actual", description: "Paid seat growth is a key signal that AI is becoming software revenue rather than pure compute volume.", category: "Copilot & Agents" },
  { key: "copilotStudioUsageGrowth", label: "Copilot Studio Usage Growth", value: defaultMsftAssumptions.copilotStudioUsageGrowth, min: 0.1, max: 1.4, step: 0.01, format: "percent", source: "assumption", description: "Workflow automation and agent usage show platform transition progress.", category: "Copilot & Agents" },
  { key: "agentPlatformGrowth", label: "Agent Platform Growth", value: defaultMsftAssumptions.agentPlatformGrowth, min: 0.1, max: 1.8, step: 0.01, format: "percent", source: "assumption", description: "Growth in AI agent usage indicates a shift toward higher-value platform economics.", category: "Copilot & Agents" },
  { key: "taxRate", label: "Tax Rate", value: defaultMsftAssumptions.taxRate, min: 0.1, max: 0.3, step: 0.005, format: "percent", source: "actual", description: "Tax rate used for after-tax AI ROIC and value creation.", category: "Valuation" },
  { key: "forwardEps", label: "Forward EPS", value: defaultMsftAssumptions.forwardEps, min: 10, max: 24, step: 0.1, format: "currency", source: "consensus", description: "Near-term EPS anchor for valuation.", category: "Valuation" },
  { key: "fy26EpsConsensus", label: "FY26 EPS Consensus", value: defaultMsftAssumptions.fy26EpsConsensus, min: 10, max: 24, step: 0.1, format: "currency", source: "consensus", description: "Street FY26 EPS anchor.", category: "Valuation" },
  { key: "fy27EpsConsensus", label: "FY27 EPS Consensus", value: defaultMsftAssumptions.fy27EpsConsensus, min: 12, max: 28, step: 0.1, format: "currency", source: "consensus", description: "Street FY27 EPS anchor.", category: "Valuation" },
  { key: "coreEpsExAiDilution", label: "Core EPS ex AI Dilution", value: defaultMsftAssumptions.coreEpsExAiDilution, min: 9, max: 24, step: 0.1, format: "currency", source: "derived", description: "EPS power if AI margin dilution fades and Copilot monetization improves.", category: "Valuation" },
  { key: "targetPe", label: "Target P/E", value: defaultMsftAssumptions.targetPe, min: 18, max: 40, step: 0.1, format: "multiple", source: "consensus", description: "Forward multiple applied to Microsoft’s earnings power.", category: "Valuation" },
  { key: "aiRevenueCagr", label: "AI Revenue CAGR", value: defaultMsftAssumptions.aiRevenueCagr, min: 0.1, max: 0.7, step: 0.01, format: "percent", source: "assumption", description: "Longer-term growth in Azure AI, Copilot, and agent revenue streams.", category: "Valuation" },
  { key: "aiRoic", label: "Reference AI ROIC", value: defaultMsftAssumptions.aiRoic, min: 0.02, max: 0.2, step: 0.005, format: "percent", source: "derived", description: "Reference AI ROIC anchor; scenario engine now derives AI ROIC dynamically.", category: "Valuation" },
  { key: "fcfMargin", label: "FCF Margin", value: defaultMsftAssumptions.fcfMargin, min: 0.18, max: 0.42, step: 0.005, format: "percent", source: "actual", description: "Cash conversion after AI infrastructure build-out.", category: "Valuation" },
  { key: "targetFcfYield", label: "Target FCF Yield", value: defaultMsftAssumptions.targetFcfYield, min: 0.025, max: 0.055, step: 0.001, format: "percent", source: "assumption", description: "Target FCF yield for the FCF valuation method.", category: "Valuation" },
  { key: "wacc", label: "WACC", value: defaultMsftAssumptions.wacc, min: 0.06, max: 0.11, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for the AI-adjusted DCF.", category: "Valuation" },
  { key: "terminalGrowth", label: "Terminal Growth", value: defaultMsftAssumptions.terminalGrowth, min: 0.015, max: 0.05, step: 0.001, format: "percent", source: "assumption", description: "Long-run growth rate once AI economics mature.", category: "Valuation" },
  { key: "copilotAdoption", label: "Copilot Adoption", value: defaultMsftAssumptions.copilotAdoption, min: 0.05, max: 0.45, step: 0.01, format: "percent", source: "assumption", description: "Share of eligible enterprise users paying for Copilot workflows.", category: "Valuation" },
  { key: "exitMultiple", label: "Exit Multiple", value: defaultMsftAssumptions.exitMultiple, min: 18, max: 42, step: 0.1, format: "multiple", source: "assumption", description: "3-year exit multiple after AI monetization and ROIC visibility improve.", category: "Valuation" },
];

export const msftValuationAssumptionKeys = [
  "currentPrice",
  "forwardEps",
  "fy26EpsConsensus",
  "fy27EpsConsensus",
  "coreEpsExAiDilution",
  "targetPe",
  "aiRevenueCagr",
  "aiRoic",
  "fcfMargin",
  "targetFcfYield",
  "aiCapexGrowth",
  "wacc",
  "terminalGrowth",
  "copilotAdoption",
  "exitMultiple",
] as const;

export function getMsftScenarioDefaults(scenario: Scenario) {
  return msftScenarioDefaults[scenario];
}

export function matchMsftScenario(values: MsftAssumptions): Scenario | "Custom" {
  const scenarios = Object.entries(msftScenarioDefaults) as Array<[Scenario, MsftAssumptions]>;
  for (const [scenario, defaults] of scenarios) {
    const same = Object.keys(defaults).every((key) => Math.abs(values[key as keyof MsftAssumptions] - defaults[key as keyof MsftAssumptions]) < 0.0001);
    if (same) return scenario;
  }
  return "Custom";
}

export function pickMsftValuationAssumptions(values: Record<string, number>) {
  return Object.fromEntries(msftValuationAssumptionKeys.map((key) => [key, values[key]]));
}
