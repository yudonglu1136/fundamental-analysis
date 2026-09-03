import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  bootstrapGuruCatalog,
  buildExactDashboard,
  loadExpectedRefreshTargets,
  normalizeSelectedGuruIds,
  parseCliArgs,
  validateCurveTarget
} from "../scripts/bootstrap-guru-catalog.mjs";

const strictMethodVersion = "strict-v-test";
const proxyMethodVersion = "proxy-v-test";
const securityMasterVersion = "security-v-test";
const requiredWindows = [5, 10];
const generatedAt = "2026-09-03T08:00:00.000Z";
const selectedIds = Array.from({ length: 9 }, (_, index) => `new-manager-${index + 1}`);
const bootstrapScriptPath = fileURLToPath(
  new URL("../scripts/bootstrap-guru-catalog.mjs", import.meta.url)
);

function configuredCatalog() {
  return Array.from({ length: 38 }, (_, index) => {
    const selectedIndex = index - 29;
    const id = selectedIndex >= 0 ? selectedIds[selectedIndex] : `legacy-profile-${index + 1}`;
    return {
      id,
      name: `Manager ${index + 1}`,
      chineseName: `经理 ${index + 1}`,
      entityName: `Entity ${index + 1}`,
      cik: String(index + 1).padStart(10, "0"),
      ...(selectedIndex === 0 ? { alternateCiks: ["0000099999"] } : {}),
      ...(index === 0 ? {
        sourceLabel: "Current catalog source",
        profileUrl: "https://example.test/current-profile",
        simulationNote: "Current simulation disclosure.",
        preferLatestNonZero13f: true,
        disableSimulation: false
      } : {}),
      type: "manager13f",
      role: "Test manager",
      thesisTag: "Test strategy",
      notes: ["Test disclosure note."]
    };
  });
}

function productionTopologyCatalog() {
  return configuredCatalog().map((guru, index) => {
    if (index < 9) {
      return { ...guru, type: "other", disableSimulation: true };
    }
    if (index < 11) {
      return { ...guru, disableSimulation: true };
    }
    return guru;
  });
}

function baselineDashboard(catalog = configuredCatalog()) {
  return {
    generatedAt: "2026-09-03T10:00:00.000Z",
    source: { label: "test baseline" },
    gurus: catalog.slice(0, 29).map((guru) => ({
      id: guru.id,
      name: `Stale ${guru.name}`,
      type: guru.type,
      cik: guru.cik,
      status: "live",
      cache: { status: "hit" },
      dataStatus: { status: "local-db" },
      holdings: [{ ticker: "OLD", value: 1 }]
    }))
  };
}

function reportingCiks(guru) {
  return [guru.cik, ...(guru.alternateCiks || [])];
}

function snapshotFixture(guru) {
  return {
    id: guru.id,
    name: guru.name,
    chineseName: guru.chineseName,
    entityName: guru.entityName,
    cik: guru.cik,
    type: "manager13f",
    status: "live",
    generatedAt,
    avatarUrl: `/guru-avatars/${guru.id}.png`,
    latestFiling: {
      accessionNumber: `latest-${guru.id}`,
      reportDate: "2026-06-30",
      filingDate: "2026-08-14"
    },
    previousFiling: {
      accessionNumber: `previous-${guru.id}`,
      reportDate: "2026-03-31",
      filingDate: "2026-05-14"
    },
    summary: {
      reportDate: "2026-06-30",
      filingDate: "2026-08-14",
      previousReportDate: "2026-03-31",
      totalValue: 300,
      totalPositions: 3,
      top10Weight: 1,
      topHoldingWeight: 2 / 3,
      concentrationHhi: 0.4
    },
    holdings: [
      { ticker: "AAA", issuer: "Issuer A", value: 200 },
      { ticker: "BBB", issuer: "Issuer B", value: 100 }
    ],
    activity: [{ ticker: "AAA", action: "increased", value: 200 }],
    dataQuality: {
      reportingCiks: reportingCiks(guru),
      blockedReportDates: []
    }
  };
}

function exposureQuarter(reportDate, latest = false) {
  return {
    reportDate,
    quarterLabel: reportDate === "2026-06-30" ? "2026 Q2" : "2026 Q1",
    reported13fValue: latest ? 300 : 250,
    commonLongValue: latest ? 300 : 250,
    positionCount: 3,
    top10Weight: 1,
    topHoldingWeight: latest ? 2 / 3 : 0.6,
    concentrationHhi: latest ? 0.4 : 0.38,
    turnoverProxy: latest ? 0.2 : 0,
    topHoldings: [{ ticker: "AAA", value: latest ? 200 : 150 }],
    largestChanges: latest ? [{ ticker: "AAA", action: "increased" }] : []
  };
}

function exposureFixture(guru) {
  const history = [
    exposureQuarter("2026-03-31"),
    exposureQuarter("2026-06-30", true)
  ];
  return {
    generatedAt,
    status: "live",
    guru: { id: guru.id, name: guru.name, type: "manager13f", cik: guru.cik },
    history,
    latest: {
      ...history.at(-1),
      accessionNumber: `latest-${guru.id}`,
      filingDate: "2026-08-14",
      positionCount: 3,
      commonLongValue: 300
    },
    meta: {
      requestedQuarters: 40,
      returnedQuarters: history.length,
      reportingCiks: reportingCiks(guru),
      errors: [],
      blockedReportDates: []
    },
    cache: { status: "refreshed" }
  };
}

function strictReadyFixture(guruId, years, at = generatedAt) {
  return {
    generatedAt: at,
    status: "ready",
    guru: { id: guruId, type: "manager13f" },
    window: { start: "2021-09-03", end: "2026-09-02" },
    method: {
      version: strictMethodVersion,
      securityMasterVersion,
      years,
      minimumExecutionCoverage: 0.9
    },
    dataQuality: {
      minimumExecutionCoverage: 0.9,
      minimumObservedExecutionCoverage: 1
    },
    summary: { averageCoverage: 1 },
    equity: [{ date: "2021-09-03", value: 1 }, { date: "2026-09-02", value: 2 }],
    rebalances: [{ coveragePct: 1 }],
    quarterContributions: [{
      id: "2026-q2",
      contributions: [{ ticker: "AAA", contributionPct: 0.1 }]
    }]
  };
}

