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

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const calculations = await server.ssrLoadModule("/src/stocks/tri/calculations.ts");
  const configModule = await server.ssrLoadModule("/src/stocks/tri/config.ts");
  const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");

  const data = calculations.triDataset;
  const periodId = calculations.getDefaultTriPeriod();
  const dashboard = calculations.buildTriDashboardData(data, periodId, "Base");
  const valuation = calculations.calculateTriValuation(data, periodId, "Base");
  const triModule = configModule.triModule;

  if (registryModule.stockRegistry.TRI === triModule) pass("registry", "TRI module is registered through src/stocks/registry.ts.");
  else fail("registry", "TRI module is not registered through src/stocks/registry.ts.");

  ["data", "calculateSummary", "calculateValuation", "Dashboard", "valuationConfig"].forEach((field) => {
    if (field in triModule && triModule[field]) pass(`contract-${field}`, `Module exposes ${field}.`);
    else fail(`contract-${field}`, `Module missing ${field}.`);
  });

  const period = dashboard.period;
  if (period.revenue === 2087 && period.adjustedEbitda === 881 && period.freeCashFlow === 332) {
    pass("official-q1-actuals", "Q1 2026 revenue, adjusted EBITDA and FCF are loaded from official actuals.");
  } else {
    fail("official-q1-actuals", "Q1 2026 official actuals do not match the curated source.");
  }

  const segmentRevenue = data.segments.filter((item) => item.periodId === periodId).reduce((sum, item) => sum + item.revenue, 0);
  if (closeTo(segmentRevenue, period.revenue, 1)) pass("segment-revenue-reconciliation", `Segment revenue reconciles to total revenue: ${segmentRevenue}m.`);
  else fail("segment-revenue-reconciliation", `Segment revenue ${segmentRevenue}m does not reconcile to total ${period.revenue}m.`);

  const segmentEbitda = data.segments.filter((item) => item.periodId === periodId).reduce((sum, item) => sum + item.adjustedEbitda, 0);
  if (closeTo(segmentEbitda, period.adjustedEbitda, 1)) pass("segment-ebitda-reconciliation", `Segment adjusted EBITDA reconciles to total adjusted EBITDA: ${segmentEbitda}m.`);
  else fail("segment-ebitda-reconciliation", `Segment adjusted EBITDA ${segmentEbitda}m does not reconcile to total ${period.adjustedEbitda}m.`);

  if (data.aiMilestones.length >= 4) pass("ai-milestones", `${data.aiMilestones.length} AI progress milestones are available.`);
  else fail("ai-milestones", "AI progress milestones are missing.");

  if (dashboard.aiProgress.aiProgressScore > 50 && dashboard.aiProgress.aiRevenueExposure > 0.7) {
    pass("ai-progress-engine", `AI progress score ${dashboard.aiProgress.aiProgressScore}; high-AI revenue exposure ${(dashboard.aiProgress.aiRevenueExposure * 100).toFixed(1)}%.`);
  } else {
    warn("ai-progress-engine", "AI progress score or high-AI revenue exposure is below expected level.");
  }

  const weightSum = Object.values(dashboard.valuationEngine.weights).reduce((sum, value) => sum + value, 0);
  if (closeTo(weightSum, 1, 1e-9)) pass("valuation-weights", "Valuation weights sum to 100%.");
  else fail("valuation-weights", `Valuation weights sum to ${(weightSum * 100).toFixed(1)}%.`);

  if (dashboard.valuationEngine.cappedAiPremium <= 0.08) {
    pass("ai-premium-capped", `AI premium is capped at ${(dashboard.valuationEngine.cappedAiPremium * 100).toFixed(1)}%.`);
  } else {
    fail("ai-premium-capped", "AI premium exceeds configured cap.");
  }

  if (Math.abs(dashboard.valuationEngine.cappedRiskDiscount) <= 0.12) pass("risk-discount-capped", `Risk discount is capped at ${(dashboard.valuationEngine.cappedRiskDiscount * 100).toFixed(1)}%.`);
  else fail("risk-discount-capped", "Risk discount exceeds configured cap.");

  if (dashboard.valuationEngine.dcf.terminalValueShareOfEv > 0.78) {
    warn("terminal-value-share", `DCF terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`);
  } else {
    pass("terminal-value-share", `DCF terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`);
  }

  valuation.fairValues.forEach((point) => {
    if (point.fairValue > 40 && point.fairValue < 250) pass(`scenario-bound-${point.scenario}`, `${point.scenario} fair value ${point.fairValue.toFixed(1)} is inside sanity bounds.`);
    else fail(`scenario-bound-${point.scenario}`, `${point.scenario} fair value ${point.fairValue.toFixed(1)} is outside sanity bounds.`);
  });

  if (data.sources.every((source) => source.id && source.url && source.sourceType && source.accessedDate)) {
    pass("source-metadata", "All TRI sources include id, url, source type and accessed date.");
  } else {
    fail("source-metadata", "Some TRI sources are missing metadata.");
  }

  const officialLayerOk = data.periods.every((item) => item.sourceType === "official_actual") && data.guidance.sourceType === "management_guidance";
  if (officialLayerOk) pass("source-layering", "Official actuals and management guidance are kept separate.");
  else fail("source-layering", "Official actuals or guidance source layers are incorrectly labelled.");

  if (dashboard.dataStatus.missingFields.length > 0) pass("data-gaps-visible", "Dashboard exposes missing data fields.");
  else warn("data-gaps-visible", "Dashboard does not list missing data fields.");
} finally {
  await server.close();
}

const order = { FAIL: 0, WARNING: 1, PASS: 2 };
for (const row of results.sort((left, right) => order[left.status] - order[right.status] || left.id.localeCompare(right.id))) {
  console.log(`${row.status.padEnd(7)} ${row.id} - ${row.detail}`);
}

const failures = results.filter((row) => row.status === "FAIL");
const warnings = results.filter((row) => row.status === "WARNING");
console.log(`\nTRI validation summary: ${results.length - failures.length - warnings.length} PASS / ${warnings.length} WARNING / ${failures.length} FAIL`);

if (failures.length > 0) {
  process.exitCode = 1;
}
