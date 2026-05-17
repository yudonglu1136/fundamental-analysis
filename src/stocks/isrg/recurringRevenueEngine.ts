import type { ValidationWarning } from "../types";
import type { IsrgDataLayer } from "./model";
import { latestActual, latestFullYear, metricMaybe, metricValue, priorFullYear, priorYearQuarter, safeDivide, yoy } from "./utils";

export function calculateRecurringRevenueEngine(data: IsrgDataLayer) {
  const latest = latestActual(data);
  const priorQuarter = priorYearQuarter(data, latest);
  const fy = latestFullYear(data);
  const priorFy = priorFullYear(data, fy);

  const latestTotalRevenue = metricValue(latest.revenue.total);
  const instrumentsAccessoriesRevenue = metricValue(latest.revenue.instrumentsAccessories);
  const systemsRevenue = metricValue(latest.revenue.systems);
  const servicesRevenue = metricValue(latest.revenue.services);
  const recurringRevenue = instrumentsAccessoriesRevenue + servicesRevenue;
  const recurringRevenueMix = safeDivide(recurringRevenue, latestTotalRevenue);
  const systemAspProxy = safeDivide(systemsRevenue, metricValue(latest.placements.daVinciPlacements));
  const serviceRevenuePerInstalledSystem = safeDivide(servicesRevenue * 1000, metricValue(latest.installedBase.daVinciInstalledBase));

  const fyInstrumentsAccessoriesRevenue = metricValue(fy.revenue.instrumentsAccessories);
  const fyDaVinciProcedures = metricValue(fy.procedures.worldwideDaVinciProcedures);
  const revenuePerProcedure = safeDivide(fyInstrumentsAccessoriesRevenue * 1_000_000, fyDaVinciProcedures);
  const fySystemAspProxy = safeDivide(metricValue(fy.revenue.systems), metricValue(fy.placements.daVinciPlacements));
  const fyServiceRevenuePerSystem = safeDivide(
    metricValue(fy.revenue.services) * 1000,
    (metricValue(fy.installedBase.daVinciInstalledBase) + metricValue(priorFy?.installedBase.daVinciInstalledBase)) / 2,
  );

  const segmentRows = [
    {
      segment: "Instruments & Accessories",
      revenue: instrumentsAccessoriesRevenue,
      revenueGrowth: yoy(instrumentsAccessoriesRevenue, metricMaybe(priorQuarter?.revenue.instrumentsAccessories)),
      mix: safeDivide(instrumentsAccessoriesRevenue, latestTotalRevenue),
      quality: "High recurring-like",
      driver: "Procedure volume x instruments/accessories per procedure",
    },
    {
      segment: "Systems",
      revenue: systemsRevenue,
      revenueGrowth: yoy(systemsRevenue, metricMaybe(priorQuarter?.revenue.systems)),
      mix: safeDivide(systemsRevenue, latestTotalRevenue),
      quality: "Placement-cycle driven",
      driver: "Placements x recognized ASP, affected by lease mix",
    },
    {
      segment: "Services",
      revenue: servicesRevenue,
      revenueGrowth: yoy(servicesRevenue, metricMaybe(priorQuarter?.revenue.services)),
      mix: safeDivide(servicesRevenue, latestTotalRevenue),
      quality: "Installed-base attached",
      driver: "Installed base x service revenue per system",
    },
  ];

  const warnings: ValidationWarning[] = [];
  const revenueSegmentSum = instrumentsAccessoriesRevenue + systemsRevenue + servicesRevenue;
  if (Math.abs(revenueSegmentSum - latestTotalRevenue) > 0.2) {
    warnings.push({
      id: "isrg-revenue-segment-sum",
      title: "Revenue segment sum does not reconcile",
      detail: `Segments sum to ${revenueSegmentSum.toFixed(1)} versus total revenue ${latestTotalRevenue.toFixed(1)}.`,
      severity: "high",
    });
  }
  if (systemAspProxy < 0.5 || systemAspProxy > 3.5) {
    warnings.push({
      id: "isrg-system-asp-proxy-range",
      title: "System ASP proxy outside expected range",
      detail: "System revenue divided by placements should be reviewed because operating leases can distort reported ASP.",
      severity: "medium",
    });
  }
  if (revenuePerProcedure < 500 || revenuePerProcedure > 3500) {
    warnings.push({
      id: "isrg-revenue-per-procedure-range",
      title: "Revenue per procedure proxy outside expected range",
      detail: "I&A revenue per procedure is an approximation and should be validated against disclosures and mix.",
      severity: "medium",
    });
  }

  return {
    latestPeriod: latest.periodId,
    latestFullYear: fy.periodId,
    totalRevenue: latestTotalRevenue,
    instrumentsAccessoriesRevenue,
    systemsRevenue,
    servicesRevenue,
    recurringRevenue,
    recurringRevenueMix,
    systemAspProxy,
    serviceRevenuePerInstalledSystem,
    revenuePerProcedure,
    fySystemAspProxy,
    fyServiceRevenuePerSystem,
    segmentRows,
    flywheelReadThrough:
      "The critical ISRG revenue quality signal is I&A plus services mix. Systems placements seed future recurring procedures, while I&A monetizes utilization.",
    warnings,
  };
}
