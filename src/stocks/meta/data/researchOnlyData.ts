import type { MetaResearchNote, MetaScenarioDefinition } from "../model";
import { metaLineage } from "./lineage";

export const metaResearchOnlyData: MetaResearchNote[] = [
  {
    id: "core-debate-ai-capex-payback",
    sourceStatus: "research_only",
    lineage: metaLineage.researchOnly,
    topic: "AI capex payback",
    conclusion: "The investable question is not whether AI is useful; it is whether AI-driven ad pricing, conversion, and engagement can fund the step-change in infrastructure spend.",
    valuationMapping: "Revenue growth, FoA operating margin, capex intensity, WACC, and AI payback diagnostics.",
    notes: "The valuation embeds AI in forecast growth and margin rather than adding a separate narrative premium.",
  },
  {
    id: "foa-is-cash-engine",
    sourceStatus: "research_only",
    lineage: metaLineage.researchOnly,
    topic: "Family of Apps economics",
    conclusion: "Family of Apps remains the cash engine, with Reality Labs and AI infrastructure competing for reinvestment dollars.",
    valuationMapping: "Segment SOTP, consolidated DCF, P/E, and EV/EBIT cross-checks.",
    notes: "FoA segment operating income reconciles to consolidated operating income after Reality Labs losses.",
  },
  {
    id: "rl-option-not-core",
    sourceStatus: "research_only",
    lineage: metaLineage.researchOnly,
    topic: "Reality Labs option value",
    conclusion: "Reality Labs should be underwritten as a funded call option, not as core advertising value.",
    valuationMapping: "Reality Labs option value appears only in SOTP and is excluded from DCF add-backs.",
    notes: "The consolidated DCF already captures the loss drag.",
  },
];

export const metaScenarioDefinitions: MetaScenarioDefinition[] = [
  {
    scenario: "Bear",
    sourceStatus: "forecast_assumption",
    probabilityWeight: 0.25,
    narrative: "AI infrastructure costs stay elevated, Europe/regulatory pressure bites, ad pricing normalizes, and Reality Labs losses persist.",
    mappedDrivers: ["higher capex", "lower price-per-ad CAGR", "lower FoA margin", "higher WACC", "no RL option value"],
  },
  {
    scenario: "Base",
    sourceStatus: "forecast_assumption",
    probabilityWeight: 0.5,
    narrative: "Meta converts AI recommendation and ad automation into sustained revenue growth while capex intensity fades after the 2026 buildout.",
    mappedDrivers: ["Q2/FY2026 management guide", "AI embedded in ad pricing and margin", "capex fade", "explicit RL drag"],
  },
  {
    scenario: "Bull",
    sourceStatus: "forecast_assumption",
    probabilityWeight: 0.25,
    narrative: "AI ad tools, business messaging, and product engagement drive premium growth and margin while infrastructure utilization improves.",
    mappedDrivers: ["higher price-per-ad CAGR", "lower capex fade", "higher FoA margin", "some RL option value", "lower WACC"],
  },
];
