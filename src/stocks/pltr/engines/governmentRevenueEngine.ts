import type { PltrActualQuarter } from "../model";
import { metricValue, safeDivide } from "./helpers";

export function calculateGovernmentRevenueEngine(actuals: PltrActualQuarter[]) {
  return actuals.map((period) => {
    const governmentRevenue = metricValue(period, "governmentRevenue");
    const usGovernmentRevenue = metricValue(period, "usGovernmentRevenue");
    const internationalGovernmentRevenue =
      period.metrics.internationalGovernmentRevenue.value ?? Math.max(governmentRevenue - usGovernmentRevenue, 0);
    const revenue = metricValue(period, "revenue");
    return {
      period: period.label,
      governmentRevenue,
      usGovernmentRevenue,
      internationalGovernmentRevenue,
      governmentMix: safeDivide(governmentRevenue, revenue),
      moatScore: governmentRevenue > 0 ? 82 : 50,
      riskNote:
        governmentRevenue > 0
          ? "Mission-critical stickiness remains a strength, but procurement cycles and political/budget exposure are real risks."
          : "Government segment value is missing for this period.",
    };
  });
}
