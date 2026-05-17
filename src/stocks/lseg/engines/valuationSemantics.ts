import type {
  LsegCockpitDataset,
  LsegEventSnapshotSourceType,
  LsegOfficialActual,
  LsegValuationSnapshotSemantics,
} from "../types";

function isFullYearPeriod(period: LsegOfficialActual) {
  return /^fy\d{4}$/i.test(period.periodId) || period.label.toLowerCase().includes("fy");
}

function eventSourceType(data: LsegCockpitDataset): LsegEventSnapshotSourceType {
  const sourceType = data.valuationSemantics?.sourceType;
  if (sourceType) return sourceType;
  return "annual_report";
}

export function getLatestAuditedLsegActual(data: LsegCockpitDataset): LsegOfficialActual {
  const officialFullYear = data.officialActuals
    .filter((period) => period.sourceType === "official_actual" && isFullYearPeriod(period))
    .sort((left, right) => left.fiscalYear - right.fiscalYear);
  return officialFullYear[officialFullYear.length - 1] ?? data.officialActuals[data.officialActuals.length - 1];
}

function getLatestEventPeriod(data: LsegCockpitDataset): LsegOfficialActual {
  return data.officialActuals[data.officialActuals.length - 1] ?? getLatestAuditedLsegActual(data);
}

export function resolveLsegValuationSemantics(data: LsegCockpitDataset): LsegValuationSnapshotSemantics {
  if (data.valuationSemantics) return data.valuationSemantics;

  const audited = getLatestAuditedLsegActual(data);
  const latest = getLatestEventPeriod(data);
  const latestIsRunRate = latest.sourceType !== "official_actual" || !isFullYearPeriod(latest);
  const runRate = latestIsRunRate ? latest : undefined;
  const isSameYearForecastAnchor = Boolean(runRate && runRate.fiscalYear === audited.fiscalYear + 1);
  const forecastStartYear = runRate?.fiscalYear ?? audited.fiscalYear + 1;
  const firstGrowthYear = forecastStartYear + (latestIsRunRate && isSameYearForecastAnchor ? 1 : 0);
  const runRateLabel = runRate ? `${runRate.label} annualized run-rate` : `${audited.label} actual`;
  const sourceConfidence = runRate ? "medium" : "high";

  return {
    auditedActualBase: {
      periodId: audited.periodId,
      fiscalYear: audited.fiscalYear,
      label: audited.label,
      revenue: audited.totalIncomeExRecoveries,
      adjustedEbitda: audited.adjustedEbitda,
      equityFreeCashFlow: audited.equityFreeCashFlow,
      adjustedEpsPence: audited.adjustedEpsPence,
      dilutedShares: audited.weightedAverageShares,
      sourceType: audited.sourceType,
    },
    eventVisibleRunRate: runRate
      ? {
          periodId: runRate.periodId,
          fiscalYear: runRate.fiscalYear,
          label: runRate.label,
          revenue: runRate.totalIncomeExRecoveries,
          adjustedEbitda: runRate.adjustedEbitda,
          adjustedEbitdaMargin: runRate.adjustedEbitdaMargin,
          equityFreeCashFlow: runRate.equityFreeCashFlow,
          adjustedEpsPence: runRate.adjustedEpsPence,
          dilutedShares: runRate.weightedAverageShares,
          sourceType: runRate.sourceType,
        }
      : undefined,
    guidanceAnchor: data.managementGuidance[0]
      ? {
          sourceId: data.managementGuidance[0].sourceId,
          fiscalYear: data.managementGuidance[0].year,
          organicTotalIncomeGrowthLow: data.managementGuidance[0].organicTotalIncomeGrowthLow,
          organicTotalIncomeGrowthHigh: data.managementGuidance[0].organicTotalIncomeGrowthHigh,
          equityFreeCashFlowFloor: data.managementGuidance[0].equityFreeCashFlowFloor,
        }
      : undefined,
    forecastStartYear,
    firstGrowthYear,
    isAnnualizedRunRate: latestIsRunRate,
    isSameYearForecastAnchor,
    dcfYearOneGrowthSuppressed: latestIsRunRate && isSameYearForecastAnchor,
    sourceType: eventSourceType(data),
    methodBases: {
      dcf: {
        valuationBase: runRate
          ? `${runRate.label} FY${forecastStartYear}E run-rate anchor, growth resumes from FY${firstGrowthYear}E`
          : `${audited.label} actual base, first forecast year is FY${forecastStartYear}E`,
        baseYear: audited.fiscalYear,
        forecastYear: forecastStartYear,
        sourceConfidence,
      },
      fcfYield: {
        valuationBase: runRate ? `Normalized FY${forecastStartYear}E equity FCF` : `${audited.label} equity FCF plus guidance floor`,
        baseYear: audited.fiscalYear,
        forecastYear: forecastStartYear,
        sourceConfidence,
      },
      sotp: {
        valuationBase: runRate ? `Run-rate SOTP using event-visible FY${forecastStartYear}E EBITDA` : `${audited.label} actual EBITDA SOTP`,
        baseYear: audited.fiscalYear,
        forecastYear: runRate?.fiscalYear ?? audited.fiscalYear,
        sourceConfidence,
      },
      evEbitda: {
        valuationBase: runRate ? `FY${forecastStartYear}E / NTM EBITDA` : `FY${forecastStartYear}E EBITDA forecast from ${audited.label}`,
        baseYear: audited.fiscalYear,
        forecastYear: forecastStartYear,
        sourceConfidence,
      },
      pe: {
        valuationBase: runRate ? `FY${forecastStartYear}E EPS` : `FY${forecastStartYear}E EPS forecast from ${audited.label}`,
        baseYear: audited.fiscalYear,
        forecastYear: forecastStartYear,
        sourceConfidence,
      },
      platformMoat: {
        valuationBase: runRate ? `${runRateLabel} core valuation overlay` : `${audited.label} core valuation overlay`,
        baseYear: audited.fiscalYear,
        forecastYear: forecastStartYear,
        sourceConfidence,
      },
    },
  };
}
