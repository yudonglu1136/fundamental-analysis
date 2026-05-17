import { LEGN_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

const TICKER = "LEGN";

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function latestByAsOf(rows = [], dateField = "asOfDate") {
  return [...rows].sort((left, right) => String(left?.[dateField] ?? "").localeCompare(String(right?.[dateField] ?? ""))).at(-1) ?? null;
}

function snapshotRef(table, row, dateField = "asOfDate") {
  if (!row) return null;
  return {
    table,
    id: row.id,
    asOfDate: row[dateField] ?? row.eventDate ?? row.milestoneDate ?? null,
    eventId: row.eventId ?? null,
    sourceType: row.sourceType ?? null,
    valuationImpactAllowed: row.valuationImpactAllowed ?? null,
  };
}

function annualizeQuarterly(value) {
  return numberOr(value) * 4;
}

function computePipelineRnpv(asset, asOfDate, assumptions) {
  const currentYear = Number(String(asOfDate).slice(0, 4)) || 2026;
  const launchYear = numberOr(asset.launchYear, currentYear + 5);
  const yearsToLaunch = Math.max(0, launchYear - currentYear);
  const probability = Math.min(0.95, numberOr(asset.probabilityOfSuccess) * numberOr(assumptions.probabilityMultiplier, 1));
  const peakSales = numberOr(asset.peakSales) * numberOr(assumptions.peakSalesMultiplier, 1);
  const discountRate = Math.max(0.08, numberOr(asset.discountRate, 0.2) + numberOr(assumptions.discountRateShift, 0));
  const margin = Math.max(0.05, numberOr(asset.margin, 0.35) + numberOr(assumptions.marginShift, 0));
  const economicsShare = numberOr(asset.economicsShare, 1);
  const steadyStateProfit = peakSales * margin * economicsShare;
  const unadjustedValue = steadyStateProfit * 4.8;
  const probabilityAdjustedValue = unadjustedValue * probability;
  const discountedValue = probabilityAdjustedValue / (1 + discountRate) ** yearsToLaunch;
  return {
    assetId: asset.id,
    assetName: asset.assetName,
    phase: asset.phase,
    launchYear,
    peakSales,
    probabilityOfSuccess: probability,
    discountRate,
    unadjustedValue,
    probabilityAdjustedValue,
    rnpv: discountedValue,
    sourceType: asset.sourceType,
    asOfDate: asset.asOfDate,
  };
}

function defaultWeights(assumptions) {
  return assumptions.weights ?? {
    carvyktiProductNpv: 0.35,
    collaborationEconomics: 0.2,
    pipelineLabelRnpv: 0.2,
    cashAdjustedEvRevenue: 0.1,
    cashRunwayDilution: 0.1,
    peerBiotechMultiple: 0.05,
  };
}

export function runLegnBackendValuation({ snapshot, scenario = "Base", modelVersion = LEGN_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  const reportingEvent = snapshot?.reportingEvent;
  if (!reportingEvent) throw new Error("LEGN backend valuation requires a reporting event snapshot.");

  const financialPeriod = latestByAsOf((snapshot.financialPeriods ?? []).filter((row) => row.eventId === reportingEvent.id))
    ?? latestByAsOf(snapshot.financialPeriods ?? []);
  const marketSnapshot = latestByAsOf(snapshot.marketSnapshots ?? []);
  const carvyktiSnapshot = latestByAsOf(snapshot.carvyktiCommercialSnapshots ?? []);
  const collaborationSnapshot = latestByAsOf(snapshot.collaborationEconomicsSnapshots ?? []);
  const cashSnapshot = latestByAsOf(snapshot.cashRunwaySnapshots ?? []);
  const dilutionSnapshot = latestByAsOf(snapshot.dilutionSnapshots ?? []);
  const peerSnapshot = latestByAsOf(snapshot.peerSnapshots ?? []);
  const pipelineAssets = (snapshot.pipelineAssets ?? []).filter((row) => Number(row.valuationImpactAllowed) === 1 && Number(row.modelReady) === 1);

  const adsOutstanding = numberOr(marketSnapshot?.adsOutstanding, numberOr(financialPeriod?.adsOutstanding, numberOr(dilutionSnapshot?.adsOutstanding, 180)));
  const currentPrice = numberOr(marketSnapshot?.currentPrice, numberOr(financialPeriod?.currentPrice, 0));
  const currentMarketCap = numberOr(marketSnapshot?.marketCap, currentPrice * adsOutstanding);
  const cash = numberOr(cashSnapshot?.cashAndInvestments, numberOr(financialPeriod?.cashAndInvestments, 0));
  const quarterlyBurn = Math.max(0, numberOr(cashSnapshot?.quarterlyBurn, numberOr(financialPeriod?.quarterlyBurn, 0)));
  const runwayQuarters = quarterlyBurn > 0 ? cash / quarterlyBurn : 99;
  const carvyktiNts = numberOr(carvyktiSnapshot?.globalNetTradeSales, 0);
  const currentNtsRunRate = annualizeQuarterly(carvyktiNts);
  const legendRevenueShare = numberOr(collaborationSnapshot?.legendRevenueShare, carvyktiNts > 0 ? 0.5 : 0);
  const legendProfitShare = numberOr(collaborationSnapshot?.legendProfitShare, 0.5);
  const annualDoseCapacity = numberOr(carvyktiSnapshot?.annualDoseCapacity, 0);
  const capacitySalesCeiling = annualDoseCapacity > 0 ? annualDoseCapacity * 0.48 : currentNtsRunRate * 2.5;
  const visibleCommercialPeak = Math.max(currentNtsRunRate * 1.6, Math.min(capacitySalesCeiling, currentNtsRunRate * 2.8));
  const scenarioPeak = visibleCommercialPeak * numberOr(assumptions.peakSalesMultiplier, 1);
  const commercialMargin = Math.max(0.1, 0.42 + numberOr(assumptions.marginShift, 0));
  const discountRate = Math.max(0.09, 0.12 + numberOr(assumptions.discountRateShift, 0));
  const productNpv = carvyktiNts > 0 ? (scenarioPeak * commercialMargin * 5.2) / (1 + discountRate) : 0;
  const collaborationValue = productNpv * legendProfitShare * Math.max(0.65, legendRevenueShare * 1.45);

  const pipelineComponents = pipelineAssets.map((asset) => computePipelineRnpv(asset, snapshot.asOfDate, assumptions));
  const currentCommercialAssetIds = new Set(["legn-pipeline-carvykti-launched", "legn-pipeline-carvykti-2l-4l-expansion"]);
  const labelAndPipelineRnpv = pipelineComponents
    .filter((item) => !currentCommercialAssetIds.has(item.assetId))
    .reduce((sum, item) => sum + item.rnpv, 0);
  const crossCheckRevenue = Math.max(numberOr(financialPeriod?.totalRevenue, 0), numberOr(financialPeriod?.collaborationRevenue, 0), currentNtsRunRate * legendRevenueShare);
  const peerMultiple = numberOr(peerSnapshot?.evToRevenue, carvyktiNts > 0 ? 6 : 9);
  const cashAdjustedCrossCheck = Math.max(0, crossCheckRevenue * peerMultiple + cash - numberOr(collaborationSnapshot?.advancedFundingBalance, 0));
  const dilutionPct = Math.min(0.25, numberOr(dilutionSnapshot?.expectedDilutionPct, 0.05) * numberOr(assumptions.dilutionMultiplier, 1));
  const cashRunwayValue = Math.max(0, cash - quarterlyBurn * 4) * (1 - dilutionPct);
  const peerValue = Math.max(0, currentMarketCap * (carvyktiNts > 0 ? 1.05 : 0.85));

  const weights = defaultWeights(assumptions);
  const weightedEquityValue =
    productNpv * weights.carvyktiProductNpv +
    collaborationValue * weights.collaborationEconomics +
    labelAndPipelineRnpv * weights.pipelineLabelRnpv +
    cashAdjustedCrossCheck * weights.cashAdjustedEvRevenue +
    cashRunwayValue * weights.cashRunwayDilution +
    peerValue * weights.peerBiotechMultiple;
  const fairValue = adsOutstanding > 0 ? weightedEquityValue / adsOutstanding : null;
  const upsideDownside = fairValue != null && currentPrice > 0 ? fairValue / currentPrice - 1 : null;
  const expectedReturn3Y = fairValue != null && currentPrice > 0 ? (fairValue / currentPrice) ** (1 / 3) - 1 : null;

  const methodCards = [
    { key: "carvykti-product-npv", label: "CARVYKTI Product NPV", value: productNpv / Math.max(adsOutstanding, 1), format: "currency", description: "Commercial product NPV using event-visible CARVYKTI NTS and disclosed/known capacity constraints." },
    { key: "collaboration-economics", label: "Collaboration Economics", value: collaborationValue / Math.max(adsOutstanding, 1), format: "currency", description: "Janssen/J&J economics layer separated from gross CARVYKTI sales." },
    { key: "pipeline-rnpv", label: "Pipeline / Label Expansion rNPV", value: labelAndPipelineRnpv / Math.max(adsOutstanding, 1), format: "currency", description: "Probability-adjusted rNPV for event-visible label expansion and pipeline assets." },
    { key: "cash-adjusted-cross-check", label: "Cash-adjusted EV / Revenue", value: cashAdjustedCrossCheck / Math.max(adsOutstanding, 1), format: "currency", description: "10% weighted cross-check; not the primary method." },
    { key: "cash-runway-dilution", label: "Cash Runway / Dilution", value: cashRunwayValue / Math.max(adsOutstanding, 1), format: "currency", description: "Cash less near-term burn, capped dilution haircut." },
    { key: "peer-cross-check", label: "Peer Biotech Multiple", value: peerValue / Math.max(adsOutstanding, 1), format: "currency", description: "Low-weight peer cross-check." },
  ];

  const warnings = [];
  if (weights.carvyktiProductNpv + weights.collaborationEconomics > 0.6) {
    warnings.push({ id: "legn-carvykti-concentration", title: "CARVYKTI concentration", detail: "Current valuation remains dominated by CARVYKTI and partner economics.", severity: "medium" });
  }
  if (labelAndPipelineRnpv > weightedEquityValue * 0.45) {
    warnings.push({ id: "legn-pipeline-dominance", title: "Pipeline dominance warning", detail: "Pipeline rNPV is a large share of fair value; treat as high risk.", severity: "high" });
  }
  if (runwayQuarters < 8) {
    warnings.push({ id: "legn-runway-risk", title: "Cash runway risk", detail: "Runway is below eight quarters in this event-visible snapshot.", severity: "high" });
  }

  const dataSnapshotRows = [
    snapshotRef("reporting_events", reportingEvent, "eventDate"),
    snapshotRef("financial_periods", financialPeriod),
    snapshotRef("market_snapshots", marketSnapshot),
    snapshotRef("carvykti_commercial_snapshots", carvyktiSnapshot),
    snapshotRef("collaboration_economics_snapshots", collaborationSnapshot),
    snapshotRef("cash_runway_snapshots", cashSnapshot),
    snapshotRef("dilution_snapshots", dilutionSnapshot),
    snapshotRef("peer_snapshots", peerSnapshot),
    ...pipelineAssets.map((row) => snapshotRef("pipeline_assets", row)),
  ].filter(Boolean);

  return {
    ticker: TICKER,
    scenario,
    modelVersion,
    currentPrice,
    priceDate: marketSnapshot?.priceDate ?? snapshot.asOfDate,
    recommendedFairValue: fairValue,
    fairValues: [{ scenario, fairValue, upsideDownside, expectedReturn3Y, summary: "Event-visible LEGN cell therapy NAV." }],
    methodCards,
    expectedReturnBridge: [
      { key: "current-price", label: "Current Price", value: currentPrice, format: "currency" },
      { key: "fair-value", label: "Fair Value", value: fairValue, format: "currency" },
      { key: "upside-downside", label: "Upside / Downside", value: upsideDownside, format: "percent" },
    ],
    sensitivityTables: [{
      title: "LEGN Method Weight Bridge",
      table: [
        ["Method", "Weight", "Equity value"],
        ["CARVYKTI product NPV", weights.carvyktiProductNpv, productNpv],
        ["Collaboration economics", weights.collaborationEconomics, collaborationValue],
        ["Pipeline / label rNPV", weights.pipelineLabelRnpv, labelAndPipelineRnpv],
        ["Cash-adjusted EV / revenue", weights.cashAdjustedEvRevenue, cashAdjustedCrossCheck],
        ["Cash runway / dilution", weights.cashRunwayDilution, cashRunwayValue],
        ["Peer biotech multiple", weights.peerBiotechMultiple, peerValue],
      ],
    }],
    validationWarnings: warnings,
    probabilityWeightedFairValue: fairValue,
    upsideDownside,
    expectedReturn3Y,
    backendSnapshot: {
      asOfDate: snapshot.asOfDate,
      reportingEventId: reportingEvent.id,
      fiscalPeriod: reportingEvent.fiscalPeriod,
      valuationPeriodId: financialPeriod?.id ?? null,
      marketSnapshotId: marketSnapshot?.id ?? null,
      cashSnapshotId: cashSnapshot?.id ?? null,
      collaborationEconomicsSnapshotId: collaborationSnapshot?.id ?? null,
      pipelineAssumptionSetId: snapshot.assumptionSet?.id ?? null,
      pipelineComponents,
      carvyktiCurrentCommercialValue: productNpv,
      collaborationEconomicsValue: collaborationValue,
      labelExpansionAndPipelineRnpv: labelAndPipelineRnpv,
      cashRunwayQuarters: runwayQuarters,
      dilutionPct,
      dataSnapshotRows,
      noFutureDataGuardrail: dataSnapshotRows.every((row) => String(row.asOfDate ?? "") <= String(snapshot.asOfDate)),
      quarterlyAnchorGuardrail: reportingEvent.eventType === "quarterly_results" || reportingEvent.eventType === "commercial_update"
        ? financialPeriod?.eventId === reportingEvent.id
        : true,
      researchOnlyPromotionPolicy: "research_only rows are not used directly; valuation inputs come from forecast_assumption, collaboration_assumption, pipeline_assumption and market_data layers.",
    },
  };
}
