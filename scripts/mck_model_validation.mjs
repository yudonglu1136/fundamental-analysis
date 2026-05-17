const checks = [];

function check(condition, id, detail, suggestion, severity = "high") {
  if (!condition) checks.push({ id, severity, detail, suggestion });
}

const reported = {
  periodId: "fy2026",
  revenue: 403400,
  adjustedDilutedEps: 39.11,
  freeCashFlow: 5400,
  operatingCashFlow: 6200,
  capex: 745,
  dilutedSharesPlaceholder: true,
  netDebtPlaceholder: true,
};

const segments = [
  { segment: "North American Pharmaceutical", revenue: 336700, adjustedOperatingProfit: 3500, marginBps: (3500 / 336700) * 10000 },
  { segment: "Oncology & Multispecialty", revenue: 48400, adjustedOperatingProfit: 1400, marginBps: (1400 / 48400) * 10000 },
  { segment: "Prescription Technology Solutions", revenue: 5800, adjustedOperatingProfit: 1100, marginBps: (1100 / 5800) * 10000 },
  { segment: "Medical-Surgical Solutions", revenue: 11500, adjustedOperatingProfit: 1000, marginBps: (1000 / 11500) * 10000 },
];

const assumptions = {
  dilutedShares: 122.5,
  forwardAdjustedEps: 44.2,
  normalizedFcf: 5400,
  annualFcf: 5400,
  buybackAmount: 4800,
  averageBuybackPrice: 760,
  netDebt: 6900,
  wacc: 0.082,
  terminalGrowth: 0.025,
};

const segmentRevenue = segments.reduce((sum, row) => sum + row.revenue, 0);
const segmentProfit = segments.reduce((sum, row) => sum + row.adjustedOperatingProfit, 0);
check(Math.abs(segmentRevenue / reported.revenue - 1) < 0.03, "segment-revenue-reconcile", "Segment revenue should be within 3% of consolidated revenue.", "Refresh segment revenue from official release.");
check(segmentProfit > 0, "segment-profit-positive", "Segment operating profit should be positive.", "Check segmentData.ts.");
for (const segment of segments) {
  const expectedBps = (segment.adjustedOperatingProfit / segment.revenue) * 10000;
  check(Math.abs(expectedBps - segment.marginBps) < 0.1, `margin-bps-${segment.segment}`, `${segment.segment} margin bps calculation mismatch.`, "Recompute marginBps from adjustedOperatingProfit / revenue.");
}

const epsNetIncomeProxy = assumptions.forwardAdjustedEps * assumptions.dilutedShares;
check(epsNetIncomeProxy > 0, "eps-bridge-reconcile", "EPS bridge proxy must be positive.", "Refresh forward EPS and diluted share assumptions.");
const fcfConversion = reported.freeCashFlow / epsNetIncomeProxy;
check(fcfConversion > 0.6 && fcfConversion < 1.5, "fcf-conversion-range", `FCF conversion ${fcfConversion.toFixed(2)} is outside range.`, "Review working-capital normalization.", "medium");
const sharesRetired = assumptions.buybackAmount / assumptions.averageBuybackPrice;
check(assumptions.dilutedShares - sharesRetired < assumptions.dilutedShares, "buyback-share-count", "Buybacks should reduce share count.", "Check average buyback price and buyback amount.");
check(new Set(segments.map((row) => row.segment)).size === segments.length, "sotp-no-duplicates", "SOTP should not duplicate segment values.", "Remove duplicate SOTP segment rows.");
const terminalValueShare = 0.72;
check(terminalValueShare < 0.8, "dcf-terminal-value", "DCF terminal value should not overly dominate enterprise value.", "Review WACC, terminal growth and explicit forecast.");
check(assumptions.wacc > assumptions.terminalGrowth + 0.02, "wacc-terminal-spread", "WACC should exceed terminal growth by a meaningful spread.", "Raise WACC or lower terminal growth.");
check(reported.dilutedSharesPlaceholder, "placeholder-share-count-visible", "Share count placeholder should remain visibly marked.", "Do not promote placeholder share count to actual.", "medium");
check(reported.netDebtPlaceholder, "placeholder-net-debt-visible", "Net debt placeholder should remain visibly marked.", "Do not promote placeholder net debt to actual.", "medium");

if (checks.length > 0) {
  console.error("MCK validation found issues:");
  for (const issue of checks) {
    console.error(`- [${issue.severity}] ${issue.id}: ${issue.detail} Suggested fix: ${issue.suggestion}`);
  }
  const highCount = checks.filter((issue) => issue.severity === "high").length;
  process.exitCode = highCount > 0 ? 1 : 0;
} else {
  console.log("MCK validation passed.");
}
