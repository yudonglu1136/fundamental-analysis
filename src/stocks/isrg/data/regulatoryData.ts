import {
  ISRG_DV5_CARDIAC_RELEASE,
  ISRG_DV5_CE_MARK_RELEASE,
  ISRG_DV5_FDA_RELEASE,
  ISRG_SP_EXPANDED_RELEASE,
} from "../realData";

export const regulatoryData = [
  {
    id: "dv5-fda-clearance",
    platform: "da Vinci 5",
    region: "United States",
    status: "FDA cleared",
    date: "2024-03-14",
    sourceUrl: ISRG_DV5_FDA_RELEASE,
    sourceStatus: "official_actual" as const,
    valuationRule: "Does not change valuation directly; maps to da Vinci 5 placement and adoption assumptions.",
  },
  {
    id: "dv5-ce-mark",
    platform: "da Vinci 5",
    region: "Europe",
    status: "CE mark",
    date: "2025-01-30",
    sourceUrl: ISRG_DV5_CE_MARK_RELEASE,
    sourceStatus: "official_actual" as const,
    valuationRule: "Supports OUS adoption assumptions only after placement evidence is observed.",
  },
  {
    id: "dv5-cardiac",
    platform: "da Vinci 5",
    region: "United States",
    status: "FDA clearance for cardiac procedures",
    date: "2025-09-23",
    sourceUrl: ISRG_DV5_CARDIAC_RELEASE,
    sourceStatus: "official_actual" as const,
    valuationRule: "Procedure-category optionality; not directly capitalized without procedure evidence.",
  },
  {
    id: "sp-expanded-indications",
    platform: "da Vinci SP",
    region: "United States",
    status: "expanded indications",
    date: "2025-06-12",
    sourceUrl: ISRG_SP_EXPANDED_RELEASE,
    sourceStatus: "official_actual" as const,
    valuationRule: "Strategic optionality unless disclosed placements/procedures prove scale.",
  },
];

export const productSafetySources = [
  {
    id: "fda-recalls",
    label: "FDA medical device recalls database",
    sourceUrl: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm",
    sourceStatus: "research_only" as const,
    blocked: false,
    parsedSuccessfully: false,
    notes: "Fetcher records query metadata. Recall counts are not promoted into valuation without manual validation.",
  },
  {
    id: "fda-maude",
    label: "FDA MAUDE adverse event database",
    sourceUrl: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfMAUDE/search.CFM",
    sourceStatus: "research_only" as const,
    blocked: false,
    parsedSuccessfully: false,
    notes: "Adverse event references are trend watch items, not official performance KPIs.",
  },
];

