import type { LsegCockpitDataset, LsegSegment, LsegSegmentEngineOutput, LsegSegmentEngineRow } from "../types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const segmentQualityInputs: Record<LsegSegment, { quality: number; risk: number; contribution: string }> = {
  "Data & Analytics": {
    quality: 82,
    risk: 42,
    contribution: "Core recurring data/workflow engine; valuation debate is Workspace adoption and AI-ready data monetization.",
  },
  "FTSE Russell / Index": {
    quality: 90,
    risk: 34,
    contribution: "High-ROIC index IP with subscription and AUM-linked economics.",
  },
  "Risk Intelligence": {
    quality: 78,
    risk: 38,
    contribution: "Regulatory workflow growth asset with small revenue base and high incremental margin potential.",
  },
  "Capital Markets": {
    quality: 63,
    risk: 58,
    contribution: "Tradeweb/electronic trading and exchange activity provide optionality but are volume sensitive.",
  },
  "Post Trade / LCH": {
    quality: 86,
    risk: 52,
    contribution: "Systemic clearing infrastructure with strong network effect and high regulatory scrutiny.",
  },
  "Corporate / Other": {
    quality: 35,
    risk: 45,
    contribution: "Reconciliation bucket; should not receive a growth-company multiple.",
  },
};

export function calculateLsegSegmentEngine(data: LsegCockpitDataset): LsegSegmentEngineOutput {
  const latest = data.officialActuals.find((period) => period.periodId === "fy2025") ?? data.officialActuals[data.officialActuals.length - 1];
  const totalRevenue = data.segmentActuals.reduce((sum, row) => sum + row.revenue, 0);
  const totalAdjustedEbitda = data.segmentActuals.reduce((sum, row) => sum + row.adjustedEbitda, 0);

  const rows: LsegSegmentEngineRow[] = data.segmentActuals.map((row) => {
    const inputs = segmentQualityInputs[row.segment];
    const officialPenalty = row.officialDisclosure ? 0 : 6;
    const growthBoost = clamp(row.organicGrowth * 120, -8, 14);
    const marginBoost = clamp((row.margin - 0.45) * 40, -8, 10);
    return {
      ...row,
      revenueShare: row.revenue / Math.max(totalRevenue, 1),
      ebitdaShare: row.adjustedEbitda / Math.max(totalAdjustedEbitda, 1),
      qualityScore: clamp(inputs.quality + growthBoost + marginBoost - officialPenalty, 0, 100),
      riskScore: clamp(inputs.risk + officialPenalty - Math.max(row.organicGrowth, 0) * 30, 0, 100),
      contribution: inputs.contribution,
    };
  });

  return {
    rows,
    totalRevenue,
    totalAdjustedEbitda,
    groupMargin: totalAdjustedEbitda / Math.max(totalRevenue, 1),
    reconciliation: {
      groupRevenue: latest.totalIncomeExRecoveries,
      segmentRevenue: totalRevenue,
      revenueDifference: totalRevenue - latest.totalIncomeExRecoveries,
      groupAdjustedEbitda: latest.adjustedEbitda,
      segmentAdjustedEbitda: totalAdjustedEbitda,
      ebitdaDifference: totalAdjustedEbitda - latest.adjustedEbitda,
    },
  };
}
