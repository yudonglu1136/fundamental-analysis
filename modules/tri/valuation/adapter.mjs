import { createServer } from "vite";
import { TRI_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

let viteContextPromise = null;

async function loadTriFrontendContext() {
  if (!viteContextPromise) {
    viteContextPromise = (async () => {
      const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
      const calculations = await server.ssrLoadModule("/src/stocks/tri/calculations.ts");
      const dataModule = await server.ssrLoadModule("/src/stocks/tri/data.ts");
      return { server, calculations, dataModule };
    })();
  }
  return viteContextPromise;
}

export async function closeTriBackendValuationAdapter() {
  if (!viteContextPromise) return;
  const context = await viteContextPromise;
  await context.server.close();
  viteContextPromise = null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => typeof value === "number" && Number.isFinite(value)));
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
  const eventMatched = financials
    .filter((row) => row.eventId === eventId)
    .sort((left, right) => {
      const score = (row) =>
        (row.sourceType === "official_actual" ? 100 : 0) +
        (row.periodType === "annual" ? 25 : 0) +
        (row.periodType === "quarter" ? 10 : 0);
      const scoreDiff = score(right) - score(left);
      if (scoreDiff !== 0) return scoreDiff;
      return String(left.periodId).localeCompare(String(right.periodId));
    })[0];
  return eventMatched ?? latestByAsOfDate(financials);
}

function annualize(row) {
  const multiplier = row?.periodType === "quarter" ? 4 : 1;
  return {
    revenue: row?.revenue != null ? row.revenue * multiplier : undefined,
    adjustedEbitda: row?.adjustedEbitda != null ? row.adjustedEbitda * multiplier : undefined,
    operatingIncome: row?.operatingIncome != null ? row.operatingIncome * multiplier : undefined,
    netIncome: row?.netIncome != null ? row.netIncome * multiplier : undefined,
    operatingCashFlow: row?.operatingCashFlow != null ? row.operatingCashFlow * multiplier : undefined,
    capex: row?.capex != null ? row.capex * multiplier : undefined,
    freeCashFlow: row?.freeCashFlow != null ? row.freeCashFlow * multiplier : undefined,
    depreciationAmortization: row?.depreciationAmortization != null ? row.depreciationAmortization * multiplier : undefined,
    adjustedEps: row?.adjustedEps != null ? row.adjustedEps * multiplier : undefined,
  };
}

function mapFinancialToTriPeriod(row) {
  const annualized = annualize(row);
  const revenue = annualized.revenue ?? row?.revenue ?? 0;
  const adjustedEbitda = annualized.adjustedEbitda ?? row?.adjustedEbitda ?? revenue * 0.36;
  return {
    id: "fy25",
    label: `${row?.periodId ?? "as-of"} annualized baseline`,
    fiscalYear: row?.fiscalYear ?? 2025,
    periodType: "annual",
    sourceType: row?.sourceType === "official_actual" ? "official_actual" : "official_actual",
    sourceId: row?.eventId ?? row?.id ?? "tri-backend-asof-baseline",
    revenue,
    organicRevenueGrowth: row?.organicRevenueGrowth ?? 0.06,
    adjustedEbitda,
    adjustedEbitdaMargin: revenue ? adjustedEbitda / revenue : row?.adjustedEbitdaMargin ?? 0.36,
    operatingProfit: annualized.operatingIncome ?? row?.operatingIncome,
    adjustedEps: annualized.adjustedEps ?? row?.adjustedEps,
    operatingCashFlow: annualized.operatingCashFlow,
    freeCashFlow: annualized.freeCashFlow ?? adjustedEbitda * 0.62,
    capexPctRevenue: revenue ? (annualized.capex ?? row?.capex ?? revenue * 0.08) / revenue : 0.08,
    recurringRevenuePct: row?.recurringRevenue && row?.revenue ? row.recurringRevenue / row.revenue : 0.78,
  };
}

