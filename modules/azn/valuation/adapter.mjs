import { createServer } from "vite";
import { AZN_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

const AZN_TICKER = "AZN.L";
const DEFAULT_GBP_USD = 1.36372;
const therapyAreaKeyProducts = {
  Oncology: ["Tagrisso", "Imfinzi", "Calquence", "Lynparza", "Enhertu"],
  CVRM: ["Farxiga", "Brilinta", "Lokelma", "Crestor"],
  "Respiratory & Immunology": ["Symbicort", "Fasenra", "Breztri", "Airsupra"],
  "Infectious Disease": ["Beyfortus", "FluMist"],
  "Rare Disease": ["Ultomiris", "Soliris", "Koselugo", "Strensiq"],
  "Other Medicines": ["Legacy medicines"],
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function finiteObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value != null && Number.isFinite(value)));
}

function latestByAsOf(rows = []) {
  return [...rows].sort((left, right) => String(left.asOfDate ?? "").localeCompare(String(right.asOfDate ?? ""))).at(-1) ?? null;
}

function mapFinancialPeriod(row, market, basePeriod) {
  const revenue = numberOr(row?.revenue, basePeriod.totalRevenue);
  const coreOperatingProfit = numberOr(row?.adjustedOperatingProfit, revenue * 0.32);
  const coreOperatingMargin = coreOperatingProfit / Math.max(revenue, 1);
  const capex = numberOr(row?.capex, revenue * 0.055);
  const equityFreeCashFlow = numberOr(row?.equityFreeCashFlow, coreOperatingProfit * 0.72);
  const netOperatingCashFlow = equityFreeCashFlow + capex;
  return {
    ...basePeriod,
    id: "fy2025",
    label: `${row?.periodId ? String(row.periodId).toUpperCase() : "Backend"} event-visible run-rate`,
    fiscalYear: numberOr(row?.fiscalYear, basePeriod.fiscalYear),
    periodType: row?.periodType === "FY" ? "FY" : "Q",
    totalRevenue: revenue,
    productRevenue: revenue * 0.997,
    productSales: revenue * 0.95,
    allianceRevenue: revenue * 0.045,
    collaborationRevenue: revenue * 0.003,
    revenueGrowthActual: numberOr(row?.rawJson?.quarterRevenueGrowth, row?.rawJson?.quarterGrowth, basePeriod.revenueGrowthActual),
    revenueGrowthCer: numberOr(row?.rawJson?.quarterRevenueGrowthCer, basePeriod.revenueGrowthCer),
    reportedEps: numberOr(row?.adjustedEps, basePeriod.reportedEps) * 0.75,
    coreEps: numberOr(row?.adjustedEps, basePeriod.coreEps),
    reportedOperatingProfit: coreOperatingProfit * 0.76,
    coreOperatingProfit,
    reportedOperatingMargin: coreOperatingMargin * 0.76,
    coreOperatingMargin,
    grossMargin: basePeriod.grossMargin,
    coreGrossMargin: basePeriod.coreGrossMargin,
    rdExpense: revenue * 0.23,
    coreRdExpense: revenue * 0.225,
    sgaExpense: revenue * 0.31,
    coreSgaExpense: revenue * 0.255,
    netOperatingCashFlow,
    capex,
    netDebt: numberOr(row?.netDebt, basePeriod.netDebt),
    dividendPerShare: numberOr(row?.dividendPerShare, basePeriod.dividendPerShare ?? 3.2),
    sourceEvidenceIds: row?.sourceDocumentId ? [row.sourceDocumentId] : basePeriod.sourceEvidenceIds,
    backendSource: {
      periodId: row?.periodId,
      eventId: row?.eventId,
      asOfDate: row?.asOfDate,
      sourceType: row?.sourceType,
      marketSnapshotId: market?.id ?? null,
      runRateSnapshot: row?.rawJson?.runRateSnapshot === true,
      disclosedRevenue: row?.rawJson?.quarterRevenue ?? null,
      runRateRevenue: revenue,
    },
  };
}

