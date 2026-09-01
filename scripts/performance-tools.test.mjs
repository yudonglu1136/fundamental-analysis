import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const requiredRoutes = [
  "/api/valuation",
  "/api/valuation/LSEG?pricePoints=300&detail=summary",
  "/api/valuation/LSEG?pricePoints=900",
  "/api/gurus",
  "/api/backtests?years=all&detail=compact",
  "/api/ontology/overview",
  "/api/graph"
];

function routeFixture(route, value) {
  return {
    route,
    coldMs: value,
    status: 200,
    contentEncoding: "br",
    vary: "Accept-Encoding",
    identityBytes: 100000,
    encodedBytes: 20000,
    reductionPct: 80,
    semanticSha256: "a".repeat(64),
    conditionalStatus: 304,
    sequential: {
      requests: 60,
      meanMs: value,
      p50Ms: value,
      p95Ms: value,
      p99Ms: value,
      minMs: value,
      maxMs: value
    },
    concurrent: {
      concurrency: 20,
      requests: 60,
      rps: 1000 / value,
      meanMs: value,
      p50Ms: value,
      p95Ms: value,
      p99Ms: value,
      minMs: value,
      maxMs: value
    }
  };
}

function fixture(value, routes = ["/api/test"]) {
  return {
    schemaVersion: 2,
    label: "fixture",
    generatedAt: "2026-08-30T00:00:00.000Z",
    commit: "abc123",
    workingTreeDirty: false,
    sourceSha256: "c".repeat(64),
    runtime: { node: process.version, platform: "test", arch: "test" },
    inputs: {
      databaseBytes: 1,
      databaseSha256: "d".repeat(64),
      ontologyBytes: 1,
      ontologySha256: "e".repeat(64),
      samples: 60,
      concurrency: 20
    },
    process: { startupReadyMs: value, rssBytes: value * 1000 },
    routes: routes.map((route) => routeFixture(route, value))
  };
}

function aggregateFixture(value) {
  const report = fixture(value, requiredRoutes);
  report.aggregate = "median";
  report.inputs.runs = 3;
  report.inputs.sourceReports = ["run-1.json", "run-2.json", "run-3.json"];
  return report;
}

function writeReport(directory, name, report) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, JSON.stringify(report));
  return file;
}

function runScript(script, argumentsList) {
  return spawnSync(process.execPath, [path.resolve(script), ...argumentsList], {
    encoding: "utf8"
  });
}

