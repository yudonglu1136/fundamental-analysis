import type { MetaResearchNote } from "../model";
import { metaLineage } from "./lineage";
import { metaScenarioDefinitions } from "./researchOnlyData";

export const metaForecastAssumptionNotes: MetaResearchNote[] = [
  {
    id: "ai-uplift-source-isolation",
    sourceStatus: "research_only",
    lineage: metaLineage.researchOnly,
    topic: "AI uplift source isolation",
    conclusion: "AI uplift is expressed through ad impression growth, average price per ad, FoA margin, and capex payback diagnostics.",
    valuationMapping: "No separate AI premium is added to the base blended fair value.",
    notes: "This prevents double-counting AI tools already embedded in official ad revenue and management commentary.",
  },
  {
    id: "buyback-dilution-policy",
    sourceStatus: "research_only",
    lineage: metaLineage.researchOnly,
    topic: "SBC / buyback offset",
    conclusion: "Buybacks affect forecast share count and EPS only; they are not also added as a standalone valuation uplift.",
    valuationMapping: "Share-count forecast, P/E, FCF/share, and 3Y target price.",
    notes: "This keeps capital returns from being counted twice.",
  },
  {
    id: "capex-guidance-anchor",
    sourceStatus: "research_only",
    lineage: metaLineage.researchOnly,
    topic: "Capex guidance anchor",
    conclusion: "FY2026 capex is anchored to management's USD 125bn to USD 145bn guide, then fades by scenario.",
    valuationMapping: "DCF, FCF yield, AI payback, and risk red-team diagnostics.",
    notes: "The model uses explicit capex dollars rather than a pure margin score.",
  },
];

export { metaScenarioDefinitions };