function mapTherapyRows(rows, periodId, totalRevenue, baseRows) {
  const byArea = new Map(baseRows.map((row) => [row.therapyArea, row]));
  return rows.map((row) => {
    const base = byArea.get(row.therapyArea) ?? {};
    const revenue = numberOr(row.revenue, 0);
    return {
      ...base,
      periodId,
      therapyArea: row.therapyArea,
      revenue,
      yoyGrowthActual: numberOr(row.yoyGrowthActual, row.yoyGrowthCer ?? 0),
      yoyGrowthCer: numberOr(row.yoyGrowthCer, 0),
      percentageOfTotal: revenue / Math.max(totalRevenue, 1),
      operatingMarginProxy: numberOr(row.operatingMarginProxy, base.operatingMarginProxy ?? 0.3),
      keyProducts: base.keyProducts ?? therapyAreaKeyProducts[row.therapyArea] ?? [],
      growthDrivers: base.growthDrivers ?? ["Event-visible growth snapshot."],
      keyRisks: base.keyRisks ?? ["Pricing, LOE, reimbursement and competitive risk."],
      sourceEvidenceIds: row.sourceDocumentId ? [row.sourceDocumentId] : (base.sourceEvidenceIds ?? []),
    };
  });
}

function defaultExposure() {
  return {
    US: 0.4,
    Europe: 0.22,
    China: 0.13,
    Japan: 0.04,
    "Emerging Markets": 0.18,
    "Established RoW": 0.03,
    Global: 1,
  };
}

function mapProductRows(rows, periodId, baseRows) {
  const byDrug = new Map(baseRows.map((row) => [row.drugName, row]));
  return rows.map((row) => {
    const base = byDrug.get(row.productName) ?? {};
    return {
      ...base,
      periodId,
      drugName: row.productName,
      therapyArea: row.therapyArea ?? base.therapyArea ?? "Other Medicines",
      mechanism: base.mechanism ?? "Portfolio product",
      indication: base.indication ?? "Multiple approved indications",
      currentRevenue: numberOr(row.revenue, 0),
      revenueGrowthActual: numberOr(row.yoyGrowthActual, row.yoyGrowthCer ?? 0),
      revenueGrowthCer: numberOr(row.yoyGrowthCer, 0),
      marketPosition: base.marketPosition ?? "Event-visible revenue bridge placeholder pending official product-table extraction.",
      competitiveRisk: base.competitiveRisk ?? "Medium",
      pricingRisk: base.pricingRisk ?? "Medium",
      lifecycleExpansion: base.lifecycleExpansion ?? "Lifecycle strategy tracked through pipeline and regulatory events.",
      comboTherapyPotential: base.comboTherapyPotential ?? "Tracked in relevant therapy-area engine.",
      regionExposure: base.regionExposure ?? defaultExposure(),
      sourceEvidenceIds: row.sourceDocumentId ? [row.sourceDocumentId] : (base.sourceEvidenceIds ?? []),
    };
  });
}

