import type { ValidationWarning } from "../types";
import type { IsrgDataLayer } from "./model";
import { latestActual, latestFullYear, metricMaybe, metricValue, priorFullYear, priorYearQuarter, safeDivide, yoy } from "./utils";

export function calculateInstalledBaseEngine(data: IsrgDataLayer) {
  const latest = latestActual(data);
  const priorQuarter = priorYearQuarter(data, latest);
  const fy = latestFullYear(data);
  const priorFy = priorFullYear(data, fy);

  const daVinciInstalledBase = metricValue(latest.installedBase.daVinciInstalledBase);
  const priorDaVinciInstalledBase = metricMaybe(priorQuarter?.installedBase.daVinciInstalledBase);
  const ionInstalledBase = metricValue(latest.installedBase.ionInstalledBase);
  const priorIonInstalledBase = metricMaybe(priorQuarter?.installedBase.ionInstalledBase);
  const totalInstalledBase = metricValue(latest.installedBase.totalInstalledBase);
  const daVinciPlacements = metricValue(latest.placements.daVinciPlacements);
  const priorDaVinciPlacements = metricMaybe(priorQuarter?.placements.daVinciPlacements);
  const daVinci5Placements = metricValue(latest.placements.daVinci5Placements);
  const operatingLeasePlacements = metricValue(latest.placements.operatingLeasePlacements);
  const usageBasedLeasePlacements = metricValue(latest.placements.usageBasedLeasePlacements);
  const leaseMix = safeDivide(operatingLeasePlacements, daVinciPlacements);
  const usageBasedLeaseMix = safeDivide(usageBasedLeasePlacements, operatingLeasePlacements);
  const daVinci5PlacementShare = safeDivide(daVinci5Placements, daVinciPlacements);
  const netNewSystems = priorDaVinciInstalledBase ? daVinciInstalledBase - priorDaVinciInstalledBase : null;
  const replacementCycleProxy = netNewSystems == null ? null : Math.max(daVinciPlacements - netNewSystems, 0);
  const replacementCycleMix = safeDivide(replacementCycleProxy, daVinciPlacements);

  const fyDaVinciPlacements = metricValue(fy.placements.daVinciPlacements);
  const fyPriorDaVinciPlacements = metricMaybe(priorFy?.placements.daVinciPlacements);
  const fyNetNew = metricValue(fy.installedBase.daVinciInstalledBase) - metricValue(priorFy?.installedBase.daVinciInstalledBase);
  const fyReplacementProxy = Math.max(fyDaVinciPlacements - fyNetNew, 0);

  const warnings: ValidationWarning[] = [];
  if (daVinci5Placements > daVinciPlacements) {
    warnings.push({
      id: "isrg-dv5-placements-exceed-total",
      title: "da Vinci 5 placements exceed total da Vinci placements",
      detail: "da Vinci 5 adoption share cannot exceed total placements.",
      severity: "high",
    });
  }
  if (operatingLeasePlacements > daVinciPlacements) {
    warnings.push({
      id: "isrg-lease-placements-exceed-total",
      title: "Operating lease placements exceed total placements",
      detail: "Lease placements must be a subset of total da Vinci placements.",
      severity: "high",
    });
  }
  if (usageBasedLeasePlacements > operatingLeasePlacements) {
    warnings.push({
      id: "isrg-usage-lease-exceed-operating-lease",
      title: "Usage-based lease placements exceed operating lease placements",
      detail: "Usage-based leases must be a subset of operating lease placements.",
      severity: "high",
    });
  }

  return {
    latestPeriod: latest.periodId,
    daVinciInstalledBase,
    daVinciInstalledBaseGrowth: yoy(daVinciInstalledBase, priorDaVinciInstalledBase),
    ionInstalledBase,
    ionInstalledBaseGrowth: yoy(ionInstalledBase, priorIonInstalledBase),
    totalInstalledBase,
    daVinciPlacements,
    daVinciPlacementGrowth: yoy(daVinciPlacements, priorDaVinciPlacements),
    ionPlacements: metricValue(latest.placements.ionPlacements),
    daVinci5Placements,
    daVinci5PlacementShare,
    operatingLeasePlacements,
    leaseMix,
    usageBasedLeasePlacements,
    usageBasedLeaseMix,
    netNewSystems,
    replacementCycleProxy,
    replacementCycleMix,
    fullYearPlacementGrowth: yoy(fyDaVinciPlacements, fyPriorDaVinciPlacements),
    fullYearReplacementCycleProxy: fyReplacementProxy,
    capitalIntensityFrame:
      "Higher operating lease and usage-based lease mix can lower customer adoption friction but may shift revenue recognition away from upfront systems revenue.",
    keyQuestions: [
      "Is da Vinci 5 creating incremental demand or pulling forward replacement demand?",
      "How much of placement growth is net new system demand versus replacement?",
      "Is usage-based leasing lowering adoption friction enough to offset slower upfront revenue recognition?",
      "Does the installed base keep feeding recurring instruments and service revenue?",
    ],
    warnings,
  };
}
