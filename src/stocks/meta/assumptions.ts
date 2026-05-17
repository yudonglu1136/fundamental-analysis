import type { Scenario, ValuationAssumption } from "../types";
import { metaDataset } from "./data";
import { metaLineage } from "./data/lineage";
import type { MetaAssumptionMetadata, MetaValuationAssumptions } from "./model";

export type MetaAssumptions = MetaValuationAssumptions;

const ASSUMPTION_NOTE = "analyst_forecast_assumption";
const DISCLOSURE_DATE = "2026-04-29";
const market = metaDataset.marketData;
const latestActual = metaDataset.periods.find((period) => period.id === metaDataset.latestReportingPeriod) ?? metaDataset.periods[metaDataset.periods.length - 1];
const fy2025 = metaDataset.periods.find((period) => period.id === "fy2025") ?? metaDataset.periods[0];

export const metaScenarioPresets: Record<Scenario, MetaValuationAssumptions> = {
  Bear: {
    currentPrice: market.currentPrice,
    revenueGrowth2026: 0.13,
    revenueCagr2027To2030: 0.07,
    adImpressionCagr: 0.07,
    pricePerAdCagr: 0.01,
    foaOperatingMargin: 0.47,
    realityLabsAnnualLoss: 21,
    realityLabsRevenueGrowth: 0.02,
    realityLabsLossCagr: 0.05,
    regulatoryRevenueHaircut: 0.04,
    taxRate: 0.16,
    capex2026: 145,
    terminalCapexIntensity: 0.28,
    maintenanceCapexIntensity: 0.18,
    aiCapexShare: 0.68,
    depreciationSalesIntensity: 0.125,
    workingCapitalDragPctRevenueGrowth: 0.025,
    netInterestIncome: -1.5,
    annualDilutionFromSbc: 0.015,
    sbcExpensePctRevenue: 0.11,
    buybackYield: 0.005,
    buybackSpend2026: 12,
    wacc: 0.095,
    terminalGrowth: 0.025,
    targetFcfYield: 0.055,
    targetPe: 21,
    targetEvEbit: 17,
    foaEbitMultiple: 18,
    realityLabsOptionValue: 0,
    aiRevenueUpliftPct: 0.03,
    aiIncrementalMargin: 0.45,
    exitPe: 21,
    dividendPerShare: 2.1,
    netCash: latestActual.netCash,
    dilutedShares: latestActual.dilutedShares,
    weightDcf: 0.35,
    weightFcfYield: 0.2,
    weightPe: 0.15,
    weightEvEbit: 0.1,
    weightSotp: 0.2,
  },
  Base: {
    currentPrice: market.currentPrice,
    revenueGrowth2026: 0.21,
    revenueCagr2027To2030: 0.11,
    adImpressionCagr: 0.1,
    pricePerAdCagr: 0.04,
    foaOperatingMargin: 0.5,
    realityLabsAnnualLoss: 19.2,
    realityLabsRevenueGrowth: 0.08,
    realityLabsLossCagr: 0,
    regulatoryRevenueHaircut: 0.015,
    taxRate: 0.15,
    capex2026: 135,
    terminalCapexIntensity: 0.22,
    maintenanceCapexIntensity: 0.16,
    aiCapexShare: 0.6,
    depreciationSalesIntensity: 0.115,
    workingCapitalDragPctRevenueGrowth: 0.015,
    netInterestIncome: 0,
    annualDilutionFromSbc: 0.01,
    sbcExpensePctRevenue: 0.1,
    buybackYield: 0.015,
    buybackSpend2026: 30,
    wacc: 0.085,
    terminalGrowth: 0.03,
    targetFcfYield: 0.045,
    targetPe: 24,
    targetEvEbit: 20,
    foaEbitMultiple: 21,
    realityLabsOptionValue: 20,
    aiRevenueUpliftPct: 0.06,
    aiIncrementalMargin: 0.55,
    exitPe: 24,
    dividendPerShare: 2.1,
    netCash: latestActual.netCash,
    dilutedShares: latestActual.dilutedShares,
    weightDcf: 0.35,
    weightFcfYield: 0.2,
    weightPe: 0.15,
    weightEvEbit: 0.1,
    weightSotp: 0.2,
  },
  Bull: {
    currentPrice: market.currentPrice,
    revenueGrowth2026: 0.25,
    revenueCagr2027To2030: 0.14,
    adImpressionCagr: 0.12,
    pricePerAdCagr: 0.06,
    foaOperatingMargin: 0.52,
    realityLabsAnnualLoss: 16,
    realityLabsRevenueGrowth: 0.14,
    realityLabsLossCagr: -0.08,
    regulatoryRevenueHaircut: 0.005,
    taxRate: 0.14,
    capex2026: 125,
    terminalCapexIntensity: 0.18,
    maintenanceCapexIntensity: 0.15,
    aiCapexShare: 0.52,
    depreciationSalesIntensity: 0.105,
    workingCapitalDragPctRevenueGrowth: 0.01,
    netInterestIncome: 1,
    annualDilutionFromSbc: 0.008,
    sbcExpensePctRevenue: 0.09,
    buybackYield: 0.02,
    buybackSpend2026: 45,
    wacc: 0.08,
    terminalGrowth: 0.035,
    targetFcfYield: 0.038,
    targetPe: 28,
    targetEvEbit: 23,
    foaEbitMultiple: 24,
    realityLabsOptionValue: 60,
    aiRevenueUpliftPct: 0.1,
    aiIncrementalMargin: 0.62,
    exitPe: 28,
    dividendPerShare: 2.1,
    netCash: latestActual.netCash,
    dilutedShares: latestActual.dilutedShares,
    weightDcf: 0.35,
    weightFcfYield: 0.2,
    weightPe: 0.15,
    weightEvEbit: 0.1,
    weightSotp: 0.2,
  },
};

