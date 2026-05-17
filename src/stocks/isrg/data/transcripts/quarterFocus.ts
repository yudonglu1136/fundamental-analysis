import type { IsrgQuarterFocusSnapshot } from "../../model";

function scores(overrides: Record<string, number>) {
  return {
    "Procedure growth": 3,
    "da Vinci 5": 0,
    "System placements": 3,
    "Lease mix": 2,
    "OUS growth": 2,
    China: 1,
    Ion: 2,
    SP: 1,
    Margins: 2,
    Tariffs: 0,
    Competition: 1,
    "GLP-1": 0,
    Bariatric: 1,
    "Capital allocation": 1,
    Guidance: 2,
    "Hospital budget": 2,
    "Regulatory / safety": 1,
    ...overrides,
  };
}

export const isrgQuarterFocusSnapshots: IsrgQuarterFocusSnapshot[] = [
  {
    periodId: "q2-2024",
    label: "Q2 2024",
    fiscalYear: 2024,
    fiscalQuarter: 2,
    callDate: "2024-07-18",
    primaryMarketFocus: "Procedure durability and system placement recovery",
    aiSummary:
      "Investor debate was still centered on whether post-pandemic procedure growth and hospital capex could support renewed system placements. Ion was visible but still framed as early optionality.",
    bullBearRead:
      "Bull case focused on procedure resilience and installed-base expansion; bear case watched hospital budgets and whether capital equipment demand was merely catching up.",
    focusScores: scores({ "Procedure growth": 5, "System placements": 4, "Hospital budget": 4, Ion: 2, "da Vinci 5": 1 }),
    sourceQuality: "low",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    researchOnly: true,
    valuationImpactAllowed: false,
  },
  {
    periodId: "q3-2024",
    label: "Q3 2024",
    fiscalYear: 2024,
    fiscalQuarter: 3,
    callDate: "2024-10-17",
    primaryMarketFocus: "da Vinci 5 rollout quality and early replacement-cycle signal",
    aiSummary:
      "The market focus shifted toward da Vinci 5 launch discipline, supply readiness, and whether early placements were replacement-heavy or evidence of broader demand.",
    bullBearRead:
      "Bull case saw product-cycle leadership strengthening the installed-base moat; bear case worried that the upgrade cycle might pull demand forward without expanding TAM.",
    focusScores: scores({ "da Vinci 5": 5, "System placements": 4, "Procedure growth": 4, "Lease mix": 3, "Guidance": 3 }),
    sourceQuality: "low",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    researchOnly: true,
    valuationImpactAllowed: false,
  },
  {
    periodId: "q4-2024",
    label: "Q4 2024",
    fiscalYear: 2024,
    fiscalQuarter: 4,
    callDate: "2025-01-23",
    primaryMarketFocus: "2025 procedure guidance, GLP-1/bariatric questions, and OUS runway",
    aiSummary:
      "After year-end results, investors focused on the next-year procedure growth guide, OUS penetration, and whether GLP-1 pressure could affect bariatric mix over time.",
    bullBearRead:
      "Bull case leaned on procedure-category breadth and OUS adoption; bear case sharpened around bariatric exposure and valuation sensitivity to lower procedure CAGR.",
    focusScores: scores({ "Procedure growth": 5, Guidance: 5, "OUS growth": 4, "GLP-1": 3, Bariatric: 4, "da Vinci 5": 3 }),
    sourceQuality: "low",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    researchOnly: true,
    valuationImpactAllowed: false,
  },
  {
    periodId: "q1-2025",
    label: "Q1 2025",
    fiscalYear: 2025,
    fiscalQuarter: 1,
    callDate: "2025-04-22",
    primaryMarketFocus: "Placement mix, leasing, and da Vinci 5 demand signal",
    aiSummary:
      "Investor attention broadened from pure procedure growth to placement quality, operating lease penetration, and the reported mix of da Vinci 5 placements.",
    bullBearRead:
      "Bull case framed leases as lowering adoption friction; bear case asked whether usage-based leases were a sign of hospital budget pressure and lower upfront revenue quality.",
    focusScores: scores({ "da Vinci 5": 5, "Lease mix": 5, "System placements": 4, "Hospital budget": 4, Guidance: 3 }),
    sourceQuality: "low",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    researchOnly: true,
    valuationImpactAllowed: false,
  },
  {
    periodId: "q2-2025",
    label: "Q2 2025",
    fiscalYear: 2025,
    fiscalQuarter: 2,
    callDate: "2025-07-22",
    primaryMarketFocus: "OUS adoption, China risk, and Ion second-platform proof points",
    aiSummary:
      "The market debate increasingly separated core da Vinci momentum from optionality: OUS growth, China tender/local competition risk, and whether Ion utilization was becoming meaningful.",
    bullBearRead:
      "Bull case saw international penetration and Ion as second-growth vectors; bear case watched China pricing, local robotics players, and whether Ion could move consolidated valuation.",
    focusScores: scores({ "OUS growth": 5, China: 4, Ion: 4, Competition: 3, "Procedure growth": 4, Margins: 3 }),
    sourceQuality: "low",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    researchOnly: true,
    valuationImpactAllowed: false,
  },
  {
    periodId: "q3-2025",
    label: "Q3 2025",
    fiscalYear: 2025,
    fiscalQuarter: 3,
    callDate: "2025-10-21",
    primaryMarketFocus: "Margin durability, tariff exposure, and product-cycle execution",
    aiSummary:
      "Focus moved toward gross margin durability as tariffs and supply-chain/manufacturing geography became more important alongside da Vinci 5 launch execution.",
    bullBearRead:
      "Bull case assumed margin pressure was temporary and product-cycle mix would help; bear case stressed tariff drag, manufacturing costs, and eventual ASP pressure.",
    focusScores: scores({ Margins: 5, Tariffs: 4, "da Vinci 5": 4, "System placements": 3, Competition: 3, "Regulatory / safety": 2 }),
    sourceQuality: "low",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    researchOnly: true,
    valuationImpactAllowed: false,
  },
  {
    periodId: "q4-2025",
    label: "Q4 2025",
    fiscalYear: 2025,
    fiscalQuarter: 4,
    callDate: "2026-01-22",
    primaryMarketFocus: "2026 guidance, da Vinci 5 adoption curve, and replacement vs TAM expansion",
    aiSummary:
      "Year-end discussion concentrated on 2026 procedure guidance, how much da Vinci 5 was supporting placements, and whether the upgrade cycle represented replacement demand or incremental TAM.",
    bullBearRead:
      "Bull case needed continued mid-teens procedures and a credible upgrade cycle; bear case focused on perfect-execution valuation and the risk of lower utilization growth.",
    focusScores: scores({ Guidance: 5, "Procedure growth": 5, "da Vinci 5": 5, "System placements": 4, "Lease mix": 4, "Capital allocation": 2 }),
    sourceQuality: "todo",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    researchOnly: true,
    valuationImpactAllowed: false,
  },
  {
    periodId: "q1-2026",
    label: "Q1 2026",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    callDate: "2026-04-21",
    primaryMarketFocus: "Tariffs, procedure guidance, da Vinci 5 share, and lease quality",
    aiSummary:
      "The latest quarter pushed margin/tariff risk into the foreground while procedure growth, da Vinci 5 placement share, and usage-based lease penetration remained central to the compounder debate.",
    bullBearRead:
      "Bull case points to resilient procedure growth and strong da Vinci 5 adoption; bear case asks whether tariffs, leases, and valuation leave little margin of safety if procedure growth normalizes.",
    focusScores: scores({ Tariffs: 5, Margins: 5, "Procedure growth": 5, "da Vinci 5": 5, "Lease mix": 5, Guidance: 4, Ion: 3 }),
    sourceQuality: "todo",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    researchOnly: true,
    valuationImpactAllowed: false,
  },
];

