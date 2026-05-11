import type {
  LsegDashboardDataset,
  LsegFinancialPeriod,
  LsegGrowthAssumption,
  LsegMarginAssumption,
  LsegSegmentFinancialPoint,
  LsegSegmentName,
  LsegSegmentTaxonomy,
} from "../model";

export function getPeriodById(data: LsegDashboardDataset, periodId: string): LsegFinancialPeriod {
  const period = data.periods.find((item) => item.id === periodId);
  if (!period) {
    return data.periods[data.periods.length - 1];
  }
  return period;
}

export function getSegmentsByPeriod(
  data: LsegDashboardDataset,
  periodId: string,
  taxonomy?: LsegSegmentTaxonomy,
): LsegSegmentFinancialPoint[] {
  return data.segmentFinancials.filter((item) => item.periodId === periodId && (!taxonomy || item.taxonomy === taxonomy));
}

export function getSegmentPoint(
  data: LsegDashboardDataset,
  periodId: string,
  segment: LsegSegmentName,
  taxonomy?: LsegSegmentTaxonomy,
): LsegSegmentFinancialPoint {
  const point = data.segmentFinancials.find((item) => item.periodId === periodId && item.segment === segment && (!taxonomy || item.taxonomy === taxonomy));
  if (!point) {
    throw new Error(`Missing segment point for ${segment} in ${periodId}${taxonomy ? ` (${taxonomy})` : ""}`);
  }
  return point;
}

export function interpolateValue(start: number, end: number, yearIndex: number, totalYears = 5) {
  if (totalYears <= 1) return end;
  const progress = Math.min(Math.max((yearIndex - 1) / (totalYears - 1), 0), 1);
  return start + ((end - start) * progress);
}

export function growthRateFromAssumption(assumption: LsegGrowthAssumption, yearIndex: number) {
  const organicGrowth = interpolateValue(assumption.organicGrowthStart, assumption.organicGrowthFadeTo, yearIndex);
  return {
    organicGrowth,
    pricingContribution: assumption.pricingContribution,
    volumeContribution: assumption.volumeContribution,
    acquisitionContribution: assumption.acquisitionContribution,
    disposalImpact: assumption.disposalImpact,
    fxImpact: assumption.fxImpact,
    totalGrowth:
      organicGrowth +
      assumption.pricingContribution +
      assumption.volumeContribution +
      assumption.acquisitionContribution -
      assumption.disposalImpact +
      assumption.fxImpact,
  };
}

export function marginDeltaFromAssumption(assumption: LsegMarginAssumption, yearIndex: number) {
  const fade = Math.max(yearIndex - 1, 0) * assumption.annualFadeBps;
  const operatingLeverageBps = Math.max(assumption.operatingLeverageBps - fade, 0);
  const synergyBenefitBps = Math.max(assumption.synergyBenefitBps - fade * 0.4, 0);
  const productivityBenefitBps = Math.max(assumption.productivityBenefitBps - fade * 0.25, 0);
  const reinvestmentBps = assumption.reinvestmentBps;
  const costInflationBps = assumption.costInflationBps;

  return {
    operatingLeverageBps,
    synergyBenefitBps,
    productivityBenefitBps,
    reinvestmentBps,
    costInflationBps,
    netBps:
      operatingLeverageBps +
      synergyBenefitBps +
      productivityBenefitBps -
      reinvestmentBps -
      costInflationBps,
  };
}

export function safeRatio(numerator: number, denominator: number) {
  if (Math.abs(denominator) < 1e-9) return 0;
  return numerator / denominator;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
