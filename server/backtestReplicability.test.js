import assert from "node:assert/strict";
import test from "node:test";

import {
  knownNonPublicExecutionLimitation,
  knownPrivateRolloverTransition,
  manager13fHoldingPublicTradingAnnotation,
  manager13fReplicabilityPolicies,
  summarizeManager13fReplicability
} from "./backtestReplicability.js";

test("classifies only Trian's 2026 Q2 JHG row as private before execution", () => {
  const limitation = knownNonPublicExecutionLimitation({
    guruId: "nelson-peltz",
    reportDate: "2026-06-30",
    executionDate: "2026-08-17",
    holding: {
      ticker: "JHG",
      issuer: "Janus Henderson Group plc",
      cusip: "G4474Y214"
    }
  });
  assert.deepEqual(limitation, {
    code: "reported_security_private_before_execution",
    publicTradingStatus: "private_before_execution",
    reportDate: "2026-06-30",
    quarterLabel: "2026 Q2",
    executionDate: "2026-08-17",
    ticker: "JHG",
    issuer: "Janus Henderson Group plc",
    cusip: "G4474Y214",
    syntheticPriceUsed: false,
    reasonEn:
      "The reported security was no longer publicly tradable when the 13F filing became actionable; no public execution price exists.",
    reasonZh:
      "该申报证券在 13F 可执行时已不再公开交易，因此不存在公开市场执行价。"
  });
  assert.equal(knownNonPublicExecutionLimitation({
    guruId: "nelson-peltz",
    reportDate: "2026-03-31",
    holding: { cusip: "G4474Y214" }
  }), null);
  assert.equal(knownNonPublicExecutionLimitation({
    guruId: "george-soros",
    reportDate: "2026-06-30",
    holding: { cusip: "G4474Y214" }
  }), null);
});

test("replicability summary preserves the strict 90% gate and forbids a synthetic price", () => {
  const limitation = knownNonPublicExecutionLimitation({
    guruId: "nelson-peltz",
    reportDate: "2026-06-30",
    executionDate: "2026-08-17",
    holding: { ticker: "JHG", cusip: "G4474Y214" }
  });
  const summary = summarizeManager13fReplicability({
    guruId: "nelson-peltz",
    minimumExecutionCoverage: 0.9,
    rebalances: [{
      reportDate: "2026-06-30",
      executionDate: "2026-08-17",
      coveragePct: 0.556337,
      unpricedPositions: [{
        ticker: "JHG",
        issuer: "Janus Henderson Group plc",
        cusip: "G4474Y214",
        weight: 0.443663,
        reason: limitation.code,
        executionLimitation: limitation
      }]
    }]
  });
  assert.equal(summary.status, "strict_unavailable");
  assert.equal(summary.minimumExecutionCoverage, 0.9);
  assert.equal(summary.syntheticPriceUsed, false);
  assert.equal(summary.proxyOnlyWhenSeparatelyLabelled, true);
  assert.equal(summary.affectedQuarters[0].strictGateSatisfied, false);
  assert.equal(summary.affectedQuarters[0].holdings[0].ticker, "JHG");
  assert.equal(summary.affectedQuarters[0].holdings[0].reportedBookWeight, 0.443663);
  assert.equal(summary.affectedQuarters[0].holdings[0].syntheticPriceUsed, false);
  assert.match(summary.reasonEn, /cannot satisfy the 90% strict replication gate/);
  assert.match(summary.reasonZh, /无法满足 90% 严格复制门槛/);
});

test("replicability catalog contains no substitute or fabricated price fields", () => {
  const policies = manager13fReplicabilityPolicies();
  assert.deepEqual(policies.map((row) => row.guruId), ["nelson-peltz"]);
  assert.deepEqual(policies[0].cusips, ["G4474Y214"]);
  assert.equal(Object.hasOwn(policies[0], "price"), false);
  assert.equal(Object.hasOwn(policies[0], "successorTicker"), false);
});

test("JHG exposes a non-cash transition boundary without a successor price", () => {
  const transition = knownPrivateRolloverTransition({
    guruId: "nelson-peltz",
    holding: { ticker: "JHG", cusip: "G4474Y214" }
  });
  assert.equal(transition.effectiveDate, "2026-06-30");
  assert.equal(transition.publicTradingEndExclusive, "2026-07-01");
  assert.equal(transition.considerationType, "private_equity_rollover");
  assert.equal(transition.publicReplicable, false);
  assert.equal(transition.syntheticPriceUsed, false);
  assert.equal(Object.hasOwn(transition, "price"), false);
  assert.equal(Object.hasOwn(transition, "successorTicker"), false);
});

test("latest Trian JHG exposes an exact bilingual dashboard annotation", () => {
  const annotation = manager13fHoldingPublicTradingAnnotation({
    guruId: "nelson-peltz",
    reportDate: "2026-06-30",
    holding: {
      ticker: "JHG",
      issuer: "Janus Henderson Group plc",
      cusip: "G4474Y214"
    }
  });

  assert.equal(annotation.publicTradingStatus, "private_after_reported_quarter");
  assert.equal(annotation.publicTradingEndExclusive, "2026-07-01");
  assert.equal(annotation.publicReplicable, false);
  assert.equal(annotation.syntheticPriceUsed, false);
  assert.match(annotation.reasonEn, /private interest/);
  assert.match(annotation.reasonZh, /非公开权益/);
  assert.equal(Object.hasOwn(annotation, "price"), false);
  assert.equal(Object.hasOwn(annotation, "successorTicker"), false);
  assert.equal(manager13fHoldingPublicTradingAnnotation({
    guruId: "george-soros",
    reportDate: "2026-06-30",
    holding: { ticker: "JHG", cusip: "G4474Y214" }
  }), null);
});
