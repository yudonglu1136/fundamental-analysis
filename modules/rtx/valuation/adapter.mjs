import { createServer } from "vite";
import { RTX_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

let frontendValuationModulesPromise = null;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latestByAsOf(rows = []) {
  return [...rows]
    .filter((row) => row?.asOfDate)
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)))
    .at(-1) ?? null;
}

function eventFinancial(snapshot) {
  const eventId = snapshot.reportingEvent?.id;
  return (snapshot.financialPeriods ?? []).find((row) => row.eventId === eventId) ?? latestByAsOf(snapshot.financialPeriods ?? []);
}

function eventSegments(snapshot) {
  const eventId = snapshot.reportingEvent?.id;
  return (snapshot.segmentFinancials ?? []).filter((row) => row.eventId === eventId);
}

function annualizeFinancial(row) {
  const isQuarter = row?.periodType === "quarter";
  const multiplier = isQuarter ? 4 : 1;
  const totalRevenue = finite(row?.totalRevenue);
  const adjustedOperatingProfit = finite(row?.adjustedOperatingProfit, finite(row?.operatingProfit, totalRevenue * 0.1));
  const operatingMargin = totalRevenue ? adjustedOperatingProfit / totalRevenue : finite(row?.operatingMargin, 0.1);
  const freeCashFlow = finite(row?.freeCashFlow, totalRevenue * 0.07);
  const capex = finite(row?.capex, totalRevenue * 0.03);
  const adjustedEps = finite(row?.adjustedEps, 0) * multiplier;
  return {
    id: "backend-asof-run-rate",
    label: `${row?.periodId ?? "event"} event-visible run-rate`,
    fiscalYear: finite(row?.fiscalYear, 2026),
    periodType: "FY",
    sourceStatus: row?.sourceType ?? "research_only",
    sourceId: row?.eventId ?? row?.id,
    sales: totalRevenue * multiplier,
    adjustedSales: finite(row?.adjustedSales, totalRevenue) * multiplier,
    organicSales: row?.organicSales == null ? undefined : finite(row.organicSales) * multiplier,
    operatingProfit: finite(row?.operatingProfit, adjustedOperatingProfit) * multiplier,
    adjustedOperatingProfit: adjustedOperatingProfit * multiplier,
    adjustedEps,
    gaapEps: finite(row?.gaapEps, adjustedEps / multiplier) * multiplier,
    freeCashFlow: freeCashFlow * multiplier,
    operatingCashFlow: finite(row?.operatingCashFlow, freeCashFlow + capex) * multiplier,
    capex: capex * multiplier,
    backlog: finite(row?.backlog, totalRevenue * multiplier * 2.5),
    orderIntake: row?.defenseBookings == null ? undefined : finite(row.defenseBookings) * multiplier,
    orderIntakeSourceStatus: row?.defenseBookings == null ? "missing" : row?.sourceType ?? "research_only",
    backlogCommercial: row?.backlogCommercial == null ? undefined : finite(row.backlogCommercial),
    backlogDefense: row?.backlogDefense == null ? undefined : finite(row.backlogDefense),
    netIncome: finite(row?.netIncome, adjustedOperatingProfit * 0.78) * multiplier,
    dilutedShares: finite(row?.dilutedShares, 1350),
    dividendPerShare: isQuarter ? finite(row?.dividendPerShare, 0.68) * 4 : finite(row?.dividendPerShare, 2.72),
    notes: row?.notes ?? "Backend event-visible RTX financial row.",
    backendSource: {
      id: row?.id,
      eventId: row?.eventId,
      asOfDate: row?.asOfDate,
      sourceType: row?.sourceType,
      annualizedFromQuarter: isQuarter,
      annualizationMultiplier: multiplier,
      rawJson: parseJson(row?.rawJson, {}),
    },
  };
}

