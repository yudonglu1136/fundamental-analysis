import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { caseDir, chartSvg, escapeHtml, renderCase } from './build-public-research.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(caseDir, 'snapshot.json'), 'utf8'));
const html = renderCase(data);

test('public case is server-readable English and does not need Flutter, APIs or sign-in', () => {
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /[\u3400-\u9fff]/);
  assert.doesNotMatch(html, /<script|flutter_bootstrap|main\.dart\.js|supabase|\/api\//i);
  for (const value of ['$367.07', '$442.83', '+20.6%', '$187.95', '$283.82', '21 Jul 2026', '27 Aug 2026']) assert.ok(html.includes(value), value);
  assert.match(html, /Blended estimate, not pure DCF/);
  assert.match(html, /not a live quote/);
  assert.match(html, /not a record of forecasts published at the time/);
  assert.match(html, /not a probability-weighted forecast/);
});

test('terminal links preserve the ISRG selection and explicit English; no fake save promise', () => {
  const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'));
  const terminal = hrefs.filter((href) => href.startsWith('/?'));
  assert.equal(terminal.length, 2);
  for (const href of terminal) {
    const url = new URL(href, 'https://www.thesisforge.tech');
    assert.equal(url.searchParams.get('view'), 'valuation');
    assert.equal(url.searchParams.get('valuation'), 'ISRG');
    assert.equal(url.searchParams.get('lang'), 'en');
    assert.equal(url.searchParams.get('ref'), 'isrg-public-case');
  }
  assert.doesNotMatch(html, /saved|save to your account/i);
});

test('dated numerical change and illustrative stress value reconcile', () => {
  const a = data.assumptions;
  const earnings = a.forwardRevenueM * a.effectiveNetMarginPct / 100 / a.sharesM * a.targetPE;
  const pv = data.dcf.annualCashFlows.reduce((sum, row) => sum + row.fcfM / (1 + a.costOfEquity) ** row.year, 0);
  const tv = data.dcf.annualCashFlows.at(-1).fcfM * (1 + a.terminalGrowth) / (a.costOfEquity - a.terminalGrowth) / (1 + a.costOfEquity) ** 5;
  const dcf = (pv + tv) / a.sharesM;
  const near = (v, want) => assert.ok(Math.abs(v - want) < 1e-8, `${v} != ${want}`);
  near(0.66 * earnings + 0.34 * dcf, data.fairValue);
  near(data.previous.fairValue + data.change.earningsContribution + data.change.dcfContribution, data.fairValue);
  near(0.66 * earnings * 0.85 * 35 / a.targetPE + 0.34 * dcf * 0.85, data.scenario.fairValue);
  assert.equal(data.scenario.earningsFactor, 0.85);
  assert.equal(data.scenario.fcfFactor, 0.85);
  assert.equal(data.scenario.targetPE, 35);
  assert.ok(data.scenario.fairValue < data.price);
});

test('chart is accessible, zero-based, unsmoothed and responsive with identical observations', () => {
  const svg = chartSvg(data);
  assert.equal((svg.match(/role="img"/g) || []).length, 2);
  assert.equal((svg.match(/<title id="chart-title-/g) || []).length, 2);
  assert.match(svg, /viewBox="0 0 480 275"/);
  assert.match(svg, />\$0<\/text>/);
  assert.match(svg, /value-line" d="M[^"CQS]+H/);
  assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  for (const row of data.history.filter((p) => p.date >= data.prices[0].date)) {
    const value = `$${row.fairValue.toFixed(2)}`;
    assert.ok(svg.includes(value), value);
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'DOM IDs must be unique');
  for (const anchor of [...html.matchAll(/href="#([^"]+)"/g)]) assert.ok(ids.includes(anchor[1]), `Missing anchor ${anchor[1]}`);
});

test('public route resolves before Flutter catch-all and does not weaken API auth', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const routes = config.routes;
  const index = routes.findIndex((r) => r.src === '^/research/isrg/$' && r.dest === '/research/isrg/index.html');
  assert.ok(index >= 0 && index < routes.findIndex((r) => r.handle === 'filesystem'));
  const slash = routes.find((r) => r.src === '^/research/isrg$');
  assert.equal(slash.status, 308);
  assert.equal(slash.headers.Location, '/research/isrg/');
  const policy = routes.find((r) => r.src === '^/research/isrg/.*$');
  assert.match(policy.headers['Cache-Control'], /must-revalidate/);
  assert.equal(routes.find((r) => r.src === '/api/(.*)').dest, '/api/proxy.js?path=/api/$1');
  assert.equal(routes.at(-1).dest, '/index.html');
});

test('social metadata and small public-page payload are present without third-party scripts', () => {
  for (const tag of ['og:title', 'og:image', 'og:url', 'twitter:card', 'twitter:image']) assert.ok(html.includes(tag));
  const social = fs.readFileSync(path.join(caseDir, 'social.jpg'));
  assert.equal(social.subarray(0, 3).toString('hex'), 'ffd8ff', 'X preview must exist with its correct JPEG type');
  assert.match(html, /research\/isrg\/social\.jpg/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.thesisforge\.tech\/research\/isrg\/"/);
  const css = fs.readFileSync(path.join(caseDir, 'case.css'));
  assert.ok(gzipSync(html).length + gzipSync(css).length < 16000, 'HTML + CSS compressed budget is 16 KB');
  assert.match(css.toString(), /focus-visible/);
  assert.match(css.toString(), /prefers-reduced-motion/);
  assert.equal(escapeHtml('<a "x">&\''), '&lt;a &quot;x&quot;&gt;&amp;&#39;');
});

test('generated page is committed and deterministic from the reviewed snapshot', () => {
  assert.equal(fs.readFileSync(path.join(caseDir, 'index.html'), 'utf8'), html);
  assert.equal(renderCase(structuredClone(data)), html);
  assert.match(fs.readFileSync(path.join(root, 'scripts/flutter-build.sh'), 'utf8'), /build-public-research\.mjs --check/);
});
