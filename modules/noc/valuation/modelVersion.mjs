export const NOC_BACKEND_MODEL_VERSION = {
  ticker: "NOC",
  version: "noc_v1_backend_pilot",
  name: "NOC defense-prime event-visible backend pilot",
  description:
    "Backend-separated NOC research pilot that anchors each valuation run to a quarterly reporting event, isolates official actuals from research-only programme proxies, and calls the existing NOC frontend valuation formula.",
  valuationMethods: [
    { key: "dcf", label: "Defense FCFF DCF", weight: 0.28 },
    { key: "fcfYield", label: "FCF Yield Value", weight: 0.2 },
    { key: "evEbit", label: "EV / EBIT Value", weight: 0.12 },
    { key: "pe", label: "P/E Value", weight: 0.12 },
    { key: "sotp", label: "Segment SOTP", weight: 0.14 },
    { key: "backlog", label: "Backlog Durability Layer", weight: 0.14 },
  ],
  sourceIsolationPolicy: {
    officialActuals: "SEC companyfacts, NOC official annual/quarterly releases, and local official source cache.",
    managementGuidance: "Stored separately in guidance_items and only valuation-impacting when explicitly reviewed.",
    forecastAssumptions: "Stored in assumption_sets and passed to the existing NOC valuation engine.",
    transcriptCommentary: "Imported as research-only and modelReady=false until explicitly promoted.",
    marketData: "Daily adjusted close is kept in daily_price_bars and used for as-of price anchoring.",
  },
};