function mapSegments(rows, sourcePeriodType) {
  const multiplier = sourcePeriodType === "quarter" ? 4 : 1;
  return rows.map((row) => {
    const sales = finite(row.revenue);
    const operatingProfit = finite(row.operatingProfit, sales * finite(row.operatingMargin, 0.1));
    return {
      id: row.segment.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: row.segment,
      sourceStatus: row.sourceType ?? "research_only",
      sourceId: row.eventId ?? row.id,
      sales: sales * multiplier,
      operatingProfit: operatingProfit * multiplier,
      margin: sales ? operatingProfit / sales : finite(row.operatingMargin, 0.1),
      backlog: row.backlog == null ? undefined : finite(row.backlog),
      growth: row.organicSales && sales ? row.organicSales / sales - 1 : undefined,
      strategicRole: row.legacySegmentMapping ?? row.notes ?? "Backend event-visible RTX segment row.",
      keyPrograms: row.segment === "Raytheon"
        ? ["Patriot", "GEM-T", "Missile defense", "Naval munitions"]
        : row.segment === "Pratt & Whitney"
          ? ["GTF", "F135", "Commercial aftermarket"]
          : row.segment === "Collins Aerospace"
            ? ["Commercial aerospace", "Defense electronics"]
            : ["Legacy segment mapping"],
      risks: row.segment === "Pratt & Whitney"
        ? ["GTF powder-metal inspections", "Shop-visit timing", "Engine deliveries"]
        : row.taxonomy === "legacy_utx"
          ? ["Pre-merger comparability"]
          : ["Supply chain", "Program execution"],
      backendSource: {
        id: row.id,
        eventId: row.eventId,
        asOfDate: row.asOfDate,
        sourceType: row.sourceType,
        taxonomy: row.taxonomy,
        rawJson: parseJson(row.rawJson, {}),
      },
    };
  });
}

function mapMarket(baseMarket, market, financial) {
  const currentPrice = finite(market?.currentPrice, baseMarket.price);
  const shares = finite(market?.sharesOutstanding, financial.dilutedShares);
  const marketCap = finite(market?.marketCap, currentPrice * shares);
  return {
    ...baseMarket,
    sourceStatus: "market_data",
    sourceId: market?.id ?? baseMarket.sourceId,
    price: currentPrice,
    currentPrice,
    priceDate: market?.priceDate ?? market?.asOfDate ?? baseMarket.priceDate,
    shares,
    sharesForMarketCap: shares,
    marketCap,
    enterpriseValue: finite(market?.enterpriseValue, marketCap + finite(financial.backendSource?.rawJson?.netDebt, 0)),
    dividendYield: financial.dividendPerShare / Math.max(currentPrice, 0.01),
    notes: "Backend event-visible market snapshot. Daily adjusted close is applied by the valuation service when available.",
    backendSource: {
      id: market?.id,
      eventId: market?.eventId,
      asOfDate: market?.asOfDate,
      priceDate: market?.priceDate,
      sourceType: market?.sourceType,
      rawJson: parseJson(market?.rawJson, {}),
    },
  };
}

function guidanceFromFinancial(financial, assumptions, snapshot) {
  const sales = financial.sales;
  const revenueCagr = finite(assumptions.revenueCagr, 0.04);
  const eps = finite(financial.adjustedEps, sales * finite(assumptions.operatingMargin, 0.1) * 0.78 / Math.max(financial.dilutedShares, 1));
  const fcf = finite(financial.freeCashFlow, sales * 0.07);
  return {
    year: financial.fiscalYear + 1,
    sourceStatus: "forecast_assumption",
    sourceId: `${snapshot.reportingEvent?.id ?? "rtx"}-event-guidance-proxy`,
    salesLow: sales * (1 + revenueCagr * 0.75),
    salesHigh: sales * (1 + revenueCagr * 1.2),
    epsLow: eps * (1 + revenueCagr * 0.45),
    epsHigh: eps * (1 + revenueCagr * 0.95),
    fcfLow: fcf * (1 + revenueCagr * 0.35),
    fcfHigh: fcf * (1 + revenueCagr * 0.9),
    notes: "Event-visible forecast-assumption guidance proxy. guidance_items remain non-promoted unless separately reviewed.",
  };
}