const segmentMultiples = new Map([
  ["Legal Professionals", 18],
  ["Corporates", 15],
  ["Tax & Accounting Professionals", 16],
  ["Tax, Audit & Accounting Professionals", 16],
  ["Reuters News", 9],
  ["Global Print", 6],
  ["Corporate Costs", 10],
]);

function segmentLabel(label) {
  return label === "Tax & Accounting Professionals" ? "Tax, Audit & Accounting Professionals" : label;
}

function segmentAnnualizationMultiplier(row) {
  return String(row?.periodId ?? "").startsWith("q") ? 4 : 1;
}

function buildBackendSegmentValues(snapshot) {
  const eventId = snapshot?.reportingEvent?.id;
  const rows = (snapshot?.segmentFinancials ?? []).filter((row) => row.eventId === eventId);
  if (!rows.length) return undefined;
  return rows
    .filter((row) => segmentMultiples.has(row.segment))
    .map((row) => ({
      label: segmentLabel(row.segment),
      ebitda: (row.adjustedEbitda ?? row.operatingIncome ?? 0) * segmentAnnualizationMultiplier(row),
      multiple: segmentMultiples.get(row.segment) ?? 10,
      note: row.researchOnly
        ? "Research-only historical segment proxy annualized from the event quarter; not an official actual."
        : "Official/as-of TRI segment row annualized from the event quarter when needed.",
    }));
}

function buildAsOfGuidance(baseDataset, financial) {
  const revenueGrowth = financial?.organicRevenueGrowth ?? 0.06;
  const fcf = financial?.periodType === "quarter" ? (financial.freeCashFlow ?? 0) * 4 : financial?.freeCashFlow ?? baseDataset.guidance.freeCashFlow;
  return {
    ...baseDataset.guidance,
    sourceType: "management_guidance",
    sourceId: financial?.eventId ?? baseDataset.guidance.sourceId,
    revenueGrowthLow: Math.max(0.02, revenueGrowth - 0.01),
    revenueGrowthHigh: revenueGrowth + 0.01,
    organicRevenueGrowthLow: Math.max(0.02, revenueGrowth - 0.01),
    organicRevenueGrowthHigh: revenueGrowth + 0.01,
    freeCashFlow: fcf,
    q2OrganicGrowthLow: Math.max(0.02, revenueGrowth - 0.01),
    q2OrganicGrowthHigh: revenueGrowth + 0.01,
    big3OrganicGrowth: revenueGrowth + 0.012,
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot, valuationFinancial) {
  const dataset = cloneJson(baseDataset);
  const baseline = mapFinancialToTriPeriod(valuationFinancial);
  const periodMap = new Map((dataset.periods ?? []).map((row) => [row.id, row]));
  periodMap.set("fy25", baseline);
  dataset.periods = Array.from(periodMap.values());
  dataset.guidance = buildAsOfGuidance(baseDataset, valuationFinancial);
  dataset.latestReportingPeriod = snapshot?.reportingEvent?.fiscalPeriod ?? dataset.latestReportingPeriod;
  const market = snapshot?.marketSnapshot;
  if (market) {
    dataset.marketData = {
      ...dataset.marketData,
      currentPrice: market.currentPrice ?? dataset.marketData.currentPrice,
      priceDate: market.priceDate ?? market.asOfDate ?? dataset.marketData.priceDate,
      marketCap: market.marketCap ?? dataset.marketData.marketCap,
      enterpriseValue: market.enterpriseValue ?? dataset.marketData.enterpriseValue,
      sharesOutstanding: market.sharesOutstanding ?? valuationFinancial?.dilutedShares ?? dataset.marketData.sharesOutstanding,
      dividendPerShare: valuationFinancial?.dividendsPaid && valuationFinancial?.dilutedShares
        ? (valuationFinancial.dividendsPaid / valuationFinancial.dilutedShares) * (valuationFinancial.periodType === "quarter" ? 4 : 1)
        : dataset.marketData.dividendPerShare,
      dividendYield: market.dividendYield ?? dataset.marketData.dividendYield,
      sourceType: "market_data",
      sourceId: market.id,
    };
  }
  const segmentValues = buildBackendSegmentValues(snapshot);
  if (segmentValues) dataset.__triBackendSegmentValues = segmentValues;
  return dataset;
}

function buildAsOfAssumptions({ snapshot, scenarioPreset = {}, payloadAssumptions = {}, valuationFinancial }) {
  const market = snapshot?.marketSnapshot ?? {};
  const revenueGrowth = valuationFinancial?.organicRevenueGrowth ?? scenarioPreset.revenueCagr ?? 0.06;
  const margin = valuationFinancial?.adjustedEbitdaMargin ?? scenarioPreset.terminalAdjustedEbitdaMargin ?? 0.38;
  return finiteObject({
    currentPrice: market.currentPrice,
    revenueCagr: Math.max((scenarioPreset.terminalGrowth ?? 0.02) + 0.015, (scenarioPreset.revenueCagr ?? revenueGrowth) * 0.65 + revenueGrowth * 0.35),
    big3OrganicGrowth: (scenarioPreset.big3OrganicGrowth ?? revenueGrowth) * 0.70 + revenueGrowth * 0.30,
    terminalAdjustedEbitdaMargin: Math.min(scenarioPreset.terminalAdjustedEbitdaMargin ?? margin + 0.02, margin + 0.04),
    dilutedShares: valuationFinancial?.dilutedShares,
    netDebt: valuationFinancial?.netDebt,
    dividendPerShare:
      valuationFinancial?.dividendsPaid && valuationFinancial?.dilutedShares
        ? (valuationFinancial.dividendsPaid / valuationFinancial.dilutedShares) * (valuationFinancial.periodType === "quarter" ? 4 : 1)
        : undefined,
    ...payloadAssumptions,
  });
}

export function buildTriBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = TRI_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "TRI",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "Phase 1 TRI adapter maps SQLite reporting-event snapshots into the existing TRI frontend valuation engine.",
      "Historical runs replace the engine's FY2025 anchor with an as-of annualized baseline to avoid current-period leakage.",
      "Historical segment SOTP inputs are event-visible rows annualized from quarterly segment data when no annual row exists; older rows are marked research_only until official quarterly source documents are imported.",
      "Transcript and guidance candidates remain modelReady=false and valuationImpactAllowed=false unless explicitly promoted.",
    ],
  };
}

