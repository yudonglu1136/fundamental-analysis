import type { LsegFinancialPeriod, LsegSegmentFinancialPoint } from "../model";
import { indexProvenanceById, stripProvenance, type LsegRowWithProvenance } from "./provenance";

const forecastFinancialRows: LsegRowWithProvenance<LsegFinancialPeriod>[] = [
  {
    row: {
      id: "fy26",
      label: "FY 2026E",
      reportedYear: 2026,
      fiscalYear: 2026,
      periodType: "FY",
      sourceType: "guidance",
      totalIncomeExcludingRecoveries: 9630,
      organicConstantCurrencyGrowth: 0.07,
      adjustedEbitda: 4935,
      adjustedEbitdaMargin: 0.512,
      adjustedOperatingProfit: 3800,
      adjustedNetIncome: 2465,
      adjustedProfitAttributable: 2465,
      adjustedEps: 4.55,
      weightedAverageShares: 542,
      dilutedShares: 542,
      equityFreeCashFlow: 2745,
      cashTax: 825,
      capex: 915,
      capexIntensity: 0.095,
      netDebt: 7850,
      cashInterestExpense: 340,
      taxRate: 0.245,
      minorityInterest: 56,
      buybackAmount: 1500,
      dividendPerShare: 1.48,
      currentPrice: 107.8,
      notes: "2026E modeled compatibility anchor built from company guidance ranges and internal bridge assumptions.",
    },
    provenance: {
      id: "financial-period-fy26-forecast-anchor",
      qualityTag: "Forecast Anchor",
      sourceType: "derived",
      source: "Modeled FY2026 point estimate preserved for compatibility with the current valuation output. Anchored to company guidance ranges plus internal bridge assumptions.",
      asOfDate: "2026-03-06",
      period: "FY 2026E",
      confidenceLevel: "medium",
      notes: "Not a reported actual. Not a pure guidance row. This is the canonical forward bridge row that keeps current valuation behavior stable.",
    },
  },
];

const forecastReportedSegmentRows: LsegRowWithProvenance<LsegSegmentFinancialPoint>[] = [
  {
    row: {
      periodId: "fy26",
      segment: "Data & Analytics",
      taxonomy: "reported_2025",
      revenueDefinition: "revenue",
      revenue: 4555,
      adjustedEbitda: 1745,
      adjustedEbitdaMargin: 0.3831,
      sourceType: "guidance",
    },
    provenance: {
      id: "segment-fy26-data-analytics-forecast-anchor",
      qualityTag: "Forecast Anchor",
      sourceType: "derived",
      source: "Modeled FY2026 reported-taxonomy segment bridge row anchored to company guidance and the current margin/revenue bridge.",
      asOfDate: "2026-03-06",
      period: "FY 2026E",
      confidenceLevel: "medium",
    },
  },
  {
    row: {
      periodId: "fy26",
      segment: "FTSE Russell",
      taxonomy: "reported_2025",
      revenueDefinition: "revenue",
      revenue: 1021,
      adjustedEbitda: 691,
      adjustedEbitdaMargin: 0.6768,
      sourceType: "guidance",
    },
    provenance: {
      id: "segment-fy26-ftse-russell-forecast-anchor",
      qualityTag: "Forecast Anchor",
      sourceType: "derived",
      source: "Modeled FY2026 reported-taxonomy segment bridge row anchored to company guidance and the current margin/revenue bridge.",
      asOfDate: "2026-03-06",
      period: "FY 2026E",
      confidenceLevel: "medium",
    },
  },
  {
    row: {
      periodId: "fy26",
      segment: "Risk Intelligence",
      taxonomy: "reported_2025",
      revenueDefinition: "revenue",
      revenue: 637,
      adjustedEbitda: 377,
      adjustedEbitdaMargin: 0.5918,
      sourceType: "guidance",
    },
    provenance: {
      id: "segment-fy26-risk-intelligence-forecast-anchor",
      qualityTag: "Forecast Anchor",
      sourceType: "derived",
      source: "Modeled FY2026 reported-taxonomy segment bridge row anchored to company guidance and the current margin/revenue bridge.",
      asOfDate: "2026-03-06",
      period: "FY 2026E",
      confidenceLevel: "medium",
    },
  },
  {
    row: {
      periodId: "fy26",
      segment: "Markets",
      taxonomy: "reported_2025",
      revenueDefinition: "totalIncomeExcludingRecoveries",
      revenue: 3654,
      adjustedEbitda: 2108,
      adjustedEbitdaMargin: 0.5769,
      sourceType: "guidance",
      notes: "Reported Markets segment used in operating valuation.",
    },
    provenance: {
      id: "segment-fy26-markets-forecast-anchor",
      qualityTag: "Forecast Anchor",
      sourceType: "derived",
      source: "Modeled FY2026 reported Markets bridge row anchored to company guidance plus Markets mix assumptions.",
      asOfDate: "2026-03-06",
      period: "FY 2026E",
      confidenceLevel: "medium",
      notes: "Markets remains reported-taxonomy in base valuation; this row is not a separately disclosed actual.",
    },
  },
  {
    row: {
      periodId: "fy26",
      segment: "Other",
      taxonomy: "reported_2025",
      revenueDefinition: "totalIncomeExcludingRecoveries",
      revenue: -237,
      adjustedEbitda: 14,
      adjustedEbitdaMargin: -0.0591,
      sourceType: "guidance",
    },
    provenance: {
      id: "segment-fy26-other-forecast-anchor",
      qualityTag: "Forecast Anchor",
      sourceType: "derived",
      source: "Modeled FY2026 Other / Corporate bridge row used to preserve the current reported-taxonomy reconciliation.",
      asOfDate: "2026-03-06",
      period: "FY 2026E",
      confidenceLevel: "medium",
    },
  },
];

