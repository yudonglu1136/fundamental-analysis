import assert from "node:assert/strict";
import test from "node:test";

import {
  inclusivePlanIntervals,
  normalizeExplicitRefreshTargets,
  validateActivePriceTargetManifest
} from "../scripts/build-guru-active-price-plan.mjs";
import { manager13fPriceRequirements } from "./backtest.js";

function holding({ ticker, cusip, value = 100 }) {
  return {
    ticker,
    cusip,
    issuer: ticker,
    title: "COM",
    shareType: "SH",
    putCall: "",
    shares: 10,
    value
  };
}

function targetManifest(refreshTargets) {
  return {
    schemaVersion: 2,
    kind: "guru_active_price_targets",
    targets: [{ symbol: "JHG", guruIds: ["nelson-peltz"] }],
    refreshTargets
  };
}

test("active-price target manifest preserves an explicit status per Guru/window", () => {
  const payload = validateActivePriceTargetManifest(targetManifest([
    { guruId: "nelson-peltz", years: 10, expectedStatus: "proxy_ready" },
    { guruId: "nelson-peltz", years: 5, expectedStatus: "proxy_ready" },
    { guruId: "chris-hohn", years: 10, expectedStatus: "ready" },
    { guruId: "chris-hohn", years: 5, expectedStatus: "ready" }
  ]), [5, 10]);

  assert.deepEqual(payload.refreshTargets, [
    { guruId: "chris-hohn", years: 5, expectedStatus: "ready" },
    { guruId: "chris-hohn", years: 10, expectedStatus: "ready" },
    { guruId: "nelson-peltz", years: 5, expectedStatus: "proxy_ready" },
    { guruId: "nelson-peltz", years: 10, expectedStatus: "proxy_ready" }
  ]);
});

test("active-price target manifest rejects legacy implicit-ready targets", () => {
  assert.throws(() => validateActivePriceTargetManifest({
    schemaVersion: 2,
    kind: "guru_active_price_targets",
    targets: [{ symbol: "JHG", guruIds: ["nelson-peltz"] }],
    refreshGuruIds: ["nelson-peltz"],
    refreshTargets: [
      { guruId: "nelson-peltz", years: 5, expectedStatus: "proxy_ready" },
      { guruId: "nelson-peltz", years: 10, expectedStatus: "proxy_ready" }
    ]
  }, [5, 10]), /Legacy refreshGuruIds is not accepted/);
});

test("active-price target manifest fails closed on missing or invalid status declarations", () => {
  assert.throws(() => normalizeExplicitRefreshTargets([
    { guruId: "nelson-peltz", years: 5, expectedStatus: "proxy_ready" }
  ], [5, 10]), /must explicitly declare every required window/);
  assert.throws(() => normalizeExplicitRefreshTargets([
    { guruId: "nelson-peltz", years: 5, expectedStatus: "proxy_ready" },
    { guruId: "nelson-peltz", years: 10 }
  ], [5, 10]), /must explicitly declare a valid/);
  assert.throws(() => normalizeExplicitRefreshTargets([
    { guruId: "nelson-peltz", years: 5, expectedStatus: "degraded" },
    { guruId: "nelson-peltz", years: 10, expectedStatus: "degraded" }
  ], [5, 10]), /must explicitly declare a valid/);
});

test("active-price planning stops cash acquisitions before their effective date", () => {
  const beforeClose = manager13fPriceRequirements({
    reportDate: "2022-06-30",
    holdings: [holding({ ticker: "CHNG", cusip: "15912K100" })]
  }, "2022-08-16", { guruId: "david-einhorn" });
  assert.deepEqual(beforeClose, [{ ticker: "CHNG", endExclusive: "2022-10-03" }]);

  const afterClose = manager13fPriceRequirements({
    reportDate: "2022-09-30",
    holdings: [holding({ ticker: "CHNG", cusip: "15912K100" })]
  }, "2022-11-15", { guruId: "david-einhorn" });
  assert.deepEqual(afterClose, []);
});

test("active-price planning retains both sides of an audited stock conversion", () => {
  const beforeConversion = manager13fPriceRequirements({
    reportDate: "2024-09-30",
    holdings: [holding({ ticker: "ARCH", cusip: "03940R107" })]
  }, "2024-11-15", { guruId: "mohnish-pabrai" });
  assert.deepEqual(beforeConversion, [
    { ticker: "ARCH", endExclusive: "2025-01-14" },
    { ticker: "CNR", startInclusive: "2025-01-15" }
  ]);

  const afterConversion = manager13fPriceRequirements({
    reportDate: "2024-12-31",
    holdings: [holding({ ticker: "ARCH", cusip: "03940R107" })]
  }, "2025-02-18", { guruId: "mohnish-pabrai" });
  assert.deepEqual(afterConversion, [{ ticker: "CNR" }]);
});

test("active-price planning stops Peltz JHG at its public trading boundary", () => {
  const beforeRollover = manager13fPriceRequirements({
    reportDate: "2026-03-31",
    holdings: [holding({ ticker: "JHG", cusip: "G4474Y214" })]
  }, "2026-05-18", { guruId: "nelson-peltz" });
  assert.deepEqual(beforeRollover, [{ ticker: "JHG", endExclusive: "2026-07-01" }]);

  const afterRollover = manager13fPriceRequirements({
    reportDate: "2026-06-30",
    holdings: [holding({ ticker: "JHG", cusip: "G4474Y214" })]
  }, "2026-08-17", { guruId: "nelson-peltz" });
  assert.deepEqual(afterRollover, []);
});

test("end-exclusive schedule windows become exact inclusive SPY intervals", () => {
  const spyDates = [
    "2022-09-29", "2022-09-30", "2022-10-03", "2022-10-04", "2022-10-05"
  ];
  assert.deepEqual(inclusivePlanIntervals({ intervals: [
    { start: "2022-09-29", end: "2022-10-03", endExclusive: "2022-10-03" },
    { start: "2022-10-04", end: "2022-10-05" }
  ] }, spyDates), [
    {
      startDate: "2022-09-29",
      endDate: "2022-09-30",
      sourceEndExclusive: "2022-10-03"
    },
    { startDate: "2022-10-04", endDate: "2022-10-05" }
  ]);
});
