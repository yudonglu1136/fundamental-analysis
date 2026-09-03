import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-13f-atomic-test-"));
process.env.SQLITE_DB_PATH = path.join(tempDir, "cache.sqlite");
process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";

const { gurus } = await import("./gurus.js");
const {
  manager13fBacktestMethodVersion,
  manager13fProxyMethodVersion,
  manager13fSecurityMasterVersion,
  selectManagerBacktestCache
} = await import("./backtest.js");
const { manager13fCorporateActionCatalogVersion } = await import(
  "./corporateActions.js"
);
const {
  readBackgroundJobRun,
  readGuruBacktest,
  readGuruBacktestProxy,
  readGuruExposureSnapshot,
  readGuruSnapshot,
  writeDashboardSnapshot,
  writeGuru13fRefreshBundle
} = await import("./localDatabase.js");
const {
  evaluateAtomicRefreshArtifacts,
  runThirteenFRefresh
} = await import("./refreshThirteenF.js");

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const bill = gurus.find((guru) => guru.id === "bill-ackman");
const peltz = gurus.find((guru) => guru.id === "nelson-peltz");
const tepper = gurus.find((guru) => guru.id === "david-tepper");

function dashboardFixture() {
  return {
    generatedAt: "2026-09-03T00:00:00.000Z",
    gurus: gurus.map((guru) => ({
      id: guru.id,
      name: guru.name,
      type: guru.type,
      holdings: [],
      activity: []
    }))
  };
}

function snapshotFixture(guru, marker = guru.id) {
  return {
    generatedAt: "2026-09-03T01:00:00.000Z",
    id: guru.id,
    name: guru.name,
    type: guru.type,
    status: "live",
    marker,
    summary: {
      reportDate: "2026-06-30",
      filingDate: "2026-08-14",
      totalPositions: 3
    },
    holdings: [{ ticker: "TEST", issuer: "Test issuer", value: 100 }],
    activity: []
  };
}

function exposureFixture(guru) {
  const latest = {
    reportDate: "2026-06-30",
    quarterLabel: "2026 Q2",
    topHoldings: [{ ticker: "TEST", value: 100 }]
  };
  return {
    generatedAt: "2026-09-03T01:00:00.000Z",
    guru: { id: guru.id, name: guru.name },
    latest,
    history: [latest]
  };
}

function strictReadyFixture(guru, years = 5) {
  return {
    generatedAt: "2026-09-03T02:00:00.000Z",
    status: "ready",
    guru: { id: guru.id, name: guru.name, type: guru.type },
    window: { start: "2021-09-03", end: "2026-08-28" },
    method: {
      version: manager13fBacktestMethodVersion,
      securityMasterVersion: manager13fSecurityMasterVersion,
      corporateActionCatalogVersion: manager13fCorporateActionCatalogVersion,
      years,
      minimumExecutionCoverage: 0.9
    },
    summary: { averageCoverage: 1 },
    dataQuality: {
      minimumExecutionCoverage: 0.9,
      minimumObservedExecutionCoverage: 1
    },
    equity: [
      { date: "2021-09-03", value: 1, benchmark: 1 },
      { date: "2026-08-28", value: 2, benchmark: 1.8 }
    ],
    rebalances: [{
      reportDate: "2026-06-30",
      executionDate: "2026-08-17",
      coveragePct: 1,
      topHoldings: [{ ticker: "TEST", weight: 1 }]
    }],
    quarterContributions: [{
      id: "2026-q2",
      label: "2026 Q2",
      contributions: [{ ticker: "TEST", contributionPct: 0.1 }]
    }]
  };
}

function privateReplicability() {
  return {
    status: "strict_unavailable",
    code: "reported_holding_private_before_execution",
    guruId: peltz.id,
    minimumExecutionCoverage: 0.9,
    syntheticPriceUsed: false,
    proxyOnlyWhenSeparatelyLabelled: true,
    affectedQuarters: [{
      reportDate: "2026-06-30",
      quarterLabel: "2026 Q2",
      executionDate: "2026-08-17",
      coveragePct: 0.55,
      minimumExecutionCoverage: 0.9,
      strictGateSatisfied: false,
      holdings: [{
        code: "reported_security_private_before_execution",
        ticker: "JHG",
        issuer: "Janus Henderson Group plc",
        cusip: "G4474Y214",
        reportedBookWeight: 0.45,
        publicTradingStatus: "private_before_execution",
        syntheticPriceUsed: false
      }]
    }]
  };
}

