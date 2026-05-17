export const GOOGL_BACKEND_MODEL_VERSION = {
  version: "googl_v1_backend_pilot",
  name: "GOOGL backend pilot valuation adapter",
  description:
    "Backend pilot wraps the existing GOOGL frontend valuation engine, maps SQLite reporting-event snapshots into the Alphabet dataset shape, and persists historical valuation runs without changing frontend valuation formulas.",
  valuationMethods: ["FCFF DCF", "FCF Yield", "EV / EBIT", "P/E", "SOTP + TPU / Risk"],
  assumptionSchema: {
    scenarios: ["Bear", "Base", "Bull"],
    sourceLayering: [
      "official_actual",
      "management_guidance",
      "forecast_assumption",
      "company_commentary",
      "transcript_commentary",
      "research_only",
      "market_data",
    ],
    notes:
      "Assumption sets are copied from the existing GOOGL scenario presets at seed time. Adapter-level as-of bridges derive forecast assumptions from event-dated official actuals while keeping official actuals separate from research-only/proxy data. Historical runs persist assumptionAuditJson, factorAttributionJson, qualityFlagsJson, and investmentValidationJson.",
  },
};
