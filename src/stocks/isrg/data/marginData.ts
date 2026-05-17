import { actualData } from "./actuals";

const value = (metric: { value: number | null }) => metric.value ?? 0;
const safeDivide = (numerator: number, denominator: number) => (denominator ? numerator / denominator : 0);

export const marginData = actualData.map((period) => {
  const totalRevenue = value(period.revenue.total);
  const operatingIncome = value(period.operatingIncome);
  const nonGaapOperatingIncome = value(period.nonGaapOperatingIncome);
  return {
    periodId: period.periodId,
    label: period.label,
    grossMargin: value(period.gaapGrossMargin) || safeDivide(value(period.grossProfit), totalRevenue),
    nonGaapGrossMargin: value(period.nonGaapGrossMargin) || null,
    operatingMargin: safeDivide(operatingIncome, totalRevenue),
    nonGaapOperatingMargin: nonGaapOperatingIncome ? safeDivide(nonGaapOperatingIncome, totalRevenue) : null,
    sbcAsRevenue: safeDivide(value(period.sbcExpense), totalRevenue),
    sourceStatus: "official_actual" as const,
  };
});