function peltzArtifactPair(years = 5) {
  const generatedAt = "2026-09-03T02:30:00.000Z";
  const publicReplicability = privateReplicability();
  const strictPayload = {
    generatedAt,
    status: "insufficient_data",
    guru: { id: peltz.id, name: peltz.name, type: peltz.type },
    window: { start: "2021-09-03", end: "2026-09-03" },
    method: {
      version: manager13fBacktestMethodVersion,
      securityMasterVersion: manager13fSecurityMasterVersion,
      corporateActionCatalogVersion: manager13fCorporateActionCatalogVersion,
      years,
      minimumExecutionCoverage: 0.9,
      reason: "Strict execution coverage is below the required threshold."
    },
    publicReplicability,
    dataQuality: {
      failurePolicy: "fail_closed",
      coverageFailures: [{
        reportDate: "2026-06-30",
        executionDate: "2026-08-17",
        coveragePct: 0.55,
        unpricedPositions: [{
          ticker: "JHG",
          issuer: "Janus Henderson Group plc",
          cusip: "G4474Y214",
          reason: "reported_security_private_before_execution",
          executionLimitation: {
            code: "reported_security_private_before_execution",
            reportDate: "2026-06-30",
            ticker: "JHG",
            cusip: "G4474Y214",
            publicTradingStatus: "private_before_execution",
            syntheticPriceUsed: false
          }
        }]
      }]
    },
    summary: {},
    equity: [],
    rebalances: [],
    quarterContributions: []
  };
  const proxyPayload = {
    generatedAt,
    status: "proxy_ready",
    guru: { id: peltz.id, name: peltz.name, type: peltz.type },
    window: { start: "2021-09-03", end: "2026-08-28" },
    method: {
      version: manager13fBacktestMethodVersion,
      securityMasterVersion: manager13fSecurityMasterVersion,
      corporateActionCatalogVersion: manager13fCorporateActionCatalogVersion,
      variant: manager13fProxyMethodVersion,
      years
    },
    proxy: {
      kind: "public_holdings_proxy",
      methodVersion: manager13fProxyMethodVersion,
      securityMasterVersion: manager13fSecurityMasterVersion,
      strictFailureGeneratedAt: generatedAt,
      minimumProxyCoverage: 0.3,
      minimumProxyPositions: 2,
      minimumSelectedBookCoverage: 0.4,
      averageSelectedBookCoverage: 0.4,
      maximumExcludedBookWeight: 0.6,
      minimumIncludedPositions: 2,
      topExcludedHoldings: [{ ticker: "JHG", reportedBookWeight: 0.45 }]
    },
    publicReplicability: structuredClone(publicReplicability),
    dataQuality: {
      strictBacktestStatus: "insufficient_data",
      strictFailureCode: "execution_coverage_below_minimum",
      strictFailingRebalances: 1,
      strictMinimumExecutionCoverage: 0.9
    },
    summary: { averageCoverage: 0.4 },
    equity: [
      { date: "2021-09-03", value: 1, benchmark: 1 },
      { date: "2026-08-28", value: 1.8, benchmark: 1.7 }
    ],
    rebalances: [{
      reportDate: "2026-06-30",
      executionDate: "2026-08-17",
      selectedBookCoverage: 0.4,
      includedPositions: 2,
      unpricedPositions: [{
        ticker: "JHG",
        issuer: "Janus Henderson Group plc",
        cusip: "G4474Y214",
        reportedBookWeight: 0.45,
        reason: "reported_security_private_before_execution"
      }]
    }],
    quarterContributions: [{
      id: "2026-q2",
      label: "2026 Q2",
      contributions: [{ ticker: "TEST", contributionPct: 0.05 }]
    }]
  };
  return { strictPayload, proxyPayload };
}

function managerRuntime(artifactsByGuru) {
  return {
    refreshGuruSnapshot: async (guruId) =>
      snapshotFixture(gurus.find((guru) => guru.id === guruId)),
    refreshGuruExposureSnapshot: async (guruId) =>
      exposureFixture(gurus.find((guru) => guru.id === guruId)),
    loadGuruBacktest: async (guruId, options) => {
      assert.equal(options.detail, "full");
      assert.equal(options.persist, false);
      assert.equal(options.shareComputation, false);
      assert.equal(typeof options.onComputedArtifacts, "function");
      const artifacts = artifactsByGuru.get(guruId);
      options.onComputedArtifacts(artifacts);
      // Deliberately return a compact-looking public payload. The atomic writer
      // must persist the full artifacts supplied through the audit callback.
      return artifacts.proxyPayload || {
        ...artifacts.strictPayload,
        rebalances: [],
        quarterContributions: []
      };
    }
  };
}

