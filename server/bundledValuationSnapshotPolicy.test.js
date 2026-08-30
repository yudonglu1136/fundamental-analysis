import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldInstallBundledValuationDashboard,
  shouldInstallBundledValuationTicker,
  valuationDashboardTickerCount
} from "./bundledValuationSnapshotPolicy.js";

function dashboard(generatedAt, tickerCount) {
  return {
    generated_at: generatedAt,
    payload_json: JSON.stringify({
      tickers: Array.from({ length: tickerCount }, (_, index) => ({ ticker: `T${index}` }))
    })
  };
}

test("counts dashboard tickers without trusting malformed payloads", () => {
  assert.equal(valuationDashboardTickerCount(dashboard("2026-08-30T10:30:00Z", 533).payload_json), 533);
  assert.equal(valuationDashboardTickerCount("not-json"), 0);
  assert.equal(valuationDashboardTickerCount(JSON.stringify({ tickers: {} })), 0);
});

test("never lets a stale or equal bundled dashboard replace runtime data", () => {
  const runtime = dashboard("2026-08-30T10:30:00Z", 533);
  assert.equal(
    shouldInstallBundledValuationDashboard(dashboard("2026-08-30T05:14:57Z", 0), runtime),
    false
  );
  assert.equal(
    shouldInstallBundledValuationDashboard(dashboard("2026-08-30T10:30:00Z", 533), runtime),
    false
  );
});

test("never lets a newer but lower-coverage dashboard erase tracked tickers", () => {
  const runtime = dashboard("2026-08-30T10:30:00Z", 533);
  assert.equal(
    shouldInstallBundledValuationDashboard(dashboard("2026-08-31T10:30:00Z", 532), runtime),
    false
  );
  assert.equal(
    shouldInstallBundledValuationDashboard(dashboard("2026-08-31T10:30:00Z", 533), runtime),
    true
  );
});

test("allows an initial dashboard seed and recovery from an empty runtime dashboard", () => {
  const bundled = dashboard("2026-08-30T10:30:00Z", 533);
  assert.equal(shouldInstallBundledValuationDashboard(bundled, null), true);
  assert.equal(
    shouldInstallBundledValuationDashboard(bundled, dashboard("2026-08-29T10:30:00Z", 0)),
    true
  );
});

test("ticker snapshots install only when the bundled row is newer", () => {
  const current = { generated_at: "2026-08-30T10:30:00Z" };
  assert.equal(
    shouldInstallBundledValuationTicker({ generated_at: "2026-08-31T10:30:00Z" }, current),
    true
  );
  assert.equal(
    shouldInstallBundledValuationTicker({ generated_at: "2026-08-30T10:30:00Z" }, current),
    false
  );
  assert.equal(
    shouldInstallBundledValuationTicker({ generated_at: "2026-08-29T10:30:00Z" }, current),
    false
  );
});
