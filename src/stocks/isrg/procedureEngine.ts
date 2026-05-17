import type { ValidationWarning } from "../types";
import type { IsrgDataLayer } from "./model";
import { latestActual, latestFullYear, metricMaybe, metricValue, priorFullYear, safeDivide, yoy } from "./utils";

export function calculateProcedureEngine(data: IsrgDataLayer) {
  const latest = latestActual(data);
  const fy = latestFullYear(data);
  const priorFy = priorFullYear(data, fy);
  const daVinciProcedures = metricMaybe(fy.procedures.worldwideDaVinciProcedures);
  const priorProcedures = metricMaybe(priorFy?.procedures.worldwideDaVinciProcedures);
  const procedureGrowth = metricValue(
    latest.procedures.worldwideDaVinciProcedureGrowth.value != null
      ? latest.procedures.worldwideDaVinciProcedureGrowth
      : fy.procedures.worldwideDaVinciProcedureGrowth,
  );
  const combinedProcedureGrowth = metricValue(
    latest.procedures.worldwideCombinedProcedureGrowth.value != null
      ? latest.procedures.worldwideCombinedProcedureGrowth
      : fy.procedures.worldwideCombinedProcedureGrowth,
  );
  const ionProcedureGrowth = metricValue(
    latest.procedures.ionProcedureGrowth.value != null ? latest.procedures.ionProcedureGrowth : fy.procedures.ionProcedureGrowth,
  );
  const daVinciInstalledBase = metricValue(fy.installedBase.daVinciInstalledBase);
  const priorDaVinciInstalledBase = metricMaybe(priorFy?.installedBase.daVinciInstalledBase);
  const averageDaVinciBase =
    priorDaVinciInstalledBase && daVinciInstalledBase ? (priorDaVinciInstalledBase + daVinciInstalledBase) / 2 : daVinciInstalledBase;
  const proceduresPerSystem = safeDivide(daVinciProcedures, averageDaVinciBase);
  const installedBaseGrowth = yoy(daVinciInstalledBase, priorDaVinciInstalledBase) ?? 0;
  const utilizationGrowth = (metricValue(fy.procedures.worldwideDaVinciProcedureGrowth) || (yoy(daVinciProcedures, priorProcedures) ?? 0)) - installedBaseGrowth;
  const guidance = data.officialGuidance.find((item) => item.id === "fy2026-da-vinci-procedure-growth");

  const bridge = [
    {
      label: "Installed base growth",
      value: installedBaseGrowth,
      description: "Contribution from more da Vinci systems in the field.",
    },
    {
      label: "Utilization / mix",
      value: utilizationGrowth,
      description: "Procedure growth above installed-base growth, a proxy for utilization and procedure mix.",
    },
    {
      label: "Total procedure growth",
      value: metricValue(fy.procedures.worldwideDaVinciProcedureGrowth),
      description: "Reported FY 2025 worldwide da Vinci procedure growth.",
    },
  ];

  const warnings: ValidationWarning[] = [];
  if (!daVinciProcedures) {
    warnings.push({
      id: "isrg-procedure-count-missing",
      title: "Latest procedure count is missing",
      detail: "Quarterly procedure counts are not disclosed in the starter extraction; latest full-year procedure count is used where available.",
      severity: "medium",
    });
  }
  if (procedureGrowth < installedBaseGrowth) {
    warnings.push({
      id: "isrg-procedure-growth-below-installed-base",
      title: "Procedure growth is below installed-base growth",
      detail: "This would imply utilization pressure and should be reviewed against management commentary and procedure mix.",
      severity: "high",
    });
  }

  return {
    latestPeriod: latest.periodId,
    latestFullYear: fy.periodId,
    worldwideDaVinciProcedures: daVinciProcedures,
    priorWorldwideDaVinciProcedures: priorProcedures,
    procedureGrowth,
    combinedProcedureGrowth,
    usProcedureGrowth: metricMaybe(fy.procedures.usDaVinciProcedureGrowth),
    ousProcedureGrowth: metricMaybe(fy.procedures.ousDaVinciProcedureGrowth),
    ionProcedureGrowth,
    procedureGuidanceLow: guidance?.low ?? null,
    procedureGuidanceHigh: guidance?.high ?? null,
    procedureGuidanceMidpoint: guidance?.midpoint ?? null,
    proceduresPerSystem,
    installedBaseGrowth,
    utilizationGrowth,
    bridge,
    glp1RiskFrame:
      "GLP-1 risk is monitored through bariatric/general surgery commentary. It is research-only unless procedure category data is validated and mapped to assumptions.",
    keyQuestions: [
      "Is procedure growth still above installed-base growth?",
      "Is OUS growth enough to support the long-duration TAM case?",
      "If procedure growth slows from mid-teens to low-teens, how much I&A revenue growth remains?",
      "Does GLP-1 pressure bariatric procedures, or is mix broad enough to offset it?",
    ],
    warnings,
  };
}
