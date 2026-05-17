export const MSFT_BACKEND_MODEL_VERSION = {
  version: "msft_v1_backend_pilot",
  name: "MSFT backend pilot valuation adapter",
  description:
    "Backend pilot wraps the existing MSFT frontend valuation engine, maps SQLite as-of snapshots into the MSFT dataset shape, and persists reporting-event valuation runs without changing valuation formulas.",
  valuationMethods: ["DCF", "FCF Yield", "P/E", "EV / EBIT", "SOTP", "AI Optionality"],
  assumptionSchema: {
    scenarios: ["Bear", "Base", "Bull"],
    sourceLayering: ["official_actual", "management_guidance", "forecast_assumption", "transcript_commentary", "research_only", "market_data"],
    notes: "Assumption sets are copied from the existing MSFT scenario presets at seed time.",
  },
};
