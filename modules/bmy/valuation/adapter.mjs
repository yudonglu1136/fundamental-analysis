import { createServer } from "vite";
import { BMY_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

const TICKER = "BMY";

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

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function latestByAsOf(rows = []) {
  return [...rows].sort((left, right) => String(left.asOfDate ?? "").localeCompare(String(right.asOfDate ?? ""))).at(-1) ?? null;
}

function eventRows(rows = [], eventId) {
  return rows.filter((row) => row.eventId === eventId);
}

function visibleRows(rows = [], asOfDate, field = "asOfDate") {
  return rows.filter((row) => String(row[field] ?? "") <= String(asOfDate ?? "9999-12-31"));
}

function latestProductByName(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (row.revenue == null || Number(row.modelReady) !== 1) continue;
    const key = row.productName;
    const current = map.get(key);
    if (!current || String(row.asOfDate) > String(current.asOfDate)) map.set(key, row);
  }
  return [...map.values()];
}

function productRole(productName) {
  if (productName === "Revlimid") return "declining_legacy";
  if (productName === "Eliquis") return "core_cash_flow";
  if (["Cobenfy", "Breyanzi", "Camzyos", "Reblozyl", "Sotyktu", "Zeposia", "Abecma", "Growth Portfolio"].includes(productName)) return "growth_driver";
  return "option_asset";
}

function normalizeStage(stage) {
  if (stage === "approved") return "approved";
  if (stage === "filed") return "filed";
  if (stage === "phase_3") return "phase_3";
  if (stage === "phase_2") return "phase_2";
  if (stage === "phase_1") return "phase_1";
  return "platform";
}

function normalizedEps(financial) {
  if (!financial) return 6.0;
  const multiplier = financial.periodType === "quarter" ? 4 : 1;
  if (financial.adjustedDilutedEps != null && financial.adjustedDilutedEps > 0) return financial.adjustedDilutedEps * multiplier;
  if (financial.gaapDilutedEps != null && financial.gaapDilutedEps > 0) return financial.gaapDilutedEps * multiplier;
  if (financial.operatingIncome != null && financial.dilutedShares) return Math.max(0.5, (financial.operatingIncome * multiplier * 0.82) / financial.dilutedShares);
  if (financial.freeCashFlow != null && financial.dilutedShares) return Math.max(0.5, (financial.freeCashFlow * multiplier) / financial.dilutedShares);
  return 6.0;
}

function annualizedRevenue(financial) {
  if (!financial?.revenue) return 0;
  return financial.revenue * (financial.periodType === "quarter" ? 4 : 1);
}

function mapFinancialRows(snapshot) {
  const products = snapshot.productFinancials ?? [];
  return [...(snapshot.financialPeriods ?? [])]
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)))
    .map((row) => {
      const growthPortfolio = products.find((product) => product.eventId === row.eventId && product.productName === "Growth Portfolio" && product.revenue != null);
      return {
        period: row.fiscalQuarter ? `${row.fiscalQuarter} ${row.fiscalYear}` : row.periodId,
        revenue: row.revenue ?? 0,
        primaryGrowthMetricLabel: "Growth Portfolio",
        primaryGrowthMetric: growthPortfolio?.revenue ?? 0,
        operatingIncome: row.operatingIncome ?? undefined,
        nonGaapEps: row.adjustedDilutedEps ?? undefined,
        productGrossMargin: row.grossMargin ?? undefined,
        rAndD: row.researchAndDevelopmentExpense ?? undefined,
        sgAndA: row.sellingGeneralAdministrativeExpense ?? undefined,
        cashAndInvestments: row.cashAndInvestments ?? undefined,
        debt: row.debt ?? undefined,
        netDebt: row.netDebt ?? undefined,
        operatingCashFlow: row.operatingCashFlow ?? undefined,
        freeCashFlow: row.freeCashFlow ?? undefined,
        sourceEvidenceIds: [`bmy-sec-${row.eventId}`],
      };
    });
}

