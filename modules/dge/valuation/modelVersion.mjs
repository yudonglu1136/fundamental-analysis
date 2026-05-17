export const DGE_BACKEND_MODEL_VERSION = {
  version: "dge_v1_backend_pilot",
  name: "DGE.L backend pilot valuation adapter",
  description:
    "Backend pilot wraps the existing DGE.L frontend valuation engine, maps SQLite reporting-event snapshots into DGE assumptions, and persists historical valuation runs without duplicating valuation formulas.",
  valuationMethods: ["Normalized FCF Yield", "EV / EBIT", "EV / EBITDA", "P/E Cross Check", "Dividend Floor", "Region Quality"],
  assumptionSchema: {
    scenarios: ["Bear", "Base", "Bull"],
    sourceLayering: ["official_actual", "management_guidance", "forecast_assumption", "transcript_commentary", "research_only", "market_data"],
    notes:
      "Diageo reports semi-annually and annually with selected trading updates; unsupported quarterly rows are proxy/forecast-assumption rows and are not official actuals.",
  },
};
