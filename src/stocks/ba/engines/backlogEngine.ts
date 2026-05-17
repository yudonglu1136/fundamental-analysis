import type { BaBacklogEngineOutput, BaDataset, BaSegmentName } from "../model";
import { clamp, safeRatio } from "./helpers";

export function calculateBaBacklogEngine(data: BaDataset, periodId = "fy25"): BaBacklogEngineOutput {
  const period = data.periods.find((item) => item.id === periodId) ?? data.periods[data.periods.length - 1];
  const prior = data.periods.find((item) => item.fiscalYear === period.fiscalYear - 1);
  const bookToBill = safeRatio(period.orderIntake, period.sales);
  const backlogCoverageYears = safeRatio(period.orderBacklog, period.sales);
  const backlogGrowth = prior ? safeRatio(period.orderBacklog, prior.orderBacklog) - 1 : 0;
  const orderIntakeGrowth = prior ? safeRatio(period.orderIntake, prior.orderIntake) - 1 : 0;
  const revenueVisibilityScore = Math.round(
    clamp(backlogCoverageYears / 3, 0, 1) * 45 +
      clamp((bookToBill - 0.8) / 0.5, 0, 1) * 35 +
      clamp((backlogGrowth + 0.02) / 0.12, 0, 1) * 20,
  );
  const backlogDurabilityScore = Math.round(
    clamp(backlogCoverageYears / 3, 0, 1) * 40 +
      clamp(bookToBill / 1.2, 0, 1) * 35 +
      clamp(orderIntakeGrowth / 0.1, 0, 1) * 15 +
      10,
  );

  const segmentRows = data.segments
    .filter((row) => row.periodId === period.id)
    .map((row) => ({
      ...row,
      bookToBill: row.orderIntake != null ? safeRatio(row.orderIntake, row.sales) : null,
      backlogCoverageYears: row.orderBacklog != null ? safeRatio(row.orderBacklog, row.sales) : null,
      backlogGrowth: row.orderBacklogPriorYear ? safeRatio(row.orderBacklog ?? 0, row.orderBacklogPriorYear) - 1 : null,
    }));

  const majorContractWins: BaBacklogEngineOutput["majorContractWins"] = [
    {
      program: "Typhoon for Türkiye",
      segment: "Air",
      value: 4_600,
      currency: "GBP",
      sourceId: "ba-fy-2025-results",
      note: "Anticipated value to BAE Systems for 20 Typhoon aircraft; export timing should be monitored before treating it as fully converted backlog.",
    },
    {
      program: "Norway Type 26 frigate selection",
      segment: "Maritime",
      value: 10_000,
      currency: "GBP",
      sourceId: "ba-ar-2025-web",
      note: "Government-to-government agreement value; BAE economics and timing require contract-level follow-up.",
    },
    {
      program: "US Space Force missile warning and tracking",
      segment: "Electronic Systems",
      value: 900,
      currency: "GBP",
      sourceId: "ba-ar-2025-web",
      note: "USD1.2bn / c.GBP0.9bn prime contract for MEO Epoch 2 satellite capability.",
    },
    {
      program: "GCAP UK assessment phase funding",
      segment: "Air",
      value: 1_000,
      currency: "GBP",
      sourceId: "ba-hy-2025-results",
      note: "Further UK assessment phase funding in H1 2025; future production economics remain an option, not a base valuation input.",
    },
  ];

  const qualityNotes = [
    `Group backlog coverage is ${backlogCoverageYears.toFixed(1)}x FY2025 sales, giving unusually strong revenue visibility for an industrial company.`,
    `Book-to-bill is ${bookToBill.toFixed(2)}x, so FY2025 orders exceeded sales even after another year of strong revenue growth.`,
    "Segment-level backlog is company-disclosed for FY2025; prior-year segment backlog is only used where explicit source extraction is available.",
    "Large export and naval awards can create backlog spikes; the cockpit flags timing and conversion risk instead of mechanically capitalising headlines.",
  ];

  return {
    totalBacklog: period.orderBacklog,
    priorBacklog: prior?.orderBacklog ?? 0,
    backlogGrowth,
    orderIntake: period.orderIntake,
    priorOrderIntake: prior?.orderIntake ?? 0,
    bookToBill,
    backlogCoverageYears,
    revenueVisibilityScore,
    backlogDurabilityScore,
    segmentRows,
    majorContractWins,
    qualityNotes,
  };
}

export function getBacklogContributionBySegment(backlog: BaBacklogEngineOutput) {
  return backlog.segmentRows
    .filter((row) => row.segment !== "Intra-group" && row.segment !== "HQ" && (row.orderBacklog ?? 0) > 0)
    .map((row) => ({
      segment: row.segment as BaSegmentName,
      backlog: row.orderBacklog ?? 0,
      share: safeRatio(row.orderBacklog ?? 0, backlog.totalBacklog),
      coverageYears: row.backlogCoverageYears ?? 0,
    }));
}
