import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "data/local/noc/noc_official_dataset.json");
const BUILD_DATE = new Date().toISOString();

const sourceTypes = {
  OFFICIAL: "official_actual",
  GUIDANCE: "management_guidance",
  ASSUMPTION: "forecast_assumption",
  RESEARCH: "research_only",
  MARKET: "market_data",
};

const sources = [
  {
    id: "noc-ar-2025",
    title: "Northrop Grumman 2025 Annual Report / Form 10-K",
    url: "https://cdn.northropgrumman.com/-/media/Project/Northrop-Grumman/ngc/who-we-are/corporate-responsibility/2025-Annual-Report-Northrop-Grumman.pdf?rev=6725192060ff4fd79c041d38cc4b842b",
    source_type: sourceTypes.OFFICIAL,
  },
  {
    id: "noc-q1-2026-8k",
    title: "Northrop Grumman Q1 2026 earnings release",
    url: "https://investor.northropgrumman.com/static-files/50bb4c80-e273-4ed4-92bb-f1653b8b1156",
    source_type: sourceTypes.OFFICIAL,
  },
  {
    id: "dod-sentinel-nunn-mccurdy-2024",
    title: "DoD Sentinel Nunn-McCurdy review",
    url: "https://www.defense.gov/News/Releases/Release/Article/3829985/department-of-defense-announces-results-of-sentinel-nunn-mccurdy-review/",
    source_type: sourceTypes.RESEARCH,
  },
  {
    id: "noc-market-snapshot-2026-04-24",
    title: "NOC market price snapshot",
    url: "https://stockanalysis.com/stocks/noc/",
    source_type: sourceTypes.MARKET,
  },
  {
    id: "noc-stockanalysis-transcript-index",
    title: "Northrop Grumman earnings call transcript index",
    url: "https://stockanalysis.com/stocks/noc/transcripts/",
    source_type: sourceTypes.RESEARCH,
  },
];

