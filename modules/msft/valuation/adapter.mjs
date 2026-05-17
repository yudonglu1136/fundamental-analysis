import { createServer } from "vite";
import { MSFT_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

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

function clamp(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function latestByAsOfDate(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  return sorted[sorted.length - 1];
}

function selectValuationFinancial(snapshot) {
  const financials = snapshot?.financialPeriods ?? [];
  const eventId = snapshot?.reportingEvent?.id;
  const eventMatched = financials.find((row) => row.eventId === eventId);
  return eventMatched ?? latestByAsOfDate(financials);
}

function fiscalYearProgress(fiscalYear) {
  return clamp((fiscalYear - 2018) / 8, 0, 1) ?? 0;
}

function annualizeIncomeStatement(row) {
  if (!row) return {};
  const multiplier = row.periodType === "quarter" ? 4 : 1;
  return {
    revenue: row.revenue != null ? row.revenue * multiplier : undefined,
    costOfRevenue: row.costOfRevenue != null ? row.costOfRevenue * multiplier : undefined,
    grossProfit: row.grossProfit != null ? row.grossProfit * multiplier : undefined,
    operatingIncome: row.operatingIncome != null ? row.operatingIncome * multiplier : undefined,
    netIncome: row.netIncome != null ? row.netIncome * multiplier : undefined,
    operatingCashFlow: row.operatingCashFlow != null ? row.operatingCashFlow * multiplier : undefined,
    capex: row.capex != null ? row.capex * multiplier : undefined,
    freeCashFlow: row.freeCashFlow != null ? row.freeCashFlow * multiplier : undefined,
    depreciationAmortizationAndOther: row.depreciationAmortizationAndOther != null ? row.depreciationAmortizationAndOther * multiplier : undefined,
    stockBasedCompensation: row.stockBasedCompensation != null ? row.stockBasedCompensation * multiplier : undefined,
    dividendsPaid: row.dividendsPaid != null ? row.dividendsPaid * multiplier : undefined,
    buybacks: row.buybacks != null ? row.buybacks * multiplier : undefined,
  };
}

function buildAsOfBaselineFinancial(row) {
  const annualized = annualizeIncomeStatement(row);
  const revenue = annualized.revenue ?? row?.revenue ?? 0;
  const grossProfit = annualized.grossProfit ?? row?.grossProfit ?? revenue * 0.68;
  const operatingIncome = annualized.operatingIncome ?? row?.operatingIncome ?? revenue * 0.35;
  const netIncome = annualized.netIncome ?? row?.netIncome;
  const dilutedShares = row?.dilutedShares ?? 7_500;
  return {
    id: "fy26e",
    label: `${row?.label ?? row?.periodId ?? "as-of"} annualized baseline`,
    fiscalYear: row?.fiscalYear ?? 2026,
    periodType: "forecast",
    sourceStatus: "derived",
    sourceId: row?.eventId ?? row?.id ?? "msft-backend-asof-baseline",
    revenue,
    costOfRevenue: annualized.costOfRevenue ?? Math.max(revenue - grossProfit, 0),
    grossProfit,
    grossMargin: revenue ? grossProfit / revenue : row?.grossMargin ?? 0.68,
    operatingIncome,
    operatingMargin: revenue ? operatingIncome / revenue : row?.operatingMargin ?? 0.38,
    netIncome,
    dilutedEps: netIncome && dilutedShares ? netIncome / dilutedShares : row?.dilutedEps,
    dilutedShares,
    operatingCashFlow: annualized.operatingCashFlow,
    capex: annualized.capex,
    freeCashFlow: annualized.freeCashFlow,
    depreciationAmortizationAndOther: annualized.depreciationAmortizationAndOther,
    stockBasedCompensation: annualized.stockBasedCompensation,
    cashAndShortTermInvestments: row?.cashAndShortTermInvestments,
    debt: row?.debt,
    operatingLeaseLiabilities: row?.operatingLeaseLiabilities,
    ppeNet: row?.ppeNet,
    dividendsPaid: annualized.dividendsPaid,
    buybacks: annualized.buybacks,
    notes: "Backend as-of annualized baseline used to prevent current FY2026 forecast leakage into historical valuation runs.",
  };
}

function buildAsOfSegmentBase(baseline, asOfDate) {
  const maturity = fiscalYearProgress(baseline.fiscalYear);
  const productivityMix = 0.34 + maturity * 0.07;
  const cloudMix = 0.30 + maturity * 0.08;
  const consumerMix = Math.max(1 - productivityMix - cloudMix, 0.16);
  const rows = [
    ["Productivity and Business Processes", productivityMix, baseline.operatingMargin + 0.06],
    ["Intelligent Cloud", cloudMix, baseline.operatingMargin + 0.01],
    ["More Personal Computing", consumerMix, baseline.operatingMargin - 0.08],
  ];
  return rows.map(([segment, mix, margin]) => ({
    periodId: "fy26e",
    segment,
    sourceStatus: "management_guidance",
    sourceId: baseline.sourceId,
    revenue: baseline.revenue * mix,
    operatingIncome: baseline.revenue * mix * clamp(margin, 0.18, 0.55),
    operatingMargin: clamp(margin, 0.18, 0.55),
    keyDrivers: [`Backend as-of segment base generated from ${baseline.label}.`],
    marginDebate: `As-of ${asOfDate} historical valuation baseline; not current FY2026 segment leakage.`,
    riskNotes: ["Historical segment split is estimated where exact segment table is unavailable."],
  }));
}

function latestRawCloudDisclosure(snapshot) {
  const latestCloud = latestByAsOfDate(snapshot?.cloudAiKpis ?? []);
  const raw = parseJson(latestCloud?.rawJson, {});
  return { latestCloud, raw };
}

function buildAsOfAssumptionOverrides({ snapshot, scenarioPreset = {}, payloadAssumptions = {}, latestFinancial, financialHistory = [] }) {
  const { latestCloud, raw } = latestRawCloudDisclosure(snapshot);
  const sortedFinancials = [...financialHistory]
    .filter((row) => row?.asOfDate && row?.revenue)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const previousFinancial = sortedFinancials.length > 1 ? sortedFinancials[sortedFinancials.length - 2] : null;
  const revenueGrowth =
    latestFinancial?.revenue && previousFinancial?.revenue
      ? clamp(latestFinancial.revenue / previousFinancial.revenue - 1, -0.05, 0.30)
      : undefined;

  const base = { ...scenarioPreset, ...payloadAssumptions };
  const latestAzureAnchor = 0.40;
  const latestM365Anchor = 0.19;
  const latestCloudGmAnchor = 0.66;
  const latestAiArrAnchor = 37;
  const latestCopilotSeatAnchor = 20;
  const latestRpoAnchor = 627;
  const asOfYear = Number((snapshot?.asOfDate ?? "").slice(0, 4)) || latestFinancial?.fiscalYear || 2026;
  const maturity = fiscalYearProgress(asOfYear);
  const preGenAi = snapshot?.asOfDate && snapshot.asOfDate < "2023-01-01";

  const earlyAiFactor =
    snapshot?.asOfDate && snapshot.asOfDate < "2020-01-01"
      ? 0.45
      : snapshot?.asOfDate && snapshot.asOfDate < "2022-01-01"
        ? 0.58
        : snapshot?.asOfDate && snapshot.asOfDate < "2024-01-01"
          ? 0.72
          : 0.90;
  const azureFactor = latestCloud
    ? (clamp((latestCloud.azureGrowth ?? latestAzureAnchor) / latestAzureAnchor, 0.70, 1.12) ?? 1)
    : earlyAiFactor;
  const m365Factor = latestCloud
    ? (clamp((latestCloud.m365CommercialCloudGrowth ?? latestM365Anchor) / latestM365Anchor, 0.70, 1.15) ?? 1)
    : clamp(0.70 + Math.max(revenueGrowth ?? 0.08, 0) * 2.0, 0.72, 1.02) ?? 0.85;
  const cloudGmDelta = (latestCloud?.microsoftCloudGrossMargin ?? latestFinancial?.grossMargin ?? latestCloudGmAnchor) - latestCloudGmAnchor;
  const aiArrFactor =
    typeof raw.aiRevenueRunRate === "number"
      ? clamp(raw.aiRevenueRunRate / latestAiArrAnchor, 0.35, 1.10)
      : snapshot?.asOfDate && snapshot.asOfDate < "2025-01-01"
        ? 0.35
        : snapshot?.asOfDate && snapshot.asOfDate < "2025-07-01"
          ? 0.55
          : 0.85;
  const copilotFactor =
    typeof raw.copilotPaidSeats === "number"
      ? clamp(raw.copilotPaidSeats / latestCopilotSeatAnchor, 0.40, 1.10)
      : snapshot?.asOfDate && snapshot.asOfDate < "2025-01-01"
        ? 0.45
        : snapshot?.asOfDate && snapshot.asOfDate < "2025-07-01"
          ? 0.60
          : 0.85;
  const rpoFactor = latestCloud ? (clamp((latestCloud.commercialRpo ?? latestRpoAnchor) / latestRpoAnchor, 0.65, 1.10) ?? 1) : clamp(0.72 + earlyAiFactor * 0.20, 0.70, 0.98) ?? 0.85;
  const actualCapexIntensity =
    latestFinancial?.revenue && latestFinancial?.capex ? clamp(latestFinancial.capex / latestFinancial.revenue, 0.12, 0.40) : undefined;
  const inferredCapexIntensity = clamp(
    (base.aiCapexIntensity ?? 0.25) +
      Math.max(latestCloudGmAnchor - (latestCloud?.microsoftCloudGrossMargin ?? latestFinancial?.grossMargin ?? latestCloudGmAnchor), -0.04) * 0.75 +
      (1 - (aiArrFactor ?? 1)) * -0.015,
    0.14,
    0.36,
  );

  return finiteObject({
    azureGrowth: clamp((base.azureGrowth ?? 0.30) * azureFactor, 0.12, 0.48),
    baseSoftwareGrowth: clamp((base.baseSoftwareGrowth ?? 0.105) * m365Factor * clamp(rpoFactor, 0.85, 1.08) + (revenueGrowth ?? 0) * 0.10, 0.04, 0.18),
    copilotPenetration: clamp((base.copilotPenetration ?? 0.32) * (copilotFactor ?? 1), 0.05, 0.65),
    openAiRevenueContribution: clamp((base.openAiRevenueContribution ?? 0.018) * (aiArrFactor ?? 1), 0, 0.05),
    aiOptionalityValue: preGenAi
      ? 0
      : clamp((base.aiOptionalityValue ?? 260_000) * (0.10 + maturity * 0.90) * (0.55 + (aiArrFactor ?? 1) * 0.45), 0, 450_000),
    aiCapexIntensity: actualCapexIntensity ?? inferredCapexIntensity,
    operatingMargin: clamp((base.operatingMargin ?? 0.435) + cloudGmDelta * 0.20, 0.34, 0.52),
    normalizedCapexIntensity: clamp((base.normalizedCapexIntensity ?? 0.16) * (0.58 + maturity * 0.42), 0.07, 0.20),
    targetFcfYield: clamp((base.targetFcfYield ?? 0.031) + (1 - maturity) * 0.010, 0.025, 0.055),
    targetPe: clamp((base.targetPe ?? 31) * (0.72 + maturity * 0.28), 18, 36),
    targetEvEbit: clamp((base.targetEvEbit ?? 25) * (0.70 + maturity * 0.30), 15, 30),
    productivitySalesMultiple: clamp((base.productivitySalesMultiple ?? 11.5) * (0.48 + maturity * 0.52), 4.5, 14),
    azureSalesMultiple: clamp((base.azureSalesMultiple ?? 12.5) * (0.42 + maturity * 0.58), 4.5, 16),
    windowsSearchGamingSalesMultiple: clamp((base.windowsSearchGamingSalesMultiple ?? 6.0) * (0.55 + maturity * 0.45), 3.0, 8),
  });
}

function mapFinancial(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    id: row.periodId,
    label: raw.label ?? row.periodId,
    fiscalYear: row.fiscalYear,
    periodType: row.periodType,
    sourceStatus: row.sourceType === "official_actual" ? "official_actual" : row.sourceType === "management_guidance" ? "management_guidance" : "derived",
    sourceId: row.eventId ?? row.id,
    revenue: row.revenue ?? raw.revenue,
    costOfRevenue: row.costOfRevenue ?? raw.costOfRevenue,
    grossProfit: row.grossProfit ?? raw.grossProfit,
    grossMargin: row.grossMargin ?? raw.grossMargin,
    operatingIncome: row.operatingIncome ?? raw.operatingIncome,
    operatingMargin: row.operatingMargin ?? raw.operatingMargin,
    netIncome: row.netIncome ?? raw.netIncome,
    dilutedEps: row.dilutedEps ?? raw.dilutedEps,
    dilutedShares: row.dilutedShares ?? raw.dilutedShares,
    operatingCashFlow: row.operatingCashFlow ?? raw.operatingCashFlow,
    capex: row.capex ?? raw.capex,
    freeCashFlow: row.freeCashFlow ?? raw.freeCashFlow,
    depreciationAmortizationAndOther: row.depreciationAmortization ?? raw.depreciationAmortizationAndOther,
    stockBasedCompensation: row.stockBasedCompensation ?? raw.stockBasedCompensation,
    cashAndShortTermInvestments: row.cashAndShortTermInvestments ?? raw.cashAndShortTermInvestments,
    debt: row.debt ?? raw.debt,
    operatingLeaseLiabilities: row.operatingLeaseLiabilities ?? raw.operatingLeaseLiabilities,
    ppeNet: row.ppeNet ?? raw.ppeNet,
    dividendsPaid: row.dividendsPaid ?? raw.dividendsPaid,
    buybacks: row.buybacks ?? raw.buybacks,
    notes: raw.notes ?? `Backend row ${row.id}`,
  };
}

function mapSegment(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    periodId: row.periodId,
    segment: row.segment,
    sourceStatus: row.sourceType === "official_actual" ? "official_actual" : "management_guidance",
    sourceId: row.eventId ?? row.id,
    revenue: row.revenue,
    costOfRevenue: row.costOfRevenue,
    operatingExpenses: row.operatingExpenses,
    operatingIncome: row.operatingIncome,
    growth: row.growth,
    constantCurrencyGrowth: row.constantCurrencyGrowth,
    operatingMargin: row.operatingMargin,
    grossMargin: row.grossMargin,
    keyDrivers: raw.keyDrivers ?? [],
    marginDebate: raw.marginDebate ?? row.notes ?? "Backend segment row.",
    riskNotes: raw.riskNotes ?? [],
  };
}

