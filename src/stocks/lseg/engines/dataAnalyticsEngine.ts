import type { LsegCockpitDataset, LsegSpecialistEngineOutput } from "../types";

export function calculateLsegDataAnalyticsEngine(data: LsegCockpitDataset): LsegSpecialistEngineOutput {
  const segment = data.segmentActuals.find((row) => row.segment === "Data & Analytics");
  const productLines = data.productLines.filter((row) => row.segment === "Data & Analytics");
  const recurringRevenue = productLines.reduce((sum, row) => sum + row.revenue, 0);
  const workspace = productLines.find((row) => row.name === "Workflows");
  const dataFeeds = productLines.find((row) => row.name === "Data & feeds");
  const analytics = productLines.find((row) => row.name === "Analytics");

  return {
    title: "Data & Analytics / Workspace Lab",
    segment: "Data & Analytics",
    summary:
      "D&A is the largest segment and the main premium-multiple debate: Workspace must deepen workflow relevance while enterprise feeds and analytics benefit from AI-ready data consumption.",
    metrics: [
      { label: "Revenue ex recoveries", value: segment?.revenue ?? 0, sourceType: "official_actual", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Adjusted EBITDA", value: segment?.adjustedEbitda ?? 0, sourceType: "official_actual", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Organic growth", value: segment?.organicGrowth ?? 0, sourceType: "official_actual", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Recurring product-line revenue", value: recurringRevenue, sourceType: "official_actual", sourceId: "lseg-ar2025-pdf" },
      { label: "Workflows revenue", value: workspace?.revenue ?? 0, sourceType: "official_actual", sourceId: workspace?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Data & feeds revenue", value: dataFeeds?.revenue ?? 0, sourceType: "official_actual", sourceId: dataFeeds?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Analytics revenue", value: analytics?.revenue ?? 0, sourceType: "official_actual", sourceId: analytics?.sourceId ?? "lseg-ar2025-pdf" },
    ],
    drivers: [
      "Workspace migration from Eikon / legacy Refinitiv workflows into a more integrated desktop and Microsoft-linked environment.",
      "Enterprise data feeds and API consumption as customers build AI and data-science workflows.",
      "Pricing, retention and gross sales conversion, with ASV +5.9% used as an official directional anchor.",
      "Technology rationalization from Refinitiv integration should show up as margin expansion without double counting revenue synergy.",
    ],
    debates: [
      "Can Workspace materially narrow Bloomberg's workflow lock-in advantage?",
      "Does AI expand trusted data usage, or does it pressure seat-based terminal pricing?",
      "Is Refinitiv now a compounding platform asset or still an integration drag?",
    ],
    monitoring: [
      "ASV growth, retention and renewal commentary.",
      "Workspace adoption, Open Directory and Microsoft partnership disclosures.",
      "Enterprise feed/API growth and AI-ready data partnership references.",
      "D&A organic growth below 4% for two periods is a kill-warning for premium multiple.",
    ],
    warnings: [
      "Workspace seats, pricing and retention are not fully disclosed as official actuals; dashboard treats them as debate variables, not hard valuation facts.",
    ],
  };
}