function proxyPairFixture(guruId, years, at = generatedAt) {
  const strict = {
    generatedAt: at,
    status: "insufficient_data",
    guru: { id: guruId, type: "manager13f" },
    method: {
      version: strictMethodVersion,
      securityMasterVersion,
      years,
      minimumExecutionCoverage: 0.9
    },
    dataQuality: {
      failurePolicy: "fail_closed",
      coverageFailures: [{
        reportDate: "2026-06-30",
        executionDate: "2026-08-17",
        coveragePct: 0.8,
        unpricedPositions: [{
          ticker: "MISS",
          reason: "missing_adjusted_execution_price"
        }]
      }]
    },
    equity: [],
    rebalances: [],
    quarterContributions: []
  };
  const proxy = {
    generatedAt: at,
    status: "proxy_ready",
    guru: { id: guruId, type: "manager13f" },
    window: { start: "2021-09-03", end: "2026-09-02" },
    method: {
      version: strictMethodVersion,
      variant: proxyMethodVersion,
      securityMasterVersion,
      years,
      minimumExecutionCoverage: 0.9
    },
    proxy: {
      kind: "public_holdings_proxy",
      methodVersion: proxyMethodVersion,
      securityMasterVersion,
      strictFailureGeneratedAt: at,
      minimumProxyCoverage: 0.3,
      minimumProxyPositions: 2,
      minimumSelectedBookCoverage: 0.5,
      averageSelectedBookCoverage: 0.5,
      maximumExcludedBookWeight: 0.5,
      minimumIncludedPositions: 2
    },
    dataQuality: {
      strictBacktestStatus: "insufficient_data",
      strictFailureCode: "execution_coverage_below_minimum",
      strictMinimumExecutionCoverage: 0.9
    },
    equity: [{ date: "2021-09-03", value: 1 }, { date: "2026-09-02", value: 1.5 }],
    rebalances: [{ selectedBookCoverage: 0.5, includedPositions: 2 }],
    quarterContributions: [{
      id: "2026-q2",
      contributions: [{ ticker: "AAA", contributionPct: 0.05 }]
    }]
  };
  return { strict, proxy };
}

function missingActivePricePairFixture(guruId, years, at = generatedAt) {
  const pair = proxyPairFixture(guruId, years, at);
  delete pair.strict.method.minimumExecutionCoverage;
  pair.strict.dataQuality = {
    failurePolicy: "fail_closed_without_zero_return_or_forward_fill",
    failure: {
      code: "missing_active_price",
      date: "2022-12-23",
      tickers: ["LFG"],
      missingWeight: 0.12,
      details: [{ ticker: "LFG", weight: 0.12 }],
      policy: "fail_closed_without_zero_return_or_forward_fill",
      lastCompleteDate: "2022-12-22"
    }
  };
  pair.proxy.dataQuality = {
    ...pair.proxy.dataQuality,
    strictFailureCode: "missing_active_price",
    strictFailure: {
      code: "missing_active_price",
      date: "2022-12-23",
      tickers: ["LFG"],
      missingWeight: 0.12
    }
  };
  return pair;
}

function targetMatrix({ installReport = false, includeExtra = false } = {}) {
  const targets = [];
  for (const [managerIndex, guruId] of selectedIds.entries()) {
    for (const years of requiredWindows) {
      const expectedStatus = (managerIndex + years) % 2 === 0 ? "ready" : "proxy_ready";
      targets.push({
        guruId,
        years,
        expectedStatus,
        ...(installReport ? {
          actualStatus: expectedStatus,
          generatedAt,
          methodVersion: strictMethodVersion,
          securityMasterVersion,
          pass: true
        } : {})
      });
    }
  }
  if (includeExtra) {
    for (const years of requiredWindows) {
      targets.push({
        guruId: "legacy-profile-1",
        years,
        expectedStatus: "ready",
        ...(installReport ? {
          actualStatus: "ready",
          generatedAt,
          methodVersion: strictMethodVersion,
          securityMasterVersion,
          pass: true
        } : {})
      });
    }
  }
  return targets;
}

function expectationsDocument({ installReport = false, includeExtra = false } = {}) {
  const expectations = {
    strictMethodVersion,
    proxyMethodVersion,
    securityMasterVersion,
    expectedDisplayableRows: 76
  };
  if (installReport) {
    return {
      status: "installed",
      pass: true,
      installedAt: "2026-09-03T07:59:00.000Z",
      recordsSha256: "a".repeat(64),
      expectations,
      refreshes: targetMatrix({ installReport: true, includeExtra })
    };
  }
  return {
    schemaVersion: 1,
    kind: "guru_price_series_repair_batch",
    buildMode: "unbound_private_sharadar_active_intervals",
    expectations,
    refreshTargets: targetMatrix({ includeExtra })
  };
}

