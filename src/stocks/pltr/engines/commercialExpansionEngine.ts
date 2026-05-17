import type { PltrActualQuarter } from "../model";
import { metricValue, safeDivide } from "./helpers";

export function calculateCommercialExpansionEngine(actuals: PltrActualQuarter[]) {
  return actuals.map((period) => {
    const commercialRevenue = metricValue(period, "commercialRevenue");
    const usCommercialRevenue = metricValue(period, "usCommercialRevenue");
    const internationalCommercialRevenue =
      period.metrics.internationalCommercialRevenue.value ?? Math.max(commercialRevenue - usCommercialRevenue, 0);
    const commercialCustomerCount = metricValue(period, "commercialCustomerCount");
    return {
      period: period.label,
      commercialRevenue,
      usCommercialRevenue,
      internationalCommercialRevenue,
      commercialCustomerCount,
      commercialRevenuePerCustomer: safeDivide(commercialRevenue, commercialCustomerCount),
      usCommercialGrowth: metricValue(period, "usCommercialGrowth"),
      salesEfficiencySignal: metricValue(period, "largeDeals10m") > 0 ? "Improving" : "Needs source review",
    };
  });
}
