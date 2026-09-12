import { Worker } from "node:worker_threads";
import { createSystemHealth } from "./systemHealthCore.js";

const MAX_AUDIT_MS = 8_000;
const workerUrl = new URL("./publicHealthWorker.js", import.meta.url);

function unavailableHealth(methodIdentity, options, code) {
  const audit = createSystemHealth({ ...methodIdentity });
  const curves = audit.summarizeGuruCurveAvailability({
    readStrict: () => null,
    readProxy: () => null,
    now: options.now
  });
  curves.failures = curves.failures.map(({ guruId, guruName, years }) => ({
    guruId, guruName, years, outcome: "failure", reason: code
  }));
  const health = audit.buildPublicSystemHealth({
    ...options,
    database: { exists: null, sizeBytes: null, updatedAt: "", status: "failed" },
    tables: [],
    guruCurves: curves
  });
  const message = "The complete health audit could not finish. Data readiness is not verified.";
  health.database = {
    exists: null, sizeBytes: null, updatedAt: "", status: "failed", state: "failed",
    missingTables: [], failedTables: [], message
  };
  health.modules = health.modules.map((module) => module.id === "ontology" ? module : {
    ...module,
    state: "failed",
    message,
    details: {
      verificationError: code,
      ...(module.id === "guru_backtests" ? { curveAvailability: curves } : {})
    }
  });
  return health;
}

/** One bounded audit worker, never a queue, and never a main-thread DB scan. */
export function createPublicHealthWorkerBuilder({
  databasePath,
  methodIdentity,
  timeoutMs = MAX_AUDIT_MS,
  workerFactory = (workerData) => new Worker(workerUrl, {
    workerData,
    resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 }
  })
} = {}) {
  if (!databasePath || !methodIdentity) throw new TypeError("Health database and method identity are required");
  const deadline = Math.max(1, Math.min(MAX_AUDIT_MS, Number(timeoutMs) || MAX_AUDIT_MS));
  let active = null;

  function buildHealth(options = {}) {
    // After timeout, a native SQLite read may take time to stop. Retain the slot
    // until the worker actually exits; later probes cannot accumulate workers.
    if (active) return Promise.resolve(unavailableHealth(methodIdentity, options, "health_audit_busy"));
    return new Promise((resolve) => {
      let worker;
      try {
        worker = workerFactory({ databasePath, methodIdentity, options });
      } catch {
        resolve(unavailableHealth(methodIdentity, options, "health_audit_failed"));
        return;
      }
      active = worker;
      let settled = false;
      const finish = (health) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(health);
      };
      const stop = () => {
        try {
          Promise.resolve(worker.terminate()).catch(() => {});
        } catch { /* Keep the slot occupied until an actual exit event. */ }
      };
      const timer = setTimeout(() => {
        finish(unavailableHealth(methodIdentity, options, "health_audit_timeout"));
        stop();
      }, deadline);
      worker.once("message", (message) => {
        const result = message?.health;
        if (result && typeof result.ok === "boolean" && Array.isArray(result.modules)) finish(result);
        else finish(unavailableHealth(methodIdentity, options, "health_audit_failed"));
        stop();
      });
      worker.once("error", () => {
        finish(unavailableHealth(methodIdentity, options, "health_audit_failed"));
        stop();
      });
      worker.once("exit", () => {
        if (active === worker) active = null;
        finish(unavailableHealth(methodIdentity, options, "health_audit_failed"));
      });
    });
  }

  return { buildHealth };
}