function prewarmExpectationsDocument(catalog = configuredCatalog()) {
  const refreshGeneration = "b".repeat(64);
  const enabledManagers = catalog.filter((guru) =>
    guru.type === "manager13f" && !guru.disableSimulation
  );
  const expectedCurveRows = enabledManagers.length * requiredWindows.length;
  const refreshes = enabledManagers.flatMap((guru, managerIndex) =>
    requiredWindows.map((years) => {
      const expectedStatus = (managerIndex + years) % 2 === 0 ? "ready" : "proxy_ready";
      return {
        guruId: guru.id,
        guruType: "manager13f",
        disabled: false,
        years,
        expectedStatus,
        actualStatus: expectedStatus,
        generatedAt,
        methodVersion: strictMethodVersion,
        securityMasterVersion,
        proxyMethodVersion: expectedStatus === "proxy_ready" ? proxyMethodVersion : "",
        proxySecurityMasterVersion: expectedStatus === "proxy_ready"
          ? securityMasterVersion
          : "",
        refreshGeneration: `${refreshGeneration}:${years}`,
        pass: true
      };
    })
  );
  return {
    schemaVersion: 1,
    kind: "guru_curve_production_prewarm",
    refreshGeneration,
    startedAt: "2026-09-03T07:59:00.000Z",
    finishedAt: "2026-09-03T08:01:00.000Z",
    healthHttpStatus: 200,
    pass: true,
    expectations: {
      strictMethodVersion,
      proxyMethodVersion,
      securityMasterVersion,
      expectedDisplayableRows: expectedCurveRows
    },
    windows: requiredWindows.map((years) => ({
      years,
      managerCount: enabledManagers.length
    })),
    refreshes,
    curveAvailability: {
      ok: true,
      managerCount: enabledManagers.length,
      windows: [...requiredWindows],
      expectedRows: expectedCurveRows,
      displayable: expectedCurveRows,
      failures: [],
      methodVersion: strictMethodVersion,
      proxyMethodVersion,
      securityMasterVersion
    }
  };
}

function runtimeFixture({ document = expectationsDocument(), mutate = null } = {}) {
  const catalog = configuredCatalog();
  const baseline = baselineDashboard(catalog);
  const targets = new Map(
    (document.refreshTargets || document.refreshes || [])
      .map((target) => [`${target.guruId}:${target.years}`, target])
  );
  const strictByKey = new Map();
  const proxyByKey = new Map();
  for (const [key, target] of targets) {
    if (target.expectedStatus === "ready") {
      strictByKey.set(key, strictReadyFixture(target.guruId, target.years));
      proxyByKey.set(key, null);
    } else {
      const pair = proxyPairFixture(target.guruId, target.years);
      strictByKey.set(key, pair.strict);
      proxyByKey.set(key, pair.proxy);
    }
  }
  const calls = {
    snapshot: [],
    exposure: [],
    strictReads: [],
    proxyReads: [],
    writes: []
  };
  let dashboardVersionReads = 0;
  let exposureVersionReads = 0;
  let curveVersionReads = 0;
  const runtime = {
    configuredGurus: catalog,
    requiredWindows,
    expectedDashboardCount: 38,
    expectedCurveRows: 76,
    strictMethodVersion,
    proxyMethodVersion,
    securityMasterVersion,
    minimumStrictCoverage: 0.9,
    avatarUrlForGuru: (guruId) => `/guru-avatars/${guruId}.png`,
    readDashboardSnapshot: () => structuredClone(baseline),
    readGuruDashboardVersion: () => {
      dashboardVersionReads += 1;
      return mutate?.dashboardVersion?.(dashboardVersionReads) || "dashboard-v1";
    },
    readGuruExposureVersion: () => {
      exposureVersionReads += 1;
      return mutate?.exposureVersion?.(exposureVersionReads) || "exposure-v1";
    },
    readGuruBacktestVersion: (years) => {
      curveVersionReads += 1;
      return mutate?.curveVersion?.(years, curveVersionReads) || `curve-${years}-v1`;
    },
    readGuruBacktest: (guruId, years) => {
      calls.strictReads.push({ guruId, years });
      const value = structuredClone(strictByKey.get(`${guruId}:${years}`));
      return mutate?.strict?.(value, guruId, years) ?? value;
    },
    readGuruBacktestProxy: (guruId, years) => {
      calls.proxyReads.push({ guruId, years });
      const value = structuredClone(proxyByKey.get(`${guruId}:${years}`));
      return mutate?.proxy?.(value, guruId, years) ?? value;
    },
    refreshGuruSnapshot: async (guruId, options) => {
      calls.snapshot.push({ guruId, options });
      const value = snapshotFixture(catalog.find((guru) => guru.id === guruId));
      return mutate?.snapshot?.(value, guruId, calls.snapshot.length) ?? value;
    },
    refreshGuruExposureSnapshot: async (guruId, options) => {
      calls.exposure.push({ guruId, options });
      const value = exposureFixture(catalog.find((guru) => guru.id === guruId));
      return mutate?.exposure?.(value, guruId, calls.exposure.length) ?? value;
    },
    auditStrict: (payload) => mutate?.auditStrict?.(payload) || { ok: true },
    auditProxy: (payload) => mutate?.auditProxy?.(payload) || { ok: true },
    selectManagerBacktestCache: (strict, proxy) => {
      if (mutate?.selector) return mutate.selector(strict, proxy);
      if (strict?.status === "ready") return { kind: "strict", payload: strict };
      if (strict?.status === "insufficient_data" && proxy?.status === "proxy_ready" &&
          proxy.proxy?.strictFailureGeneratedAt === strict.generatedAt) {
        return { kind: "proxy", payload: proxy };
      }
      return { kind: "miss", payload: null };
    },
    summarizeCurveAvailability: (options) => {
      if (mutate?.curveMatrix) return mutate.curveMatrix(options);
      return {
        ok: true,
        managerCount: options.managers.length,
        windows: [...options.windows],
        expectedRows: 76,
        displayable: 76,
        strictReady: 60,
        proxyReady: 16,
        failures: [],
        methodVersion: strictMethodVersion,
        proxyMethodVersion,
        securityMasterVersion
      };
    },
    writeGuru13fRefreshBundle: (bundle) => {
      calls.writes.push(bundle);
      if (mutate?.write) return mutate.write(bundle);
      return { gurus: bundle.guruSnapshots.length, dashboardGeneratedAt: generatedAt };
    },
    now: () => generatedAt
  };
  return { runtime, calls, baseline, document };
}

function bootstrapOptions(document) {
  return {
    guru: selectedIds.join(","),
    expectationDocument: document,
    exposureLimit: 40,
    reason: "catalog-bootstrap-test"
  };
}

