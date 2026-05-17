import { installedBaseData } from "./installedBaseData";
import { revenueMixData } from "./revenueMixData";

const safeDivide = (numerator: number, denominator: number) => (denominator ? numerator / denominator : 0);

export const systemData = installedBaseData.map((period) => {
  const revenue = revenueMixData.find((row) => row.periodId === period.periodId);
  return {
    ...period,
    systemAspProxy: revenue ? safeDivide(revenue.systemsRevenue, period.daVinciPlacements) : 0,
    serviceRevenuePerDaVinciSystem: revenue ? safeDivide(revenue.servicesRevenue, period.daVinciInstalledBase) : 0,
    capitalIntensitySignal:
      period.operatingLeasePlacementMix > 0.55 || period.usageBasedLeaseMix > 0.5 ? "high adoption friction mitigated by leases" : "direct purchase mix still meaningful",
  };
});

