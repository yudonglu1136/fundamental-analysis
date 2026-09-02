import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { gurus } from "../server/gurus.js";

import {
  parseCliArgs,
  normalizeWindows,
  renderMarkdownReport,
  resolveReportPaths,
  snapshotDatabase,
  summarizeAcceptance,
  summarizeBacktestOutcome
} from "./audit-guru-curve-restoration.mjs";

const expected = {
  methodVersion: "strict-v7",
  proxyMethodVersion: "proxy-v1",
  securityMasterVersion: "master-v2"
};
const thresholds = {
  minimumExecutionCoverage: 0.9,
  minimumProxyCoverage: 0.3,
  minimumProxyPositions: 2
};
const guru = { id: "manager-one", name: "Manager One" };

test("CLI accepts explicit source/output paths and rejects unknown flags", () => {
  const parsed = parseCliArgs([
    "--db",
    "/tmp/source.sqlite",
    "--output=/tmp/report",
    "--windows",
    "5,10",
    "--keep-work-db"
  ]);
  assert.equal(parsed.db, "/tmp/source.sqlite");
  assert.equal(parsed.output, "/tmp/report");
  assert.deepEqual(normalizeWindows(parsed.windows), [5, 10]);
  assert.equal(parsed.keepWorkDb, true);
  assert.throws(() => parseCliArgs(["--surprise"]), /Unknown argument/);
  assert.throws(() => parseCliArgs(["--db"]), /requires a value/);
  assert.deepEqual(normalizeWindows("10,5,10"), [5, 10]);
  assert.throws(() => normalizeWindows("3,5"), /must contain 5, 10/);
  assert.throws(() => normalizeWindows("5,nope"), /must contain 5, 10/);
});

test("acceptance population is exactly 18 enabled managers and excludes both disabled profiles", () => {
  const enabled = gurus.filter((row) => row.type === "manager13f" && !row.disableSimulation);
  const disabled = gurus.filter((row) => row.type === "manager13f" && row.disableSimulation);
  assert.equal(enabled.length, 18);
  assert.deepEqual(
    disabled.map((row) => row.id).sort(),
    ["nick-sleep-qais-zakaria", "renaissance-technologies"]
  );
});

test("output can be a directory or either report filename", () => {
  const now = new Date("2026-09-02T12:34:56.000Z");
  const directory = resolveReportPaths({ output: "/tmp/curve-report" }, now);
  assert.equal(directory.jsonPath, "/tmp/curve-report/guru-curve-restoration-acceptance.json");
  assert.equal(directory.markdownPath, "/tmp/curve-report/guru-curve-restoration-acceptance.md");

  const json = resolveReportPaths({ output: "/tmp/custom.json" }, now);
  assert.deepEqual(json, {
    jsonPath: "/tmp/custom.json",
    markdownPath: "/tmp/custom.md"
  });

  const markdown = resolveReportPaths({ markdown: "/tmp/custom.md" }, now);
  assert.deepEqual(markdown, {
    jsonPath: "/tmp/custom.json",
    markdownPath: "/tmp/custom.md"
  });
});

test("strict-ready outcome records full curve and minimum execution coverage", () => {
  const strictPayload = {
    generatedAt: "2026-09-02T00:00:00Z",
    status: "ready",
    method: {
      version: expected.methodVersion,
      securityMasterVersion: expected.securityMasterVersion,
      years: 5
    },
    window: { start: "2021-09-03", end: "2026-09-01" },
    dataQuality: { minimumObservedExecutionCoverage: 0.934 },
    equity: [
      { date: "2021-09-03", value: 1 },
      { date: "2026-09-01", value: 2 }
    ]
  };
  const row = summarizeBacktestOutcome({
    guru,
    years: 5,
    returnedPayload: strictPayload,
    strictPayload,
    expected,
    thresholds,
    durationMs: 1250
  });
  assert.equal(row.outcome, "ready");
  assert.equal(row.curveKind, "strict");
  assert.equal(row.displayable, true);
  assert.equal(row.curvePoints, 2);
  assert.equal(row.minimumCoverage, 0.934);
  assert.equal(row.proxyMinimumPositions, null);
  assert.equal(row.failureReason, null);
});

test("linked proxy records proxy coverage/position floor without becoming strict ready", () => {
  const generatedAt = "2026-09-02T00:00:00Z";
  const strictPayload = {
    generatedAt,
    status: "insufficient_data",
    method: {
      version: expected.methodVersion,
      securityMasterVersion: expected.securityMasterVersion,
      years: 10,
      reason: "Strict coverage failed."
    },
    dataQuality: {
      coverageFailures: [{ coveragePct: 0.27 }]
    },
    equity: []
  };
  const proxyPayload = {
    generatedAt,
    status: "proxy_ready",
    method: {
      version: expected.methodVersion,
      securityMasterVersion: expected.securityMasterVersion,
      variant: expected.proxyMethodVersion,
      years: 10
    },
    proxy: {
      methodVersion: expected.proxyMethodVersion,
      securityMasterVersion: expected.securityMasterVersion,
      strictFailureGeneratedAt: generatedAt,
      minimumSelectedBookCoverage: 0.42,
      minimumIncludedPositions: 3
    },
    dataQuality: { strictFailureCode: "execution_coverage_below_minimum" },
    window: { start: "2016-09-02", end: "2026-09-01" },
    equity: [
      { date: "2016-09-02", value: 1 },
      { date: "2026-09-01", value: 1.5 }
    ]
  };
  const row = summarizeBacktestOutcome({
    guru,
    years: 10,
    returnedPayload: proxyPayload,
    strictPayload,
    proxyPayload,
    expected,
    thresholds
  });
  assert.equal(row.outcome, "proxy_ready");
  assert.equal(row.strictStatus, "insufficient_data");
  assert.equal(row.minimumCoverage, 0.42);
  assert.equal(row.strictMinimumCoverage, 0.27);
  assert.equal(row.proxyMinimumPositions, 3);
  assert.equal(row.strictFailureCode, "execution_coverage_below_minimum");
});