test("CLI requires an explicit list and fixed 40-quarter exposure history", () => {
  assert.deepEqual(parseCliArgs([
    `--guru=${selectedIds.join(",")}`,
    "--expectations=/tmp/expectations.json",
    "--exposure-limit=40",
    "--reason=catalog-bootstrap-test"
  ]), {
    guru: selectedIds.join(","),
    expectations: "/tmp/expectations.json",
    exposureLimit: 40,
    reason: "catalog-bootstrap-test",
    help: false
  });
  assert.equal(parseCliArgs(["--help"]).help, true);
  assert.throws(() => parseCliArgs(["--expectations=x"]), /--guru/i);
  assert.throws(
    () => parseCliArgs(["--guru=a", "--expectations=x", "--exposure-limit=24"]),
    /must remain 40/i
  );
  assert.throws(() => parseCliArgs(["--unknown=x"]), /unknown argument/i);
  assert.throws(
    () => normalizeSelectedGuruIds(`${selectedIds[0]},${selectedIds[0]}`, configuredCatalog()),
    /duplicates/i
  );
});

test("CLI help exits zero and invalid input exits non-zero before loading production runtime", () => {
  const help = spawnSync(process.execPath, [bootstrapScriptPath, "--help"], {
    encoding: "utf8",
    env: { ...process.env }
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);

  const invalid = spawnSync(process.execPath, [bootstrapScriptPath, "--unknown=x"], {
    encoding: "utf8",
    env: { ...process.env }
  });
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.match(invalid.stderr, /Unknown argument/i);
});

test("expectation loader accepts a valid superset but returns only the explicit managers", () => {
  const runtime = runtimeFixture().runtime;
  const result = loadExpectedRefreshTargets(
    expectationsDocument({ includeExtra: true }),
    { selectedGuruIds: selectedIds, requiredWindows, runtime }
  );
  assert.equal(result.targets.length, 18);
  assert.equal(result.allTargets.length, 20);
  assert.equal(result.ignoredTargets.length, 2);
  assert.ok(result.allTargets.every((target) =>
    !Object.hasOwn(target, "evidenceGeneratedAt")
  ));
  assert.deepEqual(result.ignoredTargets.map(({ guruId, years }) => ({ guruId, years })), [
    { guruId: "legacy-profile-1", years: 5 },
    { guruId: "legacy-profile-1", years: 10 }
  ]);

  const duplicate = expectationsDocument();
  duplicate.refreshTargets.push(structuredClone(duplicate.refreshTargets[0]));
  assert.throws(
    () => loadExpectedRefreshTargets(duplicate, {
      selectedGuruIds: selectedIds,
      requiredWindows,
      runtime
    }),
    /duplicate expectation target/i
  );

  const missing = expectationsDocument();
  missing.refreshTargets.pop();
  assert.throws(
    () => loadExpectedRefreshTargets(missing, {
      selectedGuruIds: selectedIds,
      requiredWindows,
      runtime
    }),
    /every required window/i
  );

  const unknown = expectationsDocument({ includeExtra: true });
  unknown.refreshTargets.at(-1).guruId = "unknown-manager";
  assert.throws(
    () => loadExpectedRefreshTargets(unknown, {
      selectedGuruIds: selectedIds,
      requiredWindows,
      runtime
    }),
    /invalid manager/i
  );

  const ambiguous = expectationsDocument();
  ambiguous.refreshes = [];
  assert.throws(
    () => loadExpectedRefreshTargets(ambiguous, {
      selectedGuruIds: selectedIds,
      requiredWindows,
      runtime
    }),
    /exactly one/i
  );
  const nonArray = expectationsDocument();
  nonArray.refreshTargets = {};
  assert.throws(
    () => loadExpectedRefreshTargets(nonArray, {
      selectedGuruIds: selectedIds,
      requiredWindows,
      runtime
    }),
    /must be an array/i
  );
});

test("install-report expectations retain exact curve-generation evidence", () => {
  const document = expectationsDocument({ installReport: true });
  const runtime = runtimeFixture({ document }).runtime;
  const result = loadExpectedRefreshTargets(document, {
    selectedGuruIds: selectedIds,
    requiredWindows,
    runtime
  });
  assert.equal(result.sourceKind, "install_report");
  assert.ok(result.targets.every((target) => target.evidenceGeneratedAt === generatedAt));

  const failed = structuredClone(document);
  failed.refreshes[0].pass = false;
  assert.throws(
    () => loadExpectedRefreshTargets(failed, {
      selectedGuruIds: selectedIds,
      requiredWindows,
      runtime
    }),
    /did not pass/i
  );
  const overallFailed = structuredClone(document);
  overallFailed.pass = false;
  assert.throws(
    () => loadExpectedRefreshTargets(overallFailed, {
      selectedGuruIds: selectedIds,
      requiredWindows,
      runtime
    }),
    /status=installed and pass=true/i
  );
});

test("production-prewarm expectations bind the complete enabled-manager matrix", () => {
  const document = prewarmExpectationsDocument();
  const runtime = runtimeFixture({ document }).runtime;
  const result = loadExpectedRefreshTargets(document, {
    selectedGuruIds: selectedIds,
    requiredWindows,
    runtime
  });
  assert.equal(result.sourceKind, "prewarm_report");
  assert.equal(result.allTargets.length, 76);
  assert.equal(result.targets.length, 18);
  assert.equal(result.ignoredTargets.length, 58);
  assert.ok(result.allTargets.every((target) =>
    target.evidenceGeneratedAt === generatedAt &&
    target.evidenceSource === "prewarm_report"
  ));

  const cases = [
    {
      name: "overall pass",
      mutate: (payload) => { payload.pass = false; },
      pattern: /schemaVersion=1 and pass=true/i
    },
    {
      name: "missing matrix row",
      mutate: (payload) => { payload.refreshes.pop(); },
      pattern: /exactly cover the enabled-manager curve matrix/i
    },
    {
      name: "row generation",
      mutate: (payload) => { payload.refreshes[0].refreshGeneration = "wrong"; },
      pattern: /exact generation and identity/i
    },
    {
      name: "row method",
      mutate: (payload) => { payload.refreshes[0].methodVersion = "stale-method"; },
      pattern: /exact generation and identity/i
    },
    {
      name: "proxy identity",
      mutate: (payload) => {
        const proxy = payload.refreshes.find((row) => row.expectedStatus === "proxy_ready");
        proxy.proxyMethodVersion = "stale-proxy";
      },
      pattern: /exact generation and identity/i
    },
    {
      name: "generated timestamp",
      mutate: (payload) => {
        payload.refreshes[0].generatedAt = "2026-09-03T07:58:59.000Z";
      },
      pattern: /exact generation and identity/i
    },
    {
      name: "health matrix",
      mutate: (payload) => { payload.curveAvailability.displayable = 75; },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health manager count",
      mutate: (payload) => { payload.curveAvailability.managerCount = 37; },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health windows missing",
      mutate: (payload) => { payload.curveAvailability.windows = [5]; },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health windows duplicated",
      mutate: (payload) => { payload.curveAvailability.windows = [5, 5]; },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health strict method",
      mutate: (payload) => { payload.curveAvailability.methodVersion = "stale-strict"; },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health proxy method",
      mutate: (payload) => {
        payload.curveAvailability.proxyMethodVersion = "stale-proxy";
      },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health security master",
      mutate: (payload) => {
        payload.curveAvailability.securityMasterVersion = "stale-security";
      },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health failures missing",
      mutate: (payload) => { delete payload.curveAvailability.failures; },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health failures non-array",
      mutate: (payload) => { payload.curveAvailability.failures = {}; },
      pattern: /complete, healthy, current-generation matrix/i
    },
    {
      name: "health failures nonempty",
      mutate: (payload) => {
        payload.curveAvailability.failures = [{ guruId: "legacy-profile-1", years: 5 }];
      },
      pattern: /complete, healthy, current-generation matrix/i
    }
  ];
  for (const item of cases) {
    const invalid = structuredClone(document);
    item.mutate(invalid);
    assert.throws(
      () => loadExpectedRefreshTargets(invalid, {
        selectedGuruIds: selectedIds,
        requiredWindows,
        runtime
      }),
      item.pattern,
      item.name
    );
  }
});

test("production-prewarm expectations accept the real 38/29/27/54 topology", () => {
  const catalog = productionTopologyCatalog();
  const enabledManagers = catalog.filter((guru) =>
    guru.type === "manager13f" && !guru.disableSimulation
  );
  const document = prewarmExpectationsDocument(catalog);
  const runtime = {
    configuredGurus: catalog,
    expectedCurveRows: 54,
    strictMethodVersion,
    proxyMethodVersion,
    securityMasterVersion
  };
  const result = loadExpectedRefreshTargets(document, {
    selectedGuruIds: selectedIds,
    requiredWindows,
    runtime
  });

  assert.equal(catalog.length, 38);
  assert.equal(catalog.filter((guru) => guru.type === "manager13f").length, 29);
  assert.equal(enabledManagers.length, 27);
  assert.equal(document.refreshes.length, 54);
  assert.equal(result.allTargets.length, 54);
  assert.equal(result.targets.length, 18);
  assert.equal(result.ignoredTargets.length, 36);
});

test("dashboard construction is exact, ordered, metadata-current, and non-mutating", () => {
  const catalog = configuredCatalog();
  const baseline = baselineDashboard(catalog);
  const before = structuredClone(baseline);
  const staged = selectedIds.map((guruId) => ({
    guruId,
    payload: {
      ...snapshotFixture(catalog.find((guru) => guru.id === guruId)),
      cache: { status: "refreshed" }
    }
  }));
  const dashboard = buildExactDashboard({
    baseline,
    stagedSnapshots: staged,
    configuredGurus: catalog,
    selectedGuruIds: selectedIds,
    expectedDashboardCount: 38,
    avatarUrlForGuru: (guruId) => `/guru-avatars/${guruId}.png`,
    now: () => generatedAt,
    exposureLimit: 40,
    requiredWindows,
    expectationSourceKind: "artifact"
  });
  assert.deepEqual(dashboard.gurus.map((guru) => guru.id), catalog.map((guru) => guru.id));
  assert.equal(new Set(dashboard.gurus.map((guru) => guru.id)).size, 38);
  assert.ok(dashboard.gurus.every((guru) => !guru.cache && !guru.dataStatus));
  assert.ok(dashboard.gurus.every(
    (guru) => guru.avatarUrl === `/guru-avatars/${guru.id}.png`
  ));
  assert.equal(dashboard.gurus[0].name, catalog[0].name);
  assert.equal(dashboard.gurus[0].sourceLabel, catalog[0].sourceLabel);
  assert.equal(dashboard.gurus[0].profileUrl, catalog[0].profileUrl);
  assert.equal(dashboard.gurus[0].simulationNote, catalog[0].simulationNote);
  assert.equal(dashboard.gurus[0].preferLatestNonZero13f, true);
  assert.equal(dashboard.gurus[0].disableSimulation, false);
  assert.deepEqual(
    dashboard.gurus.find((guru) => guru.id === selectedIds[0]).alternateCiks,
    ["0000099999"]
  );
  assert.equal(dashboard.gurus[0].holdings[0].ticker, "OLD");
  assert.equal(
    dashboard.gurus.find((guru) => guru.id === selectedIds[0]).holdings[0].ticker,
    "AAA"
  );
  assert.deepEqual(baseline, before);

  const duplicate = structuredClone(baseline);
  duplicate.gurus.push(structuredClone(duplicate.gurus[0]));
  assert.throws(() => buildExactDashboard({
    baseline: duplicate,
    stagedSnapshots: staged,
    configuredGurus: catalog,
    selectedGuruIds: selectedIds,
    expectedDashboardCount: 38,
    avatarUrlForGuru: (guruId) => `/guru-avatars/${guruId}.png`,
    now: () => generatedAt,
    exposureLimit: 40,
    requiredWindows,
    expectationSourceKind: "artifact"
  }), /duplicates profile/i);

  assert.throws(() => buildExactDashboard({
    baseline,
    stagedSnapshots: staged,
    configuredGurus: catalog,
    selectedGuruIds: selectedIds,
    expectedDashboardCount: 38,
    avatarUrlForGuru: (guruId) => guruId === catalog[0].id
      ? ""
      : `/guru-avatars/${guruId}.png`,
    now: () => generatedAt,
    exposureLimit: 40,
    requiredWindows,
    expectationSourceKind: "artifact"
  }), /avatar URL is missing/i);
});

test("exact expected status cannot be upgraded or downgraded between strict and proxy", () => {
  const runtime = runtimeFixture().runtime;
  const readyTarget = { guruId: selectedIds[0], years: 5, expectedStatus: "ready" };
  const proxyPair = proxyPairFixture(readyTarget.guruId, readyTarget.years);
  assert.throws(
    () => validateCurveTarget(readyTarget, proxyPair.strict, proxyPair.proxy, runtime),
    /expected ready/i
  );

  const proxyTarget = { guruId: selectedIds[0], years: 5, expectedStatus: "proxy_ready" };
  const strict = strictReadyFixture(proxyTarget.guruId, proxyTarget.years);
  assert.throws(
    () => validateCurveTarget(proxyTarget, strict, null, runtime),
    /expected proxy_ready/i
  );

  const broken = proxyPairFixture(proxyTarget.guruId, proxyTarget.years);
  broken.proxy.proxy.strictFailureGeneratedAt = "2026-09-03T11:59:59.000Z";
  assert.throws(
    () => validateCurveTarget(proxyTarget, broken.strict, broken.proxy, runtime),
    /strict linkage/i
  );

  const nonFailClosed = proxyPairFixture(proxyTarget.guruId, proxyTarget.years);
  nonFailClosed.strict.dataQuality.failurePolicy = "best_effort";
  assert.throws(
    () => validateCurveTarget(proxyTarget, nonFailClosed.strict, nonFailClosed.proxy, runtime),
    /fail-closed artifact/i
  );
  const missingStrictFloor = proxyPairFixture(proxyTarget.guruId, proxyTarget.years);
  delete missingStrictFloor.strict.method.minimumExecutionCoverage;
  assert.throws(
    () => validateCurveTarget(
      proxyTarget,
      missingStrictFloor.strict,
      missingStrictFloor.proxy,
      runtime
    ),
    /fail-closed artifact/i
  );
  const malformedCoverageFailure = proxyPairFixture(proxyTarget.guruId, proxyTarget.years);
  malformedCoverageFailure.strict.dataQuality.coverageFailures = [{}];
  assert.throws(
    () => validateCurveTarget(
      proxyTarget,
      malformedCoverageFailure.strict,
      malformedCoverageFailure.proxy,
      runtime
    ),
    /fail-closed artifact/i
  );
  const synthetic = proxyPairFixture(proxyTarget.guruId, proxyTarget.years);
  synthetic.proxy.dataQuality.syntheticPriceUsed = true;
  assert.throws(
    () => validateCurveTarget(proxyTarget, synthetic.strict, synthetic.proxy, runtime),
    /synthetic-price usage/i
  );
});

test("missing_active_price accepts only complete fail-closed evidence and exact proxy linkage", () => {
  const runtime = runtimeFixture().runtime;
  const target = {
    guruId: selectedIds[0],
    years: 5,
    expectedStatus: "proxy_ready"
  };
  const valid = missingActivePricePairFixture(target.guruId, target.years);
  assert.equal(
    validateCurveTarget(target, valid.strict, valid.proxy, runtime).displayed,
    valid.proxy
  );

  const cases = [
    {
      name: "unknown failure code",
      mutate(pair) {
        pair.strict.dataQuality.failure.code = "unknown_price_failure";
        pair.proxy.dataQuality.strictFailureCode = "unknown_price_failure";
      },
      pattern: /complete fail-closed artifact/i
    },
    {
      name: "missing diagnostic details",
      mutate(pair) { pair.strict.dataQuality.failure.details = []; },
      pattern: /complete fail-closed artifact/i
    },
    {
      name: "non-positive missing weight",
      mutate(pair) {
        pair.strict.dataQuality.failure.missingWeight = 0;
        pair.proxy.dataQuality.strictFailure.missingWeight = 0;
      },
      pattern: /complete fail-closed artifact/i
    },
    {
      name: "invalid last complete date",
      mutate(pair) {
        pair.strict.dataQuality.failure.lastCompleteDate = "2022-12-23";
      },
      pattern: /complete fail-closed artifact/i
    },
    {
      name: "declared strict floor below runtime",
      mutate(pair) { pair.strict.method.minimumExecutionCoverage = 0.8; },
      pattern: /complete fail-closed artifact/i
    },
    {
      name: "forward fill used",
      mutate(pair) { pair.strict.dataQuality.failure.forwardFillUsed = true; },
      pattern: /forward-filled price fallback/i
    },
    {
      name: "proxy code mismatch",
      mutate(pair) {
        pair.proxy.dataQuality.strictFailureCode =
          "execution_coverage_below_minimum";
      },
      pattern: /strict linkage/i
    },
    {
      name: "proxy compact failure mismatch",
      mutate(pair) { pair.proxy.dataQuality.strictFailure.tickers = ["OTHER"]; },
      pattern: /strict linkage/i
    }
  ];
  for (const item of cases) {
    const pair = missingActivePricePairFixture(target.guruId, target.years);
    item.mutate(pair);
    assert.throws(
      () => validateCurveTarget(target, pair.strict, pair.proxy, runtime),
      item.pattern,
      item.name
    );
  }
});

test("missing_active_price linkage matches only the canonical first-eight ticker summary", () => {
  const runtime = runtimeFixture().runtime;
  const target = {
    guruId: selectedIds[0],
    years: 5,
    expectedStatus: "proxy_ready"
  };
  const buildManyTickerPair = () => {
    const pair = missingActivePricePairFixture(target.guruId, target.years);
    const tickers = Array.from({ length: 12 }, (_, index) => `MISS${index + 1}`);
    const weights = tickers.map((ticker) => ({ ticker, weight: 0.01 }));
    pair.strict.dataQuality.failure.tickers = tickers;
    pair.strict.dataQuality.failure.details = weights;
    pair.strict.dataQuality.failure.missingWeight = 0.12;
    pair.proxy.dataQuality.strictFailure.tickers = tickers.slice(0, 8);
    pair.proxy.dataQuality.strictFailure.missingWeight = 0.12;
    return pair;
  };

  const valid = buildManyTickerPair();
  assert.equal(
    validateCurveTarget(target, valid.strict, valid.proxy, runtime).displayed,
    valid.proxy
  );

  const cases = [
    {
      name: "reordered canonical tickers",
      mutate(pair) {
        [
          pair.proxy.dataQuality.strictFailure.tickers[0],
          pair.proxy.dataQuality.strictFailure.tickers[1]
        ] = [
          pair.proxy.dataQuality.strictFailure.tickers[1],
          pair.proxy.dataQuality.strictFailure.tickers[0]
        ];
      }
    },
    {
      name: "tampered canonical ticker",
      mutate(pair) { pair.proxy.dataQuality.strictFailure.tickers[7] = "OTHER"; }
    },
    {
      name: "uncompacted ticker list",
      mutate(pair) {
        pair.proxy.dataQuality.strictFailure.tickers =
          pair.strict.dataQuality.failure.tickers.slice();
      }
    },
    {
      name: "truncated below canonical length",
      mutate(pair) { pair.proxy.dataQuality.strictFailure.tickers.pop(); }
    },
    {
      name: "non-canonical extra field",
      mutate(pair) { pair.proxy.dataQuality.strictFailure.totalTickers = 12; }
    },
    {
      name: "stringified missing weight",
      mutate(pair) { pair.proxy.dataQuality.strictFailure.missingWeight = "0.12"; }
    }
  ];
  for (const item of cases) {
    const pair = buildManyTickerPair();
    item.mutate(pair);
    assert.throws(
      () => validateCurveTarget(target, pair.strict, pair.proxy, runtime),
      /strict linkage/i,
      item.name
    );
  }
});

test("dependency-injected bootstrap still enforces reason and derived curve cardinality", async () => {
  const document = expectationsDocument();
  const invalidReason = runtimeFixture({ document });
  await assert.rejects(
    bootstrapGuruCatalog({
      ...bootstrapOptions(document),
      reason: "contains spaces"
    }, invalidReason.runtime),
    /--reason is invalid/i
  );
  assert.equal(invalidReason.calls.snapshot.length, 0);
  assert.equal(invalidReason.calls.writes.length, 0);

  const wrongRowsDocument = expectationsDocument();
  wrongRowsDocument.expectations.expectedDisplayableRows = 75;
  const wrongRows = runtimeFixture({ document: wrongRowsDocument });
  wrongRows.runtime.expectedCurveRows = 75;
  await assert.rejects(
    bootstrapGuruCatalog(bootstrapOptions(wrongRowsDocument), wrongRows.runtime),
    /expected row count are inconsistent/i
  );
  assert.equal(wrongRows.calls.snapshot.length, 0);
  assert.equal(wrongRows.calls.writes.length, 0);
});

test("successful bootstrap stages all surfaces without persistence and writes exactly once", async (context) => {
  const document = expectationsDocument({ includeExtra: true });
  const { runtime, calls, baseline } = runtimeFixture({ document });
  const baselineBefore = structuredClone(baseline);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unexpected network access from dependency-injected bootstrap test.");
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const result = await bootstrapGuruCatalog(bootstrapOptions(document), runtime);
  assert.equal(result.status, "bootstrapped");
  assert.equal(result.dashboardProfiles, 38);
  assert.equal(result.snapshots, 9);
  assert.equal(result.exposures, 9);
  assert.equal(result.backtests, 18);
  assert.equal(result.ignoredExpectationTargets.length, 2);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.snapshot.length, 9);
  assert.equal(calls.exposure.length, 9);
  assert.ok(calls.snapshot.every((call) => call.options.persist === false));
  assert.ok(calls.exposure.every((call) =>
    call.options.persist === false && call.options.limit === 40 &&
    call.options.reason === "catalog-bootstrap-test"
  ));
  const bundle = calls.writes[0];
  assert.equal(bundle.dashboard.gurus.length, 38);
  assert.equal(bundle.guruSnapshots.length, 9);
  assert.equal(bundle.exposureSnapshots.length, 9);
  assert.equal(bundle.backtests.length, 18);
  assert.equal(bundle.expectedState.dashboardVersion, "dashboard-v1");
  assert.equal(bundle.expectedState.exposureVersion, "exposure-v1");
  assert.deepEqual(bundle.expectedState.curveVersions, {
    5: "curve-5-v1",
    10: "curve-10-v1"
  });
  assert.deepEqual(
    bundle.expectedState.dashboardGuruIds,
    configuredCatalog().slice(0, 29).map((guru) => guru.id)
  );
  assert.deepEqual(
    bundle.expectedState.exactCatalogIds,
    configuredCatalog().map((guru) => guru.id)
  );
  assert.equal(
    bundle.backtestProxies.length,
    targetMatrix().filter((target) => target.expectedStatus === "proxy_ready").length
  );
  assert.ok(bundle.exposureSnapshots.every((item) => !item.payload.cache));
  assert.deepEqual(baseline, baselineBefore);
});

