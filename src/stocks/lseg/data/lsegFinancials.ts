import { lsegActualFinancials } from "./actuals";
import { lsegForecastFinancials } from "./forecastAnchors";

// Compatibility facade. Canonical reported actuals live in actuals.ts and the
// FY2026 modeled bridge row lives in forecastAnchors.ts.
export const lsegFinancials = [...lsegActualFinancials, ...lsegForecastFinancials];
