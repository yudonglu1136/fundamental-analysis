import type { IsrgDataLayer, IsrgValuationAssumptions } from "./model";
import { latestActual, metricMaybe, metricValue, priorYearQuarter, safeDivide } from "./utils";

export function calculateIonEngine(data: IsrgDataLayer, assumptions?: IsrgValuationAssumptions) {
  const latest = latestActual(data);
  const prior = priorYearQuarter(data, latest);
  const installedBase = metricValue(latest.installedBase.ionInstalledBase);
  const priorInstalledBase = metricMaybe(prior?.installedBase.ionInstalledBase);
  const placements = metricValue(latest.placements.ionPlacements);
  const priorPlacements = metricMaybe(prior?.placements.ionPlacements);
  const procedureGrowth = metricValue(latest.procedures.ionProcedureGrowth);
  const installedBaseGrowth = priorInstalledBase ? installedBase / priorInstalledBase - 1 : null;
  const placementGrowth = priorPlacements ? placements / priorPlacements - 1 : null;
  const probability = assumptions?.ionProbability ?? 0.35;
  const ramp = assumptions?.ionRevenueRamp ?? 850;
  const deDupHaircut = assumptions?.optionalityDeduplicationHaircut ?? 0.65;
  const grossOptionalityValue = ramp * 8 * probability;
  const haircutOptionalityValue = grossOptionalityValue * (1 - deDupHaircut);

  return {
    installedBase,
    installedBaseGrowth,
    placements,
    placementGrowth,
    procedureGrowth,
    utilizationReadThrough:
      procedureGrowth && installedBaseGrowth != null
        ? procedureGrowth - installedBaseGrowth
        : null,
    earlyStageCurve: data.actualData.map((period) => ({
      period: period.label,
      installedBase: metricValue(period.installedBase.ionInstalledBase),
      placements: metricValue(period.placements.ionPlacements),
      procedureGrowth: metricMaybe(period.procedures.ionProcedureGrowth),
    })),
    optionality: {
      probability,
      revenueRamp: ramp,
      grossOptionalityValue,
      deDuplicationHaircut: deDupHaircut,
      haircutOptionalityValue,
      valuePerShare: safeDivide(haircutOptionalityValue, assumptions?.dilutedShares ?? 359.8),
      note:
        "Ion is valued like early-stage optionality. The module probability-weights a revenue ramp and applies a de-duplication haircut because consolidated revenue DCF already embeds some early Ion contribution.",
    },
    bullCase: "Ion becomes a meaningful second platform in lung biopsy / pulmonology and expands Intuitive beyond da Vinci.",
    bearCase: "Ion remains clinically interesting but too small to move consolidated valuation or earns a lower-quality revenue stream.",
  };
}
