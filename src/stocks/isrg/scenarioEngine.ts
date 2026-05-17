import type { Scenario } from "../types";
import type { IsrgDataLayer, IsrgScenarioDefinition, IsrgScenarioOutput, IsrgValuationAssumptions } from "./model";
import { isrgScenarioDefinitions } from "./assumptions";
import { calculateIsrgValuationEngine } from "./valuationEngine";
import { latestFullYear, metricValue, safeDivide } from "./utils";

export function buildIsrgScenarioAssumptions(
  base: IsrgValuationAssumptions,
  definition: IsrgScenarioDefinition,
): IsrgValuationAssumptions {
  return {
    ...base,
    ...definition.assumptions,
  };
}

export function calculateIsrgScenarioEngine(
  data: IsrgDataLayer,
  baseAssumptions: IsrgValuationAssumptions,
  definitions = isrgScenarioDefinitions,
): IsrgScenarioOutput[] {
  const baseRevenue = metricValue(latestFullYear(data).revenue.total);
  return definitions.map((definition) => {
    const assumptions = buildIsrgScenarioAssumptions(baseAssumptions, definition);
    const valuation = calculateIsrgValuationEngine(data, assumptions);
    const lastRevenueRow = valuation.procedureDcf.rows[valuation.procedureDcf.rows.length - 1];
    const year5Revenue = valuation.procedureDcf.rows[4]?.totalRevenue ?? lastRevenueRow?.totalRevenue ?? baseRevenue;
    const year5Eps = safeDivide(
      year5Revenue * Math.max(0.1, assumptions.operatingMargin - assumptions.marginCompression) * (1 - assumptions.taxRate),
      assumptions.dilutedShares,
    );
    const baseEps = metricValue(latestFullYear(data).dilutedEps);
    return {
      scenario: definition.name as Scenario,
      revenueCagr: baseRevenue > 0 ? (year5Revenue / baseRevenue) ** (1 / 5) - 1 : 0,
      operatingMargin: assumptions.operatingMargin - assumptions.marginCompression,
      fcfMargin: Math.max(0.12, assumptions.fcfMargin - assumptions.tariffGrossMarginDrag - assumptions.marginCompression * 0.5),
      epsCagr: baseEps > 0 ? (year5Eps / baseEps) ** (1 / 5) - 1 : 0,
      fairValue: valuation.selectedFairValue,
      impliedReturn: safeDivide(valuation.selectedFairValue, assumptions.currentPrice) - 1,
      downsideRisk: Math.min(0, safeDivide(valuation.selectedFairValue, assumptions.currentPrice) - 1),
      upsideRisk: Math.max(0, safeDivide(valuation.selectedFairValue, assumptions.currentPrice) - 1),
      summary: definition.summary,
    };
  });
}