test("Peltz/JHG commits strict failure plus linked proxy and marks the whole job degraded", async () => {
  writeDashboardSnapshot(dashboardFixture());
  const billStrict = strictReadyFixture(bill);
  const peltzPair = peltzArtifactPair();
  const result = await runThirteenFRefresh(
    {
      guruIds: [bill.id, peltz.id],
      years: 5,
      detail: "compact",
      exposureLimit: 40,
      reason: "atomic-test"
    },
    managerRuntime(new Map([
      [bill.id, { strictPayload: billStrict, proxyPayload: null }],
      [peltz.id, peltzPair]
    ]))
  );

  assert.equal(result.status, "degraded");
  assert.equal(result.results.find((row) => row.guruId === bill.id)?.status, "refreshed");
  const peltzResult = result.results.find((row) => row.guruId === peltz.id);
  assert.equal(peltzResult?.status, "degraded");
  assert.equal(peltzResult?.backtestStatus, "insufficient_data");
  assert.equal(peltzResult?.displayBacktestStatus, "proxy_ready");

  const storedBill = readGuruBacktest(bill.id, 5);
  assert.equal(storedBill.rebalances.length, 1);
  assert.equal(storedBill.quarterContributions.length, 1);
  const storedStrict = readGuruBacktest(peltz.id, 5);
  const storedProxy = readGuruBacktestProxy(peltz.id, 5);
  assert.equal(storedStrict.status, "insufficient_data");
  assert.equal(storedProxy.status, "proxy_ready");
  assert.equal(storedProxy.proxy.strictFailureGeneratedAt, storedStrict.generatedAt);
  assert.equal(selectManagerBacktestCache(storedStrict, storedProxy, 5).kind, "proxy");
  assert.equal(readGuruSnapshot(peltz.id)?.summary?.reportDate, "2026-06-30");
  assert.equal(readGuruExposureSnapshot(peltz.id)?.history?.length, 1);

  const job = readBackgroundJobRun("guru_13f_refresh");
  assert.equal(job.status, "degraded");
  assert.equal(job.payload.persistenceDetail, "full");
  assert.equal(job.payload.requestedDetail, "compact");
});

test("a normal strict-ready atomic refresh remains success/refreshed", async () => {
  const strict = strictReadyFixture(bill, 8);
  const result = await runThirteenFRefresh(
    { guruIds: [bill.id], years: 8, reason: "strict-success-test" },
    managerRuntime(new Map([
      [bill.id, { strictPayload: strict, proxyPayload: null }]
    ]))
  );

  assert.equal(result.status, "success");
  assert.equal(result.results[0]?.status, "refreshed");
  assert.equal(result.results[0]?.backtestStatus, "ready");
  assert.equal(result.results[0]?.displayBacktestStatus, "ready");
  assert.equal(readGuruBacktest(bill.id, 8)?.rebalances?.length, 1);
  assert.equal(readGuruBacktestProxy(bill.id, 8), null);
  assert.equal(readBackgroundJobRun("guru_13f_refresh")?.status, "success");
});

test("a proxy for any other manager remains a strict failure and commits nothing", async () => {
  const pair = peltzArtifactPair(7);
  pair.strictPayload.guru = { id: tepper.id, name: tepper.name, type: tepper.type };
  pair.proxyPayload.guru = { id: tepper.id, name: tepper.name, type: tepper.type };
  pair.strictPayload.publicReplicability.guruId = tepper.id;
  pair.proxyPayload.publicReplicability.guruId = tepper.id;

  await assert.rejects(
    runThirteenFRefresh(
      { guruIds: [tepper.id], years: 7, reason: "must-fail" },
      managerRuntime(new Map([[tepper.id, pair]]))
    ),
    /david-tepper staged backtest status is insufficient_data; expected ready/i
  );
  assert.equal(readGuruSnapshot(tepper.id), null);
  assert.equal(readGuruExposureSnapshot(tepper.id), null);
  assert.equal(readGuruBacktest(tepper.id, 7), null);
  assert.equal(readGuruBacktestProxy(tepper.id, 7), null);
  const job = readBackgroundJobRun("guru_13f_refresh");
  assert.equal(job?.status, "failed");
  assert.equal(job?.payload?.bundleCommitted, false);
  assert.equal(job?.payload?.results?.[0]?.guruId, undefined);
});

