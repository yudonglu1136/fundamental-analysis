import type { MckDataset } from "../types";
import type { ValidationWarning } from "../../types";
import { latestFinancial, safeDivide, segmentsForPeriod, sumSegments } from "../engines/helpers";

export function checkMckDataQuality(data: MckDataset): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const latest = latestFinancial(data);
  const latestSegments = segmentsForPeriod(data, latest.periodId);
  const segmentRevenue = sumSegments(latestSegments, "revenue");
  const revenueGap = Math.abs(safeDivide(segmentRevenue, latest.revenue) - 1);
  if (revenueGap > 0.03) {
    warnings.push({
      id: "mck-segment-revenue-gap",
      title: "Segment revenue does not reconcile to consolidated revenue",
      detail: `Latest segment revenue sum is $${segmentRevenue.toFixed(0)}M versus consolidated revenue of $${latest.revenue.toFixed(0)}M.`,
      severity: "medium",
    });
  }
  latestSegments.forEach((segment) => {
    const recalculatedBps = safeDivide(segment.adjustedOperatingProfit, segment.revenue) * 10000;
    if (segment.revenue > 0 && Math.abs(recalculatedBps - segment.marginBps) > 1) {
      warnings.push({
        id: `mck-margin-bps-${segment.segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: "Segment margin bps mismatch",
        detail: `${segment.segment} margin bps should be ${recalculatedBps.toFixed(1)}, not ${segment.marginBps.toFixed(1)}.`,
        severity: "high",
      });
    }
  });
  if (data.reportedFinancials.some((row) => row.dilutedSharesTag.isPlaceholder)) {
    warnings.push({
      id: "mck-placeholder-share-count",
      title: "Official diluted share count missing",
      detail: "Per-share valuation uses a marked placeholder until SEC filing parsing refreshes weighted-average diluted shares.",
      severity: "high",
    });
  }
  if (data.reportedFinancials.some((row) => row.netDebtTag.isPlaceholder)) {
    warnings.push({
      id: "mck-placeholder-net-debt",
      title: "Official net debt bridge missing",
      detail: "SOTP and DCF deduct net debt using a marked placeholder until the balance-sheet parser refreshes cash and debt.",
      severity: "high",
    });
  }
  if (data.qaPairs.some((pair) => pair.tag.sourceType === "placeholder")) {
    warnings.push({
      id: "mck-transcript-qa-placeholder",
      title: "Transcript Q&A is not fully ingested",
      detail: "Q&A cards include placeholders. Run mck_fetch_transcripts and mck_build_qa_pairs after adding local transcript text.",
      severity: "low",
    });
  }
  return warnings;
}
