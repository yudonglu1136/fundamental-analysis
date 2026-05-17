import type { DgeResearchAssumption } from "../types";

export const dgeResearchAssumptions: DgeResearchAssumption[] = [
  {
    id: "assumption-us-consumption-gap",
    label: "US consumption vs shipment gap",
    value: 0.079,
    unit: "percentage points",
    category: "US demand cycle",
    rationale:
      "Q3 US Spirits shipments were about 5 points weaker than depletions; the residual gap between depletions and true consumption is modeled from public industry volume weakness and affordability pressure.",
    sourceEvidenceIds: ["q3fy2026-us-spirits-shipments-depletions", "industry-iwsr-us-2025", "h1fy2026-us-affordability"],
  },
  {
    id: "assumption-lac-low-base-effect",
    label: "LAC low-base effect",
    value: 0.035,
    unit: "percentage points",
    category: "LAC inventory cycle",
    rationale:
      "LAC Q3 growth laps prior destocking. A research-only low-base haircut avoids treating the full 16.2% as true consumer recovery.",
    sourceEvidenceIds: ["q3fy2026-lac", "q3fy2026-world-cup-pull-forward", "research-assumption-demand-cycle"],
  },
  {
    id: "assumption-lac-restocking-effect",
    label: "LAC restocking effect",
    value: 0.04,
    unit: "percentage points",
    category: "LAC inventory cycle",
    rationale:
      "The module separates distributor restocking from consumer demand because Diageo's LAC recovery follows an unusually sharp channel destocking cycle.",
    sourceEvidenceIds: ["q3fy2026-lac", "q1fy2026-regional-table", "research-assumption-demand-cycle"],
  },
  {
    id: "assumption-world-cup-pull-forward",
    label: "World Cup pull-forward",
    value: 0.025,
    unit: "percentage points",
    category: "Channel inventory",
    rationale:
      "Q3 statement explicitly cites FIFA World Cup distributor buy-in; this is separated from normalized LAC and Europe growth quality.",
    sourceEvidenceIds: ["q3fy2026-world-cup-pull-forward", "research-assumption-demand-cycle"],
  },
  {
    id: "assumption-true-lac-recovery",
    label: "True LAC consumer recovery",
    value: 0.055,
    unit: "percentage points",
    category: "LAC consumer demand",
    rationale:
      "Brazil recovery, positive volume and price/mix support some real demand recovery, but Mexico high-single-digit decline caps confidence.",
    sourceEvidenceIds: ["q3fy2026-lac"],
  },
  {
    id: "assumption-normalized-fcf",
    label: "Normalized FCF",
    value: 2_850,
    unit: "USD millions",
    category: "Valuation",
    rationale:
      "Normalized FCF starts below the $3bn FY26 guide because working capital, inventory, exceptional costs and tariff uncertainty still need proof.",
    sourceEvidenceIds: ["h1fy2026-profit-fcf-debt", "q3fy2026-guidance", "research-assumption-demand-cycle"],
  },
  {
    id: "assumption-base-target-fcf-yield",
    label: "Base target FCF yield",
    value: 0.08,
    unit: "percent",
    category: "Valuation",
    rationale:
      "FCF yield is set wider than a high-quality staples bond-proxy because US demand and LAC inventory quality remain unresolved.",
    sourceEvidenceIds: ["q3fy2026-us-spirits-shipments-depletions", "q3fy2026-lac", "research-assumption-demand-cycle"],
  },
  {
    id: "assumption-normalized-ebit",
    label: "Normalized EBIT",
    value: 5_650,
    unit: "USD millions",
    category: "Valuation",
    rationale:
      "Anchored to FY2025 operating profit before exceptional items and adjusted for FY2026 organic profit guidance.",
    sourceEvidenceIds: ["fy2025-profit-fcf-net-debt", "q3fy2026-guidance"],
  },
  {
    id: "assumption-normalized-ebitda",
    label: "Normalized EBITDA",
    value: 6_450,
    unit: "USD millions",
    category: "Valuation",
    rationale:
      "Uses adjusted EBITDA/leverage evidence with a modest normalization around FY2025 and H1 FY2026 run-rate.",
    sourceEvidenceIds: ["fy2025-profit-fcf-net-debt", "h1fy2026-profit-fcf-debt"],
  },
  {
    id: "assumption-region-quality-adjustment",
    label: "Region quality adjustment",
    value: -0.05,
    unit: "percent",
    category: "Valuation",
    rationale:
      "Region-quality method haircuts North America and LAC until shipments/depletions and low-base effects become cleaner.",
    sourceEvidenceIds: ["q3fy2026-north-america", "q3fy2026-lac", "research-assumption-demand-cycle"],
  },
];