function mapProductRows(snapshot) {
  return latestProductByName(snapshot.productFinancials ?? [])
    .filter((row) => row.productName !== "Total revenue" && row.productName !== "Other growth portfolio products")
    .map((row) => ({
      name: row.productName,
      category: row.franchise ?? "Brand",
      latestQuarterRevenue: row.revenue ?? undefined,
      growth: row.sourceType === "official_actual" ? "Event-visible product disclosure." : "Research-only product context.",
      role: productRole(row.productName),
      moat: "BMY brand/franchise position; exact moat notes are retained in row metadata.",
      pressure: row.notes ?? "LOE, pricing, reimbursement, competition or execution risk.",
      sourceEvidenceIds: row.sourceDocumentId ? [row.sourceDocumentId] : [],
    }));
}

function mapPipelineRows(snapshot) {
  return (snapshot.pipelineEvents ?? [])
    .filter((row) => Number(row.modelReady) === 1 && Number(row.valuationImpactAllowed) === 1)
    .map((row) => ({
      assetName: row.assetName,
      modality: "Drug candidate",
      targetOrMechanism: row.targetOrMechanism ?? "Not specified",
      indication: row.indication ?? "Not specified",
      stage: normalizeStage(row.phase),
      expectedCatalyst: row.expectedCatalyst ?? row.eventType ?? "Pipeline milestone",
      strategicRole: row.assetName.includes("Cobenfy") ? "core" : "near_adjacent",
      estimatedLaunchYear: Math.round(finite(row.estimatedLaunchYear, Number(String(row.asOfDate).slice(0, 4)) || 2026)),
      estimatedPeakSales: finite(row.estimatedPeakSales, 0),
      probabilityOfSuccess: finite(row.probabilityOfSuccess, 0),
      discountRate: finite(row.discountRate, 0.12),
      developmentCostRemaining: finite(row.developmentCostRemaining, 0),
      economicsShare: finite(row.economicsShare, 1),
      evidenceScore: row.sourceType === "official_actual" ? 75 : 55,
      riskScore: row.sourceType === "official_actual" ? 50 : 70,
      assumptionType: row.sourceType === "official_actual" ? "official" : "research_only",
      sourceEvidenceIds: row.sourceDocumentId ? [row.sourceDocumentId] : [],
    }));
}

function assumptionForScenario(snapshot, scenario) {
  const eventId = snapshot.reportingEvent?.id;
  const set = (snapshot.assumptionSets ?? [])
    .filter((row) => row.scenario === scenario && (row.reportingEventId === eventId || row.asOfDate <= snapshot.asOfDate))
    .sort((left, right) => (left.reportingEventId === eventId ? -1 : right.reportingEventId === eventId ? 1 : String(right.asOfDate).localeCompare(String(left.asOfDate))))[0];
  return parseJson(set?.assumptionsJson, {});
}

function buildScenario(snapshot, scenario) {
  const financial = eventRows(snapshot.financialPeriods ?? [], snapshot.reportingEvent?.id)[0] ?? latestByAsOf(snapshot.financialPeriods ?? []);
  const assumptions = {
    coreMetricLabel: "Normalized EPS",
    coreMetricValue: normalizedEps(financial),
    coreMultiple: scenario === "Bear" ? 7.5 : scenario === "Bull" ? 12 : 9.5,
    pipelineHaircut: scenario === "Bear" ? 0.15 : scenario === "Bull" ? 0.6 : 0.35,
    platformOptionValue: scenario === "Bear" ? 0 : scenario === "Bull" ? 1_500 : 500,
    cashOrDebtAdjustment: 0,
    expectedDividends: 7.2,
    summary: `${scenario} event-visible BMY scenario.`,
    ...assumptionForScenario(snapshot, scenario),
  };
  return {
    scenario,
    coreMetricLabel: assumptions.coreMetricLabel,
    coreMetricValue: finite(assumptions.coreMetricValue, normalizedEps(financial)),
    coreMultiple: finite(assumptions.coreMultiple, 9.5),
    pipelineHaircut: finite(assumptions.pipelineHaircut, 0.35),
    platformOptionValue: finite(assumptions.platformOptionValue, 0),
    cashOrDebtAdjustment: finite(assumptions.cashOrDebtAdjustment, 0),
    expectedDividends: finite(assumptions.expectedDividends, 7.2),
    summary: assumptions.summary ?? `${scenario} event-visible BMY scenario.`,
  };
}

