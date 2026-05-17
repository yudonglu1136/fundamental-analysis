export const PLTR_BACKEND_MODEL_VERSION = {
  version: "pltr_v1_backend_pilot",
  name: "PLTR backend pilot AIP valuation price-anchor adapter",
  description:
    "Backend pilot persists PLTR reporting events and event-date market price anchors in SQLite. Historical fair values remain produced by the existing PLTR valuation engine until the full PLTR valuation backend is promoted.",
  valuationMethods: ["Revenue Multiple", "EV / FCF", "DCF", "Rule of 40 implied multiple", "Long-term FCF per share"],
  assumptionSchema: {
    scenarios: ["Base"],
    sourceLayering: ["official_actual", "management_guidance", "forecast_assumption", "transcript_commentary", "research_only", "market_data"],
    notes:
      "The first backend slice is intentionally narrow: as-of prices come from daily_price_bars using nearest prior trading day. Frontend research-only scores remain excluded from valuation.",
  },
};
