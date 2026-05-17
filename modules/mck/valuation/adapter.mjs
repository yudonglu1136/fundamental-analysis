import { createServer } from "vite";
import { MCK_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

const TICKER = "MCK";

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

function dataTag({ sourceType, source, asOfDate, confidence = "medium", notes, isPlaceholder = false, sourceUrl = undefined }) {
  const mappedSourceType =
    sourceType === "official_actual"
      ? "actual"
      : sourceType === "management_guidance"
        ? "guidance"
        : sourceType === "market_data"
          ? "market"
          : sourceType === "forecast_assumption"
            ? "assumption"
            : sourceType === "transcript_commentary"
              ? "transcript"
              : sourceType === "research_only"
                ? "research"
                : "derived";
  return {
    sourceType: mappedSourceType,
    source: source ?? "MCK backend SQLite snapshot",
    sourceUrl,
    asOfDate,
    confidence,
    isPlaceholder,
    notes,
  };
}

function segmentForFrontend(segment) {
  return segment === "U.S. Pharmaceutical" ? "North American Pharmaceutical" : segment;
}

function latestByAsOfDate(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  return sorted[sorted.length - 1] ?? null;
}

function mapFinancial(row) {
  const raw = parseJson(row.rawJson, {});
  const placeholderFields = new Set(raw.placeholderFields ?? []);
  return {
    periodId: row.periodId,
    label: row.periodType === "annual" ? row.periodId.toUpperCase().replace("FY", "FY") + "A" : `${row.periodId.toUpperCase()} run-rate`,
    fiscalYear: row.fiscalYear,
    revenue: row.revenue ?? 0,
    revenueGrowth: row.revenueGrowth ?? 0,
    gaapDilutedEps: row.gaapDilutedEps ?? row.adjustedDilutedEps ?? 0,
    adjustedDilutedEps: row.adjustedDilutedEps ?? 0,
    adjustedEpsGrowth: row.adjustedEpsGrowth ?? 0,
    operatingCashFlow: row.operatingCashFlow ?? row.freeCashFlow ?? 0,
    capex: row.capex ?? 0,
    freeCashFlow: row.freeCashFlow ?? row.normalizedFreeCashFlow ?? 0,
    shareRepurchases: row.shareRepurchases ?? 0,
    dividendsPaid: row.dividendsPaid ?? 0,
    dilutedShares: row.dilutedShares ?? 1,
    dilutedSharesTag: dataTag({
      sourceType: placeholderFields.has("dilutedShares") ? "forecast_assumption" : row.sourceType,
      source: placeholderFields.has("dilutedShares") ? "MCK backend event-visible diluted share estimate" : "MCK backend financial period",
      asOfDate: row.asOfDate,
      confidence: placeholderFields.has("dilutedShares") ? "low" : "medium",
      isPlaceholder: placeholderFields.has("dilutedShares"),
    }),
    netDebt: row.netDebt ?? 0,
    netDebtTag: dataTag({
      sourceType: placeholderFields.has("netDebt") ? "forecast_assumption" : row.sourceType,
      source: placeholderFields.has("netDebt") ? "MCK backend event-visible net debt estimate" : "MCK backend balance sheet field",
      asOfDate: row.asOfDate,
      confidence: placeholderFields.has("netDebt") ? "low" : "medium",
      isPlaceholder: placeholderFields.has("netDebt"),
    }),
    adjustedTaxRate: row.adjustedTaxRate ?? 0.18,
    tag: dataTag({
      sourceType: row.sourceType,
      source: raw.source ?? "MCK backend financial period",
      asOfDate: row.asOfDate,
      confidence: row.sourceType === "official_actual" ? "high" : "medium",
      notes: raw.freeCashFlowPolicy,
      isPlaceholder: row.sourceType !== "official_actual",
    }),
  };
}

function mapSegment(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    periodId: row.periodId,
    segment: segmentForFrontend(row.segment),
    revenue: row.revenue ?? 0,
    revenueGrowth: row.revenueGrowth ?? 0,
    operatingProfit: row.operatingProfit ?? row.adjustedOperatingProfit ?? 0,
    adjustedOperatingProfit: row.adjustedOperatingProfit ?? 0,
    adjustedOperatingProfitGrowth: row.adjustedOperatingProfitGrowth ?? 0,
    margin: row.margin ?? ((row.adjustedOperatingProfit ?? 0) / Math.max(row.revenue ?? 0, 1)),
    marginBps: row.marginBps ?? (((row.adjustedOperatingProfit ?? 0) / Math.max(row.revenue ?? 0, 1)) * 10000),
    moatScore: row.moatScore ?? 50,
    riskLevel: row.riskLevel ?? "Medium",
    multipleAssumption: row.multipleAssumption ?? 8,
    tag: dataTag({
      sourceType: row.sourceType,
      source: row.notes ?? "MCK backend segment financials",
      asOfDate: row.asOfDate,
      confidence: row.sourceType === "official_actual" ? "high" : "medium",
      isPlaceholder: row.sourceType !== "official_actual",
      notes: raw.dataLayer === "forecast_assumption" ? "Event-visible segment snapshot, not an official segment actual." : undefined,
    }),
  };
}

