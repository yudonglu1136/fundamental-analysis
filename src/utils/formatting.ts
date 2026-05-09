import type { MetricFormat } from "../stocks/types";

export function formatValue(value: number, format: MetricFormat, currency = "USD") {
  if (format === "currency") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 1 }).format(value);
  }
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  if (format === "multiple") return `${value.toFixed(1)}x`;
  return value.toFixed(1);
}

export function formatDate(date: string) {
  return date;
}
