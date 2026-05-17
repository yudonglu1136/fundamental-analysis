import type { Scenario } from "../types";
import type { BaValuationAssumptions } from "./model";
import { baDataset } from "./data";

const latest = baDataset.periods.find((period) => period.id === "fy25") ?? baDataset.periods[baDataset.periods.length - 1];
const baseScenario = baDataset.defenseCycleScenarios.find((item) => item.scenario === "Base") ?? baDataset.defenseCycleScenarios[0];

export const defaultBaValuationAssumptions: BaValuationAssumptions = {
  currentPrice: baDataset.marketData.currentPriceGbp,
  revenueCagr: baseScenario.revenueCagr,
  operatingMargin: baseScenario.operatingMargin,
  taxRate: baDataset.guidance[0]?.effectiveTaxRate ?? 0.22,
  dAndAIntensity: (latest.depreciationAmortizationImpairment ?? 1_173) / latest.sales,
  capexIntensity: (latest.capex ?? 1_000) / latest.sales,
  workingCapitalDragPctRevenueGrowth: 0.08,
  wacc: baseScenario.wacc,
  terminalGrowth: baseScenario.terminalGrowth,
  targetFcfYield: baseScenario.targetFcfYield,
  targetPe: baseScenario.targetPe,
  targetEvEbit: baseScenario.targetEvEbit,
  netDebtExLeases: latest.netDebtExLeases,
  leaseLiabilitiesNet: latest.leaseLiabilitiesNet ?? 0,
  pensionSurplusCredit: latest.postEmploymentBenefitSurplus ?? 0,
  dilutedShares: latest.weightedAverageDilutedShares ?? latest.outstandingSharesForEps ?? 1,
  dividendPerShare: latest.dividendPerSharePence / 100,
  backlogDurabilityMaxAdjustment: 0.1,
  weightDcf: 0.35,
  weightFcfYield: 0.25,
  weightEvEbit: 0.1,
  weightPe: 0.1,
  weightBacklogDurability: 0.2,
};

export const baScenarioPresets: Record<Scenario, BaValuationAssumptions> = Object.fromEntries(
  baDataset.defenseCycleScenarios.map((scenario) => [
    scenario.scenario,
    {
      ...defaultBaValuationAssumptions,
      revenueCagr: scenario.revenueCagr,
      operatingMargin: scenario.operatingMargin,
      wacc: scenario.wacc,
      terminalGrowth: scenario.terminalGrowth,
      targetFcfYield: scenario.targetFcfYield,
      targetPe: scenario.targetPe,
      targetEvEbit: scenario.targetEvEbit,
    },
  ]),
) as Record<Scenario, BaValuationAssumptions>;
