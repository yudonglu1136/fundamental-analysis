import type { AznDataset, AznPipelinePhase, AznPipelineValue, AznTherapyArea, AznValuationAssumptions } from "../types";

function catalystSortValue(value: string) {
  const match = value.match(/20\d{2}/);
  if (!match) return 9999;
  return Number(match[0]) + (value.includes("H2") ? 0.6 : value.includes("H1") ? 0.2 : 0.4);
}

export function calculatePipelineValue(asset: AznPipelineValue | AznDataset["pipelineData"][number], assumptions: AznValuationAssumptions): AznPipelineValue {
  const yearsToLaunch = Math.max(asset.launchYearEstimate - 2026, 0);
  const durationFactor = Math.min(Math.max(asset.patentLifeEstimate * 0.52, 4), 7);
  const discountFactor = 1 / ((1 + assumptions.pipelineDiscountRate) ** (yearsToLaunch + 0.5));
  const probabilityAdjustedPipelineValue =
    asset.peakSalesEstimate *
    assumptions.targetPipelineMargin *
    asset.probabilityOfSuccess *
    durationFactor *
    discountFactor;

  return {
    ...asset,
    probabilityAdjustedPipelineValue,
    discountFactor,
    durationFactor,
  };
}

export function buildPipelineIntelligenceLab(data: AznDataset, assumptions: AznValuationAssumptions) {
  const valuedAssets = data.pipelineData
    .map((asset) => calculatePipelineValue(asset, assumptions))
    .sort((a, b) => b.probabilityAdjustedPipelineValue - a.probabilityAdjustedPipelineValue);

  const byPhase = valuedAssets.reduce<Record<AznPipelinePhase, number>>(
    (acc, asset) => ({ ...acc, [asset.phase]: (acc[asset.phase] ?? 0) + 1 }),
    { "Phase 1": 0, "Phase 2": 0, "Phase 3": 0, Registration: 0, "Approved / ramping": 0 },
  );

  const valueByTherapyArea = valuedAssets.reduce<Record<AznTherapyArea, number>>((acc, asset) => {
    acc[asset.therapyArea] = (acc[asset.therapyArea] ?? 0) + asset.probabilityAdjustedPipelineValue;
    return acc;
  }, {} as Record<AznTherapyArea, number>);

  const catalystCalendar = [...valuedAssets]
    .sort((a, b) => catalystSortValue(a.nextCatalystDate) - catalystSortValue(b.nextCatalystDate))
    .map((asset) => ({
      assetName: asset.assetName,
      therapyArea: asset.therapyArea,
      phase: asset.phase,
      nextCatalystDate: asset.nextCatalystDate,
      catalystType: asset.catalystType,
      regulatoryMilestone: asset.regulatoryMilestone,
      riskLevel: asset.riskLevel,
      probabilityAdjustedPipelineValue: asset.probabilityAdjustedPipelineValue,
    }));

  const bubbleData = valuedAssets.map((asset) => ({
    name: asset.assetName,
    therapyArea: asset.therapyArea,
    phase: asset.phase,
    launchYear: asset.launchYearEstimate,
    peakSales: asset.peakSalesEstimate,
    probabilityAdjustedPipelineValue: asset.probabilityAdjustedPipelineValue,
    probabilityOfSuccess: asset.probabilityOfSuccess,
  }));

  return {
    valuedAssets,
    totalProbabilityAdjustedPipelineValue: valuedAssets.reduce((sum, asset) => sum + asset.probabilityAdjustedPipelineValue, 0),
    byPhase,
    valueByTherapyArea,
    catalystCalendar,
    bubbleData,
    phaseTransitionFunnel: Object.entries(byPhase).map(([phase, count]) => ({ phase, count })),
  };
}