export const defaultMetaValuationAssumptions = metaScenarioPresets.Base;
export const defaultMetaAssumptions = defaultMetaValuationAssumptions;

export const metaValuationAssumptionKeys = [
  "currentPrice",
  "revenueGrowth2026",
  "revenueCagr2027To2030",
  "adImpressionCagr",
  "pricePerAdCagr",
  "foaOperatingMargin",
  "realityLabsAnnualLoss",
  "realityLabsRevenueGrowth",
  "realityLabsLossCagr",
  "regulatoryRevenueHaircut",
  "taxRate",
  "capex2026",
  "terminalCapexIntensity",
  "maintenanceCapexIntensity",
  "aiCapexShare",
  "depreciationSalesIntensity",
  "workingCapitalDragPctRevenueGrowth",
  "netInterestIncome",
  "annualDilutionFromSbc",
  "sbcExpensePctRevenue",
  "buybackYield",
  "buybackSpend2026",
  "wacc",
  "terminalGrowth",
  "targetFcfYield",
  "targetPe",
  "targetEvEbit",
  "foaEbitMultiple",
  "realityLabsOptionValue",
  "aiRevenueUpliftPct",
  "aiIncrementalMargin",
  "exitPe",
  "dividendPerShare",
  "netCash",
  "dilutedShares",
  "weightDcf",
  "weightFcfYield",
  "weightPe",
  "weightEvEbit",
  "weightSotp",
] as const;

function assumptionLineageFor(key: keyof MetaValuationAssumptions) {
  if (key === "currentPrice") return metaLineage.marketSnapshot;
  if (["netCash", "dilutedShares", "dividendPerShare"].includes(key)) return metaLineage.q1_2026Actual;
  if (["capex2026", "taxRate"].includes(key)) return metaLineage.q1_2026Guidance;
  if (["adImpressionCagr", "pricePerAdCagr", "foaOperatingMargin", "depreciationSalesIntensity"].includes(key)) {
    return { ...metaLineage.derived, valuationTreatment: "forecast_anchor" as const };
  }
  return metaLineage.forecastAssumption;
}

function assumptionRoleFor(key: keyof MetaValuationAssumptions): MetaAssumptionMetadata["thesisRole"] {
  if (["targetFcfYield", "targetPe", "targetEvEbit", "foaEbitMultiple", "exitPe", "wacc", "terminalGrowth", "weightDcf", "weightFcfYield", "weightPe", "weightEvEbit", "weightSotp"].includes(key)) return "valuation_multiple";
  if (["annualDilutionFromSbc", "sbcExpensePctRevenue", "buybackYield", "buybackSpend2026", "dividendPerShare", "dilutedShares", "netCash"].includes(key)) return "capital_allocation";
  if (["taxRate", "depreciationSalesIntensity", "workingCapitalDragPctRevenueGrowth", "netInterestIncome"].includes(key)) return "accounting_bridge";
  if (["regulatoryRevenueHaircut", "realityLabsAnnualLoss", "realityLabsRevenueGrowth", "realityLabsLossCagr", "realityLabsOptionValue"].includes(key)) return "risk_control";
  return "core_driver";
}

