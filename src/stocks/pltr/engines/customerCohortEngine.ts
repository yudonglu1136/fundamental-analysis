import type { ValidationWarning } from "../../types";
import type { PltrActualQuarter } from "../model";
import { metricValue, safeDivide } from "./helpers";

export function calculateCustomerCohortEngine(actuals: PltrActualQuarter[]) {
  const warnings: ValidationWarning[] = [];
  const rows = actuals.map((period) => {
    const revenue = metricValue(period, "revenue");
    const customerCount = metricValue(period, "customerCount");
    const commercialRevenue = metricValue(period, "commercialRevenue");
    const commercialCustomers = metricValue(period, "commercialCustomerCount");
    const usCommercialCustomers = metricValue(period, "usCommercialCustomerCount");
    if (!customerCount) {
      warnings.push({
        id: `pltr-missing-customer-count-${period.periodId}`,
        title: "Missing customer count",
        detail: `${period.label} is missing total customer count.`,
        severity: "medium",
      });
    }
    return {
      period: period.label,
      customerCount,
      commercialCustomers,
      usCommercialCustomers,
      revenuePerCustomer: safeDivide(revenue, customerCount),
      commercialRevenuePerCommercialCustomer: safeDivide(commercialRevenue, commercialCustomers),
      netDollarRetention: metricValue(period, "netDollarRetention"),
      largeDeals10m: metricValue(period, "largeDeals10m"),
      broadBasedSignal:
        metricValue(period, "commercialCustomerCount") > 0 && metricValue(period, "commercialRevenue") > 0
          ? "Customer and revenue data available"
          : "Needs concentration data",
    };
  });
  return { rows, warnings };
}
