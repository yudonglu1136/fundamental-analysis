import { actualData } from "./actuals";

const value = (metric: { value: number | null }) => metric.value ?? 0;
const safeDivide = (numerator: number, denominator: number) => (denominator ? numerator / denominator : 0);

export const installedBaseData = actualData.map((period, index) => {
  const prior = actualData[index - 1];
  const daVinciInstalledBase = value(period.installedBase.daVinciInstalledBase);
  const ionInstalledBase = value(period.installedBase.ionInstalledBase);
  const daVinciPlacements = value(period.placements.daVinciPlacements);
  const daVinci5Placements = value(period.placements.daVinci5Placements);
  const operatingLeasePlacements = value(period.placements.operatingLeasePlacements);
  const usageBasedLeasePlacements = value(period.placements.usageBasedLeasePlacements);
  const priorDaVinciInstalledBase = prior ? value(prior.installedBase.daVinciInstalledBase) : 0;
  const netNewDaVinciSystems = priorDaVinciInstalledBase ? daVinciInstalledBase - priorDaVinciInstalledBase : null;
  const replacementUpgradeProxy =
    netNewDaVinciSystems == null ? null : Math.max(0, daVinciPlacements - netNewDaVinciSystems);

  return {
    periodId: period.periodId,
    label: period.label,
    daVinciInstalledBase,
    ionInstalledBase,
    totalInstalledBase: value(period.installedBase.totalInstalledBase),
    daVinciPlacements,
    ionPlacements: value(period.placements.ionPlacements),
    spPlacements: value(period.placements.spPlacements) || null,
    daVinci5Placements,
    daVinciInstalledBaseGrowth: priorDaVinciInstalledBase ? daVinciInstalledBase / priorDaVinciInstalledBase - 1 : null,
    netNewDaVinciSystems,
    replacementUpgradeProxy,
    replacementUpgradeMix: safeDivide(replacementUpgradeProxy ?? 0, daVinciPlacements),
    daVinci5PlacementShare: safeDivide(daVinci5Placements, daVinciPlacements),
    operatingLeasePlacementMix: safeDivide(operatingLeasePlacements, daVinciPlacements),
    usageBasedLeaseMix: safeDivide(usageBasedLeasePlacements, operatingLeasePlacements),
    sourceStatus: "official_actual" as const,
  };
});