function mapCloud(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    periodId: row.periodId,
    label: raw.label ?? row.periodId,
    sourceStatus: row.sourceType === "official_actual" ? "official_actual" : "official_actual",
    sourceId: row.eventId ?? row.id,
    microsoftCloudRevenue: row.microsoftCloudRevenue,
    microsoftCloudGrowth: row.microsoftCloudGrowth,
    microsoftCloudConstantCurrencyGrowth: row.microsoftCloudConstantCurrencyGrowth,
    microsoftCloudGrossMargin: row.microsoftCloudGrossMargin,
    commercialRpo: row.commercialRpo,
    commercialBookingsGrowth: row.commercialBookingsGrowth,
    azureGrowth: row.azureGrowth,
    azureConstantCurrencyGrowth: row.azureConstantCurrencyGrowth,
    m365CommercialCloudGrowth: row.m365CommercialCloudGrowth,
    m365CommercialSeatGrowth: row.m365CommercialSeatGrowth,
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot, valuationFinancial) {
  const dataset = cloneJson(baseDataset);
  const financials = [...(snapshot?.financialPeriods ?? [])].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const segments = snapshot?.segmentFinancials ?? [];
  const cloudRows = snapshot?.cloudAiKpis ?? [];
  if (financials.length) {
    const periodMap = new Map((dataset.periods ?? []).map((row) => [row.id, row]));
    for (const row of financials.map(mapFinancial)) {
      periodMap.set(row.id, { ...(periodMap.get(row.id) ?? {}), ...row });
    }
    dataset.periods = Array.from(periodMap.values());
  }
  if (segments.length) {
    const segmentMap = new Map((dataset.segments ?? []).map((row) => [`${row.periodId}:${row.segment}`, row]));
    for (const row of segments.map(mapSegment)) {
      segmentMap.set(`${row.periodId}:${row.segment}`, { ...(segmentMap.get(`${row.periodId}:${row.segment}`) ?? {}), ...row });
    }
    dataset.segments = Array.from(segmentMap.values());
  }
  if (cloudRows.length) {
    const cloudMap = new Map((dataset.cloudMetrics ?? []).map((row) => [row.periodId, row]));
    for (const row of cloudRows.filter((item) => item.microsoftCloudRevenue != null).map(mapCloud)) {
      cloudMap.set(row.periodId, { ...(cloudMap.get(row.periodId) ?? {}), ...row });
    }
    dataset.cloudMetrics = Array.from(cloudMap.values());
  }
  const baseline = buildAsOfBaselineFinancial(valuationFinancial ? mapFinancial(valuationFinancial) : latestByAsOfDate(financials));
  const periodMap = new Map((dataset.periods ?? []).map((row) => [row.id, row]));
  periodMap.set("fy26e", baseline);
  dataset.periods = Array.from(periodMap.values());
  const segmentMap = new Map((dataset.segments ?? []).map((row) => [`${row.periodId}:${row.segment}`, row]));
  for (const row of buildAsOfSegmentBase(baseline, snapshot?.asOfDate)) {
    segmentMap.set(`${row.periodId}:${row.segment}`, row);
  }
  dataset.segments = Array.from(segmentMap.values());
  const market = snapshot?.marketSnapshot;
  if (market) {
    dataset.marketData = {
      ...dataset.marketData,
      sourceStatus: "market_data",
      sourceId: market.id,
      currentPrice: market.currentPrice,
      priceDate: market.priceDate ?? market.asOfDate,
      source: market.source,
      sharesForMarketCap: market.sharesOutstanding ?? dataset.marketData.sharesForMarketCap,
      marketCap: market.marketCap ?? market.currentPrice * (market.sharesOutstanding ?? dataset.marketData.sharesForMarketCap),
      notes: `Backend market snapshot ${market.id}.`,
    };
  }
  dataset.latestReportingPeriod = snapshot?.reportingEvent?.fiscalPeriod ?? dataset.latestReportingPeriod;
  return dataset;
}

