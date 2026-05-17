import { createServer } from "vite";
import { META_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

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

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 4) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function latestByAsOfDate(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate) || (left.periodId ?? "").localeCompare(right.periodId ?? ""));
  return sorted[sorted.length - 1] ?? null;
}

function financialForSnapshot(snapshot) {
  const rows = snapshot?.financialPeriods ?? [];
  const eventId = snapshot?.reportingEvent?.id;
  const eventRows = eventId ? rows.filter((row) => row.eventId === eventId) : [];
  return latestByAsOfDate(eventRows) ?? latestByAsOfDate(rows);
}

function matchingSegment(snapshot, periodId, segment) {
  return [...(snapshot?.segmentFinancials ?? [])]
    .reverse()
    .find((row) => row.periodId === periodId && row.segment === segment);
}

function lineage(sourceType, sourceName, period, asOfDate, confidence = "medium", treatment = "forecast_anchor") {
  return {
    sourceType,
    sourceName,
    period,
    asOfDate,
    retrievedAt: new Date().toISOString(),
    confidence,
    valuationTreatment: treatment,
  };
}

function sourceStatus(sourceType) {
  if (sourceType === "official_actual") return "official_actual";
  if (sourceType === "management_guidance") return "management_guidance";
  if (sourceType === "market_data") return "market_data";
  if (sourceType === "forecast_assumption") return "forecast_assumption";
  return "research_only";
}

function annualizedFinancial(row) {
  const multiplier = row?.periodType === "quarter" ? 4 : 1;
  return {
    revenue: finiteNumber(row.revenue) * multiplier,
    advertisingRevenue: finiteNumber(row.advertisingRevenue) * multiplier,
    familyOfAppsRevenue: finiteNumber(row.familyOfAppsRevenue) * multiplier,
    realityLabsRevenue: finiteNumber(row.realityLabsRevenue) * multiplier,
    familyOfAppsOperatingIncome: finiteNumber(row.familyOfAppsOperatingIncome) * multiplier,
    realityLabsOperatingLoss: Math.abs(finiteNumber(row.realityLabsOperatingLoss)) * multiplier,
    operatingIncome: finiteNumber(row.operatingIncome) * multiplier,
    netIncome: finiteNumber(row.netIncome) * multiplier,
    normalizedNetIncome: finiteNumber(row.normalizedNetIncome, finiteNumber(row.netIncome)) * multiplier,
    capex: finiteNumber(row.capex) * multiplier,
    depreciationAmortization: finiteNumber(row.depreciationAmortization) * multiplier,
    operatingCashFlow: finiteNumber(row.operatingCashFlow) * multiplier,
    freeCashFlow: finiteNumber(row.freeCashFlow) * multiplier,
    shareBasedCompensation: finiteNumber(row.shareBasedCompensation) * multiplier,
    buybacks: finiteNumber(row.buybacks) * multiplier,
    dividendsAndEquivalents: finiteNumber(row.dividendsAndEquivalents) * multiplier,
  };
}

function mapSourceDocuments(snapshot) {
  return (snapshot.sourceDocuments ?? []).map((source) => ({
    id: source.id,
    title: source.sourceName,
    url: source.sourceUrl ?? source.sourcePath ?? "",
    publisher: source.provenance === "SEC" ? "SEC" : "Analyst",
    sourceStatus: sourceStatus(source.sourceType),
    reportingPeriod: source.metadataJson?.lineage?.period ?? null,
    publishedDate: source.publishedDate ?? null,
    accessedDate: source.retrievedAt ?? snapshot.asOfDate,
    lineage: lineage(
      source.sourceType,
      source.sourceName,
      source.metadataJson?.lineage?.period ?? snapshot.reportingEvent?.fiscalPeriod ?? snapshot.asOfDate,
      source.publishedDate ?? snapshot.asOfDate,
      source.confidence ?? "medium",
      source.sourceType === "research_only" ? "scenario_only" : "forecast_anchor",
    ),
    notes: source.provenance ?? "",
  }));
}