export const metaAssumptionMetadata = Object.fromEntries(
  metaValuationAssumptionKeys.map((key) => {
    const lineage = assumptionLineageFor(key);
    const highSensitivity = [
      "revenueGrowth2026",
      "revenueCagr2027To2030",
      "pricePerAdCagr",
      "foaOperatingMargin",
      "capex2026",
      "terminalCapexIntensity",
      "wacc",
      "terminalGrowth",
    ].includes(key);
    return [
      key,
      {
        key,
        lineage,
        confidence: lineage.confidence,
        lastUpdated: lineage.asOfDate,
        source: lineage.sourceType === "manual_seed" ? "forecast_assumption" : lineage.sourceType,
        sensitivity: highSensitivity ? "high" : assumptionRoleFor(key) === "valuation_multiple" ? "medium" : "low",
        thesisRole: assumptionRoleFor(key),
        notes: `${key} is governed as ${lineage.sourceType} and treated as ${lineage.valuationTreatment}.`,
      },
    ];
  }),
) as Record<keyof MetaValuationAssumptions, MetaAssumptionMetadata>;

export const metaAssumptionDefinitions: ValuationAssumption[] = [
  { key: "currentPrice", label: "Current Price", value: defaultMetaValuationAssumptions.currentPrice, min: 300, max: 900, step: 1, format: "currency", source: "actual", description: "Dated META market price used for upside/downside and 3Y return analysis.", category: "Market", unit: "USD", periodicity: "annual", asOfDate: market.priceDate, provenance: market.source },
  { key: "revenueGrowth2026", label: "2026 Revenue Growth", value: defaultMetaValuationAssumptions.revenueGrowth2026, min: 0.05, max: 0.3, step: 0.005, format: "percent", source: "assumption", description: "Near-term growth anchored by Q1 actuals and Q2 revenue guidance.", category: "Ad Economics", unit: "percent", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: `${ASSUMPTION_NOTE}: triangulates Q1 2026 actuals, Q2 2026 guide, and ad impression / price growth.` },
  { key: "revenueCagr2027To2030", label: "2027-30 Revenue CAGR", value: defaultMetaValuationAssumptions.revenueCagr2027To2030, min: 0.02, max: 0.18, step: 0.005, format: "percent", source: "assumption", description: "Outer-year revenue CAGR after the 2026 AI ad and capex step-up.", category: "Ad Economics", unit: "percent", periodicity: "annual", provenance: `${ASSUMPTION_NOTE}: forecast driver, not management guidance.` },
  { key: "adImpressionCagr", label: "Ad Impression CAGR", value: defaultMetaValuationAssumptions.adImpressionCagr, min: 0, max: 0.18, step: 0.005, format: "percent", source: "assumption", description: "Ad impression growth driven by engagement, Reels, recommendations, and ad load.", category: "Ad Economics", unit: "percent", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: "official_actual: Q1 2026 ad impressions grew 19%; forecast fades from that anchor." },
  { key: "pricePerAdCagr", label: "Price / Ad CAGR", value: defaultMetaValuationAssumptions.pricePerAdCagr, min: -0.03, max: 0.1, step: 0.0025, format: "percent", source: "assumption", description: "Average price-per-ad growth from auction quality, conversion, advertiser ROAS, and macro ad cycle.", category: "Ad Economics", unit: "percent", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: "official_actual: Q1 2026 average price per ad grew 12%; forecast fades from that anchor." },
  { key: "foaOperatingMargin", label: "FoA Operating Margin", value: defaultMetaValuationAssumptions.foaOperatingMargin, min: 0.4, max: 0.56, step: 0.0025, format: "percent", source: "assumption", description: "Family of Apps operating margin before Reality Labs losses.", category: "Margins", unit: "percent", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: `official_actual: FY2025 FoA margin ${(102.469 / 198.759 * 100).toFixed(1)}%; Q1 2026 FoA margin ${(26.9 / 55.909 * 100).toFixed(1)}%.` },
  { key: "realityLabsAnnualLoss", label: "Reality Labs Loss", value: defaultMetaValuationAssumptions.realityLabsAnnualLoss, min: 8, max: 30, step: 0.25, format: "number", source: "assumption", description: "Annual Reality Labs operating loss included in consolidated EBIT and SOTP drag.", category: "Reality Labs", unit: "USD", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: "management_guidance: FY2026 losses expected in the same general range as FY2025." },
  { key: "realityLabsRevenueGrowth", label: "RL Revenue Growth", value: defaultMetaValuationAssumptions.realityLabsRevenueGrowth, min: -0.1, max: 0.25, step: 0.005, format: "percent", source: "assumption", description: "Reality Labs revenue growth path. It affects consolidated revenue but not FoA ad economics.", category: "Reality Labs", unit: "percent", periodicity: "annual", provenance: "forecast_assumption: Meta does not guide Reality Labs revenue by year." },
  { key: "realityLabsLossCagr", label: "RL Loss CAGR", value: defaultMetaValuationAssumptions.realityLabsLossCagr, min: -0.15, max: 0.12, step: 0.005, format: "percent", source: "assumption", description: "Outer-year change in Reality Labs operating loss.", category: "Reality Labs", unit: "percent", periodicity: "annual" },
  { key: "regulatoryRevenueHaircut", label: "Regulatory Revenue Haircut", value: defaultMetaValuationAssumptions.regulatoryRevenueHaircut, min: 0, max: 0.08, step: 0.0025, format: "percent", source: "assumption", description: "Revenue haircut for EU/privacy/platform risk applied through the ad forecast bridge.", category: "Ad Economics", unit: "percent", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: "management_guidance/research_only: EU risk monitored as a revenue-driver haircut, not a separate valuation score." },
  { key: "taxRate", label: "Tax Rate", value: defaultMetaValuationAssumptions.taxRate, min: 0.1, max: 0.24, step: 0.0025, format: "percent", source: "assumption", description: "Normalized cash tax rate used for NOPAT and EPS.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: "management_guidance: remainder-of-2026 expected tax rate of 13% to 16%." },
  { key: "capex2026", label: "2026 CapEx", value: defaultMetaValuationAssumptions.capex2026, min: 100, max: 170, step: 1, format: "number", source: "assumption", description: "FY2026 capex including principal payments on finance leases.", category: "CapEx / ROIC", unit: "USD", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: "management_guidance: FY2026 capex guide of USD 125bn to USD 145bn." },
  { key: "terminalCapexIntensity", label: "Terminal CapEx / Revenue", value: defaultMetaValuationAssumptions.terminalCapexIntensity, min: 0.12, max: 0.35, step: 0.005, format: "percent", source: "assumption", description: "Year-five capex intensity after the 2026 infrastructure step-up fades.", category: "CapEx / ROIC", unit: "percent", periodicity: "annual" },
  { key: "maintenanceCapexIntensity", label: "Maintenance CapEx / Revenue", value: defaultMetaValuationAssumptions.maintenanceCapexIntensity, min: 0.1, max: 0.25, step: 0.005, format: "percent", source: "assumption", description: "Maintenance capex threshold used to estimate AI growth capex and payback.", category: "CapEx / ROIC", unit: "percent", periodicity: "annual" },
  { key: "aiCapexShare", label: "AI Share of Growth CapEx", value: defaultMetaValuationAssumptions.aiCapexShare, min: 0.35, max: 0.85, step: 0.005, format: "percent", source: "assumption", description: "Share of capex above maintenance attributed to AI infrastructure. Meta does not disclose official AI-only capex.", category: "CapEx / ROIC", unit: "percent", periodicity: "annual" },
  { key: "depreciationSalesIntensity", label: "D&A / Revenue", value: defaultMetaValuationAssumptions.depreciationSalesIntensity, min: 0.07, max: 0.16, step: 0.0025, format: "percent", source: "derived", description: "Depreciation and amortization intensity used in FCFF.", category: "Cash Flow", unit: "percent", periodicity: "annual", asOfDate: DISCLOSURE_DATE, provenance: `derived: FY2025 D&A / revenue was ${(fy2025.depreciationAndAmortization / fy2025.revenue * 100).toFixed(1)}%; Q1 2026 annualized D&A / revenue was ${(latestActual.depreciationAndAmortization / latestActual.revenue * 100).toFixed(1)}%.` },
  { key: "workingCapitalDragPctRevenueGrowth", label: "WC Drag / Growth", value: defaultMetaValuationAssumptions.workingCapitalDragPctRevenueGrowth, min: 0, max: 0.08, step: 0.0025, format: "percent", source: "assumption", description: "Working capital investment as a percentage of incremental revenue.", category: "Cash Flow", unit: "percent", periodicity: "annual" },
  { key: "netInterestIncome", label: "Net Interest / Other", value: defaultMetaValuationAssumptions.netInterestIncome, min: -5, max: 5, step: 0.1, format: "number", source: "assumption", description: "Normalized annual net interest and other income used in EPS.", category: "Cash Flow", unit: "USD", periodicity: "annual" },
  { key: "annualDilutionFromSbc", label: "SBC Dilution", value: defaultMetaValuationAssumptions.annualDilutionFromSbc, min: 0, max: 0.03, step: 0.001, format: "percent", source: "assumption", description: "Gross annual share-count dilution from SBC before buybacks.", category: "Share Count", unit: "percent", periodicity: "annual" },
  { key: "sbcExpensePctRevenue", label: "SBC / Revenue", value: defaultMetaValuationAssumptions.sbcExpensePctRevenue, min: 0.05, max: 0.16, step: 0.0025, format: "percent", source: "assumption", description: "SBC expense as a percentage of revenue, shown for dilution and FCF quality audit.", category: "Share Count", unit: "percent", periodicity: "annual", provenance: "forecast_assumption: reconciled against official SBC history." },
  { key: "buybackYield", label: "Buyback Yield", value: defaultMetaValuationAssumptions.buybackYield, min: 0, max: 0.04, step: 0.001, format: "percent", source: "assumption", description: "Share-count reduction from repurchases. It affects EPS/share count only and is not added again to fair value.", category: "Share Count", unit: "percent", periodicity: "annual" },
  { key: "buybackSpend2026", label: "2026 Buyback Spend", value: defaultMetaValuationAssumptions.buybackSpend2026, min: 0, max: 70, step: 1, format: "number", source: "assumption", description: "Repurchase dollars used to audit whether buyback yield is feasible under the FCF path.", category: "Share Count", unit: "USD", periodicity: "annual", provenance: "forecast_assumption: capital-allocation bridge, not a separate valuation add-back." },
  { key: "wacc", label: "WACC", value: defaultMetaValuationAssumptions.wacc, min: 0.065, max: 0.11, step: 0.001, format: "percent", source: "assumption", description: "Discount rate for unlevered FCFF DCF and AI ROIC spread tests.", category: "Valuation", unit: "percent", periodicity: "annual" },
  { key: "terminalGrowth", label: "Terminal Growth", value: defaultMetaValuationAssumptions.terminalGrowth, min: 0.015, max: 0.04, step: 0.0005, format: "percent", source: "assumption", description: "Long-run nominal terminal growth.", category: "Valuation", unit: "percent", periodicity: "annual" },
  { key: "targetFcfYield", label: "Target FCF Yield", value: defaultMetaValuationAssumptions.targetFcfYield, min: 0.03, max: 0.07, step: 0.0005, format: "percent", source: "assumption", description: "Normalized FCF yield cross-check.", category: "Valuation", unit: "percent", periodicity: "forward annual" },
  { key: "targetPe", label: "Target P/E", value: defaultMetaValuationAssumptions.targetPe, min: 16, max: 34, step: 0.25, format: "multiple", source: "assumption", description: "Forward P/E cross-check on normalized EPS.", category: "Valuation", unit: "multiple", periodicity: "forward annual" },
  { key: "targetEvEbit", label: "Target EV / EBIT", value: defaultMetaValuationAssumptions.targetEvEbit, min: 12, max: 28, step: 0.25, format: "multiple", source: "assumption", description: "EV / EBIT cross-check on consolidated operating income.", category: "Valuation", unit: "multiple", periodicity: "forward annual" },
  { key: "foaEbitMultiple", label: "FoA EBIT Multiple", value: defaultMetaValuationAssumptions.foaEbitMultiple, min: 12, max: 30, step: 0.25, format: "multiple", source: "assumption", description: "Family of Apps SOTP multiple before Reality Labs option value and net cash.", category: "Valuation", unit: "multiple", periodicity: "forward annual" },
  { key: "realityLabsOptionValue", label: "RL Option Value", value: defaultMetaValuationAssumptions.realityLabsOptionValue, min: 0, max: 100, step: 1, format: "number", source: "assumption", description: "Reality Labs call-option equity value in SOTP only. Consolidated DCF and P/E already include the loss drag.", category: "Reality Labs", unit: "USD", periodicity: "annual" },
  { key: "aiRevenueUpliftPct", label: "AI Revenue Uplift", value: defaultMetaValuationAssumptions.aiRevenueUpliftPct, min: 0, max: 0.15, step: 0.0025, format: "percent", source: "assumption", description: "Revenue uplift used for AI payback diagnostics. It is already embedded through revenue and margin forecasts, not separately added to base fair value.", category: "CapEx / ROIC", unit: "percent", periodicity: "annual" },
  { key: "aiIncrementalMargin", label: "AI Incremental Margin", value: defaultMetaValuationAssumptions.aiIncrementalMargin, min: 0.3, max: 0.75, step: 0.005, format: "percent", source: "assumption", description: "After-cost margin on AI-driven incremental ad revenue for payback and excess-return diagnostics.", category: "CapEx / ROIC", unit: "percent", periodicity: "annual" },
  { key: "exitPe", label: "3Y Exit P/E", value: defaultMetaValuationAssumptions.exitPe, min: 16, max: 34, step: 0.25, format: "multiple", source: "assumption", description: "Exit multiple for three-year target price.", category: "Return", unit: "multiple", periodicity: "forward annual" },
  { key: "dividendPerShare", label: "Dividend / Share", value: defaultMetaValuationAssumptions.dividendPerShare, min: 0, max: 5, step: 0.05, format: "currency", source: "actual", description: "Annualized dividend per share used in 3Y return.", category: "Return", unit: "USD", periodicity: "annual", asOfDate: market.priceDate, provenance: "market_data: annualized dividend assumption from dated market snapshot." },
  { key: "netCash", label: "Net Cash", value: defaultMetaValuationAssumptions.netCash, min: -40, max: 80, step: 0.5, format: "number", source: "actual", description: "Cash and marketable securities less long-term debt.", category: "Balance Sheet", unit: "USD", periodicity: "quarterly", asOfDate: DISCLOSURE_DATE, provenance: "official_actual: Q1 2026 cash and securities less long-term debt." },
  { key: "dilutedShares", label: "Diluted Shares", value: defaultMetaValuationAssumptions.dilutedShares, min: 2.2, max: 2.9, step: 0.005, format: "number", source: "actual", description: "Diluted shares in billions.", category: "Share Count", unit: "share", periodicity: "quarterly", asOfDate: DISCLOSURE_DATE, provenance: "official_actual: Q1 2026 diluted shares." },
  { key: "weightDcf", label: "DCF Weight", value: defaultMetaValuationAssumptions.weightDcf, min: 0.05, max: 0.6, step: 0.01, format: "percent", source: "assumption", description: "DCF weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
  { key: "weightFcfYield", label: "FCF Yield Weight", value: defaultMetaValuationAssumptions.weightFcfYield, min: 0.05, max: 0.45, step: 0.01, format: "percent", source: "assumption", description: "FCF yield weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
  { key: "weightPe", label: "P/E Weight", value: defaultMetaValuationAssumptions.weightPe, min: 0.05, max: 0.4, step: 0.01, format: "percent", source: "assumption", description: "P/E weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
  { key: "weightEvEbit", label: "EV / EBIT Weight", value: defaultMetaValuationAssumptions.weightEvEbit, min: 0.05, max: 0.35, step: 0.01, format: "percent", source: "assumption", description: "EV / EBIT weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
  { key: "weightSotp", label: "SOTP Weight", value: defaultMetaValuationAssumptions.weightSotp, min: 0.05, max: 0.4, step: 0.01, format: "percent", source: "assumption", description: "SOTP weight in blended fair value.", category: "Blend", unit: "percent", periodicity: "annual" },
];

export const metaScenarioDefaults = metaScenarioPresets;

export function getMetaScenarioDefaults(scenario: Scenario) {
  return metaScenarioPresets[scenario];
}

export function matchMetaScenario(values: MetaValuationAssumptions): Scenario | "Custom" {
  const scenarios = Object.entries(metaScenarioPresets) as Array<[Scenario, MetaValuationAssumptions]>;
  for (const [scenario, defaults] of scenarios) {
    const same = metaValuationAssumptionKeys.every((key) => Math.abs(values[key] - defaults[key]) < 0.0001);
    if (same) return scenario;
  }
  return "Custom";
}
