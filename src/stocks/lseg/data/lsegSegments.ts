import { lsegActualSegmentFinancials } from "./actuals";
import { lsegAnalyticalSplitSegments, lsegForecastReportedSegments } from "./forecastAnchors";

// Compatibility facade. Canonical reported actuals live in actuals.ts, FY2026
// modeled bridge rows live in forecastAnchors.ts, and analytical split rows
// remain clearly tagged as analyst-estimate assumptions.
export const lsegSegments = [
  ...lsegActualSegmentFinancials,
  ...lsegForecastReportedSegments,
  ...lsegAnalyticalSplitSegments,
];
