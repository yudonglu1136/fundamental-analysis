import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClosingObservation} from './strategyClosingObservation.js';
test('contradictory open is missing, never invented or allowed to change the close', () => {
  const raw = {open: 105, high: 104, low: 99, close: 102, adjustedClose: 100};
  assert.deepEqual(validateClosingObservation(raw), {...raw, open: null, openQuarantined: true});
  assert.equal(raw.open, 105);
});
test('an inconsistent close is rejected, not clipped into the high/low range', () => {
  assert.throws(() => validateClosingObservation({open: 100, high: 104, low: 99, close: 105}), /invalid_daily_close/);
  assert.throws(() => validateClosingObservation({high: 104, low: 99, close: 0}), /invalid_daily_close/);
  assert.equal(validateClosingObservation({open: 100, high: 104, low: 99, close: 102}).open, 100);
});