function mapMarket(row, fallback) {
  if (!row) return fallback;
  return {
    ticker: "MCK",
    currentPrice: row.currentPrice ?? fallback.currentPrice,
    marketCap: row.marketCap ?? fallback.marketCap,
    enterpriseValue: row.enterpriseValue ?? fallback.enterpriseValue,
    sharesOut: row.sharesOutstanding ?? fallback.sharesOut,
    forwardPe: row.forwardPe ?? fallback.forwardPe,
    fcfYield: row.fcfYield ?? fallback.fcfYield,
    dividendYield: row.dividendYield ?? fallback.dividendYield,
    buybackYield: row.buybackYield ?? fallback.buybackYield,
    netDebtToEbitda: row.netDebtToEbitda ?? fallback.netDebtToEbitda,
    fiftyTwoWeekHigh: row.fiftyTwoWeekHigh ?? fallback.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: row.fiftyTwoWeekLow ?? fallback.fiftyTwoWeekLow,
    priceDate: row.priceDate ?? row.asOfDate,
    tag: dataTag({
      sourceType: "market_data",
      source: row.source ?? "MCK backend market snapshot",
      asOfDate: row.asOfDate,
      confidence: parseJson(row.rawJson, {}).sourceQuality?.includes("proxy") ? "low" : "medium",
      isPlaceholder: parseJson(row.rawJson, {}).sourceQuality?.includes("proxy") ?? false,
    }),
  };
}

function mapPeer(row) {
  return {
    ticker: row.peerTicker,
    name: row.companyName ?? row.peerName ?? row.peerTicker,
    category: row.category === "adjacent_reference" ? "adjacent_reference" : "core_peer",
    revenueGrowth: row.revenueGrowth ?? 0,
    operatingMargin: row.operatingMargin ?? 0,
    adjustedEpsGrowth: row.adjustedEpsGrowth ?? 0,
    fcfConversion: row.fcfConversion ?? 0,
    fcfYield: row.fcfYield ?? 0,
    forwardPe: row.forwardPe ?? 0,
    buybackYield: row.buybackYield ?? 0,
    roic: row.roic ?? 0,
    leverage: row.leverage ?? 0,
    specialtyExposure: row.specialtyExposure ?? 0,
    moatScore: row.moatScore ?? 0,
    tag: dataTag({
      sourceType: "research_only",
      source: row.source ?? "MCK backend peer snapshot",
      asOfDate: row.asOfDate,
      confidence: row.confidenceLevel ?? "medium",
      notes: row.absoluteValueUse,
      isPlaceholder: true,
    }),
  };
}

