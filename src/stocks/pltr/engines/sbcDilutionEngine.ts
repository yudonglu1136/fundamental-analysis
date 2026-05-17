import type { PltrActualQuarter } from "../model";
import { metricValue, nullableMetricValue, safeDivide } from "./helpers";

export function calculateSbcDilutionEngine(actuals: PltrActualQuarter[]) {
  const rows = actuals.map((period, index) => {
    const priorYear = actuals.find((candidate) => candidate.fiscalYear === period.fiscalYear - 1 && candidate.fiscalQuarter === period.fiscalQuarter);
    const shareCount = nullableMetricValue(period, "dilutedShareCount");
    const priorShareCount = priorYear ? nullableMetricValue(priorYear, "dilutedShareCount") : null;
    const adjustedFcf = metricValue(period, "adjustedFreeCashFlow");
    const currentShareProxy = shareCount ?? (index === actuals.length - 1 ? 2562 : null);
    return {
      period: period.label,
      sbcExpense: nullableMetricValue(period, "sbcExpense"),
      sbcAsPctRevenue: nullableMetricValue(period, "sbcAsPctRevenue"),
      dilutedShareCount: shareCount,
      yoyShareCountGrowth: shareCount && priorShareCount ? shareCount / priorShareCount - 1 : null,
      adjustedFreeCashFlow: adjustedFcf || null,
      perShareFcf: currentShareProxy ? safeDivide(adjustedFcf, currentShareProxy) : null,
      gaapOperatingMargin: nullableMetricValue(period, "gaapOperatingMargin"),
      adjustedOperatingMargin: nullableMetricValue(period, "adjustedOperatingMargin"),
    };
  });

  return {
    rows,
    warning:
      "Do not value PLTR only on company-level FCF. Check SBC, diluted share count, and per-share FCF because dilution can offset operating progress.",
  };
}
