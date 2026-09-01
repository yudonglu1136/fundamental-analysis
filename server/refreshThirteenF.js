import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertGuruBacktestRefreshSucceeded,
  loadGuruBacktest
} from "./backtest.js";
import { gurus } from "./gurus.js";
import {
  readDashboardSnapshot,
  readGuruBacktest,
  readGuruExposureSnapshot,
  readGuruSnapshot,
  writeBackgroundJobRun,
  writeGuru13fRefreshBundle
} from "./localDatabase.js";
import {
  clearGuruDashboardMemoryCache,
  rebuildGuruDashboardSnapshotFromLocal,
  refreshGuruExposureSnapshot,
  refreshGuruSnapshot
} from "./secClient.js";

const jobId = "guru_13f_refresh";
const managerGurus = gurus.filter((guru) => guru.type === "manager13f");
let activeRefreshPromise = null;

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function normalizedBacktestYears(value) {
  const raw = String(value ?? 5).trim().toLowerCase() || "5";
  if (!raw || ["all", "max", "full", "history"].includes(raw)) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(40, Math.round(parsed))) : 5;
}

function withoutRuntimeDataStatus(guru) {
  if (!guru || typeof guru !== "object") return guru;
  const { dataStatus: _dataStatus, ...persisted } = guru;
  return persisted;
}

function usable13fSnapshot(payload) {
  return Boolean(
    payload &&
      !payload.dataStatus &&
      !["error", "rate_limited", "missing", "local_missing"].includes(payload.status) &&
      (payload.holdings?.length || payload.activity?.length)
  );
}