function mapGuidance(row) {
  const fiscalYear = Number(String(row.fiscalPeriodTarget ?? "").match(/20\d{2}/)?.[0] ?? 0);
  return {
    fiscalYear,
    metric: row.metric,
    low: row.lowValue ?? row.midpointValue ?? 0,
    high: row.highValue ?? row.midpointValue ?? 0,
    midpoint: row.midpointValue ?? 0,
    sourceType: "guidance",
    source: row.guidanceType ?? "MCK backend guidance item",
    sourceUrl: undefined,
    asOfDate: row.asOfDate,
    notes: row.quote ?? "Guidance item visible in backend snapshot; not auto-promoted into valuation.",
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot) {
  const dataset = cloneJson(baseDataset);
  const financials = [...(snapshot?.financialPeriods ?? [])].sort((left, right) => (
    left.asOfDate.localeCompare(right.asOfDate) || String(left.periodId).localeCompare(String(right.periodId))
  ));
  const segments = snapshot?.segmentFinancials ?? [];
  const market = snapshot?.marketSnapshot;
  const peers = snapshot?.peerSnapshots ?? [];
  const guidance = snapshot?.guidanceItems ?? [];
  if (financials.length) {
    dataset.reportedFinancials = financials.map(mapFinancial);
  }
  if (segments.length) {
    dataset.segmentFinancials = segments.map(mapSegment);
  }
  if (market) {
    dataset.market = mapMarket(market, dataset.market);
  }
  if (peers.length) {
    dataset.peers = peers.map(mapPeer);
  }
  const mappedGuidance = guidance.filter((row) => row.midpointValue != null || row.lowValue != null || row.highValue != null).map(mapGuidance);
  if (mappedGuidance.length) {
    dataset.guidance = mappedGuidance;
  }
  const asOfDate = snapshot?.asOfDate ?? "9999-12-31";
  dataset.transcriptEvents = dataset.transcriptEvents.filter((event) => event.eventDate <= asOfDate);
  dataset.managementQuotes = dataset.managementQuotes.filter((quote) => dataset.transcriptEvents.some((event) => event.id === quote.eventId));
  dataset.qaPairs = dataset.qaPairs.filter((qa) => dataset.transcriptEvents.some((event) => event.id === qa.eventId));
  return dataset;
}

function buildAsOfAssumptions({ snapshot, latestFinancial, market, payloadAssumptions }) {
  const raw = parseJson(latestFinancial?.rawJson, {});
  const normalizedFcf = latestFinancial?.normalizedFreeCashFlow ?? latestFinancial?.freeCashFlow;
  const annualBuybackCapacity = Math.max(
    latestFinancial?.shareRepurchases ?? 0,
    (normalizedFcf ?? 0) - (latestFinancial?.dividendsPaid ?? market?.marketCap * (market?.dividendYield ?? 0) ?? 0),
  );
  return {
    ...payloadAssumptions,
    ...finiteObject({
      currentPrice: market?.currentPrice,
      forwardAdjustedEps: latestFinancial?.adjustedDilutedEps,
      fcfPerShare: normalizedFcf != null && latestFinancial?.dilutedShares ? normalizedFcf / latestFinancial.dilutedShares : undefined,
      normalizedFcf,
      ownerEarningsBase: normalizedFcf != null ? normalizedFcf * 0.96 : undefined,
      netDebt: latestFinancial?.netDebt,
      dilutedShares: latestFinancial?.dilutedShares,
      averageBuybackPrice: market?.currentPrice,
      annualFcf: normalizedFcf,
      buybackAmount: annualBuybackCapacity,
      dividendPayout: latestFinancial?.dividendsPaid ?? market?.marketCap * (market?.dividendYield ?? 0),
    }),
    backendFcfPolicy: raw.freeCashFlowPolicy,
  };
}

function methodCards(valuation) {
  return [
    { label: "P/E", value: valuation.peFairValue, description: "Forward adjusted EPS multiplied by target P/E." },
    { label: "FCF yield", value: valuation.fcfYieldFairValue, description: "FCF per share divided by target FCF yield." },
    { label: "Owner earnings DCF", value: valuation.dcfFairValue, description: "Owner earnings DCF with normalized working-capital adjustment." },
    { label: "SOTP", value: valuation.sotpFairValue, description: "MCK-specific segment multiple valuation." },
    { label: "Blended", value: valuation.blendedFairValue, description: "Weighted blend of P/E, FCF yield, DCF and SOTP." },
  ].filter((row) => typeof row.value === "number" && Number.isFinite(row.value));
}

export function buildMckBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = MCK_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: TICKER,
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "Phase 1 MCK adapter maps SQLite reporting-event snapshots into the existing MCK valuation engines.",
      "Q1/Q2/Q3 events use event-visible run-rate and guidance snapshots instead of stale annual actuals.",
      "Transcript commentary and Q&A remain research-only and are not valuation-impacting unless promoted through reviewed assumptions.",
      "Historical market prices before the latest market snapshot may be manual proxies pending yfinance/vendor backfill.",
      "No MCK valuation formula is duplicated or intentionally changed in the backend pilot.",
    ],
  };
}

