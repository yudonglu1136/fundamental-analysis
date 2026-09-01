import assert from "node:assert/strict";
import test from "node:test";

await import(`../web/ontology/snapshot-state.js?test=${Date.now()}`);
const { classify, staleAfterMs } = globalThis.OntologySnapshotState;
const now = Date.parse("2026-09-01T12:00:00.000Z");

function health(generatedAt, overrides = {}) {
  return {
    ok: true,
    exists: true,
    sizeBytes: 1024,
    manifest: { generated_at: generatedAt },
    ...overrides,
  };
}

test("classifies a recent immutable snapshot as cached", () => {
  const result = classify(health("2026-08-29T12:00:00.000Z"), { now });
  assert.equal(result.state, "cached");
  assert.equal(result.ageDays, 3);
});

test("classifies a snapshot older than the seven-day policy as stale", () => {
  const result = classify(health("2026-08-20T12:00:00.000Z"), { now });
  assert.equal(staleAfterMs, 7 * 24 * 60 * 60 * 1000);
  assert.equal(result.state, "stale");
  assert.equal(result.ageDays, 12);
});

test("supports live sources and fails closed on invalid health", () => {
  assert.equal(classify(health(null, { mode: "live" }), { now }).state, "live");
  assert.equal(classify({ ok: false, exists: true, sizeBytes: 1024, error: "bad manifest" }, { now }).state, "error");
  assert.equal(classify(health("not-a-date"), { now }).state, "error");
  assert.equal(classify(null, { now }).state, "error");
});
