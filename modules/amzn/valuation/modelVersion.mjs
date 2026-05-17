export const AMZN_BACKEND_MODEL_VERSION = {
  version: "amzn_v1_backend_pilot",
  name: "AMZN backend pilot valuation adapter",
  description:
    "Backend pilot maps Amazon SQLite reporting-event snapshots into the AMZN frontend valuation framework and persists as-of valuation runs around AWS, advertising, retail leverage, capex/FCF, Prime, Kuiper, and risk-red-team drivers.",
  valuationMethods: ["DCF / FCFF", "FCF Yield", "EV / EBIT", "SOTP", "Advertising Profit Pool", "AWS AI Economics"],
  assumptionSchema: {
    scenarios: ["Bear", "Base", "Bull"],
    sourceLayering: ["official_actual", "management_guidance", "forecast_assumption", "transcript_commentary", "research_only", "market_data"],
    notes:
      "Historical assumption sets are event-dated. Consolidated financial actuals are sourced from SEC Companyfacts when available; segment and business-unit allocations are research-only unless official segment facts are later imported.",
  },
};
