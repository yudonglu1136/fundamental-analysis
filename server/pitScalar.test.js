import assert from "node:assert/strict";
import test from "node:test";
import { nullableFiniteNumber } from "./pitScalar.js";

test("nullable PIT scalars preserve missing evidence instead of manufacturing zero", () => {
  assert.equal(nullableFiniteNumber(null), null);
  assert.equal(nullableFiniteNumber(undefined), null);
  assert.equal(nullableFiniteNumber(""), null);
  assert.equal(nullableFiniteNumber("not-a-number"), null);
});

test("nullable PIT scalars retain real zero and finite numeric text", () => {
  assert.equal(nullableFiniteNumber(0), 0);
  assert.equal(nullableFiniteNumber("0"), 0);
  assert.equal(nullableFiniteNumber("9800"), 9800);
});