function normalizeRequestedIds(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

export async function runThirteenFRefresh({
  guruIds = [],
  reason = "manual-13f-update",
  years = 5,
  detail = "compact",
  exposureLimit = 40
} = {}) {
  const requestedIds = normalizeRequestedIds(guruIds);
  const selectedGurus = requestedIds.length
    ? requestedIds.map((id) => managerGurus.find((guru) => guru.id === id))
    : managerGurus;
  const missingIds = requestedIds.filter(
    (id) => !selectedGurus.some((guru) => guru?.id === id)
  );
  if (missingIds.length) {
    throw new Error(`Unknown 13F guru id(s): ${missingIds.join(", ")}`);
  }

  const normalizedReason =
    String(reason || "manual-13f-update").trim().slice(0, 120) ||
    "manual-13f-update";
  const normalizedYears = String(years || 5).trim() || "5";
  const requestedDetail = String(detail || "compact").trim().toLowerCase();
  const normalizedDetail = ["compact", "full", "attribution"].includes(requestedDetail)
    ? requestedDetail
    : "compact";
  const normalizedExposureLimit = Math.max(
    4,
    Math.min(40, Math.round(Number(exposureLimit) || 40))
  );
  const backtestYears = normalizedBacktestYears(normalizedYears);
  const startedAt = new Date().toISOString();
  const results = [];

  function recordJob(status, extra = {}) {
    writeBackgroundJobRun(jobId, {
      startedAt,
      finishedAt: status === "running" ? "" : new Date().toISOString(),
      status,
      payload: {
        reason: normalizedReason,
        years: normalizedYears,
        detail: normalizedDetail,
        exposureLimit: normalizedExposureLimit,
        selectedGuruIds: selectedGurus.map((guru) => guru.id),
        results,
        ...extra
      }
    });
  }

  recordJob("running");

  try {
    let dashboard;
    const refreshedById = new Map();
    const stagedGuruSnapshots = [];
    const stagedExposureSnapshots = [];
    const stagedBacktests = [];

    for (const guru of selectedGurus) {
      console.log(`[13f-refresh] ${guru.id}: refreshing latest snapshot`);
      const snapshot = await refreshGuruSnapshot(guru.id, { persist: false });
      if (!usable13fSnapshot(snapshot)) {
        throw new Error(
          `${guru.id} latest snapshot is not usable (${snapshot.status || "unknown"})`
        );
      }
      refreshedById.set(guru.id, snapshot);
      stagedGuruSnapshots.push({ guruId: guru.id, payload: snapshot });
    }

    const existingDashboard = readDashboardSnapshot();
    if (existingDashboard?.gurus?.length) {
      dashboard = existingDashboard;
    } else {
      console.log(
        "[13f-refresh] no dashboard snapshot found; rebuilding from local guru snapshots"
      );
      dashboard = await rebuildGuruDashboardSnapshotFromLocal({ persist: false });
    }

    if (!dashboard) {
      throw new Error("No local guru snapshots are available to rebuild the dashboard");
    }

    const mergedById = new Map((dashboard.gurus || []).map((guru) => [guru.id, guru]));
    for (const [id, snapshot] of refreshedById) mergedById.set(id, snapshot);
    dashboard = {
      ...dashboard,
      generatedAt: new Date().toISOString(),
      gurus: gurus
        .map((guru) => mergedById.get(guru.id))
        .filter(Boolean)
        .map(withoutRuntimeDataStatus)
    };

    const dashboardIds = new Set((dashboard.gurus || []).map((guru) => guru.id));
    const absentDashboardIds = gurus
      .map((guru) => guru.id)
      .filter((id) => !dashboardIds.has(id));
    if (absentDashboardIds.length) {
      throw new Error(
        `Dashboard snapshot is missing configured guru(s): ${absentDashboardIds.join(", ")}`
      );
    }

    for (const guru of selectedGurus) {
      const managerStartedAt = Date.now();
      console.log(
        `[13f-refresh] ${guru.id}: refreshing ${normalizedExposureLimit} exposure quarters`
      );
      const exposure = await refreshGuruExposureSnapshot(guru.id, {
        limit: normalizedExposureLimit,
        reason: normalizedReason,
        persist: false
      });

      console.log(`[13f-refresh] ${guru.id}: refreshing ${normalizedYears} backtest`);
      const backtest = await loadGuruBacktest(guru.id, {
        refresh: true,
        years: normalizedYears,
        detail: normalizedDetail,
        persist: false
      });
      const snapshot = refreshedById.get(guru.id);

      if (!usable13fSnapshot(snapshot)) {
        throw new Error(`${guru.id} staged guru snapshot verification failed`);
      }
      if (!exposure?.history?.length) {
        throw new Error(`${guru.id} staged exposure snapshot verification failed`);
      }
      if (exposure.latest?.reportDate !== snapshot.summary?.reportDate) {
        throw new Error(
          `${guru.id} exposure quarter ${exposure.latest?.reportDate || "missing"} does not match latest snapshot ${snapshot.summary?.reportDate || "missing"}`
        );
      }
      assertGuruBacktestRefreshSucceeded(guru, backtest, "staged");

      stagedExposureSnapshots.push({ guruId: guru.id, payload: exposure });
      stagedBacktests.push({
        guruId: guru.id,
        years: backtestYears,
        payload: backtest
      });

      const result = {
        guruId: guru.id,
        status: "refreshed",
        durationMs: Date.now() - managerStartedAt,
        reportDate: snapshot.summary?.reportDate || null,
        filingDate: snapshot.summary?.filingDate || null,
        totalPositions: snapshot.summary?.totalPositions || 0,
        exposureQuarters: exposure.history.length,
        backtestStatus: backtest.status || "unknown"
      };
      results.push(result);
      console.log(`[13f-refresh] ${guru.id}: complete ${JSON.stringify(result)}`);
    }

    const persistedDashboard = {
      ...dashboard,
      generatedAt: new Date().toISOString(),
      gurus: dashboard.gurus.map(withoutRuntimeDataStatus)
    };
    delete persistedDashboard.cache;
    const commitResult = writeGuru13fRefreshBundle({
      dashboard: persistedDashboard,
      guruSnapshots: stagedGuruSnapshots,
      exposureSnapshots: stagedExposureSnapshots,
      backtests: stagedBacktests
    });
    clearGuruDashboardMemoryCache();

    for (const guru of selectedGurus) {
      const storedSnapshot = readGuruSnapshot(guru.id);
      const storedExposure = readGuruExposureSnapshot(guru.id);
      const storedBacktest = readGuruBacktest(guru.id, backtestYears);
      if (
        !usable13fSnapshot(storedSnapshot) ||
        !storedExposure?.history?.length ||
        !storedBacktest ||
        storedExposure.latest?.reportDate !== storedSnapshot.summary?.reportDate
      ) {
        throw new Error(`${guru.id} post-commit 13F bundle verification failed`);
      }
      assertGuruBacktestRefreshSucceeded(guru, storedBacktest, "post-commit");
    }

    recordJob("success", {
      dashboardGeneratedAt: commitResult.dashboardGeneratedAt
    });
    return {
      jobId,
      status: "success",
      startedAt,
      finishedAt: new Date().toISOString(),
      results
    };
  } catch (error) {
    recordJob("failed", { error: error.message });
    throw error;
  }
}

export function startThirteenFRefresh(options = {}) {
  if (activeRefreshPromise) {
    return { started: false, promise: activeRefreshPromise };
  }
  const promise = runThirteenFRefresh(options);
  activeRefreshPromise = promise.finally(() => {
    activeRefreshPromise = null;
  });
  return { started: true, promise: activeRefreshPromise };
}

function isCommandLineEntry() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCommandLineEntry()) {
  const options = {
    guruIds: argValue("guru"),
    reason: argValue("reason", "manual-13f-update"),
    years: argValue("years", "5"),
    detail: argValue("detail", "compact"),
    exposureLimit: argValue("exposure-limit", "40")
  };
  try {
    const result = await runThirteenFRefresh(options);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[13f-refresh] failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}
