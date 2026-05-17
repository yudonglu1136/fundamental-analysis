import type { NocBudgetDriver, NocBudgetOutput, NocDataset } from "../model";
import type { Scenario } from "../../types";

export function calculateNocBudgetScenarioEngine(data: NocDataset, scenario: Scenario): NocBudgetOutput {
  const selected = data.budgetScenarios.find((item) => item.scenario === scenario) ?? data.budgetScenarios[1];
  const policyDrivers: Array<{ driver: NocBudgetDriver; signal: string; scenarioMapping: string; sourceStatus: "research_only" | "forecast_assumption" }> = [
    {
      driver: "Air Force",
      signal: "B-21 production capacity and operational fielding cadence",
      scenarioMapping: "Maps to b21ScaleMultiplier and Aeronautics Systems revenue/margin recovery.",
      sourceStatus: "research_only",
    },
    {
      driver: "Nuclear Triad",
      signal: "Sentinel continuation, restructuring milestones and B-21 deterrence priority",
      scenarioMapping: "Maps to revenue CAGR in Bull/Base, but to sentinelRiskCharge in Bear.",
      sourceStatus: "forecast_assumption",
    },
    {
      driver: "Space Force",
      signal: "SDA tracking layer, restricted space awards, NGI wind-down and missile warning architectures",
      scenarioMapping: "Maps to spaceGrowthPremium and Space Systems SOTP multiple.",
      sourceStatus: "research_only",
    },
    {
      driver: "Navy",
      signal: "Virginia Class submarine awards and marine systems demand",
      scenarioMapping: "Supports Mission Systems durability rather than a standalone shipbuilding bet.",
      sourceStatus: "research_only",
    },
    {
      driver: "Continuing Resolution",
      signal: "Appropriation delays, shutdown risk and funded backlog conversion",
      scenarioMapping: "Maps to book-to-bill, working-capital drag and WACC/risk discount.",
      sourceStatus: "forecast_assumption",
    },
  ];

  return {
    selected,
    scenarios: data.budgetScenarios,
    policyDrivers,
  };
}
