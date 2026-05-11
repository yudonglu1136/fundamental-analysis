import type { LsegConsensusComparison, LsegConsensusComparisonRow, LsegDashboardDataset } from "../model";
import type { LsegBuybackEngineResult } from "./buybackEngine";
import type { LsegFcfEngineResult } from "./fcfEngine";
import type { LsegMarginEngineResult } from "./marginEngine";
import type { LsegRevenueEngineResult } from "./revenueEngine";

function classifyDifference(metric: string, percentageDifference: number): LsegConsensusComparisonRow["stance"] {
  const absDiff = Math.abs(percentageDifference);
  const tolerance =
    metric.includes("Revenue") || metric.includes("Income")
      ? 0.02
      : metric.includes("EBITDA")
        ? 0.03
        : metric.includes("EPS")
          ? 0.03
          : metric.includes("FCF")
            ? 0.05
            : 0.05;
  if (absDiff <= tolerance) return "in_line";
  return percentageDifference > 0 ? "above_consensus" : "below_consensus";
}

function materialityFromDifference(percentageDifference: number): LsegConsensusComparisonRow["materiality"] {
  const absDiff = Math.abs(percentageDifference);
  if (absDiff >= 0.08) return "high";
  if (absDiff >= 0.03) return "medium";
  return "low";
}

export function calculateConsensusComparisonEngine(
  data: LsegDashboardDataset,
  revenue: LsegRevenueEngineResult,
  margin: LsegMarginEngineResult,
  fcf: LsegFcfEngineResult,
  buyback: LsegBuybackEngineResult,
  targetPrice: number,
): LsegConsensusComparison {
  const rows: LsegConsensusComparisonRow[] = [];

  for (const consensusYear of data.consensus.yearly) {
    const revenueRow = revenue.groupRevenueByYear.find((item) => item.fiscalYear === consensusYear.fiscalYear);
    const marginRow = margin.groupRows.find((item) => item.fiscalYear === consensusYear.fiscalYear);
    const fcfRow = fcf.rows.find((item) => item.fiscalYear === consensusYear.fiscalYear);
    const epsRow = buyback.rows.find((item) => item.fiscalYear === consensusYear.fiscalYear);

    const points = [
      { metric: "Total Income", modelValue: revenueRow?.revenue ?? 0, consensusValue: consensusYear.totalIncomeExcludingRecoveries },
      { metric: "EBITDA", modelValue: marginRow?.adjustedEbitda ?? 0, consensusValue: consensusYear.adjustedEbitda },
      { metric: "EBITDA Margin", modelValue: marginRow?.adjustedEbitdaMargin ?? 0, consensusValue: consensusYear.adjustedEbitdaMargin },
      { metric: "EPS", modelValue: epsRow?.adjustedEps ?? 0, consensusValue: consensusYear.adjustedEps },
      { metric: "Equity FCF", modelValue: fcfRow?.equityFreeCashFlow ?? 0, consensusValue: consensusYear.equityFcf },
    ];

    points.forEach((point) => {
      const absoluteDifference = point.modelValue - point.consensusValue;
      const percentageDifference = point.consensusValue === 0 ? 0 : absoluteDifference / point.consensusValue;
      rows.push({
        metric: point.metric,
        fiscalYear: consensusYear.fiscalYear,
        modelValue: point.modelValue,
        consensusValue: point.consensusValue,
        absoluteDifference,
        percentageDifference,
        stance: classifyDifference(point.metric, percentageDifference),
        materiality: materialityFromDifference(percentageDifference),
      });
    });

    (["Data & Analytics", "FTSE Russell", "Risk Intelligence", "Markets"] as const).forEach((segment) => {
      const modelSegmentGrowth =
        revenue.rows.find((row) => row.fiscalYear === consensusYear.fiscalYear && row.segment === segment)?.totalGrowth ?? 0;
      const consensusSegmentGrowth = consensusYear.segmentGrowth[segment];
      if (consensusSegmentGrowth === undefined) return;
      const absoluteDifference = modelSegmentGrowth - consensusSegmentGrowth;
      const percentageDifference = consensusSegmentGrowth === 0 ? 0 : absoluteDifference / consensusSegmentGrowth;
      rows.push({
        metric: `${segment} Growth`,
        fiscalYear: consensusYear.fiscalYear,
        modelValue: modelSegmentGrowth,
        consensusValue: consensusSegmentGrowth,
        absoluteDifference,
        percentageDifference,
        stance: classifyDifference("Revenue", percentageDifference),
        materiality: materialityFromDifference(percentageDifference),
      });
    });
  }

  const consensusTargetDiff = targetPrice - data.consensus.consensusTargetPrice;
  const consensusTargetDiffPct = consensusTargetDiff / data.consensus.consensusTargetPrice;
  rows.push({
    metric: "Target Price",
    fiscalYear: new Date(data.consensus.consensusDate).getUTCFullYear(),
    modelValue: targetPrice,
    consensusValue: data.consensus.consensusTargetPrice,
    absoluteDifference: consensusTargetDiff,
    percentageDifference: consensusTargetDiffPct,
    stance: classifyDifference("Target Price", consensusTargetDiffPct),
    materiality: materialityFromDifference(consensusTargetDiffPct),
  });

  const aboveFcf = rows.find((row) => row.metric === "Equity FCF" && row.fiscalYear === 2026)?.stance === "above_consensus";
  const revenueInline = rows.find((row) => row.metric === "Total Income" && row.fiscalYear === 2026)?.stance === "in_line";
  const targetBelow = rows.find((row) => row.metric === "Target Price")?.stance === "below_consensus";
  const summaryParts = [];
  if (aboveFcf && revenueInline) {
    summaryParts.push("Our base case is above consensus on FCF but in-line on revenue.");
  }
  if (targetBelow) {
    summaryParts.push("Our target price is below consensus because the model uses a more conservative operating SOTP and terminal framework.");
  }
  if (summaryParts.length === 0) {
    summaryParts.push("Our model is broadly in-line with consensus on core operating metrics, with differences driven by cash flow and valuation method choices.");
  }

  return {
    rows,
    summary: summaryParts.join(" "),
  };
}
