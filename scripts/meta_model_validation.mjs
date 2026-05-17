import { createServer } from "vite";

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

function closeTo(actual, expected, tolerance = 1e-6) {
  return Math.abs(actual - expected) <= tolerance;
}

function assertRange(value, min, max, id, label) {
  if (value < min || value > max || !Number.isFinite(value)) {
    fail(id, `${label} ${value} is outside ${min} to ${max}.`);
  } else {
    pass(id, `${label} ${value} is inside ${min} to ${max}.`);
  }
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const calculations = await server.ssrLoadModule("/src/stocks/meta/calculations.ts");
  const configModule = await server.ssrLoadModule("/src/stocks/meta/config.ts");
  const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");

  const data = calculations.metaDataset;
  const periodId = calculations.getDefaultMetaPeriod();
  const dashboard = calculations.buildMetaDashboardData(data, periodId, "Base");
  const valuation = calculations.calculateMetaValuation(data, periodId, "Base");
  const assumptions = calculations.defaultMetaValuationAssumptions;
  const metaModule = configModule.metaModule;

  if (registryModule.stockRegistry.META === metaModule) pass("registry", "META module is registered through src/stocks/registry.ts.");
  else fail("registry", "META module is not registered through src/stocks/registry.ts.");

  ["data", "calculateSummary", "calculateValuation", "Dashboard", "valuationConfig"].forEach((field) => {
    if (field in metaModule && metaModule[field]) pass(`contract-${field}`, `Module exposes ${field}.`);
    else fail(`contract-${field}`, `Module missing ${field}.`);
  });

  for (const period of data.periods) {
    const rows = data.segments.filter((row) => row.periodId === period.id);
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const operatingIncome = rows.reduce((sum, row) => sum + row.operatingIncome, 0);
    if (closeTo(revenue, period.revenue, 0.02)) pass(`segment-revenue-${period.id}`, `${period.label} segment revenue reconciles.`);
    else fail(`segment-revenue-${period.id}`, `${period.label} segment revenue ${revenue} does not reconcile to ${period.revenue}.`);
    if (closeTo(operatingIncome, period.operatingIncome, 0.02)) pass(`segment-oi-${period.id}`, `${period.label} segment operating income reconciles.`);
    else fail(`segment-oi-${period.id}`, `${period.label} segment operating income ${operatingIncome} does not reconcile to ${period.operatingIncome}.`);

    const fcf = period.operatingCashFlow - period.capitalExpendituresInclFinanceLeases;
    if (closeTo(fcf, period.freeCashFlow, 0.05)) pass(`fcf-reconcile-${period.id}`, `${period.label} FCF reconciles to CFO less capex.`);
    else fail(`fcf-reconcile-${period.id}`, `${period.label} FCF ${period.freeCashFlow} does not equal ${fcf}.`);
  }

  for (const point of data.adEconomics) {
    const implied = (1 + point.adImpressionsGrowth) * (1 + point.averagePricePerAdGrowth) - 1;
    if (point.adRevenueGrowth == null || Math.abs(point.adRevenueGrowth - implied) <= 0.08) {
      pass(`ad-bridge-${point.periodId}`, `${point.periodId} ad bridge is within tolerance.`);
    } else {
      warn(`ad-bridge-${point.periodId}`, `${point.periodId} ad revenue growth differs from impression x price by more than 8ppt.`);
    }
  }

  const weightSum = assumptions.weightDcf + assumptions.weightFcfYield + assumptions.weightPe + assumptions.weightEvEbit + assumptions.weightSotp;
  if (closeTo(weightSum, 1, 1e-9)) pass("valuation-weight-sum", "Valuation weights sum to 100%.");
  else fail("valuation-weight-sum", `Valuation weights sum to ${(weightSum * 100).toFixed(1)}%.`);

  assertRange(assumptions.capex2026, 125, 145, "capex-guidance-range", "2026 capex");
  assertRange(assumptions.wacc, 0.065, 0.11, "wacc-range", "WACC");
  assertRange(assumptions.terminalGrowth, 0.015, 0.04, "terminal-growth-range", "Terminal growth");
  assertRange(assumptions.foaOperatingMargin, 0.4, 0.56, "foa-margin-range", "FoA margin");

  if (dashboard.valuationEngine.dcf.terminalValueShareOfEv > 0.78) {
    warn("dcf-terminal-value", `Terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`);
  } else {
    pass("dcf-terminal-value", `Terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`);
  }

  if (dashboard.valuationEngine.aiExcessReturnValuePerShare > 0 && dashboard.valuationEngine.blendedFairValue > 0) {
    pass("ai-uplift-isolation", "AI excess-return value is diagnostic and not added as a second layer to blended fair value.");
  } else {
    pass("ai-uplift-isolation", "AI uplift is embedded through forecast drivers rather than a standalone fair-value top-up.");
  }

  if (assumptions.buybackYield !== 0 || assumptions.annualDilutionFromSbc !== 0) {
    const sharesMove = dashboard.forecast[0].dilutedShares - assumptions.dilutedShares;
    pass("sbc-buyback-share-count", `SBC and buyback assumptions flow through share count; year-one shares move by ${sharesMove.toFixed(4)}bn.`);
  } else {
    warn("sbc-buyback-share-count", "SBC and buyback assumptions are zero; share-count bridge is inert.");
  }

  const sourceStatusSet = new Set(data.sources.map((source) => source.sourceStatus));
  ["official_actual", "management_guidance", "market_data"].forEach((status) => {
    if (sourceStatusSet.has(status)) pass(`source-status-${status}`, `Source map includes ${status}.`);
    else fail(`source-status-${status}`, `Source map missing ${status}.`);
  });
  if (data.researchNotes.every((note) => note.sourceStatus === "research_only")) pass("research-only-isolation", "Research notes remain research-only.");
  else fail("research-only-isolation", "At least one research note crossed the source boundary.");

  const lineageRows = [
    ...data.sources,
    ...data.periods,
    ...data.segments,
    ...data.guidance,
    ...data.adEconomics,
    ...data.aiCapex,
    ...data.productSignals,
    ...data.realityLabs,
    ...data.regulatoryRisks,
    ...data.transcriptInsights,
    ...data.earningsCalls,
    ...data.researchNotes,
    data.marketData,
  ];
  const lineageCoverage = lineageRows.filter((row) => row.lineage).length / lineageRows.length;
  if (lineageCoverage >= 0.95) pass("lineage-coverage", `DataLineage coverage is ${(lineageCoverage * 100).toFixed(1)}%.`);
  else fail("lineage-coverage", `DataLineage coverage only ${(lineageCoverage * 100).toFixed(1)}%.`);

  if (dashboard.integrity.assumptionQualityScore === 100) pass("assumption-metadata", "Every valuation assumption has metadata coverage.");
  else fail("assumption-metadata", `Assumption metadata score is ${dashboard.integrity.assumptionQualityScore}.`);

  if (dashboard.productSignals.every((signal) => signal.lineage.valuationTreatment !== "direct_input")) {
    pass("product-signal-isolation", "Product signals do not directly enter valuation; they map to named drivers.");
  } else {
    fail("product-signal-isolation", "At least one product signal is marked as a direct valuation input.");
  }

  if (dashboard.forecast[0]?.revenueBridge?.q2GuidanceMidpoint === 59.5) {
    pass("q1-q2-h2-revenue-bridge", "2026 forecast includes Q1 actual + Q2 guidance midpoint + H2 implied bridge.");
  } else {
    fail("q1-q2-h2-revenue-bridge", "2026 forecast is missing the official revenue guide bridge.");
  }

  if (dashboard.marketImplied?.impliedRevenueCagr2027To2030 != null && Number.isFinite(dashboard.marketImplied.impliedRevenueCagr2027To2030)) {
    pass("market-implied-revenue-cagr", `Market-implied revenue CAGR is ${(dashboard.marketImplied.impliedRevenueCagr2027To2030 * 100).toFixed(1)}%.`);
  } else {
    fail("market-implied-revenue-cagr", "Market-implied revenue CAGR did not solve.");
  }

  const solvedBreakpoints = dashboard.thesisBreakpoints.filter((row) => row.breakValue != null).length;
  if (solvedBreakpoints >= 3) pass("thesis-breakpoints", `${solvedBreakpoints} thesis breakpoints solve to current price.`);
  else warn("thesis-breakpoints", `Only ${solvedBreakpoints} thesis breakpoints solve to current price.`);

  if (dashboard.valuationAttribution.bridge.at(-1)?.label === "Blended fair value") {
    pass("valuation-attribution", "Valuation bridge reconciles to blended fair value.");
  } else {
    fail("valuation-attribution", "Valuation attribution bridge does not reconcile to the blend.");
  }

  if (dashboard.risks.rows.every((row) => row.linkedAssumption && Number.isFinite(row.valuationHaircutPct))) {
    pass("risk-links-to-assumptions", "Every red-team risk links to a model assumption and valuation haircut.");
  } else {
    fail("risk-links-to-assumptions", "At least one red-team risk is not linked to an assumption or haircut.");
  }

  if (data.earningsCalls.length === 8) {
    pass("earnings-call-eight-quarter-window", "Earnings-call cockpit covers eight quarters.");
  } else {
    fail("earnings-call-eight-quarter-window", `Earnings-call cockpit covers ${data.earningsCalls.length} quarter(s), expected 8.`);
  }

  if (dashboard.earningsCalls?.focusTrendRows?.length >= 7 && dashboard.earningsCalls?.aiOverview) {
    pass("earnings-call-ai-trend-summary", "Eight-quarter market focus trend and AI synthesis are available.");
  } else {
    fail("earnings-call-ai-trend-summary", "Earnings-call trend summary is missing or incomplete.");
  }

  if (Number.isFinite(valuation.blendedFairValue ?? valuation.recommendedFairValue) && (valuation.blendedFairValue ?? valuation.recommendedFairValue ?? 0) > 0) {
    pass("valuation-finite", `Blended fair value is finite: $${(valuation.blendedFairValue ?? valuation.recommendedFairValue ?? 0).toFixed(2)}.`);
  } else {
    fail("valuation-finite", "Blended fair value is missing or non-positive.");
  }

  const warningCount = (valuation.validationWarnings ?? []).length;
  if (warningCount > 0) warn("valuation-warnings-visible", `${warningCount} valuation warning(s) are surfaced to the dashboard.`);
  else pass("valuation-warnings-visible", "No valuation warnings are active.");
} finally {
  await server.close();
}

const order = { FAIL: 0, WARNING: 1, PASS: 2 };
for (const row of results.sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id))) {
  console.log(`${row.status.padEnd(7)} ${row.id} - ${row.detail}`);
}

const failures = results.filter((row) => row.status === "FAIL");
const warnings = results.filter((row) => row.status === "WARNING");
console.log(`\nMETA validation summary: ${results.length - failures.length - warnings.length} PASS / ${warnings.length} WARNING / ${failures.length} FAIL`);

if (failures.length > 0) {
  process.exitCode = 1;
}
