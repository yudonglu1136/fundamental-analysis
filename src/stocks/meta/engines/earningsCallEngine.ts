import type { MetaDataset, MetaEarningsCallQuarter, MetaEarningsCallTrendOutput } from "../model";

type ThemeKey = keyof MetaEarningsCallQuarter["themeScores"];

const themeLabels: Array<{ key: ThemeKey; label: string }> = [
  { key: "adMomentum", label: "Ad momentum" },
  { key: "aiMonetization", label: "AI monetization" },
  { key: "aiCapexConcern", label: "AI capex concern" },
  { key: "engagement", label: "Engagement / product cycle" },
  { key: "regulation", label: "Regulation / privacy" },
  { key: "realityLabs", label: "Reality Labs tolerance" },
  { key: "capitalReturn", label: "Buyback / SBC / FCF per share" },
];

function average(rows: MetaEarningsCallQuarter[], key: ThemeKey) {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + row.themeScores[key], 0) / rows.length;
}

function direction(change: number): "rising" | "falling" | "stable" {
  if (change > 6) return "rising";
  if (change < -6) return "falling";
  return "stable";
}

function interpretation(label: string, trend: "rising" | "falling" | "stable", change: number) {
  if (trend === "rising") return `${label} became more important over the last four calls, with intensity up ${change.toFixed(0)} points.`;
  if (trend === "falling") return `${label} became less central, with intensity down ${Math.abs(change).toFixed(0)} points.`;
  return `${label} stayed broadly stable across the eight-quarter window.`;
}

export function calculateMetaEarningsCallTrend(data: MetaDataset): MetaEarningsCallTrendOutput {
  const quarters = [...data.earningsCalls].sort((a, b) => a.callDate.localeCompare(b.callDate));
  const firstHalf = quarters.slice(0, 4);
  const secondHalf = quarters.slice(4);
  const latestQuarter = quarters[quarters.length - 1];
  const focusTrendRows = themeLabels.map((theme) => {
    const firstHalfAverage = average(firstHalf, theme.key);
    const secondHalfAverage = average(secondHalf, theme.key);
    const change = secondHalfAverage - firstHalfAverage;
    const trend = direction(change);
    return {
      theme: theme.label,
      firstHalfAverage,
      secondHalfAverage,
      change,
      direction: trend,
      interpretation: interpretation(theme.label, trend, change),
    };
  });

  const strongestRisers = [...focusTrendRows].sort((a, b) => b.change - a.change).slice(0, 3);
  const latestPrimaryFocus = latestQuarter?.marketFocus[0] ?? "n/a";

  return {
    quarters,
    latestQuarter,
    focusTrendRows,
    marketFocusTimeline: quarters.map((quarter) => ({
      quarter: quarter.label,
      primaryFocus: quarter.marketFocus[0] ?? "n/a",
      secondaryFocus: quarter.marketFocus[1] ?? "n/a",
      tone: quarter.managementTone,
    })),
    aiOverview:
      "AI-related call discussion evolved from engagement and ad-quality narrative into an underwriting question about monetization, capex utilization, and excess ROIC. The model should therefore treat AI as a driver bridge across price per ad, impressions, FoA margin, capex intensity, and regulatory risk rather than as a separate narrative premium.",
    trendSummary: [
      `The largest focus increases were ${strongestRisers.map((row) => row.theme).join(", ")}.`,
      `The latest call's first-order market focus is ${latestPrimaryFocus}.`,
      "Across eight quarters, the market moved from ad recovery and Reels engagement toward AI capex payback, regulatory exposure, and per-share FCF quality.",
      "Product-cycle disclosures help explain the thesis, but they should only enter valuation through named assumptions and breakpoints.",
    ],
    quarterOptions: quarters.map((quarter) => ({ value: quarter.id, label: quarter.label })),
  };
}