test("API benchmark refuses undersampled runs before starting a server", () => {
  const result = runScript("scripts/benchmark-api.mjs", ["--samples", "59"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--samples must be at least 60/);
});

test("API benchmark forces persisted backtest caches to remain offline", () => {
  const source = fs.readFileSync(path.resolve("scripts/benchmark-api.mjs"), "utf8");
  assert.match(source, /BACKTEST_CACHE_TTL_HOURS:\s*"0"/);
  assert.match(source, /BACKTEST_STALE_BACKGROUND_REFRESH:\s*"false"/);
  assert.match(source, /GURU_BACKTEST_AUTO_REFRESH:\s*"false"/);
});

test("summarizes repeated performance runs with medians", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-summary-test-"));
  try {
    const inputs = [10, 30, 20].map((value, index) => {
      return writeReport(directory, `run-${index + 1}.json`, fixture(value));
    });
    const output = execFileSync(process.execPath, [
      path.resolve("scripts/summarize-performance-runs.mjs"),
      "--input",
      inputs.join(",")
    ], { encoding: "utf8" });
    const summarized = JSON.parse(output);
    assert.equal(summarized.aggregate, "median");
    assert.equal(summarized.inputs.runs, 3);
    assert.equal(summarized.process.startupReadyMs, 20);
    assert.equal(summarized.routes[0].concurrent.p95Ms, 20);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("performance summarizer rejects fewer than three runs", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-summary-count-test-"));
  try {
    const inputs = [10, 20].map((value, index) =>
      writeReport(directory, `run-${index + 1}.json`, fixture(value))
    );
    const result = runScript("scripts/summarize-performance-runs.mjs", [
      "--input",
      inputs.join(",")
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /at least three/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("performance summarizer rejects runtime, source, and snapshot drift", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-summary-identity-test-"));
  try {
    const reports = [fixture(10), fixture(20), fixture(30)];
    reports[2].runtime.node = "v0.0.0";
    const runtimeInputs = reports.map((report, index) =>
      writeReport(directory, `runtime-${index + 1}.json`, report)
    );
    const runtimeResult = runScript("scripts/summarize-performance-runs.mjs", [
      "--input",
      runtimeInputs.join(",")
    ]);
    assert.notEqual(runtimeResult.status, 0);
    assert.match(runtimeResult.stderr, /runtime differs/);

    reports[2].runtime.node = process.version;
    reports[2].sourceSha256 = "b".repeat(64);
    const sourceInputs = reports.map((report, index) =>
      writeReport(directory, `source-${index + 1}.json`, report)
    );
    const sourceResult = runScript("scripts/summarize-performance-runs.mjs", [
      "--input",
      sourceInputs.join(",")
    ]);
    assert.notEqual(sourceResult.status, 0);
    assert.match(sourceResult.stderr, /runtime source hash differs/);

    reports[2].sourceSha256 = "c".repeat(64);
    reports[2].inputs.databaseSha256 = "f".repeat(64);
    const hashInputs = reports.map((report, index) =>
      writeReport(directory, `hash-${index + 1}.json`, report)
    );
    const hashResult = runScript("scripts/summarize-performance-runs.mjs", [
      "--input",
      hashInputs.join(",")
    ]);
    assert.notEqual(hashResult.status, 0);
    assert.match(hashResult.stderr, /databaseSha256 differs/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("performance budget accepts complete comparable median reports", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-budget-pass-test-"));
  try {
    const baseline = writeReport(directory, "baseline.json", aggregateFixture(100));
    const current = writeReport(directory, "current.json", aggregateFixture(60));
    const result = runScript("scripts/check-performance-budget.mjs", [
      "--baseline",
      baseline,
      "--current",
      current
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).ok, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("regression mode accepts unchanged p95 while optimization mode requires improvement", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-budget-mode-test-"));
  try {
    const baseline = writeReport(directory, "baseline.json", aggregateFixture(100));
    const current = writeReport(directory, "current.json", aggregateFixture(100));
    const regression = runScript("scripts/check-performance-budget.mjs", [
      "--baseline",
      baseline,
      "--current",
      current,
      "--mode",
      "regression"
    ]);
    assert.equal(regression.status, 0, regression.stderr || regression.stdout);
    assert.equal(JSON.parse(regression.stdout).mode, "regression");

    const optimization = runScript("scripts/check-performance-budget.mjs", [
      "--baseline",
      baseline,
      "--current",
      current,
      "--mode",
      "optimization"
    ]);
    assert.notEqual(optimization.status, 0);
    assert.match(optimization.stdout, /improved concurrent p95 by at least 30%/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("performance budget fails closed when valuation summary coverage is missing", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-budget-route-test-"));
  try {
    const baselineReport = aggregateFixture(100);
    const currentReport = aggregateFixture(60);
    currentReport.routes = currentReport.routes.filter(
      (route) => route.route !== "/api/valuation/LSEG?pricePoints=300&detail=summary"
    );
    const baseline = writeReport(directory, "baseline.json", baselineReport);
    const current = writeReport(directory, "current.json", currentReport);
    const result = runScript("scripts/check-performance-budget.mjs", [
      "--baseline",
      baseline,
      "--current",
      current
    ]);
    assert.notEqual(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.failures.some((failure) => failure.includes("required route missing")), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("performance budget rejects incompatible inputs and undersampled runs", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-budget-input-test-"));
  try {
    const baselineReport = aggregateFixture(100);
    const currentReport = aggregateFixture(60);
    currentReport.inputs.databaseSha256 = "f".repeat(64);
    currentReport.inputs.samples = 59;
    currentReport.inputs.runs = 2;
    currentReport.routes.forEach((route) => {
      route.sequential.requests = 59;
      route.concurrent.requests = 59;
    });
    const baseline = writeReport(directory, "baseline.json", baselineReport);
    const current = writeReport(directory, "current.json", currentReport);
    const result = runScript("scripts/check-performance-budget.mjs", [
      "--baseline",
      baseline,
      "--current",
      current
    ]);
    assert.notEqual(result.status, 0);
    const failures = JSON.parse(result.stdout).failures.join("\n");
    assert.match(failures, /at least 3 runs/);
    assert.match(failures, /at least 60 samples/);
    assert.match(failures, /benchmark input differs: databaseSha256/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
