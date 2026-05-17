import type { IsrgDataLayer } from "./model";
import { latestActual, metricValue, safeDivide } from "./utils";

export function calculateHospitalCapexEngine(data: IsrgDataLayer) {
  const latest = latestActual(data);
  const placements = metricValue(latest.placements.daVinciPlacements);
  const leases = metricValue(latest.placements.operatingLeasePlacements);
  const usageLeases = metricValue(latest.placements.usageBasedLeasePlacements);
  const systemsRevenue = metricValue(latest.revenue.systems);
  const iaRevenue = metricValue(latest.revenue.instrumentsAccessories);
  const serviceRevenue = metricValue(latest.revenue.services);
  const totalRevenue = metricValue(latest.revenue.total);
  const leaseMix = safeDivide(leases, placements);
  const usageBasedLeaseMix = safeDivide(usageLeases, leases);
  const recurringMix = safeDivide(iaRevenue + serviceRevenue, totalRevenue);
  const aspProxy = safeDivide(systemsRevenue, placements);
  const capexFrictionScore = Math.round(100 * (0.45 * leaseMix + 0.25 * usageBasedLeaseMix + 0.3 * (1 - recurringMix)));

  return {
    leaseMix,
    usageBasedLeaseMix,
    aspProxy,
    recurringMix,
    capexFrictionScore,
    interpretation:
      leaseMix > 0.5
        ? "Leasing is now a key adoption valve: it can lower hospital upfront friction while delaying recognized system revenue."
        : "Direct system purchase economics still matter materially for adoption cadence.",
    hospitalRoiDrivers: [
      {
        driver: "Procedure throughput",
        signal: "Procedure growth must stay ahead of installed-base growth to prove utilization ROI.",
      },
      {
        driver: "Lease affordability",
        signal: "Operating and usage-based leases reduce upfront capex but may mute near-term system revenue.",
      },
      {
        driver: "Surgeon workflow",
        signal: "Training, familiarity, service uptime, and OR workflow integration sustain switching costs.",
      },
      {
        driver: "Upgrade economics",
        signal: "da Vinci 5 must either expand procedures or improve productivity enough to justify replacement capex.",
      },
    ],
    nextQuarterMonitors: [
      "Operating lease placements vs total da Vinci placements",
      "Usage-based leases as a percent of operating leases",
      "System ASP proxy after trade-ins and launch mix",
      "Management comments on hospital budget pressure and capital committees",
    ],
    sourceBoundary:
      "Hospital ROI is a buy-side framework derived from official placements, lease mix, ASP proxy, and recurring mix; qualitative comments remain research-only.",
  };
}