test("successful bootstrap accepts exact full-matrix production-prewarm evidence", async () => {
  const document = prewarmExpectationsDocument();
  const { runtime, calls } = runtimeFixture({ document });
  const result = await bootstrapGuruCatalog(bootstrapOptions(document), runtime);

  assert.equal(result.status, "bootstrapped");
  assert.equal(result.expectationSource, "prewarm_report");
  assert.equal(result.backtests, 18);
  assert.equal(result.ignoredExpectationTargets.length, 58);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.snapshot.length, 9);
  assert.equal(calls.exposure.length, 9);
  assert.equal(calls.strictReads.length, 152);
  assert.equal(calls.proxyReads.length, 152);
});

test("a failed SEC stage, curve audit, or concurrent version change leaves writer untouched", async (context) => {
  const cases = [
    {
      name: "snapshot fallback",
      mutate: { snapshot: (payload, _guruId, call) => call === 2
        ? { ...payload, dataStatus: { status: "stale" } }
        : payload },
      pattern: /failed or fallback SEC result/i
    },
    {
      name: "exposure filing error",
      mutate: { exposure: (payload, _guruId, call) => call === 2
        ? { ...payload, meta: { ...payload.meta, errors: [{ message: "SEC failed" }] } }
        : payload },
      pattern: /SEC filing failures/i
    },
    {
      name: "snapshot filing mismatch",
      mutate: { snapshot: (payload, _guruId, call) => call === 2
        ? {
            ...payload,
            latestFiling: { ...payload.latestFiling, accessionNumber: "" }
          }
        : payload },
      pattern: /lacks a prior quarter/i
    },
    {
      name: "exposure latest mismatch",
      mutate: { exposure: (payload, _guruId, call) => call === 2
        ? { ...payload, latest: { ...payload.latest, commonLongValue: 299 } }
        : payload },
      pattern: /does not reconcile/i
    },
    {
      name: "exposure concentration analytics missing",
      mutate: { exposure: (payload, _guruId, call) => {
        if (call !== 2) return payload;
        const changed = structuredClone(payload);
        delete changed.history[0].concentrationHhi;
        return changed;
      } },
      pattern: /invalid or duplicate quarter/i
    },
    {
      name: "strict audit failure",
      mutate: { auditStrict: () => ({ ok: false, reason: "coverage" }) },
      pattern: /failed audit/i
    },
    {
      name: "concurrent dashboard change",
      mutate: { dashboardVersion: (read) => read === 2 ? "dashboard-v2" : "dashboard-v1" },
      pattern: /dashboard changed/i
    },
    {
      name: "concurrent exposure-only change",
      mutate: { exposureVersion: (read) => read === 2 ? "exposure-v2" : "exposure-v1" },
      pattern: /exposure history changed/i
    },
    {
      name: "concurrent 5Y curve change",
      mutate: { curveVersion: (years, read) =>
        read === 3 && years === 5 ? "curve-5-v2" : `curve-${years}-v1` },
      pattern: /5Y Guru curves changed/i
    },
    {
      name: "full curve matrix incomplete",
      mutate: { curveMatrix: (options) => ({
        ok: false,
        managerCount: options.managers.length,
        windows: options.windows,
        expectedRows: 76,
        displayable: 75,
        failures: [{ guruId: "legacy-profile-1", years: 10, reason: "stale" }],
        methodVersion: strictMethodVersion,
        proxyMethodVersion,
        securityMasterVersion
      }) },
      pattern: /complete enabled-manager curve matrix/i
    }
  ];
  for (const item of cases) {
    await context.test(item.name, async () => {
      const document = expectationsDocument();
      const { runtime, calls } = runtimeFixture({ document, mutate: item.mutate });
      await assert.rejects(
        bootstrapGuruCatalog(bootstrapOptions(document), runtime),
        item.pattern
      );
      assert.equal(calls.writes.length, 0);
    });
  }
});