function rowAudit(snapshot) {
  const asOfDate = snapshot.asOfDate;
  const audit = [];
  const pushRows = (table, rows, field = "asOfDate") => {
    for (const row of rows ?? []) {
      audit.push({
        table,
        id: row.id,
        asOfDate: row[field] ?? row.asOfDate ?? row.eventDate ?? row.readoutDate ?? null,
      });
    }
  };
  pushRows("financial_periods", snapshot.financialPeriods);
  pushRows("segment_financials", snapshot.segmentFinancials);
  pushRows("product_financials", snapshot.productFinancials);
  pushRows("pipeline_events", snapshot.pipelineEvents);
  pushRows("clinical_readouts", snapshot.clinicalReadouts);
  pushRows("patent_exclusivity_events", snapshot.patentExclusivityEvents);
  pushRows("guidance_items", snapshot.guidanceItems);
  pushRows("transcript_events", snapshot.transcriptEvents, "eventDate");
  pushRows("daily_price_bars", snapshot.dailyPriceBar ? [snapshot.dailyPriceBar] : [], "priceDate");
  return audit.filter((row) => !row.asOfDate || String(row.asOfDate) <= String(asOfDate));
}

function buildDatasetFromSnapshot(baseDataset, snapshot) {
  const dataset = cloneJson(baseDataset);
  const financials = mapFinancialRows(snapshot);
  const latestFinancial = eventRows(snapshot.financialPeriods ?? [], snapshot.reportingEvent?.id)[0] ?? latestByAsOf(snapshot.financialPeriods ?? []);
  const market = snapshot.marketSnapshot ?? {};
  const currentPrice = finite(market.currentPrice, dataset.currentPrice);
  const priceDate = market.priceDate ?? snapshot.asOfDate;
  dataset.currentPrice = currentPrice;
  dataset.priceDate = priceDate;
  dataset.sharesOutstanding = finite(latestFinancial?.dilutedShares, finite(market.sharesOutstanding, dataset.sharesOutstanding));
  dataset.marketCap = dataset.currentPrice * dataset.sharesOutstanding;
  dataset.enterpriseValue = market.enterpriseValue ?? dataset.enterpriseValue;
  dataset.financials = financials.length ? financials : dataset.financials;
  dataset.products = mapProductRows(snapshot);
  dataset.pipeline = mapPipelineRows(snapshot);
  dataset.guidance = (snapshot.guidanceItems ?? [])
    .filter((row) => Number(row.modelReady) === 1)
    .map((row) => ({
      metric: row.metric,
      low: row.lowValue ?? undefined,
      high: row.highValue ?? undefined,
      midpoint: row.midpointValue ?? undefined,
      unit: row.unit === "USD/share" ? "USD/share" : row.unit === "percent" ? "percent" : "text",
      period: row.fiscalPeriodTarget ?? snapshot.reportingEvent?.fiscalPeriod ?? "",
      status: row.guidanceType === "explicit_guide" ? "reaffirmed" : "research_assumption",
      commentary: row.quote ?? "",
      sourceEvidenceIds: row.sourcePath ? [row.sourcePath] : [],
    }));
  dataset.valuationScenarios = ["Bear", "Base", "Bull"].map((scenario) => buildScenario(snapshot, scenario));
  dataset.crossChecks = [
    {
      label: "Annualized revenue",
      value: annualizedRevenue(latestFinancial),
      format: "currency",
      interpretation: "Event-visible SEC revenue annualized for quarterly snapshots.",
    },
    {
      label: "Normalized EPS",
      value: normalizedEps(latestFinancial),
      format: "number",
      interpretation: "As-of EPS anchor from GAAP EPS or operating income where adjusted EPS is unavailable.",
    },
  ];
  dataset.earnings = {
    ...dataset.earnings,
    quarters: (dataset.earnings?.quarters ?? []).filter((quarter) => quarter.callDate <= snapshot.asOfDate),
  };
  dataset.currentPeriodId = snapshot.reportingEvent?.id ?? dataset.currentPeriodId;
  return dataset;
}