test("an earlier staged manager is marked rolled back when a later manager fails", async () => {
  const billStrict = strictReadyFixture(bill, 9);
  const invalidPair = peltzArtifactPair(9);
  invalidPair.strictPayload.guru = {
    id: tepper.id,
    name: tepper.name,
    type: tepper.type
  };
  invalidPair.proxyPayload.guru = {
    id: tepper.id,
    name: tepper.name,
    type: tepper.type
  };
  invalidPair.strictPayload.publicReplicability.guruId = tepper.id;
  invalidPair.proxyPayload.publicReplicability.guruId = tepper.id;

  await assert.rejects(
    runThirteenFRefresh(
      {
        guruIds: [bill.id, tepper.id],
        years: 9,
        reason: "atomic-rollback-status-test"
      },
      managerRuntime(new Map([
        [bill.id, { strictPayload: billStrict, proxyPayload: null }],
        [tepper.id, invalidPair]
      ]))
    ),
    /david-tepper staged backtest status is insufficient_data; expected ready/i
  );

  assert.equal(readGuruBacktest(bill.id, 9), null);
  const job = readBackgroundJobRun("guru_13f_refresh");
  assert.equal(job?.status, "failed");
  assert.equal(job?.payload?.bundleCommitted, false);
  assert.equal(job?.payload?.results?.[0]?.guruId, bill.id);
  assert.equal(job?.payload?.results?.[0]?.status, "rolled_back");
  assert.equal(job?.payload?.results?.[0]?.stagedStatus, "refreshed");
});

test("a late proxy audit failure rolls back every surface in the atomic database bundle", () => {
  const pair = peltzArtifactPair(6);
  pair.strictPayload.guru = { id: tepper.id, name: tepper.name, type: tepper.type };
  pair.proxyPayload.guru = { id: tepper.id, name: tepper.name, type: tepper.type };
  pair.proxyPayload.proxy.minimumSelectedBookCoverage = 0.9;
  const snapshot = snapshotFixture(tepper, "must-roll-back");

  assert.throws(
    () => writeGuru13fRefreshBundle({
      dashboard: dashboardFixture(),
      guruSnapshots: [{ guruId: tepper.id, payload: snapshot }],
      exposureSnapshots: [{ guruId: tepper.id, payload: exposureFixture(tepper) }],
      backtests: [{ guruId: tepper.id, years: 6, payload: pair.strictPayload }],
      backtestProxies: [{ guruId: tepper.id, years: 6, payload: pair.proxyPayload }]
    }),
    /proxy cache row failed its public coverage audit/i
  );
  assert.equal(readGuruSnapshot(tepper.id), null);
  assert.equal(readGuruExposureSnapshot(tepper.id), null);
  assert.equal(readGuruBacktest(tepper.id, 6), null);
  assert.equal(readGuruBacktestProxy(tepper.id, 6), null);
});

test("the atomic disposition rejects broken Peltz generation linkage", () => {
  const pair = peltzArtifactPair();
  pair.proxyPayload.proxy.strictFailureGeneratedAt = "2026-09-03T02:31:00.000Z";
  assert.throws(
    () => evaluateAtomicRefreshArtifacts(peltz, pair),
    /nelson-peltz staged backtest status is insufficient_data; expected ready/i
  );
});

test("the Peltz exception rejects mutated quarter and limitation identities", () => {
  const wrongQuarter = peltzArtifactPair();
  wrongQuarter.proxyPayload.publicReplicability.affectedQuarters[0].quarterLabel =
    "2026 Q1";
  assert.throws(
    () => evaluateAtomicRefreshArtifacts(peltz, wrongQuarter),
    /nelson-peltz staged backtest status is insufficient_data; expected ready/i
  );

  const wrongLimitation = peltzArtifactPair();
  wrongLimitation.strictPayload.dataQuality.coverageFailures[0]
    .unpricedPositions[0].executionLimitation.code = "missing_adjusted_execution_price";
  assert.throws(
    () => evaluateAtomicRefreshArtifacts(peltz, wrongLimitation),
    /nelson-peltz staged backtest status is insufficient_data; expected ready/i
  );
});
