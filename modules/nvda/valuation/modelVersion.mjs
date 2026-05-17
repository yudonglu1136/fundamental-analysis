export const NVDA_BACKEND_MODEL_VERSION = {
  version: "nvda_v1_backend_pilot",
  name: "NVDA backend pilot AI infrastructure valuation adapter",
  description:
    "Backend pilot maps event-dated NVDA SQLite snapshots into the NVDA frontend valuation engine and persists as-of valuation runs without using future product-cycle, margin, price, or AI demand facts.",
  valuationMethods: ["DCF / FCFF", "FCF Yield", "P/E", "EV / EBIT", "SOTP"],
  assumptionSchema: {
    scenarios: ["Bear", "Base", "Bull"],
    sourceLayering: ["official_actual", "management_guidance", "forecast_assumption", "transcript_commentary", "research_only", "market_data"],
    nvdaDrivers: [
      "Data Center revenue growth",
      "Gaming normalization",
      "gross margin and ASP cycle",
      "Hopper / Blackwell / Rubin product-cycle transition",
      "training versus inference demand mix",
      "networking attach and systems mix",
      "China export-control risk",
      "TSMC / CoWoS supply constraints",
      "custom ASIC and AMD competitive pressure",
    ],
    notes:
      "Assumption sets are event-dated. Consolidated financial actuals are SEC-sourced when sourceType=official_actual; segment/product/supply-chain rows can be research_only until promoted from explicit official disclosures.",
  },
};
