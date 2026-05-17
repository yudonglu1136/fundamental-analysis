import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { TSM_BACKEND_DB_PATH, TSM_BACKEND_SCHEMA_PATH } from "./schema.mjs";
import { TSM_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "TSM";
const TSM_IR = "https://investor.tsmc.com/english/quarterly-results";
const ANNUAL_2025 = "https://investor.tsmc.com/static/annualReports/2025/english/index.html";

function q({
  fiscalYear,
  fiscalQuarter,
  eventDate,
  revenueUsd,
  grossMargin,
  operatingMargin,
  guidanceRevenueNextQuarterUsd,
  guidanceGrossMarginNextQuarter,
  guidanceOperatingMarginNextQuarter,
  hpcMix,
  smartphoneMix,
  advancedNodeMix,
  capexGuidanceUsd,
  netIncomeUsd = null,
  netMargin = null,
  dilutedEpsPerAdr = null,
  mixSourceType = "market_data_proxy",
  capexSourceType = "research_only",
}) {
  const quarterNumber = Number(String(fiscalQuarter).replace("Q", ""));
  const quarterSlug = String(fiscalQuarter).toLowerCase();
  const shortYear = String(fiscalYear).slice(-2);
  return {
    id: `tsm-${fiscalYear}-${quarterSlug}`,
    eventDate,
    fiscalPeriod: `${quarterNumber}Q${shortYear}`,
    fiscalYear,
    fiscalQuarter,
    eventType: `q${quarterNumber}_results`,
    sourceUrl: `${TSM_IR}/${fiscalYear}/${quarterSlug}`,
    revenueUsd,
    grossMargin,
    operatingMargin,
    guidanceRevenueNextQuarterUsd,
    guidanceGrossMarginNextQuarter,
    guidanceOperatingMarginNextQuarter,
    hpcMix,
    smartphoneMix,
    advancedNodeMix,
    capexGuidanceUsd,
    netIncomeUsd,
    netMargin,
    dilutedEpsPerAdr,
    mixSourceType,
    capexSourceType,
  };
}

const quarterlyRows = [
  q({ fiscalYear: 2018, fiscalQuarter: "Q1", eventDate: "2018-04-19", revenueUsd: 8_460, grossMargin: 0.503, operatingMargin: 0.390, guidanceRevenueNextQuarterUsd: 7_850, guidanceGrossMarginNextQuarter: 0.480, guidanceOperatingMarginNextQuarter: 0.360, hpcMix: 0.31, smartphoneMix: 0.46, advancedNodeMix: 0.36, capexGuidanceUsd: 10_500 }),
  q({ fiscalYear: 2018, fiscalQuarter: "Q2", eventDate: "2018-07-19", revenueUsd: 7_850, grossMargin: 0.478, operatingMargin: 0.362, guidanceRevenueNextQuarterUsd: 8_500, guidanceGrossMarginNextQuarter: 0.490, guidanceOperatingMarginNextQuarter: 0.375, hpcMix: 0.32, smartphoneMix: 0.46, advancedNodeMix: 0.38, capexGuidanceUsd: 10_500 }),
  q({ fiscalYear: 2018, fiscalQuarter: "Q3", eventDate: "2018-10-18", revenueUsd: 8_490, grossMargin: 0.474, operatingMargin: 0.366, guidanceRevenueNextQuarterUsd: 9_400, guidanceGrossMarginNextQuarter: 0.480, guidanceOperatingMarginNextQuarter: 0.370, hpcMix: 0.33, smartphoneMix: 0.46, advancedNodeMix: 0.40, capexGuidanceUsd: 10_500 }),
  q({ fiscalYear: 2018, fiscalQuarter: "Q4", eventDate: "2019-01-17", revenueUsd: 9_400, grossMargin: 0.477, operatingMargin: 0.370, guidanceRevenueNextQuarterUsd: 7_350, guidanceGrossMarginNextQuarter: 0.440, guidanceOperatingMarginNextQuarter: 0.320, hpcMix: 0.34, smartphoneMix: 0.45, advancedNodeMix: 0.41, capexGuidanceUsd: 10_500 }),
  q({ fiscalYear: 2019, fiscalQuarter: "Q1", eventDate: "2019-04-18", revenueUsd: 7_100, grossMargin: 0.413, operatingMargin: 0.294, guidanceRevenueNextQuarterUsd: 7_600, guidanceGrossMarginNextQuarter: 0.440, guidanceOperatingMarginNextQuarter: 0.320, hpcMix: 0.30, smartphoneMix: 0.45, advancedNodeMix: 0.38, capexGuidanceUsd: 15_000 }),
  q({ fiscalYear: 2019, fiscalQuarter: "Q2", eventDate: "2019-07-18", revenueUsd: 7_750, grossMargin: 0.430, operatingMargin: 0.317, guidanceRevenueNextQuarterUsd: 9_150, guidanceGrossMarginNextQuarter: 0.470, guidanceOperatingMarginNextQuarter: 0.360, hpcMix: 0.31, smartphoneMix: 0.45, advancedNodeMix: 0.39, capexGuidanceUsd: 15_000 }),
  q({ fiscalYear: 2019, fiscalQuarter: "Q3", eventDate: "2019-10-17", revenueUsd: 9_400, grossMargin: 0.476, operatingMargin: 0.368, guidanceRevenueNextQuarterUsd: 10_250, guidanceGrossMarginNextQuarter: 0.490, guidanceOperatingMarginNextQuarter: 0.380, hpcMix: 0.32, smartphoneMix: 0.46, advancedNodeMix: 0.41, capexGuidanceUsd: 15_000 }),
  q({ fiscalYear: 2019, fiscalQuarter: "Q4", eventDate: "2020-01-16", revenueUsd: 10_390, grossMargin: 0.502, operatingMargin: 0.392, guidanceRevenueNextQuarterUsd: 10_250, guidanceGrossMarginNextQuarter: 0.495, guidanceOperatingMarginNextQuarter: 0.385, hpcMix: 0.34, smartphoneMix: 0.45, advancedNodeMix: 0.43, capexGuidanceUsd: 15_000 }),
  q({ fiscalYear: 2020, fiscalQuarter: "Q1", eventDate: "2020-04-16", revenueUsd: 10_310, grossMargin: 0.518, operatingMargin: 0.414, guidanceRevenueNextQuarterUsd: 10_250, guidanceGrossMarginNextQuarter: 0.510, guidanceOperatingMarginNextQuarter: 0.400, hpcMix: 0.35, smartphoneMix: 0.45, advancedNodeMix: 0.45, capexGuidanceUsd: 17_000 }),
  q({ fiscalYear: 2020, fiscalQuarter: "Q2", eventDate: "2020-07-16", revenueUsd: 10_380, grossMargin: 0.530, operatingMargin: 0.422, guidanceRevenueNextQuarterUsd: 11_350, guidanceGrossMarginNextQuarter: 0.510, guidanceOperatingMarginNextQuarter: 0.400, hpcMix: 0.36, smartphoneMix: 0.43, advancedNodeMix: 0.47, capexGuidanceUsd: 17_000 }),
  q({ fiscalYear: 2020, fiscalQuarter: "Q3", eventDate: "2020-10-15", revenueUsd: 12_140, grossMargin: 0.534, operatingMargin: 0.421, guidanceRevenueNextQuarterUsd: 12_550, guidanceGrossMarginNextQuarter: 0.525, guidanceOperatingMarginNextQuarter: 0.415, hpcMix: 0.38, smartphoneMix: 0.43, advancedNodeMix: 0.49, capexGuidanceUsd: 17_000 }),
  q({ fiscalYear: 2020, fiscalQuarter: "Q4", eventDate: "2021-01-14", revenueUsd: 12_680, grossMargin: 0.540, operatingMargin: 0.435, guidanceRevenueNextQuarterUsd: 12_850, guidanceGrossMarginNextQuarter: 0.515, guidanceOperatingMarginNextQuarter: 0.405, hpcMix: 0.39, smartphoneMix: 0.42, advancedNodeMix: 0.50, capexGuidanceUsd: 17_000 }),
  q({ fiscalYear: 2021, fiscalQuarter: "Q1", eventDate: "2021-04-15", revenueUsd: 12_920, grossMargin: 0.524, operatingMargin: 0.415, guidanceRevenueNextQuarterUsd: 13_050, guidanceGrossMarginNextQuarter: 0.505, guidanceOperatingMarginNextQuarter: 0.395, hpcMix: 0.38, smartphoneMix: 0.44, advancedNodeMix: 0.50, capexGuidanceUsd: 30_000 }),
  q({ fiscalYear: 2021, fiscalQuarter: "Q2", eventDate: "2021-07-15", revenueUsd: 13_290, grossMargin: 0.500, operatingMargin: 0.391, guidanceRevenueNextQuarterUsd: 14_750, guidanceGrossMarginNextQuarter: 0.505, guidanceOperatingMarginNextQuarter: 0.395, hpcMix: 0.39, smartphoneMix: 0.44, advancedNodeMix: 0.51, capexGuidanceUsd: 30_000 }),
  q({ fiscalYear: 2021, fiscalQuarter: "Q3", eventDate: "2021-10-14", revenueUsd: 14_880, grossMargin: 0.513, operatingMargin: 0.412, guidanceRevenueNextQuarterUsd: 15_550, guidanceGrossMarginNextQuarter: 0.520, guidanceOperatingMarginNextQuarter: 0.400, hpcMix: 0.41, smartphoneMix: 0.44, advancedNodeMix: 0.52, capexGuidanceUsd: 30_000 }),
  q({ fiscalYear: 2021, fiscalQuarter: "Q4", eventDate: "2022-01-13", revenueUsd: 15_740, grossMargin: 0.527, operatingMargin: 0.417, guidanceRevenueNextQuarterUsd: 16_900, guidanceGrossMarginNextQuarter: 0.540, guidanceOperatingMarginNextQuarter: 0.430, hpcMix: 0.42, smartphoneMix: 0.44, advancedNodeMix: 0.53, capexGuidanceUsd: 30_000 }),
  q({ fiscalYear: 2022, fiscalQuarter: "Q1", eventDate: "2022-04-14", revenueUsd: 17_570, grossMargin: 0.556, operatingMargin: 0.456, guidanceRevenueNextQuarterUsd: 17_900, guidanceGrossMarginNextQuarter: 0.570, guidanceOperatingMarginNextQuarter: 0.460, hpcMix: 0.42, smartphoneMix: 0.40, advancedNodeMix: 0.51, capexGuidanceUsd: 36_000 }),
  q({ fiscalYear: 2022, fiscalQuarter: "Q2", eventDate: "2022-07-14", revenueUsd: 18_160, grossMargin: 0.591, operatingMargin: 0.491, guidanceRevenueNextQuarterUsd: 20_200, guidanceGrossMarginNextQuarter: 0.585, guidanceOperatingMarginNextQuarter: 0.480, hpcMix: 0.43, smartphoneMix: 0.39, advancedNodeMix: 0.52, capexGuidanceUsd: 36_000 }),
  q({ fiscalYear: 2022, fiscalQuarter: "Q3", eventDate: "2022-10-13", revenueUsd: 20_230, grossMargin: 0.604, operatingMargin: 0.506, guidanceRevenueNextQuarterUsd: 20_300, guidanceGrossMarginNextQuarter: 0.605, guidanceOperatingMarginNextQuarter: 0.500, hpcMix: 0.44, smartphoneMix: 0.38, advancedNodeMix: 0.53, capexGuidanceUsd: 36_000 }),
  q({ fiscalYear: 2022, fiscalQuarter: "Q4", eventDate: "2023-01-12", revenueUsd: 19_930, grossMargin: 0.622, operatingMargin: 0.520, guidanceRevenueNextQuarterUsd: 17_100, guidanceGrossMarginNextQuarter: 0.545, guidanceOperatingMarginNextQuarter: 0.425, hpcMix: 0.45, smartphoneMix: 0.38, advancedNodeMix: 0.54, capexGuidanceUsd: 36_000 }),
  q({ fiscalYear: 2023, fiscalQuarter: "Q1", eventDate: "2023-04-20", revenueUsd: 16_720, grossMargin: 0.563, operatingMargin: 0.455, guidanceRevenueNextQuarterUsd: 15_600, guidanceGrossMarginNextQuarter: 0.530, guidanceOperatingMarginNextQuarter: 0.405, hpcMix: 0.42, smartphoneMix: 0.41, advancedNodeMix: 0.53, capexGuidanceUsd: 32_000 }),
  q({ fiscalYear: 2023, fiscalQuarter: "Q2", eventDate: "2023-07-20", revenueUsd: 15_680, grossMargin: 0.541, operatingMargin: 0.420, guidanceRevenueNextQuarterUsd: 17_100, guidanceGrossMarginNextQuarter: 0.525, guidanceOperatingMarginNextQuarter: 0.390, hpcMix: 0.42, smartphoneMix: 0.42, advancedNodeMix: 0.55, capexGuidanceUsd: 32_000 }),
  q({ fiscalYear: 2023, fiscalQuarter: "Q3", eventDate: "2023-10-19", revenueUsd: 17_280, grossMargin: 0.543, operatingMargin: 0.417, guidanceRevenueNextQuarterUsd: 19_200, guidanceGrossMarginNextQuarter: 0.525, guidanceOperatingMarginNextQuarter: 0.405, hpcMix: 0.44, smartphoneMix: 0.42, advancedNodeMix: 0.57, capexGuidanceUsd: 32_000 }),
  q({ fiscalYear: 2023, fiscalQuarter: "Q4", eventDate: "2024-01-18", revenueUsd: 19_620, grossMargin: 0.530, operatingMargin: 0.416, guidanceRevenueNextQuarterUsd: 18_400, guidanceGrossMarginNextQuarter: 0.530, guidanceOperatingMarginNextQuarter: 0.410, hpcMix: 0.45, smartphoneMix: 0.43, advancedNodeMix: 0.59, capexGuidanceUsd: 32_000 }),
  q({ fiscalYear: 2024, fiscalQuarter: "Q1", eventDate: "2024-04-18", revenueUsd: 18_870, grossMargin: 0.531, operatingMargin: 0.420, guidanceRevenueNextQuarterUsd: 20_000, guidanceGrossMarginNextQuarter: 0.520, guidanceOperatingMarginNextQuarter: 0.410, hpcMix: 0.46, smartphoneMix: 0.38, advancedNodeMix: 0.65, capexGuidanceUsd: 30_000 }),
  q({ fiscalYear: 2024, fiscalQuarter: "Q2", eventDate: "2024-07-18", revenueUsd: 20_820, grossMargin: 0.532, operatingMargin: 0.425, guidanceRevenueNextQuarterUsd: 22_800, guidanceGrossMarginNextQuarter: 0.545, guidanceOperatingMarginNextQuarter: 0.435, hpcMix: 0.52, smartphoneMix: 0.33, advancedNodeMix: 0.67, capexGuidanceUsd: 30_000 }),
  q({ fiscalYear: 2024, fiscalQuarter: "Q3", eventDate: "2024-10-17", revenueUsd: 23_500, grossMargin: 0.578, operatingMargin: 0.475, guidanceRevenueNextQuarterUsd: 26_500, guidanceGrossMarginNextQuarter: 0.580, guidanceOperatingMarginNextQuarter: 0.475, hpcMix: 0.51, smartphoneMix: 0.34, advancedNodeMix: 0.69, capexGuidanceUsd: 30_000 }),
  q({ fiscalYear: 2024, fiscalQuarter: "Q4", eventDate: "2025-01-16", revenueUsd: 26_880, grossMargin: 0.590, operatingMargin: 0.490, guidanceRevenueNextQuarterUsd: 25_400, guidanceGrossMarginNextQuarter: 0.580, guidanceOperatingMarginNextQuarter: 0.475, hpcMix: 0.53, smartphoneMix: 0.35, advancedNodeMix: 0.74, capexGuidanceUsd: 39_000 }),
  q({ fiscalYear: 2025, fiscalQuarter: "Q1", eventDate: "2025-04-17", revenueUsd: 25_530, grossMargin: 0.588, operatingMargin: 0.485, guidanceRevenueNextQuarterUsd: 28_800, guidanceGrossMarginNextQuarter: 0.580, guidanceOperatingMarginNextQuarter: 0.480, hpcMix: 0.59, smartphoneMix: 0.28, advancedNodeMix: 0.73, capexGuidanceUsd: 39_000 }),
  q({ fiscalYear: 2025, fiscalQuarter: "Q2", eventDate: "2025-07-17", revenueUsd: 30_070, grossMargin: 0.586, operatingMargin: 0.496, guidanceRevenueNextQuarterUsd: 32_400, guidanceGrossMarginNextQuarter: 0.565, guidanceOperatingMarginNextQuarter: 0.465, hpcMix: 0.60, smartphoneMix: 0.27, advancedNodeMix: 0.74, capexGuidanceUsd: 40_000 }),
  q({ fiscalYear: 2025, fiscalQuarter: "Q3", eventDate: "2025-10-16", revenueUsd: 33_100, grossMargin: 0.595, operatingMargin: 0.506, guidanceRevenueNextQuarterUsd: 32_800, guidanceGrossMarginNextQuarter: 0.600, guidanceOperatingMarginNextQuarter: 0.500, hpcMix: 0.57, smartphoneMix: 0.30, advancedNodeMix: 0.74, capexGuidanceUsd: 42_000 }),
  q({ fiscalYear: 2025, fiscalQuarter: "Q4", eventDate: "2026-01-15", revenueUsd: 33_730, grossMargin: 0.623, operatingMargin: 0.540, guidanceRevenueNextQuarterUsd: 35_200, guidanceGrossMarginNextQuarter: 0.640, guidanceOperatingMarginNextQuarter: 0.550, hpcMix: 0.58, smartphoneMix: 0.29, advancedNodeMix: 0.74, capexGuidanceUsd: 54_000 }),
  q({ fiscalYear: 2026, fiscalQuarter: "Q1", eventDate: "2026-04-16", revenueUsd: 35_900, grossMargin: 0.662, operatingMargin: 0.581, netIncomeUsd: 18_122, netMargin: 0.505, dilutedEpsPerAdr: 3.49, guidanceRevenueNextQuarterUsd: 39_600, guidanceGrossMarginNextQuarter: 0.665, guidanceOperatingMarginNextQuarter: 0.575, hpcMix: 0.61, smartphoneMix: 0.26, advancedNodeMix: 0.68, capexGuidanceUsd: 54_000 }),
];

function revenueGrowthFor(row) {
  const prior = quarterlyRows.find(
    (candidate) => candidate.fiscalYear === row.fiscalYear - 1 && candidate.fiscalQuarter === row.fiscalQuarter,
  );
  return prior?.revenueUsd ? row.revenueUsd / prior.revenueUsd - 1 : null;
}

const seedPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    conn.executescript(payload["schema"])
    for table in [
      "valuation_runs", "backtest_runs", "validation_warnings", "assumption_sets",
      "model_versions", "market_snapshots", "platform_mix", "technology_mix",
      "financial_periods", "source_documents", "reporting_events"
    ]:
        conn.execute(f"DELETE FROM {table}")
    def insert(table, row):
        keys = list(row.keys())
        conn.execute(
            f"INSERT INTO {table} ({','.join(keys)}) VALUES ({','.join(['?'] * len(keys))})",
            [row.get(key) for key in keys],
        )
    for table, rows in payload["tables"].items():
        for row in rows:
            insert(table, row)
    conn.commit()
    counts = {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in [
      "reporting_events", "source_documents", "financial_periods", "technology_mix",
      "platform_mix", "model_versions", "assumption_sets", "market_snapshots",
      "validation_warnings", "daily_price_bars"
    ]}
    print(json.dumps({"dbPath": payload["dbPath"], "counts": counts}, indent=2))
finally:
    conn.close()
`;

function raw(row, extra = {}) {
  return JSON.stringify({
    ...extra,
    sourceUrl: row.sourceUrl,
    source: "TSMC Investor Relations quarterly results page",
    officialActualFields: ["revenueUsd", "grossMargin", "operatingMargin"],
    managementGuidanceFields: [
      "guidanceRevenueNextQuarterUsd",
      "guidanceGrossMarginNextQuarter",
      "guidanceOperatingMarginNextQuarter",
    ],
    proxyFields: ["hpcMix", "smartphoneMix", "advancedNodeMix", "capexGuidanceUsd"],
    sourceDiscipline:
      "Quarterly revenue, gross margin, operating margin and next-quarter guidance are seeded from official TSMC quarterly results pages. Platform mix, advanced-node mix and capex history are proxy/research-only placeholders until management report tables are imported.",
    mixSourceType: row.mixSourceType,
    capexSourceType: row.capexSourceType,
  });
}

function buildTechnologyMix(row) {
  const mixSourceType = row.mixSourceType ?? "market_data_proxy";
  return [
    ["Advanced nodes", row.advancedNodeMix, mixSourceType],
    ["Other", Math.max(0, 1 - row.advancedNodeMix), "research_only"],
  ];
}

function buildPlatformMix(row) {
  const mixSourceType = row.mixSourceType ?? "market_data_proxy";
  return [
    ["HPC", row.hpcMix, mixSourceType],
    ["Smartphone", row.smartphoneMix, mixSourceType],
    ["IoT", 0.05, "research_only"],
    ["Automotive", 0.05, "research_only"],
    ["DCE / Other", Math.max(0, 1 - row.hpcMix - row.smartphoneMix - 0.10), "research_only"],
  ];
}

export async function seedTsmBackendDb() {
  mkdirSync(path.dirname(TSM_BACKEND_DB_PATH), { recursive: true });
  const createdAt = new Date().toISOString();
  const reportingEvents = quarterlyRows.map((row) => ({
    id: row.id,
    ticker: TICKER,
    eventDate: row.eventDate,
    fiscalPeriod: row.fiscalPeriod,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    eventType: row.eventType,
    label: `TSMC ${row.fiscalPeriod} results`,
    title: `TSMC ${row.fiscalPeriod} earnings conference`,
    sourceType: "official_actual",
    sourceUrl: row.sourceUrl,
    rawJson: raw(row),
  }));
  const sourceDocuments = quarterlyRows.map((row) => ({
    id: `${row.id}-quarterly-results`,
    ticker: TICKER,
    sourceType: "official_actual",
    sourceUrl: row.sourceUrl,
    title: `TSMC ${row.fiscalPeriod} quarterly results page`,
    retrievedAt: createdAt,
    metadataJson: raw(row),
  })).concat([
    {
      id: "tsm-2025-annual-report",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceUrl: ANNUAL_2025,
      title: "TSMC 2025 annual report",
      retrievedAt: createdAt,
      metadataJson: JSON.stringify({ sourceUrl: ANNUAL_2025, note: "Used for customer/product/capacity and FY2025 annual context." }),
    },
  ]);
  const financialPeriods = quarterlyRows.map((row) => ({
    id: `${row.id}-financials`,
    ticker: TICKER,
    periodId: row.id,
    eventId: row.id,
    asOfDate: row.eventDate,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    periodType: "quarter",
    sourceType: "official_actual",
    sourceUrl: row.sourceUrl,
    revenueUsd: row.revenueUsd,
    revenueGrowth: row.revenueGrowth ?? revenueGrowthFor(row),
    grossMargin: row.grossMargin,
    operatingMargin: row.operatingMargin,
    netIncomeUsd: row.netIncomeUsd ?? null,
    netMargin: row.netMargin ?? null,
    dilutedEpsPerAdr: row.dilutedEpsPerAdr ?? null,
    guidanceRevenueNextQuarterUsd: row.guidanceRevenueNextQuarterUsd,
    guidanceGrossMarginNextQuarter: row.guidanceGrossMarginNextQuarter,
    guidanceOperatingMarginNextQuarter: row.guidanceOperatingMarginNextQuarter,
    capexGuidanceUsd: row.capexGuidanceUsd,
    hpcMix: row.hpcMix,
    advancedNodeMix: row.advancedNodeMix,
    smartphoneMix: row.smartphoneMix,
    rawJson: raw(row),
  }));
  const technologyMix = quarterlyRows.flatMap((row) =>
    buildTechnologyMix(row).map(([node, revenueMix, sourceType]) => ({
      id: `${row.id}-tech-${String(node).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      ticker: TICKER,
      periodId: row.id,
      asOfDate: row.eventDate,
      node,
      revenueMix,
      sourceType,
      notes: sourceType === "official_actual" ? "Official TSMC technology revenue mix." : "Historical proxy pending full management report import.",
      rawJson: raw(row),
    })),
  );
  const platformMix = quarterlyRows.flatMap((row) =>
    buildPlatformMix(row).map(([platform, revenueMix, sourceType]) => ({
      id: `${row.id}-platform-${String(platform).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      ticker: TICKER,
      periodId: row.id,
      asOfDate: row.eventDate,
      platform,
      revenueMix,
      sourceType,
      notes: sourceType === "official_actual" ? "Official TSMC platform revenue mix." : "Research/proxy mix until full management report import.",
      rawJson: raw(row),
    })),
  );
  const marketSnapshots = [
    {
      id: "tsm-market-latest-proxy",
      ticker: TICKER,
      asOfDate: quarterlyRows.at(-1).eventDate,
      priceDate: null,
      currentPrice: null,
      sharesOutstanding: 5_186,
      netCash: 55_000,
      marketCap: null,
      source: "daily_price_bars",
      sourceType: "market_data",
      rawJson: JSON.stringify({ note: "Use daily_price_bars nearest prior trading day for historical as-of price; shares are ADR-equivalent millions." }),
    },
  ];
  const modelVersions = [
    {
      id: TSM_BACKEND_MODEL_VERSION.version,
      ticker: TICKER,
      version: TSM_BACKEND_MODEL_VERSION.version,
      name: TSM_BACKEND_MODEL_VERSION.name,
      description: TSM_BACKEND_MODEL_VERSION.description,
      valuationMethodsJson: JSON.stringify(TSM_BACKEND_MODEL_VERSION.valuationMethods),
      assumptionSchemaJson: JSON.stringify(TSM_BACKEND_MODEL_VERSION.assumptionSchema),
      createdAt,
    },
  ];
  const assumptionSets = ["Bear", "Base", "Bull"].map((scenario) => ({
    id: `tsm-${scenario.toLowerCase()}-assumptions-v1`,
    ticker: TICKER,
    scenario,
    modelVersion: TSM_BACKEND_MODEL_VERSION.version,
    asOfDate: quarterlyRows[0].eventDate,
    assumptionsJson: JSON.stringify({ scenario, source: "tsm_backend_adapter_defaults" }),
    sourceType: "forecast_assumption",
    notes: "Scenario presets are interpreted by modules/tsm/valuation/adapter.mjs.",
  }));
  const validationWarnings = [
    {
      id: "tsm-proxy-mix-history",
      ticker: TICKER,
      severity: "medium",
      title: "Platform and node mix history needs official backfill",
      detail: "Official quarterly revenue and margins cover 2018Q1-2026Q1. Platform/node mix and capex history are proxy/research-only until management reports are imported.",
      createdAt,
    },
  ];
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: TSM_BACKEND_DB_PATH,
      schema: readFileSync(TSM_BACKEND_SCHEMA_PATH, "utf8"),
      tables: {
        reporting_events: reportingEvents,
        source_documents: sourceDocuments,
        financial_periods: financialPeriods,
        technology_mix: technologyMix,
        platform_mix: platformMix,
        market_snapshots: marketSnapshots,
        model_versions: modelVersions,
        assumption_sets: assumptionSets,
        validation_warnings: validationWarnings,
      },
    }),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
