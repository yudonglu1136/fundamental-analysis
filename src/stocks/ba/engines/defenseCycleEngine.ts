import type { Scenario } from "../../types";
import type { BaDataset, BaDefenseCycleScenario } from "../model";
import { clamp } from "./helpers";

export type BaDefenseCycleOutput = {
  scenarios: BaDefenseCycleScenario[];
  selected: BaDefenseCycleScenario;
  policyDrivers: Array<{ driver: string; sourceStatus: "research_only"; scenarioMapping: string }>;
  probabilityWeights: Record<Scenario, number>;
  notes: string[];
};

export function calculateBaDefenseCycleEngine(data: BaDataset, scenario: Scenario): BaDefenseCycleOutput {
  const selected = data.defenseCycleScenarios.find((item) => item.scenario === scenario) ??
    data.defenseCycleScenarios.find((item) => item.scenario === "Base") ??
    data.defenseCycleScenarios[0];
  const totalProbability = data.defenseCycleScenarios.reduce((sum, item) => sum + item.scenarioProbability, 0);
  const probabilityWeights = Object.fromEntries(
    data.defenseCycleScenarios.map((item) => [
      item.scenario,
      clamp(item.scenarioProbability / Math.max(totalProbability, 0.01), 0, 1),
    ]),
  ) as Record<Scenario, number>;

  return {
    scenarios: data.defenseCycleScenarios,
    selected,
    probabilityWeights,
    policyDrivers: [
      {
        driver: "NATO 2% / 3% / 5% spending debate",
        sourceStatus: "research_only",
        scenarioMapping: "Changes long-run revenue durability and scenario probability, not a direct sales input.",
      },
      {
        driver: "Europe rearmament and Ukraine replenishment",
        sourceStatus: "research_only",
        scenarioMapping: "Maps to Platforms & Services, Air export demand, and munitions capacity utilisation.",
      },
      {
        driver: "AUKUS and submarine industrial-base cycle",
        sourceStatus: "research_only",
        scenarioMapping: "Maps to Maritime visibility and execution risk; it can lift duration but also working-capital and margin risk.",
      },
      {
        driver: "Electronic warfare, missile defence, and space",
        sourceStatus: "research_only",
        scenarioMapping: "Maps to Electronic Systems growth/mix and durability, not an automatic multiple uplift.",
      },
      {
        driver: "Middle East / Saudi / GCC defence demand",
        sourceStatus: "research_only",
        scenarioMapping: "Maps to Air and export timing; requires official customer/program disclosure before inclusion as a hard forecast.",
      },
    ],
    notes: [
      "The model deliberately translates geopolitics into scenario assumptions and risk discounts rather than using news sentiment as a valuation input.",
      "Base case starts with BAE's 2026 guidance, then normalizes beyond the explicit guidance year.",
      "Bull and bear scenarios change revenue CAGR, margin, WACC, and multiples through the forecast-assumption layer only.",
    ],
  };
}
