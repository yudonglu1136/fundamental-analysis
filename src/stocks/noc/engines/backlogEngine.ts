import type { NocBacklogEngineOutput, NocDataset } from "../model";
import { clamp, safeRatio } from "./helpers";

export function calculateNocBacklogEngine(data: NocDataset, periodId = "q1-26"): NocBacklogEngineOutput {
  const period = data.periods.find((item) => item.id === periodId) ?? data.periods[data.periods.length - 1];
  const prior = period.periodType === "quarter"
    ? data.periods.find((item) => item.id === "fy25")
    : data.periods.find((item) => item.fiscalYear === period.fiscalYear - 1 && item.periodType === "annual");
  const bookToBill = safeRatio(period.netAwards, period.sales);
  const backlogCoverageYears = period.periodType === "quarter"
    ? safeRatio(period.totalBacklog, period.sales * 4)
    : safeRatio(period.totalBacklog, period.sales);
  const backlogGrowth = prior ? safeRatio(period.totalBacklog, prior.totalBacklog) - 1 : 0;
  const fundedRatio = safeRatio(period.fundedBacklog, period.totalBacklog);
  const revenueVisibilityScore = Math.round(
    clamp(backlogCoverageYears / 2.4, 0, 1) * 38 +
      clamp(bookToBill / 1.15, 0, 1) * 28 +
      clamp(fundedRatio / 0.5, 0, 1) * 20 +
      clamp((backlogGrowth + 0.03) / 0.1, 0, 1) * 14,
  );
  const backlogDurabilityScore = Math.round(
    clamp(backlogCoverageYears / 2.5, 0, 1) * 35 +
      clamp(bookToBill / 1.1, 0, 1) * 25 +
      clamp(fundedRatio / 0.48, 0, 1) * 20 +
      clamp((backlogGrowth + 0.02) / 0.08, 0, 1) * 10 +
      10,
  );

  const segmentRows = data.segments
    .filter((row) => row.periodId === period.id)
    .map((row) => ({
      ...row,
      fundedRatio: row.totalBacklog ? safeRatio(row.fundedBacklog ?? 0, row.totalBacklog) : null,
      backlogCoverageYears: row.totalBacklog && row.sales
        ? safeRatio(row.totalBacklog, period.periodType === "quarter" ? row.sales * 4 : row.sales)
        : null,
      backlogGrowth: row.totalBacklogPriorYear ? safeRatio(row.totalBacklog ?? 0, row.totalBacklogPriorYear) - 1 : null,
    }));

  return {
    totalBacklog: period.totalBacklog,
    fundedBacklog: period.fundedBacklog,
    unfundedBacklog: period.unfundedBacklog,
    fundedRatio,
    priorBacklog: prior?.totalBacklog ?? 0,
    backlogGrowth,
    netAwards: period.netAwards,
    bookToBill,
    backlogCoverageYears,
    revenueVisibilityScore,
    backlogDurabilityScore,
    segmentRows,
    majorAwards: [
      {
        program: "Restricted programs",
        segment: "Aeronautics Systems",
        value: period.id === "q1-26" ? 4_900 : 14_800,
        sourceId: period.sourceId,
        note: "Restricted awards are primarily across Aeronautics, Space and Mission Systems; the cockpit treats them as visibility support, not program-level revenue disclosure.",
      },
      {
        program: "F-35",
        segment: "Aeronautics Systems",
        value: period.id === "q1-26" ? 500 : 3_300,
        sourceId: period.sourceId,
        note: "F-35 awards support Aeronautics and Mission Systems workshare.",
      },
      {
        program: "GWS",
        segment: "Defense Systems",
        value: period.id === "q1-26" ? null : 1_800,
        sourceId: "noc-ar-2025",
        note: "Ground-Based Midcourse Defense Weapon System award supports missile-defense optionality.",
      },
      {
        program: "Virginia Class submarines",
        segment: "Mission Systems",
        value: period.id === "q1-26" ? null : 1_300,
        sourceId: "noc-ar-2025",
        note: "Marine systems exposure sits inside Mission Systems and supports peer contrast versus HII/GD naval work.",
      },
    ],
    qualityNotes: [
      `Backlog is ${backlogCoverageYears.toFixed(1)}x annualized sales and includes funded backlog of ${(fundedRatio * 100).toFixed(1)}% of total backlog.`,
      `Book-to-bill is ${bookToBill.toFixed(2)}x for ${period.label}, so awards are tested against sales rather than treated as headline demand alone.`,
      "NOC discloses both funded and unfunded backlog; unfunded backlog is central to Sentinel, B-21 and Space visibility but carries appropriation and timing risk.",
      "Unexercised options and IDIQ capacity are excluded from backlog until awarded, so the cockpit distinguishes backlog durability from total addressable budget narrative.",
    ],
  };
}
