import { gurus } from "./gurus.js";
import { readGuruExposureSnapshot, writeBackgroundJobRun } from "./localDatabase.js";
import { refreshGuruExposureSnapshot } from "./secClient.js";

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function cacheAgeHours(snapshot) {
  const generatedAt = snapshot?.generatedAt ? new Date(snapshot.generatedAt).getTime() : 0;
  if (!Number.isFinite(generatedAt) || generatedAt <= 0) return Infinity;
  return (Date.now() - generatedAt) / (1000 * 60 * 60);
}

const limit = Math.max(4, Math.min(40, Number(argValue("limit", "32")) || 32));
const missingOnly = hasFlag("missing-only");
const staleHours = Number(argValue("stale-hours", "24"));
const managerGurus = gurus.filter((guru) => guru.type === "manager13f");
const startedAt = new Date().toISOString();
const jobId = "guru_exposure_refresh";
const results = [];
let completed = false;

function finishJob(status, extraPayload = {}) {
  const failed = results.filter((result) => result.status === "failed").length;
  const refreshed = results.filter((result) => result.status === "refreshed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const finishedAt = new Date().toISOString();

  writeBackgroundJobRun(jobId, {
    startedAt,
    finishedAt,
    status,
    payload: {
      limit,
      missingOnly,
      staleHours,
      total: managerGurus.length,
      refreshed,
      skipped,
      failed,
      results,
      ...extraPayload
    }
  });

  completed = true;
  return { finishedAt, refreshed, skipped, failed };
}

function abortJob(signal) {
  if (completed) return;
  finishJob("failed", {
    error: `Refresh interrupted by ${signal}`,
    interruptedBy: signal
  });
}

process.once("SIGINT", () => {
  abortJob("SIGINT");
  process.exit(130);
});
process.once("SIGTERM", () => {
  abortJob("SIGTERM");
  process.exit(143);
});

writeBackgroundJobRun(jobId, {
  startedAt,
  status: "running",
  payload: {
    limit,
    missingOnly,
    staleHours,
    total: managerGurus.length
  }
});

for (const guru of managerGurus) {
  const started = Date.now();
  const existing = readGuruExposureSnapshot(guru.id);
  const ageHours = cacheAgeHours(existing);
  console.log(`[guru-exposure] ${guru.id}: checking cache age=${Number(ageHours.toFixed(2))}h`);

  if (missingOnly && existing) {
    results.push({
      guruId: guru.id,
      status: "skipped",
      reason: "cache_exists",
      history: Array.isArray(existing.history) ? existing.history.length : 0,
      ageHours: Number(ageHours.toFixed(2))
    });
    continue;
  }

  if (!missingOnly && existing && Number.isFinite(staleHours) && ageHours < staleHours) {
    results.push({
      guruId: guru.id,
      status: "skipped",
      reason: "cache_fresh",
      history: Array.isArray(existing.history) ? existing.history.length : 0,
      ageHours: Number(ageHours.toFixed(2))
    });
    continue;
  }

  try {
    console.log(`[guru-exposure] ${guru.id}: refreshing latest ${limit} quarters`);
    const payload = await refreshGuruExposureSnapshot(guru.id, {
      limit,
      reason: "scheduled-warmup"
    });
    console.log(`[guru-exposure] ${guru.id}: refreshed ${Array.isArray(payload.history) ? payload.history.length : 0} quarters`);
    results.push({
      guruId: guru.id,
      status: "refreshed",
      durationMs: Date.now() - started,
      history: Array.isArray(payload.history) ? payload.history.length : 0,
      latest: payload.latest?.quarterLabel || ""
    });
  } catch (error) {
    console.warn(`[guru-exposure] ${guru.id}: failed: ${error.message}`);
    results.push({
      guruId: guru.id,
      status: "failed",
      durationMs: Date.now() - started,
      error: error.message
    });
  }
}

const finalFailed = results.filter((result) => result.status === "failed").length;
const { finishedAt, refreshed, skipped, failed } = finishJob(
  finalFailed ? "failed" : "success",
  finalFailed ? { message: `${finalFailed} guru exposure refreshes failed.` } : {}
);

console.log(
  JSON.stringify(
    {
      jobId,
      startedAt,
      finishedAt,
      limit,
      total: managerGurus.length,
      refreshed,
      skipped,
      failed
    },
    null,
    2
  )
);