function mapGuidance(snapshot) {
  return (snapshot.guidanceItems ?? [])
    .filter((row) => row.asOfDate <= snapshot.asOfDate && row.valuationImpactAllowed === 1)
    .map((row) => ({
      id: row.id,
      sourceStatus: "management_guidance",
      sourceId: row.sourceDocumentId ?? row.id,
      lineage: lineage("management_guidance", row.metric, row.metric, row.asOfDate, "medium", "scenario_only"),
      guidancePeriod: row.metric,
      revenueLow: row.metric.includes("revenue") ? row.low : undefined,
      revenueHigh: row.metric.includes("revenue") ? row.high : undefined,
      totalExpenseLow: row.metric.includes("expense") ? row.low : undefined,
      totalExpenseHigh: row.metric.includes("expense") ? row.high : undefined,
      capexLow: row.metric.includes("capex") ? row.low : undefined,
      capexHigh: row.metric.includes("capex") ? row.high : undefined,
      taxRateLow: row.metric.includes("tax") ? row.low : undefined,
      taxRateHigh: row.metric.includes("tax") ? row.high : undefined,
      notes: row.notes ?? "Candidate guidance is not valuation-impacting until promoted.",
    }));
}

function buildBackendDataset(snapshot, baseDataset, assumptions) {
  const financial = financialForSnapshot(snapshot);
  if (!financial) throw new Error("META snapshot has no financial period usable for valuation.");
  const annual = annualizedFinancial(financial);
  const foaSegment = matchingSegment(snapshot, financial.periodId, "Family of Apps");
  const rlSegment = matchingSegment(snapshot, financial.periodId, "Reality Labs");
  const asOfDate = snapshot.asOfDate;
  const sourceType = financial.sourceType ?? "research_only";
  const confidence = sourceType === "official_actual" ? "high" : "low";
  const dataLineage = lineage(
    sourceType,
    sourceType === "official_actual" ? "META official actual as-of financial row" : "META research-only historical as-of proxy",
    snapshot.reportingEvent?.fiscalPeriod ?? financial.periodId,
    asOfDate,
    confidence,
    sourceType === "official_actual" ? "forecast_anchor" : "scenario_only",
  );
  const baseMarket = snapshot.marketSnapshot ?? {};
  const currentPrice = finiteNumber(assumptions.currentPrice, finiteNumber(baseMarket.currentPrice, baseDataset.marketData.currentPrice));
  const dilutedShares = finiteNumber(assumptions.dilutedShares, finiteNumber(financial.dilutedShares, baseDataset.marketData.sharesForMarketCap));
  const netCash = finiteNumber(assumptions.netCash, finiteNumber(financial.netCash));
  const cashAndMarketableSecurities = finiteNumber(financial.cashAndMarketableSecurities, netCash + finiteNumber(financial.debt));
  const debt = finiteNumber(financial.debt);
  const operatingMargin = annual.revenue ? annual.operatingIncome / annual.revenue : 0;
  const normalizedNetIncome = annual.normalizedNetIncome || annual.netIncome;
  const normalizedDilutedEps = dilutedShares ? normalizedNetIncome / dilutedShares : finiteNumber(financial.normalizedDilutedEps);
  const period = {
    id: "fy2025",
    label: `${snapshot.reportingEvent?.fiscalPeriod ?? financial.periodId} as-of annualized baseline`,
    fiscalYear: snapshot.reportingEvent?.fiscalYear ?? financial.fiscalYear,
    periodType: "FY",
    sourceStatus: sourceStatus(sourceType),
    sourceId: financial.sourceDocumentId ?? financial.id,
    lineage: dataLineage,
    revenue: annual.revenue,
    costsAndExpenses: annual.revenue - annual.operatingIncome,
    operatingIncome: annual.operatingIncome,
    operatingMargin,
    incomeBeforeTax: annual.operatingIncome,
    taxProvision: annual.operatingIncome - normalizedNetIncome,
    effectiveTaxRate: annual.operatingIncome ? (annual.operatingIncome - normalizedNetIncome) / annual.operatingIncome : 0.16,
    netIncome: annual.netIncome,
    normalizedNetIncome,
    dilutedEps: dilutedShares ? annual.netIncome / dilutedShares : finiteNumber(financial.dilutedEps),
    normalizedDilutedEps,
    dilutedShares,
    basicShares: dilutedShares,
    cashAndMarketableSecurities,
    longTermDebt: debt,
    operatingLeaseLiabilities: 0,
    netCash,
    capitalExpendituresInclFinanceLeases: annual.capex,
    purchasesOfPropertyAndEquipment: annual.capex,
    principalPaymentsOnFinanceLeases: 0,
    operatingCashFlow: annual.operatingCashFlow,
    freeCashFlow: annual.freeCashFlow,
    depreciationAndAmortization: annual.depreciationAmortization,
    shareBasedCompensation: annual.shareBasedCompensation,
    shareRepurchases: annual.buybacks,
    dividendsAndEquivalents: annual.dividendsAndEquivalents,
    headcount: finiteNumber(financial.headcount),
    familyDailyActivePeople: finiteNumber(financial.familyDap),
    adImpressionsGrowth: finiteNumber(financial.adImpressionsGrowth),
    averagePricePerAdGrowth: finiteNumber(financial.averagePricePerAdGrowth),
    notes: `Backend as-of annualized baseline built from ${financial.periodId}; valuation formulas are unchanged.`,
  };
  const foaRevenue = annual.familyOfAppsRevenue || finiteNumber(foaSegment?.revenue) * (financial.periodType === "quarter" ? 4 : 1);
  const foaOperatingIncome = annual.familyOfAppsOperatingIncome || finiteNumber(foaSegment?.operatingIncome) * (financial.periodType === "quarter" ? 4 : 1);
  const rlRevenue = annual.realityLabsRevenue || finiteNumber(rlSegment?.revenue) * (financial.periodType === "quarter" ? 4 : 1);
  const rlOperatingIncome = -Math.abs(annual.realityLabsOperatingLoss || finiteNumber(rlSegment?.operatingIncome) * (financial.periodType === "quarter" ? 4 : 1));
  const segments = [
    {
      periodId: "fy2025",
      segment: "Family of Apps",
      sourceStatus: sourceStatus(sourceType),
      sourceId: foaSegment?.sourceDocumentId ?? financial.sourceDocumentId ?? financial.id,
      lineage: dataLineage,
      revenue: foaRevenue,
      operatingIncome: foaOperatingIncome,
      operatingMargin: foaRevenue ? foaOperatingIncome / foaRevenue : 0,
      notes: "Backend mapped as-of Family of Apps segment row.",
    },
    {
      periodId: "fy2025",
      segment: "Reality Labs",
      sourceStatus: sourceStatus(sourceType),
      sourceId: rlSegment?.sourceDocumentId ?? financial.sourceDocumentId ?? financial.id,
      lineage: dataLineage,
      revenue: rlRevenue,
      operatingIncome: rlOperatingIncome,
      operatingMargin: rlRevenue ? rlOperatingIncome / rlRevenue : 0,
      notes: "Backend mapped as-of Reality Labs segment row.",
    },
  ];
  const sources = mapSourceDocuments(snapshot);
  const sourceMap = Object.fromEntries(sources.map((source) => [source.id, source]));
  const adEconomics = [{
    periodId: "fy2025",
    sourceStatus: sourceStatus(sourceType),
    sourceId: financial.sourceDocumentId ?? financial.id,
    lineage: dataLineage,
    advertisingRevenue: annual.advertisingRevenue || foaRevenue * 0.985,
    familyDailyActivePeople: finiteNumber(financial.familyDap),
    adImpressionsGrowth: finiteNumber(financial.adImpressionsGrowth),
    averagePricePerAdGrowth: finiteNumber(financial.averagePricePerAdGrowth),
    constantCurrencyAdRevenueGrowth: undefined,
    adRevenueGrowth: undefined,
    impliedGrowthFromImpressionsAndPrice: (1 + finiteNumber(financial.adImpressionsGrowth)) * (1 + finiteNumber(financial.averagePricePerAdGrowth)) - 1,
    notes: "Backend as-of ad bridge; missing official KPIs remain null/proxy in source rows.",
  }];
  const aiCapex = [{
    periodId: "fy2025",
    sourceStatus: sourceStatus(sourceType),
    sourceId: financial.sourceDocumentId ?? financial.id,
    lineage: dataLineage,
    capexInclFinanceLeases: annual.capex,
    capexIntensity: annual.revenue ? annual.capex / annual.revenue : 0,
    cashFlowFromOperations: annual.operatingCashFlow,
    freeCashFlow: annual.freeCashFlow,
    contractualCommitments: 0,
    additionalCommitmentsAfterQuarter: 0,
    aiCapexShare: assumptions.aiCapexShare,
    notes: "AI capex split is an assumption. Total capex is from the as-of financial row.",
  }];
  const realityLabs = [{
    periodId: "fy2025",
    sourceStatus: sourceStatus(sourceType),
    sourceId: rlSegment?.sourceDocumentId ?? financial.sourceDocumentId ?? financial.id,
    lineage: dataLineage,
    revenue: rlRevenue,
    operatingLoss: Math.abs(rlOperatingIncome),
    revenueGrowth: undefined,
    optionValueTreatment: "explicit_sotp_option_only",
    notes: "Reality Labs remains a cash-flow drag and explicit SOTP option only.",
  }];
  const marketLineage = lineage("market_data", baseMarket.source ?? "META as-of market snapshot", baseMarket.priceDate ?? asOfDate, baseMarket.priceDate ?? asOfDate, "medium", "direct_input");
  return {
    ...cloneJson(baseDataset),
    latestReportingPeriod: "fy2025",
    sources,
    sourceMap,
    periods: [period],
    segments,
    guidance: mapGuidance(snapshot),
    adEconomics,
    aiCapex,
    realityLabs,
    marketData: {
      ticker: "META",
      sourceStatus: "market_data",
      sourceId: baseMarket.id ?? `meta-market-${asOfDate}`,
      lineage: marketLineage,
      currentPrice,
      priceDate: baseMarket.priceDate ?? asOfDate,
      source: baseMarket.source ?? "Backend as-of market snapshot",
      sharesForMarketCap: dilutedShares,
      marketCap: currentPrice * dilutedShares,
      enterpriseValue: currentPrice * dilutedShares - netCash,
      netCash,
      dividendPerShareAnnualized: finiteNumber(assumptions.dividendPerShare),
      dividendYield: currentPrice ? finiteNumber(assumptions.dividendPerShare) / currentPrice : 0,
      notes: "Backend market data is event-dated and may be overwritten by daily price bars.",
    },
    transcriptInsights: (snapshot.transcriptExtractions ?? []).map((row) => ({
      id: row.id,
      sourceStatus: "research_only",
      sourceId: row.id,
      lineage: lineage("research_only", "META transcript extraction candidate", row.topic ?? "transcript", row.asOfDate, "medium", "risk_monitor"),
      speaker: "Investor Relations",
      topic: row.topic ?? "Transcript candidate",
      valuationMapping: "source_context",
      notes: row.text ?? "",
    })),
    earningsCalls: (baseDataset.earningsCalls ?? []).filter((call) => call.callDate <= asOfDate),
    researchNotes: (baseDataset.researchNotes ?? []).map((note) => ({
      ...note,
      lineage: {
        ...note.lineage,
        asOfDate: note.lineage?.asOfDate && note.lineage.asOfDate <= asOfDate ? note.lineage.asOfDate : asOfDate,
      },
    })),
    __metaResolvedPeriod: "fy2025",
    __metaRequestedDataSourceType: "manual",
  };
}

