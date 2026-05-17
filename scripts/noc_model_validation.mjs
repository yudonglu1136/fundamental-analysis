import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function closeTo(actual, expected, tolerance = 2) {
  return Math.abs(actual - expected) <= tolerance;
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const configModule = await server.ssrLoadModule("/src/stocks/noc/config.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/noc/data/index.ts");
  const calculations = await server.ssrLoadModule("/src/stocks/noc/calculations.ts");
  const assumptions = await server.ssrLoadModule("/src/stocks/noc/assumptions.ts");

  const valuationEngineSource = readSource("src/stocks/noc/engines/valuationEngine.ts");
  const dashboardSource = readSource("src/stocks/noc/dashboard.tsx");
  const registrySource = readSource("src/stocks/registry.ts");

  const { nocModule } = configModule;
  const { nocDataset } = dataModule;
  const defaultAssumptions = assumptions.defaultNocValuationAssumptions;
  const dashboard = calculations.buildNocDashboardData(nocDataset, calculations.getDefaultNocPeriod(), "Base");
  const valuation = calculations.calculateNocValuation(nocDataset, calculations.getDefaultNocPeriod(), "Base", defaultAssumptions);

  assert(registrySource.includes("NOC") && registrySource.includes("nocModule"), "NOC must be registered through src/stocks/registry.ts.");
  assert(nocModule.data === nocDataset, "NOC module must expose the data/index.ts dataset.");
  assert(typeof nocModule.calculateSummary === "function", "NOC module must expose calculateSummary.");
  assert(typeof nocModule.calculateValuation === "function", "NOC module must expose calculateValuation.");
  assert(typeof nocModule.Dashboard === "function", "NOC module must expose Dashboard.");
  assert(nocModule.tabs.length >= 9, "NOC dashboard must expose cockpit-grade research tabs.");
  assert(dashboardSource.includes("NOC U.S. Defense Prime Research Cockpit"), "Dashboard must identify itself as a NOC research cockpit.");
  assert(!dashboardSource.includes("BAE Systems Defense Research Cockpit"), "NOC dashboard must not be a BA copy.");

  assert(nocDataset.sources.length >= 8, "NOC dataset should include official, government, research and market source metadata.");
  for (const source of nocDataset.sources) {
    assert(source.url, `${source.id} must include url.`);
    assert(source.sourceStatus, `${source.id} must include sourceStatus.`);
    assert(source.sourceType, `${source.id} must include sourceType.`);
    assert(source.accessedDate, `${source.id} must include accessedDate.`);
  }

  assert(nocDataset.periods.some((period) => period.id === "fy25"), "NOC dataset must include FY2025 annual actuals.");
  assert(nocDataset.periods.some((period) => period.id === "q1-26"), "NOC dataset must include Q1 2026 actuals.");
  for (const period of nocDataset.periods) {
    assert(period.sourceStatus === "official_actual", `${period.id} period rows must remain official_actual.`);
    assert(closeTo(period.fundedBacklog + period.unfundedBacklog, period.totalBacklog), `${period.id} funded plus unfunded backlog must equal total backlog.`);
    assert(Number.isFinite(period.freeCashFlow), `${period.id} free cash flow must be finite.`);
  }

  for (const periodId of ["fy25", "q1-26"]) {
    const period = nocDataset.periods.find((row) => row.id === periodId);
    const rows = nocDataset.segments.filter((row) => row.periodId === periodId);
    const salesSum = rows.reduce((sum, row) => sum + row.sales, 0);
    const backlogSum = rows
      .filter((row) => row.segment !== "Intersegment eliminations")
      .reduce((sum, row) => sum + (row.totalBacklog ?? 0), 0);
    assert(closeTo(salesSum, period.sales), `${periodId} segment sales must reconcile to company sales.`);
    assert(closeTo(backlogSum, period.totalBacklog), `${periodId} segment backlog must reconcile to company backlog.`);
  }

  assert(nocDataset.programs.length >= 6, "NOC program matrix must include B-21, Sentinel, Space, Mission Systems and adjacent programs.");
  assert(nocDataset.programs.some((program) => program.id === "b21-raider"), "Program matrix must include B-21 Raider.");
  assert(nocDataset.programs.some((program) => program.id === "sentinel-gbsd"), "Program matrix must include Sentinel / GBSD.");
  assert(nocDataset.programs.every((program) => program.sourceStatus === "research_only"), "Program records must remain research_only.");
  assert(nocDataset.risks.every((risk) => risk.sourceStatus === "research_only"), "Risk records must remain research_only.");
  assert(!valuationEngineSource.includes("transcript_intelligence"), "Valuation engine must not import transcript intelligence.");
  assert(!valuationEngineSource.includes("transcriptInsights"), "Valuation engine must not read transcript insights.");

  const weightSum = [
    defaultAssumptions.weightDcf,
    defaultAssumptions.weightFcfYield,
    defaultAssumptions.weightEvEbit,
    defaultAssumptions.weightPe,
    defaultAssumptions.weightSotp,
    defaultAssumptions.weightBacklogDurability,
  ].reduce((sum, value) => sum + value, 0);
  assert(closeTo(weightSum, 1, 0.0001), "Default valuation weights must sum to 100%.");
  assert(defaultAssumptions.sentinelRiskCharge >= 0, "Sentinel risk charge must be explicit and non-negative.");
  assert(defaultAssumptions.b21ScaleMultiplier > 0, "B-21 scale multiplier must be positive.");

  assert(Array.isArray(valuation.fairValues) && valuation.fairValues.length === 3, "Valuation output must include Bear/Base/Bull fair values.");
  for (const scenario of ["Bear", "Base", "Bull"]) {
    assert(valuation.fairValues.some((item) => item.scenario === scenario), `Valuation output must include ${scenario}.`);
  }
  assert(valuation.methodCards.length >= 6, "Valuation output must include DCF, FCF yield, EV/EBIT, P/E, SOTP and backlog layer.");
  assert(valuation.sensitivityTables.length >= 3, "Valuation output must include at least three sensitivity tables.");
  assert(Number.isFinite(valuation.recommendedFairValue), "Recommended fair value must be finite.");
  assert(Number.isFinite(dashboard.backlog.fundedRatio), "Backlog engine must expose funded ratio.");
  assert(dashboard.programs.programs.some((program) => program.assumptionMapping === "b21_scale_multiplier"), "Program engine must map B-21 to b21_scale_multiplier.");
  assert(dashboard.programs.programs.some((program) => program.assumptionMapping === "sentinel_risk_charge"), "Program engine must map Sentinel to sentinel_risk_charge.");
  assert(dashboard.risks.killCriteria.length >= 5, "Risk engine must include kill criteria.");
  assert(nocDataset.earningsCalls.records.length === 8, "NOC earnings call intelligence must include the past eight quarters.");
  assert(nocDataset.earningsCalls.records.every((record) => record.sourceStatus === "research_only"), "Earnings call records must remain research_only.");
  assert(dashboard.earningsCalls.trendRows.length === 8, "Earnings call dashboard must expose eight trend rows.");
  assert(dashboard.earningsCalls.topicMomentum.some((row) => row.topic === "B-21"), "Earnings call trends must include B-21 topic momentum.");
  assert(dashboardSource.includes("overflow-x-auto") && dashboardSource.includes("Earnings Call Intelligence"), "Dashboard must include a horizontal earnings-call quarter selector.");
  assert(!valuationEngineSource.includes("earningsCalls"), "Valuation engine must not read earnings-call intelligence directly.");

  console.log("NOC validation passed.");
  console.log(`Validation warnings surfaced in dashboard: ${dashboard.dataStatus.validationWarnings.length}.`);
  if (dashboard.dataStatus.validationWarnings.length) {
    console.log("Non-blocking warnings:");
    for (const warning of dashboard.dataStatus.validationWarnings) {
      console.log(`- [${warning.severity}] ${warning.id}: ${warning.title}`);
    }
  }
} finally {
  await server.close();
}
