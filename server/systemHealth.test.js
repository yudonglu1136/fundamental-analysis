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
      sourceAt: latestAt,
      status: "ok"
    })),
    ontology: {
      ok: true,
      exists: true,
      sizeBytes: 4096,
      updatedAt: latestAt,
      manifest: {
        schema_version: 2,
        generated_at: latestAt,
        financial_as_of: latestAt,
        decision_latest: latestAt,
        responses: 10
      }
    },
    now
  };
}

test("freshness status escalates past failedHours", () => {
  const old = new Date(now - 97 * 60 * 60 * 1000).toISOString();
  assert.equal(statusForAge(old, 24, 96, now), "failed");
});

test("freshness fails closed for a materially future source date", () => {
  const future = new Date(now + 60 * 60 * 1000).toISOString();
  assert.equal(statusForAge(future, 24, 96, now), "unknown");
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

test("public health uses valuation source-as-of cadence instead of export time", () => {
  const fixture = healthyFixture();
  const valuation = fixture.tables.find((table) => table.table === "valuation_ticker_snapshots");
  valuation.latestAt = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  valuation.sourceAt = new Date(now - 46 * 24 * 60 * 60 * 1000).toISOString();
  const health = buildPublicSystemHealth(fixture);
  const module = health.modules.find((entry) => entry.id === "valuation");
  assert.equal(health.ok, true);
  assert.equal(health.degraded, true);
  assert.equal(health.status, "stale");
  assert.equal(module.state, "stale");
  assert.equal(module.freshness.ageHours, 46 * 24);
  assert.equal(module.freshness.warningHours, 45 * 24);
  assert.equal(module.freshness.failedHours, 120 * 24);
  assert.equal(module.freshness.sourceAsOf, valuation.sourceAt);
  assert.equal(module.freshness.observedAt, valuation.latestAt);
  assert.equal(module.freshness.basis, "source_as_of");
  assert.equal(module.freshness.cadence, "quarterly_company_event");
});

test("stale is explicit but serviceable while unknown and failed remain fail-closed", () => {
  const staleFixture = healthyFixture();
  staleFixture.tables.find((table) => table.table === "valuation_ticker_snapshots").sourceAt =
    new Date(now - 46 * 24 * 60 * 60 * 1000).toISOString();
  const stale = buildPublicSystemHealth(staleFixture);
  assert.equal(stale.status, "stale");
  assert.equal(stale.ok, true);
  assert.equal(stale.degraded, true);

  const unknownFixture = healthyFixture();
  unknownFixture.tables.find((table) => table.table === "valuation_ticker_snapshots").sourceAt = "";
  const unknown = buildPublicSystemHealth(unknownFixture);
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.degraded, false);

  const failedFixture = healthyFixture();
  failedFixture.tables.find((table) => table.table === "valuation_ticker_snapshots").sourceAt =
    new Date(now - 121 * 24 * 60 * 60 * 1000).toISOString();
  const failed = buildPublicSystemHealth(failedFixture);
  assert.equal(failed.status, "failed");
  assert.equal(failed.ok, false);
  assert.equal(failed.degraded, false);
});

test("market-price cadence includes a weekend and holiday buffer", () => {
  const healthyFixtureWithWeekend = healthyFixture();
  const prices = healthyFixtureWithWeekend.tables.find((table) => table.table === "price_points");
  prices.sourceAt = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();
  let health = buildPublicSystemHealth(healthyFixtureWithWeekend);
  let module = health.modules.find((entry) => entry.id === "market_prices");
  assert.equal(module.state, "healthy");
  assert.equal(module.freshness.warningHours, 5 * 24);
  assert.equal(module.freshness.failedHours, 12 * 24);

  prices.sourceAt = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();
  health = buildPublicSystemHealth(healthyFixtureWithWeekend);
  module = health.modules.find((entry) => entry.id === "market_prices");
  assert.equal(module.state, "stale");
  assert.equal(health.ok, true);
});

test("quarterly Guru data remains healthy inside its filing cadence", () => {
  const fixture = healthyFixture();
  const guru = fixture.tables.find((table) => table.table === "guru_snapshots");
  guru.sourceAt = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  let health = buildPublicSystemHealth(fixture);
  assert.equal(health.modules.find((entry) => entry.id === "guru_data").state, "healthy");

  guru.sourceAt = new Date(now - 101 * 24 * 60 * 60 * 1000).toISOString();
  health = buildPublicSystemHealth(fixture);
  assert.equal(health.modules.find((entry) => entry.id === "guru_data").state, "stale");

  guru.sourceAt = new Date(now - 131 * 24 * 60 * 60 * 1000).toISOString();
  health = buildPublicSystemHealth(fixture);
  assert.equal(health.modules.find((entry) => entry.id === "guru_data").state, "failed");
});

test("Ontology uses the oldest required economic source date, not generated_at", () => {
  const fixture = healthyFixture();
  fixture.ontology.manifest.generated_at = new Date(now - 60 * 60 * 1000).toISOString();
  fixture.ontology.manifest.financial_as_of = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
  fixture.ontology.manifest.decision_latest = "2026-07-17T12:00:00";
  const health = buildPublicSystemHealth(fixture);
  const module = health.modules.find((entry) => entry.id === "ontology");
  assert.equal(module.state, "stale");
  assert.equal(module.freshness.sourceAsOf, "2026-07-17T12:00:00.000Z");
  assert.equal(module.freshness.observedAt, fixture.ontology.manifest.generated_at);
  assert.equal(module.freshness.basis, "oldest_required_source_as_of");
});

test("Ontology fails when either required economic source date is in the future", () => {
  const fixture = healthyFixture();
  fixture.ontology.manifest.financial_as_of = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const health = buildPublicSystemHealth(fixture);
  const module = health.modules.find((entry) => entry.id === "ontology");
  assert.equal(health.ok, false);
  assert.equal(module.state, "failed");
  assert.match(module.message, /future economic source date/);
});

test("external Ontology is required to carry a verified delegation result", () => {
  const unverifiedFixture = healthyFixture();
  unverifiedFixture.ontology.mode = "external";
  unverifiedFixture.ontology.verified = false;
  const failed = buildPublicSystemHealth(unverifiedFixture);
  assert.equal(failed.modules.find((entry) => entry.id === "ontology").state, "failed");

  const verifiedFixture = healthyFixture();
  verifiedFixture.ontology.mode = "external";
  verifiedFixture.ontology.verified = true;
  const healthy = buildPublicSystemHealth(verifiedFixture);
  assert.equal(healthy.modules.find((entry) => entry.id === "ontology").state, "healthy");
});
