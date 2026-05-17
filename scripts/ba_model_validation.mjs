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
  const calculations = await server.ssrLoadModule("/src/stocks/ba/calculations.ts");
  const configModule = await server.ssrLoadModule("/src/stocks/ba/config.ts");
  const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");

  const data = calculations.baDataset;
  const periodId = calculations.getDefaultBaPeriod();
  const dashboard = calculations.buildBaDashboardData(data, periodId, "Base");
  const valuation = calculations.calculateBaValuation(data, periodId, "Base");
  const assumptions = calculations.defaultBaValuationAssumptions;
  const baModule = configModule.baModule;

  if (registryModule.stockRegistry["BA.L"] === baModule) {
    pass("registry", "BA.L module is registered through src/stocks/registry.ts.");
  } else {
    fail("registry", "BA.L module is not registered through src/stocks/registry.ts.");
  }

  ["data", "calculateSummary", "calculateValuation", "Dashboard", "valuationConfig"].forEach((field) => {
    if (field in baModule && baModule[field]) pass(`contract-${field}`, `Module exposes ${field}.`);
    else fail(`contract-${field}`, `Module missing ${field}.`);
  });

  const period = dashboard.period;
  const segmentSales = dashboard.segment.totals.sales;
  if (closeTo(segmentSales, period.sales, 2)) {
    pass("segment-sales-reconciliation", `Segment sales reconcile to group sales: ${segmentSales}m.`);
  } else {
    fail("segment-sales-reconciliation", `Segment sales ${segmentSales}m do not reconcile to group sales ${period.sales}m.`);
  }

  const segmentEbit = dashboard.segment.totals.underlyingEbit;
  if (closeTo(segmentEbit, period.underlyingEbit, 2)) {
    pass("segment-ebit-reconciliation", `Segment underlying EBIT reconciles to group EBIT: ${segmentEbit}m.`);
  } else {
    fail("segment-ebit-reconciliation", `Segment EBIT ${segmentEbit}m does not reconcile to group EBIT ${period.underlyingEbit}m.`);
  }

  const expectedCoverage = period.orderBacklog / period.sales;
  if (closeTo(dashboard.backlog.backlogCoverageYears, expectedCoverage, 1e-9)) {
    pass("backlog-coverage", `Backlog coverage equals backlog / sales: ${dashboard.backlog.backlogCoverageYears.toFixed(4)}x.`);
  } else {
    fail("backlog-coverage", "Backlog coverage does not equal backlog / sales.");
  }

  const expectedBookToBill = period.orderIntake / period.sales;
  if (closeTo(dashboard.backlog.bookToBill, expectedBookToBill, 1e-9)) {
    pass("book-to-bill", `Book-to-bill equals order intake / sales: ${dashboard.backlog.bookToBill.toFixed(4)}x.`);
  } else {
    fail("book-to-bill", "Book-to-bill does not equal order intake / sales.");
  }

  if (period.capex != null) {
    const simpleFcf = period.netCashFlowFromOperations - period.capex;
    if (closeTo(simpleFcf, period.freeCashFlow, 5)) {
      pass("fcf-formula", `FCF equals operating cash flow - capex: ${period.freeCashFlow}m.`);
    } else {
      warn(
        "fcf-formula",
        `Simple OCF - capex is ${simpleFcf}m versus reported FCF ${period.freeCashFlow}m. BAE's APM free cash flow includes definition-specific items; keep official FCF separate from simple cash-flow bridge.`,
      );
    }
  } else {
    warn("fcf-formula", "Capex is missing, so FCF = operating cash flow - capex cannot be checked.");
  }

  const dividendCash = (period.dividendPerSharePence / 100) * (period.outstandingSharesForEps ?? 0);
  const earningsPayout = (period.dividendPerSharePence / period.underlyingEpsPence);
  const fcfPayout = dividendCash / period.freeCashFlow;
  if (closeTo(dashboard.dividend.earningsPayout, earningsPayout, 1e-9)) {
    pass("dividend-earnings-payout", `Dividend payout vs earnings is ${(earningsPayout * 100).toFixed(1)}%.`);
  } else {
    fail("dividend-earnings-payout", "Dividend earnings payout ratio does not equal DPS / underlying EPS.");
  }
  if (closeTo(dashboard.dividend.fcfPayout, fcfPayout, 1e-9)) {
    pass("dividend-fcf-payout", `Dividend payout vs FCF is ${(fcfPayout * 100).toFixed(1)}%.`);
  } else {
    fail("dividend-fcf-payout", "Dividend FCF payout ratio does not equal dividends / FCF.");
  }

  if (dashboard.valuationEngine.dcf.terminalValueShareOfEv > 0.72) {
    warn(
      "dcf-terminal-value",
      `Terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV, above the 72% caution threshold.`,
    );
  } else {
    pass("dcf-terminal-value", `Terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`);
  }

  assertRange(assumptions.wacc, 0.065, 0.11, "wacc-range", "WACC");
  assertRange(assumptions.terminalGrowth, 0.01, 0.035, "terminal-growth-range", "Terminal growth");
  assertRange(assumptions.operatingMargin, 0.085, 0.13, "margin-range", "Operating margin");
  assertRange(assumptions.revenueCagr, 0, 0.12, "revenue-cagr-range", "Revenue CAGR");

  const researchOnlySourceErrors = [
    ...data.programs.filter((program) => program.sourceStatus !== "research_only"),
    ...data.risks.filter((risk) => risk.sourceStatus !== "research_only"),
  ];
  const highIsolationWarnings = (valuation.validationWarnings ?? []).filter((warning) => /source-isolation/i.test(warning.id) && warning.severity === "high");
  if (researchOnlySourceErrors.length === 0 && highIsolationWarnings.length === 0) {
    pass("research-only-isolation", "Research-only programme and risk notes are not promoted into official actuals or direct valuation inputs.");
  } else {
    fail("research-only-isolation", "Research-only notes crossed the source boundary.");
  }

  const weightSum = Object.values(dashboard.valuationEngine.finalWeights).reduce((sum, weight) => sum + weight, 0);
  if (closeTo(weightSum, 1, 1e-9)) {
    pass("valuation-weight-sum", "Valuation triangulation weights sum to 100%.");
  } else {
    fail("valuation-weight-sum", `Valuation triangulation weights sum to ${(weightSum * 100).toFixed(1)}%.`);
  }

  const sourceStatusSet = new Set(data.sources.map((source) => source.sourceStatus));
  ["official_actual", "management_guidance", "forecast_assumption", "research_only", "market_data"].forEach((status) => {
    if (sourceStatusSet.has(status)) pass(`source-status-${status}`, `Source map includes ${status}.`);
    else fail(`source-status-${status}`, `Source map missing ${status}.`);
  });

  if (Number.isFinite(dashboard.valuationEngine.blendedFairValue) && dashboard.valuationEngine.blendedFairValue > 0) {
    pass("valuation-finite", `Blended fair value is finite: £${dashboard.valuationEngine.blendedFairValue.toFixed(2)}.`);
  } else {
    fail("valuation-finite", "Blended fair value is missing or non-positive.");
  }

  if (dashboard.reportingEvents.events.length === 8) {
    pass("reporting-events-eight-quarters", "Reporting-event intelligence covers eight quarter windows.");
  } else {
    fail("reporting-events-eight-quarters", `Expected 8 reporting windows, found ${dashboard.reportingEvents.events.length}.`);
  }
  const reportingEventsSorted = dashboard.reportingEvents.events.every((event, index, events) => index === 0 || events[index - 1].eventDate <= event.eventDate);
  if (reportingEventsSorted) {
    pass("reporting-events-sorted", "Reporting events are sorted chronologically for scrollbar navigation.");
  } else {
    fail("reporting-events-sorted", "Reporting events are not sorted chronologically.");
  }
  const aiSynthesisIsResearchOnly = dashboard.reportingEvents.events.every((event) => event.aiSummary.sourceStatus === "research_only");
  if (aiSynthesisIsResearchOnly && dashboard.reportingEvents.overview.sourceStatus === "research_only") {
    pass("reporting-ai-research-only", "AI market-focus summaries are marked research-only.");
  } else {
    fail("reporting-ai-research-only", "AI market-focus summaries are not research-only.");
  }
  const allReportingSourcesMapped = dashboard.reportingEvents.events.every((event) => data.sourceMap[event.sourceId]);
  if (allReportingSourcesMapped) {
    pass("reporting-source-map", "Every reporting event maps back to a source record.");
  } else {
    fail("reporting-source-map", "At least one reporting event lacks source-map provenance.");
  }
  const officialVideoCount = dashboard.reportingEvents.events.filter((event) => event.transcriptStatus === "official_video_available").length;
  if (officialVideoCount >= 3) {
    pass("reporting-transcript-status", `${officialVideoCount} reporting windows have official video availability; non-video updates are explicitly labeled.`);
  } else {
    warn("reporting-transcript-status", `Only ${officialVideoCount} reporting windows have official video availability.`);
  }

  const warningCount = (valuation.validationWarnings ?? []).length;
  if (warningCount > 0) {
    warn("valuation-warnings-visible", `${warningCount} valuation warnings are surfaced to the dashboard.`);
  } else {
    pass("valuation-warnings-visible", "No valuation warnings are active.");
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
console.log(`\nBA.L validation summary: ${results.length - failures.length - warnings.length} PASS / ${warnings.length} WARNING / ${failures.length} FAIL`);

if (failures.length > 0) {
  process.exitCode = 1;
}
