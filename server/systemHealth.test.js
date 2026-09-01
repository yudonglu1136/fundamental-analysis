import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "system-health-test-"));
process.env.SQLITE_DB_PATH = path.join(temporaryDirectory, "health.sqlite");
process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";

const { buildPublicSystemHealth, statusForAge } = await import("./systemHealth.js");

after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

const requiredTables = [
  "dashboard_snapshots",
  "guru_snapshots",
  "guru_exposure_snapshots",
  "guru_assets",
  "guru_backtests",
  "valuation_snapshots",
  "valuation_ticker_snapshots",
  "valuation_podcast_insights",
  "price_points",
  "portfolio_nav_points",
  "ticker_assets",
  "dividend_events",
  "background_job_runs"
];

const now = Date.parse("2026-09-01T12:00:00.000Z");

function healthyFixture() {
  const latestAt = new Date(now - 60 * 60 * 1000).toISOString();
  return {
    database: {
      path: "/private/health.sqlite",
      exists: true,
      sizeBytes: 1024,
      updatedAt: latestAt,
      status: "success"
    },
    tables: requiredTables.map((table) => ({
      table,
      rowCount: 1,
      latestAt,
      status: "ok"
    })),
    ontology: {
      ok: true,
      exists: true,
      sizeBytes: 4096,
      updatedAt: latestAt,
      manifest: { schema_version: 2, generated_at: latestAt, responses: 10 }
    },
    now
  };
}

test("freshness status escalates past failedHours", () => {
  const old = new Date(now - 97 * 60 * 60 * 1000).toISOString();
  assert.equal(statusForAge(old, 24, 96, now), "failed");
});

test("public health is green only when every required module is current", () => {
  const health = buildPublicSystemHealth(healthyFixture());
  assert.equal(health.ok, true);
  assert.equal(health.status, "healthy");
  assert.equal(health.modules.every((module) => module.state === "healthy"), true);
  assert.equal("path" in health.database, false);
});

test("public health fails closed for a missing database or table", () => {
  const missingDatabase = healthyFixture();
  missingDatabase.database.exists = false;
  missingDatabase.database.sizeBytes = 0;
  const databaseHealth = buildPublicSystemHealth(missingDatabase);
  assert.equal(databaseHealth.ok, false);
  assert.equal(databaseHealth.status, "failed");
  assert.equal(databaseHealth.modules.find((module) => module.id === "database").state, "failed");

  const missingTable = healthyFixture();
  missingTable.tables = missingTable.tables.filter(
    (table) => table.table !== "valuation_ticker_snapshots"
  );
  const tableHealth = buildPublicSystemHealth(missingTable);
  assert.equal(tableHealth.ok, false);
  assert.equal(tableHealth.database.missingTables.includes("valuation_ticker_snapshots"), true);
  assert.equal(tableHealth.modules.find((module) => module.id === "valuation").state, "failed");
});

test("public health reports module freshness and marks warning-age data stale", () => {
  const fixture = healthyFixture();
  const valuation = fixture.tables.find((table) => table.table === "valuation_ticker_snapshots");
  valuation.latestAt = new Date(now - 80 * 60 * 60 * 1000).toISOString();
  const health = buildPublicSystemHealth(fixture);
  const module = health.modules.find((entry) => entry.id === "valuation");
  assert.equal(health.ok, false);
  assert.equal(health.status, "stale");
  assert.equal(module.state, "stale");
  assert.equal(module.freshness.ageHours, 80);
  assert.equal(module.freshness.warningHours, 72);
  assert.equal(module.freshness.failedHours, 240);
});