function mapPipelineAssets(rows, baseAssets) {
  const byName = new Map(baseAssets.map((asset) => [asset.assetName, asset]));
  const latestRowsByAsset = new Map();
  for (const row of rows) {
    const current = latestRowsByAsset.get(row.assetName);
    if (!current || String(row.asOfDate ?? "") >= String(current.asOfDate ?? "")) latestRowsByAsset.set(row.assetName, row);
  }
  return [...latestRowsByAsset.values()]
    .filter((row) => Number(row.valuationImpactAllowed) === 1 && Number(row.modelReady) === 1)
    .map((row) => {
      const raw = row.rawJson ?? {};
      const base = byName.get(row.assetName) ?? raw ?? {};
      return {
        ...base,
        assetName: row.assetName,
        modality: base.modality ?? "Biopharma asset",
        mechanism: base.mechanism ?? "Mechanism under review",
        therapyArea: row.therapyArea ?? base.therapyArea ?? "Oncology",
        indication: row.indication ?? base.indication ?? "Tracked indication",
        phase: row.phase ?? base.phase ?? "Phase 2",
        trialName: base.trialName ?? "Event-visible pipeline tracker",
        targetPopulation: base.targetPopulation ?? "Defined in official pipeline update",
        peakSalesEstimate: numberOr(row.peakSales, base.peakSalesEstimate ?? 0),
        probabilityOfSuccess: numberOr(row.probabilityOfSuccess, base.probabilityOfSuccess ?? 0),
        launchYearEstimate: numberOr(row.launchYear, base.launchYearEstimate ?? 2030),
        patentLifeEstimate: numberOr(row.patentLife, base.patentLifeEstimate ?? 10),
        regulatoryMilestone: base.regulatoryMilestone ?? row.rationale ?? "Milestone tracked by event date.",
        nextCatalystDate: base.nextCatalystDate ?? row.asOfDate,
        catalystType: base.catalystType ?? "Clinical / regulatory",
        riskLevel: base.riskLevel ?? "Medium",
        sourceQuality: "research_only",
        researchOnlyEstimate: true,
        sourceEvidenceIds: row.sourceDocumentId ? [row.sourceDocumentId] : (base.sourceEvidenceIds ?? []),
        backendSource: {
          id: row.id,
          asOfDate: row.asOfDate,
          sourceType: row.sourceType,
          valuationImpactAllowed: Boolean(row.valuationImpactAllowed),
        },
      };
    });
}