const analyticalSplitRows: LsegRowWithProvenance<LsegSegmentFinancialPoint>[] = [
  {
    row: {
      periodId: "fy25",
      segment: "Capital Markets",
      taxonomy: "analytical_split",
      revenueDefinition: "totalIncomeExcludingRecoveries",
      revenue: 1705,
      adjustedEbitda: 749,
      adjustedEbitdaMargin: 0.4393,
      sourceType: "assumption",
      splitSource: "analyst_estimate",
      parentReportedSegment: "Markets",
      notes: "Analytical split for strategic / activist work only; not used in default operating SOTP.",
    },
    provenance: {
      id: "segment-fy25-capital-markets-analytical-split",
      qualityTag: "Assumption",
      sourceType: "analyst_estimate",
      source: "Analyst-estimated analytical split of reported Markets for strategic / activist analysis only.",
      asOfDate: "2026-05-07",
      period: "FY 2025A analytical split",
      confidenceLevel: "medium",
      notes: "Not company-disclosed. Keep out of default operating valuation.",
    },
  },
  {
    row: {
      periodId: "fy25",
      segment: "Post Trade",
      taxonomy: "analytical_split",
      revenueDefinition: "totalIncomeExcludingRecoveries",
      revenue: 1762,
      adjustedEbitda: 1180,
      adjustedEbitdaMargin: 0.6697,
      sourceType: "assumption",
      splitSource: "analyst_estimate",
      parentReportedSegment: "Markets",
      notes: "Analytical split for strategic / activist work only; not used in default operating SOTP.",
    },
    provenance: {
      id: "segment-fy25-post-trade-analytical-split",
      qualityTag: "Assumption",
      sourceType: "analyst_estimate",
      source: "Analyst-estimated analytical split of reported Markets for strategic / activist analysis only.",
      asOfDate: "2026-05-07",
      period: "FY 2025A analytical split",
      confidenceLevel: "medium",
      notes: "Not company-disclosed. Keep out of default operating valuation.",
    },
  },
];

export const lsegForecastFinancialEnvelopes = forecastFinancialRows;
export const lsegForecastFinancials = stripProvenance(forecastFinancialRows);
export const lsegForecastFinancialProvenance = indexProvenanceById(forecastFinancialRows, (row) => row.id);

export const lsegForecastReportedSegmentEnvelopes = forecastReportedSegmentRows;
export const lsegForecastReportedSegments = stripProvenance(forecastReportedSegmentRows);
export const lsegForecastReportedSegmentProvenance = indexProvenanceById(
  forecastReportedSegmentRows,
  (row) => `${row.periodId}:${row.taxonomy}:${row.segment}`,
);

export const lsegAnalyticalSplitSegmentEnvelopes = analyticalSplitRows;
export const lsegAnalyticalSplitSegments = stripProvenance(analyticalSplitRows);
export const lsegAnalyticalSplitSegmentProvenance = indexProvenanceById(
  analyticalSplitRows,
  (row) => `${row.periodId}:${row.taxonomy}:${row.segment}`,
);
