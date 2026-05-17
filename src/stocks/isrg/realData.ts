import type {
  IsrgActualPeriod,
  IsrgDataLayer,
  IsrgGuidancePoint,
  IsrgMetric,
  IsrgMetricSource,
  IsrgMetricUnit,
  IsrgForecastAnchor,
  IsrgResearchSignal,
  IsrgSourceConfidence,
  IsrgSourceRecord,
  IsrgSourceType,
} from "./model";
import { isrgQaPairs, isrgTopicTrends, isrgTranscriptEvents } from "./data/transcripts";

const RETRIEVED_AT = "2026-05-11T00:00:00.000Z";

export const ISRG_Q1_2026_RELEASE =
  "https://www.globenewswire.com/de/news-release/2026/04/21/3278489/7637/en/intuitive-announces-first-quarter-earnings.html";
export const ISRG_Q4_2025_RELEASE =
  "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-fourth-quarter-earnings-5/";
export const ISRG_PRELIM_FY2025_RELEASE =
  "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-preliminary-fourth-quarter-and-full-year-5";
export const ISRG_DV5_FDA_RELEASE =
  "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-fda-clearance-fifth-generation-robotic/";
export const ISRG_DV5_CE_MARK_RELEASE =
  "https://isrg.intuitive.com/news-releases/news-release-details/intuitives-da-vinci-5-surgical-system-receives-ce-mark";
export const ISRG_DV5_CARDIAC_RELEASE =
  "https://isrg.intuitive.com/news-releases/news-release-details/da-vinci-5-cleared-cardiac-procedures";
export const ISRG_DV5_INSIGHTS_RELEASE =
  "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-introduces-real-time-surgical-insights-da-vinci-5";
export const ISRG_SP_EXPANDED_RELEASE =
  "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-expanded-indications-da-vinci-sp";
export const ISRG_EUROPE_EXPANSION_RELEASE =
  "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-expands-investment-and-footprint-europe";
export const ISRG_SEC_COMPANYFACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001035267.json";
export const ISRG_SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK0001035267.json";
export const ISRG_MARKET_SNAPSHOT = "https://stockanalysis.com/stocks/isrg/";
export const ISRG_YFINANCE_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/ISRG?range=5d&interval=1d";

function source(
  metricName: string,
  period: string,
  rawValue: string | number | null,
  normalizedValue: number | string | null,
  sourceUrl: string | null,
  sourceType: IsrgSourceType,
  confidence: IsrgSourceConfidence,
  options: {
    publishedDate?: string | null;
    usedInValuation?: boolean;
    researchOnly?: boolean;
    notes?: string;
  } = {},
): IsrgMetricSource {
  return {
    sourceUrl,
    sourceType,
    publishedDate: options.publishedDate ?? null,
    retrievedAt: RETRIEVED_AT,
    period,
    metricName,
    rawValue,
    normalizedValue,
    confidence,
    usedInValuation: options.usedInValuation ?? false,
    researchOnly: options.researchOnly ?? true,
    notes: options.notes ?? "",
  };
}

function metric(
  key: string,
  label: string,
  value: number | null,
  unit: IsrgMetricUnit,
  sourceDetail: IsrgMetricSource,
): IsrgMetric {
  return { key, label, value, unit, source: sourceDetail };
}

function officialActual(
  key: string,
  label: string,
  value: number | null,
  unit: IsrgMetricUnit,
  period: string,
  sourceUrl: string,
  publishedDate: string,
  notes: string,
) {
  return metric(
    key,
    label,
    value,
    unit,
    source(label, period, value, value, sourceUrl, "earnings_release", value == null ? "todo" : "high", {
      publishedDate,
      usedInValuation: value != null,
      researchOnly: false,
      notes,
    }),
  );
}

function derivedMetric(
  key: string,
  label: string,
  value: number | null,
  unit: IsrgMetricUnit,
  period: string,
  notes: string,
  usedInValuation = true,
) {
  return metric(
    key,
    label,
    value,
    unit,
    source(label, period, value, value, null, "derived", value == null ? "todo" : "medium", {
      usedInValuation,
      researchOnly: !usedInValuation,
      notes,
    }),
  );
}

function missingMetric(key: string, label: string, unit: IsrgMetricUnit, period: string, notes: string) {
  return metric(
    key,
    label,
    null,
    unit,
    source(label, period, null, null, null, "manual_todo", "todo", {
      usedInValuation: false,
      researchOnly: true,
      notes,
    }),
  );
}

const q1ReleaseDate = "2026-04-21";
const q4ReleaseDate = "2026-01-22";
const prelimReleaseDate = "2026-01-14";

