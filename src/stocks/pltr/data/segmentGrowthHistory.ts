export type PltrSegmentGrowthQuarter = {
  period: string;
  fiscalYear: number;
  fiscalQuarter: number;
  commercialRevenue: number;
  governmentRevenue: number;
  commercialYoyGrowth: number;
  governmentYoyGrowth: number;
  commercialQoqGrowth: number;
  governmentQoqGrowth: number;
  sourceType: "official_transcript";
  sourcePath: string;
  note: string;
};

const transcriptRoot = "data/local/pltr/transcripts/extracted";

export const pltrSegmentGrowthHistory: PltrSegmentGrowthQuarter[] = [
  {
    period: "Q2 2024",
    fiscalYear: 2024,
    fiscalQuarter: 2,
    commercialRevenue: 307,
    governmentRevenue: 371,
    commercialYoyGrowth: 0.33,
    governmentYoyGrowth: 0.23,
    commercialQoqGrowth: 0.03,
    governmentQoqGrowth: 0.11,
    sourceType: "official_transcript",
    sourcePath: `${transcriptRoot}/pltr_fy2024_q2_2024-08-05.txt`,
    note: "Commercial and Government segment revenue and growth disclosed in the Q2 2024 earnings call.",
  },
  {
    period: "Q3 2024",
    fiscalYear: 2024,
    fiscalQuarter: 3,
    commercialRevenue: 317,
    governmentRevenue: 408,
    commercialYoyGrowth: 0.27,
    governmentYoyGrowth: 0.33,
    commercialQoqGrowth: 0.03,
    governmentQoqGrowth: 0.1,
    sourceType: "official_transcript",
    sourcePath: `${transcriptRoot}/pltr_fy2024_q3_2024-11-04.txt`,
    note: "Commercial and Government segment revenue and growth disclosed in the Q3 2024 earnings call.",
  },
  {
    period: "Q4 2024",
    fiscalYear: 2024,
    fiscalQuarter: 4,
    commercialRevenue: 372,
    governmentRevenue: 455,
    commercialYoyGrowth: 0.31,
    governmentYoyGrowth: 0.4,
    commercialQoqGrowth: 0.17,
    governmentQoqGrowth: 0.11,
    sourceType: "official_transcript",
    sourcePath: `${transcriptRoot}/pltr_fy2024_q4_2025-02-03.txt`,
    note: "Commercial and Government segment revenue and growth disclosed in the Q4 2024 earnings call.",
  },
  {
    period: "Q1 2025",
    fiscalYear: 2025,
    fiscalQuarter: 1,
    commercialRevenue: 397,
    governmentRevenue: 487,
    commercialYoyGrowth: 0.33,
    governmentYoyGrowth: 0.45,
    commercialQoqGrowth: 0.07,
    governmentQoqGrowth: 0.07,
    sourceType: "official_transcript",
    sourcePath: `${transcriptRoot}/pltr_fy2025_q1_2025-05-05.txt`,
    note: "Commercial and Government segment revenue and growth disclosed in the Q1 2025 earnings call.",
  },
  {
    period: "Q2 2025",
    fiscalYear: 2025,
    fiscalQuarter: 2,
    commercialRevenue: 451,
    governmentRevenue: 553,
    commercialYoyGrowth: 0.47,
    governmentYoyGrowth: 0.49,
    commercialQoqGrowth: 0.14,
    governmentQoqGrowth: 0.14,
    sourceType: "official_transcript",
    sourcePath: `${transcriptRoot}/pltr_fy2025_q2_2025-08-04.txt`,
    note: "Commercial and Government segment revenue and growth disclosed in the Q2 2025 earnings call.",
  },
  {
    period: "Q3 2025",
    fiscalYear: 2025,
    fiscalQuarter: 3,
    commercialRevenue: 548,
    governmentRevenue: 633,
    commercialYoyGrowth: 0.73,
    governmentYoyGrowth: 0.55,
    commercialQoqGrowth: 0.22,
    governmentQoqGrowth: 0.14,
    sourceType: "official_transcript",
    sourcePath: `${transcriptRoot}/pltr_fy2025_q3_2025-11-03.txt`,
    note: "Commercial and Government segment revenue and growth disclosed in the Q3 2025 earnings call.",
  },
  {
    period: "Q4 2025",
    fiscalYear: 2025,
    fiscalQuarter: 4,
    commercialRevenue: 677,
    governmentRevenue: 730,
    commercialYoyGrowth: 0.82,
    governmentYoyGrowth: 0.6,
    commercialQoqGrowth: 0.23,
    governmentQoqGrowth: 0.15,
    sourceType: "official_transcript",
    sourcePath: `${transcriptRoot}/pltr_fy2025_q4_2026-02-02.txt`,
    note: "Commercial and Government segment revenue and growth disclosed in the Q4 2025 earnings call.",
  },
  {
    period: "Q1 2026",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    commercialRevenue: 774,
    governmentRevenue: 858,
    commercialYoyGrowth: 0.95,
    governmentYoyGrowth: 0.76,
    commercialQoqGrowth: 0.14,
    governmentQoqGrowth: 0.18,
    sourceType: "official_transcript",
    sourcePath: `${transcriptRoot}/pltr_fy2026_q1_2026-05-04.txt`,
    note: "Commercial and Government segment revenue and growth disclosed in the Q1 2026 earnings call.",
  },
];
