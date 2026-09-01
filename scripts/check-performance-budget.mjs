#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MIN_SAMPLES = 60;
const MIN_RUNS = 3;
const REQUIRED_CONCURRENCY = 20;
const REQUIRED_ROUTES = [
  "/api/valuation",
  "/api/valuation/LSEG?pricePoints=300&detail=summary",
  "/api/valuation/LSEG?pricePoints=900",
  "/api/gurus",
  "/api/backtests?years=all&detail=compact",
  "/api/ontology/overview",
  "/api/graph"
];

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readReport(name) {
  const location = argument(name);
  if (!location) throw new Error(`--${name} is required`);
  return JSON.parse(fs.readFileSync(path.resolve(location), "utf8"));
}

function routeMap(report) {
  return new Map(report.routes.map((route) => [route.route, route]));
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validHash(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function validateReport(report, label, failures) {
  if (Number(report?.schemaVersion) < 2) failures.push(`${label}: obsolete benchmark schema`);
  if (report?.aggregate !== "median") failures.push(`${label}: report is not a median aggregate`);
  if (!Number.isInteger(report?.inputs?.runs) || report.inputs.runs < MIN_RUNS) {
    failures.push(`${label}: requires at least ${MIN_RUNS} runs`);
  }
  if (!Number.isInteger(report?.inputs?.samples) || report.inputs.samples < MIN_SAMPLES) {
    failures.push(`${label}: requires at least ${MIN_SAMPLES} samples`);
  }
  if (report?.inputs?.concurrency !== REQUIRED_CONCURRENCY) {
    failures.push(`${label}: concurrency must be ${REQUIRED_CONCURRENCY}`);
  }
  if (!(Number(report?.inputs?.databaseBytes) > 0) || !validHash(report?.inputs?.databaseSha256)) {
    failures.push(`${label}: invalid database identity`);
  }
  if (!(Number(report?.inputs?.ontologyBytes) > 0) || !validHash(report?.inputs?.ontologySha256)) {
    failures.push(`${label}: invalid ontology identity`);
  }
  if (!report?.runtime?.node || !report?.runtime?.platform || !report?.runtime?.arch) {
    failures.push(`${label}: incomplete runtime identity`);
  }
  if (!validHash(report?.sourceSha256)) failures.push(`${label}: invalid runtime source identity`);
  if (!Array.isArray(report?.routes) || !report.routes.length) {
    failures.push(`${label}: no routes were benchmarked`);
    return;
  }
  const routeNames = report.routes.map((route) => route.route);
  if (new Set(routeNames).size !== routeNames.length) {
    failures.push(`${label}: duplicate routes make completeness ambiguous`);
  }
  for (const route of REQUIRED_ROUTES) {
    if (!routeNames.includes(route)) failures.push(`${label}: required route missing: ${route}`);
  }
  for (const route of report.routes) {
    if (route.status !== 200) failures.push(`${label} ${route.route}: status ${route.status}`);
    if (Number(route?.sequential?.requests) !== report?.inputs?.samples) {
      failures.push(`${label} ${route.route}: sequential request count does not match samples`);
    }
    if (Number(route?.concurrent?.requests) !== report?.inputs?.samples) {
      failures.push(`${label} ${route.route}: concurrent request count does not match samples`);
    }
    if (Number(route?.concurrent?.concurrency) !== report?.inputs?.concurrency) {
      failures.push(`${label} ${route.route}: route concurrency does not match inputs`);
    }
    if (!(Number(route?.concurrent?.p95Ms) > 0)) {
      failures.push(`${label} ${route.route}: concurrent p95 is invalid`);
    }
    if (!validHash(route.semanticSha256)) {
      failures.push(`${label} ${route.route}: semantic hash is invalid`);
    }
    if (route.conditionalStatus !== 304) {
      failures.push(`${label} ${route.route}: conditional request was not 304`);
    }
    if (Number(route.identityBytes) >= 64 * 1024) {
      if (!["gzip", "br"].includes(route.contentEncoding)) {
        failures.push(`${label} ${route.route}: large JSON was not compressed`);
      }
      if (!(Number(route.reductionPct) >= 75)) {
        failures.push(`${label} ${route.route}: compression saved less than 75%`);
      }
      if (!String(route.vary || "").toLowerCase().includes("accept-encoding")) {
        failures.push(`${label} ${route.route}: Vary does not include Accept-Encoding`);
      }
    }
  }
}

const baseline = readReport("baseline");
const current = readReport("current");
const mode = argument("mode") || "optimization";
if (!["optimization", "regression"].includes(mode)) {
  throw new Error("--mode must be optimization or regression");
}
const failures = [];
const improvements = [];
validateReport(baseline, "baseline", failures);
validateReport(current, "current", failures);

for (const field of [
  "databaseBytes",
  "databaseSha256",
  "ontologyBytes",
  "ontologySha256",
  "samples",
  "concurrency"
]) {
  if (!sameValue(baseline?.inputs?.[field], current?.inputs?.[field])) {
    failures.push(`benchmark input differs: ${field}`);
  }
}
if (!sameValue(baseline.runtime, current.runtime)) failures.push("benchmark runtime differs");

const baselineRoutes = Array.isArray(baseline.routes) ? baseline.routes : [];
const currentRoutes = Array.isArray(current.routes) ? current.routes : [];
const previous = routeMap({ routes: baselineRoutes });
const currentNames = new Set(currentRoutes.map((route) => route.route));
for (const route of baselineRoutes) {
  if (!currentNames.has(route.route)) failures.push(`${route.route}: missing from current report`);
}

for (const route of currentRoutes) {
  const before = previous.get(route.route);
  if (!before) {
    failures.push(`${route.route}: missing from baseline`);
    continue;
  }
  if (route.semanticSha256 !== before.semanticSha256) {
    failures.push(`${route.route}: semantic response hash changed`);
  }
  if (!(Number(route?.concurrent?.p95Ms) > 0) || !(Number(before?.concurrent?.p95Ms) > 0)) {
    continue;
  }
  const changePct = (1 - route.concurrent.p95Ms / before.concurrent.p95Ms) * 100;
  improvements.push({ route: route.route, p95ImprovementPct: changePct });
  if (changePct < -5) failures.push(`${route.route}: p95 regressed ${(-changePct).toFixed(1)}%`);
}

if (mode === "optimization" && !improvements.some((entry) => entry.p95ImprovementPct >= 30)) {
  failures.push("No critical route improved concurrent p95 by at least 30%");
}

const result = {
  ok: failures.length === 0,
  mode,
  contract: {
    minimumRuns: MIN_RUNS,
    minimumSamples: MIN_SAMPLES,
    concurrency: REQUIRED_CONCURRENCY,
    requiredRoutes: REQUIRED_ROUTES,
    requiredP95ImprovementPct: mode === "optimization" ? 30 : null,
    maximumP95RegressionPct: 5
  },
  failures,
  improvements
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
