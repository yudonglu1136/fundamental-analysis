#!/usr/bin/env node
import { query } from "../apps/api/src/db/client.mjs";

const checks = [];

function record(status, title, detail = "") {
  checks.push({ status, title, detail });
}

function pass(title, detail) {
  record("PASS", title, detail);
}

function warn(title, detail) {
  record("WARNING", title, detail);
}

function fail(title, detail) {
  record("FAIL", title, detail);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function latestBaseRun(eventId) {
  return query(
    `SELECT v.*, e.eventDate, e.fiscalPeriod, e.eventType
     FROM valuation_runs v
     JOIN reporting_events e ON e.id = v.reportingEventId
     WHERE v.ticker = ?
       AND v.scenario = 'Base'
       AND v.modelVersion = 'lseg_v1_backend_pilot'
       AND v.reportingEventId = ?
     ORDER BY v.createdAt DESC
     LIMIT 1`,
    ["LSEG.L", eventId],
  )[0] ?? null;
}

function qaTable(run, title) {
  const tables = parseJson(run?.sensitivityTablesJson, []);
  return tables.find((table) => table.title === title)?.table ?? [];
}

function tableMap(table) {
  return Object.fromEntries(table.slice(1).map((row) => [row[0], row[1]]));
}

function methodOutput(run, key) {
  const methods = parseJson(run?.methodOutputsJson, []);
  return methods.find((method) => method.key === key || method.label === key) ?? null;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

console.log("LSEG Model QA Validation");

const fyRun = latestBaseRun("lseg-fy2025-annual-report") ?? latestBaseRun("lseg_fy_2025_preliminary_results_2026-02-26");
const q1Run = latestBaseRun("lseg_q1_2026_trading_update_2026-04-23");

if (!fyRun) fail("FY2025 Base valuation exists", "Backfill historical valuation runs before running QA.");
else pass("FY2025 Base valuation exists", `fairValue=${fyRun.fairValue}`);

if (!q1Run) fail("Q1 2026 Base valuation exists", "Backfill historical valuation runs before running QA.");
else pass("Q1 2026 Base valuation exists", `fairValue=${q1Run.fairValue}`);

if (fyRun && q1Run) {
  const q1Snapshot = parseJson(q1Run.dataSnapshotJson, {});
  const semantics = q1Snapshot.valuationSemantics ?? {};
  const dcfAudit = tableMap(qaTable(q1Run, "Model QA: DCF year-one base audit"));
  const balanceSheetAudit = tableMap(qaTable(q1Run, "Model QA: balance-sheet bridge audit"));
  const postTradeAuditQ1 = tableMap(qaTable(q1Run, "Model QA: Post Trade driver audit"));
  const postTradeAuditFy = tableMap(qaTable(fyRun, "Model QA: Post Trade driver audit"));

  semantics.isAnnualizedRunRate && semantics.isSameYearForecastAnchor
    ? pass("Q1 2026 run-rate semantics are explicit", JSON.stringify({
        forecastStartYear: semantics.forecastStartYear,
        firstGrowthYear: semantics.firstGrowthYear,
      }))
    : fail("Q1 2026 run-rate semantics are explicit", JSON.stringify(semantics));

  semantics.dcfYearOneGrowthSuppressed === true
    ? pass("Q1 2026 DCF same-year growth suppression triggered")
    : fail("Q1 2026 DCF same-year growth suppression triggered", JSON.stringify(semantics));

  const eventRunRateRevenue = Number(dcfAudit["Event run-rate revenue"]);
  const yearOneBefore = Number(dcfAudit["Year-one DCF revenue before fix"]);
  const yearOneAfter = Number(dcfAudit["Year-one DCF revenue after fix"]);
  const growthBefore = Number(dcfAudit["Implied growth vs audited before fix"]);
  const growthAfter = Number(dcfAudit["Implied growth vs audited after fix"]);

  finite(eventRunRateRevenue) && finite(yearOneAfter) && yearOneAfter <= eventRunRateRevenue * 1.001
    ? pass("Q1 2026 DCF year-one revenue does not double compound", `after=${yearOneAfter}; runRate=${eventRunRateRevenue}`)
    : fail("Q1 2026 DCF year-one revenue does not double compound", JSON.stringify(dcfAudit));

  finite(yearOneBefore) && yearOneBefore > yearOneAfter
    ? pass("DCF audit captures pre-fix aggressive year-one revenue", `before=${yearOneBefore}; after=${yearOneAfter}`)
    : fail("DCF audit captures pre-fix aggressive year-one revenue", JSON.stringify(dcfAudit));

  finite(growthAfter) && growthAfter >= 6 && growthAfter <= 8
    ? pass("Q1 2026 implied FY2026 revenue growth is guidance-like", `${growthAfter}% vs pre-fix ${growthBefore}%`)
    : warn("Q1 2026 implied FY2026 revenue growth is guidance-like", `${growthAfter}% vs pre-fix ${growthBefore}%`);

  const leaseLiabilities = Number(balanceSheetAudit["Lease liabilities"]);
  const carriedForwardLeaseLiabilities = Number(balanceSheetAudit["Carried-forward lease liabilities"]);
  carriedForwardLeaseLiabilities >= 600 && leaseLiabilities >= 600
    ? pass("Q1 2026 carries forward FY2025 lease liabilities", `lease=${leaseLiabilities}; carried=${carriedForwardLeaseLiabilities}`)
    : fail("Q1 2026 carries forward FY2025 lease liabilities", JSON.stringify(balanceSheetAudit));

  const q1Fv = Number(q1Run.fairValue);
  const fyFv = Number(fyRun.fairValue);
  q1Fv > fyFv && q1Fv < 124.84
    ? pass("Q1 2026 fair value remains higher but below pre-fix aggressive value", `FY2025=${fyFv}; Q1=${q1Fv}`)
    : fail("Q1 2026 fair value remains higher but below pre-fix aggressive value", `FY2025=${fyFv}; Q1=${q1Fv}; preFix=124.84`);

  const postTradeUpliftQ1 = Number(postTradeAuditQ1["Post Trade layer uplift"]);
  const postTradeUpliftFy = Number(postTradeAuditFy["Post Trade layer uplift"]);
  Math.abs(postTradeUpliftQ1 - postTradeUpliftFy) < 0.25
    ? pass("Post Trade layer is not the primary Q1 2026 jump driver", `FY=${postTradeUpliftFy}; Q1=${postTradeUpliftQ1}`)
    : fail("Post Trade layer is not the primary Q1 2026 jump driver", `FY=${postTradeUpliftFy}; Q1=${postTradeUpliftQ1}`);

  const dcfCard = methodOutput(q1Run, "fcff-dcf");
  const sotpCard = methodOutput(q1Run, "sotp");
  const multipleCard = methodOutput(q1Run, "ev-ebitda");
  [dcfCard, sotpCard, multipleCard].every((card) => card?.valuationBase)
    ? pass("Method-level valuation base labels are persisted", [dcfCard?.valuationBase, sotpCard?.valuationBase, multipleCard?.valuationBase].join(" | "))
    : fail("Method-level valuation base labels are persisted", JSON.stringify({ dcfCard, sotpCard, multipleCard }));
}

const totals = {
  PASS: checks.filter((check) => check.status === "PASS").length,
  WARNING: checks.filter((check) => check.status === "WARNING").length,
  FAIL: checks.filter((check) => check.status === "FAIL").length,
};

for (const check of checks) {
  const suffix = check.detail ? ` - ${check.detail}` : "";
  console.log(`${check.status}: ${check.title}${suffix}`);
}
console.log("");
console.log(`PASS: ${totals.PASS}`);
console.log(`WARNING: ${totals.WARNING}`);
console.log(`FAIL: ${totals.FAIL}`);

process.exit(totals.FAIL > 0 ? 1 : 0);
