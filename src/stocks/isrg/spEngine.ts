import type { IsrgDataLayer, IsrgValuationAssumptions } from "./model";
import { metricMaybe, metricValue, safeDivide } from "./utils";

export function calculateSpEngine(data: IsrgDataLayer, assumptions?: IsrgValuationAssumptions) {
  const spEvents = data.researchOnlyData.productEvents.filter((event) => event.platform === "SP");
  const latestSpPlacements = metricMaybe(data.actualData[data.actualData.length - 1]?.placements.spPlacements);
  const probability = assumptions?.spProbability ?? 0.18;
  const ramp = assumptions?.spRevenueRamp ?? 350;
  const deDupHaircut = assumptions?.optionalityDeduplicationHaircut ?? 0.65;
  const grossOptionalityValue = ramp * 7 * probability;
  const haircutOptionalityValue = grossOptionalityValue * (1 - deDupHaircut);

  return {
    placements: latestSpPlacements,
    approvalTimeline: spEvents,
    categories: ["single-port procedures", "narrow access procedures", "inguinal hernia repair", "cholecystectomy", "appendectomy"],
    strategicQuestions: [
      "Does SP open procedure categories multi-port systems cannot address well?",
      "Is SP incremental TAM, or does it cannibalize existing da Vinci procedures?",
      "Is current disclosure too small for valuation relevance?",
    ],
    optionality: {
      probability,
      revenueRamp: ramp,
      grossOptionalityValue,
      deDuplicationHaircut: deDupHaircut,
      haircutOptionalityValue,
      valuePerShare: safeDivide(haircutOptionalityValue, assumptions?.dilutedShares ?? 359.8),
    },
    status:
      latestSpPlacements == null
        ? "Strategic optionality. Starter extraction has regulatory milestones but not system placements."
        : `Latest disclosed SP placements: ${metricValue(data.actualData[data.actualData.length - 1].placements.spPlacements)}.`,
  };
}
