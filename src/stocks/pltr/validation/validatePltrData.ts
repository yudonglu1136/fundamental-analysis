import type { ValidationWarning } from "../../types";
import type { PltrActualQuarter, PltrDataset, PltrMetric } from "../model";

const impossibleNegativeKeys = new Set([
  "revenue",
  "customerCount",
  "commercialCustomerCount",
  "usCommercialCustomerCount",
  "cashAndEquivalents",
  "rpo",
  "billings",
  "dilutedShareCount",
]);

const requiredLatestKeys = [
  "revenue",
  "yoyRevenueGrowth",
  "usCommercialRevenue",
  "usCommercialGrowth",
  "commercialRevenue",
  "governmentRevenue",
  "customerCount",
  "commercialCustomerCount",
  "adjustedOperatingIncome",
  "gaapOperatingIncome",
  "adjustedOperatingMargin",
  "gaapOperatingMargin",
  "adjustedFreeCashFlow",
  "fcfMargin",
  "ruleOf40",
  "sbcExpense",
  "sbcAsPctRevenue",
  "netCash",
];

function warning(id: string, title: string, detail: string, severity: ValidationWarning["severity"]): ValidationWarning {
  return { id, title, detail, severity };
}

function validateMetric(period: PltrActualQuarter, metric: PltrMetric): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  if (metric.value != null && impossibleNegativeKeys.has(metric.key) && metric.value < 0) {
    warnings.push(warning(`pltr-negative-${period.periodId}-${metric.key}`, "Impossible negative metric", `${period.label} ${metric.label} is negative.`, "high"));
  }
  if (metric.value != null && !metric.sourceUrl && metric.sourceType !== "assumption") {
    warnings.push(warning(`pltr-missing-source-${period.periodId}-${metric.key}`, "Missing source URL", `${period.label} ${metric.label} has a value but no source URL.`, "high"));
  }
  if (metric.value == null && metric.sourceConfidence !== "todo") {
    warnings.push(warning(`pltr-null-confidence-${period.periodId}-${metric.key}`, "Null metric confidence mismatch", `${period.label} ${metric.label} is null but not tagged todo.`, "low"));
  }
  if (metric.unit === "percent" && metric.value != null && Math.abs(metric.value) > 5) {
    warnings.push(warning(`pltr-percent-scale-${period.periodId}-${metric.key}`, "Percent scale looks wrong", `${period.label} ${metric.label} is ${metric.value}, expected decimal percent scale.`, "medium"));
  }
  return warnings;
}

export function validatePltrData(dataset: PltrDataset): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const seenPeriods = new Set<string>();
  for (const period of dataset.actuals) {
    if (seenPeriods.has(period.periodId)) {
      warnings.push(warning(`pltr-duplicate-period-${period.periodId}`, "Duplicated period", `${period.periodId} appears more than once.`, "high"));
    }
    seenPeriods.add(period.periodId);
    for (const metric of Object.values(period.metrics)) {
      warnings.push(...validateMetric(period, metric));
    }
  }

  const latest = dataset.actuals[dataset.actuals.length - 1];
  if (latest) {
    for (const key of requiredLatestKeys) {
      const metric = latest.metrics[key];
      if (!metric || metric.value == null) {
        warnings.push(warning(`pltr-latest-missing-${key}`, "Missing latest key metric", `${latest.label} is missing ${key}.`, "high"));
      }
    }
  }

  for (const guidance of dataset.guidance) {
    if (!guidance.sourceUrl) {
      warnings.push(warning(`pltr-guidance-source-${guidance.id}`, "Guidance missing source URL", `${guidance.metric} guidance has no source URL.`, "high"));
    }
    if (guidance.low != null && guidance.high != null && guidance.low > guidance.high) {
      warnings.push(warning(`pltr-guidance-range-${guidance.id}`, "Guidance range is inverted", `${guidance.metric} low is greater than high.`, "high"));
    }
  }

  return warnings;
}
