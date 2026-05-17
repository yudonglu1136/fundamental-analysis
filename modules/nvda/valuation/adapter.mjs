import { createServer } from "vite";
import { NVDA_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sourceStatus(sourceType) {
  if (sourceType === "official_actual") return "official_actual";
  if (sourceType === "market_data" || String(sourceType ?? "").startsWith("market_data")) return "market_data";
  if (sourceType === "management_guidance") return "management_guidance";
  if (sourceType === "forecast_assumption") return "forecast_assumption";
  if (sourceType === "transcript_commentary") return "transcript_commentary";
  return "research_only";
}

function latestByAsOfDate(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  return sorted[sorted.length - 1] ?? null;
}

function selectValuationFinancial(snapshot) {
  const financials = snapshot?.financialPeriods ?? [];
  const eventId = snapshot?.reportingEvent?.id;
  return financials.find((row) => row.eventId === eventId) ?? latestByAsOfDate(financials);
}

function mapFinancial(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    id: row.periodId,
    label: `FY${String(row.fiscalYear).slice(2)} ${row.fiscalQuarter}`,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    periodType: row.periodType ?? "quarter",
    sourceStatus: sourceStatus(row.sourceType),
    revenue: row.revenue ?? 0,
    grossProfit: row.grossProfit ?? 0,
    grossMargin: row.grossMargin ?? (row.revenue ? row.grossProfit / row.revenue : 0),
    operatingIncome: row.operatingIncome ?? 0,
    operatingMargin: row.operatingMargin ?? (row.revenue ? row.operatingIncome / row.revenue : 0),
    netIncome: row.netIncome,
    dilutedEps: row.dilutedEps,
    dilutedShares: row.dilutedShares,
    operatingCashFlow: row.operatingCashFlow,
    capex: row.capex,
    freeCashFlow: row.freeCashFlow,
    inventory: row.inventory,
    accountsReceivable: row.accountsReceivable,
    deferredRevenue: row.deferredRevenue,
    cashAndMarketableSecurities: row.cashAndMarketableSecurities,
    debt: row.debt,
  };
}

function mapSegment(row) {
  return {
    periodId: row.periodId,
    segment: row.segment,
    sourceStatus: sourceStatus(row.sourceType),
    revenue: row.revenue ?? 0,
    growth: row.growth,
    grossMargin: row.grossMargin,
    notes: row.notes,
  };
}

function mapOperatingMetric(row) {
  return {
    periodId: row.periodId,
    sourceStatus: sourceStatus(row.sourceType),
    dataCenterRevenue: row.dataCenterRevenue,
    gamingRevenue: row.gamingRevenue,
    networkingRevenue: row.networkingRevenue,
    computeRevenue: row.computeRevenue,
    dataCenterGrowth: row.dataCenterGrowth,
    gamingGrowth: row.gamingGrowth,
    grossMargin: row.grossMargin,
    operatingMargin: row.operatingMargin,
    inventory: row.inventory,
    fcfConversion: row.fcfConversion,
    productCyclePhase: row.productCyclePhase,
    acceleratorMoatScore: row.acceleratorMoatScore,
    chinaRiskScore: row.chinaRiskScore,
    supplyConstraintScore: row.supplyConstraintScore,
  };
}

