import { actualData } from "./actuals";

const value = (metric: { value: number | null }) => metric.value ?? 0;
const safeDivide = (numerator: number, denominator: number) => (denominator ? numerator / denominator : 0);

export const revenueMixData = actualData.map((period, index) => {
  const prior = actualData[index - 1];
  const totalRevenue = value(period.revenue.total);
  const instrumentsAccessoriesRevenue = value(period.revenue.instrumentsAccessories);
  const systemsRevenue = value(period.revenue.systems);
  const servicesRevenue = value(period.revenue.services);
  const priorTotal = prior ? value(prior.revenue.total) : 0;
  const priorIa = prior ? value(prior.revenue.instrumentsAccessories) : 0;
  const priorSystems = prior ? value(prior.revenue.systems) : 0;
  const priorServices = prior ? value(prior.revenue.services) : 0;

  return {
    periodId: period.periodId,
    label: period.label,
    totalRevenue,
    instrumentsAccessoriesRevenue,
    systemsRevenue,
    servicesRevenue,
    recurringRevenue: instrumentsAccessoriesRevenue + servicesRevenue,
    recurringRevenueMix: safeDivide(instrumentsAccessoriesRevenue + servicesRevenue, totalRevenue),
    instrumentsAccessoriesMix: safeDivide(instrumentsAccessoriesRevenue, totalRevenue),
    systemsMix: safeDivide(systemsRevenue, totalRevenue),
    servicesMix: safeDivide(servicesRevenue, totalRevenue),
    totalRevenueGrowth: priorTotal ? totalRevenue / priorTotal - 1 : null,
    instrumentsAccessoriesGrowth: priorIa ? instrumentsAccessoriesRevenue / priorIa - 1 : null,
    systemsGrowth: priorSystems ? systemsRevenue / priorSystems - 1 : null,
    servicesGrowth: priorServices ? servicesRevenue / priorServices - 1 : null,
    sourceStatus: "official_actual" as const,
  };
});