export async function runMckBackendValuation(input) {
  const payload = buildMckBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/mck/calculations.ts");
    const realDataModule = await server.ssrLoadModule("/src/stocks/mck/realData.ts");
    const baseDataset = realDataModule.mckDataset;
    const latestSnapshotFinancial = latestByAsOfDate(payload.snapshot?.financialPeriods ?? []);
    const backendDataset = buildDatasetFromSnapshot(baseDataset, payload.snapshot);
    const latestMappedFinancial = backendDataset.reportedFinancials[backendDataset.reportedFinancials.length - 1];
    const market = backendDataset.market;
    const backendAssumptions = buildAsOfAssumptions({
      snapshot: payload.snapshot,
      latestFinancial: latestSnapshotFinancial,
      market,
      payloadAssumptions: payload.assumptions,
    });
    const dashboard = calculations.buildMckDashboardData(backendDataset, backendAssumptions, payload.scenario);
    const valuation = dashboard.valuation;
    const selectedScenario = dashboard.scenarios.find((row) => row.scenario === payload.scenario) ?? dashboard.scenarios[0] ?? null;
    const backendSnapshot = {
      asOfDate: payload.asOfDate,
      reportingEventId: payload.reportingEventId,
      financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
      segmentFinancialCount: payload.snapshot?.segmentFinancials?.length ?? 0,
      marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
      guidanceItemCount: payload.snapshot?.guidanceItems?.length ?? 0,
      transcriptExtractionCount: payload.snapshot?.transcriptExtractions?.length ?? 0,
      valuationPeriodId: latestSnapshotFinancial?.periodId ?? latestMappedFinancial?.periodId ?? null,
      valuationPeriodType: latestSnapshotFinancial?.periodType ?? null,
      priceDate: market.priceDate,
      backendFcfPolicy: backendAssumptions.backendFcfPolicy ?? null,
      adapterWarnings: payload.adapterWarnings,
      sourcePolicy: {
        guidanceAutoPromotion: "disabled",
        transcriptValuationImpact: "research_only",
      },
    };
    return {
      currentPrice: backendAssumptions.currentPrice ?? market.currentPrice,
      recommendedFairValue: valuation.blendedFairValue,
      blendedFairValue: valuation.blendedFairValue,
      targetPrice3Y: selectedScenario?.targetPrice3Y ?? null,
      expectedReturn3Y: selectedScenario?.irr3Y ?? null,
      upsideDownside: selectedScenario?.upsideDownside ?? valuation.marginOfSafety,
      probabilityWeightedFairValue: valuation.blendedFairValue,
      methodCards: methodCards(valuation),
      sensitivityTables: dashboard.scenarios.map((row) => ({
        scenario: row.scenario,
        fairValue: row.fairValue,
        targetPrice3Y: row.targetPrice3Y,
        irr3Y: row.irr3Y,
        irr5Y: row.irr5Y,
        summary: row.summary,
      })),
      validationWarnings: [
        ...(valuation.warnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `mck-backend-adapter-gap-${index + 1}`,
          title: "MCK backend adapter note",
          detail,
          severity: index === 3 ? "medium" : "low",
        })),
      ],
      backendModelVersion: payload.modelVersion,
      backendSnapshot,
    };
  } finally {
    await server.close();
  }
}
