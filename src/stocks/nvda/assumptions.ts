import type { ValuationAssumption, ValuationScenario } from "../types";

export type NvdaValuationAssumptions = {
  currentPrice: number;
  dilutedShares: number;
  netCash: number;
  dataCenterGrowth: number;
  gamingGrowth: number;
  networkingAttachRate: number;
  grossMargin: number;
  operatingMargin: number;
  normalizedFcfMargin: number;
  terminalGrowth: number;
  discountRate: number;
  targetFcfYield: number;
  targetPe: number;
  evEbitMultiple: number;
  dataCenterRevenueMultiple: number;
  networkingRevenueMultiple: number;
  gamingRevenueMultiple: number;
  automotiveRevenueMultiple: number;
  productTransitionRisk: number;
  chinaRiskHaircut: number;
  customAsicShareRisk: number;
  supplyConstraintBenefit: number;
};

export const defaultNvdaValuationAssumptions: NvdaValuationAssumptions = {
  currentPrice: 225.8,
  dilutedShares: 24_514,
  netCash: 52_000,
  dataCenterGrowth: 0.38,
  gamingGrowth: 0.05,
  networkingAttachRate: 0.24,
  grossMargin: 0.71,
  operatingMargin: 0.60,
  normalizedFcfMargin: 0.56,
  terminalGrowth: 0.04,
  discountRate: 0.095,
  targetFcfYield: 0.035,
  targetPe: 34,
  evEbitMultiple: 29,
  dataCenterRevenueMultiple: 15,
  networkingRevenueMultiple: 10,
  gamingRevenueMultiple: 4,
  automotiveRevenueMultiple: 5,
  productTransitionRisk: 0.05,
  chinaRiskHaircut: 0.04,
  customAsicShareRisk: 0.06,
  supplyConstraintBenefit: 0.03,
};

export const nvdaScenarioPresets: Record<"Bear" | "Base" | "Bull", NvdaValuationAssumptions> = {
  Bear: {
    ...defaultNvdaValuationAssumptions,
    dataCenterGrowth: 0.20,
    gamingGrowth: 0.01,
    networkingAttachRate: 0.18,
    grossMargin: 0.64,
    operatingMargin: 0.51,
    normalizedFcfMargin: 0.45,
    terminalGrowth: 0.03,
    discountRate: 0.107,
    targetFcfYield: 0.053,
    targetPe: 26,
    evEbitMultiple: 22,
    dataCenterRevenueMultiple: 11,
    networkingRevenueMultiple: 7,
    productTransitionRisk: 0.14,
    chinaRiskHaircut: 0.09,
    customAsicShareRisk: 0.14,
    supplyConstraintBenefit: 0,
  },
  Base: defaultNvdaValuationAssumptions,
  Bull: {
    ...defaultNvdaValuationAssumptions,
    dataCenterGrowth: 0.54,
    gamingGrowth: 0.08,
    networkingAttachRate: 0.30,
    grossMargin: 0.745,
    operatingMargin: 0.645,
    normalizedFcfMargin: 0.62,
    terminalGrowth: 0.045,
    discountRate: 0.087,
    targetFcfYield: 0.028,
    targetPe: 41,
    evEbitMultiple: 35,
    dataCenterRevenueMultiple: 19,
    networkingRevenueMultiple: 13,
    productTransitionRisk: 0.02,
    chinaRiskHaircut: 0.02,
    customAsicShareRisk: 0.03,
    supplyConstraintBenefit: 0.07,
  },
};

function assumption(
  key: keyof NvdaValuationAssumptions,
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

export const nvdaValuationAssumptionDefinitions: ValuationAssumption[] = [
  assumption("dataCenterGrowth", "Data Center Growth", defaultNvdaValuationAssumptions.dataCenterGrowth, -0.05, 0.80, 0.01, "percent", "AI Infrastructure Demand", "Forward Data Center growth after event-dated normalization."),
  assumption("gamingGrowth", "Gaming Growth", defaultNvdaValuationAssumptions.gamingGrowth, -0.20, 0.25, 0.01, "percent", "Gaming Normalization", "Forward Gaming growth outside core AI accelerators."),
  assumption("networkingAttachRate", "Networking Attach", defaultNvdaValuationAssumptions.networkingAttachRate, 0.05, 0.45, 0.01, "percent", "Systems Mix", "Data Center revenue mix tied to networking and systems attach."),
  assumption("grossMargin", "Gross Margin", defaultNvdaValuationAssumptions.grossMargin, 0.45, 0.80, 0.005, "percent", "ASP / Margin Cycle", "Normalized gross margin after product-cycle and supply allocation effects."),
  assumption("operatingMargin", "Operating Margin", defaultNvdaValuationAssumptions.operatingMargin, 0.25, 0.72, 0.005, "percent", "Operating Leverage", "Normalized operating margin after R&D and go-to-market reinvestment."),
  assumption("normalizedFcfMargin", "FCF Margin", defaultNvdaValuationAssumptions.normalizedFcfMargin, 0.05, 0.70, 0.005, "percent", "Cash Conversion", "Normalized FCF margin after working capital and inventory cycle effects."),
  assumption("targetFcfYield", "Target FCF Yield", defaultNvdaValuationAssumptions.targetFcfYield, 0.02, 0.09, 0.001, "percent", "Multiple", "FCF yield used for valuation triangulation."),
  assumption("targetPe", "Target P/E", defaultNvdaValuationAssumptions.targetPe, 12, 55, 1, "multiple", "Multiple", "Normalized P/E multiple for earnings power."),
  assumption("evEbitMultiple", "EV / EBIT", defaultNvdaValuationAssumptions.evEbitMultiple, 10, 45, 1, "multiple", "Multiple", "EV / EBIT multiple for operating profit power."),
  assumption("dataCenterRevenueMultiple", "Data Center Multiple", defaultNvdaValuationAssumptions.dataCenterRevenueMultiple, 3, 25, 0.5, "multiple", "SOTP", "Revenue multiple for AI accelerators and systems."),
  assumption("productTransitionRisk", "Transition Risk", defaultNvdaValuationAssumptions.productTransitionRisk, 0, 0.25, 0.005, "percent", "Risk", "Blackwell/Rubin transition and ASP/gross-margin execution haircut."),
  assumption("chinaRiskHaircut", "China Risk", defaultNvdaValuationAssumptions.chinaRiskHaircut, 0, 0.20, 0.005, "percent", "Risk", "Export-control and workaround risk haircut."),
  assumption("customAsicShareRisk", "ASIC Share Risk", defaultNvdaValuationAssumptions.customAsicShareRisk, 0, 0.25, 0.005, "percent", "Risk", "Custom ASIC, AMD, and hyperscaler internal silicon risk haircut."),
];

export const nvdaScenarioConfig: ValuationScenario[] = [
  { name: "Bear", assumptions: nvdaScenarioPresets.Bear },
  { name: "Base", assumptions: nvdaScenarioPresets.Base },
  { name: "Bull", assumptions: nvdaScenarioPresets.Bull },
];