test("coverage contract violation converts a nominal proxy into a failure", () => {
  const generatedAt = "2026-09-02T00:00:00Z";
  const strictPayload = {
    generatedAt,
    status: "insufficient_data",
    method: {
      version: expected.methodVersion,
      securityMasterVersion: expected.securityMasterVersion,
      years: 5
    }
  };
  const proxyPayload = {
    generatedAt,
    status: "proxy_ready",
    method: {
      version: expected.methodVersion,
      securityMasterVersion: expected.securityMasterVersion,
      variant: expected.proxyMethodVersion,
      years: 5
    },
    proxy: {
      methodVersion: expected.proxyMethodVersion,
      securityMasterVersion: expected.securityMasterVersion,
      strictFailureGeneratedAt: generatedAt,
      minimumSelectedBookCoverage: 0.29,
      minimumIncludedPositions: 1
    },
    window: { start: "2021-09-02", end: "2026-09-01" },
    equity: [
      { date: "2021-09-02", value: 1 },
      { date: "2026-09-01", value: 1.1 }
    ]
  };
  const row = summarizeBacktestOutcome({
    guru,
    years: 5,
    returnedPayload: proxyPayload,
    strictPayload,
    proxyPayload,
    expected,
    thresholds
  });
  assert.equal(row.outcome, "failure");
  assert.deepEqual(row.contractViolations, [
    "proxy_coverage_below_minimum",
    "proxy_positions_below_minimum"
  ]);
  assert.equal(row.displayable, false);
});

test("failed calculation preserves concrete failure code and reason", () => {
  const strictPayload = {
    status: "insufficient_data",
    method: { years: 5, reason: "An active security has a missing adjusted close." },
    dataQuality: { failure: { code: "missing_active_price", ticker: "OLD" } },
    equity: []
  };
  const row = summarizeBacktestOutcome({
    guru,
    years: 5,
    strictPayload,
    returnedPayload: strictPayload,
    expected,
    thresholds
  });
  assert.equal(row.outcome, "failure");
  assert.equal(row.failureCode, "missing_active_price");
  assert.equal(row.failureReason, "An active security has a missing adjusted close.");
});

test("acceptance summary requires all 18 managers in both windows", () => {
  const results = [];
  for (let manager = 0; manager < 18; manager += 1) {
    for (const years of [5, 10]) {
      results.push({ years, outcome: "ready", displayable: true });
    }
  }
  const passing = summarizeAcceptance(results, 18);
  assert.equal(passing.pass, true);
  assert.equal(passing.expectedRows, 36);
  assert.equal(passing.byWindow["5Y"].displayable, 18);

  const incomplete = summarizeAcceptance(results.slice(0, -1), 18);
  assert.equal(incomplete.pass, false);

  const tenYearOnly = summarizeAcceptance(
    results.filter((row) => row.years === 10),
    18,
    [10]
  );
  assert.equal(tenYearOnly.pass, true);
  assert.equal(tenYearOnly.expectedRows, 18);
});

test("Markdown renders one row per manager/window and escapes table separators", () => {
  const results = [{
    guruName: "Manager | One",
    years: 5,
    outcome: "failure",
    displayable: false,
    curvePoints: 0,
    startDate: null,
    endDate: null,
    minimumCoverage: 0.25,
    proxyMinimumPositions: null,
    failureCode: "missing",
    failureReason: "A | B",
    durationMs: 500
  }];
  const report = {
    managerCount: 1,
    results,
    summary: summarizeAcceptance(results, 1),
    thresholds,
    isolation: { sourceOpenedReadOnly: true },
    sourceDatabase: { snapshotSha256: "abc" },
    engine: { securityMasterVersion: "master-v2" }
  };
  const markdown = renderMarkdownReport(report);
  assert.match(markdown, /Manager \\| One/);
  assert.match(markdown, /25\.0%/);
  assert.match(markdown, /missing: A \\| B/);
});

test("SQLite snapshot is consistent and leaves the source byte-identical", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "curve-acceptance-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, "source.sqlite");
  const copyPath = path.join(directory, "copy.sqlite");
  const source = new DatabaseSync(sourcePath);
  source.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT)");
  source.prepare("INSERT INTO sample (value) VALUES (?)").run("evidence");
  source.close();
  const before = fs.readFileSync(sourcePath);

  const metadata = await snapshotDatabase(sourcePath, copyPath);
  const after = fs.readFileSync(sourcePath);
  assert.equal(metadata.integrityCheck, "ok");
  assert.deepEqual(after, before);

  const copy = new DatabaseSync(copyPath, { readOnly: true });
  assert.equal(copy.prepare("SELECT value FROM sample").get().value, "evidence");
  copy.close();
});