test("valid expectation supersets also require the ignored manager rows to match SQLite", async () => {
  const document = expectationsDocument({ includeExtra: true });
  const { runtime, calls } = runtimeFixture({
    document,
    mutate: {
      strict: (payload, guruId) => guruId === "legacy-profile-1"
        ? { ...payload, status: "insufficient_data" }
        : payload
    }
  });
  await assert.rejects(
    bootstrapGuruCatalog(bootstrapOptions(document), runtime),
    /expected ready/i
  );
  assert.equal(calls.snapshot.length, 0);
  assert.equal(calls.writes.length, 0);
});

test("successful install report cannot bootstrap stale same-version curves", async () => {
  const document = expectationsDocument({ installReport: true });
  const staleAt = "2026-09-03T11:00:00.000Z";
  const { runtime, calls } = runtimeFixture({
    document,
    mutate: {
      strict: (payload) => payload ? { ...payload, generatedAt: staleAt } : payload,
      proxy: (payload) => payload ? {
        ...payload,
        generatedAt: staleAt,
        proxy: { ...payload.proxy, strictFailureGeneratedAt: staleAt }
      } : payload
    }
  });
  await assert.rejects(
    bootstrapGuruCatalog(bootstrapOptions(document), runtime),
    /install-report generation/i
  );
  assert.equal(calls.snapshot.length, 0);
  assert.equal(calls.writes.length, 0);
});

