export const BA_BACKEND_MODEL_VERSION = {
  id: "ba-backend-v1",
  version: "ba_v1_backend_defense_prime",
  createdAt: "2026-05-13T00:00:00.000Z",
  description:
    "BA.L unified backend pilot. Event-visible defense-prime valuation using existing BA frontend calculation logic plus backend method bridge and audit snapshots.",
  valuationMethods: [
    { key: "fcffDcf", label: "FCFF DCF", weight: 0.3 },
    { key: "fcfYield", label: "FCF Yield", weight: 0.2 },
    { key: "evEbit", label: "EV / EBIT", weight: 0.2 },
    { key: "segmentSotp", label: "Segment SOTP", weight: 0.15 },
    { key: "backlogOverlay", label: "Backlog / Order Book Overlay", weight: 0.1 },
    { key: "peCrossCheck", label: "P/E Cross-check", weight: 0.05 },
  ],
  terminalValueWarningThreshold: 0.72,
  backlogOverlayWarningThreshold: 0.2,
};