export function buildBmyBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = BMY_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: TICKER,
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "BMY adapter calls the existing biopharma research valuation engine after mapping SQLite rows into an event-visible dataset.",
      "SEC Companyfacts provides official company-level financials; detailed brand rows are either curated from local evidence or marked gap/research-only.",
      "Pipeline, clinical, patent and transcript rows are date-gated and are non-valuation-impacting unless explicitly promoted.",
      "The current 2026-05-12 pipeline source is not visible to reporting events dated before that source date.",
    ],
  };
}

export async function runBmyBackendValuation(input) {
  const payload = buildBmyBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const researchModule = await server.ssrLoadModule("/src/stocks/bmy/researchData.ts");
    const engineModule = await server.ssrLoadModule("/src/stocks/biopharmaResearch/engine.ts");
    const snapshot = {
      ...payload.snapshot,
      financialPeriods: visibleRows(payload.snapshot?.financialPeriods ?? [], payload.asOfDate),
      segmentFinancials: visibleRows(payload.snapshot?.segmentFinancials ?? [], payload.asOfDate),
      productFinancials: visibleRows(payload.snapshot?.productFinancials ?? [], payload.asOfDate),
      pipelineEvents: visibleRows(payload.snapshot?.pipelineEvents ?? [], payload.asOfDate),
      clinicalReadouts: visibleRows(payload.snapshot?.clinicalReadouts ?? [], payload.asOfDate),
      patentExclusivityEvents: visibleRows(payload.snapshot?.patentExclusivityEvents ?? [], payload.asOfDate),
      guidanceItems: visibleRows(payload.snapshot?.guidanceItems ?? [], payload.asOfDate),
      transcriptEvents: visibleRows(payload.snapshot?.transcriptEvents ?? [], payload.asOfDate, "eventDate"),
      assumptionSets: visibleRows(payload.snapshot?.assumptionSets ?? [], payload.asOfDate),
    };
    const dataset = buildDatasetFromSnapshot(researchModule.bmyResearchData, snapshot);
    const valuation = engineModule.calculateBiopharmaValuation(dataset, payload.scenario);
    const selected = (valuation.fairValues ?? []).find((row) => row.scenario === payload.scenario) ?? valuation.fairValues?.find((row) => row.scenario === "Base") ?? null;
    const backendSnapshot = {
      asOfDate: payload.asOfDate,
      reportingEventId: payload.reportingEventId,
      fiscalPeriod: snapshot.reportingEvent?.fiscalPeriod ?? null,
      scenario: payload.scenario,
      modelVersion: payload.modelVersion,
      marketSnapshotId: snapshot.marketSnapshot?.id ?? null,
      asOfPriceSource: snapshot.asOfPriceSource ?? null,
      valuationPeriodId: eventRows(snapshot.financialPeriods ?? [], snapshot.reportingEvent?.id)[0]?.id ?? latestByAsOf(snapshot.financialPeriods ?? [])?.id ?? null,
      currentPrice: dataset.currentPrice,
      sharesOutstanding: dataset.sharesOutstanding,
      financialPeriodCount: snapshot.financialPeriods?.length ?? 0,
      productFinancialCount: snapshot.productFinancials?.length ?? 0,
      pipelineEventCount: snapshot.pipelineEvents?.length ?? 0,
      clinicalReadoutCount: snapshot.clinicalReadouts?.length ?? 0,
      patentEventCount: snapshot.patentExclusivityEvents?.length ?? 0,
      rowAudit: rowAudit(snapshot),
      adapterWarnings: payload.adapterWarnings,
      noFutureDataPolicy: "All mapped rows are filtered to asOfDate/eventDate/priceDate <= reporting event date before valuation.",
    };
    return {
      ...valuation,
      currentPrice: dataset.currentPrice,
      recommendedFairValue: selected?.fairValue ?? valuation.recommendedFairValue,
      targetPrice3Y: selected?.fairValue ?? valuation.recommendedFairValue,
      expectedReturn3Y: selected?.expectedReturn3Y ?? valuation.upsideDownside ?? null,
      upsideDownside: selected?.upsideDownside ?? valuation.upsideDownside ?? null,
      backendModelVersion: payload.modelVersion,
      backendSnapshot,
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `bmy-backend-adapter-note-${index + 1}`,
          title: "BMY backend adapter note",
          detail,
          severity: index === 1 ? "medium" : "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}
