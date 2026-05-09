import type { LsegRawData } from "./data";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function calculatePostTradeEngine(data: LsegRawData, periodId: string, scenario: "Bear" | "Base" | "Bull") {
  const current = data.postTradeMetrics.find((row) => row.periodId === periodId) ?? data.postTradeMetrics[data.postTradeMetrics.length - 1];
  const scenarioCase = data.postTradeScenarios.find((row) => row.scenario === scenario) ?? data.postTradeScenarios[1];
  const scenarioAdjustment =
    scenario === "Bear"
      ? { volume: 0.92, economics: 0.9, moat: 0.94, pricing: 0.95 }
      : scenario === "Bull"
        ? { volume: 1.08, economics: 1.09, moat: 1.06, pricing: 1.05 }
        : { volume: 1, economics: 1, moat: 1, pricing: 1 };
  const clearingConcentrationScore = (1 - current.memberConcentration) * 100;
  const retainedEconomics = current.retainedEconomics * scenarioAdjustment.economics * (1 - (scenarioCase.basePartnerShare - 0.48) * 0.3);
  const memberNetworkDensity = current.clearingNetworkDensity * scenarioAdjustment.moat;
  const operatingLeverage = current.incrementalMargin * scenarioAdjustment.economics;
  const postTradeMoatScore = clampScore(
    (
      (1 - current.memberConcentration) * 0.14 +
      memberNetworkDensity * 0.2 +
      current.memberStickiness * 0.17 +
      current.collateralUtility * 0.16 +
      current.regulatoryBarrierScore * 0.17 +
      current.interoperabilityBarrierScore * 0.08 +
      (current.pricingPowerScore * scenarioAdjustment.pricing) * 0.08
    ) * 100,
  );

  return {
    current: {
      ...current,
      clearingConcentrationScore,
      memberNetworkDensity,
      retainedEconomics,
      operatingLeverage,
      scenarioClearedVolumeGrowth: current.clearedVolumeGrowth * scenarioAdjustment.volume,
      postTradeMoatScore,
    },
    scenarioCase,
    series: data.postTradeMetrics.map((row) => ({
      periodId: row.periodId,
      postTradeMoatScore: clampScore(
        (
          (1 - row.memberConcentration) * 0.14 +
          row.clearingNetworkDensity * 0.2 +
          row.memberStickiness * 0.17 +
          row.collateralUtility * 0.16 +
          row.regulatoryBarrierScore * 0.17 +
          row.interoperabilityBarrierScore * 0.08 +
          row.pricingPowerScore * 0.08
        ) * 100,
      ),
      clearedVolumeGrowth: row.clearedVolumeGrowth,
      incrementalMargin: row.incrementalMargin,
      retainedEconomics: row.retainedEconomics,
    })),
    interpretation:
      postTradeMoatScore >= 76
        ? "Clearing moat is strengthening as network density, collateral utility, and regulatory barriers all rise together."
        : "Post Trade remains a strong franchise, but moat deepening is not yet decisive enough to carry the entire valuation story.",
  };
}
