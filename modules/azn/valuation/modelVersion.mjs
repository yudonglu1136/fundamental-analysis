export const AZN_BACKEND_MODEL_VERSION = {
  version: "azn_v1_backend_pilot",
  name: "AZN backend historical biopharma valuation pilot",
  description:
    "Event-visible backend pilot for AstraZeneca using therapy-area/product snapshots, pipeline rNPV, patent-cliff risk, market snapshots, transcript commentary and existing AZN valuation formulas.",
  valuationMethods: [
    { key: "fcff_dcf", label: "FCFF DCF", weight: 0.3 },
    { key: "fcf_yield", label: "FCF Yield", weight: 0.15 },
    { key: "therapy_area_sotp", label: "Product / Therapy-area SOTP", weight: 0.25 },
    { key: "pipeline_rnpv", label: "Pipeline rNPV", weight: 0.15 },
    { key: "ev_ebitda", label: "EV/EBITDA", weight: 0.1 },
    { key: "pe_cross_check", label: "P/E Cross-check", weight: 0.05 },
  ],
  assumptionSchema: {
    sourceLayers: [
      "official_actual",
      "management_guidance",
      "forecast_assumption",
      "pipeline_assumption",
      "transcript_commentary",
      "research_only",
      "market_data",
    ],
    futureLeakagePolicy:
      "All rows used by a valuation run must have asOfDate/eventDate <= reporting event date. Interim events use run-rate snapshots rather than stale annual actuals.",
    transcriptPolicy:
      "Transcript commentary and Q&A are research-only/display-only by default and valuationImpactAllowed=false unless explicitly promoted.",
  },
};
