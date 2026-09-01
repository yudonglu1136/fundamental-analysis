import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-backtest-cache-test-"));
const databasePath = path.join(tempDir, "cache.sqlite");
fs.closeSync(fs.openSync(databasePath, "w"));
process.env.SQLITE_DB_PATH = databasePath;
process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";
process.env.BACKTEST_CACHE_TTL_HOURS = "0";
process.env.BACKTEST_STALE_BACKGROUND_REFRESH = "false";

const { gurus } = await import("./gurus.js");
const { writeGuruBacktest } = await import("./localDatabase.js");
const {
  assertGuruBacktestRefreshSucceeded,
  clearGuruBacktestAggregateCache,
  expectedGuruBacktestStatus,
  loadGuruBacktests,
  manager13fBacktestMethodVersion,
  refreshGuruBacktestCache
} = await import("./backtest.js");

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function fixture(guru, marker, generatedAt) {
  return {
    generatedAt,
    status: "ready",
    guru: {
      id: guru.id,
      name: guru.name,
      type: guru.type
    },
    window: {
      start: "2020-01-02",
      end: "2026-08-28"
    },
    method: guru.type === "manager13f"
      ? { version: manager13fBacktestMethodVersion }
      : {},
    summary: { marker },
    equity: [
      { date: "2020-01-02", value: 1, benchmark: 1 },
      { date: "2026-08-28", value: 2, benchmark: 1.8 }
    ],
    rebalances: [],
    quarterContributions: [{
      id: "2026-q2",
      label: "2026 Q2",
      contributions: [{ ticker: "TEST", issuer: "Test", contributionPct: 0.1 }]
    }]
  };
}

test("aggregate backtests cache by window/detail and invalidate on data or refresh version", async () => {
  const supported = gurus.filter((guru) => guru.type === "manager13f" || guru.type === "congress");
  for (const guru of supported) {
    writeGuruBacktest(guru.id, 0, fixture(guru, "v1", "2026-08-30T00:00:00.000Z"));
  }

  const compact = await loadGuruBacktests({ years: "all", detail: "compact" });
  const compactHit = await loadGuruBacktests({ years: "max", detail: "compact" });
  assert.strictEqual(compactHit, compact, "normalized all/max windows should share a cache entry");

  const full = await loadGuruBacktests({ years: "all", detail: "full" });
  const attributionHit = await loadGuruBacktests({ years: "all", detail: "attribution" });
  assert.notStrictEqual(full, compact, "full and compact responses must use separate cache entries");
  assert.strictEqual(attributionHit, full, "full/attribution aliases should share a cache entry");

  const changedGuru = supported.find((guru) => guru.type === "manager13f" && !guru.disableSimulation);
  writeGuruBacktest(
    changedGuru.id,
    0,
    fixture(changedGuru, "v2", "2026-08-30T00:01:00.000Z")
  );
  const afterDataChange = await loadGuruBacktests({ years: "all", detail: "compact" });
  assert.notStrictEqual(afterDataChange, compact, "row version change must invalidate the aggregate");
  assert.equal(
    afterDataChange.backtests.find((row) => row.guru?.id === changedGuru.id)?.summary?.marker,
    "v2"
  );

  const cachedAfterDataChange = await loadGuruBacktests({ years: "all", detail: "compact" });
  assert.strictEqual(cachedAfterDataChange, afterDataChange);

  const originalTypes = supported.map((guru) => [guru, guru.type]);
  try {
    for (const [guru] of originalTypes) guru.type = "test-disabled";
    await refreshGuruBacktestCache({ reason: "cache-invalidation-test" });
  } finally {
    for (const [guru, type] of originalTypes) guru.type = type;
  }

  const afterRefresh = await loadGuruBacktests({ years: "all", detail: "compact" });
  assert.notStrictEqual(afterRefresh, cachedAfterDataChange, "refresh completion must clear aggregates");
});