test("successful production-prewarm report cannot bootstrap a different curve generation", async () => {
  const document = prewarmExpectationsDocument();
  const staleAt = "2026-09-03T08:00:30.000Z";
  const { runtime, calls } = runtimeFixture({
    document,
    mutate: {
      strict: (payload, guruId, years) => guruId === "legacy-profile-1" && years === 5
        ? { ...payload, generatedAt: staleAt }
        : payload,
      proxy: (payload, guruId, years) => guruId === "legacy-profile-1" && years === 5
        ? {
            ...payload,
            generatedAt: staleAt,
            proxy: { ...payload.proxy, strictFailureGeneratedAt: staleAt }
          }
        : payload
    }
  });
  await assert.rejects(
    bootstrapGuruCatalog(bootstrapOptions(document), runtime),
    /production-prewarm generation/i
  );
  assert.equal(calls.snapshot.length, 0);
  assert.equal(calls.writes.length, 0);
});

test("atomic writer errors are propagated without a second write attempt", async () => {
  const document = expectationsDocument();
  const { runtime, calls } = runtimeFixture({
    document,
    mutate: { write: () => { throw new Error("transaction rolled back"); } }
  });
  await assert.rejects(
    bootstrapGuruCatalog(bootstrapOptions(document), runtime),
    /transaction rolled back/i
  );
  assert.equal(calls.writes.length, 1);
});
