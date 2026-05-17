import type { MckDataset, MckScenarioOutput } from "../types";
import { calculateMckValuationEngine } from "./valuationEngine";
import { safeDivide } from "./helpers";

export function calculateMckScenarioEngine(data: MckDataset): MckScenarioOutput[] {
  return data.scenarios.map((scenario) => {
    const scenarioData: MckDataset = {
      ...data,
      assumptions: { ...data.assumptions, ...scenario.assumptions },
    };
    const valuation = calculateMckValuationEngine(scenarioData);
    const assumptions = scenarioData.assumptions;
    const targetPrice3Y = assumptions.forwardAdjustedEps * (1 + assumptions.epsCagr3Y) ** 3 * assumptions.exitPe * (1 - assumptions.downsideShock);
    const targetPrice5Y = assumptions.forwardAdjustedEps * (1 + assumptions.epsCagr5Y) ** 5 * assumptions.exitPe * (1 - assumptions.downsideShock);
    const annualDividend = assumptions.currentPrice * data.market.dividendYield;
    return {
      scenario: scenario.name,
      fairValue: valuation.blendedFairValue,
      targetPrice3Y,
      targetPrice5Y,
      irr3Y: safeDivide(targetPrice3Y + annualDividend * 3, assumptions.currentPrice) ** (1 / 3) - 1,
      irr5Y: safeDivide(targetPrice5Y + annualDividend * 5, assumptions.currentPrice) ** (1 / 5) - 1,
      upsideDownside: safeDivide(valuation.blendedFairValue, assumptions.currentPrice) - 1,
      summary: scenario.summary,
    };
  });
}
