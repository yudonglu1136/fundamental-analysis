import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function fixture(value) {
  return {
    schemaVersion: 1,
    label: "fixture",
    generatedAt: "2026-08-30T00:00:00.000Z",
    commit: "abc123",
    workingTreeDirty: false,
    runtime: { node: process.version, platform: "test", arch: "test" },
    inputs: {
      databaseBytes: 1,
      databaseSha256: "db",
      ontologyBytes: 1,
      ontologySha256: "ontology",
      samples: 60,
      concurrency: 20
    },
    process: { startupReadyMs: value, rssBytes: value * 1000 },
    routes: [{
      route: "/api/test",
      coldMs: value,
      status: 200,
      contentEncoding: "br",
      vary: "Accept-Encoding",
      identityBytes: 100000,
      encodedBytes: 20000,
      reductionPct: 80,
      semanticSha256: "same",
      conditionalStatus: 304,
      sequential: {
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
    }]
  };
}

test("summarizes repeated performance runs with medians", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-summary-test-"));
  try {
    const inputs = [10, 30, 20].map((value, index) => {
      const file = path.join(directory, `run-${index + 1}.json`);
      fs.writeFileSync(file, JSON.stringify(fixture(value)));
      return file;
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
