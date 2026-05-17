export const TRI_BACKEND_MODEL_VERSION = {
  version: "tri_v1_backend_pilot",
  name: "TRI backend-separated valuation pilot",
  description:
    "Maps TRI event-visible SQLite snapshots into the existing TRI frontend valuation engine while replacing current-period anchors with as-of reporting-event baselines.",
  valuationMethods: ["FCFF DCF", "FCF Yield", "EV/EBITDA", "P/E", "SOTP"],
  assumptionSchema: [
    "revenueCagr",
    "big3OrganicGrowth",
    "terminalAdjustedEbitdaMargin",
    "fcfConversionOfEbitda",
    "targetFcfYield",
    "targetEvEbitda",
    "targetPe",
    "wacc",
    "terminalGrowth",
    "aiPremium",
    "riskDiscount",
  ],
};