test("aggregate cache cannot outlive the freshness of its individual backtests", async () => {
  const originalNow = Date.now;
  const originalTtl = process.env.BACKTEST_CACHE_TTL_HOURS;
  const originalTypes = gurus.map((guru) => [guru, guru.type]);
  try {
    for (const [guru] of originalTypes) {
      if (guru.type === "congress") guru.type = "test-disabled";
    }
    const supported = gurus.filter((guru) => guru.type === "manager13f");
    process.env.BACKTEST_CACHE_TTL_HOURS = "20";
    Date.now = () => new Date("2026-08-30T01:00:00.000Z").getTime();
    for (const guru of supported) {
      writeGuruBacktest(guru.id, 0, fixture(guru, "ttl", "2026-08-30T00:00:00.000Z"));
    }
    clearGuruBacktestAggregateCache();

    const initial = await loadGuruBacktests({ years: "all", detail: "compact" });
    const initialHit = await loadGuruBacktests({ years: "all", detail: "compact" });
    assert.strictEqual(initialHit, initial);

    Date.now = () => new Date("2026-08-31T22:00:00.000Z").getTime();
    const expired = await loadGuruBacktests({ years: "all", detail: "compact" });
    const expiredAgain = await loadGuruBacktests({ years: "all", detail: "compact" });
    assert.notStrictEqual(expired, initial, "expired individual rows must evict the aggregate");
    assert.strictEqual(
      expiredAgain,
      expired,
      "stale rows may share a short-lived aggregate without losing stale metadata"
    );
    assert.ok(
      expired.backtests.some((row) => row.cache?.stale === true),
      "expired manager rows must retain their stale marker"
    );
    Date.now = () => new Date("2026-08-31T22:00:31.000Z").getTime();
    const staleAggregateExpired = await loadGuruBacktests({ years: "all", detail: "compact" });
    assert.notStrictEqual(
      staleAggregateExpired,
      expired,
      "stale aggregates must expire on the bounded retry interval"
    );
  } finally {
    for (const [guru, type] of originalTypes) guru.type = type;
    Date.now = originalNow;
    process.env.BACKTEST_CACHE_TTL_HOURS = originalTtl;
    clearGuruBacktestAggregateCache();
  }
});

test("concurrent aggregate misses share one in-flight build", async () => {
  const supported = gurus.filter((guru) => guru.type === "manager13f" || guru.type === "congress");
  for (const guru of supported) {
    writeGuruBacktest(guru.id, 0, fixture(guru, "single-flight", "2026-08-30T03:00:00.000Z"));
  }
  clearGuruBacktestAggregateCache();

  const results = await Promise.all(Array.from(
    { length: 20 },
    () => loadGuruBacktests({ years: "all", detail: "compact" })
  ));
  for (const result of results.slice(1)) {
    assert.strictEqual(result, results[0]);
  }
});

test("backtest refresh status gate accepts only ready, except explicitly disabled managers", () => {
  const ackman = gurus.find((guru) => guru.id === "bill-ackman");
  const renaissance = gurus.find((guru) => guru.id === "renaissance-technologies");

  assert.equal(expectedGuruBacktestStatus(ackman), "ready");
  assert.equal(expectedGuruBacktestStatus(renaissance), "unsupported");
  assert.doesNotThrow(() => assertGuruBacktestRefreshSucceeded(ackman, { status: "ready" }));
  assert.doesNotThrow(() =>
    assertGuruBacktestRefreshSucceeded(renaissance, { status: "unsupported" })
  );
  assert.throws(
    () => assertGuruBacktestRefreshSucceeded(ackman, {
      status: "insufficient_data",
      method: { reason: "Adjusted-close coverage is below the required threshold." }
    }),
    /bill-ackman refresh backtest status is insufficient_data; expected ready.*Adjusted-close coverage/i
  );
  assert.throws(
    () => assertGuruBacktestRefreshSucceeded(renaissance, { status: "ready" }),
    /renaissance-technologies refresh backtest status is ready; expected unsupported/i
  );
});

test("cache refresh counts insufficient_data as failed instead of ok", async () => {
  const ackman = gurus.find((guru) => guru.id === "bill-ackman");
  const originalTypes = gurus.map((guru) => [guru, guru.type]);
  try {
    for (const [guru] of originalTypes) {
      if (guru !== ackman) guru.type = "test-disabled";
    }
    const result = await refreshGuruBacktestCache({
      years: 5,
      reason: "status-gate-test",
      backtestLoader: async () => ({
        status: "insufficient_data",
        method: { reason: "Execution coverage is below 90%." }
      })
    });

    assert.equal(result.ok, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.errors[0]?.guru, "bill-ackman");
    assert.match(result.errors[0]?.message || "", /insufficient_data; expected ready/i);
  } finally {
    for (const [guru, type] of originalTypes) guru.type = type;
  }
});