export function buildMsftBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = MSFT_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "MSFT",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "Phase 1 MSFT adapter maps SQLite reporting-event snapshots into the existing MSFT frontend valuation engine.",
      "Historical runs replace the engine's FY2026 forecast starting point with an as-of annualized baseline to avoid current-period leakage.",
      "Historical market prices may be explicitly marked research_only proxy/backcast rows until event-dated market data is imported.",
      "Transcript and Q&A extractions remain research-only and are not valuation-impacting unless promoted through reviewed assumptions.",
      "No MSFT valuation formula is duplicated or intentionally changed in the backend pilot.",
    ],
  };
}

export async function runMsftBackendValuation(input) {
  const payload = buildMsftBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/msft/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/msft/data.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/msft/assumptions.ts");
    const selectedSnapshotFinancial = selectValuationFinancial(payload.snapshot);
    const backendDataset = buildDatasetFromSnapshot(dataModule.msftDataset ?? dataModule.msftData, payload.snapshot, selectedSnapshotFinancial);
    const latestSnapshotFinancial = selectedSnapshotFinancial;
    const latestFinancial = latestSnapshotFinancial ? mapFinancial(latestSnapshotFinancial) : backendDataset.periods[backendDataset.periods.length - 1];
    const market = backendDataset.marketData;
    const scenarioPreset = assumptionsModule.msftScenarioPresets?.[payload.scenario] ?? {};
    const asOfOverrides = buildAsOfAssumptionOverrides({
      snapshot: payload.snapshot,
      scenarioPreset,
      payloadAssumptions: payload.assumptions,
      latestFinancial: latestSnapshotFinancial,
      financialHistory: payload.snapshot?.financialPeriods ?? [],
    });
    const backendAssumptions = {
      ...finiteObject({
        currentPrice: market.currentPrice,
        dilutedShares: latestFinancial?.dilutedShares,
        netCashDebt:
          (latestFinancial?.cashAndShortTermInvestments ?? 0) -
          (latestFinancial?.debt ?? 0) -
          (latestFinancial?.operatingLeaseLiabilities ?? 0),
      }),
      ...asOfOverrides,
      ...payload.assumptions,
    };
    const valuation = calculations.calculateMsftValuation(backendDataset, backendAssumptions, payload.scenario);
    return {
      ...valuation,
      backendModelVersion: payload.modelVersion,
      backendSnapshot: {
        asOfDate: payload.asOfDate,
        reportingEventId: payload.reportingEventId,
        financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
        segmentFinancialCount: payload.snapshot?.segmentFinancials?.length ?? 0,
        cloudAiKpiCount: payload.snapshot?.cloudAiKpis?.length ?? 0,
        marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
        valuationPeriodId: latestSnapshotFinancial?.periodId ?? latestFinancial?.id ?? latestFinancial?.periodId ?? null,
        priceDate: market.priceDate,
        asOfAssumptionOverrides: asOfOverrides,
        adapterWarnings: payload.adapterWarnings,
      },
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `msft-backend-adapter-gap-${index + 1}`,
          title: "MSFT backend adapter gap",
          detail,
          severity: "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}
