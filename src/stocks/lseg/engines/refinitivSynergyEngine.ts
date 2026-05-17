import type { LsegCockpitDataset } from "../types";

export type LsegRefinitivSynergyOutput = {
  costSynergyRunRate: number;
  revenueSynergyScore: number;
  integrationCost: number;
  technologyRationalizationScore: number;
  crossSellScore: number;
  workspaceAdoptionScore: number;
  marginBridgeBps: Array<{ label: string; bps: number; sourceType: "management_guidance" | "forecast_assumption"; note: string }>;
  doubleCountWarnings: string[];
  summary: string;
};

export function calculateLsegRefinitivSynergyEngine(data: LsegCockpitDataset): LsegRefinitivSynergyOutput {
  const guidance = data.managementGuidance[0];
  const expectedMarginExpansion =
    ((guidance.constantCurrencyEbitdaMarginExpansionLowBps + guidance.constantCurrencyEbitdaMarginExpansionHighBps) / 2);

  return {
    costSynergyRunRate: 0,
    revenueSynergyScore: 67,
    integrationCost: 120,
    technologyRationalizationScore: 74,
    crossSellScore: 68,
    workspaceAdoptionScore: 62,
    marginBridgeBps: [
      {
        label: "2026 company-guided constant-currency margin expansion",
        bps: expectedMarginExpansion,
        sourceType: "management_guidance",
        note: "Stored as guidance range midpoint only for display; valuation still uses scenario margins by segment.",
      },
      {
        label: "Technology platform rationalization",
        bps: 35,
        sourceType: "forecast_assumption",
        note: "Modeled as margin support, not separately added as an EV uplift.",
      },
      {
        label: "Reinvestment in product and AI-ready data",
        bps: -25,
        sourceType: "forecast_assumption",
        note: "Prevents double counting synergy as both margin expansion and revenue premium.",
      },
    ],
    doubleCountWarnings: [
      "Revenue synergy is not separately capitalized; it appears only through explicit segment growth assumptions.",
      "Cost synergy / technology rationalization appears in margins and is not added again as a standalone SOTP asset.",
      "Platform premium is capped in the platform moat engine and must not be duplicated in terminal growth.",
    ],
    summary:
      "Refinitiv integration is treated as a margin and workflow adoption bridge. The model blocks separate synergy capitalization unless it is first mapped into segment growth, margin or a capped platform adjustment.",
  };
}