function buildAsOfAssumptionOverrides(financialRow, financial, market, baseAssumptions, scenario) {
  const sales = Math.max(financial.sales, 1);
  const margin = clamp(finite(financialRow?.adjustedOperatingProfit, financial.adjustedOperatingProfit) / Math.max(finite(financialRow?.totalRevenue, sales), 1), 0.04, 0.16);
  const fcfMargin = financial.freeCashFlow / sales;
  const backlogCoverage = financial.backlog / sales;
  const year = finite(financial.fiscalYear, 2026);
  const maturity = clamp((year - 2018) / 8, 0, 1);
  const scenarioBias = scenario === "Bull" ? 0.006 : scenario === "Bear" ? -0.006 : 0;
  const gtfCharge = finite(financialRow?.gtfInspectionCharges, 0);
  const gtfPenalty = gtfCharge > 0 ? 0.006 : 0;
  return {
    currentPrice: market.currentPrice ?? market.price,
    revenueCagr: clamp(finite(baseAssumptions.revenueCagr, 0.045) + (backlogCoverage - 2.4) * 0.002 + scenarioBias, 0.005, 0.08),
    operatingMargin: clamp(finite(baseAssumptions.operatingMargin, margin) * 0.35 + margin * 0.65 - gtfPenalty, 0.055, 0.15),
    targetFcfYield: clamp(finite(baseAssumptions.targetFcfYield, 0.04) + (0.07 - fcfMargin) * 0.12 + (1 - maturity) * 0.006 + gtfPenalty, 0.032, 0.075),
    targetPe: clamp(finite(baseAssumptions.targetPe, 22) + (margin - 0.1) * 30 - (1 - maturity) * 3 - gtfPenalty * 70, 12, 30),
    targetEvEbit: clamp(finite(baseAssumptions.targetEvEbit, 20) + (margin - 0.1) * 24 - (1 - maturity) * 2.6 - gtfPenalty * 60, 10, 27),
    netDebt: finite(financialRow?.netDebt, 0),
    dilutedShares: financial.dilutedShares,
    dividendPerShare: financial.dividendPerShare,
    capexIntensity: clamp(finite(financialRow?.capex, 0) / Math.max(finite(financialRow?.totalRevenue, sales), 1), 0.018, 0.06),
    workingCapitalDragPctRevenueGrowth: clamp(finite(baseAssumptions.workingCapitalDragPctRevenueGrowth, 0.1) + Math.max(0, 0.075 - fcfMargin) * 0.5, 0.08, 0.2),
    backlogDurabilityMaxAdjustment: clamp(finite(baseAssumptions.backlogDurabilityMaxAdjustment, 0.08) * (0.45 + maturity * 0.55), 0.025, 0.1),
  };
}

function buildRowUsage(snapshot) {
  const tableRows = {
    financial_periods: snapshot.financialPeriods ?? [],
    segment_financials: snapshot.segmentFinancials ?? [],
    market_snapshots: snapshot.marketSnapshot ? [snapshot.marketSnapshot] : [],
    guidance_items: snapshot.guidanceItems ?? [],
    transcript_events: snapshot.transcriptEvents ?? [],
    transcript_extractions: snapshot.transcriptExtractions ?? [],
  };
  return Object.fromEntries(Object.entries(tableRows).map(([table, rows]) => [
    table,
    rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      asOfDate: row.asOfDate ?? row.eventDate,
      sourceType: row.sourceType,
      modelReady: row.modelReady,
      valuationImpactAllowed: row.valuationImpactAllowed,
    })),
  ]));
}

