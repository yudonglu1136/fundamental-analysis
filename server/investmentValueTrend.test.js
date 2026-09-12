import test from 'node:test';
import assert from 'node:assert/strict';
import { valueTrend } from './investmentValueTrend.js';
const asOf = '2026-08-28';
const points = (values = Array.from({length: 8}, (_, i) => 100 * 1.04 ** i)) => values.map((fairValue, i) => ({
  fairValue, period: `${2024 + Math.floor((i + 2) / 4)}-Q${(i + 2) % 4 + 1}`,
  date: new Date(Date.UTC(2024, 9 + 3 * i, 20)).toISOString().slice(0, 10),
  currency: 'USD', formula: 'fixture fixed method', modelVersion: 'v1', modelRoute: 'operating_company',
}));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test('smooth multi-quarter path qualifies with exact auditable metrics and no mutation', () => {
  const input = points(), before = structuredClone(input), r = valueTrend(input, asOf);
  assert.equal(r.eligible, true); assert.equal(r.upCount, 7); assert.equal(r.transitions, 7);
  near(r.totalChange, 1.04 ** 7 - 1); near(r.maxDrawdown, 0); near(r.maxAbsStep, .04);
  near(r.stepVolatility, 0); near(r.gainConcentration, 1 / 7); assert.deepEqual(input, before);
});
test('one massive latest revision cannot outrank a sustained path', () => {
  const r = valueTrend(points([100, 101, 102, 103, 104, 105, 106, 190]), asOf);
  assert.equal(r.upCount, 7); assert.equal(r.eligible, false);
  assert.ok(r.reasons.includes('large_jump')); assert.ok(r.reasons.includes('one_step_driven'));
});
test('below jump limit but dominated by one quarter also fails', () => {
  const r = valueTrend(points([100, 100.5, 101, 101.5, 102, 102.5, 103, 120]), asOf);
  assert.equal(r.upCount, 7); assert.ok(!r.reasons.includes('large_jump'));
  assert.ok(r.reasons.includes('one_step_driven')); assert.equal(r.eligible, false);
});
test('large zigzags, flat paths, falling values and tiny rounding gains do not qualify', () => {
  for (const values of [[100, 120, 90, 130, 100, 140, 110, 150], Array(8).fill(100),
    [150, 145, 140, 135, 130, 125, 120, 115], Array.from({length: 8}, (_, i) => 100 + i / 10)]) {
    assert.equal(valueTrend(points(values), asOf).eligible, false);
  }
});
test('maximum drawdown uses running peak, including recovery; bounded dip is allowed', () => {
  const r = valueTrend(points([100, 104, 108, 105, 110, 114, 118, 122]), asOf);
  assert.equal(r.eligible, true); near(r.maxDrawdown, 1 - 105 / 108); assert.equal(r.upCount, 6);
  const large = valueTrend(points([100, 104, 108, 95, 110, 114, 118, 122]), asOf);
  assert.equal(large.eligible, false); assert.ok(large.reasons.includes('large_drawdown'));
});
test('missing, zero, negative, NaN and non-numeric values fail closed without derived metrics', () => {
  for (const value of [null, 0, -1, NaN, '100']) {
    const input = points(); input[3].fairValue = value;
    const r = valueTrend(input, asOf); assert.equal(r.status, 'unavailable'); assert.equal(r.totalChange, null);
  }
});
test('every quarter must match method, currency, model version and economic route', () => {
  for (const key of ['formula', 'currency', 'modelVersion', 'modelRoute']) {
    for (const value of [null, 'different']) {
      const input = points(); input[2][key] = value;
      const r = valueTrend(input, asOf); assert.equal(r.eligible, false); assert.equal(r.upCount, null);
      assert.ok(r.reasons.includes('incomparable_model'));
    }
  }
});
test('gaps, duplicate quarters, out-of-order dates, stale and future points are not silently dropped', () => {
  const short = valueTrend(points().slice(1), asOf); assert.ok(short.reasons.includes('insufficient_quarters'));
  for (const [key, value] of [['period', '2025-Q4'], ['period', null], ['date', '2028-01-01'], ['date', '2023-01-01']]) {
    const input = points(); input[2][key] = value; assert.equal(valueTrend(input, asOf).eligible, false);
  }
  assert.ok(valueTrend(points(), '2027-08-28').reasons.includes('stale_history'));
});
