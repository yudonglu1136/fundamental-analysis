import type { Scenario, ValidationWarning } from "../../types";
import type {
  LsegDashboardDataset,
  LsegRevenueForecastRow,
  LsegScenarioAssumptions,
  LsegSegmentName,
  ReportedLsegSegmentName,
} from "../model";
import { getPeriodById, getSegmentPoint, getSegmentsByPeriod, growthRateFromAssumption, safeRatio } from "./helpers";

export type LsegRevenueEngineResult = {
  scenario: Scenario;
  taxonomy: LsegScenarioAssumptions["segmentTaxonomy"];
  rows: LsegRevenueForecastRow[];
  groupRevenueByYear: Array<{
    fiscalYear: number;
    revenue: number;
    growth: number;
    mixBySegment: Partial<Record<LsegSegmentName, number>>;
    contributionToGroupGrowth: Partial<Record<LsegSegmentName, number>>;
    marketsBridge?: {
      structuralGrowth: number;
      normalizedVolumeGrowth: number;
      pricingContribution: number;
      fixedFeeContribution: number;
      cyclicalUplift: number;
      cyclicalFade: number;
      totalGrowth: number;
    };
  }>;
  warnings: ValidationWarning[];
};

const FORECAST_YEARS = 5;
const REPORTED_SEGMENTS: ReportedLsegSegmentName[] = [
  "Data & Analytics",
  "FTSE Russell",
  "Risk Intelligence",
  "Markets",
  "Other",
];

function averageTradewebField(data: LsegDashboardDataset, field: keyof LsegDashboardDataset["tradewebMonthly"][number]) {
  const values = data.tradewebMonthly
    .map((row) => row[field])
    .filter((value): value is number => typeof value === "number");
  return safeRatio(values.reduce((sum, value) => sum + value, 0), Math.max(values.length, 1));
}

