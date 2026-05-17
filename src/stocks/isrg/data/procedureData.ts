import { actualData } from "./actuals";

const value = (metric: { value: number | null }) => metric.value ?? 0;
const safeDivide = (numerator: number, denominator: number) => (denominator ? numerator / denominator : 0);

export const procedureData = actualData.map((period, index) => {
  const prior = actualData[index - 1];
  const daVinciProcedures = value(period.procedures.worldwideDaVinciProcedures);
  const installedBase = value(period.installedBase.daVinciInstalledBase);
  const priorInstalledBase = prior ? value(prior.installedBase.daVinciInstalledBase) : 0;
  const averageInstalledBase = priorInstalledBase ? (installedBase + priorInstalledBase) / 2 : installedBase;
  return {
    periodId: period.periodId,
    label: period.label,
    worldwideDaVinciProcedures: daVinciProcedures || null,
    worldwideDaVinciProcedureGrowth: value(period.procedures.worldwideDaVinciProcedureGrowth) || null,
    worldwideCombinedProcedureGrowth: value(period.procedures.worldwideCombinedProcedureGrowth) || null,
    usDaVinciProcedureGrowth: value(period.procedures.usDaVinciProcedureGrowth) || null,
    ousDaVinciProcedureGrowth: value(period.procedures.ousDaVinciProcedureGrowth) || null,
    ionProcedureGrowth: value(period.procedures.ionProcedureGrowth) || null,
    proceduresPerInstalledSystem: daVinciProcedures ? safeDivide(daVinciProcedures, averageInstalledBase) : null,
    installedBaseGrowth: priorInstalledBase ? installedBase / priorInstalledBase - 1 : null,
    growthSpreadVsInstalledBase:
      priorInstalledBase && value(period.procedures.worldwideDaVinciProcedureGrowth)
        ? value(period.procedures.worldwideDaVinciProcedureGrowth) - (installedBase / priorInstalledBase - 1)
        : null,
    commentary: period.procedures.commentary,
    sourceStatus: "official_actual" as const,
  };
});

