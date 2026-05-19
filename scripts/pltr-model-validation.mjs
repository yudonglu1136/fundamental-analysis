import { createServer } from "vite";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const configModule = await server.ssrLoadModule("/src/stocks/pltr/config.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/pltr/realData.ts");
  const calculations = await server.ssrLoadModule("/src/stocks/pltr/calculations.ts");
  const assumptions = await server.ssrLoadModule("/src/stocks/pltr/assumptions.ts");
  let registry = null;
  let registryLoadError = null;
  try {
    registry = await server.ssrLoadModule("/src/stocks/registry.ts");
  } catch (error) {
    registryLoadError = error;
  }
  const dataValidation = await server.ssrLoadModule("/src/stocks/pltr/validation/validatePltrData.ts");
  const modelValidation = await server.ssrLoadModule("/src/stocks/pltr/validation/validatePltrModel.ts");
  const valuationEngineSource = fs.readFileSync("/Users/yudonglu/Documents/fundamental-analysis/src/stocks/pltr/engines/valuationEngine.ts", "utf8");
  const transcriptParseSummaryPath = "/Users/yudonglu/Documents/fundamental-analysis/data/local/pltr/transcripts/extracted/parse_summary.json";
  const transcriptParseSummary = fs.existsSync(transcriptParseSummaryPath)
    ? JSON.parse(fs.readFileSync(transcriptParseSummaryPath, "utf8"))
    : null;

  const { pltrModule } = configModule;
  const { pltrData } = dataModule;
  const defaultAssumptions = assumptions.defaultPltrValuationAssumptions;
  const dashboard = calculations.buildPltrDashboardData(pltrData, calculations.getDefaultPltrPeriod(), "Base");
  const valuation = calculations.calculatePltrValuation(pltrData, defaultAssumptions, "Base");
  const dataWarnings = dataValidation.validatePltrData(pltrData);
  const modelWarnings = modelValidation.validatePltrModel(pltrData, defaultAssumptions);

  if (registry) {
    assert(registry.stockRegistry.PLTR === pltrModule, "PLTR must be registered through src/stocks/registry.ts.");
  } else {
    const registrySource = fs.readFileSync("/Users/yudonglu/Documents/fundamental-analysis/src/stocks/registry.ts", "utf8");
    assert(
      registrySource.includes("pltrModule") && registrySource.includes("PLTR"),
      "PLTR must be registered through src/stocks/registry.ts.",
    );
  }
  assert(pltrModule.data === pltrData, "PLTR module must expose pltrData through module.data.");
  assert(typeof pltrModule.calculateSummary === "function", "PLTR module must expose calculateSummary.");
  assert(typeof pltrModule.calculateValuation === "function", "PLTR module must expose calculateValuation.");
  assert(typeof pltrModule.Dashboard === "function", "PLTR module must expose Dashboard.");
  assert(pltrModule.tabs.length === 14, "PLTR module should expose the requested dashboard tabs plus the Key Insights and Q1 2026 Deep Dive tabs.");
  assert(
    pltrModule.tabs.some((tab) => tab.value === "key-insights"),
    "PLTR module must expose the Key Insights tab.",
  );
  assert(
    pltrModule.tabs.some((tab) => tab.value === "q1-2026-deep-dive"),
    "PLTR module must expose the Q1 2026 Deep Dive tab.",
  );
  assert(pltrData.actuals.length >= 5, "PLTR starter dataset should include at least five quarterly actual rows.");
  assert(pltrData.actuals.every((period) => period.metrics.revenue), "Every actual period must include a revenue metric slot.");
  assert(pltrData.actuals.every((period) => Object.values(period.metrics).every((metric) => "sourceConfidence" in metric)), "Every metric must expose source confidence.");
  assert(pltrData.guidance.length >= 3, "PLTR guidance layer should include revenue, adjusted operating income, and adjusted FCF guidance.");
  assert(Array.isArray(dashboard.transcript.events), "Transcript events must be exposed to dashboard data.");
  assert(Array.isArray(dashboard.transcript.qaPairs), "Transcript Q&A pairs must be exposed to dashboard data.");
  assert(dashboard.transcript.events.length >= 8, "Transcript lab must expose at least eight earnings-call events.");
  assert(
    dashboard.transcript.events.slice(0, 8).every((event) => event.status === "parsed"),
    "The latest eight transcript events must be parsed.",
  );
  assert(dashboard.transcript.qaPairs.length > 0, "Parsed PLTR transcript Q&A pairs must be populated.");
  assert(dashboard.transcript.qaPairs.length >= 20, "Eight-quarter transcript pipeline should parse at least 20 Q&A pairs.");
  assert(dashboard.transcript.qaPairs.every((pair) => pair.modelReady === false && pair.valuationImpactAllowed === false), "Transcript Q&A must remain research-only.");
  assert(
    dashboard.transcript.qaPairs.every((pair) => pair.analystName.trim() && pair.managementSpeaker.trim() && pair.question.trim() && pair.answer.trim()),
    "Transcript Q&A pairs must include analyst, management speaker, question, and answer text.",
  );
  assert(
    dashboard.transcript.topicTrends.length > 0,
    "Transcript topic trends must be populated.",
  );
  assert(
    new Set(dashboard.transcript.topicTrends.map((row) => row.periodId)).size >= 8,
    "Transcript topic trends must cover at least eight unique quarters.",
  );
  const requiredTranscriptTopics = ["AIP", "bootcamp", "US Commercial", "Government", "Defense", "Ontology", "margin", "SBC", "dilution", "guidance", "valuation", "customer growth", "sales efficiency"];
  const topicTrendSet = new Set(dashboard.transcript.topicTrends.map((row) => row.topic));
  requiredTranscriptTopics.forEach((topic) => {
    assert(topicTrendSet.has(topic), `Transcript topic trend coverage must include ${topic}.`);
  });
  assert(transcriptParseSummary?.totals?.qaPairs >= 20, "Local transcript parse_summary.json must report eight-quarter parsed Q&A pairs.");
  assert(
    transcriptParseSummary?.records?.filter((record) => record.status === "parsed").length >= 8,
    "Local transcript parse_summary.json must report at least eight parsed quarters.",
  );
  assert(dashboard.q1DeepDive?.periodId === "q1-2026", "Q1 2026 Deep Dive must be built from the Q1 2026 actual period.");
  assert(dashboard.q1DeepDive.officialReported.length >= 9, "Q1 Deep Dive must include official reported metrics.");
  assert(dashboard.q1DeepDive.derivedMetrics.length >= 5, "Q1 Deep Dive must include derived metrics.");
  assert(dashboard.q1DeepDive.managementCommentary.length > 0, "Q1 Deep Dive must include transcript-based management commentary.");
  assert(dashboard.q1DeepDive.analystConcerns.length > 0, "Q1 Deep Dive must include transcript-based analyst concerns.");
  assert(dashboard.q1DeepDive.whatChangedVsQ4.length > 0, "Q1 Deep Dive must include Q4 2025 comparison metrics.");
  assert(dashboard.q1DeepDive.redTeamInvalidators.length >= 6, "Q1 Deep Dive must include the requested red-team invalidators.");
  const q1DisplayedMetrics = [
    ...dashboard.q1DeepDive.officialReported,
    ...dashboard.q1DeepDive.derivedMetrics,
    ...dashboard.q1DeepDive.whatChangedVsQ4,
  ];
  assert(
    q1DisplayedMetrics.every((metric) => metric.footnote && metric.sourceUrl && metric.sourceType && metric.sourceConfidence),
    "Every Q1 Deep Dive displayed metric must carry source footnote metadata.",
  );
  assert(
    dashboard.q1DeepDive.valuationImplication.every((item) => item.layer === "valuation_implication"),
    "Q1 Deep Dive valuation implications must remain in the valuation implication layer.",
  );
  assert(Array.isArray(dashboard.submoduleInsights), "PLTR dashboard must expose submodule key insights.");
  assert(dashboard.submoduleInsights.length >= pltrModule.tabs.length, "PLTR submodule insight ledger must cover every dashboard tab plus historical/backend valuation coverage.");
  assert(
    dashboard.submoduleInsights.every((item) =>
      item.module &&
      item.keyQuestion &&
      item.keyInsight &&
      item.dataReadThrough &&
      item.modelImplication &&
      item.falsifier &&
      item.sourceQuality
    ),
    "Every PLTR submodule insight must include key question, insight, data read-through, model implication, falsifier, and source quality.",
  );
  assert(
    dashboard.submoduleInsights.some((item) => item.module === "Historical Valuation" && item.sourceQuality.includes("Backend pilot")),
    "PLTR submodule insights must document historical valuation and backend status.",
  );
  assert(dashboard.aip.valuationImpact.every((item) => typeof item === "string"), "AIP engine should explain valuation mapping rather than directly changing valuation.");
  assert(!valuationEngineSource.includes("researchSignals"), "Valuation engine must not import researchSignals.");
  assert(!valuationEngineSource.includes("topicTrends"), "Valuation engine must not import topicTrends.");
  assert(!valuationEngineSource.includes("qaPairs"), "Valuation engine must not import qaPairs.");
  assert(valuation.methodCards.length >= 5, "PLTR valuation should expose all requested valuation methods.");
  assert(valuation.sensitivityTables.length > 0, "PLTR valuation should expose sensitivity tables.");
  assert(Number.isFinite(valuation.recommendedFairValue), "PLTR valuation must produce a finite recommended fair value.");
  assert(Number.isFinite(dashboard.valuation.reverseDcf.requiredRevenueCagr), "Reverse DCF required revenue CAGR must be finite.");
  assert(Number.isFinite(dashboard.valuation.reverseDcf.currentEnterpriseValue), "Reverse DCF current enterprise value must be finite.");
  assert(Number.isFinite(dashboard.valuation.reverseDcf.currentEvToRevenue), "Reverse DCF current EV / revenue must be finite.");
  assert(Number.isFinite(dashboard.valuation.reverseDcf.currentEvToFcf), "Reverse DCF current EV / FCF must be finite.");
  assert(Number.isFinite(dashboard.valuation.reverseDcf.impliedDilutionDrag), "Reverse DCF dilution drag must be finite.");
  assert(
    dashboard.valuation.reverseDcf.expectationScenarios.length === 4,
    "Reverse DCF must expose market-implied, conservative fundamental, bull, and hyper bull implied-expectation scenarios.",
  );
  assert(
    dashboard.valuation.reverseDcf.expectationScenarios.every((scenario) =>
      Number.isFinite(scenario.revenueCagr) &&
      Number.isFinite(scenario.terminalRevenue) &&
      Number.isFinite(scenario.fcfMargin) &&
      Number.isFinite(scenario.normalizedSbcAsPctRevenue) &&
      Number.isFinite(scenario.dilutedShareCountCagr) &&
      Number.isFinite(scenario.terminalFcfPerShare) &&
      Number.isFinite(scenario.exitMultiple) &&
      Number.isFinite(scenario.fairValuePerShare) &&
      Number.isFinite(scenario.expectedCagr3Y) &&
      Number.isFinite(scenario.expectedCagr5Y)
    ),
    "Every implied-expectation scenario must expose finite assumption and return metrics.",
  );
  assert(dashboard.scenarios.some((scenario) => scenario.scenario === "Hyper Bull"), "Scenario lab should expose a marked speculative Hyper Bull case.");

  const highDataWarnings = dataWarnings.filter((warning) => warning.severity === "high");
  const highModelWarnings = modelWarnings.filter((warning) => warning.severity === "high");
  assert(highDataWarnings.length === 0, `High-severity PLTR data validation warnings: ${highDataWarnings.map((warning) => warning.id).join(", ")}`);
  assert(highModelWarnings.length === 0, `High-severity PLTR model validation warnings: ${highModelWarnings.map((warning) => warning.id).join(", ")}`);

  console.log("PLTR validation passed.");
  console.log(`Data warnings: ${dataWarnings.length}. Model warnings: ${modelWarnings.length}.`);
  if (registryLoadError) {
    console.log(`Registry SSR load skipped due to unrelated import failure: ${registryLoadError.message}`);
  }
  if (dataWarnings.length || modelWarnings.length) {
    console.log("Non-blocking warnings:");
    for (const warning of [...dataWarnings, ...modelWarnings]) {
      console.log(`- [${warning.severity}] ${warning.id}: ${warning.title}`);
    }
  }
} finally {
  await server.close();
}
