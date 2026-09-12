// A descriptive screen of stored model values, NOT a return or quality score.
// Policy v1 is a product default, not fitted to investment outcomes.
export const VALUE_TREND_POLICY = Object.freeze({
  version: 'steady-value-v1', quarters: 8, minUpSteps: 6, upTolerance: .0025,
  minTotalChange: .10, maxDrawdown: .10, maxAbsStep: .20,
  maxGainConcentration: .40, maxAgeDays: 180,
});
const finite = n => typeof n === 'number' && Number.isFinite(n);
const quarterIndex = s => {
  const m = /^(\d{4})-Q([1-4])$/.exec(s ?? '');
  return m ? Number(m[1]) * 4 + Number(m[2]) - 1 : null;
};

// Input: latest visible observation for each fiscal quarter, oldest first.
// Do not silently remove broken quarters or select an older passing window.
export function valueTrend(observations, asOf) {
  const policy = VALUE_TREND_POLICY;
  const points = observations.slice(-policy.quarters).map(p => ({...p}));
  const reasons = [];
  const out = {policy, status: 'unavailable', eligible: false, reasons, points,
    upCount: null, transitions: null, totalChange: null, maxDrawdown: null,
    maxAbsStep: null, stepVolatility: null, gainConcentration: null};
  if (points.length !== policy.quarters) reasons.push('insufficient_quarters');
  if (points.some(p => !finite(p.fairValue) || p.fairValue <= 0)) reasons.push('invalid_value');
  const first = points[0];
  if (points.some(p => ['modelVersion', 'formula', 'currency', 'modelRoute'].some(k =>
    !p[k] || p[k] !== first[k]))) reasons.push('incomparable_model');
  const periods = points.map(p => quarterIndex(p.period));
  if (periods.some((n, i) => n == null || (i > 0 && n !== periods[i - 1] + 1))) reasons.push('quarter_gap');
  if (points.some((p, i) => !/^\d{4}-\d{2}-\d{2}$/.test(p.date ?? '') ||
    p.date > asOf || (i > 0 && p.date <= points[i - 1].date))) reasons.push('invalid_timeline');
  const age = (Date.parse(asOf) - Date.parse(points.at(-1)?.date)) / 86400000;
  if (!Number.isFinite(age) || age > policy.maxAgeDays) reasons.push('stale_history');
  if (reasons.length) return out;
  const steps = points.slice(1).map((p, i) => p.fairValue / points[i].fairValue - 1);
  let peak = first.fairValue, maxDrawdown = 0;
  for (const p of points) {
    peak = Math.max(peak, p.fairValue);
    maxDrawdown = Math.max(maxDrawdown, 1 - p.fairValue / peak);
  }
  const gains = steps.map(r => Math.max(0, Math.log1p(r)));
  const totalGains = gains.reduce((a, b) => a + b, 0);
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  Object.assign(out, {status: 'evaluated', upCount: steps.filter(r => r > policy.upTolerance).length,
    transitions: steps.length, totalChange: points.at(-1).fairValue / first.fairValue - 1,
    maxDrawdown, maxAbsStep: Math.max(...steps.map(Math.abs)),
    stepVolatility: Math.sqrt(steps.reduce((s, r) => s + (r - mean) ** 2, 0) / steps.length),
    gainConcentration: totalGains > 0 ? Math.max(...gains) / totalGains : null});
  // Small numerical tolerance only for floating-point boundary comparisons.
  const over = (n, limit) => n - limit > 1e-10;
  if (out.upCount < policy.minUpSteps) reasons.push('too_few_rises');
  if (over(policy.minTotalChange, out.totalChange)) reasons.push('insufficient_growth');
  if (over(out.maxDrawdown, policy.maxDrawdown)) reasons.push('large_drawdown');
  if (over(out.maxAbsStep, policy.maxAbsStep)) reasons.push('large_jump');
  if (out.gainConcentration == null || over(out.gainConcentration, policy.maxGainConcentration)) reasons.push('one_step_driven');
  out.eligible = reasons.length === 0;
  return out;
}
