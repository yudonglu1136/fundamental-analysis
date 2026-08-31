#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

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

const inputPaths = argument("input")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => path.resolve(value));
if (inputPaths.length < 2) throw new Error("--input requires at least two comma-separated reports");
const reports = inputPaths.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
const routeNames = consistent(
  reports.map((report) => report.routes.map((route) => route.route)),
  "route set"
);

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
    sequential: timingMedian(rows.map((row) => row.sequential)),
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
  schemaVersion: 1,
  aggregate: "median",
  label: argument("label", consistent(reports.map((row) => row.label), "label")),
  generatedAt: new Date().toISOString(),
  commit: consistent(reports.map((row) => row.commit), "commit"),
  workingTreeDirty: consistent(
    reports.map((row) => row.workingTreeDirty),
    "working tree state"
  ),
  runtime: first.runtime,
  inputs: {
    ...first.inputs,
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
