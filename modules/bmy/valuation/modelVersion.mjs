export const BMY_BACKEND_MODEL_VERSION = {
  version: "bmy_v1_backend_pilot",
  name: "BMY backend pilot valuation adapter",
  description:
    "Backend pilot maps event-visible BMY SEC financials, product disclosures, LOE risks and date-gated pipeline assumptions into the existing biopharma research valuation engine.",
  valuationMethods: ["Core EPS / P/E", "Pipeline rNPV", "Scenario NAV", "Dividend Bridge"],
  assumptionSchema: {
    scenarios: ["Bear", "Base", "Bull"],
    sourceLayering: ["official_actual", "management_guidance", "forecast_assumption", "transcript_commentary", "research_only", "market_data"],
    notes:
      "Historical assumption sets are event-dated. Product mix, pipeline and LOE rows are filtered by asOfDate/eventDate so historical runs do not use future disclosures.",
  },
};
