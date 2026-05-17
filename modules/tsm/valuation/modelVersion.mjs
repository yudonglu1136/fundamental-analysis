export const TSM_BACKEND_MODEL_VERSION = {
  version: "tsm_v1_backend_pilot",
  name: "TSM Foundry Backend Pilot",
  description:
    "Event-visible TSMC foundry valuation using quarterly revenue, guidance, margin, node/platform mix, explicit capex and geopolitical/customer/AI-cycle haircuts.",
  valuationMethods: ["dcf", "fcf_yield", "pe", "ev_ebit", "node_mix_sotp"],
  assumptionSchema: {
    revenueGrowth: "Forward revenue growth as of the reporting event.",
    hpcGrowth: "Forward HPC/AI growth evidence mapped explicitly into growth.",
    advancedNodeMix: "7nm-and-below or latest official advanced-node mix.",
    normalizedFcfMargin: "Normalized FCF margin after capex intensity.",
    capexIntensity: "Capex as percent of revenue.",
    geopoliticsHaircut: "Explicit valuation haircut for Taiwan/geopolitical risk.",
    customerConcentrationHaircut: "Explicit customer concentration haircut.",
    aiCycleHaircut: "Explicit AI/HPC demand-cycle haircut.",
  },
};
