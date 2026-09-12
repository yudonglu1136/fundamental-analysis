import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('128 user handle limit preserves tenant isolation and reopens durable data after eviction', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-user-handles-'));
  process.env.USER_PORTFOLIO_DATA_DIR = directory;
  process.env.PORTFOLIO_CREDENTIALS_KEY = 'synthetic-test-only-handles';
  const store = await import('./userPortfolioStore.js');
  try {
    for (let i = 0; i < 140; i += 1) {
      store.writeUserPortfolioNavPoint({ id: `synthetic-${i}` }, { date: '2026-09-10', nav: 1000 + i });
      assert.ok(store.userPortfolioDbCacheStats().entries <= 128);
    }
    assert.deepEqual(store.userPortfolioDbCacheStats(), { entries: 128, maxEntries: 128 });
    assert.equal(store.readUserPortfolioNavPoints({ id: 'synthetic-0' })[0].nav, 1000);
    assert.equal(store.readUserPortfolioNavPoints({ id: 'synthetic-139' })[0].nav, 1139);
    assert.equal(store.readUserPortfolioNavPoints({ id: 'not-yet-present' }).length, 0);
    assert.equal(fs.statSync(store.userPortfolioInfo({ id: 'synthetic-0' }).path).mode & 0o777, 0o600);
    store.closeUserPortfolioStores();
    assert.equal(store.userPortfolioDbCacheStats().entries, 0);
    assert.equal(store.readUserPortfolioNavPoints({ id: 'synthetic-0' })[0].nav, 1000);
  } finally {
    store.closeUserPortfolioStores();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
