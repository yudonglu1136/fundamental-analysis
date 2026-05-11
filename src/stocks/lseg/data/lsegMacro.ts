import type { LsegMacroPoint } from "../model";

export const lsegMacro: LsegMacroPoint[] = [
  {
    periodId: "fy24",
    ukRiskFreeRate: 0.041,
    equityRiskPremium: 0.052,
    commentary: "GBP risk-free placeholder based on UK 10-year gilt style assumptions.",
    sourceType: "assumption",
  },
  {
    periodId: "fy25",
    ukRiskFreeRate: 0.0425,
    equityRiskPremium: 0.0525,
    commentary: "Base-year WACC anchor for LSEG valuation.",
    sourceType: "assumption",
  },
  {
    periodId: "fy26",
    ukRiskFreeRate: 0.042,
    equityRiskPremium: 0.0525,
    commentary: "Guidance-year placeholder for UK risk-free rate and ERP.",
    sourceType: "assumption",
  },
];
