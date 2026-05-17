import type { IsrgDataLayer } from "./model";
import { metricValue, safeDivide } from "./utils";

export function calculateDaVinci5Engine(data: IsrgDataLayer) {
  const adoptionCurve = data.actualData
    .filter((period) => metricValue(period.placements.daVinciPlacements) > 0)
    .map((period) => ({
      period: period.label,
      daVinciPlacements: metricValue(period.placements.daVinciPlacements),
      daVinci5Placements: metricValue(period.placements.daVinci5Placements),
      placementShare: safeDivide(metricValue(period.placements.daVinci5Placements), metricValue(period.placements.daVinciPlacements)),
      leaseMix: safeDivide(metricValue(period.placements.operatingLeasePlacements), metricValue(period.placements.daVinciPlacements)),
    }));
  const latest = adoptionCurve[adoptionCurve.length - 1];
  const events = data.researchOnlyData.productEvents.filter((event) => event.platform === "da Vinci 5" || event.platform === "Digital");

  return {
    adoptionCurve,
    latestPlacementShare: latest?.placementShare ?? 0,
    latestDaVinci5Placements: latest?.daVinci5Placements ?? 0,
    approvalTimeline: events,
    features: [
      "Force feedback designed to reduce tissue force and improve surgeon feel.",
      "Improved vision, ergonomics, and console experience.",
      "Higher compute capability enabling digital surgery and real-time insights.",
      "Case insights and data layer are product-cycle evidence, not automatic multiple expansion.",
    ],
    assumptionMapping: [
      "Replacement cycle maps to daVinci5ReplacementCycleUplift.",
      "ASP uplift maps to systemAspGrowth only when backed by recognized revenue data.",
      "Margin implication maps to operatingMargin and tariffGrossMarginDrag, not a direct valuation multiple increase.",
    ],
    scenarioAssumptions: {
      Bull: "da Vinci 5 expands both replacement cycle and procedure TAM through workflow and digital capability.",
      Base: "da Vinci 5 supports placements and upgrades but procedure growth gradually moderates.",
      Bear: "da Vinci 5 is mostly a replacement cycle with limited TAM expansion and some margin/lease-mix pressure.",
    },
    warning:
      "da Vinci 5 narrative is research-only unless an analyst explicitly changes replacement, ASP, utilization, or margin assumptions.",
  };
}