function buildDatasetFromSnapshot(snapshot, selectedFinancial) {
  const periods = [...(snapshot?.financialPeriods ?? [])]
    .sort((left, right) => {
      const yearOrder = (left.fiscalYear ?? 0) - (right.fiscalYear ?? 0);
      if (yearOrder !== 0) return yearOrder;
      return String(left.fiscalQuarter ?? "").localeCompare(String(right.fiscalQuarter ?? ""));
    })
    .map(mapFinancial);
  const selectedPeriodId = selectedFinancial?.periodId ?? periods[periods.length - 1]?.id;
  const market = snapshot?.marketSnapshot ?? {};
  return {
    marketData: {
      currentPrice: market.currentPrice ?? selectedFinancial?.currentPrice ?? 0,
      priceDate: market.priceDate ?? market.asOfDate ?? snapshot?.asOfDate,
      sharesOutstanding: selectedFinancial?.dilutedShares ?? market.sharesOutstanding ?? 24_500,
      currency: "USD",
      source: market.source ?? "NVDA backend market snapshot",
      sourceStatus: sourceStatus(market.sourceType ?? "market_data"),
    },
    periods,
    segments: (snapshot?.segmentFinancials ?? []).map(mapSegment),
    operatingMetrics: (snapshot?.operatingMetricSnapshots ?? []).map(mapOperatingMetric),
    sourceNotes: [
      "Backend adapter maps NVDA SQLite reporting-event snapshots into the NVDA frontend valuation engine.",
      "Consolidated financial actuals are SEC Companyfacts when sourceType=official_actual.",
      "Segment/product/supply-chain rows remain research_only unless official platform tables are imported.",
      "Historical runs use rows with asOfDate on or before the event date only.",
    ],
    selectedPeriodId,
  };
}

export function buildNvdaBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = NVDA_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "NVDA",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "NVDA backend adapter maps SQLite event snapshots into the NVDA frontend valuation engine.",
      "Historical valuation runs use event-dated assumption sets and DB rows available on or before the reporting event date.",
      "Segment/product/supply-chain rows are research-only unless official disclosures are imported and promoted.",
      "Blackwell, Rubin, China export-control, and CoWoS assumptions are gated by event date to avoid future leakage.",
    ],
  };
}

export async function runNvdaBackendValuation(input) {
  const payload = buildNvdaBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/nvda/calculations.ts");
    const selectedFinancial = selectValuationFinancial(payload.snapshot);
    const backendDataset = buildDatasetFromSnapshot(payload.snapshot, selectedFinancial);
    const valuation = calculations.calculateNvdaValuation(
      backendDataset,
      {
        ...payload.assumptions,
        currentPrice: backendDataset.marketData.currentPrice,
        dilutedShares: selectedFinancial?.dilutedShares ?? backendDataset.marketData.sharesOutstanding,
        netCash: (selectedFinancial?.cashAndMarketableSecurities ?? 0) - (selectedFinancial?.debt ?? 0),
      },
      payload.scenario,
    );
    return {
      ...valuation,
      backendModelVersion: payload.modelVersion,
      backendSnapshot: {
        asOfDate: payload.asOfDate,
        reportingEventId: payload.reportingEventId,
        financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
        segmentFinancialCount: payload.snapshot?.segmentFinancials?.length ?? 0,
        productFinancialCount: payload.snapshot?.productFinancials?.length ?? 0,
        operatingMetricCount: payload.snapshot?.operatingMetricSnapshots?.length ?? 0,
        customerSnapshotCount: payload.snapshot?.customerEndMarketSnapshots?.length ?? 0,
        supplyChainSnapshotCount: payload.snapshot?.supplyChainSnapshots?.length ?? 0,
        marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
        valuationPeriodId: selectedFinancial?.periodId ?? null,
        priceDate: backendDataset.marketData.priceDate,
        asOfAssumptionOverrides: payload.assumptions,
        financialPeriodAsOfDates: (payload.snapshot?.financialPeriods ?? []).map((row) => row.asOfDate),
        segmentAsOfDates: (payload.snapshot?.segmentFinancials ?? []).map((row) => row.asOfDate),
        productAsOfDates: (payload.snapshot?.productFinancials ?? []).map((row) => row.asOfDate),
        operatingMetricAsOfDates: (payload.snapshot?.operatingMetricSnapshots ?? []).map((row) => row.asOfDate),
        customerEndMarketAsOfDates: (payload.snapshot?.customerEndMarketSnapshots ?? []).map((row) => row.asOfDate),
        supplyChainAsOfDates: (payload.snapshot?.supplyChainSnapshots ?? []).map((row) => row.asOfDate),
        adapterWarnings: payload.adapterWarnings,
      },
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `nvda-backend-adapter-note-${index + 1}`,
          title: "NVDA backend adapter note",
          detail,
          severity: "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}