function buildDatasetFromSnapshot(baseDataset, snapshot, assumptions, scenario) {
  const financialRow = eventFinancial(snapshot);
  if (!financialRow) {
    throw new Error("RTX backend snapshot has no financial_periods row for valuation.");
  }
  const financial = annualizeFinancial(financialRow);
  const segments = mapSegments(eventSegments(snapshot), financialRow.periodType);
  const market = mapMarket(baseDataset.marketData, snapshot.marketSnapshot, financial);
  const asOfAssumptionOverrides = buildAsOfAssumptionOverrides(financialRow, financial, market, assumptions, scenario);
  const mergedAssumptions = {
    ...baseDataset.assumptions,
    ...assumptions,
    ...asOfAssumptionOverrides,
  };
  const dataset = cloneJson(baseDataset);
  dataset.periods = [financial];
  dataset.segments = segments.length ? segments : [];
  dataset.guidance = guidanceFromFinancial(financial, mergedAssumptions, snapshot);
  dataset.marketData = market;
  dataset.latestReportingPeriod = snapshot.reportingEvent?.fiscalPeriod ?? financial.label;
  dataset.assumptions = {
    ...dataset.assumptions,
    ...mergedAssumptions,
  };
  return { dataset, financial, financialRow, segments, market, asOfAssumptionOverrides };
}

async function loadFrontendValuationModules() {
  if (!frontendValuationModulesPromise) {
    frontendValuationModulesPromise = (async () => {
      const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
      try {
        const calculations = await server.ssrLoadModule("/src/stocks/defensePrime/calculations.ts");
        const dataModule = await server.ssrLoadModule("/src/stocks/rtx/data.ts");
        return {
          calculateDefenseValuation: calculations.calculateDefenseValuation,
          baseDataset: cloneJson(dataModule.rtxData),
        };
      } finally {
        await server.close();
      }
    })().catch((error) => {
      frontendValuationModulesPromise = null;
      throw error;
    });
  }
  return frontendValuationModulesPromise;
}

export function buildRtxBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = RTX_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "RTX",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "RTX backend adapter maps SQLite reporting-event snapshots into the existing defense-prime frontend valuation engine.",
      "Pre-2020 legacy United Technologies rows are research-only continuity rows and are not treated as current RTX segment actuals.",
      "Historical runs replace the static current RTX FY2025/Q1 2026 baseline with event-visible annualized financial rows.",
      "Guidance and transcript candidates remain non-promoted unless modelReady and valuationImpactAllowed are explicitly reviewed.",
      "No RTX valuation formula is duplicated or intentionally changed by the backend adapter.",
    ],
  };
}

export async function runRtxBackendValuation(input) {
  const payload = buildRtxBackendValuationPayload(input);
  const { calculateDefenseValuation, baseDataset } = await loadFrontendValuationModules();
  const { dataset, financial, financialRow, segments, market, asOfAssumptionOverrides } = buildDatasetFromSnapshot(
    baseDataset,
    payload.snapshot,
    payload.assumptions,
    payload.scenario,
  );
  const valuation = calculateDefenseValuation(dataset, payload.scenario, {
    ...payload.assumptions,
    ...asOfAssumptionOverrides,
  });
  return {
    ...valuation,
    backendModelVersion: payload.modelVersion,
    backendSnapshot: {
      asOfDate: payload.asOfDate,
      reportingEventId: payload.reportingEventId,
      financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
      segmentFinancialCount: payload.snapshot?.segmentFinancials?.length ?? 0,
      guidanceItemCount: payload.snapshot?.guidanceItems?.length ?? 0,
      transcriptExtractionCount: payload.snapshot?.transcriptExtractions?.length ?? 0,
      marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
      valuationPeriodId: financialRow?.periodId ?? null,
      priceDate: market.priceDate,
      annualizedSales: financial.sales,
      sourceType: financialRow?.sourceType ?? null,
      segmentTaxonomy: [...new Set(segments.map((row) => row.backendSource?.taxonomy).filter(Boolean))],
      gtfInspectionCharges: finite(financialRow?.gtfInspectionCharges, 0),
      gtfCashImpact: finite(financialRow?.gtfCashImpact, 0),
      asOfAssumptionOverrides,
      rowUsage: buildRowUsage(payload.snapshot),
      adapterWarnings: payload.adapterWarnings,
    },
    validationWarnings: [
      ...(valuation.validationWarnings ?? []),
      ...payload.adapterWarnings.map((detail, index) => ({
        id: `rtx-backend-adapter-gap-${index + 1}`,
        title: "RTX backend adapter gap",
        detail,
        severity: "low",
      })),
    ],
  };
}
