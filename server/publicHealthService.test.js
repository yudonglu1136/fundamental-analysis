import assert from "node:assert/strict";
import test from "node:test";

import { createPublicHealthService } from "./publicHealthService.js";

function buildFixture({ ontology, now }) {
  return {
    ok: ontology.ok === true,
    status: ontology.ok === true ? "healthy" : "failed",
    generatedAt: new Date(now).toISOString(),
    ontology
  };
}

test("coalesces concurrent public health checks into one full audit", async () => {
  let resolveCalls = 0;
  let buildCalls = 0;
  let releaseOntology;
  const ontologyGate = new Promise((resolve) => {
    releaseOntology = resolve;
  });
  const service = createPublicHealthService({
    resolveOntology: async () => {
      resolveCalls += 1;
      return ontologyGate;
    },
    buildHealth: (options) => {
      buildCalls += 1;
      return buildFixture(options);
    },
    now: () => Date.parse("2026-09-03T20:00:00.000Z")
  });

  const requests = [
    ...Array.from({ length: 15 }, () => service.read()),
    service.read({ force: true })
  ];
  await Promise.resolve();
  assert.equal(resolveCalls, 1);
  assert.equal(buildCalls, 0);

  releaseOntology({ ok: true, verified: true });
  const results = await Promise.all(requests);
  assert.equal(resolveCalls, 1);
  assert.equal(buildCalls, 1);
  assert.equal(results.every((result) => result === results[0]), true);
});

test("reuses a verified aggregate only within the bounded success TTL", async () => {
  let currentTime = 1_000;
  let resolveCalls = 0;
  const service = createPublicHealthService({
    resolveOntology: async () => {
      resolveCalls += 1;
      return { ok: true, verified: true };
    },
    buildHealth: buildFixture,
    now: () => currentTime,
    successTtlMs: 100,
    failureTtlMs: 10
  });

  const first = await service.read();
  const cached = await service.read();
  assert.equal(first, cached);
  assert.equal(resolveCalls, 1);

  currentTime = 1_099;
  await service.read();
  assert.equal(resolveCalls, 1);
  currentTime = 1_100;
  const refreshed = await service.read();
  assert.equal(resolveCalls, 2);
  assert.equal(first.generatedAt, new Date(1_000).toISOString());
  assert.equal(refreshed.generatedAt, new Date(1_100).toISOString());

  await service.read({ force: true });
  assert.equal(resolveCalls, 3);
});

test("does not serve a stale healthy result after failed revalidation", async () => {
  let currentTime = 5_000;
  let resolveCalls = 0;
  const service = createPublicHealthService({
    resolveOntology: async () => {
      resolveCalls += 1;
      return resolveCalls === 1
        ? { ok: true, verified: true }
        : { ok: false, verified: false, error: "timed out" };
    },
    buildHealth: buildFixture,
    now: () => currentTime,
    successTtlMs: 100,
    failureTtlMs: 10
  });

  assert.equal((await service.read()).ok, true);
  currentTime = 5_100;
  const failed = await service.read();
  assert.equal(failed.ok, false);
  assert.equal(failed.ontology.error, "timed out");
  assert.equal(resolveCalls, 2);

  currentTime = 5_109;
  assert.equal((await service.read()).ok, false);
  assert.equal(resolveCalls, 2);
  currentTime = 5_110;
  await service.read();
  assert.equal(resolveCalls, 3);
});

test("clears a rejected in-flight check and permits the next verification", async () => {
  let calls = 0;
  const service = createPublicHealthService({
    resolveOntology: async () => {
      calls += 1;
      if (calls === 1) throw new Error("transport failed");
      return { ok: true, verified: true };
    },
    buildHealth: buildFixture,
    now: () => 10_000
  });

  await assert.rejects(service.read(), /transport failed/);
  assert.equal((await service.read()).ok, true);
  assert.equal(calls, 2);
});

test("clears an in-flight check when the aggregate builder throws", async () => {
  let buildCalls = 0;
  const service = createPublicHealthService({
    resolveOntology: async () => ({ ok: true, verified: true }),
    buildHealth: (options) => {
      buildCalls += 1;
      if (buildCalls === 1) throw new Error("audit failed");
      return buildFixture(options);
    },
    now: () => 20_000
  });

  await assert.rejects(service.read(), /audit failed/);
  assert.equal((await service.read()).ok, true);
  assert.equal(buildCalls, 2);
});

test("supports an explicit zero TTL and clamps configured TTLs to safe maxima", async () => {
  let uncachedCalls = 0;
  const uncached = createPublicHealthService({
    resolveOntology: async () => {
      uncachedCalls += 1;
      return { ok: true, verified: true };
    },
    buildHealth: buildFixture,
    now: () => 30_000,
    successTtlMs: 0
  });
  await uncached.read();
  await uncached.read();
  assert.equal(uncachedCalls, 2);

  let boundedTime = 40_000;
  let safeDefaultCalls = 0;
  const safeDefault = createPublicHealthService({
    resolveOntology: async () => {
      safeDefaultCalls += 1;
      return { ok: true, verified: true };
    },
    buildHealth: buildFixture,
    now: () => boundedTime,
    successTtlMs: 999_999
  });
  await safeDefault.read();
  await safeDefault.read();
  assert.equal(safeDefaultCalls, 1);
  boundedTime = 69_999;
  await safeDefault.read();
  assert.equal(safeDefaultCalls, 1);
  boundedTime = 70_000;
  await safeDefault.read();
  assert.equal(safeDefaultCalls, 2);
});

test("starts the failure TTL after an expensive aggregate audit completes", async () => {
  let currentTime = 80_000;
  let resolveCalls = 0;
  const service = createPublicHealthService({
    resolveOntology: async () => {
      resolveCalls += 1;
      return { ok: false, verified: false };
    },
    buildHealth: (options) => {
      currentTime += 4_000;
      return buildFixture(options);
    },
    now: () => currentTime,
    failureTtlMs: 1_000
  });

  assert.equal((await service.read()).ok, false);
  assert.equal(resolveCalls, 1);
  currentTime = 84_999;
  assert.equal((await service.read()).ok, false);
  assert.equal(resolveCalls, 1);
  currentTime = 85_000;
  assert.equal((await service.read()).ok, false);
  assert.equal(resolveCalls, 2);
});
