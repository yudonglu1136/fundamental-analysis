import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-catalog-precondition-"));
process.env.SQLITE_DB_PATH = path.join(tempDir, "cache.sqlite");
process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";

const {
  readDashboardSnapshot,
  readGuruBacktestVersion,
  readGuruDashboardVersion,
  readGuruExposureVersion,
  readGuruSnapshot,
  writeDashboardSnapshot,
  writeGuru13fRefreshBundle,
  writeGuruBacktest,
  writeGuruExposureSnapshot
} = await import("./localDatabase.js");

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function dashboard(ids, marker) {
  return {
    generatedAt: "2026-09-03T12:00:00.000Z",
    marker,
    gurus: ids.map((id) => ({ id, name: id, type: "manager13f" }))
  };
}

function snapshot(id, marker) {
  return {
    id,
    name: id,
    type: "manager13f",
    status: "live",
    marker,
    generatedAt: "2026-09-03T12:01:00.000Z",
    holdings: [],
    activity: []
  };
}

function strictCurve(id, years) {
  return {
    generatedAt: "2026-09-03T12:02:00.000Z",
    status: "ready",
    guru: { id, type: "manager13f" },
    window: { start: "2021-09-03", end: "2026-09-03" },
    method: { years, version: "atomic-test", securityMasterVersion: "atomic-test" },
    equity: [{ date: "2021-09-03", value: 1 }, { date: "2026-09-03", value: 2 }],
    rebalances: [],
    quarterContributions: []
  };
}

function expectedState(dashboardGuruIds, exactCatalogIds) {
  return {
    dashboardVersion: readGuruDashboardVersion(),
    exposureVersion: readGuruExposureVersion(),
    curveVersions: {
      5: readGuruBacktestVersion(5),
      10: readGuruBacktestVersion(10)
    },
    dashboardGuruIds,
    exactCatalogIds
  };
}

test("stale dashboard revision fails inside the transaction before any bundle write", () => {
  const currentIds = ["existing-dashboard-revision"];
  const targetId = "target-dashboard-revision";
  writeDashboardSnapshot(dashboard(currentIds, "baseline"));
  const stale = expectedState(currentIds, [...currentIds, targetId]);
  writeDashboardSnapshot(dashboard(currentIds, "concurrent-winner"));

  assert.throws(() => writeGuru13fRefreshBundle({
    dashboard: dashboard([...currentIds, targetId], "bootstrap-must-not-win"),
    guruSnapshots: [{ guruId: targetId, payload: snapshot(targetId, "must-not-write") }],
    expectedState: stale
  }), /dashboard revision precondition changed/i);

  assert.equal(readGuruSnapshot(targetId), null);
  assert.equal(readDashboardSnapshot().marker, "concurrent-winner");
});

test("stale curve revision rolls back before snapshots or dashboard are written", () => {
  const currentIds = ["existing-curve-revision"];
  const targetId = "target-curve-revision";
  writeDashboardSnapshot(dashboard(currentIds, "curve-baseline"));
  const stale = expectedState(currentIds, [...currentIds, targetId]);
  writeGuruBacktest("unrelated-concurrent-manager", 5,
    strictCurve("unrelated-concurrent-manager", 5));

  assert.throws(() => writeGuru13fRefreshBundle({
    dashboard: dashboard([...currentIds, targetId], "curve-must-not-win"),
    guruSnapshots: [{ guruId: targetId, payload: snapshot(targetId, "must-not-write") }],
    expectedState: stale
  }), /5Y atomic curve revision precondition changed/i);

  assert.equal(readGuruSnapshot(targetId), null);
  assert.equal(readDashboardSnapshot().marker, "curve-baseline");
});

test("stale exposure-only revision rolls back before bundle writes", () => {
  const currentIds = ["existing-exposure-revision"];
  const targetId = "target-exposure-revision";
  writeDashboardSnapshot(dashboard(currentIds, "exposure-baseline"));
  const stale = expectedState(currentIds, [...currentIds, targetId]);
  writeGuruExposureSnapshot("unrelated-exposure-manager", {
    generatedAt: "2026-09-03T12:03:00.000Z",
    history: [{ reportDate: "2026-06-30" }]
  });

  assert.throws(() => writeGuru13fRefreshBundle({
    dashboard: dashboard([...currentIds, targetId], "exposure-must-not-win"),
    guruSnapshots: [{ guruId: targetId, payload: snapshot(targetId, "must-not-write") }],
    expectedState: stale
  }), /exposure revision precondition changed/i);

  assert.equal(readGuruSnapshot(targetId), null);
  assert.equal(readDashboardSnapshot().marker, "exposure-baseline");
});

test("exact catalog order mismatch fails closed before staged rows are written", () => {
  const currentIds = ["existing-exact-catalog"];
  const targetId = "target-exact-catalog";
  const exactIds = [...currentIds, targetId];
  writeDashboardSnapshot(dashboard(currentIds, "exact-baseline"));
  const state = expectedState(currentIds, exactIds);

  assert.throws(() => writeGuru13fRefreshBundle({
    dashboard: dashboard([...exactIds].reverse(), "wrong-order"),
    guruSnapshots: [{ guruId: targetId, payload: snapshot(targetId, "must-not-write") }],
    expectedState: state
  }), /exact catalog order/i);

  assert.equal(readGuruSnapshot(targetId), null);
  assert.equal(readDashboardSnapshot().marker, "exact-baseline");
});

test("matching revisions atomically install the exact ordered catalog", () => {
  const currentIds = ["existing-success"];
  const targetId = "target-success";
  const exactIds = [...currentIds, targetId];
  writeDashboardSnapshot(dashboard(currentIds, "success-baseline"));
  const state = expectedState(currentIds, exactIds);
  const exactDashboard = dashboard(exactIds, "bootstrap-success");
  exactDashboard.gurus[0].metadataOverlay = "current-catalog";
  const result = writeGuru13fRefreshBundle({
    dashboard: {
      ...exactDashboard,
      catalogBootstrap: { mode: "atomic_explicit_manager13f" }
    },
    guruSnapshots: [{ guruId: targetId, payload: snapshot(targetId, "installed") }],
    expectedState: state
  });

  assert.equal(result.gurus, 1);
  assert.deepEqual(readDashboardSnapshot().gurus.map((guru) => guru.id), exactIds);
  assert.equal(readDashboardSnapshot().marker, "bootstrap-success");
  assert.equal(readDashboardSnapshot().catalogBootstrap.mode,
    "atomic_explicit_manager13f");
  assert.equal(readDashboardSnapshot().gurus[0].metadataOverlay, "current-catalog");
  assert.equal(readGuruSnapshot(targetId).marker, "installed");
});
