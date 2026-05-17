import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { META_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "META";
const CREATED_AT = "2026-05-13T00:00:00.000Z";
const MARKET_SNAPSHOT_PATH = path.resolve("data/local/meta/market/market_snapshot.json");
const OFFICIAL_DATASET_PATH = path.resolve("data/local/meta/official/meta_official_dataset.json");
const TRANSCRIPT_METADATA_PATH = path.resolve("data/local/meta/transcripts/transcript_metadata.json");
const SEC_INVENTORY_PATH = path.resolve("data/local/meta/sec/sec_filing_inventory.json");

const REPORTING_EVENTS = [
  ["meta-q1-fy2018", "2018-04-25", "Q1", 2018],
  ["meta-q2-fy2018", "2018-07-25", "Q2", 2018],
  ["meta-q3-fy2018", "2018-10-30", "Q3", 2018],
  ["meta-q4-fy2018", "2019-01-30", "Q4", 2018],
  ["meta-q1-fy2019", "2019-04-24", "Q1", 2019],
  ["meta-q2-fy2019", "2019-07-24", "Q2", 2019],
  ["meta-q3-fy2019", "2019-10-30", "Q3", 2019],
  ["meta-q4-fy2019", "2020-01-29", "Q4", 2019],
  ["meta-q1-fy2020", "2020-04-29", "Q1", 2020],
  ["meta-q2-fy2020", "2020-07-30", "Q2", 2020],
  ["meta-q3-fy2020", "2020-10-29", "Q3", 2020],
  ["meta-q4-fy2020", "2021-01-27", "Q4", 2020],
  ["meta-q1-fy2021", "2021-04-28", "Q1", 2021],
  ["meta-q2-fy2021", "2021-07-28", "Q2", 2021],
  ["meta-q3-fy2021", "2021-10-25", "Q3", 2021],
  ["meta-q4-fy2021", "2022-02-02", "Q4", 2021],
  ["meta-q1-fy2022", "2022-04-27", "Q1", 2022],
  ["meta-q2-fy2022", "2022-07-27", "Q2", 2022],
  ["meta-q3-fy2022", "2022-10-26", "Q3", 2022],
  ["meta-q4-fy2022", "2023-02-01", "Q4", 2022],
  ["meta-q1-fy2023", "2023-04-26", "Q1", 2023],
  ["meta-q2-fy2023", "2023-07-26", "Q2", 2023],
  ["meta-q3-fy2023", "2023-10-25", "Q3", 2023],
  ["meta-q4-fy2023", "2024-02-01", "Q4", 2023],
  ["meta-q1-fy2024", "2024-04-24", "Q1", 2024],
  ["meta-q2-fy2024", "2024-07-31", "Q2", 2024],
  ["meta-q3-fy2024", "2024-10-30", "Q3", 2024],
  ["meta-q4-fy2024", "2025-01-29", "Q4", 2024],
  ["meta-q1-fy2025", "2025-04-30", "Q1", 2025],
  ["meta-q2-fy2025", "2025-07-30", "Q2", 2025],
  ["meta-q3-fy2025", "2025-10-29", "Q3", 2025],
  ["meta-q4-fy2025", "2026-01-28", "Q4", 2025],
  ["meta-q1-fy2026", "2026-04-29", "Q1", 2026],
];

const ANNUAL_BRIDGE = {
  2018: { revenue: 55.8, margin: 0.45, capexIntensity: 0.25, fcfMargin: 0.28, rlRevenue: 0.5, rlLoss: 2.3, netCash: 41, shares: 2.90, dap: 2.30, adImpressionsGrowth: 0.22, averagePricePerAdGrowth: 0.03, headcount: 35587 },
  2019: { revenue: 70.7, margin: 0.34, capexIntensity: 0.22, fcfMargin: 0.30, rlRevenue: 0.7, rlLoss: 4.5, netCash: 55, shares: 2.88, dap: 2.50, adImpressionsGrowth: 0.33, averagePricePerAdGrowth: -0.05, headcount: 44942 },
  2020: { revenue: 86.0, margin: 0.38, capexIntensity: 0.18, fcfMargin: 0.27, rlRevenue: 1.1, rlLoss: 6.6, netCash: 61, shares: 2.85, dap: 2.70, adImpressionsGrowth: 0.34, averagePricePerAdGrowth: -0.05, headcount: 58604 },
  2021: { revenue: 117.9, margin: 0.40, capexIntensity: 0.16, fcfMargin: 0.33, rlRevenue: 2.3, rlLoss: 10.2, netCash: 48, shares: 2.81, dap: 2.82, adImpressionsGrowth: 0.10, averagePricePerAdGrowth: 0.24, headcount: 71970 },
  2022: { revenue: 116.6, margin: 0.25, capexIntensity: 0.27, fcfMargin: 0.16, rlRevenue: 2.2, rlLoss: 13.7, netCash: 30, shares: 2.70, dap: 2.96, adImpressionsGrowth: 0.18, averagePricePerAdGrowth: -0.16, headcount: 86482 },
  2023: { revenue: 134.9, margin: 0.35, capexIntensity: 0.21, fcfMargin: 0.32, rlRevenue: 1.9, rlLoss: 16.1, netCash: 47, shares: 2.63, dap: 3.19, adImpressionsGrowth: 0.28, averagePricePerAdGrowth: -0.09, headcount: 67317 },
  2024: { revenue: 164.5, margin: 0.42, capexIntensity: 0.24, fcfMargin: 0.32, rlRevenue: 2.1, rlLoss: 17.7, netCash: 50, shares: 2.59, dap: 3.35, adImpressionsGrowth: 0.11, averagePricePerAdGrowth: 0.10, headcount: 74067 },
  2025: { revenue: 200.966, margin: 83.276 / 200.966, capexIntensity: 72.215 / 200.966, fcfMargin: 43.585 / 200.966, rlRevenue: 2.207, rlLoss: 19.193, netCash: 22.85, shares: 2.574, dap: 3.58, adImpressionsGrowth: 0.12, averagePricePerAdGrowth: 0.09, headcount: 78865 },
  2026: { revenue: 56.311 * 4, margin: 22.872 / 56.311, capexIntensity: 19.84 / 56.311, fcfMargin: 12.386 / 56.311, rlRevenue: 0.402 * 4, rlLoss: 4.028 * 4, netCash: 22.432, shares: 2.564, dap: 3.56, adImpressionsGrowth: 0.19, averagePricePerAdGrowth: 0.12, headcount: 80638 },
};

const QUARTER_WEIGHTS = { Q1: 0.22, Q2: 0.24, Q3: 0.25, Q4: 0.29 };
const MARKET_PRICE_ANCHORS = {
  2018: 175,
  2019: 185,
  2020: 250,
  2021: 335,
  2022: 160,
  2023: 285,
  2024: 485,
  2025: 620,
  2026: 610,
};

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function round(value, digits = 3) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function eventType(quarter) {
  return `${quarter.toLowerCase()}_results`;
}

function sourceUrlFor(fiscalYear, quarter) {
  if (fiscalYear >= 2024) {
    return `https://investor.atmeta.com/financials/default.aspx`;
  }
  return "https://www.sec.gov/cgi-bin/browse-edgar?CIK=1326801&owner=exclude&action=getcompany";
}

function lineage(sourceType, sourceName, period, asOfDate, confidence = "medium", treatment = "forecast_anchor") {
  return {
    sourceType,
    sourceName,
    period,
    asOfDate,
    retrievedAt: CREATED_AT,
    confidence,
    valuationTreatment: treatment,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadStaticMetaModules() {
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    const dataModule = await server.ssrLoadModule("/src/stocks/meta/data.ts");
    const assumptionModule = await server.ssrLoadModule("/src/stocks/meta/assumptions.ts");
    return {
      dataset: dataModule.metaDataset ?? dataModule.metaData,
      scenarioPresets: assumptionModule.metaScenarioPresets,
    };
  } finally {
    await server.close();
  }
}

function buildFinancialForEvent(event, staticDataset) {
  const [, eventDate, quarter, fiscalYear] = event;
  if (fiscalYear === 2026 && quarter === "Q1") {
    const actual = staticDataset.periods.find((row) => row.id === "q1_2026");
    const foa = staticDataset.segments.find((row) => row.periodId === "q1_2026" && row.segment === "Family of Apps");
    const rl = staticDataset.segments.find((row) => row.periodId === "q1_2026" && row.segment === "Reality Labs");
    return {
      sourceType: "official_actual",
      sourceDocumentId: "meta-q1-2026-pr",
      periodId: "q1_2026",
      label: "Q1 2026",
      fiscalYear,
      fiscalQuarter: quarter,
      asOfDate: eventDate,
      revenue: actual.revenue,
      advertisingRevenue: foa.revenue * 0.99,
      familyOfAppsRevenue: foa.revenue,
      realityLabsRevenue: rl.revenue,
      familyOfAppsOperatingIncome: foa.operatingIncome,
      realityLabsOperatingLoss: Math.abs(rl.operatingIncome),
      operatingIncome: actual.operatingIncome,
      operatingMargin: actual.operatingMargin,
      netIncome: actual.netIncome,
      normalizedNetIncome: actual.normalizedNetIncome,
      dilutedEps: actual.dilutedEps,
      normalizedDilutedEps: actual.normalizedDilutedEps,
      capex: actual.capitalExpendituresInclFinanceLeases,
      depreciationAmortization: actual.depreciationAndAmortization,
      operatingCashFlow: actual.operatingCashFlow,
      freeCashFlow: actual.freeCashFlow,
      shareBasedCompensation: actual.shareBasedCompensation,
      dilutedShares: actual.dilutedShares,
      buybacks: actual.shareRepurchases,
      dividendsAndEquivalents: actual.dividendsAndEquivalents,
      cashAndMarketableSecurities: actual.cashAndMarketableSecurities,
      debt: actual.longTermDebt,
      netCash: actual.netCash,
      familyDap: actual.familyDailyActivePeople,
      adImpressionsGrowth: actual.adImpressionsGrowth,
      averagePricePerAdGrowth: actual.averagePricePerAdGrowth,
      headcount: actual.headcount,
      efficiencyCommentary: "Official Q1 2026 actual from the existing META module.",
      aiCommentary: "AI recommendation, ranking, and ad automation commentary is monitored through transcript rows and assumptions, not direct actuals.",
      regulatoryCommentary: "EU regulatory risk is monitored separately and not embedded as an official actual.",
      rawSource: actual,
    };
  }

  const bridge = ANNUAL_BRIDGE[fiscalYear];
  const weight = QUARTER_WEIGHTS[quarter];
  const quarterIndex = Number(quarter.slice(1));
  const seasonalityMultiplier = 0.94 + quarterIndex * 0.035;
  const revenue = bridge.revenue * weight;
  const rlRevenue = bridge.rlRevenue * weight;
  const rlLoss = bridge.rlLoss * weight;
  const familyOfAppsRevenue = revenue - rlRevenue;
  const operatingIncome = revenue * bridge.margin * seasonalityMultiplier;
  const familyOfAppsOperatingIncome = operatingIncome + rlLoss;
  const capex = revenue * bridge.capexIntensity * (0.92 + quarterIndex * 0.04);
  const freeCashFlow = revenue * bridge.fcfMargin * (0.9 + quarterIndex * 0.05);
  const operatingCashFlow = freeCashFlow + capex;
  const depreciation = Math.max(revenue * (0.075 + Math.min(bridge.capexIntensity, 0.36) * 0.18), 0.5);
  const normalizedNetIncome = operatingIncome * 0.84;
  const dilutedShares = bridge.shares - (quarterIndex - 1) * 0.008;
  return {
    sourceType: "research_only",
    sourceDocumentId: `meta-research-proxy-fy${fiscalYear}`,
    periodId: `q${quarterIndex}_fy${fiscalYear}`,
    label: `${quarter} ${fiscalYear}`,
    fiscalYear,
    fiscalQuarter: quarter,
    asOfDate: eventDate,
    revenue,
    advertisingRevenue: familyOfAppsRevenue * 0.985,
    familyOfAppsRevenue,
    realityLabsRevenue: rlRevenue,
    familyOfAppsOperatingIncome,
    realityLabsOperatingLoss: rlLoss,
    operatingIncome,
    operatingMargin: operatingIncome / revenue,
    netIncome: normalizedNetIncome,
    normalizedNetIncome,
    dilutedEps: normalizedNetIncome / dilutedShares,
    normalizedDilutedEps: normalizedNetIncome / dilutedShares,
    capex,
    depreciationAmortization: depreciation,
    operatingCashFlow,
    freeCashFlow,
    shareBasedCompensation: revenue * (fiscalYear < 2023 ? 0.08 : 0.11),
    dilutedShares,
    buybacks: Math.max(0, revenue * (fiscalYear < 2022 ? 0.08 : 0.13)),
    dividendsAndEquivalents: fiscalYear >= 2024 ? 0.5 * weight * 4 : 0,
    cashAndMarketableSecurities: bridge.netCash + 8,
    debt: 8,
    netCash: bridge.netCash,
    familyDap: bridge.dap,
    adImpressionsGrowth: bridge.adImpressionsGrowth,
    averagePricePerAdGrowth: bridge.averagePricePerAdGrowth,
    headcount: bridge.headcount,
    efficiencyCommentary: fiscalYear === 2023 ? "Research-only proxy reflects the efficiency reset regime; not an official actual." : "Research-only historical proxy pending SEC Companyfacts import.",
    aiCommentary: fiscalYear < 2023 ? "No post-2023 AI monetization uplift is allowed in this as-of proxy." : "AI commentary is treated as forecast context and not as an official actual.",
    regulatoryCommentary: fiscalYear >= 2024 ? "EU privacy and DMA/DSA risk monitored as risk framework input." : "Regulatory/platform risk monitored qualitatively.",
    rawSource: { proxy: true, annualBridge: bridge, quarterWeight: weight },
  };
}

function scenarioMultiplier(scenario, key) {
  if (scenario === "Bear") {
    if (["revenueGrowth2026", "revenueCagr2027To2030", "adImpressionCagr", "pricePerAdCagr", "foaOperatingMargin", "aiRevenueUpliftPct", "aiIncrementalMargin", "targetPe", "targetEvEbit", "foaEbitMultiple", "exitPe", "realityLabsOptionValue", "buybackYield", "buybackSpend2026"].includes(key)) return 0.78;
    if (["wacc", "targetFcfYield", "regulatoryRevenueHaircut", "realityLabsAnnualLoss", "capex2026", "aiCapexShare"].includes(key)) return 1.12;
  }
  if (scenario === "Bull") {
    if (["revenueGrowth2026", "revenueCagr2027To2030", "adImpressionCagr", "pricePerAdCagr", "foaOperatingMargin", "aiRevenueUpliftPct", "aiIncrementalMargin", "targetPe", "targetEvEbit", "foaEbitMultiple", "exitPe", "realityLabsOptionValue", "buybackYield", "buybackSpend2026"].includes(key)) return 1.18;
    if (["wacc", "targetFcfYield", "regulatoryRevenueHaircut", "realityLabsAnnualLoss", "capex2026", "aiCapexShare"].includes(key)) return 0.9;
  }
  return 1;
}

function buildAssumptionsForEvent(financial, event, scenario, currentPreset) {
  const [, eventDate, , fiscalYear] = event;
  const y = fiscalYear;
  const annual = ANNUAL_BRIDGE[fiscalYear];
  const regimeGrowth =
    y < 2020 ? 0.22 :
    y < 2022 ? 0.18 :
    y === 2022 ? 0.04 :
    y === 2023 ? 0.14 :
    y === 2024 ? 0.16 :
    y === 2025 ? 0.18 :
    0.21;
  const outerGrowth =
    y < 2022 ? 0.12 :
    y === 2022 ? 0.075 :
    y === 2023 ? 0.095 :
    y === 2024 ? 0.105 :
    0.11;
  const aiUplift = y < 2023 ? 0 : y === 2023 ? 0.015 : y === 2024 ? 0.035 : y === 2025 ? 0.055 : 0.06;
  const wacc = y <= 2021 ? 0.082 : y === 2022 ? 0.105 : y === 2023 ? 0.093 : y === 2024 ? 0.088 : 0.085;
  const targetPe = y <= 2021 ? 26 : y === 2022 ? 17 : y === 2023 ? 20 : y === 2024 ? 23 : 24;
  const capexNextYear = annual.revenue * annual.capexIntensity * (1 + regimeGrowth);
  const base = {
    ...currentPreset,
    currentPrice: MARKET_PRICE_ANCHORS[fiscalYear] ?? currentPreset.currentPrice,
    revenueGrowth2026: regimeGrowth,
    revenueCagr2027To2030: outerGrowth,
    adImpressionCagr: Math.max(0.025, financial.adImpressionsGrowth * 0.45),
    pricePerAdCagr: Math.max(-0.02, financial.averagePricePerAdGrowth * 0.35),
    foaOperatingMargin: Math.min(0.54, Math.max(0.32, financial.familyOfAppsOperatingIncome / Math.max(financial.familyOfAppsRevenue, 0.01))),
    realityLabsAnnualLoss: Math.max(financial.realityLabsOperatingLoss * 4, 1),
    realityLabsRevenueGrowth: y < 2023 ? 0.03 : 0.08,
    realityLabsLossCagr: y < 2023 ? 0.08 : 0.02,
    regulatoryRevenueHaircut: y < 2020 ? 0.01 : y < 2024 ? 0.015 : 0.02,
    taxRate: y === 2026 ? 0.15 : 0.16,
    capex2026: capexNextYear,
    terminalCapexIntensity: Math.min(Math.max(annual.capexIntensity * (y >= 2025 ? 0.62 : 0.85), 0.12), 0.30),
    maintenanceCapexIntensity: Math.min(Math.max(annual.capexIntensity * 0.55, 0.10), 0.19),
    aiCapexShare: y < 2023 ? 0.2 : y === 2023 ? 0.35 : y === 2024 ? 0.5 : 0.6,
    depreciationSalesIntensity: Math.min(Math.max(financial.depreciationAmortization / Math.max(financial.revenue, 0.01), 0.07), 0.14),
    workingCapitalDragPctRevenueGrowth: 0.015,
    netInterestIncome: y < 2024 ? -0.5 : 0,
    annualDilutionFromSbc: y < 2023 ? 0.012 : 0.01,
    sbcExpensePctRevenue: financial.shareBasedCompensation / Math.max(financial.revenue, 0.01),
    buybackYield: y < 2022 ? 0.012 : 0.016,
    buybackSpend2026: Math.max(financial.buybacks * 4, 2),
    wacc,
    terminalGrowth: y <= 2021 ? 0.032 : y === 2022 ? 0.025 : 0.03,
    targetFcfYield: y <= 2021 ? 0.04 : y === 2022 ? 0.065 : y === 2023 ? 0.052 : y === 2024 ? 0.047 : 0.045,
    targetPe,
    targetEvEbit: targetPe * 0.83,
    foaEbitMultiple: targetPe * 0.88,
    realityLabsOptionValue: y < 2021 ? 5 : y === 2022 ? 0 : y === 2023 ? 8 : y === 2024 ? 14 : y === 2025 ? 18 : 20,
    aiRevenueUpliftPct: aiUplift,
    aiIncrementalMargin: y < 2023 ? 0.45 : 0.55,
    exitPe: targetPe,
    dividendPerShare: y >= 2024 ? 2 : 0,
    netCash: financial.netCash,
    dilutedShares: financial.dilutedShares,
  };
  const adjusted = Object.fromEntries(Object.entries(base).map(([key, value]) => {
    if (typeof value !== "number") return [key, value];
    return [key, value * scenarioMultiplier(scenario, key)];
  }));
  adjusted.weightDcf = currentPreset.weightDcf;
  adjusted.weightFcfYield = currentPreset.weightFcfYield;
  adjusted.weightPe = currentPreset.weightPe;
  adjusted.weightEvEbit = currentPreset.weightEvEbit;
  adjusted.weightSotp = currentPreset.weightSotp;
  adjusted.netCash = financial.netCash;
  adjusted.dilutedShares = financial.dilutedShares;
  adjusted.currentPrice = base.currentPrice;
  adjusted.dividendPerShare = scenario === "Bear" ? base.dividendPerShare * 0.9 : scenario === "Bull" ? base.dividendPerShare * 1.05 : base.dividendPerShare;
  adjusted.aiRevenueUpliftPct = y < 2023 ? 0 : adjusted.aiRevenueUpliftPct;
  adjusted.realityLabsOptionValue = y < 2021 && scenario === "Bear" ? 0 : adjusted.realityLabsOptionValue;
  adjusted.__asOfDate = eventDate;
  adjusted.__sourceType = "forecast_assumption";
  adjusted.__knownRegime = y < 2023 ? "pre_genai_ad_platform" : y < 2025 ? "early_ai_recommendation_capex" : "ai_infra_roic_debate";
  return adjusted;
}

export async function buildMetaBackendSeedPayload() {
  const { dataset, scenarioPresets } = await loadStaticMetaModules();
  const marketSnapshot = parseJsonFile(MARKET_SNAPSHOT_PATH) ?? dataset.marketData;
  const officialDataset = parseJsonFile(OFFICIAL_DATASET_PATH);
  const transcriptMetadata = parseJsonFile(TRANSCRIPT_METADATA_PATH);
  const secInventory = parseJsonFile(SEC_INVENTORY_PATH);
  const sourceDocuments = [];

  for (const source of dataset.sources ?? []) {
    sourceDocuments.push({
      id: source.id,
      ticker: TICKER,
      sourceType: source.sourceStatus,
      sourceName: source.title,
      sourcePath: null,
      sourceUrl: source.url,
      filingType: source.lineage?.filingType ?? null,
      publishedDate: source.publishedDate ?? null,
      retrievedAt: source.accessedDate ?? CREATED_AT,
      confidence: source.lineage?.confidence ?? "medium",
      provenance: source.publisher,
      checksum: null,
      metadataJson: json({ notes: source.notes, lineage: source.lineage }),
    });
  }
  sourceDocuments.push({
    id: "meta-local-official-dataset",
    ticker: TICKER,
    sourceType: "official_actual",
    sourceName: "Local META official dataset cache",
    sourcePath: OFFICIAL_DATASET_PATH,
    sourceUrl: null,
    filingType: "earnings_release",
    publishedDate: officialDataset?.built_at?.slice(0, 10) ?? "2026-05-12",
    retrievedAt: officialDataset?.built_at ?? CREATED_AT,
    confidence: "high",
    provenance: "data/local/meta/official/meta_official_dataset.json",
    checksum: null,
    metadataJson: json({ source_layering: officialDataset?.source_layering ?? null }),
  });
  sourceDocuments.push({
    id: "meta-sec-filing-inventory",
    ticker: TICKER,
    sourceType: "official_actual",
    sourceName: "Local META SEC filing inventory",
    sourcePath: SEC_INVENTORY_PATH,
    sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?CIK=1326801&owner=exclude&action=getcompany",
    filingType: "10-Q",
    publishedDate: secInventory?.built_at?.slice(0, 10) ?? "2026-05-12",
    retrievedAt: secInventory?.built_at ?? CREATED_AT,
    confidence: "medium",
    provenance: "data/local/meta/sec/sec_filing_inventory.json",
    checksum: null,
    metadataJson: json(secInventory ?? {}),
  });
  for (const year of Object.keys(ANNUAL_BRIDGE)) {
    sourceDocuments.push({
      id: `meta-research-proxy-fy${year}`,
      ticker: TICKER,
      sourceType: "research_only",
      sourceName: `META FY${year} research-only historical scale proxy`,
      sourcePath: "modules/meta/ingestion/importLocalData.mjs",
      sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?CIK=1326801&owner=exclude&action=getcompany",
      filingType: "10-K",
      publishedDate: `${Number(year) + 1}-02-15`,
      retrievedAt: CREATED_AT,
      confidence: Number(year) >= 2025 ? "high" : "low",
      provenance: "Research-only proxy pending full SEC Companyfacts import; never classified as official_actual.",
      checksum: null,
      metadataJson: json({ annualBridge: ANNUAL_BRIDGE[year] }),
    });
  }

  const reportingEvents = REPORTING_EVENTS.map(([id, eventDate, quarter, fiscalYear]) => ({
    id,
    ticker: TICKER,
    eventDate,
    fiscalPeriod: `${quarter} FY${fiscalYear}`,
    fiscalQuarter: quarter,
    fiscalYear,
    eventType: eventType(quarter),
    label: `META ${quarter} ${fiscalYear} results`,
    periodLabel: `${quarter} ${fiscalYear}`,
    sourceType: fiscalYear >= 2025 ? "official_actual" : "research_only",
    sourcePath: fiscalYear >= 2025 ? OFFICIAL_DATASET_PATH : "modules/meta/ingestion/importLocalData.mjs",
    sourceUrl: sourceUrlFor(fiscalYear, quarter),
    metadataJson: json({
      lineage: lineage(fiscalYear >= 2025 ? "official_actual" : "research_only", `META ${quarter} ${fiscalYear} reporting event`, `${quarter} ${fiscalYear}`, eventDate, fiscalYear >= 2025 ? "high" : "low", fiscalYear >= 2025 ? "forecast_anchor" : "scenario_only"),
    }),
    createdAt: CREATED_AT,
  }));

  const financialPeriods = [];
  const segmentFinancials = [];
  const marketSnapshots = [];
  const assumptionSets = [];
  const validationWarnings = [];

  for (const event of REPORTING_EVENTS) {
    const [eventId, eventDate, quarter, fiscalYear] = event;
    const financial = buildFinancialForEvent(event, dataset);
    const periodId = financial.periodId;
    const sourceType = financial.sourceType;
    const rawJson = {
      ...financial.rawSource,
      sourceLineage: lineage(sourceType, sourceType === "official_actual" ? "META official local dataset" : "META research-only historical proxy", financial.label, eventDate, sourceType === "official_actual" ? "high" : "low", sourceType === "official_actual" ? "forecast_anchor" : "scenario_only"),
    };
    financialPeriods.push({
      id: `meta-${periodId}`,
      ticker: TICKER,
      periodId,
      fiscalYear,
      fiscalQuarter: quarter,
      periodType: "quarter",
      eventId,
      asOfDate: eventDate,
      sourceType,
      sourceDocumentId: financial.sourceDocumentId,
      revenue: round(financial.revenue),
      advertisingRevenue: round(financial.advertisingRevenue),
      familyOfAppsRevenue: round(financial.familyOfAppsRevenue),
      realityLabsRevenue: round(financial.realityLabsRevenue),
      familyOfAppsOperatingIncome: round(financial.familyOfAppsOperatingIncome),
      realityLabsOperatingLoss: round(financial.realityLabsOperatingLoss),
      operatingIncome: round(financial.operatingIncome),
      operatingMargin: round(financial.operatingMargin, 5),
      netIncome: round(financial.netIncome),
      normalizedNetIncome: round(financial.normalizedNetIncome),
      dilutedEps: round(financial.dilutedEps, 3),
      normalizedDilutedEps: round(financial.normalizedDilutedEps, 3),
      capex: round(financial.capex),
      depreciationAmortization: round(financial.depreciationAmortization),
      operatingCashFlow: round(financial.operatingCashFlow),
      freeCashFlow: round(financial.freeCashFlow),
      shareBasedCompensation: round(financial.shareBasedCompensation),
      dilutedShares: round(financial.dilutedShares, 4),
      buybacks: round(financial.buybacks),
      dividendsAndEquivalents: round(financial.dividendsAndEquivalents),
      cashAndMarketableSecurities: round(financial.cashAndMarketableSecurities),
      debt: round(financial.debt),
      netCash: round(financial.netCash),
      dau: null,
      mau: null,
      familyDap: round(financial.familyDap, 3),
      familyMap: null,
      adImpressionsGrowth: round(financial.adImpressionsGrowth, 5),
      averagePricePerAdGrowth: round(financial.averagePricePerAdGrowth, 5),
      headcount: financial.headcount,
      efficiencyCommentary: financial.efficiencyCommentary,
      aiCommentary: financial.aiCommentary,
      regulatoryCommentary: financial.regulatoryCommentary,
      rawJson: json(rawJson),
    });

    segmentFinancials.push({
      id: `meta-${periodId}-foa`,
      ticker: TICKER,
      periodId,
      eventId,
      asOfDate: eventDate,
      segment: "Family of Apps",
      sourceType,
      sourceDocumentId: financial.sourceDocumentId,
      revenue: round(financial.familyOfAppsRevenue),
      operatingIncome: round(financial.familyOfAppsOperatingIncome),
      operatingMargin: round(financial.familyOfAppsOperatingIncome / Math.max(financial.familyOfAppsRevenue, 0.01), 5),
      rawJson: json({ sourceType, notes: "Segment row reconciles to consolidated operating income with Reality Labs." }),
    });
    segmentFinancials.push({
      id: `meta-${periodId}-rl`,
      ticker: TICKER,
      periodId,
      eventId,
      asOfDate: eventDate,
      segment: "Reality Labs",
      sourceType,
      sourceDocumentId: financial.sourceDocumentId,
      revenue: round(financial.realityLabsRevenue),
      operatingIncome: round(-Math.abs(financial.realityLabsOperatingLoss)),
      operatingMargin: round(-Math.abs(financial.realityLabsOperatingLoss) / Math.max(financial.realityLabsRevenue, 0.01), 5),
      rawJson: json({ sourceType, optionValueTreatment: "explicit_sotp_option_only" }),
    });

    const currentPrice = fiscalYear === 2026 && quarter === "Q1" ? (marketSnapshot.currentPrice ?? 609.63) : MARKET_PRICE_ANCHORS[fiscalYear] * (0.96 + Number(quarter.slice(1)) * 0.025);
    marketSnapshots.push({
      id: `meta-market-${eventId}`,
      ticker: TICKER,
      asOfDate: eventDate,
      priceDate: fiscalYear === 2026 && quarter === "Q1" ? (marketSnapshot.priceDate ?? "2026-05-08") : eventDate,
      currentPrice: round(currentPrice, 2),
      sharesOutstanding: round(financial.dilutedShares, 4),
      marketCap: round(currentPrice * financial.dilutedShares),
      enterpriseValue: round(currentPrice * financial.dilutedShares - financial.netCash),
      netCash: round(financial.netCash),
      dividendPerShareAnnualized: fiscalYear >= 2024 ? 2.1 : 0,
      source: fiscalYear === 2026 && quarter === "Q1" ? "Dated local META market snapshot" : "Research-only historical price proxy; daily importer overrides when available",
      sourceType: fiscalYear === 2026 && quarter === "Q1" ? "market_data" : "research_only",
      rawJson: json({ eventId, source: marketSnapshot?.lineage ?? null, proxy: !(fiscalYear === 2026 && quarter === "Q1") }),
    });

    for (const scenario of ["Bear", "Base", "Bull"]) {
      const assumptions = buildAssumptionsForEvent(financial, event, scenario, scenarioPresets[scenario]);
      assumptionSets.push({
        id: `meta-${eventId}-${scenario.toLowerCase()}-assumptions`,
        ticker: TICKER,
        asOfDate: eventDate,
        scenario,
        modelVersion: META_BACKEND_MODEL_VERSION.version,
        sourceType: "forecast_assumption",
        assumptionsJson: json(assumptions),
        createdAt: CREATED_AT,
      });
    }

    if (sourceType !== "official_actual") {
      validationWarnings.push({
        id: `meta-official-gap-${eventId}`,
        ticker: TICKER,
        asOfDate: eventDate,
        severity: "warning",
        category: "official_actual_gap",
        title: "Historical financial row is research-only",
        detail: `${quarter} FY${fiscalYear} uses a clearly marked research-only proxy because local official quarterly META financials were not present in data/local/meta at seed time.`,
        relatedTable: "financial_periods",
        relatedId: `meta-${periodId}`,
        createdAt: CREATED_AT,
      });
    }
  }

  const guidanceItems = [];
  for (const guidance of dataset.guidance ?? []) {
    guidanceItems.push({
      id: guidance.id,
      ticker: TICKER,
      eventId: "meta-q1-fy2026",
      asOfDate: guidance.lineage?.asOfDate ?? "2026-04-29",
      guidanceType: "candidate",
      metric: guidance.id,
      low: guidance.revenueLow ?? guidance.totalExpenseLow ?? guidance.capexLow ?? guidance.taxRateLow ?? null,
      high: guidance.revenueHigh ?? guidance.totalExpenseHigh ?? guidance.capexHigh ?? guidance.taxRateHigh ?? null,
      value: null,
      unit: guidance.capexLow != null || guidance.revenueLow != null ? "USD billions" : "percent",
      sourceType: "management_guidance",
      sourceDocumentId: guidance.sourceId,
      valuationImpactAllowed: 0,
      humanReviewStatus: "needs_review",
      notes: guidance.notes,
      rawJson: json(guidance),
    });
  }

  const transcriptEvents = [];
  const transcriptExtractions = [];
  for (const call of dataset.earningsCalls ?? []) {
    const eventId = REPORTING_EVENTS.find(([, , quarter, fiscalYear]) => quarter === call.fiscalQuarter && fiscalYear === call.fiscalYear)?.[0] ?? null;
    transcriptEvents.push({
      id: `meta-transcript-${call.id}`,
      ticker: TICKER,
      eventId,
      eventDate: call.callDate,
      fiscalPeriod: `${call.fiscalQuarter} FY${call.fiscalYear}`,
      fiscalQuarter: call.fiscalQuarter,
      fiscalYear: call.fiscalYear,
      sourceType: "transcript_commentary",
      sourcePath: TRANSCRIPT_METADATA_PATH,
      sourceUrl: call.lineage?.sourceUrl ?? null,
      modelReady: 0,
      metadataJson: json({ ...call, transcriptMetadata: transcriptMetadata?.records?.find((record) => record.title?.includes(call.label)) ?? null }),
    });
    for (const [index, topic] of call.marketFocus.entries()) {
      transcriptExtractions.push({
        id: `meta-transcript-${call.id}-focus-${index}`,
        ticker: TICKER,
        eventId,
        asOfDate: call.callDate,
        extractionType: "market_focus",
        topic,
        text: `${call.headline} ${call.focusShiftSummary}`,
        score: call.themeScores.aiCapexConcern ?? null,
        sourceType: "transcript_commentary",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ callId: call.id, topic, aiSynthesis: call.aiSynthesis, modelImplications: call.modelImplications }),
      });
    }
  }

  const modelVersions = [{
    id: META_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: META_BACKEND_MODEL_VERSION.version,
    name: META_BACKEND_MODEL_VERSION.name,
    createdAt: CREATED_AT,
    valuationMethodsJson: json(META_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json(META_BACKEND_MODEL_VERSION.assumptionSchema),
    notes: META_BACKEND_MODEL_VERSION.description,
  }];

  const peerSnapshots = [{
    id: "meta-peer-snapshot-us-megacap-metadata",
    ticker: TICKER,
    peerTicker: "US_MEGA_CAP_AD_AI_PEERS",
    asOfDate: "2026-05-08",
    currency: "USD",
    marketCap: null,
    enterpriseValue: null,
    revenue: null,
    ebit: null,
    ebitda: null,
    pe: null,
    evEbit: null,
    evEbitda: null,
    absoluteValueUse: "metadata_only_no_cross_currency_aggregation",
    sourceType: "research_only",
    rawJson: json({ peers: ["GOOGL", "AMZN", "SNAP", "PINS"], warning: "Peer absolute values are not aggregated." }),
  }];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    marketSnapshots,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
