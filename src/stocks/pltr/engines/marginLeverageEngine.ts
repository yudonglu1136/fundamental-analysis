import type { PltrActualQuarter } from "../model";
import { metricValue } from "./helpers";

export function calculateMarginLeverageEngine(actuals: PltrActualQuarter[]) {
  return actuals.map((period) => ({
    period: period.label,
    revenueGrowth: metricValue(period, "yoyRevenueGrowth"),
    adjustedOperatingMargin: metricValue(period, "adjustedOperatingMargin"),
    gaapOperatingMargin: metricValue(period, "gaapOperatingMargin"),
    fcfMargin: metricValue(period, "fcfMargin"),
    ruleOf40: metricValue(period, "ruleOf40"),
    adjustedOperatingIncome: metricValue(period, "adjustedOperatingIncome"),
    gaapOperatingIncome: metricValue(period, "gaapOperatingIncome"),
  }));
}
