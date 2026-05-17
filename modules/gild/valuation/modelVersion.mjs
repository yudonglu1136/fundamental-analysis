export const GILD_BACKEND_MODEL_VERSION = {
  version: "gild_v1_mature_biopharma_backend",
  name: "GILD mature-biopharma event-visible valuation model",
  description:
    "Unified stock-backend model for Gilead Sciences using event-visible HIV, HCV, oncology/cell therapy, Veklury normalization, patent/LOE, pipeline rNPV, FCF and capital-allocation snapshots.",
  valuationMethods: [
    { key: "fcff_dcf", label: "FCFF / FCF DCF", weight: 0.3 },
    { key: "fcf_shareholder_yield", label: "FCF Yield / Shareholder Yield", weight: 0.2 },
    { key: "franchise_sotp", label: "Franchise SOTP", weight: 0.2 },
    { key: "pipeline_rnpv", label: "Pipeline rNPV Overlay", weight: 0.1 },
    { key: "ev_ebit_ebitda", label: "EV/EBIT or EV/EBITDA", weight: 0.1 },
    { key: "pe_cross_check", label: "P/E Cross-check", weight: 0.05 },
    { key: "dividend_support", label: "Dividend Durability / Income Support", weight: 0.05 },
  ],
  assumptionSchema: {
    sourceLayers: [
      "official_actual",
      "management_guidance",
      "forecast_assumption",
      "franchise_assumption",
      "patent_assumption",
      "pipeline_assumption",
      "transcript_commentary",
      "research_only",
      "market_data",
    ],
    futureLeakagePolicy:
      "Every valuation run is built from rows with asOfDate/eventDate on or before the selected reporting event. Quarterly events use event-specific reporting snapshots and never roll forward later annual actuals.",
    transcriptPolicy:
      "Transcript rows are display-only by default. Missing transcripts carry transcriptImported=false, a checked source URL, retrieval date, missing reason and confidence. Q&A is never invented.",
    guidancePolicy:
      "Guidance candidates are valuationImpactAllowed=false unless explicitly promoted into forecast_assumption with documented rationale.",
  },
};
