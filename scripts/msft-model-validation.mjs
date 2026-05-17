import fs from "node:fs";
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

function closeTo(actual, expected, tolerance, id, detail) {
  if (Math.abs(actual - expected) <= tolerance) pass(id, detail);
  else fail(id, `${detail} Expected ${expected}, got ${actual}.`);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false, host: "127.0.0.1" },
  appType: "custom",
  logLevel: "error",
});

try {
  const calculations = await server.ssrLoadModule("/src/stocks/msft/calculations.ts");
  const assumptionsModule = await server.ssrLoadModule("/src/stocks/msft/assumptions.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/msft/data.ts");

  const data = dataModule.msftDataset;
  const assumptions = assumptionsModule.defaultMsftValuationAssumptions;
  const dashboard = calculations.buildMsftDashboardData(data, "q3-fy26", "Base", assumptions);
  const valuation = calculations.calculateMsftValuation(data, assumptions, "Base");

  for (const periodId of ["fy25", "q3-fy26"]) {
    const period = data.periods.find((item) => item.id === periodId);
    const segments = data.segments.filter((item) => item.periodId === periodId);
    const segmentRevenue = segments.reduce((sum, item) => sum + item.revenue, 0);
    const segmentOperatingIncome = segments.reduce((sum, item) => sum + item.operatingIncome, 0);
    closeTo(segmentRevenue, period.revenue, 1, `${periodId}-segment-revenue`, `${period.label} segment revenue reconciles.`);
    closeTo(segmentOperatingIncome, period.operatingIncome, 1, `${periodId}-segment-oi`, `${period.label} segment operating income reconciles.`);
  }

  for (const periodId of ["fy25", "q3-fy26", "ytd-q3-fy26"]) {
    const period = data.periods.find((item) => item.id === periodId);
    closeTo(
      (period.operatingCashFlow ?? 0) - (period.capex ?? 0),
      period.freeCashFlow ?? 0,
      1,
      `${periodId}-fcf-reconcile`,
      `${period.label} FCF reconciles to OCF less PPE additions.`,
    );
  }

  const q3 = data.periods.find((item) => item.id === "q3-fy26");
  closeTo(q3.netIncome / q3.dilutedShares, q3.dilutedEps, 0.01, "q3-eps-reconcile", "Q3 diluted EPS reconciles to net income / diluted shares.");
  closeTo(q3.grossProfit / q3.revenue, q3.grossMargin, 0.0001, "q3-gm-reconcile", "Q3 gross margin calculation is consistent.");
  closeTo(q3.operatingIncome / q3.revenue, q3.operatingMargin, 0.0001, "q3-op-margin-reconcile", "Q3 operating margin calculation is consistent.");

  const scenarioWeightSum = data.scenarios.reduce((sum, item) => sum + item.probability, 0);
  closeTo(scenarioWeightSum, 1, 0.0001, "scenario-weight-sum", "Scenario probabilities sum to 100%.");

  const blendWeightSum = Object.values(dashboard.valuationEngine.finalWeights).reduce((sum, item) => sum + item, 0);
  closeTo(blendWeightSum, 1, 0.0001, "valuation-weight-sum", "Valuation method weights sum to 100%.");

  const openAiEconomics = data.aiDisclosures.find((item) => item.id === "openai-revenue-share-economics");
  if (openAiEconomics?.sourceStatus === "scenario_assumption") pass("openai-source-tier", "Undisclosed OpenAI economics remain scenario assumptions.");
  else fail("openai-source-tier", "OpenAI revenue share economics were marked as official.");

  const invalidOpenAiActuals = data.aiDisclosures.filter(
    (item) =>
      item.id.includes("openai") &&
      item.sourceStatus === "official_actual" &&
      !["openai-investment-impact-q3"].includes(item.id),
  );
  if (invalidOpenAiActuals.length === 0) pass("openai-official-actual-boundary", "Only the OpenAI investment P&L impact is treated as official actual.");
  else fail("openai-official-actual-boundary", `Invalid official OpenAI records: ${invalidOpenAiActuals.map((item) => item.id).join(", ")}.`);

  if (valuation.validationWarnings?.length) pass("valuation-warnings-exposed", "Valuation warnings are exposed through ValuationResult.");
  else fail("valuation-warnings-exposed", "Valuation warnings are missing from ValuationResult.");

  if (dashboard.dataStatus.validationWarnings.length) pass("dashboard-warnings-exposed", "Dashboard data status exposes model warnings.");
  else fail("dashboard-warnings-exposed", "Dashboard data status has no warnings.");

  if (dashboard.valuationEngine.dcf.terminalValueShareOfEv > 0.76) {
    warn("terminal-value-heavy", `DCF terminal value is ${(dashboard.valuationEngine.dcf.terminalValueShareOfEv * 100).toFixed(1)}% of EV.`);
  } else {
    pass("terminal-value-share", "DCF terminal value share is below warning threshold.");
  }

  const q3CapexIntensity = q3.capex / q3.revenue;
  if (q3CapexIntensity > 0.28) warn("q3-capex-intensity", `Q3 capex intensity is ${(q3CapexIntensity * 100).toFixed(1)}%.`);
  else pass("q3-capex-intensity", "Q3 capex intensity below warning threshold.");

  const fy26e = data.periods.find((item) => item.id === "fy26e");
  if (fy26e.capex / fy26e.revenue > 0.30) warn("fy26e-capex-intensity", `FY2026E capex intensity is ${(fy26e.capex / fy26e.revenue * 100).toFixed(1)}%.`);
  else pass("fy26e-capex-intensity", "FY2026E capex intensity below warning threshold.");

  if (dashboard.aiFactory.latestCloud.microsoftCloudGrossMargin < dashboard.aiFactory.priorCloud.microsoftCloudGrossMargin) {
    warn("cloud-margin-compression", "Microsoft Cloud GM declined from FY2025 to Q3 FY2026 as AI infrastructure scaled.");
  } else {
    pass("cloud-margin-compression", "Microsoft Cloud GM did not compress.");
  }

  if (dashboard.copilot.sourceBoundary.includes("scenario assumptions")) pass("copilot-boundary", "Copilot ARPU, gross margin, and eligible seat denominator are treated as scenario assumptions.");
  else fail("copilot-boundary", "Copilot source boundary is missing.");

  if (dashboard.openAi.keyBoundary.includes("does not disclose")) pass("openai-boundary-copy", "OpenAI source boundary is visible in dashboard data.");
  else fail("openai-boundary-copy", "OpenAI boundary copy is missing.");

  if (dashboard.segment.warnings.length === 0) pass("segment-engine-clean", "Segment engine has no reconciliation warnings.");
  else fail("segment-engine-clean", dashboard.segment.warnings.map((item) => item.detail).join(" "));

  if (dashboard.businessMix.rows.length >= 7) pass("business-mix-coverage", "Business mix matrix covers core MSFT businesses.");
  else fail("business-mix-coverage", "Business mix matrix is too sparse.");

  if (data.earningsCalls.length === 8) pass("earnings-call-eight-quarter-coverage", "Earnings-call dataset covers the latest eight quarters.");
  else fail("earnings-call-eight-quarter-coverage", `Expected 8 earnings-call quarters, got ${data.earningsCalls.length}.`);

  const expectedQuarterIds = ["q4-fy24", "q1-fy25", "q2-fy25", "q3-fy25", "q4-fy25", "q1-fy26", "q2-fy26", "q3-fy26"];
  const actualQuarterIds = data.earningsCalls.map((quarter) => quarter.id);
  if (expectedQuarterIds.every((id, index) => actualQuarterIds[index] === id)) pass("earnings-call-quarter-order", "Earnings-call quarters are ordered from FY24 Q4 through FY26 Q3.");
  else fail("earnings-call-quarter-order", `Unexpected quarter order: ${actualQuarterIds.join(", ")}.`);

  const latestCall = data.earningsCalls[data.earningsCalls.length - 1];
  if (latestCall.aiRevenueRunRate === 37 && latestCall.copilotPaidSeats === 20) pass("latest-call-ai-kpis", "Latest call includes AI ARR and Copilot paid-seat disclosure.");
  else fail("latest-call-ai-kpis", "Latest call is missing AI ARR or Copilot paid-seat disclosure.");

  if (dashboard.earningsCalls.overview.sourceStatus === "research_only") pass("earnings-synthesis-source-tier", "Eight-quarter AI synthesis remains research-only.");
  else fail("earnings-synthesis-source-tier", "Eight-quarter AI synthesis must not be marked as official actual.");

  if (dashboard.earningsCalls.focusTrendRows.length === 8 && dashboard.earningsCalls.selectedFocusRows.length >= 7) pass("earnings-scroll-data-shape", "Earnings-call engine exposes trend rows and selected-quarter focus rows for the scrollable selector.");
  else fail("earnings-scroll-data-shape", "Earnings-call engine output is missing selector or trend data.");

  if (dashboard.risks.rows.length >= 6) pass("risk-red-team-coverage", "Risk red-team engine covers at least six risk items.");
  else fail("risk-red-team-coverage", "Risk red-team engine is too sparse.");

  if (valuation.methodCards.length >= 6) pass("valuation-method-coverage", "Valuation result includes DCF, FCF yield, P/E, EV/EBIT, SOTP, and AI optionality.");
  else fail("valuation-method-coverage", "Valuation method coverage is incomplete.");

  if (fs.existsSync("data/local/msft/msft_official_dataset.json")) pass("official-dataset-file", "Structured MSFT official dataset file exists.");
  else warn("official-dataset-file", "Structured MSFT official dataset file has not been generated yet.");
} catch (error) {
  fail("validation-exception", error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await server.close();
}

const passCount = results.filter((item) => item.status === "PASS").length;
const warningCount = results.filter((item) => item.status === "WARNING").length;
const failCount = results.filter((item) => item.status === "FAIL").length;

for (const result of results) {
  console.log(`${result.status}: ${result.id} - ${result.detail}`);
}

console.log(`MSFT validation summary: ${passCount} PASS / ${warningCount} WARNING / ${failCount} FAIL`);

if (failCount > 0) process.exit(1);
