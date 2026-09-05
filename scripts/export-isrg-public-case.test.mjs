import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { EXPECTED_MODEL, curateIsrgCase } from './export-isrg-public-case.mjs';

const snapshot = JSON.parse(readFileSync(new URL('../web/research/isrg/snapshot.json', import.meta.url), 'utf8'));
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('public ISRG case has distinct observed, model, and publication dates', () => {
  assert.equal(snapshot.modelVersion, EXPECTED_MODEL);
  assert.equal(snapshot.asOfDate, '2026-07-21');
  assert.equal(snapshot.priceDate, '2026-08-27');
  assert.equal(snapshot.snapshotDate, '2026-08-30');
  assert.equal(snapshot.provenance.publishedOn, '2026-09-05');
  assert.match(snapshot.provenance.datePolicy, /not today/);
  assert.match(snapshot.chart.historicalMethod, /not a record of forecasts published/);
  assert.match(snapshot.assumptions.forwardRevenueSource, /not management/);
});

test('normalized earnings component and exact weighted fair value reproduce', () => {
  const a = snapshot.assumptions;
  const earnings = a.forwardRevenueM * a.effectiveNetMarginPct / 100 / a.sharesM * a.targetPE;
  near(earnings, snapshot.components[0].value);
  near(snapshot.components.reduce((sum, component) => sum + component.weight, 0), 1);
  near(snapshot.components.reduce((sum, component) => sum + component.weight * component.value, 0), snapshot.fairValue);
  near(snapshot.fairValue, 442.8260912091792);
  assert.notEqual(snapshot.standaloneDcf, snapshot.fairValue);
  near(snapshot.fairValue / snapshot.price - 1, snapshot.upsideToPrice);
});

test('FCFE periods, fade, discount timing, terminal value and share denominator reproduce', () => {
  const { costOfEquity: ke, terminalGrowth: g, sharesM } = snapshot.assumptions;
  let lastFcf = snapshot.assumptions.forwardFcfM;
  let pv = 0;
  for (const cash of snapshot.dcf.annualCashFlows) {
    const growth = cash.year === 1 ? 0 : snapshot.dcf.initialGrowth + (g - snapshot.dcf.initialGrowth) * (cash.year - 1) / 4;
    if (cash.year > 1) lastFcf *= 1 + growth;
    near(growth, cash.growth);
    near(lastFcf, cash.fcfM);
    near(lastFcf / (1 + ke) ** cash.year, cash.presentValueM);
    pv += cash.presentValueM;
  }
  near(pv, snapshot.dcf.explicitPresentValueM);
  const terminal = lastFcf * (1 + g) / (ke - g);
  near(terminal, snapshot.dcf.terminalValueM);
  near(terminal / (1 + ke) ** 5, snapshot.dcf.terminalPresentValueM);
  near((pv + snapshot.dcf.terminalPresentValueM) / sharesM, snapshot.standaloneDcf);
  near(snapshot.standaloneDcf, 187.9527745181568);
  assert.equal(snapshot.dcf.additionalNetDebtDeductionM, 0);
});

test('period change reconciles without misattributing the entire change to FCF', () => {
  near(snapshot.previous.fairValue + snapshot.change.earningsContribution + snapshot.change.dcfContribution, snapshot.fairValue);
  near((snapshot.fairValue / snapshot.previous.fairValue - 1) * 100, snapshot.change.fairValuePct);
  near((snapshot.assumptions.forwardFcfM / snapshot.previous.forwardFcfM - 1) * 100, snapshot.change.fcfPct);
  assert.match(snapshot.change.explanation, /not caused by FCF alone/);
});

test('stress counterexample is a disclosed recomputation, not a guaranteed floor', () => {
  const scenario = snapshot.scenario;
  const earnings = snapshot.components[0].value * scenario.earningsFactor * scenario.targetPE / snapshot.assumptions.targetPE;
  const dcf = snapshot.standaloneDcf * scenario.fcfFactor;
  near(earnings, scenario.earningsValue);
  near(dcf, scenario.dcfValue);
  near(earnings * 0.66 + dcf * 0.34, scenario.fairValue);
  near(scenario.fairValue, 283.8249539095634);
  near(scenario.fairValue / snapshot.price - 1, scenario.upsideToPrice);
  assert.match(scenario.kind, /not a forecast/);
});

test('chart has sorted real samples, precise endpoints and disclosed carried opening state', () => {
  assert.equal(snapshot.history.length, 21);
  assert.equal(snapshot.prices.length, 80);
  for (const [key, field] of [['history', 'fairValue'], ['prices', 'price']]) {
    const series = snapshot[key];
    assert.equal(new Set(series.map((point) => point.date)).size, series.length);
    assert.deepEqual(series.map((point) => point.date), series.map((point) => point.date).sort());
    assert.ok(series.every((point) => Number.isFinite(point[field]) && point[field] > 0));
  }
  assert.equal(snapshot.history.at(-1).date, snapshot.asOfDate);
  near(snapshot.history.at(-1).fairValue, snapshot.fairValue);
  assert.equal(snapshot.prices.at(-1).date, snapshot.priceDate);
  near(snapshot.prices.at(-1).price, snapshot.price);
  assert.equal(snapshot.chart.openingCarry.sourceDate, snapshot.history[0].date);
  assert.ok(snapshot.chart.openingCarry.sourceDate < snapshot.chart.startDate);
  assert.match(snapshot.chart.priceSampling, /not necessarily the final trading day/);
});

test('public snapshot does not expose private filesystem, raw statements, users or credentials', () => {
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /\/Users\/|\/private\/|\/var\/folders\/|payload_json|sourceRecord|fiscalFinancials|transcriptQa|service_role|eyJ[a-zA-Z0-9_-]{50}/);
  assert.match(snapshot.provenance.sourcePayloadSha256, /^[a-f0-9]{64}$/);
  for (const source of snapshot.sources) assert.ok(source.url.startsWith('https://') || source.url === './snapshot.json');
});

test('exporter rejects stale/unreviewed data and cannot fall back to a runtime database', () => {
  assert.throws(() => curateIsrgCase({ ticker: 'NVDA' }), /Only the reviewed ISRG/);
  assert.throws(() => curateIsrgCase({ ticker: 'ISRG', dataQuality: {modelVersion: 'v4'} }), /Unreviewed model/);
  assert.throws(() => curateIsrgCase({ ticker: 'ISRG', dataQuality: {modelVersion: EXPECTED_MODEL} }), /matching passing audit ledger/);
  const env = {...process.env};
  delete env.ISRG_CASE_DB;
  const result = spawnSync(process.execPath, [new URL('./export-isrg-public-case.mjs', import.meta.url).pathname], { env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set ISRG_CASE_DB/);
});
