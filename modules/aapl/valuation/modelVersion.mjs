export const AAPL_BACKEND_MODEL_VERSION = {
  version: "aapl_v1_backend_pilot",
  name: "AAPL backend pilot valuation adapter",
  description:
    "Backend pilot wraps the AAPL frontend valuation engine, maps SQLite as-of snapshots into the Apple-specific dataset shape, and persists reporting-event valuation runs without duplicating valuation formulas in the API layer.",
  valuationMethods: ["DCF", "FCF Yield", "P/E", "EV / EBIT", "SOTP", "AI Upgrade Optionality"],
  assumptionSchema: {
    scenarios: ["Bear", "Base", "Bull"],
    sourceLayering: ["official_actual", "management_guidance", "forecast_assumption", "transcript_commentary", "research_only", "market_data"],
    notes:
      "Scenario assumptions are Apple-specific: iPhone replacement demand, Services mix and margin, China/geographic risk, Services regulation, capital return, and Apple Intelligence upgrade-cycle optionality.",
  },
};
