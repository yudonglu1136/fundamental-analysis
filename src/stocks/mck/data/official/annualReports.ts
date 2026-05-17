import type { MckDataTag, MckReportedFinancial } from "../../types";

export const mckOfficialFy2026Url =
  "https://www.mckesson.com/about-us/newsroom/press-releases/2026/mckesson-reports-fiscal-2026-fourth-quarter-and-full-year-results/";

export const mckOfficialFy2025Url =
  "https://www.mckesson.com/about-us/newsroom/press-releases/2025/mckesson-reports-fiscal-2025-fourth-quarter-and-full-year-results/";

const fy2026ActualTag: MckDataTag = {
  sourceType: "actual",
  source: "McKesson FY2026 Q4/full-year earnings release",
  sourceUrl: mckOfficialFy2026Url,
  asOfDate: "2026-05-07",
  confidence: "high",
};

const fy2025ActualTag: MckDataTag = {
  sourceType: "actual",
  source: "McKesson FY2025 Q4/full-year earnings release",
  sourceUrl: mckOfficialFy2025Url,
  asOfDate: "2025-05-08",
  confidence: "high",
};

const shareCountPlaceholder: MckDataTag = {
  sourceType: "placeholder",
  source: "Analyst placeholder until FY2026 10-K weighted-average diluted shares are parsed",
  asOfDate: "2026-05-11",
  confidence: "low",
  isPlaceholder: true,
  notes: "Used only to make per-share engines auditable before the official 10-K parser is run.",
};

const netDebtPlaceholder: MckDataTag = {
  sourceType: "placeholder",
  source: "Analyst placeholder until balance sheet parser refreshes cash and debt",
  asOfDate: "2026-05-11",
  confidence: "low",
  isPlaceholder: true,
};

export const mckReportedFinancials: MckReportedFinancial[] = [
  {
    periodId: "fy2025",
    label: "FY2025A",
    fiscalYear: 2025,
    revenue: 359100,
    revenueGrowth: 0.16,
    gaapDilutedEps: 25.72,
    adjustedDilutedEps: 33.05,
    adjustedEpsGrowth: 0.2,
    operatingCashFlow: 6100,
    capex: 859,
    freeCashFlow: 5200,
    shareRepurchases: 3100,
    dividendsPaid: 345,
    dilutedShares: 132.3,
    dilutedSharesTag: shareCountPlaceholder,
    netDebt: 6100,
    netDebtTag: netDebtPlaceholder,
    adjustedTaxRate: 0.18,
    tag: fy2025ActualTag,
  },
  {
    periodId: "fy2026",
    label: "FY2026A",
    fiscalYear: 2026,
    revenue: 403400,
    revenueGrowth: 0.12,
    gaapDilutedEps: 38.38,
    adjustedDilutedEps: 39.11,
    adjustedEpsGrowth: 0.18,
    operatingCashFlow: 6200,
    capex: 745,
    freeCashFlow: 5400,
    shareRepurchases: 4800,
    dividendsPaid: 381,
    dilutedShares: 122.5,
    dilutedSharesTag: shareCountPlaceholder,
    netDebt: 6900,
    netDebtTag: netDebtPlaceholder,
    adjustedTaxRate: 0.18,
    tag: fy2026ActualTag,
  },
];