const dataset = {
  company: "Northrop Grumman Corporation",
  ticker: "NOC",
  currency: "USD",
  reportingCurrency: "USD",
  latestReportingPeriod: "Quarter ended March 31, 2026",
  buildDate: BUILD_DATE,
  source_type_contract: [
    "official_actual",
    "management_guidance",
    "forecast_assumption",
    "research_only",
    "market_data",
  ],
  financials: {
    source_type: sourceTypes.OFFICIAL,
    sourceId: "noc-ar-2025",
    fy2025: {
      sales: 41_954,
      operatingIncome: 4_511,
      operatingMargin: 0.108,
      segmentOperatingIncome: 4_377,
      segmentOperatingMargin: 0.104,
      netEarnings: 4_182,
      dilutedEps: 29.08,
      mtmAdjustedEps: 26.34,
      dilutedShares: 143.8,
      operatingCashFlow: 4_757,
      freeCashFlow: 3_307,
      capex: 1_450,
      netAwards: 46_300,
      fundedBacklog: 43_529,
      unfundedBacklog: 52_152,
      totalBacklog: 95_681,
      fixedPriceSales: 21_010,
      costTypeSales: 20_944,
      dividendPerShare: 8.99,
      buybacks: 1_600,
      cash: 4_403,
      longTermDebt: 15_162,
      currentDebt: 534,
      pensionAndOpbAssets: 3_167,
      pensionAndOpbLiabilities: 1_110,
    },
    fy2024: {
      sales: 41_033,
      operatingIncome: 4_370,
      segmentOperatingIncome: 4_544,
      segmentOperatingMargin: 0.111,
      dilutedEps: 28.34,
      freeCashFlow: 2_621,
      netAwards: 44_300,
      fundedBacklog: 38_826,
      unfundedBacklog: 52_642,
      totalBacklog: 91_468,
    },
    q1_2026: {
      sourceId: "noc-q1-2026-8k",
      sales: 9_881,
      operatingIncome: 989,
      segmentOperatingIncome: 1_072,
      segmentOperatingMargin: 0.108,
      dilutedEps: 6.14,
      operatingCashFlow: -1_656,
      freeCashFlow: -1_823,
      netAwards: 9_800,
      fundedBacklog: 44_068,
      unfundedBacklog: 51_540,
      totalBacklog: 95_608,
    },
  },
  segments: {
    source_type: sourceTypes.OFFICIAL,
    sourceId: "noc-ar-2025",
    fy2025: [
      { segment: "Aeronautics Systems", sales: 12_992, operatingIncome: 813, margin: 0.063, fundedBacklog: 12_585, unfundedBacklog: 10_467, totalBacklog: 23_052 },
      { segment: "Defense Systems", sales: 8_002, operatingIncome: 871, margin: 0.109, fundedBacklog: 8_610, unfundedBacklog: 19_186, totalBacklog: 27_796 },
      { segment: "Mission Systems", sales: 12_506, operatingIncome: 1_827, margin: 0.146, fundedBacklog: 13_251, unfundedBacklog: 5_381, totalBacklog: 18_632 },
      { segment: "Space Systems", sales: 10_771, operatingIncome: 1_183, margin: 0.11, fundedBacklog: 9_083, unfundedBacklog: 17_118, totalBacklog: 26_201 },
      { segment: "Intersegment eliminations", sales: -2_317, operatingIncome: -317 },
    ],
    q1_2026: [
      { segment: "Aeronautics Systems", sales: 3_283, operatingIncome: 305, margin: 0.093, fundedBacklog: 12_996, unfundedBacklog: 11_275, totalBacklog: 24_271 },
      { segment: "Defense Systems", sales: 1_899, operatingIncome: 184, margin: 0.097, fundedBacklog: 7_759, unfundedBacklog: 19_970, totalBacklog: 27_729 },
      { segment: "Mission Systems", sales: 2_861, operatingIncome: 433, margin: 0.151, fundedBacklog: 12_887, unfundedBacklog: 4_916, totalBacklog: 17_803 },
      { segment: "Space Systems", sales: 2_480, operatingIncome: 235, margin: 0.095, fundedBacklog: 10_426, unfundedBacklog: 15_379, totalBacklog: 25_805 },
      { segment: "Intersegment eliminations", sales: -642, operatingIncome: -85 },
    ],
  },
  backlog: {
    source_type: sourceTypes.OFFICIAL,
    sourceId: "noc-q1-2026-8k",
    totalBacklog: 95_608,
    fundedBacklog: 44_068,
    unfundedBacklog: 51_540,
    fundedRatio: 44_068 / 95_608,
    bookToBillQ1: 9_800 / 9_881,
  },
  guidance: {
    source_type: sourceTypes.GUIDANCE,
    sourceId: "noc-q1-2026-8k",
    fy2026: {
      salesRange: [43_500, 44_000],
      segmentOperatingIncomeRange: [4_850, 5_000],
      mtmAdjustedEpsRange: [27.4, 27.9],
      freeCashFlowRange: [3_100, 3_500],
    },
  },
  programDebates: [
    { name: "B-21 Raider", source_type: sourceTypes.RESEARCH, mappedAssumption: "b21ScaleMultiplier", sourceId: "noc-q1-2026-8k" },
    { name: "Sentinel / GBSD", source_type: sourceTypes.RESEARCH, mappedAssumption: "sentinelRiskCharge", sourceId: "dod-sentinel-nunn-mccurdy-2024" },
    { name: "Space Systems", source_type: sourceTypes.RESEARCH, mappedAssumption: "spaceGrowthPremium", sourceId: "noc-q1-2026-8k" },
    { name: "Mission Systems C4ISR / EW / sensors / cyber", source_type: sourceTypes.RESEARCH, mappedAssumption: "missionMoatPremium", sourceId: "noc-ar-2025" },
  ],
  earningsCallIntelligence: {
    source_type: sourceTypes.RESEARCH,
    sourceId: "noc-stockanalysis-transcript-index",
    sourceUrl: "https://stockanalysis.com/stocks/noc/transcripts/",
    window: ["Q2 2024", "Q1 2026"],
    quarterCount: 8,
    valuationImpactAllowed: false,
    topicScoreDiscipline: "AI-coded salience scores are research-only and cannot become official actuals or direct valuation inputs.",
    aiOverallSummary:
      "Market focus shifted from backlog / international demand / FCF ramp in 2024 to B-21 cost learning and Sentinel execution in 2025, then to B-21 production acceleration, Sentinel initial capability and 2027 growth inflection in Q1 2026.",
  },
  valuationAssumptions: {
    source_type: sourceTypes.ASSUMPTION,
    scenarios: {
      Bear: { revenueCagr: 0.025, segmentOperatingMargin: 0.098, sentinelRiskCharge: 0.008, b21ScaleMultiplier: 0.9 },
      Base: { revenueCagr: 0.045, segmentOperatingMargin: 0.108, sentinelRiskCharge: 0.003, b21ScaleMultiplier: 1 },
      Bull: { revenueCagr: 0.065, segmentOperatingMargin: 0.114, sentinelRiskCharge: 0, b21ScaleMultiplier: 1.15 },
    },
  },
  marketData: {
    source_type: sourceTypes.MARKET,
    sourceId: "noc-market-snapshot-2026-04-24",
    currentPrice: 575.11,
    priceDate: "2026-04-24",
  },
  validationBoundaries: [
    "official_actual can feed actualData and reconciliations.",
    "management_guidance can feed scenario anchors only through explicit mapping.",
    "forecast_assumption can drive valuation but must be labeled as assumption.",
    "research_only program and transcript records cannot directly become valuation actuals.",
    "market_data is isolated and should be refreshed before live investment use.",
  ],
  sources,
};

await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await fs.writeFile(OUTPUT_PATH, JSON.stringify(dataset, null, 2));
console.log(`NOC official dataset written to ${OUTPUT_PATH}`);
