import type { Scenario } from "../types";
import type { NocValuationAssumptions } from "./model";
import { nocDataset } from "./data";

const latest = nocDataset.periods.find((period) => period.id === "fy25") ?? nocDataset.periods[nocDataset.periods.length - 1];
const baseScenario = nocDataset.budgetScenarios.find((item) => item.scenario === "Base") ?? nocDataset.budgetScenarios[0];
const pensionSurplus = (latest.pensionAndOpbAssets ?? latest.pensionAssets ?? 0) - (latest.pensionAndOpbLiabilities ?? latest.pensionLiabilities ?? 0);

export const defaultNocValuationAssumptions: NocValuationAssumptions = {
  currentPrice: nocDataset.marketData.currentPrice,
  revenueCagr: baseScenario.revenueCagr,
  segmentOperatingMargin: baseScenario.segmentOperatingMargin,
  taxRate: 0.17,
  dAndAIntensity: 0.027,
  capexIntensity: latest.capex / latest.sales,
  workingCapitalDragPctRevenueGrowth: 0.12,
  wacc: baseScenario.wacc,
  terminalGrowth: baseScenario.terminalGrowth,
  targetFcfYield: baseScenario.targetFcfYield,
  targetPe: baseScenario.targetPe,
  targetEvEbit: baseScenario.targetEvEbit,
  netDebt: (latest.longTermDebt ?? 0) + (latest.currentDebt ?? 0) - (latest.cash ?? 0),
  pensionSurplusCredit: pensionSurplus,
  dilutedShares: latest.dilutedShares,
  dividendPerShare: latest.dividendPerShare ?? 8.99,
  b21ScaleMultiplier: baseScenario.b21ScaleMultiplier,
  sentinelRiskCharge: baseScenario.sentinelRiskCharge,
  spaceGrowthPremium: baseScenario.spaceGrowthPremium,
  missionMoatPremium: baseScenario.missionMoatPremium,
  backlogDurabilityMaxAdjustment: 0.08,
  weightDcf: 0.28,
  weightFcfYield: 0.2,
  weightEvEbit: 0.12,
  weightPe: 0.12,
  weightSotp: 0.14,
  weightBacklogDurability: 0.14,
};

export const nocScenarioPresets: Record<Scenario, NocValuationAssumptions> = Object.fromEntries(
  nocDataset.budgetScenarios.map((scenario) => [
    scenario.scenario,
    {
      ...defaultNocValuationAssumptions,
      revenueCagr: scenario.revenueCagr,
      segmentOperatingMargin: scenario.segmentOperatingMargin,
      targetPe: scenario.targetPe,
      targetEvEbit: scenario.targetEvEbit,
      targetFcfYield: scenario.targetFcfYield,
      wacc: scenario.wacc,
      terminalGrowth: scenario.terminalGrowth,
      b21ScaleMultiplier: scenario.b21ScaleMultiplier,
      sentinelRiskCharge: scenario.sentinelRiskCharge,
      spaceGrowthPremium: scenario.spaceGrowthPremium,
      missionMoatPremium: scenario.missionMoatPremium,
    },
  ]),
) as Record<Scenario, NocValuationAssumptions>;
