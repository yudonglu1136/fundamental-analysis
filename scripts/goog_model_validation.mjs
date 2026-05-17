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

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const calculations = await server.ssrLoadModule("/src/stocks/googl/calculations.ts");
  const configModule = await server.ssrLoadModule("/src/stocks/googl/config.ts");
  const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");

  const data = calculations.googlDataset;
  const periodId = calculations.getDefaultGooglPeriod();
  const dashboard = calculations.buildGooglDashboardData(data, periodId, "Base");
  const valuation = calculations.calculateGooglValuation(data, periodId, "Base");
  const googlModule = configModule.googlModule;

  if (registryModule.stockRegistry.GOOGL === googlModule) pass("registry", "GOOGL module is registered through src/stocks/registry.ts.");
  else fail("registry", "GOOGL module is not registered through src/stocks/registry.ts.");

  ["data", "calculateSummary", "calculateValuation", "Dashboard", "valuationConfig"].forEach((field) => {
    if (field in googlModule && googlModule[field]) pass(`contract-${field}`, `Module exposes ${field}.`);
    else fail(`contract-${field}`, `Module missing ${field}.`);
  });

  const financial = dashboard.period;
  const revenueLine = data.revenueLines.find((item) => item.periodId === periodId);
  if (!revenueLine) {
    fail("revenue-line", `Missing revenue line for ${periodId}.`);
  } else {
    const revenueSum =
      revenueLine.googleServicesTotal + revenueLine.googleCloud + revenueLine.otherBets + revenueLine.hedging;
    if (closeTo(revenueSum, financial.totalRevenue, 1)) pass("revenue-reconciliation", `Revenue lines reconcile to total revenue: ${revenueSum}m.`);
    else fail("revenue-reconciliation", `Revenue lines ${revenueSum}m do not reconcile to total ${financial.totalRevenue}m.`);
  }

  const segmentOperatingIncome = data.segments
    .filter((item) => item.periodId === periodId)
    .reduce((sum, item) => sum + item.operatingIncome, 0);
  if (closeTo(segmentOperatingIncome, financial.operatingIncome, 1)) {
    pass("segment-operating-income", `Segment operating income reconciles to consolidated operating income: ${segmentOperatingIncome}m.`);
  } else {
    fail("segment-operating-income", `Segment operating income ${segmentOperatingIncome}m does not reconcile to ${financial.operatingIncome}m.`);
  }

  const fcf = financial.netCashProvidedByOperatingActivities - financial.capex;
  if (closeTo(fcf, financial.freeCashFlow, 1)) pass("fcf-formula", `FCF equals OCF minus capex: ${financial.freeCashFlow}m.`);
  else fail("fcf-formula", `OCF minus capex is ${fcf}m versus FCF ${financial.freeCashFlow}m.`);

  const capexIntensity = financial.capex / financial.totalRevenue;
  if (capexIntensity > 0.25 && capexIntensity < 0.4) pass("capex-intensity", `Q1 2026 capex intensity is ${(capexIntensity * 100).toFixed(1)}%.`);
  else warn("capex-intensity", `Q1 2026 capex intensity ${(capexIntensity * 100).toFixed(1)}% is outside expected AI build range.`);

  if (closeTo(dashboard.cloud.margin, 0.3295, 0.002)) pass("cloud-margin", `Cloud margin bridge is ${(dashboard.cloud.margin * 100).toFixed(1)}%.`);
  else warn("cloud-margin", `Cloud margin ${(dashboard.cloud.margin * 100).toFixed(1)}% differs from expected Q1 2026 32.9%.`);

  const netCash = data.commitmentsAndCapitalStructure
    ? data.financials.find((item) => item.id === "q1-26").cashAndMarketableSecurities - data.financials.find((item) => item.id === "q1-26").longTermDebt
    : 0;
  if (closeTo(netCash, dashboard.capitalReturn.netCash, 1)) pass("net-cash", `Net cash calculation reconciles: ${netCash}m.`);
  else fail("net-cash", `Net cash ${netCash}m does not reconcile to dashboard ${dashboard.capitalReturn.netCash}m.`);

  const weightSum = Object.values(dashboard.valuationEngine.weights).reduce((sum, value) => sum + value, 0);
  if (closeTo(weightSum, 1, 1e-9)) pass("valuation-weights", "Valuation weights sum to 100%.");
  else fail("valuation-weights", `Valuation weights sum to ${(weightSum * 100).toFixed(1)}%.`);

  if (dashboard.valuationEngine.dcf.terminalValueShareOfEv > 0.75) {
    warn("terminal-value-share", `DCF terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`);
  } else {
    pass("terminal-value-share", `DCF terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`);
  }

  valuation.fairValues.forEach((point) => {
    if (point.fairValue > 50 && point.fairValue < 1_000) pass(`scenario-bound-${point.scenario}`, `${point.scenario} fair value ${point.fairValue.toFixed(1)} is inside sanity bounds.`);
    else fail(`scenario-bound-${point.scenario}`, `${point.scenario} fair value ${point.fairValue.toFixed(1)} is outside sanity bounds.`);
  });

  const officialValuesMissingSource = [
    ...data.financials.filter((item) => item.sourceType === "official_actual" && !item.sourceId),
    ...data.revenueLines.filter((item) => item.sourceType === "official_actual" && !item.sourceId),
    ...data.segments.filter((item) => item.sourceType === "official_actual" && !item.sourceId),
  ];
  if (officialValuesMissingSource.length === 0) pass("official-source-metadata", "Every official_actual record has source metadata.");
  else fail("official-source-metadata", `${officialValuesMissingSource.length} official actual records lack source metadata.`);

  if (isFinitePositive(valuation.recommendedFairValue ?? 0) && isFinitePositive(valuation.blendedFairValue ?? 0)) pass("valuation-finite", "Recommended and blended fair values are finite and positive.");
  else fail("valuation-finite", "Recommended or blended fair value is missing or non-positive.");

  const warningCount = (valuation.validationWarnings ?? []).length;
  if (warningCount > 0) warn("valuation-warnings-visible", `${warningCount} valuation warnings are surfaced to the dashboard.`);
  else pass("valuation-warnings-visible", "No valuation warnings are active.");

  if ((dashboard.transcriptIntelligence?.quarters?.length ?? 0) >= 8) {
    pass("transcript-eight-periods", `${dashboard.transcriptIntelligence.quarters.length} earnings-call periods are available for the scroll selector.`);
  } else {
    fail("transcript-eight-periods", "Fewer than eight Alphabet earnings-call periods are available.");
  }

  if ((dashboard.transcriptIntelligence?.focusTrend?.length ?? 0) > 0 && dashboard.transcriptIntelligence?.aiTrendSummary) {
    pass("transcript-focus-trend", "Eight-quarter market-focus trend and AI overview summary are available.");
  } else {
    fail("transcript-focus-trend", "Transcript focus trend or AI overview summary is missing.");
  }

  if ((dashboard.transcriptIntelligence?.qaPairs ?? []).every((pair) => pair.valuationImpactAllowed === false && pair.topic)) {
    pass("transcript-valuation-guard", "All transcript Q&A/theme pairs are topic-classified and valuation-blocked.");
  } else {
    fail("transcript-valuation-guard", "Some transcript Q&A/theme pairs lack topic classification or valuation guard.");
  }
} finally {
  await server.close();
}

const order = { FAIL: 0, WARNING: 1, PASS: 2 };
for (const row of results.sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id))) {
  console.log(`${row.status.padEnd(7)} ${row.id} - ${row.detail}`);
}

const failures = results.filter((row) => row.status === "FAIL");
const warnings = results.filter((row) => row.status === "WARNING");
console.log(`\nGOOGL validation summary: ${results.length - failures.length - warnings.length} PASS / ${warnings.length} WARNING / ${failures.length} FAIL`);

if (failures.length > 0) {
  process.exitCode = 1;
}
