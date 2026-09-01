#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MIN_SAMPLES = 60;
const REQUIRED_CONCURRENCY = 20;

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function median(values) {
  const rows = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
}

function consistent(values, label) {
  const unique = [...new Set(values.map((value) => JSON.stringify(value)))];
  if (unique.length !== 1) throw new Error(`${label} differs across benchmark runs`);
  return JSON.parse(unique[0]);
}

function timingMedian(rows) {
  return Object.fromEntries(
    ["meanMs", "p50Ms", "p95Ms", "p99Ms", "minMs", "maxMs"]
      .map((key) => [key, median(rows.map((row) => row[key]))])
  );
}

function validateRun(report, index) {
  const label = `run ${index + 1}`;
  if (Number(report?.schemaVersion) < 2) {
    throw new Error(`${label} uses an obsolete benchmark schema`);
  }
  const samples = Number(report?.inputs?.samples);
  const concurrency = Number(report?.inputs?.concurrency);
  if (!Number.isInteger(samples) || samples < MIN_SAMPLES) {
    throw new Error(`${label} must contain at least ${MIN_SAMPLES} samples`);
  }
  if (concurrency !== REQUIRED_CONCURRENCY) {
    throw new Error(`${label} must use concurrency ${REQUIRED_CONCURRENCY}`);
  }
  if (!report?.runtime || typeof report.runtime !== "object") {
    throw new Error(`${label} is missing runtime identity`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(report?.sourceSha256 || ""))) {
    throw new Error(`${label} is missing runtime source identity`);
  }
  for (const field of ["databaseBytes", "ontologyBytes"]) {
    if (!(Number(report?.inputs?.[field]) > 0)) throw new Error(`${label} has invalid ${field}`);
  }
  for (const field of ["databaseSha256", "ontologySha256"]) {
    if (!String(report?.inputs?.[field] || "").trim()) throw new Error(`${label} is missing ${field}`);
  }
  if (!Array.isArray(report?.routes) || !report.routes.length) {
    throw new Error(`${label} has no benchmark routes`);
  }
  const routeNames = report.routes.map((route) => route.route);
  if (new Set(routeNames).size !== routeNames.length) {
    throw new Error(`${label} contains duplicate benchmark routes`);
  }
  for (const route of report.routes) {
    if (Number(route?.sequential?.requests) !== samples) {
      throw new Error(`${label} ${route.route} sequential request count does not match samples`);
    }
    if (Number(route?.concurrent?.requests) !== samples) {
      throw new Error(`${label} ${route.route} concurrent request count does not match samples`);
    }
    if (Number(route?.concurrent?.concurrency) !== concurrency) {
      throw new Error(`${label} ${route.route} concurrency does not match run inputs`);
    }
  }
}

const inputPaths = argument("input")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => path.resolve(value));
if (inputPaths.length < 3) throw new Error("--input requires at least three comma-separated reports");
const reports = inputPaths.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
reports.forEach(validateRun);
const schemaVersion = consistent(reports.map((report) => report.schemaVersion), "schema version");
const runtime = consistent(reports.map((report) => report.runtime), "runtime");
const sourceSha256 = consistent(
  reports.map((report) => report.sourceSha256),
  "runtime source hash"
);
const inputIdentity = Object.fromEntries(
  [
    "databaseBytes",
    "databaseSha256",
    "ontologyBytes",
    "ontologySha256",
    "samples",
    "concurrency"
  ].map((key) => [
    key,
    consistent(reports.map((report) => report.inputs[key]), key)
  ])
);
consistent(
  reports.map((report) => report.routes.map((route) => route.route).sort()),
  "route set"
);
const routeNames = reports[0].routes.map((route) => route.route);

const routes = routeNames.map((routeName) => {
  const rows = reports.map((report) => report.routes.find((route) => route.route === routeName));
  return {
    route: routeName,
    coldMs: median(rows.map((row) => row.coldMs)),
    status: consistent(rows.map((row) => row.status), `${routeName} status`),
    contentEncoding: consistent(
      rows.map((row) => row.contentEncoding),
      `${routeName} content encoding`
    ),
    vary: consistent(rows.map((row) => row.vary), `${routeName} vary`),
    identityBytes: consistent(
      rows.map((row) => row.identityBytes),
      `${routeName} identity bytes`
    ),
    encodedBytes: median(rows.map((row) => row.encodedBytes)),
    reductionPct: median(rows.map((row) => row.reductionPct)),
    semanticSha256: consistent(
      rows.map((row) => row.semanticSha256),
      `${routeName} semantic hash`
    ),
    conditionalStatus: consistent(
      rows.map((row) => row.conditionalStatus),
      `${routeName} conditional status`
    ),
    sequential: {
      requests: consistent(
        rows.map((row) => row.sequential.requests),
        `${routeName} sequential request count`
      ),
      ...timingMedian(rows.map((row) => row.sequential))
    },
    concurrent: {
      concurrency: consistent(
        rows.map((row) => row.concurrent.concurrency),
        `${routeName} concurrency`
      ),
      requests: consistent(
        rows.map((row) => row.concurrent.requests),
        `${routeName} request count`
      ),
      rps: median(rows.map((row) => row.concurrent.rps)),
      ...timingMedian(rows.map((row) => row.concurrent))
    }
  };
});

const first = reports[0];
const report = {
  schemaVersion,
  aggregate: "median",
  label: argument("label", consistent(reports.map((row) => row.label), "label")),
  generatedAt: new Date().toISOString(),
  commit: consistent(reports.map((row) => row.commit), "commit"),
  workingTreeDirty: consistent(
    reports.map((row) => row.workingTreeDirty),
    "working tree state"
  ),
  sourceSha256,
  runtime,
  inputs: {
    ...inputIdentity,
    runs: reports.length,
    sourceReports: inputPaths.map((file) => path.basename(file))
  },
  process: {
    startupReadyMs: median(reports.map((row) => row.process.startupReadyMs)),
    rssBytes: median(reports.map((row) => row.process.rssBytes))
  },
  routes
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
const output = argument("output");
if (output) {
  const outputPath = path.resolve(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
}
process.stdout.write(serialized);
