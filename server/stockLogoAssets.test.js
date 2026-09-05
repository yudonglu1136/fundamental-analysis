import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createStockLogoLoader, validLogoPng, stockLogoDirectory } from './stockLogoAssets.js';
import { canonicalTicker, logoUrlForTicker } from './logoClient.js';

test('branding identity preserves share classes and venue; parses option underlying', () => {
  assert.equal(canonicalTicker('BRK.A'), 'BRK.A');
  assert.equal(canonicalTicker('LSEG.L'), 'LSEG.L');
  assert.equal(canonicalTicker('AMZN260918C00250000'), 'AMZN');
  assert.match(logoUrlForTicker('NVDA'), /\/api\/logo\/NVDA\?v=/);
});
test('every available catalog entry is a valid, hash-matched PNG; rejected placeholders absent', async () => {
  const manifest = JSON.parse(await fs.readFile(`${stockLogoDirectory}/manifest.json`, 'utf8'));
  let available = 0, missing = 0;
  for (const [ticker, asset] of Object.entries(manifest.assets)) {
    if (asset.status !== 'available') { missing++; continue; }
    assert.match(ticker, /^[A-Z][A-Z0-9.-]{0,14}$/);
    const bytes = await fs.readFile(`${stockLogoDirectory}/${ticker}.png`);
    assert.equal(validLogoPng(bytes), true, ticker);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, ticker);
    available++;
  }
  assert.equal(available, manifest.available);
  assert.equal(missing, manifest.missing);
  assert.equal(available + missing, manifest.expected);
});
test('bundled logos avoid remote fetch and coalesce concurrent misses', async () => {
  let calls = 0;
  const load = createStockLogoLoader({ fetchImpl: async () => { calls++; return new Response('', { status: 404 }); } });
  const amzn = await load('AMZN');
  assert.equal(amzn.source, 'bundled_issuer_catalog');
  assert.equal(calls, 0);
  await Promise.all(Array.from({ length: 8 }, () => load('NONEXISTENT')));
  assert.equal(calls, 1);
  assert.equal(await load('NONEXISTENT'), null);
  assert.equal(calls, 1);
  assert.equal(await load('../secret'), null);
  assert.equal(calls, 1);
});
test('missing catalog images never return generated SVG as real logos', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-logo-test-'));
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({assets:{MISSING:{status:'missing'}}}));
  const load = createStockLogoLoader({ directory, fetchImpl: async () => { throw Error('must not fetch'); } });
  assert.equal(await load('MISSING'), null);
  assert.equal(validLogoPng(Buffer.from('<svg>fake</svg>')), false);
  await fs.rm(directory, {recursive:true});
});
test('unknown remote images are bounded, PNG-only and negatively cached', async () => {
  let calls = 0;
  const load = createStockLogoLoader({ fetchImpl: async () => { calls++; return new Response('<svg>fake</svg>', { headers: { 'content-type': 'image/svg+xml' } }); } });
  assert.equal(await load('NOLOGO'), null);
  assert.equal(await load('NOLOGO'), null);
  assert.equal(calls, 1);
});
