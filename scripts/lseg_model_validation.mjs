import { createServer } from "vite";
import fs from "node:fs";

const results = [];

function record(status, id, detail) {
  results.push({ status, id, detail });
}

function pass(id, detail) {
  record("PASS", id, detail);
}

function warn(id, detail) {
  record("WARNING", id, detail);
}

function fail(id, detail) {
  record("FAIL", id, detail);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const configModule = await server.ssrLoadModule("/src/stocks/lseg/config.ts");
  const calculations = await server.ssrLoadModule("/src/stocks/lseg/calculations.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/lseg/data.ts");
  const validationModule = await server.ssrLoadModule("/src/stocks/lseg/engines/validationEngine.ts");
  const transcriptEngine = await server.ssrLoadModule("/src/stocks/lseg/engines/transcriptIntelligenceEngine.ts");

  const lsegModule = configModule.lsegModule;
  const data = dataModule.lsegMockData;
  const valuationEngine = calculations.buildLsegDashboardData(data, "fy2025", "Base").valuationEngine;
  const validationRows = validationModule.validateLsegCockpitModel(
    data,
    valuationEngine,
    calculations.defaultLsegCockpitAssumptions,
  );

  const registrySource = fs.readFileSync("/Users/yudonglu/Documents/fundamental-analysis/src/stocks/registry.ts", "utf8");
  if (registrySource.includes("LSEG: lsegModule")) pass("registry", "LSEG module is registered through src/stocks/registry.ts.");
  else fail("registry", "LSEG module is not registered through src/stocks/registry.ts.");

  ["data", "calculateSummary", "calculateValuation", "Dashboard", "valuationConfig"].forEach((field) => {
    if (field in lsegModule && lsegModule[field]) pass(`contract-${field}`, `Module exposes ${field}.`);
    else fail(`contract-${field}`, `Module missing ${field}.`);
  });

  const officialDatasetPath = "/Users/yudonglu/Documents/fundamental-analysis/data/local/lseg/lseg_official_dataset.json";
  if (fs.existsSync(officialDatasetPath)) pass("local-official-dataset", "data/local/lseg/lseg_official_dataset.json exists.");
  else warn("local-official-dataset", "Run scripts/lseg_build_official_dataset.mjs to create data/local/lseg/lseg_official_dataset.json.");

  const fetchMetadataPath = "/Users/yudonglu/Documents/fundamental-analysis/data/local/lseg/official/fetch_metadata.json";
  if (fs.existsSync(fetchMetadataPath)) {
    const fetchMetadata = JSON.parse(fs.readFileSync(fetchMetadataPath, "utf8"));
    const documents = fetchMetadata.documents ?? [];
    const blocked = documents.filter((doc) => doc.blocked);
    if (blocked.length > 0) warn("official-fetch-blocked", `${blocked.length} fetched official documents/pages are marked blocked.`);
    else pass("official-fetch-status", "Official fetch metadata exists with no blocked documents.");
  } else {
    warn("official-fetch-status", "Official fetch metadata is not present; run scripts/lseg_fetch_official_data.mjs for cache status.");
  }

  const transcriptDatabasePath = "/Users/yudonglu/Documents/fundamental-analysis/data/local/lseg/transcripts/extracted/transcript_database.json";
  if (fs.existsSync(transcriptDatabasePath)) pass("transcript-database", "Transcript database JSON exists.");
  else warn("transcript-database", "Run scripts/lseg_build_transcript_database.mjs to build transcript_database.json.");

  for (const row of validationRows) {
    if (row.status === "PASS") pass(row.id, `${row.file} ${row.field}: ${row.reason}`);
    if (row.status === "WARNING") warn(row.id, `${row.file} ${row.field}: ${row.reason} Suggestion: ${row.suggestion}`);
    if (row.status === "FAIL") fail(row.id, `${row.file} ${row.field}: ${row.reason} Suggestion: ${row.suggestion}`);
  }

  const transcript = transcriptEngine.calculateLsegTranscriptIntelligenceEngine();
  if (transcript.qaPairs.length > 0) pass("transcript-qa", `${transcript.qaPairs.length} Q&A pairs are available.`);
  else fail("transcript-qa", "Transcript Q&A pair database is empty.");
  if (transcript.qaPairs.every((pair) => pair.topic && pair.valuationImpactAllowed === false)) {
    pass("transcript-topic-classification", "All Q&A pairs have topic classification and remain valuation-blocked.");
  } else {
    fail("transcript-topic-classification", "Some Q&A pairs are missing topic classification or valuation guard.");
  }
  if ((transcript.quarters?.length ?? 0) >= 8) {
    pass("transcript-eight-periods", `${transcript.quarters.length} transcript/call periods are available for the scroll selector.`);
  } else {
    fail("transcript-eight-periods", "Fewer than eight transcript/call periods are available. Suggestion: refresh data/local/lseg/transcripts and rebuild transcript_database.json.");
  }
  if ((transcript.focusTrend?.length ?? 0) > 0 && transcript.aiTrendSummary) {
    pass("transcript-focus-trend", "Eight-period market-focus trend and AI overview summary are available.");
  } else {
    fail("transcript-focus-trend", "Transcript focus trend or AI overview summary is missing. Suggestion: rerun transcript intelligence build and inspect focusDefinitions coverage.");
  }

  const dashboard = calculations.buildLsegDashboardData(data, "fy2025", "Base");
  const requiredDashboardFields = [
    dashboard.segment?.rows?.length,
    dashboard.dataAnalytics?.metrics?.length,
    dashboard.index?.metrics?.length,
    dashboard.postTrade?.metrics?.length,
    dashboard.refinitivSynergy?.doubleCountWarnings?.length,
    dashboard.transcriptIntelligence?.qaPairs?.length,
    dashboard.transcriptIntelligence?.quarters?.length,
    dashboard.transcriptIntelligence?.focusTrend?.length,
    dashboard.valuationEngine?.methodBridge?.length,
    dashboard.risk?.items?.length,
    dashboard.valuationEngine?.dividendBuyback?.buybackAdjustedShareCount,
  ];
  if (requiredDashboardFields.every(Boolean)) pass("dashboard-fields", "All required LSEG cockpit tabs have data fields.");
  else fail("dashboard-fields", "One or more dashboard tabs are missing required data fields.");

  const postTradeBridge = dashboard.valuationEngine?.postTradeBridge;
  if (postTradeBridge?.economics?.active) {
    pass("post-trade-forward-layer-active", "Post Trade / SwapClear forward economics layer is active for the current as-of snapshot.");
  } else {
    warn("post-trade-forward-layer-active", "Post Trade / SwapClear forward economics layer is not active for the current as-of snapshot.");
  }

  const fiscal2025DoubleCount = dashboard.valuationEngine.fcffDcf.forecast.some((row) => row.year <= 2025 && row.postTradeIncrementalFcff > 0);
  if (!fiscal2025DoubleCount) pass("post-trade-no-2025-double-count", "No 2025 incremental SwapClear uplift is added on top of FY2025 actuals.");
  else fail("post-trade-no-2025-double-count", "A 2025 forecast row contains incremental SwapClear FCFF despite FY2025 actuals already including the transaction effect.");

  const forwardUplift = dashboard.valuationEngine.fcffDcf.forecast.some((row) => row.year >= 2026 && row.postTradeIncrementalFcff > 0);
  if (forwardUplift) pass("post-trade-2026-uplift", "2026+ DCF forecast rows include incremental SwapClear FCFF.");
  else fail("post-trade-2026-uplift", "No 2026+ incremental SwapClear FCFF is visible in the DCF forecast.");

  if (postTradeBridge?.economics?.netDebtImpactAlreadyCaptured && postTradeBridge.economics.netDebtDragPerShare === 0) {
    pass("post-trade-net-debt-captured", "Transaction debt drag is marked as already captured and is not deducted again.");
  } else if (!postTradeBridge?.economics?.netDebtImpactAlreadyCaptured && postTradeBridge?.economics?.netDebtDragPerShare > 0) {
    pass("post-trade-net-debt-captured", "Transaction debt drag is separately deducted because it is not marked as captured.");
  } else {
    fail("post-trade-net-debt-captured", "Post Trade net debt treatment is inconsistent. Suggestion: verify netDebtImpactAlreadyCaptured and netDebtDragPerShare.");
  }

  const methodRecalc = dashboard.valuationEngine.methodBridge.reduce((sum, row) => sum + row.contribution, 0);
  if (Number.isFinite(methodRecalc) && Math.abs(methodRecalc - dashboard.valuationEngine.fairValue) < 0.05) {
    pass("valuation-weighted-fair-value-reconcile", "Weighted method bridge reconciles to fair value.");
  } else {
    fail("valuation-weighted-fair-value-reconcile", `Weighted method bridge ${methodRecalc} does not reconcile to fair value ${dashboard.valuationEngine.fairValue}.`);
  }

  const scenarioOrder = Object.fromEntries(dashboard.valuationEngine.scenarioValues.map((row) => [row.scenario, row.fairValue]));
  if (scenarioOrder.Bear < scenarioOrder.Base && scenarioOrder.Base < scenarioOrder.Bull) {
    pass("scenario-order", "Bear < Base < Bull after Post Trade forward economics.");
  } else {
    fail("scenario-order", `Scenario order is invalid: Bear ${scenarioOrder.Bear}, Base ${scenarioOrder.Base}, Bull ${scenarioOrder.Bull}.`);
  }

  const numericChecks = [
    dashboard.valuationEngine.fairValue,
    dashboard.valuationEngine.fcffDcf.fairValuePerShare,
    dashboard.valuationEngine.fcfYield.impliedPrice,
    dashboard.valuationEngine.sotp.fairValuePerShare,
    dashboard.valuationEngine.multiples.evEbitdaFairValue,
    dashboard.valuationEngine.multiples.peFairValue,
    postTradeBridge?.adjustedFairValue,
    postTradeBridge?.snapshotFairValue,
  ];
  if (numericChecks.every((value) => Number.isFinite(value))) pass("valuation-no-nan", "Core valuation and Post Trade bridge outputs are finite.");
  else fail("valuation-no-nan", "One or more valuation outputs are NaN or undefined.");
} finally {
  await server.close();
}

const order = { FAIL: 0, WARNING: 1, PASS: 2 };
for (const row of results.sort((left, right) => order[left.status] - order[right.status] || left.id.localeCompare(right.id))) {
  console.log(`${row.status.padEnd(7)} ${row.id} - ${row.detail}`);
}

const failures = results.filter((row) => row.status === "FAIL");
const warnings = results.filter((row) => row.status === "WARNING");
const passes = results.length - failures.length - warnings.length;

console.log(`\nLSEG Model Validation`);
console.log(`PASS: ${passes}`);
console.log(`WARNING: ${warnings.length}`);
console.log(`FAIL: ${failures.length}`);

if (failures.length > 0) {
  process.exitCode = 1;
}
