export const LSEG_BACKEND_MODEL_VERSION = {
  id: "lseg_v1_backend_pilot",
  ticker: "LSEG.L",
  version: "lseg_v1_backend_pilot",
  name: "LSEG backend pilot adapter",
  description:
    "Phase 1 backend adapter that persists DB snapshots and calls the existing static LSEG valuation engine without forking formulas.",
  valuationMethods: ["FCFF DCF", "FCF Yield", "SOTP", "EV/EBITDA", "P/E", "Platform moat / risk overlay"],
};
