export const ISRG_BACKEND_MODEL_VERSION = {
  version: "isrg_v1_backend_pilot",
  name: "ISRG backend historical valuation pilot",
  description:
    "SQLite-backed reporting-event valuation pilot for Intuitive Surgical. Calls the existing ISRG frontend valuation logic through an adapter and stores event-visible KPI snapshots.",
  valuationMethods: [
    "Procedure-based DCF",
    "Segment-based valuation",
    "Forward P/E sanity check",
    "FCF yield sanity check",
    "Bull/Base/Bear scenario range",
  ],
};