export function calculateRevenueEngine(
  data: LsegDashboardDataset,
  periodId: string,
  assumptions: LsegScenarioAssumptions,
): LsegRevenueEngineResult {
  const basePeriod = getPeriodById(data, periodId);
  const guidancePeriod = data.guidance.find((item) => item.guidanceYear === basePeriod.fiscalYear + 1);
  const rows: LsegRevenueForecastRow[] = [];
  const warnings: ValidationWarning[] = [];
  const segments = assumptions.segmentTaxonomy === "reported_2025"
    ? REPORTED_SEGMENTS
    : (["Data & Analytics", "FTSE Russell", "Risk Intelligence", "Capital Markets", "Post Trade", "Other"] as LsegSegmentName[]);
  const priorRevenueBySegment = Object.fromEntries(
    segments.map((segment) => {
      const point = getSegmentPoint(data, periodId, segment, assumptions.segmentTaxonomy);
      return [segment, point.revenue];
    }),
  ) as Record<LsegSegmentName, number>;
  const averageStructuralMarketsGrowth = averageTradewebField(data, "structuralGrowthEstimate");
  const averageCyclicalMarketsUplift = averageTradewebField(data, "cyclicalUpliftEstimate");
  const averageNormalizedMarketsGrowth = averageTradewebField(data, "normalizedAdvGrowth");
  const averageFeePerMillion = averageTradewebField(data, "feePerMillion");

  const groupRevenueByYear: LsegRevenueEngineResult["groupRevenueByYear"] = [];
  let priorGroupRevenue = basePeriod.totalIncomeExcludingRecoveries;

  for (let yearIndex = 1; yearIndex <= FORECAST_YEARS; yearIndex += 1) {
    const fiscalYear = basePeriod.fiscalYear + yearIndex;
    const mixBySegment = {} as Partial<Record<LsegSegmentName, number>>;
    const contributionToGroupGrowth = {} as Partial<Record<LsegSegmentName, number>>;
    let marketsBridge: LsegRevenueEngineResult["groupRevenueByYear"][number]["marketsBridge"];

    for (const segment of segments) {
      const basePoint = getSegmentPoint(data, periodId, segment, assumptions.segmentTaxonomy);
      const assumption = assumptions.segmentGrowth[segment];
      if (!assumption) {
        continue;
      }
      const bridge = growthRateFromAssumption(assumption, yearIndex);
      const beginningRevenue = priorRevenueBySegment[segment];
      let totalGrowth = bridge.totalGrowth;

      if (segment === "Markets") {
        const structuralGrowth = averageStructuralMarketsGrowth || bridge.organicGrowth;
        const normalizedVolumeGrowth = Math.max((averageNormalizedMarketsGrowth || bridge.volumeContribution) - structuralGrowth, 0);
        const pricingContribution = bridge.pricingContribution * (averageFeePerMillion > 2.7 ? 1.05 : 1);
        const fixedFeeContribution = 0.003;
        const cyclicalUplift = Math.max(averageCyclicalMarketsUplift - ((yearIndex - 1) * 0.01), 0);
        const cyclicalFade = yearIndex > 1 ? Math.min((yearIndex - 1) * 0.006, cyclicalUplift) : 0;
        totalGrowth = structuralGrowth + normalizedVolumeGrowth + pricingContribution + fixedFeeContribution + cyclicalUplift - cyclicalFade;
        marketsBridge = {
          structuralGrowth,
          normalizedVolumeGrowth,
          pricingContribution,
          fixedFeeContribution,
          cyclicalUplift,
          cyclicalFade,
          totalGrowth,
        };
      }

      const endingRevenue = beginningRevenue * (1 + totalGrowth);

      rows.push({
        fiscalYear,
        scenario: assumptions.scenario,
        segment,
        revenueDefinition: basePoint.revenueDefinition,
        beginningRevenue,
        organicGrowth: bridge.organicGrowth,
        pricingContribution: bridge.pricingContribution,
        volumeContribution: bridge.volumeContribution,
        acquisitionContribution: bridge.acquisitionContribution,
        disposalImpact: bridge.disposalImpact,
        fxImpact: bridge.fxImpact,
        totalGrowth,
        endingRevenue,
      });

      priorRevenueBySegment[segment] = endingRevenue;
    }

    const yearRows = rows.filter((row) => row.fiscalYear === fiscalYear);
    let groupRevenue = yearRows.reduce((sum, row) => sum + row.endingRevenue, 0);

    // The first forecast year is explicitly calibrated to management guidance so
    // the model respects real operating guideposts before longer-dated forecasts
    // begin fading toward steady-state assumptions.
    if (
      assumptions.scenario === "Base" &&
      fiscalYear === guidancePeriod?.guidanceYear &&
      groupRevenue > 0
    ) {
      const targetGrowth = (guidancePeriod.revenueGrowthLow + guidancePeriod.revenueGrowthHigh) / 2;
      const targetRevenue = priorGroupRevenue * (1 + targetGrowth);
      const scaleFactor = targetRevenue / groupRevenue;
      yearRows.forEach((row) => {
        row.endingRevenue *= scaleFactor;
      });
      segments.forEach((segment) => {
        const calibratedRow = yearRows.find((row) => row.segment === segment);
        if (calibratedRow) {
          priorRevenueBySegment[segment] = calibratedRow.endingRevenue;
        }
      });
      groupRevenue = targetRevenue;
    }

    const groupGrowth = safeRatio(groupRevenue - priorGroupRevenue, priorGroupRevenue);

    for (const segment of segments) {
      const segmentRow = yearRows.find((row) => row.segment === segment);
      const segmentRevenue = segmentRow?.endingRevenue ?? 0;
      mixBySegment[segment] = safeRatio(segmentRevenue, groupRevenue);
      contributionToGroupGrowth[segment] = safeRatio(segmentRevenue - (segmentRow?.beginningRevenue ?? 0), priorGroupRevenue);
    }

    if (fiscalYear === 2026 && assumptions.scenario === "Base" && guidancePeriod && (groupGrowth < guidancePeriod.revenueGrowthLow || groupGrowth > guidancePeriod.revenueGrowthHigh)) {
      warnings.push({
        id: "lseg-revenue-guidance",
        title: "2026 group growth sits outside management guidance",
        detail: "Base-case revenue growth should stay near the 6.5% to 7.5% management range unless another driver is explicitly disclosed.",
        severity: "high",
      });
    }
    if ((marketsBridge?.cyclicalUplift ?? 0) > 0.015) {
      warnings.push({
        id: `lseg-markets-cyclical-${fiscalYear}`,
        title: "Markets growth includes cyclical volume uplift",
        detail: "Markets growth includes cyclical volume uplift; do not fully capitalize it into the terminal multiple.",
        severity: "medium",
      });
    }

    groupRevenueByYear.push({
      fiscalYear,
      revenue: groupRevenue,
      growth: groupGrowth,
      mixBySegment,
      contributionToGroupGrowth,
      marketsBridge,
    });
    priorGroupRevenue = groupRevenue;
  }

  return {
    scenario: assumptions.scenario,
    taxonomy: assumptions.segmentTaxonomy,
    rows,
    groupRevenueByYear,
    warnings,
  };
}