export const isrgActualData: IsrgActualPeriod[] = [
  {
    periodId: "fy2024",
    label: "FY 2024",
    fiscalYear: 2024,
    fiscalQuarter: null,
    periodType: "FY",
    periodEnd: "2024-12-31",
    sourceQuality: "high",
    revenue: {
      instrumentsAccessories: officialActual("instrumentsAccessoriesRevenue", "Instruments and accessories revenue", 5079.0, "USDm", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual revenue table in Q4 2025 earnings release."),
      systems: officialActual("systemsRevenue", "Systems revenue", 1966.0, "USDm", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual revenue table in Q4 2025 earnings release."),
      services: officialActual("servicesRevenue", "Services revenue", 1307.1, "USDm", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual revenue table in Q4 2025 earnings release."),
      total: officialActual("totalRevenue", "Total revenue", 8352.1, "USDm", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual revenue table in Q4 2025 earnings release."),
    },
    grossProfit: officialActual("grossProfit", "Gross profit", 5634.2, "USDm", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual income statement in Q4 2025 earnings release."),
    gaapGrossMargin: derivedMetric("gaapGrossMargin", "GAAP gross margin", 5634.2 / 8352.1, "percent", "FY 2024", "Derived from gross profit divided by total revenue."),
    nonGaapGrossMargin: missingMetric("nonGaapGrossMargin", "Non-GAAP gross margin", "percent", "FY 2024", "Annual non-GAAP gross margin not populated in starter dataset."),
    operatingIncome: officialActual("operatingIncome", "Income from operations", 2348.9, "USDm", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual income statement in Q4 2025 earnings release."),
    nonGaapOperatingIncome: missingMetric("nonGaapOperatingIncome", "Non-GAAP operating income", "USDm", "FY 2024", "Annual non-GAAP operating income not populated in starter dataset."),
    netIncome: officialActual("netIncome", "Net income attributable to Intuitive", 2322.6, "USDm", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual income statement in Q4 2025 earnings release."),
    dilutedEps: officialActual("dilutedEps", "Diluted EPS", 6.42, "USD", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual EPS table in Q4 2025 earnings release."),
    nonGaapEps: missingMetric("nonGaapEps", "Non-GAAP EPS", "USD", "FY 2024", "Annual non-GAAP EPS not populated in starter dataset."),
    dilutedShares: officialActual("dilutedShares", "Diluted shares", 362.0, "shares_m", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual weighted average diluted shares in Q4 2025 earnings release."),
    cashInvestments: missingMetric("cashInvestments", "Cash, equivalents, and investments", "USDm", "FY 2024", "Balance sheet cash not populated for FY 2024 starter row."),
    sbcExpense: missingMetric("sbcExpense", "Share-based compensation expense", "USDm", "FY 2024", "Annual SBC not populated for FY 2024 starter row."),
    buybackAmount: missingMetric("buybackAmount", "Buyback amount", "USDm", "FY 2024", "Buyback amount not populated for FY 2024 starter row."),
    procedures: {
      worldwideDaVinciProcedures: officialActual("worldwideDaVinciProcedures", "Worldwide da Vinci procedures", 2683000, "procedures", "FY 2024", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed 2024 da Vinci procedures for comparison."),
      worldwideDaVinciProcedureGrowth: missingMetric("worldwideDaVinciProcedureGrowth", "Worldwide da Vinci procedure growth", "percent", "FY 2024", "Prior-year growth not populated in starter dataset."),
      worldwideCombinedProcedureGrowth: missingMetric("worldwideCombinedProcedureGrowth", "Worldwide combined procedure growth", "percent", "FY 2024", "Prior-year growth not populated in starter dataset."),
      usDaVinciProcedureGrowth: missingMetric("usDaVinciProcedureGrowth", "U.S. da Vinci procedure growth", "percent", "FY 2024", "Prior-year U.S. growth not populated in starter dataset."),
      ousDaVinciProcedureGrowth: missingMetric("ousDaVinciProcedureGrowth", "OUS da Vinci procedure growth", "percent", "FY 2024", "Prior-year OUS growth not populated in starter dataset."),
      ionProcedureGrowth: missingMetric("ionProcedureGrowth", "Ion procedure growth", "percent", "FY 2024", "Prior-year Ion growth not populated in starter dataset."),
      commentary: "FY 2024 is retained mainly as the denominator for procedure and installed-base growth.",
    },
    installedBase: {
      daVinciInstalledBase: officialActual("daVinciInstalledBase", "da Vinci installed base", 9902, "systems", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Q4 2025 highlights disclosed December 31, 2024 installed base."),
      ionInstalledBase: officialActual("ionInstalledBase", "Ion installed base", 805, "systems", "FY 2024", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Q4 2025 highlights disclosed December 31, 2024 installed base."),
      totalInstalledBase: derivedMetric("totalInstalledBase", "Total installed base", 10707, "systems", "FY 2024", "Derived as da Vinci installed base plus Ion installed base."),
    },
    placements: {
      daVinciPlacements: officialActual("daVinciPlacements", "da Vinci placements", 1526, "systems", "FY 2024", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2024 da Vinci placements."),
      daVinci5Placements: officialActual("daVinci5Placements", "da Vinci 5 placements", 362, "systems", "FY 2024", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2024 da Vinci 5 placements."),
      ionPlacements: officialActual("ionPlacements", "Ion placements", 271, "systems", "FY 2024", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2024 Ion placements."),
      spPlacements: missingMetric("spPlacements", "SP placements", "systems", "FY 2024", "SP placements were not identified in starter official extraction."),
      operatingLeasePlacements: officialActual("operatingLeasePlacements", "Operating lease placements", 776, "systems", "FY 2024", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2024 operating lease placements."),
      usageBasedLeasePlacements: officialActual("usageBasedLeasePlacements", "Usage-based operating lease placements", 467, "systems", "FY 2024", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2024 usage-based operating lease placements."),
    },
  },
  {
    periodId: "q1-2025",
    label: "Q1 2025",
    fiscalYear: 2025,
    fiscalQuarter: 1,
    periodType: "Q",
    periodEnd: "2025-03-31",
    sourceQuality: "high",
    revenue: {
      instrumentsAccessories: officialActual("instrumentsAccessoriesRevenue", "Instruments and accessories revenue", 1367.7, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
      systems: officialActual("systemsRevenue", "Systems revenue", 522.7, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
      services: officialActual("servicesRevenue", "Services revenue", 363.0, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
      total: officialActual("totalRevenue", "Total revenue", 2253.4, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
    },
    grossProfit: officialActual("grossProfit", "Gross profit", 1457.7, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
    gaapGrossMargin: officialActual("gaapGrossMargin", "GAAP gross margin", 0.647, "percent", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 non-GAAP reconciliation table."),
    nonGaapGrossMargin: officialActual("nonGaapGrossMargin", "Non-GAAP gross margin", 0.664, "percent", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 non-GAAP reconciliation table."),
    operatingIncome: officialActual("operatingIncome", "Income from operations", 578.1, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
    nonGaapOperatingIncome: officialActual("nonGaapOperatingIncome", "Non-GAAP operating income", 767.5, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 non-GAAP reconciliation table."),
    netIncome: officialActual("netIncome", "Net income attributable to Intuitive", 698.4, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
    dilutedEps: officialActual("dilutedEps", "Diluted EPS", 1.92, "USD", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
    nonGaapEps: officialActual("nonGaapEps", "Non-GAAP EPS", 1.81, "USD", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
    dilutedShares: officialActual("dilutedShares", "Diluted shares", 364.6, "shares_m", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 release prior-year comparison table."),
    cashInvestments: missingMetric("cashInvestments", "Cash, equivalents, and investments", "USDm", "Q1 2025", "Q1 2025 balance sheet not populated in starter row."),
    sbcExpense: officialActual("sbcExpense", "Share-based compensation expense", 190.0, "USDm", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 financial summary disclosed prior-year SBC in operating income."),
    buybackAmount: missingMetric("buybackAmount", "Buyback amount", "USDm", "Q1 2025", "Q1 2025 buyback amount not populated in starter row."),
    procedures: {
      worldwideDaVinciProcedures: missingMetric("worldwideDaVinciProcedures", "Worldwide da Vinci procedures", "procedures", "Q1 2025", "Quarterly procedure count not disclosed in starter official extraction."),
      worldwideDaVinciProcedureGrowth: missingMetric("worldwideDaVinciProcedureGrowth", "Worldwide da Vinci procedure growth", "percent", "Q1 2025", "Prior-year procedure growth not populated for Q1 2025."),
      worldwideCombinedProcedureGrowth: missingMetric("worldwideCombinedProcedureGrowth", "Worldwide combined procedure growth", "percent", "Q1 2025", "Prior-year combined procedure growth not populated for Q1 2025."),
      usDaVinciProcedureGrowth: missingMetric("usDaVinciProcedureGrowth", "U.S. da Vinci procedure growth", "percent", "Q1 2025", "U.S. growth not populated for Q1 2025."),
      ousDaVinciProcedureGrowth: missingMetric("ousDaVinciProcedureGrowth", "OUS da Vinci procedure growth", "percent", "Q1 2025", "OUS growth not populated for Q1 2025."),
      ionProcedureGrowth: missingMetric("ionProcedureGrowth", "Ion procedure growth", "percent", "Q1 2025", "Ion procedure growth not populated for Q1 2025."),
      commentary: "Q1 2025 is used as the official prior-year comparison for Q1 2026.",
    },
    installedBase: {
      daVinciInstalledBase: officialActual("daVinciInstalledBase", "da Vinci installed base", 10189, "systems", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed March 31, 2025 installed base."),
      ionInstalledBase: officialActual("ionInstalledBase", "Ion installed base", 853, "systems", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed March 31, 2025 installed base."),
      totalInstalledBase: derivedMetric("totalInstalledBase", "Total installed base", 11042, "systems", "Q1 2025", "Derived as da Vinci installed base plus Ion installed base."),
    },
    placements: {
      daVinciPlacements: officialActual("daVinciPlacements", "da Vinci placements", 367, "systems", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed prior-year da Vinci placements."),
      daVinci5Placements: officialActual("daVinci5Placements", "da Vinci 5 placements", 147, "systems", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed prior-year da Vinci 5 placements."),
      ionPlacements: officialActual("ionPlacements", "Ion placements", 49, "systems", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed prior-year Ion placements."),
      spPlacements: missingMetric("spPlacements", "SP placements", "systems", "Q1 2025", "SP placements were not identified in starter official extraction."),
      operatingLeasePlacements: officialActual("operatingLeasePlacements", "Operating lease placements", 198, "systems", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 financial summary disclosed prior-year operating lease placements."),
      usageBasedLeasePlacements: officialActual("usageBasedLeasePlacements", "Usage-based operating lease placements", 107, "systems", "Q1 2025", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 financial summary disclosed prior-year usage-based operating lease placements."),
    },
  },
  {
    periodId: "fy2025",
    label: "FY 2025",
    fiscalYear: 2025,
    fiscalQuarter: null,
    periodType: "FY",
    periodEnd: "2025-12-31",
    sourceQuality: "high",
    revenue: {
      instrumentsAccessories: officialActual("instrumentsAccessoriesRevenue", "Instruments and accessories revenue", 6018.9, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual revenue table in Q4 2025 earnings release."),
      systems: officialActual("systemsRevenue", "Systems revenue", 2473.7, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual revenue table in Q4 2025 earnings release."),
      services: officialActual("servicesRevenue", "Services revenue", 1572.1, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual revenue table in Q4 2025 earnings release."),
      total: officialActual("totalRevenue", "Total revenue", 10064.7, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual revenue table in Q4 2025 earnings release."),
    },
    grossProfit: officialActual("grossProfit", "Gross profit", 6642.3, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual income statement in Q4 2025 earnings release."),
    gaapGrossMargin: derivedMetric("gaapGrossMargin", "GAAP gross margin", 6642.3 / 10064.7, "percent", "FY 2025", "Derived from gross profit divided by total revenue."),
    nonGaapGrossMargin: officialActual("nonGaapGrossMargin", "Non-GAAP gross margin", 0.676, "percent", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "2026 outlook compares guidance to 67.6% non-GAAP gross margin in 2025."),
    operatingIncome: officialActual("operatingIncome", "Income from operations", 2945.5, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual income statement in Q4 2025 earnings release."),
    nonGaapOperatingIncome: missingMetric("nonGaapOperatingIncome", "Non-GAAP operating income", "USDm", "FY 2025", "Annual non-GAAP operating income not populated in starter dataset."),
    netIncome: officialActual("netIncome", "Net income attributable to Intuitive", 2856.0, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual income statement in Q4 2025 earnings release."),
    dilutedEps: officialActual("dilutedEps", "Diluted EPS", 7.87, "USD", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual EPS table in Q4 2025 earnings release."),
    nonGaapEps: missingMetric("nonGaapEps", "Non-GAAP EPS", "USD", "FY 2025", "Annual non-GAAP EPS not populated in starter dataset."),
    dilutedShares: officialActual("dilutedShares", "Diluted shares", 362.7, "shares_m", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual weighted average diluted shares in Q4 2025 earnings release."),
    cashInvestments: officialActual("cashInvestments", "Cash, equivalents, and investments", 9034.1, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Q4 2025 financial summary cash and investments."),
    sbcExpense: officialActual("sbcExpense", "Share-based compensation expense", 788.1, "USDm", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Annual non-GAAP operating income reconciliation line for share-based compensation expense."),
    buybackAmount: missingMetric("buybackAmount", "Buyback amount", "USDm", "FY 2025", "FY 2025 buyback amount not populated in starter row."),
    procedures: {
      worldwideDaVinciProcedures: officialActual("worldwideDaVinciProcedures", "Worldwide da Vinci procedures", 3153000, "procedures", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed full-year da Vinci procedure count."),
      worldwideDaVinciProcedureGrowth: officialActual("worldwideDaVinciProcedureGrowth", "Worldwide da Vinci procedure growth", 0.18, "percent", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed approximately 18% da Vinci procedure growth."),
      worldwideCombinedProcedureGrowth: officialActual("worldwideCombinedProcedureGrowth", "Worldwide combined procedure growth", 0.19, "percent", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed approximately 19% combined da Vinci and Ion procedure growth."),
      usDaVinciProcedureGrowth: officialActual("usDaVinciProcedureGrowth", "U.S. general surgery procedure growth", 0.18, "percent", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release cited 18% U.S. general surgery growth as a driver."),
      ousDaVinciProcedureGrowth: officialActual("ousDaVinciProcedureGrowth", "OUS da Vinci procedure growth", 0.23, "percent", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed 23% total OUS da Vinci procedure growth."),
      ionProcedureGrowth: officialActual("ionProcedureGrowth", "Ion procedure growth", 0.51, "percent", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed approximately 51% Ion procedure growth."),
      procedureGrowthGuidanceLow: officialActual("procedureGrowthGuidanceLow", "2026 da Vinci procedure guidance low", 0.13, "percent", "FY 2026", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Initial FY 2026 da Vinci procedure growth guidance low end."),
      procedureGrowthGuidanceHigh: officialActual("procedureGrowthGuidanceHigh", "2026 da Vinci procedure guidance high", 0.15, "percent", "FY 2026", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Initial FY 2026 da Vinci procedure growth guidance high end."),
      commentary: "2025 procedure growth exceeded installed-base growth, indicating utilization improvement in addition to system expansion.",
    },
    installedBase: {
      daVinciInstalledBase: officialActual("daVinciInstalledBase", "da Vinci installed base", 11106, "systems", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Q4 2025 highlights disclosed December 31, 2025 installed base."),
      ionInstalledBase: officialActual("ionInstalledBase", "Ion installed base", 995, "systems", "FY 2025", ISRG_Q4_2025_RELEASE, q4ReleaseDate, "Q4 2025 highlights disclosed December 31, 2025 installed base."),
      totalInstalledBase: derivedMetric("totalInstalledBase", "Total installed base", 12101, "systems", "FY 2025", "Derived as da Vinci installed base plus Ion installed base."),
    },
    placements: {
      daVinciPlacements: officialActual("daVinciPlacements", "da Vinci placements", 1721, "systems", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2025 da Vinci placements."),
      daVinci5Placements: officialActual("daVinci5Placements", "da Vinci 5 placements", 870, "systems", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2025 da Vinci 5 placements."),
      ionPlacements: officialActual("ionPlacements", "Ion placements", 195, "systems", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2025 Ion placements."),
      spPlacements: missingMetric("spPlacements", "SP placements", "systems", "FY 2025", "SP placements were not identified in starter official extraction."),
      operatingLeasePlacements: officialActual("operatingLeasePlacements", "Operating lease placements", 872, "systems", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2025 operating lease placements."),
      usageBasedLeasePlacements: officialActual("usageBasedLeasePlacements", "Usage-based operating lease placements", 496, "systems", "FY 2025", ISRG_PRELIM_FY2025_RELEASE, prelimReleaseDate, "Preliminary FY 2025 release disclosed FY 2025 usage-based operating lease placements."),
    },
  },
  {
    periodId: "q1-2026",
    label: "Q1 2026",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    periodType: "Q",
    periodEnd: "2026-03-31",
    sourceQuality: "high",
    revenue: {
      instrumentsAccessories: officialActual("instrumentsAccessoriesRevenue", "Instruments and accessories revenue", 1686.4, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 earnings release revenue table."),
      systems: officialActual("systemsRevenue", "Systems revenue", 650.7, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 earnings release revenue table."),
      services: officialActual("servicesRevenue", "Services revenue", 433.7, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 earnings release revenue table."),
      total: officialActual("totalRevenue", "Total revenue", 2770.8, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 earnings release revenue table."),
    },
    grossProfit: officialActual("grossProfit", "Gross profit", 1830.5, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 earnings release income statement."),
    gaapGrossMargin: officialActual("gaapGrossMargin", "GAAP gross margin", 0.661, "percent", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 non-GAAP reconciliation table."),
    nonGaapGrossMargin: officialActual("nonGaapGrossMargin", "Non-GAAP gross margin", 0.678, "percent", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 non-GAAP reconciliation table."),
    operatingIncome: officialActual("operatingIncome", "Income from operations", 855.3, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 earnings release income statement."),
    nonGaapOperatingIncome: officialActual("nonGaapOperatingIncome", "Non-GAAP operating income", 1076.8, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 non-GAAP reconciliation table."),
    netIncome: officialActual("netIncome", "Net income attributable to Intuitive", 821.5, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 earnings release income statement."),
    dilutedEps: officialActual("dilutedEps", "Diluted EPS", 2.28, "USD", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 earnings release EPS table."),
    nonGaapEps: officialActual("nonGaapEps", "Non-GAAP EPS", 2.5, "USD", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 financial summary."),
    dilutedShares: officialActual("dilutedShares", "Diluted shares", 359.8, "shares_m", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 weighted average diluted shares."),
    cashInvestments: officialActual("cashInvestments", "Cash, equivalents, and investments", 7979.2, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 balance sheet."),
    sbcExpense: officialActual("sbcExpense", "Share-based compensation expense", 213.0, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 financial summary disclosed SBC in operating income."),
    buybackAmount: officialActual("buybackAmount", "Buyback amount", 1100.0, "USDm", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed common stock repurchase amount."),
    procedures: {
      worldwideDaVinciProcedures: missingMetric("worldwideDaVinciProcedures", "Worldwide da Vinci procedures", "procedures", "Q1 2026", "Quarterly procedure count not disclosed in starter official extraction."),
      worldwideDaVinciProcedureGrowth: officialActual("worldwideDaVinciProcedureGrowth", "Worldwide da Vinci procedure growth", 0.16, "percent", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed approximately 16% da Vinci procedure growth."),
      worldwideCombinedProcedureGrowth: officialActual("worldwideCombinedProcedureGrowth", "Worldwide combined procedure growth", 0.17, "percent", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed approximately 17% combined procedure growth."),
      usDaVinciProcedureGrowth: missingMetric("usDaVinciProcedureGrowth", "U.S. da Vinci procedure growth", "percent", "Q1 2026", "Q1 2026 release did not disclose U.S. growth in starter extraction."),
      ousDaVinciProcedureGrowth: missingMetric("ousDaVinciProcedureGrowth", "OUS da Vinci procedure growth", "percent", "Q1 2026", "Q1 2026 release did not disclose OUS growth in starter extraction."),
      ionProcedureGrowth: officialActual("ionProcedureGrowth", "Ion procedure growth", 0.39, "percent", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed approximately 39% Ion procedure growth."),
      procedureGrowthGuidanceLow: officialActual("procedureGrowthGuidanceLow", "2026 da Vinci procedure guidance low", 0.135, "percent", "FY 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 updated FY 2026 da Vinci procedure growth guidance low end."),
      procedureGrowthGuidanceHigh: officialActual("procedureGrowthGuidanceHigh", "2026 da Vinci procedure guidance high", 0.155, "percent", "FY 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 updated FY 2026 da Vinci procedure growth guidance high end."),
      commentary: "Q1 2026 procedure growth remained above installed-base growth; guidance was raised versus the initial January range.",
    },
    installedBase: {
      daVinciInstalledBase: officialActual("daVinciInstalledBase", "da Vinci installed base", 11395, "systems", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed March 31, 2026 installed base."),
      ionInstalledBase: officialActual("ionInstalledBase", "Ion installed base", 1041, "systems", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed March 31, 2026 installed base."),
      totalInstalledBase: derivedMetric("totalInstalledBase", "Total installed base", 12436, "systems", "Q1 2026", "Derived as da Vinci installed base plus Ion installed base."),
    },
    placements: {
      daVinciPlacements: officialActual("daVinciPlacements", "da Vinci placements", 431, "systems", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed da Vinci placements."),
      daVinci5Placements: officialActual("daVinci5Placements", "da Vinci 5 placements", 232, "systems", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed da Vinci 5 placements."),
      ionPlacements: officialActual("ionPlacements", "Ion placements", 52, "systems", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 highlights disclosed Ion placements."),
      spPlacements: missingMetric("spPlacements", "SP placements", "systems", "Q1 2026", "SP placements were not identified in starter official extraction."),
      operatingLeasePlacements: officialActual("operatingLeasePlacements", "Operating lease placements", 243, "systems", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 financial summary disclosed operating lease placements."),
      usageBasedLeasePlacements: officialActual("usageBasedLeasePlacements", "Usage-based operating lease placements", 118, "systems", "Q1 2026", ISRG_Q1_2026_RELEASE, q1ReleaseDate, "Q1 2026 financial summary disclosed usage-based operating lease placements."),
    },
  },
];

export const isrgOfficialGuidance: IsrgGuidancePoint[] = [
  {
    id: "fy2026-da-vinci-procedure-growth",
    period: "FY 2026",
    metric: "Worldwide da Vinci procedure growth",
    low: 0.135,
    high: 0.155,
    midpoint: 0.145,
    unit: "percent",
    source: source("Worldwide da Vinci procedure growth guidance", "FY 2026", "13.5% to 15.5%", 0.145, ISRG_Q1_2026_RELEASE, "earnings_release", "high", {
      publishedDate: q1ReleaseDate,
      usedInValuation: true,
      researchOnly: false,
      notes: "Updated FY 2026 procedure growth guidance from Q1 2026 earnings release.",
    }),
  },
  {
    id: "fy2026-non-gaap-gross-margin",
    period: "FY 2026",
    metric: "Non-GAAP gross margin",
    low: 0.675,
    high: 0.685,
    midpoint: 0.68,
    unit: "percent",
    source: source("Non-GAAP gross margin guidance", "FY 2026", "67.5% to 68.5%", 0.68, ISRG_Q1_2026_RELEASE, "earnings_release", "high", {
      publishedDate: q1ReleaseDate,
      usedInValuation: true,
      researchOnly: false,
      notes: "Includes estimated tariff impact of 1.0% of revenue per Q1 2026 release.",
    }),
  },
  {
    id: "fy2026-non-gaap-opex-growth",
    period: "FY 2026",
    metric: "Non-GAAP operating expense growth",
    low: 0.11,
    high: 0.14,
    midpoint: 0.125,
    unit: "percent",
    source: source("Non-GAAP operating expense growth guidance", "FY 2026", "11% to 14%", 0.125, ISRG_Q1_2026_RELEASE, "earnings_release", "high", {
      publishedDate: q1ReleaseDate,
      usedInValuation: true,
      researchOnly: false,
      notes: "Updated FY 2026 non-GAAP operating expense growth guidance.",
    }),
  },
];

export const isrgForecastAnchors: IsrgForecastAnchor[] = [
  {
    id: "procedure-growth-anchor",
    label: "FY 2026 da Vinci procedure growth midpoint",
    metricKey: "procedureCagr",
    value: 0.145,
    unit: "percent",
    source: isrgOfficialGuidance[0].source,
    driverMapping: "Procedure-based DCF year-one procedure growth and scenario guardrail.",
  },
  {
    id: "gross-margin-tariff-anchor",
    label: "FY 2026 non-GAAP gross margin midpoint after tariff drag",
    metricKey: "tariffGrossMarginDrag",
    value: 0.01,
    unit: "percent",
    source: isrgOfficialGuidance[1].source,
    driverMapping: "Margin risk module and bear-case gross margin pressure.",
  },
];

export const isrgSources: IsrgSourceRecord[] = [
  { id: "q1-2026-release", label: "Q1 2026 earnings release", url: ISRG_Q1_2026_RELEASE, sourceType: "earnings_release", sourceConfidence: "high", notes: "Primary latest official quarterly financial, procedure, placement, installed-base, guidance, and tariff source." },
  { id: "q4-2025-release", label: "Q4 2025 earnings release", url: ISRG_Q4_2025_RELEASE, sourceType: "earnings_release", sourceConfidence: "high", notes: "Primary FY 2025 income statement and revenue breakdown source." },
  { id: "fy2025-prelim", label: "Preliminary FY 2025 operating metrics", url: ISRG_PRELIM_FY2025_RELEASE, sourceType: "official_ir", sourceConfidence: "high", notes: "Source for full-year procedure counts, placements, lease mix, and OUS growth details." },
  { id: "dv5-fda", label: "da Vinci 5 FDA clearance", url: ISRG_DV5_FDA_RELEASE, sourceType: "product_announcement", sourceConfidence: "high", notes: "Product cycle milestone; research layer unless translated into assumptions." },
  { id: "dv5-ce", label: "da Vinci 5 CE mark", url: ISRG_DV5_CE_MARK_RELEASE, sourceType: "product_announcement", sourceConfidence: "high", notes: "European approval milestone and product feature source." },
  { id: "dv5-cardiac", label: "da Vinci 5 cardiac clearance", url: ISRG_DV5_CARDIAC_RELEASE, sourceType: "product_announcement", sourceConfidence: "high", notes: "Indication expansion source." },
  { id: "dv5-insights", label: "da Vinci 5 real-time surgical insights", url: ISRG_DV5_INSIGHTS_RELEASE, sourceType: "product_announcement", sourceConfidence: "high", notes: "Digital capability source; research-only unless explicitly modeled." },
  { id: "sp-expanded", label: "da Vinci SP expanded indications", url: ISRG_SP_EXPANDED_RELEASE, sourceType: "product_announcement", sourceConfidence: "high", notes: "SP optionality source." },
  { id: "europe-expansion", label: "Direct operations expansion in Europe", url: ISRG_EUROPE_EXPANSION_RELEASE, sourceType: "product_announcement", sourceConfidence: "high", notes: "International penetration and direct-channel source." },
  { id: "sec-companyfacts", label: "SEC companyfacts", url: ISRG_SEC_COMPANYFACTS, sourceType: "sec_filing", sourceConfidence: "high", notes: "Fetch target for structured XBRL actuals." },
  { id: "market-snapshot", label: "StockAnalysis market snapshot", url: ISRG_MARKET_SNAPSHOT, sourceType: "market_snapshot", sourceConfidence: "medium", notes: "Market data snapshot only; scripts include yfinance refresh path." },
];

const researchSource = (metricName: string, sourceUrl: string, publishedDate: string, notes: string) =>
  source(metricName, "research", metricName, metricName, sourceUrl, "product_announcement", "high", {
    publishedDate,
    usedInValuation: false,
    researchOnly: true,
    notes,
  });

export const isrgProductEvents = [
  {
    id: "dv5-fda-clearance",
    platform: "da Vinci 5" as const,
    date: "2024-03-14",
    title: "FDA 510(k) clearance for da Vinci 5",
    geography: "United States",
    status: "cleared" as const,
    description: "Fifth-generation multiport robotic system cleared by FDA.",
    features: ["force feedback", "improved vision", "ergonomic surgeon console", "future digital capability"],
    source: researchSource("da Vinci 5 FDA clearance", ISRG_DV5_FDA_RELEASE, "2024-03-14", "Product milestone; not automatically valuation-accretive."),
    valuationImpactAllowed: false as const,
  },
  {
    id: "dv5-ce-mark",
    platform: "da Vinci 5" as const,
    date: "2025-07-02",
    title: "da Vinci 5 receives CE mark",
    geography: "Europe",
    status: "approved" as const,
    description: "CE mark approval for adult and pediatric use across multiple endoscopic procedures.",
    features: ["150+ enhancements", "10,000x more computing power", "force feedback", "3D vision", "actionable insights"],
    source: researchSource("da Vinci 5 CE mark", ISRG_DV5_CE_MARK_RELEASE, "2025-07-02", "Regional approval and feature source."),
    valuationImpactAllowed: false as const,
  },
  {
    id: "dv5-cardiac-clearance",
    platform: "da Vinci 5" as const,
    date: "2026-01-26",
    title: "da Vinci 5 cleared for certain cardiac procedures",
    geography: "United States",
    status: "cleared" as const,
    description: "FDA clearance expanded indications to certain cardiac procedures including mitral valve repair and IMA mobilization.",
    features: ["indication expansion", "cardiac procedure optionality"],
    source: researchSource("da Vinci 5 cardiac clearance", ISRG_DV5_CARDIAC_RELEASE, "2026-01-26", "Research-only TAM expansion evidence until procedure/revenue adoption appears."),
    valuationImpactAllowed: false as const,
  },
  {
    id: "dv5-real-time-insights",
    platform: "Digital" as const,
    date: "2025-09-12",
    title: "Real-time surgical insights for da Vinci 5",
    geography: "United States / Europe where available",
    status: "announced" as const,
    description: "Force Gauge, In-Console Video Replay, and Network CCM features introduced for da Vinci 5.",
    features: ["Force Gauge", "In-Console Video Replay", "Network CCM", "10,000x computing power"],
    source: researchSource("da Vinci 5 real-time surgical insights", ISRG_DV5_INSIGHTS_RELEASE, "2025-09-12", "Digital surgery narrative; not a direct multiple uplift."),
    valuationImpactAllowed: false as const,
  },
  {
    id: "sp-expanded-indications",
    platform: "SP" as const,
    date: "2025-12-10",
    title: "da Vinci SP expanded indications",
    geography: "United States",
    status: "cleared" as const,
    description: "FDA clearance expanded SP to inguinal hernia repair, cholecystectomy, and appendectomy.",
    features: ["single port access", "narrow anatomy", "incremental procedure category optionality"],
    source: researchSource("SP expanded indications", ISRG_SP_EXPANDED_RELEASE, "2025-12-10", "Research-only optionality source."),
    valuationImpactAllowed: false as const,
  },
  {
    id: "europe-expansion",
    platform: "Other" as const,
    date: "2025-03-20",
    title: "Direct operations expansion in Europe",
    geography: "Europe",
    status: "announced" as const,
    description: "Intuitive announced expanded investment and direct operations in Italy, Spain, Portugal, Malta, and San Marino.",
    features: ["direct operations", "international penetration", "commercial footprint"],
    source: researchSource("Europe direct operations expansion", ISRG_EUROPE_EXPANSION_RELEASE, "2025-03-20", "International expansion evidence; research-only unless regional procedure data is validated."),
    valuationImpactAllowed: false as const,
  },
];

export const isrgResearchSignals: IsrgResearchSignal[] = [
  {
    id: "procedure-growth-above-installed-base",
    category: "Procedure",
    title: "Procedure growth still above installed-base growth",
    score: 82,
    direction: "positive",
    evidence: "FY 2025 da Vinci procedures grew approximately 18% while da Vinci installed base grew 12%, implying utilization contribution.",
    source: isrgActualData[2].procedures.worldwideDaVinciProcedureGrowth.source,
    valuationImpactAllowed: false,
  },
  {
    id: "dv5-rollout-lease-mix-watch",
    category: "da Vinci 5",
    title: "da Vinci 5 adoption is material but lease mix changes revenue timing",
    score: 70,
    direction: "mixed",
    evidence: "Q1 2026 da Vinci 5 was 232 of 431 da Vinci placements while operating leases were 243 of 431 placements.",
    source: isrgActualData[3].placements.daVinci5Placements.source,
    valuationImpactAllowed: false,
  },
  {
    id: "tariff-gross-margin-watch",
    category: "Margin",
    title: "Tariffs are now an explicit gross margin risk",
    score: 58,
    direction: "negative",
    evidence: "Q1 2026 outlook embeds an estimated tariff impact of 1.0% of revenue in non-GAAP gross margin guidance.",
    source: isrgOfficialGuidance[1].source,
    valuationImpactAllowed: false,
  },
  {
    id: "ion-second-platform-optionality",
    category: "Ion",
    title: "Ion is growing faster than da Vinci but remains optionality",
    score: 64,
    direction: "positive",
    evidence: "Q1 2026 Ion procedures grew approximately 39% and installed base reached 1,041 systems, but Ion revenue is not separately disclosed in the starter dataset.",
    source: isrgActualData[3].procedures.ionProcedureGrowth.source,
    valuationImpactAllowed: false,
  },
];

export const isrgMarketData = {
  ticker: "ISRG" as const,
  currentPrice: 418.885009765625,
  priceDate: "2026-05-11",
  marketCap: 148352.3,
  enterpriseValue: 140373.1,
  sharesOutstanding: 354.16,
  beta: 1.51,
  forwardPe: 42.46,
  evSales: 14.75,
  evEbit: null,
  fcfYield: null,
  source: source("ISRG yfinance market snapshot", "2026-05-11", 418.885009765625, 418.885009765625, ISRG_YFINANCE_CHART, "yfinance", "medium", {
    publishedDate: "2026-05-11",
    usedInValuation: true,
    researchOnly: false,
    notes: "Yfinance chart snapshot from scripts/isrg_build_metric_database.mjs. Market cap and EV are derived using local shares outstanding and net cash anchors.",
  }),
  notes: "Unofficial yfinance market snapshot. Use for price, upside/downside, and multiple sanity checks only.",
};

export const isrgResearchOnlyData = {
  signals: isrgResearchSignals,
  productEvents: isrgProductEvents,
  moatFactors: [],
  competitors: [],
  redTeam: [],
};

export const isrgData: IsrgDataLayer = {
  actualData: isrgActualData,
  officialGuidance: isrgOfficialGuidance,
  forecastAnchors: isrgForecastAnchors,
  transcriptInsights: {
    events: isrgTranscriptEvents,
    qaPairs: isrgQaPairs,
    topicTrends: isrgTopicTrends,
  },
  marketData: isrgMarketData,
  researchOnlyData: isrgResearchOnlyData,
  valuationInputs: {
    latestFullYearPeriodId: "fy2025",
    latestQuarterPeriodId: "q1-2026",
    allowedSourceTypes: ["earnings_release", "sec_filing", "official_ir", "derived", "assumption", "market_snapshot", "yfinance"],
    excludedSourceTypes: ["transcript", "product_announcement", "manual_todo"],
    notes: [
      "Transcript and product narrative are research-only until promoted by an analyst.",
      "Ion and SP are valued through probability-weighted optionality with an explicit de-duplication haircut.",
      "Yfinance/market snapshots are allowed only for current price, shares, beta, and multiple sanity checks.",
    ],
  },
  sources: isrgSources,
  dataStatus: {
    lastUpdated: "2026-05-11",
    sourceNote:
      "Starter ISRG layer uses official earnings releases, product announcements, SEC fetch targets, and an unofficial market snapshot. Scripts are provided to refresh official/SEC/transcript/market artifacts under data/local/isrg.",
    warnings: [
      {
        id: "isrg-market-snapshot-not-official",
        title: "Market data is not a fundamental source",
        detail: "The dated market snapshot is used for upside/downside and reverse valuation only; it must not overwrite official operating actuals.",
        severity: "medium",
      },
      {
        id: "isrg-ion-sp-revenue-not-disclosed",
        title: "Ion and SP revenue are not separately disclosed",
        detail: "Ion/SP optionality is modeled probability-weighted and haircut for de-duplication, not capitalized as full TAM.",
        severity: "medium",
      },
      {
        id: "isrg-transcripts-research-only",
        title: "Transcript intelligence is research-only",
        detail: "Transcript Q&A is not imported by valuation engines and cannot update valuation inputs without validated numeric evidence.",
        severity: "low",
      },
    ],
  },
};
