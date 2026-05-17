import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function closeTo(actual, expected, tolerance = 0.25) {
  return Math.abs(actual - expected) <= tolerance;
}

function metricValue(metric) {
  return Number.isFinite(metric?.value) ? Number(metric.value) : null;
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
  const configModule = await server.ssrLoadModule("/src/stocks/isrg/config.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/isrg/data/index.ts");
  const calculations = await server.ssrLoadModule("/src/stocks/isrg/calculations.ts");
  const assumptions = await server.ssrLoadModule("/src/stocks/isrg/assumptions.ts");

  const valuationEngineSource = readSource("src/stocks/isrg/valuationEngine.ts");
  const scenarioEngineSource = readSource("src/stocks/isrg/scenarioEngine.ts");
  const dashboardSource = readSource("src/stocks/isrg/dashboard.tsx");
  const registrySource = readSource("src/stocks/registry.ts");

  const { isrgModule } = configModule;
  const { isrgData, isrgDataSourceAudit } = dataModule;
  const defaultAssumptions = assumptions.defaultIsrgValuationAssumptions;
  const dashboard = calculations.buildIsrgDashboardData(isrgData, calculations.getDefaultIsrgPeriod(), "Base");
  const valuation = calculations.calculateIsrgValuation(isrgData, defaultAssumptions, "Base");

  assert(
    registrySource.includes("ISRG") && registrySource.includes("isrgModule"),
    "ISRG must be registered through src/stocks/registry.ts.",
  );
  assert(isrgModule.data === isrgData, "ISRG module must expose the official-first data/index.ts dataset.");
  assert(typeof isrgModule.calculateSummary === "function", "ISRG module must expose calculateSummary.");
  assert(typeof isrgModule.calculateValuation === "function", "ISRG module must expose calculateValuation.");
  assert(typeof isrgModule.Dashboard === "function", "ISRG module must expose Dashboard.");
  assert(isrgModule.tabs.length >= 11, "ISRG dashboard must expose a cockpit-grade set of research tabs.");
  assert(!dashboardSource.includes("compact shell"), "ISRG dashboard must not be the old compact generic shell.");
  assert(dashboardSource.includes("ISRG Surgical Robotics Cockpit"), "Dashboard must identify itself as an ISRG surgical robotics cockpit.");

  assert(isrgData.actualData.length >= 4, "ISRG dataset should include official FY and quarterly rows.");
  assert(Array.isArray(isrgDataSourceAudit) && isrgDataSourceAudit.length >= 8, "ISRG must expose data source audit metadata.");
  for (const source of isrgDataSourceAudit) {
    assert("url" in source, `${source.id} must include url.`);
    assert("sourceType" in source, `${source.id} must include sourceType.`);
    assert("sourceStatus" in source, `${source.id} must include sourceStatus.`);
    assert("reportingPeriod" in source, `${source.id} must include reportingPeriod.`);
    assert("downloadDate" in source, `${source.id} must include downloadDate.`);
    assert("blocked" in source, `${source.id} must include blocked.`);
    assert("parsedSuccessfully" in source, `${source.id} must include parsedSuccessfully.`);
    assert("manuallySeeded" in source, `${source.id} must include manuallySeeded.`);
  }

  for (const period of isrgData.actualData) {
    const ia = metricValue(period.revenue.instrumentsAccessories) ?? 0;
    const systems = metricValue(period.revenue.systems) ?? 0;
    const services = metricValue(period.revenue.services) ?? 0;
    const total = metricValue(period.revenue.total) ?? 0;
    assert(closeTo(ia + systems + services, total), `${period.periodId} revenue segments must sum to total revenue.`);
    for (const metric of [
      period.revenue.instrumentsAccessories,
      period.revenue.systems,
      period.revenue.services,
      period.revenue.total,
      period.installedBase.daVinciInstalledBase,
      period.installedBase.ionInstalledBase,
      period.placements.daVinciPlacements,
      period.placements.daVinci5Placements,
      period.placements.ionPlacements,
      period.placements.operatingLeasePlacements,
      period.placements.usageBasedLeasePlacements,
    ]) {
      assert(metric.source.sourceUrl !== undefined, `${period.periodId} ${metric.key} must expose sourceUrl.`);
      assert(metric.source.sourceType, `${period.periodId} ${metric.key} must expose sourceType.`);
      assert(metric.source.retrievedAt, `${period.periodId} ${metric.key} must expose retrievedAt.`);
      assert(metric.source.period, `${period.periodId} ${metric.key} must expose period.`);
      assert("usedInValuation" in metric.source, `${period.periodId} ${metric.key} must expose usedInValuation.`);
      assert("researchOnly" in metric.source, `${period.periodId} ${metric.key} must expose researchOnly.`);
    }
  }

  const latest = dashboard.latestActual;
  const latestFy = dashboard.latestFullYear;
  const latestAsp = dashboard.recurringRevenueEngine.systemAspProxy;
  assert(latestAsp > 0.5 && latestAsp < 3.5, "System ASP proxy must be in a reasonable USDm/system range.");
  assert(
    dashboard.recurringRevenueEngine.revenuePerProcedure > 500 &&
      dashboard.recurringRevenueEngine.revenuePerProcedure < 3500,
    "Instruments/accessories revenue per procedure must be in a reasonable USD/procedure range.",
  );
  assert(
    dashboard.procedureEngine.proceduresPerSystem > 150 &&
      dashboard.procedureEngine.proceduresPerSystem < 500,
    "Procedures per installed system must be in a reasonable annual range.",
  );

  const latestDaVinciPlacements = metricValue(latest.placements.daVinciPlacements) ?? 0;
  const latestDaVinci5Placements = metricValue(latest.placements.daVinci5Placements) ?? 0;
  const latestOperatingLeases = metricValue(latest.placements.operatingLeasePlacements) ?? 0;
  const latestUsageBasedLeases = metricValue(latest.placements.usageBasedLeasePlacements) ?? 0;
  assert(latestDaVinci5Placements <= latestDaVinciPlacements, "da Vinci 5 placements must not exceed total da Vinci placements.");
  assert(latestOperatingLeases <= latestDaVinciPlacements, "Operating lease placements must not exceed total placements.");
  assert(latestUsageBasedLeases <= latestOperatingLeases, "Usage-based lease placements must not exceed operating lease placements.");
  assert(
    (metricValue(latest.installedBase.daVinciInstalledBase) ?? 0) !== (metricValue(latest.installedBase.ionInstalledBase) ?? 0),
    "Ion installed base must remain separate from da Vinci installed base.",
  );
  assert(
    closeTo(
      (metricValue(latest.installedBase.daVinciInstalledBase) ?? 0) + (metricValue(latest.installedBase.ionInstalledBase) ?? 0),
      metricValue(latest.installedBase.totalInstalledBase) ?? 0,
      0.01,
    ),
    "Total installed base must equal da Vinci plus Ion installed base.",
  );
  assert(
    dashboard.installedBaseEngine.fullYearReplacementCycleProxy >= 0 &&
      dashboard.installedBaseEngine.fullYearReplacementCycleProxy <= (metricValue(latestFy.placements.daVinciPlacements) ?? Infinity),
    "Installed-base growth and placement growth must imply a plausible replacement-cycle proxy.",
  );
  assert(dashboard.hospitalCapexEngine.leaseMix >= 0, "Hospital capex engine must be present and finite.");
  assert(dashboard.regulatorySafetyEngine.safetyWatchlist.length >= 2, "Regulatory safety engine must include FDA/MAUDE watchlist items.");

  assert(
    isrgData.valuationInputs.excludedSourceTypes.includes("transcript"),
    "Transcript-derived values must be excluded from valuationInputs by default.",
  );
  assert(
    isrgData.transcriptInsights.qaPairs.every((pair) => pair.modelReady === false && pair.valuationImpactAllowed === false && pair.candidateOnly === true),
    "Transcript Q&A pairs must remain candidate-only and valuationImpactAllowed=false.",
  );
  assert(
    dashboard.transcript.quarterFocus.length === 8,
    "Transcript intelligence must expose exactly eight quarterly focus snapshots.",
  );
  assert(
    dashboard.transcript.quarterFocus.every((quarter) => quarter.researchOnly === true && quarter.valuationImpactAllowed === false),
    "Eight-quarter AI call summaries must remain research-only and valuationImpactAllowed=false.",
  );
  assert(
    dashboard.transcript.focusTrendRows.length === 8,
    "Transcript market-focus trend chart must cover the past eight quarters.",
  );
  assert(!valuationEngineSource.includes("transcriptInsights"), "Valuation engine must not import transcriptInsights.");
  assert(!valuationEngineSource.includes("qaPairs"), "Valuation engine must not import Q&A pairs.");
  assert(!valuationEngineSource.includes("researchOnlyData"), "Valuation engine must not read researchOnlyData directly.");
  assert(!scenarioEngineSource.includes("actualData ="), "Scenario assumptions must not overwrite actualData.");

  assert(defaultAssumptions.optionalityDeduplicationHaircut >= 0.25, "Optionality value must include a de-duplication haircut.");
  assert(
    dashboard.valuation.segmentValuation.optionality.value <= dashboard.valuation.segmentValuation.optionality.gross,
    "Haircut optionality value must not exceed gross Ion/SP optionality value.",
  );
  assert(
    dashboard.valuation.segmentValuation.components.length === 3,
    "Segment valuation should include I&A, Systems, and Services once each.",
  );
  const segmentNames = new Set(dashboard.valuation.segmentValuation.components.map((component) => component.segment));
  assert(segmentNames.size === dashboard.valuation.segmentValuation.components.length, "Each segment must be valued once.");

  assert(Array.isArray(valuation.fairValues) && valuation.fairValues.length === 3, "Valuation output must include bull/base/bear range.");
  for (const scenario of ["Bear", "Base", "Bull"]) {
    assert(valuation.fairValues.some((item) => item.scenario === scenario), `Valuation output must include ${scenario}.`);
  }
  assert(valuation.methodCards.length >= 4, "Valuation output must include procedure DCF, segment, P/E, and FCF yield methods.");
  assert(valuation.sensitivityTables.length >= 3, "Valuation output must include sensitivity tables.");
  assert(Number.isFinite(valuation.recommendedFairValue), "Recommended fair value must be finite.");
  assert(Number.isFinite(dashboard.valuation.reverseDcf.requiredProcedureCagr), "Reverse DCF required procedure CAGR must be finite.");

  console.log("ISRG validation passed.");
  console.log(`Validation warnings surfaced in dashboard: ${dashboard.valuationWarnings.length}.`);
  if (dashboard.valuationWarnings.length) {
    console.log("Non-blocking warnings:");
    for (const warning of dashboard.valuationWarnings) {
      console.log(`- [${warning.severity}] ${warning.id}: ${warning.title}`);
    }
  }
} finally {
  await server.close();
}
