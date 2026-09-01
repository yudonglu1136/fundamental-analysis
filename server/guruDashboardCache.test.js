import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-dashboard-cache-test-"));
const databasePath = path.join(tempDir, "cache.sqlite");
process.env.SQLITE_DB_PATH = databasePath;
process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";

const { gurus } = await import("./gurus.js");
const {
  readGuruDashboardVersion,
  writeDashboardSnapshot,
  writeGuruAsset,
  writeGuruSnapshot
} = await import("./localDatabase.js");
const {
  clearGuruDashboardMemoryCache,
  loadGuruDashboard
} = await import("./secClient.js");

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function dashboard(marker, generatedAt) {
  return {
    generatedAt,
    marker,
    source: { label: "Guru dashboard cache test" },
    gurus: gurus.map((guru) => ({
      id: guru.id,
      name: guru.name,
      type: guru.type,
      cik: guru.cik || "",
      status: "live",
      holdings: [],
      activity: [],
      transactions: []
    }))
  };
}

test("Guru dashboard reuses one derived payload and preserves response semantics", async () => {
  writeDashboardSnapshot(dashboard("v1", new Date().toISOString()));

  const first = await loadGuruDashboard();
  const hit = await loadGuruDashboard();
  assert.strictEqual(hit, first, "a version-stable hit must reuse the exact payload object");

  const serialized = JSON.stringify(first);
  clearGuruDashboardMemoryCache();
  const rebuilt = await loadGuruDashboard();
  assert.notStrictEqual(rebuilt, first);
  assert.equal(JSON.stringify(rebuilt), serialized, "caching must not change JSON semantics");

  clearGuruDashboardMemoryCache();
  const concurrent = await Promise.all(
    Array.from({ length: 20 }, () => loadGuruDashboard())
  );
  for (const payload of concurrent.slice(1)) assert.strictEqual(payload, concurrent[0]);
});

test("dashboard, Guru snapshot, and avatar writes invalidate the version-keyed cache", async () => {
  writeDashboardSnapshot(dashboard("v1", new Date().toISOString()));
  const firstVersion = readGuruDashboardVersion();
  const first = await loadGuruDashboard();

  writeDashboardSnapshot(dashboard("v2", new Date().toISOString()));
  const secondVersion = readGuruDashboardVersion();
  const second = await loadGuruDashboard();
  assert.notEqual(secondVersion, firstVersion);
  assert.notStrictEqual(second, first);
  assert.equal(second.marker, "v2");

  const selected = gurus[0];
  const beforeGuruWrite = readGuruDashboardVersion();
  writeGuruSnapshot(selected.id, {
    id: selected.id,
    type: selected.type,
    cik: selected.cik || "",
    generatedAt: new Date().toISOString()
  });
  const afterGuruWrite = readGuruDashboardVersion();
  const afterGuruSnapshot = await loadGuruDashboard();
  assert.notEqual(afterGuruWrite, beforeGuruWrite);
  assert.notStrictEqual(afterGuruSnapshot, second);

  const beforeAssetWrite = readGuruDashboardVersion();
  writeGuruAsset(selected.id, {
    assetType: "avatar",
    url: "/guru-avatars/cache-test.webp",
    generatedAt: new Date().toISOString()
  });
  const afterAssetWrite = readGuruDashboardVersion();
  const afterAsset = await loadGuruDashboard();
  assert.notEqual(afterAssetWrite, beforeAssetWrite);
  assert.notStrictEqual(afterAsset, afterGuruSnapshot);
  assert.equal(
    afterAsset.gurus.find((guru) => guru.id === selected.id)?.avatarUrl,
    "/guru-avatars/cache-test.webp"
  );
});
