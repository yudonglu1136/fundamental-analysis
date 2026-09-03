#!/usr/bin/env node

/**
 * Atomically add an explicit set of manager-13F profiles to the Guru catalog.
 *
 * This is intentionally a one-time bootstrap, not a general refresh command:
 * the selected managers must be absent from the current dashboard and every
 * other configured profile must already be present. SEC-backed snapshots and
 * exposure histories are staged with `persist: false`; compatible 5Y/10Y
 * strict/proxy artifacts must already exist in SQLite. Only after every gate
 * passes is `writeGuru13fRefreshBundle` invoked once.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const bootstrapExposureQuarters = 40;
const allowedExpectedStatuses = new Set(["ready", "proxy_ready"]);
const artifactKind = "guru_price_series_repair_batch";
const prewarmReportKind = "guru_curve_production_prewarm";

function validatedReason(value) {
  const reason = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/.test(reason)) {
    throw new Error("--reason is invalid.");
  }
  return reason;
}

function optionValue(argv, index, name) {
  const argument = argv[index];
  const prefix = `${name}=`;
  if (argument.startsWith(prefix)) {
    return { value: argument.slice(prefix.length), consumed: 0 };
  }
  if (argument === name) {
    const following = argv[index + 1];
    if (!following || following.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    return { value: following, consumed: 1 };
  }
  return null;
}

export function parseCliArgs(argv = []) {
  const options = {
    guru: "",
    expectations: "",
    exposureLimit: bootstrapExposureQuarters,
    reason: "catalog-bootstrap",
    help: false
  };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    let parsed = optionValue(argv, index, "--guru");
    if (parsed) {
      if (seen.has("guru")) throw new Error("--guru may be supplied only once.");
      seen.add("guru");
      options.guru = parsed.value;
      index += parsed.consumed;
      continue;
    }
    parsed = optionValue(argv, index, "--expectations");
    if (parsed) {
      if (seen.has("expectations")) {
        throw new Error("--expectations may be supplied only once.");
      }
      seen.add("expectations");
      options.expectations = parsed.value;
      index += parsed.consumed;
      continue;
    }
    parsed = optionValue(argv, index, "--exposure-limit");
    if (parsed) {
      if (seen.has("exposure-limit")) {
        throw new Error("--exposure-limit may be supplied only once.");
      }
      seen.add("exposure-limit");
      options.exposureLimit = Number(parsed.value);
      index += parsed.consumed;
      continue;
    }
    parsed = optionValue(argv, index, "--reason");
    if (parsed) {
      if (seen.has("reason")) throw new Error("--reason may be supplied only once.");
      seen.add("reason");
      options.reason = parsed.value;
      index += parsed.consumed;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (options.help) return options;
  if (!String(options.guru || "").trim()) {
    throw new Error("--guru must explicitly list the managers to bootstrap.");
  }
  if (!String(options.expectations || "").trim()) {
    throw new Error("--expectations must identify an expectations JSON file.");
  }
  if (options.exposureLimit !== bootstrapExposureQuarters) {
    throw new Error(
      `--exposure-limit must remain ${bootstrapExposureQuarters} for a complete catalog bootstrap.`
    );
  }
  options.reason = validatedReason(options.reason);
  return options;
}

function normalizedGuruId(value) {
  return String(value || "").trim();
}

function uniqueConfiguredGurus(configuredGurus) {
  if (!Array.isArray(configuredGurus) || !configuredGurus.length) {
    throw new Error("Configured Guru catalog is missing.");
  }
  const byId = new Map();
  for (const guru of configuredGurus) {
    const id = normalizedGuruId(guru?.id);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`Configured Guru has an invalid id: ${id || "<empty>"}.`);
    }
    if (byId.has(id)) throw new Error(`Configured Guru id is duplicated: ${id}.`);
    byId.set(id, guru);
  }
  return byId;
}

export function normalizeSelectedGuruIds(value, configuredGurus) {
  const configuredById = uniqueConfiguredGurus(configuredGurus);
  const ids = String(value || "")
    .split(",")
    .map(normalizedGuruId)
    .filter(Boolean);
  if (!ids.length) throw new Error("The explicit --guru list is empty.");
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`The explicit --guru list duplicates ${id}.`);
    seen.add(id);
    const guru = configuredById.get(id);
    if (!guru) throw new Error(`The explicit --guru list contains unknown manager ${id}.`);
    if (guru.type !== "manager13f" || guru.disableSimulation) {
      throw new Error(`${id} is not an enabled manager-13F profile.`);
    }
  }
  return ids;
}

function normalizedRequiredWindows(requiredWindows) {
  const windows = (requiredWindows || []).map(Number);
  if (!windows.length || windows.some((years) => !Number.isInteger(years) || years < 1)) {
    throw new Error("Required Guru curve windows are invalid or missing.");
  }
  const unique = [...new Set(windows)].sort((left, right) => left - right);
  if (unique.length !== windows.length) {
    throw new Error("Required Guru curve windows contain duplicates.");
  }
  return unique;
}

function expectationSource(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Expectations JSON must contain an object.");
  }
  if (Object.hasOwn(payload, "refreshGuruIds")) {
    throw new Error("Legacy refreshGuruIds is not accepted; expectedStatus is required per window.");
  }
  const hasTargets = Object.hasOwn(payload, "refreshTargets");
  const hasRefreshes = Object.hasOwn(payload, "refreshes");
  if (hasTargets === hasRefreshes) {
    throw new Error(
      "Expectations JSON must contain exactly one of refreshTargets or refreshes."
    );
  }
  if (hasTargets) {
    if (!Array.isArray(payload.refreshTargets)) {
      throw new Error("Artifact refreshTargets must be an array.");
    }
    if (payload.schemaVersion !== 1 || payload.kind !== artifactKind) {
      throw new Error("refreshTargets must come from a schemaVersion 1 Guru price-repair artifact.");
    }
    return { kind: "artifact", targets: payload.refreshTargets };
  }
  if (!Array.isArray(payload.refreshes)) {
    throw new Error("Install-report or production-prewarm refreshes must be an array.");
  }
  if (payload.kind === prewarmReportKind) {
    if (payload.schemaVersion !== 1 || payload.pass !== true) {
      throw new Error(
        "Production-prewarm expectations require schemaVersion=1 and pass=true."
      );
    }
    return { kind: "prewarm_report", targets: payload.refreshes };
  }
  if (payload.status !== "installed" || payload.pass !== true) {
    throw new Error("Install-report expectations require status=installed and pass=true.");
  }
  return { kind: "install_report", targets: payload.refreshes };
}

function assertExpectationIdentities(expectations, runtime) {
  const expectedCurveRows = Number(runtime.expectedCurveRows);
  if (!expectations || typeof expectations !== "object" ||
      expectations.strictMethodVersion !== runtime.strictMethodVersion ||
      expectations.proxyMethodVersion !== runtime.proxyMethodVersion ||
      expectations.securityMasterVersion !== runtime.securityMasterVersion ||
      expectations.expectedDisplayableRows !== expectedCurveRows) {
    throw new Error(
      "Expectations do not match the current strict, proxy, security-master, or catalog identities."
    );
  }
}

export function loadExpectedRefreshTargets(
  payload,
  { selectedGuruIds, requiredWindows, runtime }
) {
  const source = expectationSource(payload);
  assertExpectationIdentities(payload.expectations, runtime);
  const configuredById = uniqueConfiguredGurus(runtime.configuredGurus);
  const selected = new Set(selectedGuruIds);
  const windows = normalizedRequiredWindows(requiredWindows);
  const expectedKeys = new Set(
    selectedGuruIds.flatMap((guruId) => windows.map((years) => `${guruId}:${years}`))
  );
  const seen = new Set();
  const targets = [];

  if (!source.targets.length) throw new Error("Expectations contain no refresh targets.");
  const installedAt = source.kind === "install_report"
    ? String(payload.installedAt || "").trim()
    : "";
  const installedAtMs = installedAt ? Date.parse(installedAt) : Number.NaN;
  if (source.kind === "install_report" &&
      (!validIsoTimestamp(installedAt) || installedAtMs > Date.now() + 5 * 60 * 1000)) {
    throw new Error("Install-report installedAt is invalid or in the future.");
  }
  const prewarmStartedAt = source.kind === "prewarm_report"
    ? String(payload.startedAt || "").trim()
    : "";
  const prewarmFinishedAt = source.kind === "prewarm_report"
    ? String(payload.finishedAt || "").trim()
    : "";
  const prewarmStartedAtMs = prewarmStartedAt ? Date.parse(prewarmStartedAt) : Number.NaN;
  const prewarmFinishedAtMs = prewarmFinishedAt ? Date.parse(prewarmFinishedAt) : Number.NaN;
  if (source.kind === "prewarm_report") {
    const availability = payload.curveAvailability;
    if (!validIsoTimestamp(prewarmStartedAt) || !validIsoTimestamp(prewarmFinishedAt) ||
        prewarmStartedAtMs > prewarmFinishedAtMs ||
        prewarmFinishedAtMs > Date.now() + 5 * 60 * 1000 ||
        Number(payload.healthHttpStatus) !== 200 || availability?.ok !== true ||
        Number(availability?.expectedRows) !== Number(runtime.expectedCurveRows) ||
        Number(availability?.displayable) !== Number(runtime.expectedCurveRows) ||
        Number(availability?.failures?.length || 0) !== 0 ||
        !/^[a-f0-9]{64}$/.test(String(payload.refreshGeneration || ""))) {
      throw new Error(
        "Production-prewarm expectations lack a complete, healthy, current-generation matrix."
      );
    }
  }
  for (const [index, raw] of source.targets.entries()) {
    const guruId = normalizedGuruId(raw?.guruId);
    const years = Number(raw?.years);
    const expectedStatus = String(raw?.expectedStatus || "").trim().toLowerCase();
    const key = `${guruId}:${years}`;
    const guru = configuredById.get(guruId);
    if (!guru || guru.type !== "manager13f" || guru.disableSimulation ||
        !windows.includes(years) || !allowedExpectedStatuses.has(expectedStatus)) {
      throw new Error(`Expectation target ${index} has an invalid manager/window/status contract.`);
    }
    if (seen.has(key)) throw new Error(`Duplicate expectation target: ${key}.`);
    seen.add(key);
    const evidenceGeneratedAt = ["install_report", "prewarm_report"].includes(source.kind)
      ? String(raw.generatedAt || "").trim()
      : "";
    if (source.kind === "install_report") {
      if (raw.pass !== true || raw.actualStatus !== expectedStatus ||
          raw.methodVersion !== runtime.strictMethodVersion ||
          raw.securityMasterVersion !== runtime.securityMasterVersion ||
          !validIsoTimestamp(evidenceGeneratedAt) ||
          Date.parse(evidenceGeneratedAt) < installedAtMs ||
          Date.parse(evidenceGeneratedAt) > Date.now() + 5 * 60 * 1000) {
        throw new Error(`Install-report target ${key} did not pass its exact expected identity.`);
      }
    }
    if (source.kind === "prewarm_report") {
      const expectedRefreshGeneration = `${payload.refreshGeneration}:${years}`;
      const readyWithoutProxyIdentity = expectedStatus === "ready" &&
        !String(raw.proxyMethodVersion || "").trim() &&
        !String(raw.proxySecurityMasterVersion || "").trim();
      const proxyIdentityMatches = expectedStatus === "proxy_ready" &&
        raw.proxyMethodVersion === runtime.proxyMethodVersion &&
        raw.proxySecurityMasterVersion === runtime.securityMasterVersion;
      if (raw.pass !== true || raw.actualStatus !== expectedStatus ||
          raw.guruType !== "manager13f" || raw.disabled !== false ||
          raw.methodVersion !== runtime.strictMethodVersion ||
          raw.securityMasterVersion !== runtime.securityMasterVersion ||
          raw.refreshGeneration !== expectedRefreshGeneration ||
          (!readyWithoutProxyIdentity && !proxyIdentityMatches) ||
          !validIsoTimestamp(evidenceGeneratedAt) ||
          Date.parse(evidenceGeneratedAt) < prewarmStartedAtMs ||
          Date.parse(evidenceGeneratedAt) > prewarmFinishedAtMs + 5 * 1000) {
        throw new Error(
          `Production-prewarm target ${key} did not pass its exact generation and identity.`
        );
      }
    }
    targets.push({
      guruId,
      years,
      expectedStatus,
      ...(evidenceGeneratedAt ? {
        evidenceGeneratedAt
      } : {}),
      ...(source.kind === "prewarm_report" ? { evidenceSource: source.kind } : {})
    });
  }

  if (source.kind === "prewarm_report") {
    const enabledManagerIds = [...configuredById.values()]
      .filter((guru) => guru.type === "manager13f" && !guru.disableSimulation)
      .map((guru) => guru.id);
    const completeKeys = new Set(
      enabledManagerIds.flatMap((guruId) => windows.map((years) => `${guruId}:${years}`))
    );
    const unexpected = [...seen].filter((key) => !completeKeys.has(key));
    const absent = [...completeKeys].filter((key) => !seen.has(key));
    if (targets.length !== Number(runtime.expectedCurveRows) ||
        seen.size !== completeKeys.size || unexpected.length || absent.length) {
      throw new Error(
        `Production-prewarm expectations must exactly cover the enabled-manager curve matrix; ` +
        `missing=${absent.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}.`
      );
    }
  }

  const windowsByGuru = new Map();
  for (const target of targets) {
    windowsByGuru.set(target.guruId, [
      ...(windowsByGuru.get(target.guruId) || []),
      target.years
    ]);
  }
  for (const [guruId, declared] of windowsByGuru) {
    const ordered = declared.sort((left, right) => left - right);
    if (ordered.length !== windows.length ||
        ordered.some((years, index) => years !== windows[index])) {
      throw new Error(
        `Expectation targets for ${guruId} must declare every required window exactly once.`
      );
    }
  }

  const missing = [...expectedKeys].filter((key) => !seen.has(key));
  if (missing.length) {
    throw new Error(
      `Expectations must cover every selected manager/window; missing=${missing.join(",")}.`
    );
  }

  const order = new Map(selectedGuruIds.map((guruId, index) => [guruId, index]));
  const selectedTargets = targets.filter((target) => selected.has(target.guruId));
  const ignoredTargets = targets.filter((target) => !selected.has(target.guruId));
  return {
    sourceKind: source.kind,
    allTargets: targets,
    targets: selectedTargets.sort((left, right) =>
      order.get(left.guruId) - order.get(right.guruId) || left.years - right.years
    ),
    ignoredTargets: ignoredTargets.sort((left, right) =>
      left.guruId.localeCompare(right.guruId) || left.years - right.years
    )
  };
}

function validIsoTimestamp(value) {
  const text = String(value || "");
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === text;
}

function timestampWithinRun(value, notBefore, notAfter) {
  if (!validIsoTimestamp(value) || !validIsoTimestamp(notBefore) ||
      !validIsoTimestamp(notAfter)) return false;
  const timestamp = Date.parse(value);
  return timestamp >= Date.parse(notBefore) &&
    timestamp <= Date.parse(notAfter) + 5 * 1000;
}

function validDate(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function validUnitInterval(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1;
}

function normalizedCik(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(10, "0") : "";
}

function expectedReportingCiks(guru) {
  return [...new Set([guru.cik, ...(guru.alternateCiks || [])]
    .map(normalizedCik)
    .filter(Boolean))].sort();
}

function assertReportingCiks(actual, guru, label) {
  const expected = expectedReportingCiks(guru);
  const normalized = [...new Set((Array.isArray(actual) ? actual : [])
    .map(normalizedCik)
    .filter(Boolean))].sort();
  if (normalized.length !== expected.length ||
      normalized.some((cik, index) => cik !== expected[index])) {
    throw new Error(
      `${label} for ${guru.id} does not cover the configured primary/alternate CIK set.`
    );
  }
}

function cloneWithoutTransportState(payload) {
  const clone = structuredClone(payload);
  delete clone.cache;
  delete clone.dataStatus;
  return clone;
}

export function validateGuruSnapshot(payload, guru, avatarUrl, runWindow = null) {
  const label = `Staged snapshot for ${guru.id}`;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} is missing.`);
  }
  if (payload.dataStatus || ["error", "rate_limited", "local_missing", "missing"].includes(payload.status)) {
    throw new Error(`${label} contains a failed or fallback SEC result.`);
  }
  if (payload.id !== guru.id || payload.type !== "manager13f" || payload.status !== "live" ||
      normalizedCik(payload.cik) !== normalizedCik(guru.cik)) {
    throw new Error(`${label} has an incompatible identity or status.`);
  }
  if (payload.avatarUrl !== avatarUrl) {
    throw new Error(`${label} does not expose the canonical avatar URL.`);
  }
  if (!validIsoTimestamp(payload.generatedAt) ||
      (runWindow && !timestampWithinRun(
        payload.generatedAt,
        runWindow.startedAt,
        runWindow.observedAt
      )) ||
      !validDate(payload.summary?.reportDate) ||
      !validDate(payload.summary?.filingDate) ||
      payload.summary.filingDate < payload.summary.reportDate) {
    throw new Error(`${label} has invalid generation, report, or filing dates.`);
  }
  if (!payload.latestFiling || !payload.previousFiling ||
      !validDate(payload.summary?.previousReportDate) ||
      payload.latestFiling.reportDate !== payload.summary.reportDate ||
      payload.latestFiling.filingDate !== payload.summary.filingDate ||
      !String(payload.latestFiling.accessionNumber || "").trim() ||
      payload.previousFiling.reportDate !== payload.summary.previousReportDate) {
    throw new Error(`${label} lacks a prior quarter required for holdings changes.`);
  }
  if (!Array.isArray(payload.holdings) || !payload.holdings.length ||
      !Number.isFinite(Number(payload.summary?.totalValue)) || Number(payload.summary.totalValue) <= 0 ||
      !Number.isInteger(Number(payload.summary?.totalPositions)) ||
      Number(payload.summary.totalPositions) < payload.holdings.length) {
    throw new Error(`${label} lacks a valid latest common-long holdings book.`);
  }
  if (!validUnitInterval(payload.summary?.top10Weight) ||
      !validUnitInterval(payload.summary?.topHoldingWeight) ||
      !validUnitInterval(payload.summary?.concentrationHhi)) {
    throw new Error(`${label} lacks valid concentration analytics.`);
  }
  if (payload.holdings.some((holding) =>
    (!holding?.ticker && !holding?.issuer) || !Number.isFinite(Number(holding?.value)) ||
    Number(holding.value) <= 0
  )) {
    throw new Error(`${label} contains an invalid common-long holding.`);
  }
  if (!Array.isArray(payload.activity)) {
    throw new Error(`${label} lacks its quarter-over-quarter changes array.`);
  }
  if ((payload.dataQuality?.blockedReportDates || []).length) {
    throw new Error(`${label} contains blocked SEC report dates.`);
  }
  assertReportingCiks(payload.dataQuality?.reportingCiks, guru, label);
  return cloneWithoutTransportState(payload);
}

export function validateGuruExposure(payload, guru, snapshot, limit, runWindow = null) {
  const label = `Staged exposure for ${guru.id}`;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      payload.status !== "live" || payload.guru?.id !== guru.id ||
      payload.guru?.type !== "manager13f" ||
      normalizedCik(payload.guru?.cik) !== normalizedCik(guru.cik) ||
      !validIsoTimestamp(payload.generatedAt) ||
      (runWindow && !timestampWithinRun(
        payload.generatedAt,
        runWindow.startedAt,
        runWindow.observedAt
      ))) {
    throw new Error(`${label} has an incompatible identity or status.`);
  }
  const history = payload.history;
  if (!Array.isArray(history) || history.length < 2 || history.length > limit ||
      Number(payload.meta?.requestedQuarters) !== limit ||
      Number(payload.meta?.returnedQuarters) !== history.length) {
    throw new Error(`${label} does not contain the requested ${limit}-quarter history capacity.`);
  }
  if ((payload.meta?.errors || []).length || (payload.meta?.blockedReportDates || []).length) {
    throw new Error(`${label} contains SEC filing failures or blocked report dates.`);
  }
  assertReportingCiks(payload.meta?.reportingCiks, guru, label);
  let previousDate = "";
  for (const [index, quarter] of history.entries()) {
    const reportDate = String(quarter?.reportDate || "");
    if (!validDate(reportDate) || (previousDate && reportDate <= previousDate) ||
        !String(quarter?.quarterLabel || "").trim() ||
        !Number.isFinite(Number(quarter?.commonLongValue)) ||
        Number(quarter.commonLongValue) <= 0 ||
        !Number.isInteger(Number(quarter?.positionCount)) ||
        Number(quarter.positionCount) < quarter.topHoldings?.length ||
        !validUnitInterval(quarter?.top10Weight) ||
        !validUnitInterval(quarter?.topHoldingWeight) ||
        !validUnitInterval(quarter?.concentrationHhi) ||
        !Number.isFinite(Number(quarter?.turnoverProxy)) || Number(quarter.turnoverProxy) < 0 ||
        !Array.isArray(quarter?.topHoldings) || !quarter.topHoldings.length ||
        !Array.isArray(quarter?.largestChanges)) {
      throw new Error(`${label} contains an invalid or duplicate quarter at index ${index}.`);
    }
    previousDate = reportDate;
  }
  const latestDate = history.at(-1)?.reportDate;
  if (payload.latest?.reportDate !== latestDate ||
      latestDate !== snapshot.summary?.reportDate ||
      payload.latest?.filingDate !== snapshot.summary?.filingDate ||
      payload.latest?.accessionNumber !== snapshot.latestFiling?.accessionNumber ||
      Number(payload.latest?.positionCount) !== Number(snapshot.summary?.totalPositions) ||
      Number(payload.latest?.commonLongValue) !== Number(snapshot.summary?.totalValue)) {
    throw new Error(`${label} does not reconcile to the staged latest holdings quarter.`);
  }
  return cloneWithoutTransportState(payload);
}

function configuredMetadata(guru, avatarUrl) {
  return {
    id: guru.id,
    name: guru.name,
    chineseName: guru.chineseName,
    entityName: guru.entityName,
    cik: guru.cik || "",
    ...(Array.isArray(guru.alternateCiks)
      ? { alternateCiks: [...guru.alternateCiks] }
      : {}),
    type: guru.type,
    role: guru.role,
    focusTicker: guru.focusTicker || "",
    focusIssuer: guru.focusIssuer || "",
    thesisTag: guru.thesisTag,
    notes: [...(guru.notes || [])],
    ...(Object.hasOwn(guru, "preferLatestNonZero13f")
      ? { preferLatestNonZero13f: Boolean(guru.preferLatestNonZero13f) }
      : {}),
    ...(Object.hasOwn(guru, "disableSimulation")
      ? { disableSimulation: Boolean(guru.disableSimulation) }
      : {}),
    ...(guru.simulationNote ? { simulationNote: guru.simulationNote } : {}),
    ...(guru.sourceLabel ? { sourceLabel: guru.sourceLabel } : {}),
    ...(guru.profileUrl ? { profileUrl: guru.profileUrl } : {}),
    excludeFromHeatmap: Boolean(guru.excludeFromHeatmap),
    heatmapExclusionReason: guru.heatmapExclusionReason || "",
    avatarUrl
  };
}

export function buildExactDashboard({
  baseline,
  stagedSnapshots,
  configuredGurus,
  selectedGuruIds,
  expectedDashboardCount,
  avatarUrlForGuru,
  now,
  exposureLimit,
  requiredWindows,
  expectationSourceKind
}) {
  const configuredById = uniqueConfiguredGurus(configuredGurus);
  if (configuredById.size !== expectedDashboardCount ||
      configuredGurus.length !== expectedDashboardCount) {
    throw new Error(
      `Configured catalog must contain exactly ${expectedDashboardCount} unique profiles.`
    );
  }
  if (!baseline || !Array.isArray(baseline.gurus)) {
    throw new Error("Current dashboard snapshot is missing.");
  }
  const selected = new Set(selectedGuruIds);
  const baselineById = new Map();
  for (const row of baseline.gurus) {
    const id = normalizedGuruId(row?.id);
    if (!configuredById.has(id)) throw new Error(`Current dashboard contains unknown profile ${id}.`);
    if (selected.has(id)) {
      throw new Error(`Bootstrap target ${id} already exists in the current dashboard.`);
    }
    if (baselineById.has(id)) throw new Error(`Current dashboard duplicates profile ${id}.`);
    baselineById.set(id, row);
  }
  const requiredBaselineIds = [...configuredById.keys()].filter((id) => !selected.has(id));
  const missingBaseline = requiredBaselineIds.filter((id) => !baselineById.has(id));
  if (baselineById.size !== requiredBaselineIds.length || missingBaseline.length) {
    throw new Error(
      `Current dashboard must exactly equal the non-selected catalog; missing=${missingBaseline.join(",") || "none"}.`
    );
  }

  const stagedById = new Map();
  for (const item of stagedSnapshots || []) {
    const guruId = normalizedGuruId(item?.guruId);
    if (!selected.has(guruId) || item?.payload?.id !== guruId) {
      throw new Error(`Staged dashboard snapshot has an invalid key: ${guruId || "<empty>"}.`);
    }
    if (stagedById.has(guruId)) throw new Error(`Staged dashboard duplicates ${guruId}.`);
    stagedById.set(guruId, item.payload);
  }
  const missingStaged = selectedGuruIds.filter((id) => !stagedById.has(id));
  if (stagedById.size !== selected.size || missingStaged.length) {
    throw new Error(`Staged dashboard snapshots are incomplete: ${missingStaged.join(",")}.`);
  }

  const gurus = configuredGurus.map((configured) => {
    const source = stagedById.get(configured.id) || baselineById.get(configured.id);
    const clean = cloneWithoutTransportState(source);
    const avatarUrl = String(avatarUrlForGuru(configured.id) || "").trim();
    if (!avatarUrl) throw new Error(`Canonical avatar URL is missing for ${configured.id}.`);
    return {
      ...clean,
      ...configuredMetadata(configured, avatarUrl)
    };
  });
  const uniqueIds = new Set(gurus.map((guru) => guru.id));
  if (gurus.length !== expectedDashboardCount || uniqueIds.size !== expectedDashboardCount) {
    throw new Error("Constructed dashboard does not exactly match the configured catalog.");
  }
  return {
    ...structuredClone(baseline),
    generatedAt: now(),
    gurus,
    catalogBootstrap: {
      mode: "atomic_explicit_manager13f",
      selectedGuruIds: [...selectedGuruIds],
      dashboardProfiles: gurus.length,
      exposureQuarters: exposureLimit,
      curveWindows: [...requiredWindows],
      expectationSource: expectationSourceKind
    }
  };
}

function assertCurveCommon(payload, target, runtime, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} is missing.`);
  }
  if (payload.guru?.id !== target.guruId || payload.guru?.type !== "manager13f" ||
      String(payload.method?.years) !== String(target.years) ||
      payload.method?.version !== runtime.strictMethodVersion ||
      payload.method?.securityMasterVersion !== runtime.securityMasterVersion ||
      !validIsoTimestamp(payload.generatedAt)) {
    throw new Error(`${label} has an incompatible Guru, window, method, or security-master identity.`);
  }
}

function usesSyntheticPrice(value, visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return false;
  visited.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "syntheticPriceUsed" && child === true) return true;
    if (usesSyntheticPrice(child, visited)) return true;
  }
  return false;
}

function usesForbiddenPriceFallback(value, visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return false;
  visited.add(value);
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (child === true && (
      normalizedKey.includes("forwardfill") ||
      normalizedKey.includes("syntheticprice") ||
      normalizedKey.includes("zeroreturnsubstitution")
    )) return true;
    if (usesForbiddenPriceFallback(child, visited)) return true;
  }
  return false;
}

function validMissingActivePriceFailure(strictPayload) {
  const failure = strictPayload?.dataQuality?.failure;
  if (strictPayload?.dataQuality?.failurePolicy !==
      "fail_closed_without_zero_return_or_forward_fill" ||
      failure?.code !== "missing_active_price" ||
      failure?.policy !== "fail_closed_without_zero_return_or_forward_fill" ||
      !validDate(failure?.date) || !validDate(failure?.lastCompleteDate) ||
      failure.lastCompleteDate >= failure.date ||
      failure.date < strictPayload?.window?.start ||
      failure.date > strictPayload?.window?.end) {
    return false;
  }
  const tickers = Array.isArray(failure.tickers) ? failure.tickers : [];
  const tickerSet = new Set(tickers);
  const missingWeight = Number(failure.missingWeight);
  const details = Array.isArray(failure.details) ? failure.details : [];
  if (!tickers.length || tickerSet.size !== tickers.length ||
      tickers.some((ticker) => !/^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(ticker)) ||
      !Number.isFinite(missingWeight) || missingWeight <= 0 || missingWeight > 1 ||
      !details.length) {
    return false;
  }
  let detailWeight = 0;
  const detailTickers = new Set();
  for (const detail of details) {
    const ticker = String(detail?.ticker || "").trim();
    const weight = Number(detail?.weight);
    const priceSymbol = detail?.priceSymbol == null
      ? ""
      : String(detail.priceSymbol).trim();
    if (!tickerSet.has(ticker) || detailTickers.has(ticker) ||
        !Number.isFinite(weight) || weight <= 0 || weight > 1 ||
        (priceSymbol && !/^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(priceSymbol))) {
      return false;
    }
    detailTickers.add(ticker);
    detailWeight += weight;
  }
  return detailTickers.size === tickerSet.size &&
    tickers.every((ticker) => detailTickers.has(ticker)) &&
    Math.abs(detailWeight - missingWeight) <= 1e-9 &&
    !usesForbiddenPriceFallback(failure);
}

function proxyStrictFailureMatchesMissingPrice(proxyPayload, strictFailure) {
  const proxyFailure = proxyPayload?.dataQuality?.strictFailure;
  const proxyTickers = Array.isArray(proxyFailure?.tickers) ? proxyFailure.tickers : [];
  return proxyFailure?.code === "missing_active_price" &&
    proxyFailure?.date === strictFailure.date &&
    Number(proxyFailure?.missingWeight) === Number(strictFailure.missingWeight) &&
    proxyTickers.length === strictFailure.tickers.length &&
    proxyTickers.every((ticker, index) => ticker === strictFailure.tickers[index]);
}

function assertDisplayableCurve(payload, target, label) {
  if (!Array.isArray(payload.equity) || payload.equity.length < 2 ||
      !Array.isArray(payload.quarterContributions) || !payload.quarterContributions.length ||
      payload.quarterContributions.some((quarter) => !Array.isArray(quarter?.contributions))) {
    throw new Error(`${label} lacks displayable equity or quarter-attribution detail.`);
  }
  if (!payload.window || !validDate(payload.window.start) || !validDate(payload.window.end) ||
      payload.window.start >= payload.window.end) {
    throw new Error(`${label} has an invalid ${target.years}Y window.`);
  }
}

export function validateCurveTarget(target, strictPayload, proxyPayload, runtime) {
  const key = `${target.guruId}:${target.years}`;
  assertCurveCommon(strictPayload, target, runtime, `Strict curve ${key}`);
  if (usesSyntheticPrice(strictPayload) || usesSyntheticPrice(proxyPayload) ||
      usesForbiddenPriceFallback(strictPayload) ||
      usesForbiddenPriceFallback(proxyPayload)) {
    throw new Error(
      `Curve ${key} contains synthetic-price usage or a forward-filled price fallback.`
    );
  }
  if (target.evidenceGeneratedAt && strictPayload.generatedAt !== target.evidenceGeneratedAt) {
    const evidenceLabel = target.evidenceSource === "prewarm_report"
      ? "production-prewarm"
      : "install-report";
    throw new Error(`Curve ${key} does not match the successful ${evidenceLabel} generation.`);
  }

  if (target.expectedStatus === "ready") {
    if (strictPayload.status !== "ready") {
      throw new Error(`Curve ${key} expected ready but strict status is ${strictPayload.status || "missing"}.`);
    }
    const audit = runtime.auditStrict(strictPayload);
    if (!audit?.ok) throw new Error(`Strict curve ${key} failed audit: ${audit?.reason || "unknown"}.`);
    assertDisplayableCurve(strictPayload, target, `Strict curve ${key}`);
    const selected = runtime.selectManagerBacktestCache(strictPayload, proxyPayload, target.years);
    if (selected?.kind !== "strict" || selected.payload !== strictPayload) {
      throw new Error(`Strict curve ${key} is not the current public cache selection.`);
    }
    return { strict: strictPayload, proxy: null, displayed: strictPayload };
  }

  if (strictPayload.status !== "insufficient_data") {
    throw new Error(
      `Curve ${key} expected proxy_ready but strict status is ${strictPayload.status || "missing"}.`
    );
  }
  const strictFailurePolicy = String(strictPayload.dataQuality?.failurePolicy || "");
  const declaredStrictCoverage = Number(strictPayload.method?.minimumExecutionCoverage);
  const coverageFailures = Array.isArray(strictPayload.dataQuality?.coverageFailures)
    ? strictPayload.dataQuality.coverageFailures
    : [];
  const hasCoverageFailureEvidence = coverageFailures.length > 0 &&
    coverageFailures.every((failure) => {
      const coverage = Number(failure?.coveragePct);
      return validDate(failure?.reportDate) && validDate(failure?.executionDate) &&
        Number.isFinite(coverage) && coverage >= 0 &&
        coverage < declaredStrictCoverage &&
        Array.isArray(failure?.unpricedPositions) &&
        failure.unpricedPositions.length > 0;
    });
  const hasMissingPriceFailure = validMissingActivePriceFailure(strictPayload);
  const strictFailureCode = hasCoverageFailureEvidence
    ? "execution_coverage_below_minimum"
    : hasMissingPriceFailure
      ? "missing_active_price"
      : "";
  const recognizedFailurePolicy = hasCoverageFailureEvidence
    ? strictFailurePolicy.startsWith("fail_closed")
    : hasMissingPriceFailure;
  const strictCoverageContractValid = hasCoverageFailureEvidence
    ? Number.isFinite(declaredStrictCoverage) &&
      declaredStrictCoverage >= runtime.minimumStrictCoverage
    : hasMissingPriceFailure && (
      !Number.isFinite(declaredStrictCoverage) ||
      declaredStrictCoverage >= runtime.minimumStrictCoverage
    );
  if (!recognizedFailurePolicy || !strictFailureCode ||
      !strictCoverageContractValid ||
      !Array.isArray(strictPayload.equity) || strictPayload.equity.length ||
      !Array.isArray(strictPayload.rebalances) || strictPayload.rebalances.length ||
      !Array.isArray(strictPayload.quarterContributions) ||
      strictPayload.quarterContributions.length) {
    throw new Error(`Strict failure ${key} is not a complete fail-closed artifact.`);
  }
  assertCurveCommon(proxyPayload, target, runtime, `Proxy curve ${key}`);
  const proxyStrictCoverage = Number(
    proxyPayload?.dataQuality?.strictMinimumExecutionCoverage
  );
  if (proxyPayload.status !== "proxy_ready" ||
      proxyPayload.method?.variant !== runtime.proxyMethodVersion ||
      proxyPayload.proxy?.kind !== "public_holdings_proxy" ||
      proxyPayload.proxy?.methodVersion !== runtime.proxyMethodVersion ||
      proxyPayload.proxy?.securityMasterVersion !== runtime.securityMasterVersion ||
      proxyPayload.dataQuality?.strictBacktestStatus !== "insufficient_data" ||
      !strictFailureCode ||
      proxyPayload.dataQuality?.strictFailureCode !== strictFailureCode ||
      (strictFailureCode === "missing_active_price" &&
        !proxyStrictFailureMatchesMissingPrice(
          proxyPayload,
          strictPayload.dataQuality.failure
        )) ||
      !Number.isFinite(proxyStrictCoverage) ||
      proxyStrictCoverage < runtime.minimumStrictCoverage ||
      proxyPayload.generatedAt !== strictPayload.generatedAt ||
      proxyPayload.proxy?.strictFailureGeneratedAt !== strictPayload.generatedAt) {
    throw new Error(`Proxy curve ${key} has an invalid status, method variant, or strict linkage.`);
  }
  const audit = runtime.auditProxy(proxyPayload);
  if (!audit?.ok) throw new Error(`Proxy curve ${key} failed audit: ${audit?.reason || "unknown"}.`);
  assertDisplayableCurve(proxyPayload, target, `Proxy curve ${key}`);
  const selected = runtime.selectManagerBacktestCache(strictPayload, proxyPayload, target.years);
  if (selected?.kind !== "proxy" || selected.payload !== proxyPayload) {
    throw new Error(`Proxy curve ${key} is not the current public cache selection.`);
  }
  return { strict: strictPayload, proxy: proxyPayload, displayed: proxyPayload };
}

function readAndValidateCurves(targets, runtime) {
  const backtests = [];
  const backtestProxies = [];
  for (const target of targets) {
    const strict = runtime.readGuruBacktest(target.guruId, target.years);
    const proxy = runtime.readGuruBacktestProxy(target.guruId, target.years);
    const validated = validateCurveTarget(target, strict, proxy, runtime);
    backtests.push({ guruId: target.guruId, years: target.years, payload: validated.strict });
    if (validated.proxy) {
      backtestProxies.push({
        guruId: target.guruId,
        years: target.years,
        payload: validated.proxy
      });
    }
  }
  return { backtests, backtestProxies };
}

function databaseVersions(runtime, requiredWindows) {
  return {
    dashboard: runtime.readGuruDashboardVersion(),
    exposure: runtime.readGuruExposureVersion(),
    curves: Object.fromEntries(
      requiredWindows.map((years) => [years, runtime.readGuruBacktestVersion(years)])
    )
  };
}

function assertFullCurveMatrix(runtime, requiredWindows) {
  const managers = runtime.configuredGurus.filter((guru) =>
    guru.type === "manager13f" && !guru.disableSimulation
  );
  const summary = runtime.summarizeCurveAvailability({
    managers,
    windows: requiredWindows,
    readStrict: runtime.readGuruBacktest,
    readProxy: runtime.readGuruBacktestProxy,
    now: Date.parse(runtime.now())
  });
  const summaryWindows = Array.isArray(summary?.windows)
    ? summary.windows.map(Number).sort((left, right) => left - right)
    : [];
  if (!summary?.ok || summary.managerCount !== managers.length ||
      summaryWindows.length !== requiredWindows.length ||
      summaryWindows.some((years, index) => years !== requiredWindows[index]) ||
      summary.expectedRows !== runtime.expectedCurveRows ||
      summary.displayable !== runtime.expectedCurveRows ||
      summary.methodVersion !== runtime.strictMethodVersion ||
      summary.proxyMethodVersion !== runtime.proxyMethodVersion ||
      summary.securityMasterVersion !== runtime.securityMasterVersion) {
    const failureKeys = (summary?.failures || [])
      .slice(0, 8)
      .map((row) => `${row.guruId}:${row.years}:${row.reason || "failure"}`)
      .join(",");
    throw new Error(
      `The complete enabled-manager curve matrix is not current and displayable ` +
      `(${summary?.displayable || 0}/${runtime.expectedCurveRows}); failures=${failureKeys || "unknown"}.`
    );
  }
  return summary;
}

function assertVersionsUnchanged(before, after) {
  if (before.dashboard !== after.dashboard) {
    throw new Error("Guru dashboard changed while SEC data was staged; retry from a fresh baseline.");
  }
  if (before.exposure !== after.exposure) {
    throw new Error("Guru exposure history changed while SEC data was staged; retry safely.");
  }
  for (const [years, version] of Object.entries(before.curves)) {
    if (after.curves[years] !== version) {
      throw new Error(`${years}Y Guru curves changed while SEC data was staged; retry safely.`);
    }
  }
}

function assertRuntime(runtime) {
  const requiredFunctions = [
    "avatarUrlForGuru",
    "readDashboardSnapshot",
    "readGuruDashboardVersion",
    "readGuruExposureVersion",
    "readGuruBacktest",
    "readGuruBacktestProxy",
    "readGuruBacktestVersion",
    "refreshGuruSnapshot",
    "refreshGuruExposureSnapshot",
    "selectManagerBacktestCache",
    "summarizeCurveAvailability",
    "auditStrict",
    "auditProxy",
    "writeGuru13fRefreshBundle",
    "now"
  ];
  for (const name of requiredFunctions) {
    if (typeof runtime?.[name] !== "function") {
      throw new Error(`Bootstrap runtime dependency ${name} is missing.`);
    }
  }
}

export async function bootstrapGuruCatalog(options, runtime) {
  assertRuntime(runtime);
  const configuredGurus = runtime.configuredGurus;
  const configuredById = uniqueConfiguredGurus(configuredGurus);
  const expectedDashboardCount = Number(runtime.expectedDashboardCount);
  if (!Number.isInteger(expectedDashboardCount) || expectedDashboardCount < 1 ||
      configuredById.size !== expectedDashboardCount) {
    throw new Error("Configured catalog size does not match the bootstrap dashboard contract.");
  }
  const requiredWindows = normalizedRequiredWindows(runtime.requiredWindows);
  const enabledManagerCount = configuredGurus.filter((guru) =>
    guru.type === "manager13f" && !guru.disableSimulation
  ).length;
  if (!Number.isInteger(Number(runtime.expectedCurveRows)) ||
      Number(runtime.expectedCurveRows) !== enabledManagerCount * requiredWindows.length) {
    throw new Error(
      "Configured enabled-manager count, curve windows, and expected row count are inconsistent."
    );
  }
  if (!Number.isFinite(Number(runtime.minimumStrictCoverage)) ||
      Number(runtime.minimumStrictCoverage) < 0.9 ||
      Number(runtime.minimumStrictCoverage) > 1) {
    throw new Error("Bootstrap runtime must preserve the >=90% strict execution-coverage gate.");
  }
  const selectedGuruIds = normalizeSelectedGuruIds(options.guru, configuredGurus);
  if (Number(options.exposureLimit) !== bootstrapExposureQuarters) {
    throw new Error(`Catalog bootstrap requires ${bootstrapExposureQuarters} exposure quarters.`);
  }
  const reason = validatedReason(options.reason);

  const expectationDocument = options.expectationDocument;
  const expected = loadExpectedRefreshTargets(expectationDocument, {
    selectedGuruIds,
    requiredWindows,
    runtime
  });
  const baseline = runtime.readDashboardSnapshot();
  // Validate the old catalog before making any SEC request.
  buildExactDashboard({
    baseline,
    stagedSnapshots: selectedGuruIds.map((guruId) => ({
      guruId,
      payload: { id: guruId }
    })),
    configuredGurus,
    selectedGuruIds,
    expectedDashboardCount,
    avatarUrlForGuru: runtime.avatarUrlForGuru,
    now: runtime.now,
    exposureLimit: options.exposureLimit,
    requiredWindows,
    expectationSourceKind: expected.sourceKind
  });

  // Curves are existing, audited inputs. A first read avoids expensive SEC work
  // when the expectation matrix or local curve generation is incomplete.
  readAndValidateCurves(expected.allTargets, runtime);
  assertFullCurveMatrix(runtime, requiredWindows);
  const versionsBefore = databaseVersions(runtime, requiredWindows);

  const guruSnapshots = [];
  const exposureSnapshots = [];
  const startedAt = runtime.now();
  for (const guruId of selectedGuruIds) {
    const guru = configuredById.get(guruId);
    const avatarUrl = runtime.avatarUrlForGuru(guruId);
    if (!avatarUrl) throw new Error(`Canonical avatar URL is missing for ${guruId}.`);
    const rawSnapshot = await runtime.refreshGuruSnapshot(guruId, { persist: false });
    const snapshot = validateGuruSnapshot(rawSnapshot, guru, avatarUrl, {
      startedAt,
      observedAt: runtime.now()
    });
    const rawExposure = await runtime.refreshGuruExposureSnapshot(guruId, {
      limit: options.exposureLimit,
      reason,
      persist: false
    });
    const exposure = validateGuruExposure(rawExposure, guru, snapshot, options.exposureLimit, {
      startedAt,
      observedAt: runtime.now()
    });
    guruSnapshots.push({ guruId, payload: snapshot });
    exposureSnapshots.push({ guruId, payload: exposure });
  }

  const finalBaseline = runtime.readDashboardSnapshot();
  // Re-read after SEC staging so the single commit contains the final validated
  // generation and cannot silently reuse a curve changed during the run.
  const allCurveArtifacts = readAndValidateCurves(expected.allTargets, runtime);
  const selectedKeys = new Set(expected.targets.map(
    (target) => `${target.guruId}:${target.years}`
  ));
  const backtests = allCurveArtifacts.backtests.filter((item) =>
    selectedKeys.has(`${item.guruId}:${item.years}`)
  );
  const backtestProxies = allCurveArtifacts.backtestProxies.filter((item) =>
    selectedKeys.has(`${item.guruId}:${item.years}`)
  );
  const curveMatrix = assertFullCurveMatrix(runtime, requiredWindows);
  const versionsAfter = databaseVersions(runtime, requiredWindows);
  assertVersionsUnchanged(versionsBefore, versionsAfter);
  const dashboard = buildExactDashboard({
    baseline: finalBaseline,
    stagedSnapshots: guruSnapshots,
    configuredGurus,
    selectedGuruIds,
    expectedDashboardCount,
    avatarUrlForGuru: runtime.avatarUrlForGuru,
    now: runtime.now,
    exposureLimit: options.exposureLimit,
    requiredWindows,
    expectationSourceKind: expected.sourceKind
  });

  const commit = runtime.writeGuru13fRefreshBundle({
    dashboard,
    guruSnapshots,
    exposureSnapshots,
    backtests,
    backtestProxies,
    expectedState: {
      dashboardVersion: versionsAfter.dashboard,
      exposureVersion: versionsAfter.exposure,
      curveVersions: versionsAfter.curves,
      dashboardGuruIds: finalBaseline.gurus.map((guru) => guru.id),
      exactCatalogIds: configuredGurus.map((guru) => guru.id)
    }
  });
  return {
    status: "bootstrapped",
    selectedGuruIds,
    dashboardProfiles: dashboard.gurus.length,
    snapshots: guruSnapshots.length,
    exposures: exposureSnapshots.length,
    backtests: backtests.length,
    proxies: backtestProxies.length,
    curveMatrix: {
      managers: curveMatrix.managerCount,
      windows: curveMatrix.windows,
      displayable: curveMatrix.displayable,
      expectedRows: curveMatrix.expectedRows
    },
    expectationSource: expected.sourceKind,
    ignoredExpectationTargets: expected.ignoredTargets.map(
      ({ guruId, years, expectedStatus }) => ({ guruId, years, expectedStatus })
    ),
    commit
  };
}

function readJson(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error("--expectations must identify an existing JSON file.");
  }
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(`Expectations JSON is unreadable or invalid: ${error.message}`);
  }
}

function usage() {
  return [
    "Usage:",
    "  SQLITE_DB_PATH=/absolute/candidate.sqlite node scripts/bootstrap-guru-catalog.mjs \\",
    "    --guru=<comma-separated-manager-ids> \\",
    "    --expectations=/absolute/artifact-install-or-prewarm-report.json \\",
    `    --exposure-limit=${bootstrapExposureQuarters} --reason=catalog-bootstrap-candidate`,
    "",
    "The command stages SEC snapshots without persistence, reuses already-audited local curves,",
    "and writes the complete bundle once only after every validation succeeds."
  ].join("\n");
}

function explicitDatabasePath() {
  const configured = String(process.env.SQLITE_DB_PATH || "").trim();
  if (!configured || !path.isAbsolute(configured) ||
      !fs.existsSync(configured) || !fs.statSync(configured).isFile()) {
    throw new Error(
      "SQLITE_DB_PATH must explicitly identify an existing absolute candidate or production database."
    );
  }
  return fs.realpathSync(configured);
}

function assertProductionSecUserAgent() {
  const userAgent = String(process.env.SEC_USER_AGENT || "").trim();
  const hasContactEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(userAgent);
  if (!hasContactEmail || /@example\.(?:com|org|net)\b/i.test(userAgent)) {
    throw new Error(
      "SEC_USER_AGENT must identify the application and a real monitored contact email."
    );
  }
  return userAgent;
}

async function productionRuntime(expectedDatabasePath) {
  const [catalog, avatars, database, backtest, strictAudit, proxyAudit, sec, health] = await Promise.all([
    import("../server/gurus.js"),
    import("../server/guruAvatarCatalog.js"),
    import("../server/localDatabase.js"),
    import("../server/backtest.js"),
    import("../server/backtestStrictAudit.js"),
    import("../server/backtestProxyAudit.js"),
    import("../server/secClient.js"),
    import("../server/systemHealth.js")
  ]);
  if (fs.realpathSync(database.databaseInfo().path) !== expectedDatabasePath) {
    throw new Error("The opened SQLite database does not match the explicit SQLITE_DB_PATH.");
  }
  return {
    configuredGurus: catalog.gurus,
    requiredWindows: catalog.requiredGuruCurveWindows,
    expectedDashboardCount: catalog.gurus.length,
    expectedCurveRows: catalog.expectedGuruCurveRows,
    strictMethodVersion: backtest.manager13fBacktestMethodVersion,
    proxyMethodVersion: backtest.manager13fProxyMethodVersion,
    securityMasterVersion: backtest.manager13fSecurityMasterVersion,
    minimumStrictCoverage: strictAudit.minimumManager13fExecutionCoverage,
    avatarUrlForGuru: avatars.canonicalGuruAvatarUrl,
    readDashboardSnapshot: database.readDashboardSnapshot,
    readGuruDashboardVersion: database.readGuruDashboardVersion,
    readGuruExposureVersion: database.readGuruExposureVersion,
    readGuruBacktest: database.readGuruBacktest,
    readGuruBacktestProxy: database.readGuruBacktestProxy,
    readGuruBacktestVersion: database.readGuruBacktestVersion,
    refreshGuruSnapshot: sec.refreshGuruSnapshot,
    refreshGuruExposureSnapshot: sec.refreshGuruExposureSnapshot,
    selectManagerBacktestCache: backtest.selectManagerBacktestCache,
    summarizeCurveAvailability: health.summarizeGuruCurveAvailability,
    auditStrict: strictAudit.auditManager13fStrictReadyPayload,
    auditProxy: proxyAudit.auditPublicHoldingsProxyPayload,
    writeGuru13fRefreshBundle: database.writeGuru13fRefreshBundle,
    now: () => new Date().toISOString()
  };
}

export async function main(argv = process.argv.slice(2)) {
  process.umask(0o077);
  const parsed = parseCliArgs(argv);
  if (parsed.help) {
    console.log(usage());
    return null;
  }
  const expectationDocument = readJson(parsed.expectations);
  const databasePath = explicitDatabasePath();
  assertProductionSecUserAgent();
  // Importing localDatabase can optionally install bundled caches. A catalog
  // bootstrap must never do that outside its single explicit bundle commit.
  process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
  process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
  process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
  process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";
  const runtime = await productionRuntime(databasePath);
  const result = await bootstrapGuruCatalog({
    guru: parsed.guru,
    exposureLimit: parsed.exposureLimit,
    reason: parsed.reason,
    expectationDocument
  }, runtime);
  console.log(JSON.stringify(result));
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
