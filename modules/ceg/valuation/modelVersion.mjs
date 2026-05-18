export const CEG_BACKEND_MODEL_VERSION = {
  version: "ceg_v1_backend_pilot",
  name: "CEG backend-separated valuation pilot",
  description:
    "Event-visible CEG nuclear-scarcity valuation model using SEC companyfacts, Nasdaq daily price anchors, normalized FCF, P/E, EV/EBITDA, and explicit AI power/regulatory overlays.",
  valuationMethods: ["FCFF DCF", "Normalized FCF Yield", "P/E", "EV/EBITDA", "Nuclear Scarcity Overlay"],
  assumptionSchema: [
    "revenueGrowth",
    "operatingMargin",
    "normalizedFcfMargin",
    "targetFcfYield",
    "targetPe",
    "evEbitdaMultiple",
    "discountRate",
    "terminalGrowth",
    "nuclearScarcityPremium",
    "dataCenterDemandUplift",
    "regulatoryHaircut",
  ],
};