function mapMarketData(baseMarket, market, latestFinancial) {
  if (!market) return baseMarket;
  const gbpUsd = numberOr(baseMarket.gbpUsd, DEFAULT_GBP_USD);
  const currentPriceGbp = numberOr(market.currentPrice, baseMarket.londonPriceGbp);
  const sharesOutstandingM = numberOr(market.sharesOutstanding, baseMarket.sharesOutstandingM);
  const marketCapGbpM = numberOr(market.marketCap, currentPriceGbp * sharesOutstandingM);
  const enterpriseValueUsdM = numberOr(market.enterpriseValue, marketCapGbpM * gbpUsd + numberOr(latestFinancial?.netDebt, 0));
  const dividendPerShareUsd = numberOr(latestFinancial?.dividendPerShare, baseMarket.dividendPerShareUsd);
  return {
    ...baseMarket,
    londonTicker: AZN_TICKER,
    londonPriceGbp: currentPriceGbp,
    londonPriceGbx: currentPriceGbp * 100,
    gbpUsd,
    sharesOutstandingM,
    marketCapGbpM,
    marketCapUsdM: marketCapGbpM * gbpUsd,
    enterpriseValueUsdM,
    dividendPerShareUsd,
    dividendYield: numberOr(market.dividendYield, dividendPerShareUsd / Math.max(currentPriceGbp * gbpUsd, 1)),
    priceDate: market.priceDate ?? market.asOfDate ?? baseMarket.priceDate,
    sourceName: "AZN backend market snapshot",
    sourceUrl: market.source ?? baseMarket.sourceUrl,
    sourceQuality: "market_data",
    validationWarnings: [
      ...(baseMarket.validationWarnings ?? []),
      ...(String(market.source ?? "").includes("placeholder")
        ? [{
          id: "azn-backend-market-history-placeholder",
          title: "Historical market price is a seeded placeholder",
          detail: "Replace with event-date yfinance/Stooq bars before using the backend pilot for production decisions.",
          severity: "low",
        }]
        : []),
    ],
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot) {
  const dataset = cloneJson(baseDataset);
  const latestFinancial = latestByAsOf(snapshot?.financialPeriods ?? []);
  const market = snapshot?.marketSnapshot ?? null;
  const basePeriod = baseDataset.periods.find((period) => period.id === "fy2025") ?? baseDataset.periods[0];
  const mappedPeriod = mapFinancialPeriod(latestFinancial, market, basePeriod);
  const eventTherapyRows = (snapshot?.therapyAreaFinancials ?? []).filter((row) => row.eventId === snapshot?.reportingEvent?.id);
  const eventProductRows = (snapshot?.productFinancials ?? []).filter((row) => row.eventId === snapshot?.reportingEvent?.id);

  dataset.periods = [mappedPeriod];
  dataset.currentPeriodId = "fy2025";
  dataset.reportedData = {
    therapyAreas: mapTherapyRows(eventTherapyRows, "fy2025", mappedPeriod.totalRevenue, baseDataset.reportedData.therapyAreas),
    drugRevenue: mapProductRows(eventProductRows, "fy2025", baseDataset.reportedData.drugRevenue),
    geographies: baseDataset.reportedData.geographies.map((row) => ({
      ...row,
      periodId: "fy2025",
      revenue: mappedPeriod.totalRevenue * row.percentageOfTotal,
    })),
  };
  dataset.marketData = mapMarketData(baseDataset.marketData, market, latestFinancial);
  dataset.pipelineData = mapPipelineAssets(snapshot?.pipelineAssets ?? [], baseDataset.pipelineData);
  dataset.patentRiskData = (baseDataset.patentRiskData ?? []).filter((risk) => {
    const match = (snapshot?.patentExclusivityEvents ?? []).find((event) => event.productName === risk.product);
    return !match || String(match.asOfDate) <= String(snapshot?.asOfDate ?? "9999-12-31");
  });
  dataset.earningsCallData = (baseDataset.earningsCallData ?? []).filter((event) => event.eventDate <= (snapshot?.asOfDate ?? "9999-12-31"));
  dataset.backendSnapshot = {
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    valuationPeriodId: latestFinancial?.periodId ?? null,
    marketSnapshotId: market?.id ?? null,
  };
  return dataset;
}

function buildBackendMethodCards(valuation, snapshot, assumptions) {
  const latestFinancial = latestByAsOf(snapshot?.financialPeriods ?? []);
  const market = snapshot?.marketSnapshot;
  const marketCapGbpM = numberOr(market?.marketCap, 0);
  const enterpriseValueUsdM = numberOr(market?.enterpriseValue, 0);
  const ebitda = numberOr(latestFinancial?.adjustedEbitda, 0);
  const fcf = numberOr(latestFinancial?.equityFreeCashFlow, 0);
  const coreEps = numberOr(latestFinancial?.adjustedEps, 0);
  const gbpUsd = numberOr(assumptions.gbpUsd, DEFAULT_GBP_USD);
  return [
    ...(valuation.methodCards ?? []),
    {
      key: "azn-backend-fcff-dcf",
      label: "Backend FCFF DCF",
      value: valuation.dcfValue ?? null,
      format: "currency",
      description: "Existing AZN DCF formula using the event-visible backend financial snapshot.",
    },
    {
      key: "azn-backend-fcf-yield",
      label: "Backend FCF Yield",
      value: marketCapGbpM > 0 ? fcf / Math.max(marketCapGbpM * gbpUsd, 1) : null,
      format: "percent",
      description: "Event-visible free cash flow divided by event-date market capitalisation.",
    },
    {
      key: "azn-backend-ev-ebitda",
      label: "Backend EV / EBITDA",
      value: ebitda > 0 ? enterpriseValueUsdM / ebitda : null,
      format: "multiple",
      description: "Market snapshot enterprise value over event-visible adjusted EBITDA.",
    },
    {
      key: "azn-backend-pe-cross-check",
      label: "Backend P/E Cross-check",
      value: coreEps > 0 ? assumptions.currentPriceGbp * gbpUsd / coreEps : null,
      format: "multiple",
      description: "Event-date London price converted to USD divided by event-visible core EPS.",
    },
  ];
}

export function buildAznBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = AZN_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: AZN_TICKER,
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "AZN backend adapter maps SQLite reporting-event snapshots into the existing AZN pharma valuation engine; formulas are not duplicated.",
      "Q1/H1/Q3 rows use event-visible run-rate snapshots so interim valuation does not fall back to stale annual anchors.",
      "Pipeline rNPV rows are probability-adjusted and remain research-only unless explicitly promoted with valuationImpactAllowed=true.",
      "Transcript/Q&A extraction rows are display-only by default and do not change valuation assumptions.",
    ],
  };
}

