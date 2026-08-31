#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

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

const baseline = readReport("baseline");
const current = readReport("current");
const previous = routeMap(baseline);
const failures = [];
const improvements = [];

for (const route of current.routes) {
  const before = previous.get(route.route);
  if (!before) {
    failures.push(`${route.route}: missing from baseline`);
    continue;
  }
  if (route.status !== 200) failures.push(`${route.route}: status ${route.status}`);
  if (route.identityBytes >= 64 * 1024) {
    if (!["gzip", "br"].includes(route.contentEncoding)) {
      failures.push(`${route.route}: large JSON was not compressed`);
    }
    if (route.reductionPct < 75) {
      failures.push(`${route.route}: compression saved only ${route.reductionPct.toFixed(1)}%`);
    }
  }
  if (route.conditionalStatus !== 304) failures.push(`${route.route}: conditional request was not 304`);
  if (route.semanticSha256 !== before.semanticSha256) {
    failures.push(`${route.route}: semantic response hash changed`);
  }
  const changePct = (1 - route.concurrent.p95Ms / before.concurrent.p95Ms) * 100;
  improvements.push({ route: route.route, p95ImprovementPct: changePct });
  if (changePct < -5) failures.push(`${route.route}: p95 regressed ${(-changePct).toFixed(1)}%`);
}

if (!improvements.some((entry) => entry.p95ImprovementPct >= 30)) {
  failures.push("No critical route improved concurrent p95 by at least 30%");
}

const result = { ok: failures.length === 0, failures, improvements };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
