import { createServer } from "vite";
import { AMZN_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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

function sourceStatus(sourceType) {
  if (sourceType === "official_actual") return "official_actual";
  if (sourceType === "market_data") return "market_data";
  if (sourceType === "transcript_commentary") return "transcript_commentary";
  if (sourceType === "forecast_assumption") return "forecast_assumption";
  return "research_only";
}

function mapFinancial(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    id: row.periodId,
    label: raw.quarter?.label ?? row.fiscalPeriod ?? `${row.fiscalYear} ${row.fiscalQuarter ?? ""}`.trim(),
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    periodType: row.periodType,
    sourceStatus: sourceStatus(row.sourceType),
    sourceId: row.eventId ?? row.id,
    revenue: row.revenue ?? 0,
    operatingIncome: row.operatingIncome ?? 0,
    operatingMargin: row.operatingMargin ?? (row.revenue ? row.operatingIncome / row.revenue : 0),
    netIncome: row.netIncome,
    dilutedEps: row.dilutedEps,
    dilutedShares: row.dilutedShares,
    operatingCashFlow: row.operatingCashFlow,
    capex: row.capex,
    equipmentFinanceLeases: row.equipmentFinanceLeases,
    freeCashFlow: row.freeCashFlow,
    stockBasedCompensation: row.stockBasedCompensation,
    cashAndMarketableSecurities: row.cashAndMarketableSecurities,
    debt: row.debt,
    netDebt: row.netDebt,
    fulfillmentCost: row.fulfillmentCost,
    shippingCost: row.shippingCost,
    technologyAndContentExpense: row.technologyAndContentExpense,
    notes: raw.sourceDiscipline ?? "AMZN backend financial row.",
  };
}

function mapSegment(row) {
  return {
    periodId: row.periodId,
    segment: row.segment,
    sourceStatus: sourceStatus(row.sourceType),
    revenue: row.revenue ?? 0,
    operatingIncome: row.operatingIncome ?? 0,
    operatingMargin: row.operatingMargin ?? (row.revenue ? row.operatingIncome / row.revenue : 0),
    revenueGrowth: row.revenueGrowth,
    notes: row.notes,
  };
}

function mapOperatingMetric(row) {
  return {
    periodId: row.periodId,
    sourceStatus: sourceStatus(row.sourceType),
    awsGrowth: row.awsGrowth,
    advertisingGrowth: row.advertisingGrowth,
    capexIntensity: row.capexIntensity,
    reportedFcf: row.reportedFcf,
    normalizedFcf: row.normalizedFcf,
    fcfConversion: row.fcfConversion,
    paidUnitsGrowth: row.paidUnitsGrowth,
    primeSubscriptionIndicator: row.primeSubscriptionIndicator,
    awsBacklog: row.awsBacklog,
    retailMarginBridge: row.retailMarginBridge ?? "Research-only retail margin bridge.",
    aiCommentary: row.aiCommentary ?? "AI commentary not imported for this event.",
    projectKuiperCommentary: row.projectKuiperCommentary ?? "Kuiper commentary not imported for this event.",
  };
}

function buildDatasetFromSnapshot(snapshot, selectedFinancial) {
  const financials = [...(snapshot?.financialPeriods ?? [])].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const periodRows = financials.map(mapFinancial);
  const selectedPeriodId = selectedFinancial?.periodId ?? periodRows[periodRows.length - 1]?.id;
  const market = snapshot?.marketSnapshot ?? {};
  return {
    marketData: {
      currentPrice: market.currentPrice ?? selectedFinancial?.currentPrice ?? 0,
      priceDate: market.priceDate ?? market.asOfDate ?? snapshot?.asOfDate,
      sharesOutstanding: selectedFinancial?.dilutedShares ?? market.sharesOutstanding ?? 10_500,
      currency: "USD",
      source: market.source ?? "AMZN backend market snapshot",
      sourceStatus: "market_data",
    },
    periods: periodRows,
    segments: (snapshot?.segmentFinancials ?? []).map(mapSegment),
    operatingMetrics: (snapshot?.operatingMetricSnapshots ?? []).map(mapOperatingMetric),
    sourceNotes: [
      "Backend adapter maps SQLite rows into the AMZN frontend valuation formula path.",
      "Consolidated financial actuals are SEC Companyfacts when sourceType=official_actual.",
      "Segment, business-unit, advertising, Prime, and AWS allocation rows remain research_only until official segment tables are imported.",
    ],
    selectedPeriodId,
  };
}

export function buildAmznBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = AMZN_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "AMZN",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "AMZN backend adapter maps SQLite reporting-event snapshots into the AMZN frontend valuation engine.",
      "Historical runs use event-dated assumption sets and snapshot rows with asOfDate on or before the event date.",
      "Segment, business-unit, advertising, Prime, AWS allocation scaffolds are research-only unless official segment tables are imported.",
      "Transcript and guidance candidates are not valuation-impacting unless explicitly promoted after review.",
      "Project Kuiper optionality is zero before public-period availability and is event-dated thereafter.",
    ],
  };
}

export async function runAmznBackendValuation(input) {
  const payload = buildAmznBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/amzn/calculations.ts");
    const selectedFinancial = selectValuationFinancial(payload.snapshot);
    const backendDataset = buildDatasetFromSnapshot(payload.snapshot, selectedFinancial);
    const valuation = calculations.calculateAmznValuation(
      backendDataset,
      {
        ...payload.assumptions,
        currentPrice: backendDataset.marketData.currentPrice,
        dilutedShares: selectedFinancial?.dilutedShares ?? backendDataset.marketData.sharesOutstanding,
        netDebt: selectedFinancial?.netDebt ?? payload.assumptions?.netDebt,
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
        businessUnitFinancialCount: payload.snapshot?.businessUnitFinancials?.length ?? 0,
        operatingMetricCount: payload.snapshot?.operatingMetricSnapshots?.length ?? 0,
        marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
        valuationPeriodId: selectedFinancial?.periodId ?? null,
        priceDate: backendDataset.marketData.priceDate,
        asOfAssumptionOverrides: payload.assumptions,
        financialPeriodAsOfDates: (payload.snapshot?.financialPeriods ?? []).map((row) => row.asOfDate),
        segmentAsOfDates: (payload.snapshot?.segmentFinancials ?? []).map((row) => row.asOfDate),
        businessUnitAsOfDates: (payload.snapshot?.businessUnitFinancials ?? []).map((row) => row.asOfDate),
        operatingMetricAsOfDates: (payload.snapshot?.operatingMetricSnapshots ?? []).map((row) => row.asOfDate),
        adapterWarnings: payload.adapterWarnings,
      },
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `amzn-backend-adapter-gap-${index + 1}`,
          title: "AMZN backend adapter note",
          detail,
          severity: "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}