export async function runAznBackendValuation(input) {
  const payload = buildAznBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/azn/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/azn/data/index.ts");
    const backendDataset = buildDatasetFromSnapshot(dataModule.aznDataset, payload.snapshot);
    const latestFinancial = latestByAsOf(payload.snapshot?.financialPeriods ?? []);
    const market = backendDataset.marketData;
    const backendAssumptions = {
      ...payload.assumptions,
      ...finiteObject({
        currentPriceGbp: market.londonPriceGbp,
        gbpUsd: market.gbpUsd,
        netDebtUsdM: latestFinancial?.netDebt,
        dividendPerShareUsd: latestFinancial?.dividendPerShare,
      }),
    };
    const valuation = calculations.calculateAznValuation(
      backendDataset,
      "fy2025",
      payload.scenario,
      backendAssumptions,
    );
    const methodCards = buildBackendMethodCards(valuation, payload.snapshot, backendAssumptions);
    const backendSnapshot = {
      asOfDate: payload.asOfDate,
      reportingEventId: payload.reportingEventId,
      fiscalPeriod: payload.snapshot?.reportingEvent?.fiscalPeriod ?? null,
      valuationPeriodId: latestFinancial?.periodId ?? null,
      marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
      guidanceSourceId: payload.snapshot?.guidanceItems?.find((row) => row.valuationImpactAllowed)?.id ?? null,
      pipelineAssumptionSetId: [...(payload.snapshot?.pipelineAssets ?? [])]
        .filter((row) => row.valuationImpactAllowed)
        .sort((left, right) => String(right.asOfDate ?? "").localeCompare(String(left.asOfDate ?? "")))[0]?.id ?? null,
      financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
      therapyAreaFinancialCount: payload.snapshot?.therapyAreaFinancials?.length ?? 0,
      productFinancialCount: payload.snapshot?.productFinancials?.length ?? 0,
      pipelineAssetCount: payload.snapshot?.pipelineAssets?.length ?? 0,
      pipelineMilestoneCount: payload.snapshot?.pipelineMilestones?.length ?? 0,
      transcriptExtractionCount: payload.snapshot?.transcriptExtractions?.length ?? 0,
      assumptionDilutedShares: backendDataset.marketData.sharesOutstandingM,
      financialWeightedAverageShares: latestFinancial?.weightedAverageShares ?? null,
      currentPriceGbp: backendAssumptions.currentPriceGbp,
      gbpUsd: backendAssumptions.gbpUsd,
      methodWeights: payload.assumptions.backendMethodWeights ?? AZN_BACKEND_MODEL_VERSION.valuationMethods,
      interimRunRateSnapshot: latestFinancial?.periodType !== "FY",
      noFutureDataPolicy: "Snapshot service filters every event-visible row to asOfDate/eventDate <= selected reporting event date.",
      dataSnapshotJson: {
        financialPeriodIds: (payload.snapshot?.financialPeriods ?? []).map((row) => row.periodId),
        therapyAreaEventIds: [...new Set((payload.snapshot?.therapyAreaFinancials ?? []).map((row) => row.eventId))],
        pipelineAsOfDates: [...new Set((payload.snapshot?.pipelineAssets ?? []).map((row) => row.asOfDate))],
      },
      adapterWarnings: payload.adapterWarnings,
    };
    return {
      ...valuation,
      methodCards,
      backendModelVersion: payload.modelVersion,
      backendSnapshot,
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `azn-backend-adapter-gap-${index + 1}`,
          title: "AZN backend adapter note",
          detail,
          severity: "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}