async function loadMetaFrontendModules() {
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/meta/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/meta/data.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/meta/assumptions.ts");
    return {
      calculateMetaValuation: calculations.calculateMetaValuation,
      metaDataset: dataModule.metaDataset ?? dataModule.metaData,
      defaultAssumptions: assumptionsModule.defaultMetaValuationAssumptions,
    };
  } finally {
    await server.close();
  }
}

export async function runMetaBackendValuation({
  snapshot,
  scenario = "Base",
  modelVersion = META_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const { calculateMetaValuation, metaDataset, defaultAssumptions } = await loadMetaFrontendModules();
  const mergedAssumptions = { ...defaultAssumptions, ...assumptions };
  const dataset = buildBackendDataset(snapshot, metaDataset, mergedAssumptions);
  const valuation = calculateMetaValuation(dataset, "fy2025", scenario, mergedAssumptions);
  const selectedScenario = (valuation.fairValues ?? []).find((row) => row.scenario === scenario) ?? null;
  const sourceWarnings = [];
  const financial = financialForSnapshot(snapshot);
  if (financial?.sourceType !== "official_actual") {
    sourceWarnings.push({
      id: "meta-research-only-historical-financials",
      title: "Research-only historical financial proxy",
      detail: `${snapshot.reportingEvent?.fiscalPeriod ?? snapshot.asOfDate} lacks a local official quarterly financial row; it is modeled from a research-only proxy and clearly marked in dataSnapshotJson.`,
      severity: "medium",
    });
  }
  if (snapshot.transcriptExtractions?.some((row) => row.modelReady || row.valuationImpactAllowed)) {
    sourceWarnings.push({
      id: "meta-transcript-candidate-promoted",
      title: "Transcript candidate is valuation-impacting",
      detail: "Transcript extractions should remain risk-monitor candidates unless explicitly promoted.",
      severity: "high",
    });
  }
  return {
    ...valuation,
    modelVersion,
    currentPrice: mergedAssumptions.currentPrice,
    selectedScenario,
    validationWarnings: [...(valuation.validationWarnings ?? []), ...sourceWarnings],
    backendSnapshot: {
      ticker: "META",
      asOfDate: snapshot.asOfDate,
      reportingEvent: snapshot.reportingEvent,
      sourceDocumentCount: snapshot.sourceDocuments?.length ?? 0,
      financialPeriodCount: snapshot.financialPeriods?.length ?? 0,
      segmentFinancialCount: snapshot.segmentFinancials?.length ?? 0,
      guidanceCandidateCount: snapshot.guidanceItems?.length ?? 0,
      transcriptCandidateCount: snapshot.transcriptExtractions?.length ?? 0,
      selectedFinancialPeriod: financial
        ? {
            id: financial.id,
            periodId: financial.periodId,
            asOfDate: financial.asOfDate,
            sourceType: financial.sourceType,
            revenue: round(financial.revenue),
            operatingIncome: round(financial.operatingIncome),
            freeCashFlow: round(financial.freeCashFlow),
            capex: round(financial.capex),
          }
        : null,
      asOfAssumptionOverrides: {
        currentPrice: round(mergedAssumptions.currentPrice, 2),
        revenueGrowth2026: round(mergedAssumptions.revenueGrowth2026, 5),
        revenueCagr2027To2030: round(mergedAssumptions.revenueCagr2027To2030, 5),
        aiRevenueUpliftPct: round(mergedAssumptions.aiRevenueUpliftPct, 5),
        aiCapexShare: round(mergedAssumptions.aiCapexShare, 5),
        capex2026: round(mergedAssumptions.capex2026, 3),
        foaOperatingMargin: round(mergedAssumptions.foaOperatingMargin, 5),
        wacc: round(mergedAssumptions.wacc, 5),
        targetPe: round(mergedAssumptions.targetPe, 3),
        realityLabsOptionValue: round(mergedAssumptions.realityLabsOptionValue, 3),
        dilutedShares: round(mergedAssumptions.dilutedShares, 4),
        netCash: round(mergedAssumptions.netCash, 3),
        knownRegime: mergedAssumptions.__knownRegime ?? null,
      },
    },
  };
}
