import assert from "node:assert/strict";
import test from "node:test";

import {
  auditManager13fStrictReadyPayload,
  normalizedManager13fExecutionCoverage
} from "./backtestStrictAudit.js";

function strictFixture(coverage = 0.94) {
  return {
    status: "ready",
    method: { minimumExecutionCoverage: 0.9 },
    dataQuality: {
      minimumExecutionCoverage: 0.9,
      minimumObservedExecutionCoverage: coverage
    },
    summary: { averageCoverage: coverage },
    equity: [
      { date: "2021-01-01", value: 1 },
      { date: "2026-01-01", value: 2 }
    ],
    rebalances: [{ coveragePct: coverage }]
  };
}

test("invalid or lowered strict coverage settings retain the 90% floor", () => {
  assert.equal(normalizedManager13fExecutionCoverage("invalid"), 0.9);
  assert.equal(normalizedManager13fExecutionCoverage(""), 0.9);
  assert.equal(normalizedManager13fExecutionCoverage(0.2), 0.9);
  assert.equal(normalizedManager13fExecutionCoverage(0.95), 0.95);
  assert.equal(normalizedManager13fExecutionCoverage(5), 1);
});

test("strict audit rejects low coverage and inconsistent disclosure", () => {
  assert.equal(auditManager13fStrictReadyPayload(strictFixture()).ok, true);
  assert.equal(
    auditManager13fStrictReadyPayload(strictFixture(0.2)).reason,
    "strict_rebalance_coverage_below_minimum"
  );
  const inflated = strictFixture(0.94);
  inflated.dataQuality.minimumObservedExecutionCoverage = 1;
  assert.equal(
    auditManager13fStrictReadyPayload(inflated).reason,
    "strict_summary_minimum_coverage_mismatch"
  );
});

test("strict audit accepts daily-weighted average distinct from rebalance mean", () => {
  const payload = strictFixture(0.94);
  payload.rebalances.push({ coveragePct: 1 });
  payload.summary.averageCoverage = 0.975;
  assert.equal(auditManager13fStrictReadyPayload(payload).ok, true);

  payload.summary.averageCoverage = 0.5;
  assert.equal(
    auditManager13fStrictReadyPayload(payload).reason,
    "strict_summary_average_coverage_invalid"
  );
});
