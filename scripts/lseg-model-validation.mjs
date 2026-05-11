import { createServer } from "vite";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function closeTo(actual, expected, precision = 6) {
  return Math.abs(actual - expected) < 0.5 * 10 ** -precision;
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});

try {
  const calculations = await server.ssrLoadModule("/src/stocks/lseg/calculations.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/lseg/data.ts");
  const configModule = await server.ssrLoadModule("/src/stocks/lseg/config.ts");
  const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");
  const scenarioEngine = await server.ssrLoadModule("/src/stocks/lseg/engines/scenarioEngine.ts");
  const sotpEngineModule = await server.ssrLoadModule("/src/stocks/lseg/engines/sotpEngine.ts");
  const actualsModule = await server.ssrLoadModule("/src/stocks/lseg/data/actuals.ts");
  const guidanceModule = await server.ssrLoadModule("/src/stocks/lseg/data/guidance.ts");
  const forecastAnchorsModule = await server.ssrLoadModule("/src/stocks/lseg/data/forecastAnchors.ts");
  const composeDatasetModule = await server.ssrLoadModule("/src/stocks/lseg/data/loaders/composeDataset.ts");
  const marketDataModule = await server.ssrLoadModule("/src/stocks/lseg/data/lsegMarketData.ts");
  const peerLayerModule = await server.ssrLoadModule("/src/stocks/lseg/data/lsegPeers.ts");
  const rawPeerMarketModule = await server.ssrLoadModule("/src/stocks/lseg/data/marketData.ts");
  const sotpPeerGuardrailsModule = await server.ssrLoadModule("/src/stocks/lseg/data/sotpPeerGuardrails.ts");
  const transcriptModule = await server.ssrLoadModule("/src/stocks/lseg/data/transcripts/index.ts");

  const period = calculations.getDefaultLsegPeriod();
  const runtimeData = calculations.attachLsegRuntimeContext(dataModule.lsegMockData, { periodId: period, dataSourceType: "mock" });
  const dashboard = calculations.buildLsegDashboardData(runtimeData, period, "Base");
  const valuation = calculations.calculateLsegValuation(runtimeData, period, "Base");
  const lsegModule = configModule.lsegModule;

  assert(registryModule.stockRegistry.LSEG === lsegModule, "LSEG must remain loaded through the stock registry.");
  assert(lsegModule.data, "LSEG module must expose module.data.");
  assert(typeof lsegModule.calculateSummary === "function", "LSEG module must expose calculateSummary.");
  assert(typeof lsegModule.calculateValuation === "function", "LSEG module must expose calculateValuation.");
  assert(typeof lsegModule.Dashboard === "function", "LSEG module must expose Dashboard.");
  assert(typeof lsegModule.valuationConfig?.calculateValuation === "function", "LSEG valuationConfig must expose calculateValuation.");

  assert(actualsModule.lsegActualFinancials.every((row) => row.fiscalYear <= 2025), "actuals.ts must not contain forward forecast periods.");
  assert(actualsModule.lsegActualSegmentFinancials.every((row) => row.periodId !== "fy26"), "Actual segment rows must not contain FY2026 modeled anchors.");
  assert(guidanceModule.lsegGuidance.every((row) => !("totalIncomeExcludingRecoveries" in row)), "guidance.ts must store ranges / targets, not hidden full forecast rows.");
  assert(forecastAnchorsModule.lsegForecastFinancialEnvelopes.every((entry) => entry.provenance.qualityTag === "Forecast Anchor"), "Forecast financial anchors must declare Forecast Anchor provenance.");
  assert(
    forecastAnchorsModule.lsegForecastFinancialEnvelopes.every((entry) => typeof entry.provenance.source === "string" && entry.provenance.source.length > 0),
    "Forecast anchor rows must declare a bridge source.",
  );
  assert(
    forecastAnchorsModule.lsegAnalyticalSplitSegmentEnvelopes.every((entry) => entry.provenance.sourceType === "analyst_estimate"),
    "Analytical split rows should remain explicitly tagged as analyst estimates unless company disclosure exists.",
  );
  const composedDataset = composeDatasetModule.composeLsegDataset();
  ["periods", "segmentFinancials", "kpis", "tradewebMonthly", "peers", "macro", "guidance", "consensus", "marketData", "sotpInputs", "ownership", "corporateReconciliation"].forEach((field) => {
    assert(field in composedDataset, `Composed dataset must preserve required LsegDashboardDataset field: ${field}.`);
  });
  assert(composedDataset.periods.length === dataModule.lsegMockData.periods.length, "Composed dataset should preserve financial-period row count.");
  assert(composedDataset.segmentFinancials.length === dataModule.lsegMockData.segmentFinancials.length, "Composed dataset should preserve segment row count.");
  assert(typeof composedDataset.marketData.priceDate === "string" || typeof composedDataset.marketData.fetchedAt === "string", "Market data must expose an as-of date or fetchedAt timestamp.");
  assert(Number.isFinite(composedDataset.marketData.currentPrice), "Market data current price must be finite.");
  assert(
    Number.isFinite(composedDataset.marketData.currentPriceGbp ?? composedDataset.marketData.currentPrice) &&
      (composedDataset.marketData.currentPriceGbp ?? composedDataset.marketData.currentPrice) > 10 &&
      (composedDataset.marketData.currentPriceGbp ?? composedDataset.marketData.currentPrice) < 200,
    "Normalized LSEG currentPriceGbp must be in a reasonable GBP range.",
  );
  assert(
    (composedDataset.marketData.marketCapGbp ?? 0) > 1_000_000_000,
    "marketCapGbp must remain GBP-scale and must not be accidentally divided by 100.",
  );
  assert(
    (composedDataset.marketData.enterpriseValueGbp ?? 0) > 1_000_000_000,
    "enterpriseValueGbp must remain GBP-scale and must not be accidentally divided by 100.",
  );
  assert(
    closeTo((composedDataset.marketData.marketCapGbp ?? 0) / 1_000_000, composedDataset.marketData.marketCap, 6),
    "Legacy marketCap alias should remain in GBP millions for the current model.",
  );
  assert(
    closeTo((composedDataset.marketData.enterpriseValueGbp ?? 0) / 1_000_000, composedDataset.marketData.enterpriseValue, 6),
    "Legacy enterpriseValue alias should remain in GBP millions for the current model.",
  );
  if (composedDataset.marketData.dividendYield == null) {
    assert(
      composedDataset.marketData.validationWarnings?.some((warning) => warning.id === "lseg-yahoo-dividend-yield-missing"),
      "Missing dividendYield must surface a validation warning.",
    );
  }
  assert(Number.isFinite(marketDataModule.manualLsegMarketDataFallback.currentPrice), "Manual market data fallback must remain available.");
  assert(
    marketDataModule.manualLsegMarketDataFallback.providerSourceType === "manual_snapshot",
    "Manual market data fallback should remain labeled as a manual snapshot.",
  );
  const expectedYfinancePeers = ["ICE", "CME", "SPGI", "MCO", "TRI", "RELX", "EXPN.L", "NDAQ", "DB1.DE", "ENX.PA"];
  const manualFallbackPeers = ["FDS", "MSCI", "TW", "MKTX"];
  const yfinancePeerTickers = new Set(rawPeerMarketModule.lsegYfinancePeerMultiples.map((row) => row.ticker));
  expectedYfinancePeers.forEach((ticker) => {
    assert(yfinancePeerTickers.has(ticker), `Expected yfinance peer ${ticker} must exist in the local snapshot.`);
  });
  const finalPeerMap = new Map(peerLayerModule.lsegPeers.map((row) => [row.ticker ?? row.peer, row]));
  manualFallbackPeers.forEach((ticker) => {
    assert(finalPeerMap.has(ticker), `Manual fallback peer ${ticker} must remain in the final peer layer.`);
  });
  expectedYfinancePeers.forEach((ticker) => {
    const row = finalPeerMap.get(ticker);
    assert(row, `Final peer layer must include ${ticker}.`);
    assert(typeof row.source === "string" && row.source.length > 0, `${ticker} must expose source provenance.`);
    assert(typeof row.fetchedAt === "string" && row.fetchedAt.length > 0, `${ticker} must expose fetchedAt provenance.`);
    assert(typeof row.currency === "string" && row.currency.length > 0, `${ticker} must expose currency metadata.`);
  });
  peerLayerModule.lsegPeers.forEach((row) => {
    assert(Number.isFinite(row.forwardPe), `Peer ${row.ticker ?? row.peer} forwardPe must be finite after fallback.`);
    assert(Number.isFinite(row.forwardEVEbitda ?? row.ebitdaMultiple), `Peer ${row.ticker ?? row.peer} EV/EBITDA must be finite after fallback.`);
    if (row.marketCap != null || row.enterpriseValue != null) {
      assert(row.absoluteValueAggregationAllowed === false, `Peer ${row.ticker ?? row.peer} absolute values must be metadata-only.`);
      assert(row.absoluteValueUse === "metadata_only", `Peer ${row.ticker ?? row.peer} must mark absolute values as metadata_only.`);
    }
  });
  assert(rawPeerMarketModule.lsegYfinancePeerAudit.hasMixedCurrencies === true, "Peer audit should flag mixed currencies.");
  assert(rawPeerMarketModule.lsegYfinancePeerAudit.absoluteMarketCapAggregationAllowed === false, "Absolute peer field aggregation must remain disabled.");
  assert(
    rawPeerMarketModule.lsegYfinancePeerMultiples.every((row) => row.absoluteValueAggregationAllowed === false && row.absoluteValueUse === "metadata_only"),
    "Raw yfinance peer rows must mark marketCap and enterpriseValue as metadata only.",
  );
  assert(
    peerLayerModule.lsegPeerLayerWarnings.some((warning) => warning.id === "lseg-peer-group-electronic_trading-insufficient"),
    "Peer layer should emit a warning when a peer-derived group has fewer than three valid external peers.",
  );
  assert(
    !peerLayerModule.lsegPeerLayerWarnings.some((warning) => /throw/i.test(warning.message)),
    "Missing yfinance fields should emit warnings rather than throw during module load.",
  );
  assert(
    sotpPeerGuardrailsModule.sotpPeerGuardrails.Markets.supportingPeers.some((peer) => peer.ticker === "ENX.PA") &&
      !sotpPeerGuardrailsModule.sotpPeerGuardrails.Markets.supportingPeers.some((peer) => peer.ticker === "ENX"),
    "Markets guardrail should use ENX.PA rather than stale ENX ticker.",
  );
  assert(
    sotpPeerGuardrailsModule.sotpPeerGuardrails["Post Trade"].supportingPeers.some((peer) => peer.ticker === "DB1.DE") &&
      !sotpPeerGuardrailsModule.sotpPeerGuardrails["Post Trade"].supportingPeers.some((peer) => peer.ticker === "DB1"),
    "Post Trade guardrail should use DB1.DE rather than stale DB1 ticker.",
  );
  assert(closeTo(sotpPeerGuardrailsModule.sotpPeerGuardrails.Markets.median, 16, 6), "Markets guardrail median must remain unchanged.");
  assert(closeTo(sotpPeerGuardrailsModule.sotpPeerGuardrails.Markets.rangeLow, 13, 6), "Markets guardrail low must remain unchanged.");
  assert(closeTo(sotpPeerGuardrailsModule.sotpPeerGuardrails.Markets.rangeHigh, 20, 6), "Markets guardrail high must remain unchanged.");
  assert(closeTo(sotpPeerGuardrailsModule.sotpPeerGuardrails["Post Trade"].median, 17, 6), "Post Trade guardrail median must remain unchanged.");

  const altPeriod = "fy24";
  const altRuntimeData = calculations.attachLsegRuntimeContext(dataModule.lsegMockData, { periodId: altPeriod, dataSourceType: "mock" });
  const altValuationFromConfig = lsegModule.valuationConfig.calculateValuation({}, altRuntimeData, "Base");
  const altValuationDirect = calculations.calculateLsegValuation(dataModule.lsegMockData, altPeriod, "Base");
  assert(closeTo(altValuationFromConfig.blendedFairValue ?? 0, altValuationDirect.blendedFairValue ?? 0, 6), "valuationConfig.calculateValuation must respect period-aware runtime data.");
  assert(closeTo(altValuationFromConfig.dcfValue ?? 0, altValuationDirect.dcfValue ?? 0, 6), "valuationConfig.calculateValuation must match direct period-aware DCF results.");

  const unsupportedSourceDashboard = calculations.buildLsegDashboardData(
    calculations.attachLsegRuntimeContext(dataModule.lsegMockData, { periodId: period, dataSourceType: "csv" }),
    period,
    "Base",
  );
  assert(unsupportedSourceDashboard.dataStatus.sourceType === "mock", "Unsupported LSEG source modes must fall back to mock data.");
  assert(
    unsupportedSourceDashboard.warnings.some((warning) => warning.id === "lseg-unsupported-data-source"),
    "Unsupported source modes must surface an explicit warning.",
  );

  const manualSourceDashboard = calculations.buildLsegDashboardData(
    calculations.attachLsegRuntimeContext(dataModule.lsegMockData, { periodId: period, dataSourceType: "manual" }),
    period,
    "Base",
  );
  assert(manualSourceDashboard.dataStatus.sourceType === "manual", "Manual assumption overrides should surface as manual source mode.");

  assert(typeof dashboard.integrity.overallIntegrityScore === "number", "overallIntegrityScore must exist.");
  assert(Array.isArray(dashboard.peerDataQuality?.warnings), "Dashboard peerDataQuality warnings must exist as an array.");
  assert(Array.isArray(dashboard.peerDataQuality?.yfinancePopulatedPeers), "Dashboard peerDataQuality must expose yfinance-populated peers.");
  assert(Array.isArray(dashboard.peerDataQuality?.manualFallbackPeers), "Dashboard peerDataQuality must expose manual fallback peers.");
  assert(
    dashboard.peerDataQuality.notes.includes("Peer multiples from yfinance are used as a dated external cross-check."),
    "Dashboard peerDataQuality should expose the yfinance cross-check note.",
  );
  assert(transcriptModule.lsegTranscriptIntelligenceLab.events.length === 8, "Transcript intelligence lab should expose the expected LSEG event list.");
  assert(
    transcriptModule.lsegTranscriptIntelligenceLab.events.every((event) => typeof event.transcriptId === "string" && typeof event.eventDate === "string"),
    "All transcript intelligence events must expose transcriptId and eventDate.",
  );
  assert(
    transcriptModule.lsegTranscriptIntelligenceLab.summaries.every((summary) => Array.isArray(summary.sourceReferences) && summary.sourceReferences.length > 0),
    "All transcript summaries must expose source references.",
  );
  assert(
    Array.isArray(transcriptModule.lsegTranscriptIntelligenceLab.qaPairs) &&
      transcriptModule.lsegTranscriptIntelligenceLab.qaPairs.length > 0,
    "Transcript intelligence lab must expose structured Q&A pairs.",
  );
  const transcriptMetadata = JSON.parse(
    fs.readFileSync("/Users/yudonglu/Documents/fundamental-analysis/data/local/lseg/transcripts/curated/transcript_metadata.json", "utf8"),
  );
  const qaEvents = (transcriptMetadata.records ?? []).filter((record) => record.hasQA === true);
  assert(
    qaEvents.every((event) => (transcriptModule.lsegTranscriptIntelligenceLab.qaPairCountsByTranscriptId.get(event.transcriptId) ?? 0) > 0),
    "Events with Q&A sections must expose at least one Q&A pair.",
  );
  transcriptModule.lsegTranscriptIntelligenceLab.qaPairs.forEach((pair) => {
    assert(typeof pair.transcriptId === "string" && pair.transcriptId.length > 0, "Q&A pairs must expose transcriptId.");
    assert(typeof pair.eventDate === "string" && pair.eventDate.length > 0, "Q&A pairs must expose eventDate.");
    assert(Boolean(pair.questionText || pair.questionSummary), "Q&A pairs must expose questionText or questionSummary.");
    assert(Boolean(pair.answerText || pair.answerSummary), "Q&A pairs must expose answerText or answerSummary.");
    assert(typeof pair.supportingQuoteShort === "string" && pair.supportingQuoteShort.length > 0, "Q&A pairs must expose supportingQuoteShort.");
    assert(typeof pair.confidence === "string" && pair.confidence.length > 0, "Q&A pairs must expose confidence.");
    assert(typeof pair.sourcePath === "string" && pair.sourcePath.length > 0, "Q&A pairs must expose sourcePath.");
    assert(pair.candidateOnly === true, "Q&A pairs must remain candidateOnly.");
    assert(pair.needsHumanReview === true, "Q&A pairs must remain human-review only.");
    assert(pair.modelReady === false, "Q&A pairs must remain modelReady = false.");
    assert(pair.valuationImpactAllowed === false, "Q&A pairs must remain valuationImpactAllowed = false.");
    assert(pair.analystName.trim().length > 0, "Q&A pairs must not have blank analystName.");
    assert(pair.analystFirm.trim().length > 0, "Q&A pairs must not have blank analystFirm; use unknown if needed.");
  });
  const lowBoundaryPairs = transcriptModule.lsegTranscriptIntelligenceLab.qaPairs.filter((pair) => pair.qaBoundaryConfidence === "low");
  assert(
    lowBoundaryPairs.every((pair) => pair.needsHumanReview === true),
    "Low-confidence Q&A pairs must surface as needsHumanReview.",
  );
  const transcriptTrendRows = transcriptModule.lsegTranscriptIntelligenceLab.buildTrendComparison("lseg_q1_2026_trading_update_2026-04-23");
  assert(
    transcriptTrendRows.every((row) => typeof row.currentTranscriptId === "string" && typeof row.priorTranscriptId === "string"),
    "All transcript trend rows must expose current and prior event references.",
  );
  const transcriptWatchlist = transcriptModule.lsegTranscriptIntelligenceLab.getNextCallWatchlist("lseg_q1_2026_trading_update_2026-04-23");
  const transcriptReview = transcriptModule.lsegTranscriptIntelligenceLab.getWatchlistReview("lseg_q1_2026_trading_update_2026-04-23");
  [...transcriptModule.lsegTranscriptIntelligenceLab.events, ...transcriptModule.lsegTranscriptIntelligenceLab.summaries, ...transcriptModule.lsegTranscriptIntelligenceLab.qaPairs, ...transcriptTrendRows, ...transcriptWatchlist, ...transcriptReview].forEach((row) => {
    assert(row.modelReady === false, "Transcript intelligence rows must remain modelReady = false.");
    assert(row.valuationImpactAllowed === false, "Transcript intelligence rows must remain valuationImpactAllowed = false.");
    assert(row.displayOnly === true || row.candidateOnly === true, "Transcript intelligence rows must be flagged displayOnly or candidateOnly.");
  });
  assert(
    transcriptModule.lsegTranscriptIntelligenceLab.validation.warnings.length === 0,
    "Transcript intelligence validation should pass without display-layer warnings.",
  );
  const lsegCalculationSource = fs.readFileSync("/Users/yudonglu/Documents/fundamental-analysis/src/stocks/lseg/calculations.ts", "utf8");
  assert(
    !lsegCalculationSource.includes("data/transcripts"),
    "Transcript intelligence layer must not be imported into LSEG valuation calculation paths.",
  );
  assert(typeof dashboard.integrity.sotpIntegrityScore === "number", "sotpIntegrityScore must exist.");
  assert(typeof dashboard.integrity.sotpConfidenceScore === "number", "sotpConfidenceScore must exist.");
  assert(typeof dashboard.integrity.dataQualityScore === "number", "dataQualityScore must exist.");
  assert(typeof dashboard.integrity.recommendedValuationConfidence === "number", "recommendedValuationConfidence must exist.");
  assert(Array.isArray(valuation.validationWarnings), "warnings must be returned as an array.");
  assert(Array.isArray(valuation.methodCards) && valuation.methodCards.length > 0, "methodCards must exist.");
  assert(Array.isArray(valuation.expectedReturnBridge) && valuation.expectedReturnBridge.length > 0, "expectedReturnBridge must exist.");
  assert(Array.isArray(valuation.sensitivityTables) && valuation.sensitivityTables.length > 0, "sensitivityTables must exist.");
  assert(valuation.methodCards.every((card) => Number.isFinite(card.value)), "Method cards must not contain NaN values.");
  assert(valuation.expectedReturnBridge.every((item) => Number.isFinite(item.value)), "Expected return bridge values must be finite.");

  assert(
    dashboard.dcf.cashFlowTaxonomy.dcfMethod === "wacc_unlevered" &&
      dashboard.dcf.cashFlowTaxonomy.dcfCashFlowType === "unlevered",
    "LSEG DCF must use unlevered FCF with WACC.",
  );
  assert(
    dashboard.dcf.cashFlowTaxonomy.netDebtTreatment === "subtract_after_ev",
    "LSEG DCF must subtract net debt after enterprise value.",
  );

  dashboard.fcfEngine.rows.forEach((row, index) => {
    const shares = dashboard.buybackEngine.rows[index]?.averageDilutedShares ?? 1;
    assert(
      closeTo(row.equityFreeCashFlow / shares, dashboard.scenarioCases.Base.fcfPerShareSeries[index], 6),
      `FCF/share must reconcile for ${row.fiscalYear}.`,
    );
  });

  dashboard.buybackEngine.rows.forEach((row) => {
    assert(closeTo(row.adjustedNetIncome / row.averageDilutedShares, row.adjustedEps, 6), `EPS must reconcile in ${row.fiscalYear}.`);
    assert(closeTo(row.buybackAmount / row.averageBuybackPrice, row.sharesRepurchased, 6), `Shares repurchased must reconcile in ${row.fiscalYear}.`);
    assert(
      closeTo(row.beginningDilutedShares - row.sharesRepurchased + row.stockCompensationDilution, row.endingDilutedShares, 6),
      `Ending shares must reconcile in ${row.fiscalYear}.`,
    );
  });

  assert(dashboard.operatingSotp.taxonomy === "reported_2025", "Operating SOTP must use reported_2025 taxonomy by default.");
  const operatingEv = dashboard.operatingSotp.components.reduce((sum, component) => sum + component.forwardEbitda * component.targetMultiple, 0);
  assert(closeTo(operatingEv, dashboard.operatingSotp.bridge.segmentEnterpriseValueSubtotal, 6), "Segment EV subtotal must equal forward EBITDA × selected multiple.");
  const operatingEq =
    dashboard.operatingSotp.bridge.segmentEnterpriseValueSubtotal -
    dashboard.operatingSotp.bridge.corporateCostValueDeduction +
    dashboard.operatingSotp.bridge.nonOperatingAssets +
    dashboard.operatingSotp.bridge.associatesOrInvestmentsAddBack +
    dashboard.operatingSotp.bridge.listedStakeLookThroughValue -
    dashboard.operatingSotp.bridge.netDebt -
    dashboard.operatingSotp.bridge.minorityInterestDeduction -
    dashboard.operatingSotp.bridge.nciDeduction -
    dashboard.operatingSotp.bridge.pensionOrOtherClaims;
  assert(closeTo(operatingEq, dashboard.operatingSotp.bridge.equityValue, 6), "Operating SOTP equity bridge must reconcile.");
  assert(closeTo(operatingEq / dashboard.operatingSotp.bridge.dilutedShares, dashboard.operatingSotp.valuePerShare, 6), "Operating SOTP per-share value must reconcile.");
  assert(
    closeTo(
      dashboard.operatingSotp.bridge.nciDeduction,
      dashboard.operatingSotp.audit.ownershipBridge.reduce((sum, row) => sum + row.economicNciDeduction, 0),
      6,
    ),
    "Total NCI deduction must equal the sum of ownership-bridge deductions.",
  );
  assert(!dashboard.operatingSotp.components.some((component) => component.segment === "Post Trade"), "Operating SOTP must not separately value Post Trade under reported taxonomy.");
  assert(
    dashboard.operatingSotp.audit.inputAuditRows.every((row) => typeof row.source === "string" && typeof row.isPlaceholder === "boolean"),
    "SOTP input audit rows must expose source and placeholder status.",
  );
  assert(
    dashboard.operatingSotp.audit.inputAuditRows.every((row) => typeof row.ebitdaYear === "number" && typeof row.peerGroup === "string"),
    "SOTP input audit rows must expose EBITDA year and peer-group metadata.",
  );
  assert(
    dashboard.operatingSotp.audit.ownershipBridge.some((adjustment) => adjustment.id === "tradewebNciAdjustment"),
    "Tradeweb ownership / NCI bridge row must be explicit.",
  );
  assert(
    dashboard.operatingSotp.audit.corporateCostAudit.treatment === dashboard.operatingSotp.corporateCostTreatment,
    "Corporate cost treatment must reconcile between bridge and audit metadata.",
  );
  if (Math.abs(dashboard.operatingSotp.audit.corporateReconciliation.difference) <= dashboard.operatingSotp.audit.corporateReconciliation.tolerance) {
    assert(dashboard.operatingSotp.audit.corporateReconciliation.verified === true, "Corporate reconciliation should verify a zero deduction when within tolerance.");
  } else {
    assert(
      dashboard.operatingSotp.bridge.corporateCostValueDeduction > 0 || dashboard.operatingSotp.audit.warnings.some((warning) => warning.id.includes("corporate")),
      "If corporate reconciliation fails, either a deduction or a warning must exist.",
    );
  }
  assert((dashboard.strategicSotp.strategicOptionalityPerShare ?? 0) > 0, "Strategic optionality per share should be explicit and positive.");
  assert(
    closeTo(
      (dashboard.strategicSotp.strategicOptionalityPerShare ?? 0),
      dashboard.strategicSotp.valuePerShare - dashboard.operatingSotp.valuePerShare,
      6,
    ),
    "Strategic optionality per share must reconcile to strategic less operating SOTP.",
  );
  if ((dashboard.strategicSotp.strategicOptionalityPctOfOperating ?? 0) < 0.1) {
    assert(
      valuation.validationWarnings?.some((warning) => warning.id === "lseg-strategic-too-close-warning"),
      "If strategic SOTP differs from operating SOTP by less than 10%, a warning must fire.",
    );
  }

  const forcedSplitAssumptions = scenarioEngine.buildScenarioAssumptions("Base");
  forcedSplitAssumptions.segmentTaxonomy = "analytical_split";
  const forcedOperatingSotp = sotpEngineModule.calculateOperatingSotpEngine(
    dataModule.lsegMockData,
    period,
    forcedSplitAssumptions,
    dashboard.revenueEngine,
    dashboard.marginEngine,
  );
  assert(
    forcedOperatingSotp.audit.severeWarnings.some((warning) => warning.id === "lseg-operating-taxonomy-forced"),
    "Attempting analytical split inside operating SOTP must trigger a severe warning.",
  );

  const weights = dashboard.scenarioCases.Base.assumptions.valuationWeights;
  assert(closeTo(weights.dcf + weights.fcfYield + weights.sotp + weights.pe, 1, 6), "Valuation weights must sum to 100%.");
  assert(dashboard.scenarioCases.Base.assumptions.terminalGrowth < dashboard.scenarioCases.Base.wacc.wacc, "Terminal growth must be below WACC.");

  const year1RevenueGrowth = dashboard.revenueEngine.groupRevenueByYear[0]?.growth ?? 0;
  const year1MarginExpansion = dashboard.marginEngine.groupRows[0]?.marginExpansionBps ?? 0;
  const year1EquityFcf = dashboard.fcfEngine.rows[0]?.equityFreeCashFlow ?? 0;
  assert(year1RevenueGrowth >= 0.065 && year1RevenueGrowth <= 0.075, "Base 2026 revenue growth should reconcile with management guidance.");
  assert(year1MarginExpansion >= 80 && year1MarginExpansion <= 100, "Base 2026 margin expansion should reconcile with management guidance.");
  assert(year1EquityFcf >= 2700, "Base 2026 equity FCF should meet guidance.");

  const qualityMutatedData = structuredClone(dataModule.lsegMockData);
  qualityMutatedData.kpis = qualityMutatedData.kpis.map((row) =>
    row.periodId === period
      ? { ...row, asvGrowth: 0.12, grossRetention: 0.98, netRetention: 1.02, newProductVitalityIndex: 0.3 }
      : row,
  );
  const qualityMutatedValuation = calculations.calculateLsegValuation(qualityMutatedData, period, "Base");
  assert(closeTo(valuation.dcfValue ?? 0, qualityMutatedValuation.dcfValue ?? 0, 6), "Changing only quality inputs must not directly change DCF fair value.");
  assert(closeTo(valuation.sotpFairValue ?? 0, qualityMutatedValuation.sotpFairValue ?? 0, 6), "Changing only quality inputs must not directly change SOTP fair value.");
  assert(closeTo(valuation.peFairValue ?? 0, qualityMutatedValuation.peFairValue ?? 0, 6), "Changing only quality inputs must not directly change P/E fair value.");
  assert(closeTo(valuation.fcfFairValue ?? 0, qualityMutatedValuation.fcfFairValue ?? 0, 6), "Changing only quality inputs must not directly change FCF yield fair value.");

  const staleData = structuredClone(dataModule.lsegMockData);
  staleData.marketData.priceDate = "2026-04-01";
  const staleValuation = calculations.calculateLsegValuation(staleData, period, "Base");
  assert(
    staleValuation.validationWarnings?.some((warning) => warning.id.includes("stale-price")),
    "Stale market price should trigger a warning.",
  );

  const bear = calculations.calculateLsegValuation(dataModule.lsegMockData, period, "Bear");
  const bull = calculations.calculateLsegValuation(dataModule.lsegMockData, period, "Bull");
  assert(
    (bear.blendedFairValue ?? 0) < (valuation.blendedFairValue ?? 0) && (valuation.blendedFairValue ?? 0) < (bull.blendedFairValue ?? 0),
    "Bear, Base, and Bull blended fair values should remain differentiated.",
  );

  const expectedCoreExSotp = (valuation.dcfValue * 0.35) + ((valuation.fcfFairValue ?? 0) * 0.4) + ((valuation.peFairValue ?? 0) * 0.25);
  assert(closeTo(expectedCoreExSotp, valuation.coreValueExSotp ?? 0, 6), "Core value ex-SOTP must use only DCF, FCF yield, and P/E.");
  assert(closeTo(valuation.dcfValue ?? 0, 96.76254734520357, 6), "Market-data refactor should not change DCF fair value.");
  assert(closeTo(valuation.peFairValue ?? 0, 107.70244052672037, 6), "Market-data refactor should not change P/E fair value.");
  assert(closeTo(valuation.fcfFairValue ?? 0, 106.38541140793562, 6), "Market-data refactor should not change FCF yield fair value.");
  assert(closeTo(valuation.operatingSotpFairValue ?? 0, 142.12949423536585, 6), "Market-data refactor should not change operating SOTP fair value.");
  assert(closeTo(valuation.strategicSotpFairValue ?? 0, 173.32276904637865, 6), "Market-data refactor should not change strategic SOTP fair value.");
  assert(closeTo(valuation.blendedFairValue ?? 0, 110.84492312241977, 6), "Market-data refactor should not change blended fair value.");
  assert(closeTo(valuation.recommendedFairValue ?? 0, 103.3466662656756, 6), "Market-data refactor should not change recommended fair value.");
  assert(closeTo(valuation.probabilityWeightedFairValue ?? 0, 109.29222106122197, 6), "Market-data refactor should not change probability-weighted fair value.");

  const expectedBaseBlend =
    (valuation.dcfValue * weights.dcf) +
    ((valuation.fcfFairValue ?? 0) * weights.fcfYield) +
    ((valuation.operatingSotpFairValue ?? 0) * weights.sotp) +
    ((valuation.peFairValue ?? 0) * weights.pe);
  assert(closeTo(expectedBaseBlend, valuation.blendedFairValue ?? 0, 6), "Base blend must use operating SOTP only.");
  const halfCreditedSotp = (valuation.coreValueExSotp ?? 0) + (((valuation.operatingSotpFairValue ?? 0) - (valuation.coreValueExSotp ?? 0)) * 0.5);
  const quarterCreditedSotp = (valuation.coreValueExSotp ?? 0) + (((valuation.operatingSotpFairValue ?? 0) - (valuation.coreValueExSotp ?? 0)) * 0.25);
  const threeQuarterCreditedSotp = (valuation.coreValueExSotp ?? 0) + (((valuation.operatingSotpFairValue ?? 0) - (valuation.coreValueExSotp ?? 0)) * 0.75);
  const expectedQuarterBlend =
    (valuation.dcfValue * weights.dcf) +
    ((valuation.fcfFairValue ?? 0) * weights.fcfYield) +
    (quarterCreditedSotp * weights.sotp) +
    ((valuation.peFairValue ?? 0) * weights.pe);
  const expectedHalfSotpBlend =
    (valuation.dcfValue * weights.dcf) +
    ((valuation.fcfFairValue ?? 0) * weights.fcfYield) +
    (halfCreditedSotp * weights.sotp) +
    ((valuation.peFairValue ?? 0) * weights.pe);
  const expectedThreeQuarterBlend =
    (valuation.dcfValue * weights.dcf) +
    ((valuation.fcfFairValue ?? 0) * weights.fcfYield) +
    (threeQuarterCreditedSotp * weights.sotp) +
    ((valuation.peFairValue ?? 0) * weights.pe);
  assert(closeTo(expectedQuarterBlend, valuation.blendedFairValue25Sotp ?? 0, 6), "25% SOTP uplift blend must reconcile.");
  assert(closeTo(expectedHalfSotpBlend, valuation.blendedFairValueHalfSotp ?? 0, 6), "50% SOTP haircut blend must reconcile.");
  assert(closeTo(expectedThreeQuarterBlend, valuation.blendedFairValue75Sotp ?? 0, 6), "75% SOTP uplift blend must reconcile.");
  assert(closeTo(valuation.coreValueExSotp ?? 0, valuation.blendedFairValueExSotp ?? 0, 6), "Ex-SOTP blended value must equal core value ex-SOTP.");
  assert(
    (valuation.blendedFairValueExSotp ?? 0) < (valuation.blendedFairValue25Sotp ?? 0) &&
      (valuation.blendedFairValue25Sotp ?? 0) < (valuation.blendedFairValueHalfSotp ?? 0) &&
      (valuation.blendedFairValueHalfSotp ?? 0) < (valuation.blendedFairValue75Sotp ?? 0) &&
      (valuation.blendedFairValueHalfSotp ?? 0) < (valuation.blendedFairValue ?? 0),
    "Full / haircut / ex-SOTP valuation bridge must move in the right direction.",
  );
  assert((valuation.strategicSotpFairValue ?? 0) > (valuation.operatingSotpFairValue ?? 0), "Strategic SOTP should remain above operating SOTP.");
  assert(
    (valuation.sotpFairValue ?? 0) === (valuation.operatingSotpFairValue ?? 0),
    "Backward-compatible sotpFairValue should map to the selected operating SOTP, not strategic SOTP.",
  );
  if ((dashboard.integrity.sotpConfidenceScore ?? 100) < 70) {
    assert(
      dashboard.valuation.selectedSotpPolicy !== "base_operating" && dashboard.valuation.selectedSotpPolicy !== "premium_operating",
      "Low SOTP confidence should force a conservative operating SOTP policy.",
    );
    assert(
      (dashboard.valuation.recommendedFairValue ?? 0) !== (dashboard.valuation.blendedFairValue ?? 0),
      "Low SOTP confidence should prevent recommended fair value from defaulting to the full blended value.",
    );
  }

  const averageMarketMethods = ((valuation.peFairValue ?? 0) + (valuation.fcfFairValue ?? 0)) / 2;
  if ((valuation.operatingSotpFairValue ?? 0) > (valuation.dcfValue ?? 0) * 1.5) {
    assert(
      valuation.validationWarnings?.some((warning) => warning.id === "lseg-sotp-above-dcf"),
      "Operating SOTP > DCF by 50% should trigger a warning.",
    );
  }
  if ((valuation.operatingSotpFairValue ?? 0) > averageMarketMethods * 1.4) {
    assert(
      valuation.validationWarnings?.some((warning) => warning.id === "lseg-sotp-audit-vs-market-methods"),
      "Operating SOTP > average(P/E, FCF yield) by 40% should trigger a warning.",
    );
  }
  assert((dashboard.integrity.sotpConfidenceScore ?? 100) < 100, "SOTP confidence should fall below 100 when placeholder or residual ownership inputs remain.");
  if (dashboard.operatingSotp.audit.ownershipBridge.some((row) => row.isPlaceholder)) {
    assert((dashboard.integrity.sotpConfidenceScore ?? 100) <= 70, "Placeholder ownership inputs should cap SOTP confidence at 70 or below.");
  }
  assert((dashboard.integrity.overallIntegrityScore ?? 100) < 100, "Overall integrity score should not remain 100 when SOTP still depends on residual uncertainty or outlier method dispersion.");

  const baselineSnapshot = {
    dcf: 96.76254734520357,
    pe: 107.70244052672037,
    fcf: 106.38541140793562,
    operatingSotp: 142.12949423536585,
    strategicSotp: 173.32276904637865,
    blended: 110.84492312241977,
    recommended: 103.3466662656756,
    probabilityWeighted: 109.29222106122197,
  };
  assert(closeTo(valuation.dcfValue ?? 0, baselineSnapshot.dcf, 6), "P0 ingestion foundation must not change DCF output.");
  assert(closeTo(valuation.peFairValue ?? 0, baselineSnapshot.pe, 6), "P0 ingestion foundation must not change P/E output.");
  assert(closeTo(valuation.fcfFairValue ?? 0, baselineSnapshot.fcf, 6), "P0 ingestion foundation must not change FCF-yield output.");
  assert(closeTo(valuation.operatingSotpFairValue ?? 0, baselineSnapshot.operatingSotp, 6), "P0 ingestion foundation must not change operating SOTP output.");
  assert(closeTo(valuation.strategicSotpFairValue ?? 0, baselineSnapshot.strategicSotp, 6), "P0 ingestion foundation must not change strategic SOTP output.");
  assert(closeTo(valuation.blendedFairValue ?? 0, baselineSnapshot.blended, 6), "P0 ingestion foundation must not change blended fair value.");
  assert(closeTo(valuation.recommendedFairValue ?? 0, baselineSnapshot.recommended, 6), "P0 ingestion foundation must not change recommended fair value.");
  assert(closeTo(valuation.probabilityWeightedFairValue ?? 0, baselineSnapshot.probabilityWeighted, 6), "P0 ingestion foundation must not change probability-weighted fair value.");

  const assumptionByKey = Object.fromEntries(lsegModule.valuationConfig.assumptions.map((item) => [item.key, item]));
  ["currentPrice", "riskFreeRate", "targetFcfYield", "buyback2026", "cashInterestExpense"].forEach((key) => {
    const assumption = assumptionByKey[key];
    assert(assumption, `Assumption metadata must include ${key}.`);
    assert(typeof assumption.unit === "string", `${key} should expose a unit.`);
    assert(typeof assumption.periodicity === "string", `${key} should expose periodicity.`);
    assert(typeof assumption.provenance === "string" && assumption.provenance.length > 0, `${key} should expose provenance.`);
  });
  assert(typeof assumptionByKey.currentPrice.asOfDate === "string", "Current price assumption should expose asOfDate.");

  const strategicCard = valuation.methodCards.find((card) => card.key === "lseg-strategic-sotp");
  const probabilityCard = valuation.methodCards.find((card) => card.key === "lseg-probability");
  const operatingCard = valuation.methodCards.find((card) => card.key === "lseg-operating-sotp");
  assert(strategicCard?.label.includes("Optionality"), "Strategic SOTP must be labeled as optionality.");
  assert(probabilityCard?.label.includes("Overlay"), "Probability-weighted fair value must be labeled as an overlay.");
  assert(operatingCard?.label.includes("Base Blend"), "Operating SOTP must be labeled as part of the base blend.");

  assert(
    closeTo(dashboard.marketImplied.impliedPe, dashboard.marketData.currentPrice / dashboard.scenarioCases.Base.valuation.forwardAdjustedEps, 6),
    "Market-implied P/E must reconcile to current price divided by forward EPS.",
  );
  assert(
    closeTo(dashboard.marketImplied.impliedFcfYield, dashboard.scenarioCases.Base.valuation.forwardFcfPerShare / dashboard.marketData.currentPrice, 6),
    "Market-implied FCF yield must reconcile to FCF/share divided by current price.",
  );

  console.log("LSEG model validation passed.");
} finally {
  await server.close();
}