export async function runTriBackendValuation(input) {
  const payload = buildTriBackendValuationPayload(input);
  const { calculations, dataModule } = await loadTriFrontendContext();
  const selectedFinancial = selectValuationFinancial(payload.snapshot);
  const baseDataset = dataModule.triDataset;
  const backendDataset = buildDatasetFromSnapshot(baseDataset, payload.snapshot, selectedFinancial);
  const scenarioPreset = calculations.triScenarioPresets?.[payload.scenario] ?? {};
  const backendAssumptions = {
    ...scenarioPreset,
    ...buildAsOfAssumptions({
      snapshot: payload.snapshot,
      scenarioPreset,
      payloadAssumptions: payload.assumptions,
      valuationFinancial: selectedFinancial,
    }),
  };
  const valuation = calculations.calculateTriValuation(backendDataset, "fy25", payload.scenario, backendAssumptions);
  return {
    ...valuation,
    backendModelVersion: payload.modelVersion,
    backendSnapshot: {
      asOfDate: payload.asOfDate,
      reportingEventId: payload.reportingEventId,
      financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
      segmentFinancialCount: payload.snapshot?.segmentFinancials?.length ?? 0,
      marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
      valuationPeriodId: selectedFinancial?.periodId ?? null,
      valuationSourceType: selectedFinancial?.sourceType ?? null,
      valuationResearchOnly: Boolean(selectedFinancial?.researchOnly),
      priceDate: backendDataset.marketData.priceDate,
      adapterWarnings: payload.adapterWarnings,
    },
    validationWarnings: [
      ...(valuation.validationWarnings ?? []),
      ...payload.adapterWarnings.map((detail, index) => ({
        id: `tri-backend-adapter-gap-${index + 1}`,
        title: "TRI backend adapter gap",
        detail,
        severity: "low",
      })),
    ],
  };
}
