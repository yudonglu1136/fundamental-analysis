import type { PltrActualQuarter, PltrScenarioDefinition, PltrScenarioOutput, PltrValuationAssumptions } from "../model";
import { metricValue, safeDivide } from "./helpers";

export function buildPltrScenarioAssumptions(
  base: PltrValuationAssumptions,
  definition: PltrScenarioDefinition,
): PltrValuationAssumptions {
  return {
    ...base,
    ...definition.assumptions,
  };
}

export function calculatePltrScenarioEngine(
  actuals: PltrActualQuarter[],
  baseAssumptions: PltrValuationAssumptions,
  definitions: PltrScenarioDefinition[],
): PltrScenarioOutput[] {
  const latest = actuals[actuals.length - 1];
  const latestCommercialRevenue = metricValue(latest, "commercialRevenue") * 4;
  const latestGovernmentRevenue = metricValue(latest, "governmentRevenue") * 4;

  return definitions.map((definition) => {
    const assumptions = buildPltrScenarioAssumptions(baseAssumptions, definition);
    const commercialCagr = definition.assumptions.commercialRevenueCagr ?? assumptions.revenueCagrYears1To5;
    const governmentCagr = definition.assumptions.governmentRevenueCagr ?? assumptions.revenueCagrYears1To5;
    const revenuePath = Array.from({ length: 5 }, (_, index) => {
      const year = 2026 + index;
      const commercialRevenue = latestCommercialRevenue * (1 + commercialCagr) ** (index + 1);
      const governmentRevenue = latestGovernmentRevenue * (1 + governmentCagr) ** (index + 1);
      const revenue = commercialRevenue + governmentRevenue;
      return { year, revenue, commercialRevenue, governmentRevenue };
    });
    const terminal = revenuePath[revenuePath.length - 1];
    const fcf = (terminal?.revenue ?? assumptions.baseRevenue) * assumptions.fcfMargin;
    const dilutedShares = assumptions.dilutedShares * (1 + assumptions.dilutionRate) ** 5;
    const fcfPerShare = safeDivide(fcf, dilutedShares);
    const futureValue = fcfPerShare * assumptions.terminalMultiple + safeDivide(assumptions.netCash, dilutedShares);
    const fairValuePerShare = futureValue / (1 + assumptions.wacc) ** 5;
    const expectedCagr = assumptions.currentPrice > 0 ? (futureValue / assumptions.currentPrice) ** (1 / 5) - 1 : 0;
    return {
      scenario: definition.name,
      revenuePath,
      operatingMargin: assumptions.adjustedOperatingMargin,
      fcf,
      dilutedShares,
      fcfPerShare,
      exitMultiple: assumptions.terminalMultiple,
      fairValuePerShare,
      expectedCagr,
      summary: definition.summary,
    };
  });
}
