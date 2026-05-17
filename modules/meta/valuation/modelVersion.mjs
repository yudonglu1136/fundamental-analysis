export const META_BACKEND_MODEL_VERSION = {
  version: "meta_v1_backend_pilot",
  name: "META backend pilot valuation adapter",
  description:
    "Backend pilot wraps the existing META valuation engine, maps SQLite as-of reporting-event snapshots into the META dataset shape, and persists historical valuation runs without changing formulas.",
  valuationMethods: ["DCF", "FCF Yield", "P/E", "EV / EBIT", "SOTP", "AI ROIC diagnostic"],
  assumptionSchema: {
    scenarios: ["Bear", "Base", "Bull"],
    sourceLayering: [
      "official_actual",
      "management_guidance",
      "forecast_assumption",
      "transcript_commentary",
      "research_only",
      "market_data",
      "derived",
    ],
    notes:
      "Assumption sets are event-dated. Pre-2023 runs do not use post-2023 AI uplift assumptions; transcript and guidance candidates remain non-model-ready unless explicitly promoted.",
  },
};
