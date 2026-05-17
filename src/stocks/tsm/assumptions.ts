import type { ValuationAssumption, ValuationScenario } from "../types";
import type { TsmScenarioPresetMap, TsmValuationAssumptions } from "./model";

export type { TsmValuationAssumptions } from "./model";

export const defaultTsmValuationAssumptions: TsmValuationAssumptions = {
  currentPrice: 414.15,
  adrEquivalentShares: 5_186,
  netCashUsd: 55_000,
  revenueGrowth: 0.19,
  hpcGrowth: 0.32,
  advancedNodeMix: 0.70,
  grossMargin: 0.63,
  operatingMargin: 0.55,
  normalizedFcfMargin: 0.34,
  capexIntensity: 0.36,
  targetFcfYield: 0.035,
  targetPe: 28,
  evEbitMultiple: 21,
  leadingEdgeRevenueMultiple: 11,
  matureNodeRevenueMultiple: 4,
  discountRate: 0.095,
  terminalGrowth: 0.035,
  customerConcentrationHaircut: 0.04,
  geopoliticsHaircut: 0.11,
  aiCycleHaircut: 0.05,
  localizationCostDrag: 0.025,
};

export const tsmScenarioPresets: TsmScenarioPresetMap = {
  Bear: {
    ...defaultTsmValuationAssumptions,
    revenueGrowth: 0.08,
    hpcGrowth: 0.15,
    advancedNodeMix: 0.64,
    grossMargin: 0.56,
    operatingMargin: 0.47,
    normalizedFcfMargin: 0.24,
    capexIntensity: 0.42,
    targetFcfYield: 0.055,
    targetPe: 20,
    evEbitMultiple: 15,
    leadingEdgeRevenueMultiple: 7,
    matureNodeRevenueMultiple: 2.5,
    discountRate: 0.112,
    terminalGrowth: 0.025,
    customerConcentrationHaircut: 0.08,
    geopoliticsHaircut: 0.18,
    aiCycleHaircut: 0.14,
    localizationCostDrag: 0.045,
  },
  Base: defaultTsmValuationAssumptions,
  Bull: {
    ...defaultTsmValuationAssumptions,
    revenueGrowth: 0.27,
    hpcGrowth: 0.43,
    advancedNodeMix: 0.76,
    grossMargin: 0.66,
    operatingMargin: 0.585,
    normalizedFcfMargin: 0.39,
    capexIntensity: 0.34,
    targetFcfYield: 0.029,
    targetPe: 34,
    evEbitMultiple: 26,
    leadingEdgeRevenueMultiple: 14,
    matureNodeRevenueMultiple: 5,
    discountRate: 0.087,
    terminalGrowth: 0.04,
    customerConcentrationHaircut: 0.03,
    geopoliticsHaircut: 0.08,
    aiCycleHaircut: 0.025,
    localizationCostDrag: 0.015,
  },
};

function assumption(
  key: keyof TsmValuationAssumptions,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  format: ValuationAssumption["format"],
  category: string,
  description: string,
): ValuationAssumption {
  return {
    key,
    label,
    value,
    min,
    max,
    step,
    format,
    source: "assumption",
    description,
    category,
  };
}

export const tsmValuationAssumptionDefinitions: ValuationAssumption[] = [
  assumption("currentPrice", "Current ADR Price", defaultTsmValuationAssumptions.currentPrice, 50, 700, 1, "currency", "Market", "Editable ADR price used for upside/downside."),
  assumption("revenueGrowth", "Revenue Growth", defaultTsmValuationAssumptions.revenueGrowth, -0.05, 0.45, 0.005, "percent", "Growth", "Forward revenue growth after the Q1 2026/Q2 guidance baseline."),
  assumption("hpcGrowth", "HPC Growth", defaultTsmValuationAssumptions.hpcGrowth, -0.05, 0.65, 0.005, "percent", "AI / HPC", "HPC and AI accelerator wafer demand growth."),
  assumption("advancedNodeMix", "Advanced Node Mix", defaultTsmValuationAssumptions.advancedNodeMix, 0.35, 0.88, 0.005, "percent", "Technology Mix", "Share of wafer revenue from 7nm and beyond."),
  assumption("grossMargin", "Gross Margin", defaultTsmValuationAssumptions.grossMargin, 0.42, 0.72, 0.005, "percent", "Margins", "Normalized gross margin after N2 ramp, overseas fabs and advanced packaging economics."),
  assumption("operatingMargin", "Operating Margin", defaultTsmValuationAssumptions.operatingMargin, 0.30, 0.66, 0.005, "percent", "Margins", "Operating profit margin after R&D and global fab cost drag."),
  assumption("normalizedFcfMargin", "FCF Margin", defaultTsmValuationAssumptions.normalizedFcfMargin, 0.10, 0.50, 0.005, "percent", "Cash Flow", "Normalized FCF margin after capex intensity."),
  assumption("capexIntensity", "Capex / Revenue", defaultTsmValuationAssumptions.capexIntensity, 0.18, 0.55, 0.005, "percent", "Capital Cycle", "Capex intensity needed to fund advanced nodes, CoWoS and global fabs."),
  assumption("targetFcfYield", "Target FCF Yield", defaultTsmValuationAssumptions.targetFcfYield, 0.02, 0.09, 0.001, "percent", "Multiple", "FCF yield used for the FCF capitalization method."),
  assumption("targetPe", "Target P/E", defaultTsmValuationAssumptions.targetPe, 10, 45, 1, "multiple", "Multiple", "Normalized P/E on ADR-equivalent earnings power."),
  assumption("evEbitMultiple", "EV / EBIT", defaultTsmValuationAssumptions.evEbitMultiple, 8, 35, 0.5, "multiple", "Multiple", "EV/EBIT multiple for foundry operating profit power."),
  assumption("geopoliticsHaircut", "Geopolitics Haircut", defaultTsmValuationAssumptions.geopoliticsHaircut, 0, 0.35, 0.005, "percent", "Risk", "Taiwan/geopolitical and export-control risk haircut."),
  assumption("customerConcentrationHaircut", "Customer Concentration", defaultTsmValuationAssumptions.customerConcentrationHaircut, 0, 0.20, 0.005, "percent", "Risk", "Apple/NVIDIA/AMD/Broadcom concentration and purchasing power haircut."),
  assumption("aiCycleHaircut", "AI Cycle Haircut", defaultTsmValuationAssumptions.aiCycleHaircut, 0, 0.30, 0.005, "percent", "Risk", "AI accelerator digestion and overbuild risk haircut."),
];

export const tsmScenarioConfig: ValuationScenario[] = [
  { name: "Bear", assumptions: tsmScenarioPresets.Bear },
  { name: "Base", assumptions: tsmScenarioPresets.Base },
  { name: "Bull", assumptions: tsmScenarioPresets.Bull },
];
